const KICK_BANDS = 8;
const KICK_FLOOR = 0.30;
const TEMPO_JUMP = 0.015;

export class BeatClock {
  elapsed = 0;
  started = false;
  beats = 0;
  generation;
  source;
  kickCount;
  bpm;

  reset() {
    this.elapsed = 0;
    this.started = false;
    this.beats = 0;
  }

  advance(dt, frame) {
    const status = frame?.status;
    const rhythm = status === 'live' || status === 'demo' || status === 'quiet' ? frame.spectrum : null;
    const sameSource = frame?.generation === this.generation && frame?.source === this.source;
    const kickCount = rhythm?.hits[0];
    // A treble transient can increment the bass onset counter through FFT leakage.
    const kick = sameSource && rhythm && kickCount > this.kickCount &&
      rhythm.bands.slice(0, KICK_BANDS).some(strength => strength >= KICK_FLOOR);
    this.generation = frame?.generation;
    this.source = frame?.source;
    this.kickCount = kickCount;
    const bpm = rhythm?.bpm;
    // A confirmed change replaces the old grid. Small tempo updates keep its phase.
    const tempoJump = this.bpm && bpm && Math.abs(bpm - this.bpm) > this.bpm * TEMPO_JUMP;
    this.bpm = bpm;
    if (!sameSource || !bpm || tempoJump) this.reset();
    if (!bpm) return false;
    const period = 60 / bpm;
    if (kick && !this.started) {
      this.elapsed = 0;
      this.started = true;
      this.beats = 1;
      return true;
    }
    this.elapsed += dt;
    // A nearby kick can correct drift. Extra hits between beats leave the clock alone.
    if (kick) {
      const error = this.elapsed - (this.elapsed < period / 2 ? 0 : period);
      if (Math.abs(error) <= period * 0.18) this.elapsed -= error * 0.35;
    }
    if (this.elapsed < period) return false;
    this.elapsed %= period;
    this.started = true;
    this.beats++;
    return true;
  }
}
