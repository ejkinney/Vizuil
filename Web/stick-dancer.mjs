import { BeatClock } from './beat-clock.mjs';
import { blendPoses, jerseyClubPose, JERSEY_MOVE_COUNT } from './jersey-club.mjs';
import { aimLimb, bodyAt, floorOf, limbPoints } from './stick-figure-rig.mjs';

const PALETTES = [
  { backdrop: '#29096f', spotlight: '#6418c4', ink: '#dcff38' },
  { backdrop: '#5b0748', spotlight: '#b01b80', ink: '#45ffef' },
  { backdrop: '#003a2f', spotlight: '#006e53', ink: '#ff6ddd' },
  { backdrop: '#081f79', spotlight: '#1951d3', ink: '#ffb52e' },
  { backdrop: '#600924', spotlight: '#ad1744', ink: '#fff455' },
];

// The analyzer's 32 logarithmic bands run from 40 Hz to 16 kHz.
const LIMBS = [
  { side: -1, from: 0, to: 6, leg: true },
  { side: 1, from: 6, to: 12, leg: true },
  { side: -1, from: 12, to: 20, leg: false },
  { side: 1, from: 20, to: 32, leg: false },
];
const TAU = Math.PI * 2;
const BEATS_PER_MOVE = 8;
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function joint(rest) {
  return { rest, angle: rest, target: rest, velocity: 0 };
}

function spring(joint, dt) {
  joint.velocity += ((joint.target - joint.angle) * 175 - joint.velocity * 16) * dt;
  joint.angle += joint.velocity * dt;
  if (Math.abs(joint.target - joint.angle) < 0.0005 && Math.abs(joint.velocity) < 0.006) {
    joint.angle = joint.target;
    joint.velocity = 0;
  }
}

export class StickDance {
  clock = new BeatClock();
  palette = 0;
  phraseBeat = -1;
  move = 0;
  groove = 0;
  choreography;
  previousPose;
  previousBands = [];
  generation;
  source;
  limbs = LIMBS.map(limb => ({
    ...limb, reach: joint(limb.leg ? 0.28 : 0.53), bend: joint(limb.leg ? -0.19 : -0.25), timeLeft: 0,
  }));

  constructor(random = Math.random) {
    this.random = random;
  }

  advance(dt, frame) {
    const sameSource = this.generation === frame?.generation && this.source === frame?.source;
    this.generation = frame?.generation;
    this.source = frame?.source;
    const status = frame?.status;
    const signal = status === 'live' || status === 'demo' ? frame.spectrum : null;
    const rhythm = signal ?? (status === 'quiet' ? frame.spectrum : null);
    const bpm = rhythm?.bpm;
    if (!sameSource || !bpm) {
      this.phraseBeat = -1;
      this.move = 0;
      this.previousPose = null;
    }
    if (this.clock.advance(dt, frame)) {
      if (++this.phraseBeat === BEATS_PER_MOVE) {
        this.phraseBeat = 0;
        this.previousPose = this.choreography;
        this.move = (this.move + 1) % JERSEY_MOVE_COUNT;
      }
      if (this.phraseBeat === BEATS_PER_MOVE - 1) this.palette = (this.palette + 1) % PALETTES.length;
    }
    const dancing = signal && bpm && this.phraseBeat >= 0;
    this.groove = clamp(this.groove + (dancing ? dt : -dt) / 0.22, 0, 1);
    if (dancing) {
      const phase = clamp(this.clock.elapsed * bpm / 60, 0, 1);
      const pose = jerseyClubPose(this.move, this.phraseBeat + phase);
      // Use the first half beat to shift weight into the next move.
      if (this.phraseBeat > 0 || phase >= 0.5) this.previousPose = null;
      this.choreography = this.previousPose ? blendPoses(this.previousPose, pose, phase * 2) : pose;
    }

    const bands = signal?.bands ?? [];
    const previous = sameSource ? this.previousBands : [];
    const threshold = mix(0.43, 0.23, frame?.density ?? 0.65);
    // Substep so the elbows and knees stay stable on slower screens.
    const steps = Math.max(1, Math.ceil(dt * 90));
    const stepTime = dt / steps;
    for (const limb of this.limbs) {
      const { reach, bend, leg } = limb;
      if (!sameSource || !signal || dancing) limb.timeLeft = 0;
      limb.timeLeft = Math.max(0, limb.timeLeft - dt);

      // Before tempo locks, rising bands add a small accent. The timed dance stays repeatable.
      for (let i = limb.from; !dancing && limb.timeLeft === 0 && i < limb.to; i++) {
        const strength = bands[i] ?? 0;
        if (strength < threshold || strength - (previous[i] ?? 0) < 0.11) continue;
        reach.target = leg ? mix(-0.12, 0.85, this.random()) : mix(0.18, 1.05, this.random());
        bend.target = leg ? mix(-0.72, -0.17, this.random()) : mix(-0.70, 0.04, this.random());
        limb.timeLeft = mix(0.18, 0.30, this.random());
      }
      if (limb.timeLeft === 0) {
        reach.target = reach.rest;
        bend.target = bend.rest;
      }
      for (let step = 0; step < steps; step++) {
        spring(reach, stepTime);
        spring(bend, stepTime);
      }
    }
    this.previousBands = bands;
  }
}

