import { beatStackStep } from './jersey-club.mjs';
import { aimLimb, bodyAt, floorOf, limbPoints } from './stick-figure-rig.mjs';

const BODY = '#f8eddc';
const FAR_LIMB = '#ae9bb6';
const LEGS = [-1, 1].map(side => ({ side, leg: true }));
const ARMS = [-1, 1].map(side => ({ side, leg: false }));
const PLANTED_FEET = [[-0.27, -0.05, 0], [0.27, -0.05, 0]];
const mix = (from, to, amount) => from + (to - from) * amount;
const smooth = amount => amount * amount * (3 - 2 * amount);

function pose(hip, lean, feet, hands) {
  return { hip, lean, feet, hands };
}

const rest = pose([0, -1.08], 0, [[-0.43, -0.05, -0.12], [0.43, -0.05, -0.12]], [[-0.56, -0.29], [0.56, -0.29]]);

function limb(ctx, points, color, width) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function circle(ctx, x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function drawPlayer(ctx, x, y, width, { beat, phase, bounce, shift, dropping, turnSide, actionPhase }) {
  const step = beat ? beatStackStep(beat - 1 + phase) : rest;
  // Hit the cue near the start of the move and hold it through the piece animation.
  const attack = smooth(Math.min(1, actionPhase / 0.10));
  const release = smooth(Math.max(0, 1 - Math.max(0, actionPhase - 0.34) / 0.28));
  const accent = attack * release;
  const beatPosition = beat ? beat - 1 + phase : 0;
  const hip = [
    (beat ? Math.cos(Math.PI * beatPosition) * 0.22 : 0) + shift * accent * 0.14,
    -1.08 + bounce * 0.035 + (dropping ? accent * 0.13 : 0),
  ];
  const lean = step.lean + shift * accent * 0.25;
  const body = bodyAt(hip, lean);
  const legs = LEGS.map((leg, index) => {
    const [ankleX, ankleY, pitch] = PLANTED_FEET[index];
    const ground = -0.05 - Math.max(0, 0.22 * Math.sin(pitch));
    const joint = aimLimb(body, leg, [ankleX, Math.min(ankleY, ground)], pitch);
    return limbPoints(body, leg, joint);
  });

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(width / 320, width / 320);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const halo = ctx.createLinearGradient(52, 32, 257, 225);
  halo.addColorStop(0, '#453657');
  halo.addColorStop(1, '#29213d');
  circle(ctx, 156, 130, 115, halo);
  ctx.strokeStyle = '#806891';
  ctx.lineWidth = 1;
  ctx.stroke();
  limb(ctx, [[35, 244], [285, 244]], '#776387', 1);

  ctx.translate(156, 241);
  ctx.scale(66, 66);
  const floor = floorOf(legs);
  ctx.beginPath();
  ctx.ellipse(hip[0], 0.02, 0.56 + Math.min(0, floor) * 0.52, 0.065, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#18112199';
  ctx.fill();
  ctx.translate(0, Math.min(0, -floor - 0.05));

  for (const [index, { start, middle, tip, toe }] of legs.entries()) {
    limb(ctx, [start, middle, tip, toe], index ? BODY : FAR_LIMB, 0.125);
  }
  limb(ctx, [legs[0].start, legs[1].start], BODY, 0.14);
  limb(ctx, [body(0, 0), body(0, -1.09)], BODY, 0.17);
  limb(ctx, [body(-0.25, -0.94), body(0.25, -0.94)], BODY, 0.13);

  for (const [index, arm] of ARMS.entries()) {
    const { side } = arm;
    const cue = turnSide === side ? 'turn' : dropping ? 'drop' : shift === side ? 'shift' : null;
    const reach = cue ? accent : 0;
    const restArm = limbPoints(body, arm, aimLimb(body, arm, body(...step.hands[index])));
    // Keep the upper arm alongside the torso; the forearm carries each cue.
    const elbow = body(side * 0.40, -0.53);
    const wrist = body(...(cue === 'turn' ? [side * 0.60, -1.27] :
      cue === 'drop' ? [side * 0.52, 0.08] : [side * 1.05, -0.62]));
    const middle = restArm.middle.map((value, i) => mix(value, elbow[i], reach));
    const tip = restArm.tip.map((value, i) => mix(value, wrist[i], reach));
    const { start } = restArm;
    const color = index ? BODY : FAR_LIMB;
    limb(ctx, [start, middle, tip], color, 0.115);
    if (reach > 0) {
      const finger = cue === 'turn' ? [tip[0] + side * 0.07 * reach, tip[1] - 0.18 * reach] :
        cue === 'drop' ? [tip[0], tip[1] + 0.18 * reach] :
        [tip[0] + side * 0.18 * reach, tip[1]];
      limb(ctx, [tip, finger], color, 0.065);
    }
  }
  circle(ctx, ...body(0, -1.35), 0.346, BODY);
  ctx.restore();
}
