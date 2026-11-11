import { BeatClock } from './beat-clock.mjs';

const BEATS = 8;
const GUARD = {
  x: 0, z: 0, hip: 1.04, lean: 0.06, sway: 0,
  nearHand: [0.46, 1.81, 0.29], farHand: [0.27, 1.94, -0.27],
  nearFoot: [0.34, 0.13, 0.30], farFoot: [-0.35, 0.13, -0.29],
};
const pose = changes => ({ ...GUARD, ...changes });
const mix = (a, b, t) => a + (b - a) * t;
export const smooth = t => {
  const p = Math.max(0, Math.min(1, t));
  return p * p * (3 - 2 * p);
};

// Positions are local to each fighter: x faces the other fighter, and +z faces the camera.
// Integer keys are downbeat poses. Fractional keys shape anticipation and follow-through.
const LEAD = [
  [0, pose({ x: 0.15, hip: 1.01, nearFoot: [0.42, 0.13, 0.29] })],
  [0.32, pose({ x: 0.19, hip: 1.04, farFoot: [-0.25, 0.23, -0.29] })],
  [0.67, pose({ x: 0.22, hip: 0.99, lean: -0.12, nearHand: [0.10, 1.81, 0.37] })],
  [1, pose({ x: 0.31, lean: 0.31, nearHand: [0.98, 1.83, 0.26] })],
  [1.18, pose({ x: 0.27, lean: 0.18, nearHand: [0.78, 1.85, 0.33] })],
  [1.72, pose({ x: 0.15, hip: 0.99 })],
  [2.57, pose({ x: 0.23, hip: 1.10, lean: -0.18, sway: 0.15, nearHand: [-0.10, 1.86, 0.67] })],
  [3, pose({ x: 0.47, lean: 0.46, sway: 0.08, nearHand: [1.20, 2.01, 0.48] })],
  [3.24, pose({ x: 0.40, hip: 0.97, lean: 0.38, nearHand: [1.01, 1.86, -0.20] })],
  [4, pose({ x: 0.30, hip: 0.98, nearHand: [0.37, 1.69, 0.37] })],
  [4.66, pose({ x: 0.60, hip: 1.05, lean: -0.12, nearHand: [0.33, 1.99, 0.39] })],
  [5, pose({ x: 0.60, hip: 1.03, lean: -0.12, nearHand: [0.24, 1.90, 0.44] })],
  [5.21, pose({ x: 0.36, hip: 0.88, lean: -0.45, sway: 0.16,
    nearHand: [0.31, 1.61, 0.57], farHand: [0.21, 1.63, -0.40] })],
  [6, pose({ x: 0.42, hip: 0.99, lean: -0.14, nearFoot: [0.30, 0.76, 0.37] })],
  [6.60, pose({ x: 0.52, hip: 1.09, lean: -0.24, nearHand: [0.30, 1.86, 0.45],
    nearFoot: [0.46, 0.81, 0.42] })],
  [7, pose({ x: 0.67, hip: 1.10, lean: -0.32, nearHand: [0.29, 1.86, 0.43],
    nearFoot: [1.00, 1.33, 0.22], farFoot: [-0.16, 0.13, -0.22] })],
  [7.28, pose({ x: 0.54, hip: 1.03, lean: -0.23, nearFoot: [0.57, 0.80, 0.32] })],
  [7.74, GUARD],
  [8, pose({ x: 0.15, hip: 1.01, nearFoot: [0.42, 0.13, 0.29] })],
];
const REPLY = [
  [0, pose({ x: 0.15, hip: 1.01, nearFoot: [0.42, 0.13, 0.29] })],
  [0.32, pose({ x: 0.21, hip: 1.02, farFoot: [-0.30, 0.21, -0.29] })],
  [0.72, pose({ x: 0.31, hip: 0.99, nearHand: [0.55, 1.95, 0.27] })],
  [1, pose({ x: 0.32, lean: 0.10, nearHand: [0.76, 1.83, 0.26], farHand: [0.38, 1.97, -0.12] })],
  [1.18, pose({ x: 0.28, lean: -0.08, nearHand: [0.60, 1.88, 0.27] })],
  [1.72, pose({ x: 0.19 })],
  [2.64, pose({ x: 0.19, hip: 1.03, nearHand: [0.45, 1.81, 0.27] })],
  [3, pose({ x: 0.41, z: -0.46, hip: 0.65, lean: -0.22, sway: -0.20,
    nearHand: [0.41, 1.43, 0.27], farHand: [0.27, 1.53, -0.29], farFoot: [-0.38, 0.13, -0.41] })],
  [3.25, pose({ x: 0.26, z: -0.36, hip: 0.70, lean: -0.12,
    nearHand: [0.40, 1.45, 0.31], farHand: [0.26, 1.55, -0.26] })],
  [4, pose({ x: 0.25, hip: 1.01 })],
  [4.63, pose({ x: 0.39, hip: 0.97, lean: -0.10, nearHand: [0.08, 1.57, 0.40] })],
  [5, pose({ x: 0.55, hip: 1.01, lean: 0.42, nearHand: [1.15, 1.53, 0.20] })],
  [5.22, pose({ x: 0.47, hip: 1.02, lean: 0.25, nearHand: [0.83, 1.56, 0.29] })],
  [6, pose({ x: 0.47, hip: 1.03, nearHand: [0.39, 1.92, 0.32] })],
  [6.65, pose({ x: 0.60, hip: 0.98, lean: 0.06, nearHand: [0.32, 1.88, 0.36] })],
  [7, pose({ x: 0.62, hip: 1.00, lean: -0.05, nearHand: [0.33, 1.82, 0.44] })],
  [7.23, pose({ x: 0.19, hip: 0.91, lean: -0.53, sway: -0.09,
    nearHand: [0.17, 1.67, 0.65], farHand: [0.04, 1.68, -0.55], nearFoot: [0.32, 0.21, 0.32] })],
  [7.74, GUARD],
  [8, pose({ x: 0.15, hip: 1.01, nearFoot: [0.42, 0.13, 0.29] })],
];

