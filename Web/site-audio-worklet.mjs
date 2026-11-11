import { Spectrum } from './site-spectrum.mjs';

class VizuilAnalyzer extends AudioWorkletProcessor {
  hop = Math.round(sampleRate / 50);
  filled = 0;
  ticks = 0;
  revision = 0;

  constructor(options) {
    super();
    const { bpm } = options.processorOptions;
    this.analyzer = new Spectrum(sampleRate, bpm);
    this.port.onmessage = ({ data: revision }) => {
      this.analyzer = new Spectrum(sampleRate, bpm);
      this.filled = this.ticks = 0;
      this.revision = revision;
    };
  }

  process([input], [output]) {
    const [left, right = left] = input;
    // The output stays silent. Only the spectrum and beat data reach the page.
    for (let i = 0; i < output[0].length; i++) {
      this.analyzer.push(left?.[i] ?? 0, right?.[i] ?? 0);
      if (++this.filled < this.hop) continue;
      this.filled = 0;
      const result = this.analyzer.measure(this.hop);
      if (++this.ticks % 2 === 0) this.port.postMessage({ ...result, revision: this.revision });
    }
    return true;
  }
}

registerProcessor('vizuil-analyzer', VizuilAnalyzer);
