import { Tempo } from './site-tempo.mjs';

// Match the native analyzer's stereo power, frequency bands and onset thresholds.
const fftSize = 4096;
const bandCount = 32;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const decibels = amplitude => 20 * Math.log10(Math.max(amplitude, 1e-8));
const follow = (value, target, attack, release) => value + (target > value ? attack : release) * (target - value);
const tau = 2 * Math.PI;
const window = Float32Array.from({ length: fftSize }, (_, i) => 0.5 - 0.5 * Math.cos(tau * i / (fftSize - 1)));
const cosine = Float32Array.from({ length: fftSize / 2 }, (_, i) => Math.cos(-tau * i / fftSize));
const sine = Float32Array.from(cosine, (_, i) => Math.sin(-tau * i / fftSize));
const reversed = new Uint16Array(fftSize);
for (let i = 1; i < fftSize; i++) {
  reversed[i] = (reversed[i >> 1] >> 1) | ((i & 1) * (fftSize / 2));
}

function transform(real, imaginary) {
  for (let size = 2; size <= fftSize; size *= 2) {
    const half = size / 2;
    const stride = fftSize / size;
    for (let start = 0; start < fftSize; start += size) {
      for (let i = 0, phase = 0; i < half; i++, phase += stride) {
        const a = start + i, b = a + half;
        const x = real[b] * cosine[phase] - imaginary[b] * sine[phase];
        const y = real[b] * sine[phase] + imaginary[b] * cosine[phase];
        real[b] = real[a] - x;
        imaginary[b] = imaginary[a] - y;
        real[a] += x;
        imaginary[a] += y;
      }
    }
  }
}

export function emptySpectrum() {
  return { level: 0, bands: Array(bandCount).fill(0), energy: [0, 0, 0], hits: [0, 0, 0], bpm: null, confidence: 0 };
}

export class Spectrum {
  left = new Float32Array(fftSize);
  right = new Float32Array(fftSize);
  real = new Float32Array(fftSize);
  imaginary = new Float32Array(fftSize);
  power = new Float32Array(fftSize / 2);
  previousBands = new Float32Array(bandCount);
  previousTempoBands = new Float32Array(bandCount);
  tempoBaseline = [0, 0, 0];
  fluxBaseline = [0, 0, 0];
  smoothEnergy = [0, 0, 0];
  hits = [0, 0, 0];
  nextHit = [0, 0, 0];
  cursor = 0;
  tick = 0;
  quietTicks = 0;
  level = 0;
  squared = 0;

  constructor(sampleRate, bpm = null) {
    this.fixedBpm = bpm;
    this.tempo = bpm === null ? new Tempo() : null;
    this.bins = Array.from({ length: bandCount }, (_, i) => {
      const edge = index => Math.ceil(40 * 400 ** (index / bandCount) * fftSize / sampleRate);
      const start = edge(i);
      return [start, Math.min(this.power.length, Math.max(start + 1, edge(i + 1)))];
    });
  }

  push(left, right) {
    this.left[this.cursor] = left;
    this.right[this.cursor] = right;
    this.cursor = (this.cursor + 1) % fftSize;
    this.squared += left * left + right * right;
  }

  measure(hop) {
    const rms = Math.sqrt(this.squared / (2 * hop));
    this.squared = 0;
    const silent = rms < 0.0006;
    this.quietTicks = silent ? this.quietTicks + 1 : 0;
    this.level = follow(this.level, silent ? 0 : clamp((decibels(rms) + 60) / 52, 0, 1), 0.52, 0.15);

    this.power.fill(0);
    this.accumulatePower(this.left);
    this.accumulatePower(this.right);
    const bands = Array(bandCount);
    const flux = [0, 0, 0], tempoFlux = [0, 0, 0], energy = [0, 0, 0];
    for (let i = 0; i < bands.length; i++) {
      const [start, end] = this.bins[i];
      let peak = 0;
      for (let bin = start; bin < end; bin++) peak = Math.max(peak, this.power[bin]);
      const db = decibels(Math.sqrt(peak));
      const band = clamp((db + 65) / 53, 0, 1);
      const tempoBand = Math.max(0, (db + 72) / 53);
      const group = i < 8 ? 0 : i < 22 ? 1 : 2;
      flux[group] += Math.max(0, band - this.previousBands[i]);
      tempoFlux[group] += Math.max(0, tempoBand - this.previousTempoBands[i]);
      energy[group] = Math.max(energy[group], band);
      this.previousBands[i] = bands[i] = band;
      this.previousTempoBands[i] = tempoBand;
    }

    this.tick++;
    const counts = [8, 14, 10];
    for (let i = 0; i < counts.length; i++) {
      flux[i] /= counts[i];
      if (!silent && this.tick >= this.nextHit[i] && flux[i] > Math.max(0.017, this.fluxBaseline[i] * 2.1)) {
        this.hits[i]++;
        this.nextHit[i] = this.tick + (i === 0 ? 8 : 5);
      }
      this.fluxBaseline[i] += 0.07 * (flux[i] - this.fluxBaseline[i]);
      this.smoothEnergy[i] = follow(this.smoothEnergy[i], energy[i], 0.5, 0.16);
      const onset = silent ? 0 : tempoFlux[i] / counts[i];
      this.tempoBaseline[i] += 0.025 * (onset - this.tempoBaseline[i]);
      tempoFlux[i] = onset / (0.035 + 2 * this.tempoBaseline[i] + onset);
    }
    this.tempo?.add(tempoFlux[0], tempoFlux[1], tempoFlux[2], this.quietTicks);
    return { spectrum: { level: this.level, bands, energy: this.smoothEnergy, hits: this.hits,
      bpm: this.tempo ? this.tempo.bpm : this.fixedBpm, confidence: this.tempo?.confidence ?? 1 },
      quiet: this.quietTicks >= 5 };
  }

  accumulatePower(samples) {
    const { real, imaginary, power } = this;
    imaginary.fill(0);
    for (let i = 0; i < fftSize; i++) real[reversed[i]] = samples[(this.cursor + i) % fftSize] * window[i];
    transform(real, imaginary);
    const scale = 8 / (fftSize * fftSize);
    for (let i = 0; i < power.length; i++) power[i] += scale * (real[i] ** 2 + imaginary[i] ** 2);
  }
}
