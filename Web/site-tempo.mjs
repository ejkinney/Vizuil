// Browser port of Audio/Tempo.cs. One onset sample arrives every 20 ms.
const ticksPerSecond = 50;
const ticksPerMinute = 60 * ticksPerSecond;
const windowSize = 5 * ticksPerSecond;
const minimumHistory = 4 * ticksPerSecond;
const checkInterval = ticksPerSecond / 2;
const binsPerTick = 8;
const minimumBpm = 50;
const maximumBpm = 220;
const firstBin = Math.floor(ticksPerMinute * binsPerTick / maximumBpm);
const lastBin = Math.floor(ticksPerMinute * binsPerTick / minimumBpm);
const maximumLag = 2 * ticksPerMinute / minimumBpm + 2;
const minimumStrength = 0.34;
const bandWeights = [1, 0.94, 0.87, 0.98];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const agrees = (reference, estimate) => Math.abs(reference - estimate) <= reference * 0.025;

function interpolate(values, index) {
  const center = Math.round(index);
  const x = index - center;
  const [left, peak, right] = [values[center - 1], values[center], values[center + 1]];
  return clamp(peak + 0.5 * x * (right - left + x * (left - 2 * peak + right)), -1, 1);
}

function correlate(samples, lag) {
  let dot = 0, a2 = 0, b2 = 0;
  for (let i = lag; i < samples.length; i++) {
    const a = samples[i], b = samples[i - lag];
    dot += a * b;
    a2 += a * a;
    b2 += b * b;
  }
  return a2 * b2 > 1e-12 ? dot / Math.sqrt(a2 * b2) : 0;
}

export class Tempo {
  history = bandWeights.map(() => new Float32Array(2 * windowSize));
  cursor = 0;
  count = 0;
  ticksSinceCheck = 0;
  matchingChecks = 0;
  weakChecks = 0;
  candidate = 0;
  lockedBpm = null;
  confidence = 0;

  get bpm() { return this.lockedBpm === null ? null : Math.round(this.lockedBpm * 10) / 10; }

  add(bass, mid, treble, quietTicks) {
    if (quietTicks >= 2 * ticksPerSecond) {
      this.clearLock();
      this.count = this.ticksSinceCheck = 0;
      return;
    }

    this.store(0, bass);
    this.store(1, mid);
    this.store(2, treble);
    this.store(3, (bass + 0.8 * mid + 0.7 * treble) / 2.5);
    this.cursor = (this.cursor + 1) % windowSize;
    this.count = Math.min(this.count + 1, windowSize);
    if (++this.ticksSinceCheck < checkInterval || this.count < minimumHistory) return;
    this.ticksSinceCheck = 0;

    const { bpm, strength, lockedStrength } = this.estimate();
    const locked = this.lockedBpm;
    if (locked === null) {
      if (strength >= minimumStrength) this.consider(bpm, strength, 3);
      else this.matchingChecks = 0;
      return;
    }

    const ratio = Math.max(locked, bpm) / Math.min(locked, bpm);
    if (strength >= minimumStrength && agrees(locked, bpm)) {
      if (Math.abs(bpm - locked) > 0.25) this.lockedBpm = locked + (bpm - locked) * 0.25;
      this.sustain(strength);
    } else if (strength >= minimumStrength && (agrees(2, ratio) || agrees(3, ratio))) {
      this.sustain(Math.max(lockedStrength, strength * 0.7));
    } else if (strength >= minimumStrength && strength >= lockedStrength + 0.09) {
      this.weakChecks = 0;
      this.confidence *= 0.9;
      this.consider(bpm, strength, 7);
    } else if (lockedStrength >= minimumStrength * 0.8) {
      this.sustain(lockedStrength);
    } else {
      this.matchingChecks = 0;
      this.confidence *= 0.88;
      if (++this.weakChecks >= 30 * ticksPerSecond / checkInterval) this.clearLock();
    }
  }

  estimate() {
    const scores = new Float32Array(lastBin - firstBin + 3);
    const correlation = new Float32Array(maximumLag + 1);
    const centered = new Float32Array(this.count);
    const start = this.cursor + windowSize - this.count;
    for (const [band, history] of this.history.entries()) {
      const samples = history.subarray(start, start + this.count);
      let mean = 0;
      for (const sample of samples) mean += sample;
      mean /= samples.length;
      let energy = 0;
      for (let i = 0; i < samples.length; i++) {
        const value = samples[i] - mean;
        centered[i] = value;
        energy += value * value;
      }
      if (energy < 1e-6) continue;

      const weight = bandWeights[band] * Math.min(1, energy / (this.count * 0.004));
      for (let lag = Math.floor(firstBin / binsPerTick) - 1; lag <= maximumLag; lag++) {
        correlation[lag] = correlate(centered, lag);
      }
      for (let i = 0; i < scores.length; i++) {
        const period = (firstBin + i - 1) / binsPerTick;
        const strength = 0.68 * interpolate(correlation, period) + 0.32 * interpolate(correlation, 2 * period);
        scores[i] = Math.max(scores[i], weight * strength);
      }
    }

    let best = 1, bestRank = 0;
    for (let i = 1; i < scores.length - 1; i++) {
      const rank = scores[i] - 0.09 * i / (scores.length - 1);
      if (rank <= bestRank) continue;
      best = i;
      bestRank = rank;
    }
    const curvature = scores[best - 1] - 2 * scores[best] + scores[best + 1];
    const offset = curvature < 0 ? clamp(0.5 * (scores[best - 1] - scores[best + 1]) / curvature, -0.5, 0.5) : 0;
    const bpm = clamp(ticksPerMinute * binsPerTick / (firstBin + best - 1 + offset), minimumBpm, maximumBpm);
    const lockedStrength = this.lockedBpm === null ? 0 :
      interpolate(scores, ticksPerMinute * binsPerTick / this.lockedBpm - firstBin + 1);
    return { bpm, strength: scores[best], lockedStrength };
  }

  store(band, onset) {
    this.history[band][this.cursor + windowSize] = this.history[band][this.cursor] = onset;
  }

  consider(bpm, strength, required) {
    if (!this.matchingChecks || !agrees(this.candidate, bpm)) {
      this.candidate = bpm;
      this.matchingChecks = 1;
      return;
    }
    this.candidate += (bpm - this.candidate) / ++this.matchingChecks;
    if (this.matchingChecks < required) return;
    this.lockedBpm = this.candidate;
    this.sustain(strength);
  }

  sustain(strength) {
    this.confidence = strength;
    this.weakChecks = this.matchingChecks = 0;
  }

  clearLock() {
    this.lockedBpm = null;
    this.sustain(0);
  }
}