function blend(a, b, t) {
  return {
    x: mix(a.x, b.x, t), z: mix(a.z, b.z, t), hip: mix(a.hip, b.hip, t),
    lean: mix(a.lean, b.lean, t), sway: mix(a.sway, b.sway, t),
    nearHand: a.nearHand.map((v, i) => mix(v, b.nearHand[i], t)),
    farHand: a.farHand.map((v, i) => mix(v, b.farHand[i], t)),
    nearFoot: a.nearFoot.map((v, i) => mix(v, b.nearFoot[i], t)),
    farFoot: a.farFoot.map((v, i) => mix(v, b.farFoot[i], t)),
  };
}

function sample(keys, time) {
  const index = keys.findIndex(([at]) => at > time);
  if (index < 0) return keys.at(-1)[1];
  const [start, from] = keys[index - 1];
  const [end, to] = keys[index];
  return blend(from, to, smooth((time - start) / (end - start)));
}

function idle(time, side) {
  const step = time * 3.2 + side * Math.PI;
  const shift = Math.sin(step), lift = Math.cos(step);
  return pose({ x: 0.026 * shift, hip: 1.02 + 0.026 * Math.cos(2 * step), sway: 0.036 * shift,
    nearHand: [0.46, 1.81 + 0.04 * shift, 0.29], farHand: [0.27, 1.94 - 0.036 * shift, -0.27],
    nearFoot: [0.34, 0.13 + 0.027 * Math.max(0, lift), 0.30],
    farFoot: [-0.35, 0.13 + 0.027 * Math.max(0, -lift), -0.29] });
}

const ACCENTS = { 1: 'block', 3: 'dodge', 5: 'counter', 7: 'kick' };

export class BrawlMotion {
  clock = new BeatClock();
  time = 0;
  beat = -1;
  lead = 0;
  phase = 0;
  accent = null;
  poses = [GUARD, GUARD];
  transitionFrom = this.poses;
  transitionAge = 0.18;
  beatOrigin = 0;

  advance(dt, frame) {
    this.time += dt;
    const sourceChanged = frame?.generation !== this.clock.generation || frame?.source !== this.clock.source;
    const beat = this.clock.advance(dt, frame);
    const wasFighting = this.beat >= 0;
    if (sourceChanged || !this.clock.started) {
      this.beat = -1;
      this.lead = 0;
      this.phase = 0;
      this.accent = null;
    }
    if (beat) {
      this.beat = (this.beat + 1) % BEATS;
      if (this.beat === 0 && wasFighting && !sourceChanged) this.lead = 1 - this.lead;
      this.beatOrigin = this.clock.elapsed;
      this.phase = 0;
      const kind = ACCENTS[this.beat];
      this.accent = kind ? { kind, actor: kind === 'counter' ? 1 - this.lead : this.lead, age: 0 } : null;
    } else if (this.beat >= 0) {
      const period = 60 / this.clock.bpm;
      const phase = (this.clock.elapsed - this.beatOrigin) / Math.max(0.001, period - this.beatOrigin);
      this.phase = Math.max(this.phase, Math.min(0.999, phase));
      if (this.accent) this.accent.age += dt;
    }
    const fighting = this.beat >= 0;
    if (fighting !== wasFighting || sourceChanged) {
      this.transitionFrom = this.poses;
      this.transitionAge = 0;
    }
    const position = this.beat + this.phase;
    const next = fighting
      ? [sample(this.lead === 0 ? LEAD : REPLY, position), sample(this.lead === 1 ? LEAD : REPLY, position)]
      : [idle(this.time, 0), idle(this.time, 1)];
    this.transitionAge = Math.min(0.18, this.transitionAge + dt);
    const transition = smooth(this.transitionAge / 0.18);
    this.poses = transition === 1 ? next : next.map((p, i) => blend(this.transitionFrom[i], p, transition));
  }
}
