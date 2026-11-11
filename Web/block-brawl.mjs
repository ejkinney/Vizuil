import { BrawlMotion, smooth } from './block-brawl-motion.mjs';

const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const TAU = Math.PI * 2;
const NEAR = 0.48;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v, amount) => [v[0] * amount, v[1] * amount, v[2] * amount];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => Math.hypot(...v);
const unit = v => scale(v, 1 / (norm(v) || 1));
const lerp = (a, b, t) => a.map((value, i) => mix(value, b[i], t));

// Each round shifts the field and both solid fighter inks together.
const PALETTES = [
  { backdrop: '#160e2b', fighters: ['#f4ff63', '#ff69bd'] },
  { backdrop: '#4a0b36', fighters: ['#64fff0', '#fff17a'] },
  { backdrop: '#063b32', fighters: ['#ff73cf', '#ffd66b'] },
  { backdrop: '#0d1d53', fighters: ['#f5ff55', '#ff7979'] },
  { backdrop: '#4a1023', fighters: ['#67fff0', '#d8a5ff'] },
];

function camera(width, height, cx, cy, shot, [x, z]) {
  const [yaw, elevation, distance, target] = shot;
  const eye = [x + distance * Math.sin(yaw), elevation, z + distance * Math.cos(yaw)];
  const forward = unit(minus([x, target, z], eye));
  const right = unit(cross(forward, AXES[1]));
  const up = cross(right, forward);
  const focal = Math.min(width * 1.44, height * 1.52);
  return {
    eye, focal,
    view(point) {
      const relative = minus(point, eye);
      return [dot(relative, right), dot(relative, up), dot(relative, forward)];
    },
    screen([x, y, z]) { return [cx + focal * x / z, cy - focal * y / z]; },
  };
}

function upright(y) {
  const x = unit(cross(y, Math.abs(y[2]) > 0.9999 ? AXES[0] : AXES[2]));
  return [x, y, cross(x, y)];
}

// Preserve the rig's limb lengths as the existing fight keyframes move the hands and feet.
function joint(start, wanted, pole, upper, lower) {
  const aim = minus(wanted, start);
  const direction = unit(aim);
  const reach = clamp(norm(aim), Math.abs(upper - lower) + 0.02, upper + lower - 0.008);
  const along = (upper ** 2 - lower ** 2 + reach ** 2) / (2 * reach);
  const bend = unit(minus(pole, scale(direction, dot(pole, direction))));
  const elbow = plus(plus(start, scale(direction, along)), scale(bend, Math.sqrt(upper ** 2 - along ** 2)));
  return [elbow, plus(start, scale(direction, reach))];
}

function fighter(pose, index, center, yaw) {
  const direction = index === 0 ? 1 : -1;
  const root = [center[0] + direction * (pose.x - 1.30), 0, center[1] + pose.z];
  const world = ([x, y, z]) => plus(root, [direction * x, y, z]);
  const hip = world([0, pose.hip, 0]);
  const chest = world([pose.lean * 0.68, pose.hip + 0.53, pose.sway * 0.69]);
  const torso = upright(unit(minus(chest, hip)));
  const torsoPoint = (x, y, z) => plus(chest,
    plus(plus(scale(torso[0], direction * x), scale(torso[1], y)), scale(torso[2], z)));

  const body = [
    torsoPoint(-0.20, 0.24, 0), torsoPoint(0.20, 0.24, 0),
    torsoPoint(0.29, 0.12, 0), torsoPoint(0.19, -0.18, 0),
    torsoPoint(0.17, -0.41, 0), torsoPoint(-0.17, -0.41, 0),
    torsoPoint(-0.19, -0.18, 0), torsoPoint(-0.29, 0.12, 0),
  ];
  const neck = [torsoPoint(0, 0.19, 0), torsoPoint(0, 0.48, 0)];
  const head = torsoPoint(0, 0.69, 0);
  const arms = [], legs = [];
  let nearHand, farHand, nearFoot;

  for (const side of [-1, 1]) {
    const near = side === 1;
    const shoulder = torsoPoint(0.01, 0.16, side * 0.25);
    const [elbow, hand] = joint(shoulder, world(near ? pose.nearHand : pose.farHand),
      [-direction * 0.23, -1, side * 0.64], 0.48, 0.46);
    arms.push({ points: [shoulder, elbow, hand], near });
    if (near) nearHand = hand;
    else farHand = hand;

    const leg = world([0, pose.hip - 0.02, side * 0.18]);
    const [knee, foot] = joint(leg, world(near ? pose.nearFoot : pose.farFoot),
      [direction, 0.33, side * 0.22], 0.51, 0.50);
    const toe = plus(foot, [direction * 0.22, 0, 0]);
    legs.push({ points: [leg, knee, foot, toe], near });
    if (near) nearFoot = toe;
  }

  const c = Math.cos(yaw), s = Math.sin(yaw);
  const rotate = ([x, y, z]) => [c * x - s * z, y, s * x + c * z];
  const pivot = point => plus(root, rotate(minus(point, root)));
  const rotateLimb = limb => ({ ...limb, points: limb.points.map(pivot) });
  return {
    root: pivot(root), body: body.map(pivot), neck: neck.map(pivot), head: pivot(head),
    arms: arms.map(rotateLimb), legs: legs.map(rotateLimb),
    nearHand: pivot(nearHand), farHand: pivot(farHand), nearFoot: pivot(nearFoot),
  };
}