function line(ctx, ...points) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.stroke();
}

function circle(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
}

function drawStage(ctx, width, height, x, y, unit, { backdrop, spotlight, ink }) {
  const wash = ctx.createRadialGradient(x, y - unit * 2.1, 0, x, y - unit * 1.75, Math.max(unit * 3.8, width * 0.54));
  wash.addColorStop(0, spotlight);
  wash.addColorStop(1, backdrop);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(unit, unit);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 0.009;
  ctx.globalAlpha = 0.04;
  circle(ctx, 0, -1.68, 1.71);
  ctx.fill();
  ctx.globalAlpha = 0.19;
  ctx.stroke();

  ctx.beginPath();
  for (let tick = 0; tick < 48; tick++) {
    const angle = tick * TAU / 48;
    const inner = tick % 12 === 0 ? 1.74 : 1.78;
    ctx.moveTo(inner * Math.cos(angle), -1.68 + inner * Math.sin(angle));
    ctx.lineTo(1.82 * Math.cos(angle), -1.68 + 1.82 * Math.sin(angle));
  }
  ctx.stroke();

  for (const radius of [1.1, 1.7, 2.3, 3.05]) {
    ctx.globalAlpha = 0.33 / radius;
    ctx.beginPath();
    ctx.ellipse(0, 0.06, radius, radius * 0.14, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function looseRig(dance) {
  const [leftLeg, rightLeg, leftArm, rightArm] = dance.limbs;
  const stride = rightLeg.reach.angle - leftLeg.reach.angle;
  const swing = rightArm.reach.angle - leftArm.reach.angle;
  const lean = clamp(swing * 0.085 - stride * 0.18, -0.55, 0.55);
  const hipX = stride * 0.16;
  const body = bodyAt([hipX, 0], lean);
  const joints = dance.limbs.map(({ side, reach, bend }) => {
    const angle = side * reach.angle - lean;
    const lower = angle + side * bend.angle;
    return { angle, lower, pitch: -side * Math.sin(lower) * 0.18 };
  });
  // Keep the lowest foot near the floor as the other one kicks out.
  const floor = floorOf(dance.limbs.slice(0, 2).map((limb, i) => limbPoints(body, limb, joints[i], lean)));
  const hop = Math.max(0, 0.85 - floor) * 0.27;
  return { hip: [hipX, -floor - hop - 0.038], lean, joints };
}

function jerseyRig(dance) {
  const { hip, lean, feet, hands } = dance.choreography;
  const body = bodyAt(hip, lean);
  const joints = dance.limbs.map(limb => {
    const { side, leg, reach, bend } = limb;
    const index = Number(side > 0);
    // Each band adds expression only to its own limb. Keep the accents small enough to read the step.
    const kick = reach.angle - reach.rest;
    const flick = bend.angle - bend.rest;
    if (leg) {
      const [x, y, toe] = feet[index];
      const pitch = toe + 0.20 * kick;
      const ankleY = Math.min(y + 0.10 * flick, -0.038 - Math.max(0, 0.22 * Math.sin(pitch)));
      return aimLimb(body, limb, [x + side * 0.12 * kick, ankleY], pitch);
    }
    const [x, y] = hands[index];
    return aimLimb(body, limb, body(x + side * 0.17 * kick, y + 0.16 * flick - 0.18 * Math.max(0, kick)));
  });
  return { hip, lean, joints };
}

function blendRigs(a, b, t) {
  const angle = (from, to) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
  return {
    hip: a.hip.map((value, i) => mix(value, b.hip[i], t)), lean: mix(a.lean, b.lean, t),
    joints: a.joints.map((joint, i) => ({
      angle: angle(joint.angle, b.joints[i].angle),
      lower: angle(joint.lower, b.joints[i].lower),
      pitch: mix(joint.pitch, b.joints[i].pitch, t),
    })),
  };
}

function drawDancer(ctx, dance, ink, backdrop) {
  const { groove } = dance;
  const jersey = groove > 0 ? jerseyRig(dance) : null;
  const loose = groove < 1 ? looseRig(dance) : null;
  const rig = jersey && loose ? blendRigs(loose, jersey, groove * groove * (3 - 2 * groove)) : jersey ?? loose;
  const body = bodyAt(rig.hip, rig.lean);
  const limbs = dance.limbs.map((limb, i) => limbPoints(body, limb, rig.joints[i], rig.lean));
  const floor = floorOf(limbs.slice(0, 2));
  const lift = Math.max(0, -floor - 0.038);

  ctx.save();
  ctx.globalAlpha = 0.48;
  ctx.fillStyle = backdrop;
  ctx.beginPath();
  ctx.ellipse(rig.hip[0], 0.034, 0.62 - Math.min(0.28, lift * 0.4), 0.10, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.translate(0, Math.min(0, -floor - 0.038));

  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.lineWidth = 0.072;
  for (const { start, middle, tip, toe, leg } of limbs) {
    if (leg) line(ctx, start, middle, tip, toe);
    else line(ctx, start, middle, tip);
  }
  line(ctx, limbs[0].start, limbs[1].start);
  line(ctx, limbs[2].start, limbs[3].start);
  line(ctx, body(0, 0), body(0, -1.04));

  circle(ctx, ...body(0, -1.35), 0.346);
  ctx.fill();
}

export function createStickDancer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const dance = new StickDance();
  let layout;

  function resize(width, height) {
    if (!width || !height || layout?.width === width && layout.height === height) return;
    const wide = width >= 900 && height >= 420 && width / height >= 1.5;
    const unit = Math.min(width / 4.6, height / 4.75);
    const floor = height / 2 + unit * 1.47;
    const controlFloor = wide ? height * 0.74 : Math.min(floor, Math.max(height * 0.51, height - 190));
    const controlUnit = Math.min(unit, wide ? height / 5.4 : Math.max(controlFloor - 68, height * 0.34) / 3.4);
    const scale = Math.min(window.devicePixelRatio || 1, 1.75, 1920 / Math.max(width, height));
    layout = { width, height, wide, unit, floor, controlUnit, controlFloor, scale };
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
  }

  function render(dt, frame, presentation = 0) {
    if (!layout) return;
    dance.advance(dt, frame);
    const { width, height, wide, unit, floor, controlUnit, controlFloor, scale } = layout;
    const size = mix(controlUnit, unit, presentation);
    const x = width * (wide ? mix(0.43, 0.5, presentation) : 0.5);
    const y = mix(controlFloor, floor, presentation);
    const palette = PALETTES[dance.palette];
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawStage(ctx, width, height, x, y, size, palette);
    ctx.translate(x, y);
    ctx.scale(size, size);
    drawDancer(ctx, dance, palette.ink, palette.backdrop);
  }

  return { resize, render };
}
