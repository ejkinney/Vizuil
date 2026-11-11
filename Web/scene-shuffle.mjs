import { BeatClock } from './beat-clock.mjs';

export class SceneShuffle {
  clock = new BeatClock();
  bars = 32;
  anchor = null;
  lastBeat = 0;
  source = null;
  generation = null;

  setBars(bars) {
    if (bars !== 32 && bars !== 64) throw new RangeError('Shuffle interval must be 32 or 64 bars.');
    this.bars = bars;
    this.anchor = null;
  }

  reset() {
    this.clock.reset();
    this.anchor = null;
    this.lastBeat = 0;
    this.source = null;
    this.generation = null;
  }

  advance(dt, frame) {
    if (!frame?.spectrum?.bpm || !['live', 'quiet', 'demo'].includes(frame.status)) {
      this.reset();
      return false;
    }
    if (frame.source !== this.source || frame.generation !== this.generation) {
      this.clock.reset();
      this.anchor = null;
      this.source = frame.source;
      this.generation = frame.generation;
    }
    const beat = this.clock.advance(dt, frame);
    if (!beat) return false;
    const count = this.clock.beats;
    if (this.anchor === null || count < this.lastBeat) this.anchor = count;
    this.lastBeat = count;
    if (count - this.anchor < this.bars * 4) return false;
    this.anchor = count;
    return true;
  }
}
