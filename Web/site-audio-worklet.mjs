import { DemoTrack, Spectrum } from './site-spectrum.mjs';

class VizuilAnalyzer extends AudioWorkletProcessor {
  analyzer = new Spectrum(sampleRate);
  hop = Math.round(sampleRate / 50);
  filled = 0;
  ticks = 0;

  constructor(options) {
    super();
    this.demo = options.processorOptions.demo ? new DemoTrack(sampleRate) : null;
  }

  process([input], [output]) {
    const [left, right = left] = input;
    // The output stays silent. Only the spectrum and beat data reach the page.
    for (let i = 0; i < output[0].length; i++) {
      if (this.demo) this.demo.push(this.analyzer);
      else this.analyzer.push(left?.[i] ?? 0, right?.[i] ?? 0);
      if (++this.filled < this.hop) continue;
      this.filled = 0;
      const result = this.analyzer.measure(this.hop);
      if (++this.ticks % 2 === 0) this.port.postMessage(result);
    }
    return true;
  }
}

registerProcessor('vizuil-analyzer', VizuilAnalyzer);