function projectFace(view, world) {
  const points = world.map(view.view);
  if (points.every(point => point[2] >= NEAR)) return points.map(view.screen);
  const visible = [];
  let from = points.at(-1);
  for (const to of points) {
    const fromInside = from[2] >= NEAR, toInside = to[2] >= NEAR;
    if (fromInside !== toInside) {
      const amount = (NEAR - from[2]) / (to[2] - from[2]);
      visible.push(lerp(from, to, amount));
    }
    if (toInside) visible.push(to);
    from = to;
  }
  return visible.map(view.screen);
}

function polygon(ctx, points, color) {
  if (points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function segment(ctx, view, a, b, width, color) {
  let from = view.view(a), to = view.view(b);
  if (from[2] < NEAR && to[2] < NEAR) return;
  if (from[2] < NEAR) from = lerp(from, to, (NEAR - from[2]) / (to[2] - from[2]));
  if (to[2] < NEAR) to = lerp(to, from, (NEAR - to[2]) / (from[2] - to[2]));
  ctx.beginPath();
  ctx.moveTo(...view.screen(from));
  ctx.lineTo(...view.screen(to));
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, view.focal * width / ((from[2] + to[2]) / 2));
  ctx.strokeStyle = color;
  ctx.stroke();
}

function circle(ctx, view, point, radiusX, radiusY, color) {
  const cameraPoint = view.view(point);
  if (cameraPoint[2] < NEAR) return;
  const [x, y] = view.screen(cameraPoint);
  const horizontal = view.screen(view.view(plus(point, [radiusX, 0, 0])));
  const vertical = view.screen(view.view(plus(point, [0, radiusY, 0])));
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, Math.abs(horizontal[0] - x)),
    Math.max(1, Math.abs(vertical[1] - y)), 0, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawLimb(ctx, view, limb, widths, color) {
  const [shoulder, jointPoint, end, toe] = limb.points;
  segment(ctx, view, shoulder, jointPoint, widths[0], color);
  segment(ctx, view, jointPoint, end, widths[1], color);
  circle(ctx, view, jointPoint, widths[0] * 0.48, widths[0] * 0.48, color);
  if (toe) segment(ctx, view, end, toe, widths[1] * 1.14, color);
  else circle(ctx, view, end, widths[1] * 0.57, widths[1] * 0.57, color);
}

function drawHumanoid(ctx, view, figure, color) {
  // Back limbs sit behind the torso; the near limbs complete the same solid shape in front.
  for (const limb of [...figure.legs, ...figure.arms].filter(part => !part.near)) {
    drawLimb(ctx, view, limb, limb.points.length === 4 ? [0.23, 0.18] : [0.18, 0.15], color);
  }
  polygon(ctx, projectFace(view, figure.body), color);
  segment(ctx, view, figure.neck[0], figure.neck[1], 0.18, color);
  for (const limb of [...figure.legs, ...figure.arms].filter(part => part.near)) {
    drawLimb(ctx, view, limb, limb.points.length === 4 ? [0.23, 0.18] : [0.18, 0.15], color);
  }
  circle(ctx, view, figure.head, 0.19, 0.23, color);
}

const WIDE = [-0.37, 3.25, 9.40, 1.30];
const LOW = [0.56, 1.68, 7.54, 1.26];
const CLOSE = [0.24, 2.60, 6.80, 1.42];
const KICK = [-0.51, 1.82, 7.46, 1.31];
const STEADY = [0.07, 2.59, 8.54, 1.32];

function shotAt(position, time) {
  if (position < 0) {
    const drift = (1 - Math.cos(time * 0.57)) / 2;
    return lerp(WIDE, [0.40, 2.37, 8.65, 1.32], drift);
  }
  if (position < 3) return lerp(WIDE, LOW, smooth((position - 0.50) / 1.99));
  if (position < 5) return lerp(LOW, CLOSE, smooth((position - 3.24) / 1.76));
  if (position < 7.28) return lerp(CLOSE, KICK, smooth((position - 5.25) / 1.75));
  return lerp(KICK, WIDE, smooth((position - 7.28) / 0.72));
}

function hexMix(from, to, amount) {
  const channel = index => Math.round(mix(parseInt(from.slice(index, index + 2), 16),
    parseInt(to.slice(index, index + 2), 16), amount)).toString(16).padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

export function createBlockBrawl(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const motion = new BrawlMotion();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const consolePanel = document.getElementById('console');
  let width, height, panelWidth, panelHeight;
  let shot = reduced.matches ? STEADY : WIDE;
  let focus = [0, 0];
  let paletteIndex = 0, lastRound = 0, generation, source;

  function resize(w, h) {
    if (w < 1 || h < 1 || w === width && h === height) return;
    width = w;
    height = h;
    const ratio = Math.min(devicePixelRatio || 1, 1.6, 1920 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    panelWidth = consolePanel?.offsetWidth ?? 0;
    panelHeight = consolePanel?.offsetHeight ?? 0;
  }

  function render(dt, frame, presentation = 0) {
    if (!width) return;
    motion.advance(dt, frame);
    if (frame?.generation !== generation || frame?.source !== source) {
      generation = frame?.generation;
      source = frame?.source;
      paletteIndex = 0;
      lastRound = motion.round;
    } else if (motion.beat === 0 && motion.round !== lastRound) {
      paletteIndex = (paletteIndex + 1) % PALETTES.length;
      lastRound = motion.round;
    }

    const portrait = width / height < 0.85;
    const overlay = 1 - presentation;
    const sidePanel = width >= 900 && height >= 420 && width / height >= 1.5;
    const fightX = width / 2 - (sidePanel && panelWidth ? (panelWidth + 26) * overlay * 0.45 : 0);
    const fightY = height * 0.53 - (sidePanel ? 0 : Math.min(panelHeight * 0.34, height * 0.12)) * overlay;
    const calm = reduced.matches;
    const desired = shotAt(motion.beat + motion.phase, motion.time);
    const easing = 1 - Math.exp(-(calm ? 5 : 13) * dt);
    shot = lerp(shot, calm ? lerp(STEADY, desired, 0.37) : desired, easing);
    focus = lerp(focus, motion.center.map(value => value * (calm ? 0.65 : 0.84)), easing);
    const framing = portrait ? [shot[0], shot[1], shot[2] - 0.30, shot[3]] : shot;
    const view = camera(width, height, fightX, fightY, framing, focus);
    const [left, right] = motion.poses;
    const yaw = Math.atan2(right.z - left.z, 2.6 - left.x - right.x) * 0.32;
    const figures = motion.poses.map((pose, index) => fighter(pose, index, motion.center, yaw));
    const current = PALETTES[paletteIndex];
    const next = PALETTES[(paletteIndex + 1) % PALETTES.length];
    const shift = motion.beat === 7 ? smooth((motion.phase - 0.18) / 0.82) : 0;

    ctx.fillStyle = hexMix(current.backdrop, next.backdrop, shift);
    ctx.fillRect(0, 0, width, height);
    figures.forEach((figure, index) => {
      drawHumanoid(ctx, view, figure, hexMix(current.fighters[index], next.fighters[index], shift));
    });
  }

  return { resize, render };
}
