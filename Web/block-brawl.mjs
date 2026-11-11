import { BrawlMotion, smooth } from './block-brawl-motion.mjs';

const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const SIGNS = [-1, 1];
const FACE_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const TAU = Math.PI * 2;
const NEAR = 0.48;
const clamp = (x, low = 0, high = 1) => Math.max(low, Math.min(high, x));
const mix = (a, b, t) => a + (b - a) * t;
const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const minus = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => Math.hypot(...v);
const unit = v => scale(v, 1 / (norm(v) || 1));
const lerp = (a, b, t) => a.map((x, i) => mix(x, b[i], t));
const rgba = (rgb, opacity = 1, light = 1) =>
  `rgba(${rgb.map(c => Math.round(Math.min(255, c * light))).join(',')},${opacity})`;

const TEAL = [73, 241, 224], AMBER = [255, 159, 70];
const FIGHTERS = [
  { armor: [57, 131, 151], dark: [34, 60, 81], glove: [75, 170, 172], trim: TEAL,
    metal: [175, 207, 217], width: 0.59, head: [0.48, 0.51, 0.49] },
  { armor: [177, 104, 58], dark: [77, 46, 53], glove: [202, 122, 59], trim: AMBER,
    metal: [227, 170, 118], width: 0.73, head: [0.52, 0.49, 0.55] },
];

function randomizer(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function camera(width, height, cx, cy, shot) {
  const [yaw, elevation, distance, target] = shot;
  const eye = [distance * Math.sin(yaw), elevation, distance * Math.cos(yaw)];
  const forward = unit(minus([0, target, 0], eye));
  const right = unit(cross(forward, AXES[1]));
  const up = cross(right, forward);
  const focal = Math.min(width * 1.44, height * 1.52);
  return {
    eye,
    view(p) {
      const v = minus(p, eye);
      return [dot(v, right), dot(v, up), dot(v, forward)];
    },
    screen([x, y, z]) { return [cx + focal * x / z, cy - focal * y / z]; },
  };
}

function polygon(ctx, points, fill, stroke, width = 1) {
  if (points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function projectFace(view, world) {
  const points = world.map(view.view);
  if (points.every(p => p[2] >= NEAR)) return points.map(view.screen);
  const visible = [];
  let from = points.at(-1);
  for (const to of points) {
    const inFront = to[2] >= NEAR;
    if (inFront !== (from[2] >= NEAR)) visible.push(lerp(from, to, (NEAR - from[2]) / (to[2] - from[2])));
    if (inFront) visible.push(to);
    from = to;
  }
  return visible.map(view.screen);
}

function line(ctx, view, a, b, color, width = 1) {
  let from = view.view(a), to = view.view(b);
  if (from[2] < NEAR && to[2] < NEAR) return;
  if (from[2] < NEAR) from = lerp(from, to, (NEAR - from[2]) / (to[2] - from[2]));
  if (to[2] < NEAR) to = lerp(to, from, (NEAR - to[2]) / (from[2] - to[2]));
  ctx.beginPath();
  ctx.moveTo(...view.screen(from));
  ctx.lineTo(...view.screen(to));
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

const box = (center, size, color, basis = AXES, glow = false) => ({ center, size, color, basis, glow });
const lamp = unit([-0.55, 0.80, 0.28]);
const reflect = ([x, y, z]) => [x, -0.67 * y, z];

function drawBoxes(ctx, view, boxes, reflection = false) {
  const faces = [];
  for (const { center, size, color, basis, glow } of boxes) {
    const arms = basis.map((axis, i) => scale(axis, size[i] / 2));
    for (let axis = 0; axis < 3; axis++) {
      const a = arms[(axis + 1) % 3], b = arms[(axis + 2) % 3];
      for (const sign of SIGNS) {
        const normal = scale(basis[axis], sign);
        const mid = plus(center, scale(arms[axis], sign));
        const visibleMid = reflection ? reflect(mid) : mid;
        const faceNormal = reflection ? [normal[0], -normal[1] / 0.67, normal[2]] : normal;
        if (dot(faceNormal, minus(view.eye, visibleMid)) <= 0) continue;
        const corners = FACE_CORNERS.map(([u, v]) => plus(mid, plus(scale(a, u), scale(b, v))));
        const points = projectFace(view, reflection ? corners.map(reflect) : corners);
        if (points.length < 3) continue;
        const light = glow ? 1.1 : 0.52 + 0.51 * Math.max(0, dot(normal, lamp)) +
          0.13 * Math.max(0, normal[2]) + 0.10 * Math.max(0, normal[0]);
        const opacity = reflection ? Math.max(0.026, 0.17 - center[1] * 0.056) : 1;
        faces.push({ points, depth: view.view(visibleMid)[2], fill: rgba(color, opacity, light) });
      }
    }
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const { points, fill } of faces) polygon(ctx, points, fill, reflection ? null : '#09101a75', 0.72);
}

function upright(y) {
  const x = unit(cross(y, Math.abs(y[2]) > 0.9999 ? AXES[0] : AXES[2]));
  return [x, y, cross(x, y)];
}

function segment(a, b, width, depth, color) {
  return box(lerp(a, b, 0.5), [width, norm(minus(b, a)) + 0.10, depth],
    color, upright(unit(minus(b, a))));
}

// Preserve the lengths of the two block segments while the keyframes move their endpoints.
function joint(start, wanted, pole, upper, lower) {
  const aim = minus(wanted, start);
  const direction = unit(aim);
  const reach = clamp(norm(aim), Math.abs(upper - lower) + 0.02, upper + lower - 0.008);
  const along = (upper ** 2 - lower ** 2 + reach ** 2) / (2 * reach);
  const bend = unit(minus(pole, scale(direction, dot(pole, direction))));
  return [plus(plus(start, scale(direction, along)), scale(bend, Math.sqrt(upper ** 2 - along ** 2))),
    plus(start, scale(direction, reach))];
}

function fighter(pose, index) {
  const direction = index === 0 ? 1 : -1;
  const suit = FIGHTERS[index];
  const root = [direction * (pose.x - 1.30), 0, pose.z];
  const world = ([x, y, z]) => plus(root, [direction * x, y, z]);
  const hip = world([0, pose.hip, 0]);
  const chest = world([pose.lean * 0.68, pose.hip + 0.53, pose.sway * 0.69]);
  const torso = upright(unit(minus(chest, hip)));
  const torsoPoint = (x, y, z) => plus(chest, plus(plus(scale(torso[0], direction * x), scale(torso[1], y)), scale(torso[2], z)));
  const parts = [
    box(hip, [0.43, 0.27, suit.width * 0.85], suit.dark),
    box(torsoPoint(0, -0.30, 0), [0.46, 0.14, suit.width * 0.91], suit.dark, torso),
    box(torsoPoint(0.01, -0.28, 0.01), [0.49, 0.055, suit.width * 0.94], suit.metal, torso),
    box(chest, [0.47, 0.55, suit.width], suit.armor, torso),
    box(torsoPoint(0, 0.23, 0), [0.50, 0.15, suit.width * 1.10], suit.metal, torso),
    box(torsoPoint(0, 0.09, suit.width / 2), [0.26, 0.14, 0.052], suit.dark, torso),
    box(torsoPoint(0.032, 0.09, suit.width / 2 + 0.028), [0.16, 0.052, 0.025], suit.trim, torso, true),
    box(torsoPoint(0.005, 0.33, 0), [0.25, 0.14, 0.29], suit.dark, torso),
  ];
  const head = torsoPoint(0.075, 0.57, 0);
  const headForward = [direction * 0.88, 0, 0.475];
  const headBasis = [headForward, AXES[1], [-direction * 0.475, 0, 0.88]];
  const headPoint = (x, y, z) => plus(head, plus(plus(scale(headBasis[0], x), [0, y, 0]), scale(headBasis[2], z)));
  parts.push(box(head, suit.head, suit.armor, headBasis),
    box(headPoint(-0.04, 0.21, 0), [suit.head[0] * 0.92, 0.12, suit.head[2] * 1.11], suit.metal, headBasis),
    box(headPoint(suit.head[0] / 2, 0.015, 0), [0.04, 0.17, suit.head[2] * 0.94], suit.dark, headBasis),
    box(headPoint(suit.head[0] / 2 + 0.025, 0.035, 0), [0.027, 0.054, suit.head[2] * 0.81], suit.trim, headBasis, true),
    box(headPoint(-0.065, -0.025, suit.head[2] / 2), [0.16, 0.22, 0.071], suit.dark, headBasis),
    box(headPoint(-0.056, -0.024, suit.head[2] / 2 + 0.042), [0.086, 0.101, 0.017], suit.trim, headBasis, true));
  if (index === 0) {
    parts.push(box(headPoint(-0.18, 0.30, 0.16), [0.06, 0.19, 0.06], suit.metal, headBasis),
      box(headPoint(-0.18, 0.40, 0.16), [0.081, 0.041, 0.081], suit.trim, headBasis, true));
  } else {
    parts.push(box(headPoint(0, -0.16, 0), [0.54, 0.12, 0.57], suit.metal, headBasis));
  }

  let glove, boot;
  for (const side of SIGNS) {
    const near = side === 1;
    const shoulder = torsoPoint(0.01, 0.17, side * (suit.width / 2 + 0.035));
    const [elbow, hand] = joint(shoulder, world(near ? pose.nearHand : pose.farHand), [-direction * 0.23, -1, side * 0.64], 0.48, 0.46);
    const knuckle = unit(minus(hand, elbow));
    const handBasis = upright(knuckle);
    parts.push(box(shoulder, [0.30, index === 0 ? 0.26 : 0.36, 0.32], suit.armor, torso),
      segment(shoulder, elbow, 0.22, 0.22, suit.dark),
      segment(elbow, hand, 0.24, 0.26, suit.armor),
      box(hand, [0.30, 0.34, 0.32], suit.glove, handBasis),
      box(plus(hand, scale(knuckle, 0.16)), [0.26, 0.047, 0.28], suit.metal, handBasis));

    const leg = world([0, pose.hip - 0.02, side * 0.22]);
    const [knee, foot] = joint(leg, world(near ? pose.nearFoot : pose.farFoot), [direction, 0.33, side * 0.22], 0.51, 0.50);
    const lift = smooth((foot[1] - 0.75) / 0.53);
    const footY = unit([-direction * lift * 0.36, 1, 0]);
    const toe = plus(foot, [direction * 0.056, 0, 0]);
    parts.push(segment(leg, knee, 0.30, 0.31, suit.dark),
      segment(knee, foot, 0.24, 0.26, suit.armor),
      box(plus(knee, [direction * 0.09, 0, 0]), [0.17, 0.21, 0.27], suit.metal),
      box(toe, [0.41, 0.23, 0.32], suit.dark, upright(footY)),
      box(plus(toe, [direction * 0.13, 0.013, 0]), [0.17, 0.16, 0.32], suit.armor, upright(footY)));
    if (near) { glove = hand; boot = toe; }
  }
  return { parts, root, glove, boot };
}

function buildCity(random) {
  const towers = [];
  for (let row = 0; row < 3; row++) {
    for (let i = -10; i <= 10; i++) {
      const x = i * (2.02 + row * 1.1) + random() * 1.8;
      const z = -34 + row * 10.7 + random() * 3.4;
      const width = 0.84 + random() * 1.55, depth = 1.0 + random() * 1.8;
      const top = -0.90 + random() * (7.35 - 0.65 * row);
      const lights = [];
      for (let y = top - 0.44; y > -1.75; y -= 0.36) {
        for (let j = -1; j <= 1; j++) {
          if (random() < 0.57) continue;
          lights.push([x + j * width * 0.25, y, random()]);
        }
      }
      const neon = row !== 0 && top > 2.3 && i % 4 === row - 2;
      towers.push({ x, z, top, width, depth, row, lights, neon, aerial: random() < 0.22 });
    }
  }
  return towers;
}

function drawCity(ctx, view, towers, viewportWidth) {
  const windowColors = ['#48607c', '#426c7b', '#7d5b76', '#ab7c70'];
  const buildings = towers.map(t => ({ ...t, distance: view.view([t.x, t.top, t.z])[2] }));
  buildings.sort((a, b) => b.distance - a.distance);
  for (const { x, z, top, width, depth, row, lights, aerial, neon } of buildings) {
    const left = x - width / 2, right = x + width / 2, front = z + depth / 2;
    const edge = view.eye[0] > x ? right : left;
    const bottom = -3.5;
    const base = projectFace(view, [[left, bottom, front], [right, bottom, front], [right, top, front], [left, top, front]]);
    if (base.length < 3 || base.every(p => p[0] < -100) || base.every(p => p[0] > viewportWidth + 100)) continue;
    polygon(ctx, base, ['#222742', '#151e34', '#0d1728'][row]);
    polygon(ctx, projectFace(view, [[edge, bottom, front], [edge, bottom, z - depth / 2],
      [edge, top, z - depth / 2], [edge, top, front]]), ['#1b233c', '#101a2b', '#0b1323'][row]);
    for (const [wx, wy, color] of lights) {
      const w = width * 0.075;
      polygon(ctx, projectFace(view, [[wx - w, wy - 0.06, front], [wx + w, wy - 0.06, front],
        [wx + w, wy + 0.058, front], [wx - w, wy + 0.058, front]]),
      windowColors[Math.floor(color * windowColors.length)]);
    }
    if (neon) {
      const bandX = x + width * 0.33, end = top - 0.58;
      const strip = row === 1 ? '#7dafff' : '#b16aa8';
      line(ctx, view, [bandX, end - 1.27, front], [bandX, end, front], strip, 1.8);
      line(ctx, view, [bandX - width * 0.30, end, front], [bandX, end, front], strip, 1.8);
    }
    if (aerial) {
      line(ctx, view, [x, top, front], [x, top + 0.62, front], '#50607b', 0.8);
      line(ctx, view, [x - 0.027, top + 0.62, front], [x + 0.027, top + 0.62, front], '#ef898a', 1.5);
    }
  }
}

const RAILS = [
  box([0, 0.15, -4.12], [20, 0.30, 0.34], [23, 34, 49]),
  box([0, 0.80, -4.12], [20, 0.075, 0.093], [70, 89, 107]),
  ...[-8, -6, -4, -2, 0, 2, 4, 6, 8].map(x => box([x, 0.47, -4.12], [0.105, 0.67, 0.10], [49, 64, 81])),
  box([-3.68, 0.34, -2.93], [0.58, 0.68, 0.61], [27, 47, 65]),
  box([-3.68, 0.66, -2.61], [0.48, 0.065, 0.04], TEAL, AXES, true),
  box([3.62, 0.34, -3.08], [0.58, 0.68, 0.61], [53, 46, 56]),
  box([3.62, 0.66, -2.76], [0.48, 0.065, 0.04], AMBER, AXES, true),
];
const ROOF = [[-13, 0, -4.25], [13, 0, -4.25], [13, 0, 10], [-13, 0, 10]];

function ellipse(radiusX, radiusZ, centerX = 0, centerZ = 0, start = 0, end = TAU) {
  return Array.from({ length: 33 }, (_, i) => {
    const angle = mix(start, end, i / 32);
    return [centerX + Math.cos(angle) * radiusX, 0, centerZ + Math.sin(angle) * radiusZ];
  });
}

const ring = ellipse(3.11, 2.02);
const arcs = [ellipse(3.16, 2.06, 0, 0, 0.80, 2.34), ellipse(3.16, 2.06, 0, 0, 3.94, 5.48)];

function drawRoof(ctx, view, width, height, scuffs, fighters, pulse) {
  const floor = projectFace(view, ROOF);
  const wet = ctx.createLinearGradient(0, height * 0.38, 0, height);
  wet.addColorStop(0, '#213040');
  wet.addColorStop(0.53, '#172432');
  wet.addColorStop(1, '#0d1420');
  polygon(ctx, floor, wet);
  ctx.save();
  ctx.clip();

  for (const [x, color] of [[width * 0.24, TEAL], [width * 0.76, AMBER]]) {
    const y = height * 0.62, r = width * 0.54;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, rgba(color, 0.12 + 0.035 * pulse));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }
  for (let x = -12; x <= 12; x += 1.5) line(ctx, view, [x, 0, -4.25], [x, 0, 9], '#0a111c91');
  for (let z = -4; z <= 9; z += 1.2) line(ctx, view, [-13, 0, z], [13, 0, z], '#71859b25');

  for (const [x, z, length, shade] of scuffs) {
    line(ctx, view, [x, 0, z], [x + length, 0, z + 0.012], shade);
  }
  polygon(ctx, projectFace(view, ring), '#0b17272b', '#adc2d35a');
  for (const [index, arc] of arcs.entries()) {
    const points = arc.map(point => view.screen(view.view(point)));
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
    ctx.strokeStyle = rgba(index === 0 ? TEAL : AMBER, 0.58 + 0.26 * pulse);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const sign of SIGNS) {
    const x = sign * 3.45, color = sign < 0 ? TEAL : AMBER;
    for (let i = 0; i < 3; i++) {
      const z = -1.39 + i * 0.21;
      polygon(ctx, projectFace(view, [[x, 0, z], [x + sign * 0.32, 0, z - 0.10],
        [x + sign * 0.39, 0, z - 0.02], [x, 0, z + 0.087]]), rgba(color, 0.46));
    }
  }
  for (const { root } of fighters) {
    polygon(ctx, projectFace(view, ellipse(0.68, 0.41, root[0], root[2])), '#090f19b0');
    polygon(ctx, projectFace(view, ellipse(0.48, 0.29, root[0], root[2])), '#090f1980');
  }
  drawBoxes(ctx, view, fighters.flatMap(({ parts }) => parts), true);
  ctx.restore();
}

function accentPosition({ kind, actor }, fighters) {
  const origin = fighters[actor];
  const toward = actor === 0 ? 1 : -1;
  if (kind === 'block') return lerp(origin.glove, fighters[1 - actor].glove, 0.5);
  if (kind === 'kick') return plus(origin.boot, [toward * 0.15, 0, 0]);
  return plus(origin.glove, [toward * 0.12, 0, 0]);
}

function drawAccent(ctx, view, accent, point, density) {
  const { kind, actor, age } = accent;
  if (age > 0.20) return;
  const toward = actor === 0 ? 1 : -1;
  const color = kind === 'block' ? [145, 231, 255] : kind === 'dodge' ? [170, 207, 237] : [255, 194, 96];
  const opacity = (1 - age / 0.20) ** 1.6;
  const [x, y] = view.screen(view.view(point));
  const px = Math.abs(view.screen(view.view(plus(point, [0, 0.15, 0])))[1] - y) / 0.15;
  if (kind === 'dodge') {
    ctx.beginPath();
    ctx.ellipse(x - toward * px * 0.25, y, px * 0.42, px * 0.12, -toward * 0.12, 0.10, 2.85);
    ctx.lineWidth = Math.max(1, px * 0.025);
    ctx.strokeStyle = rgba(color, 0.64 * opacity);
    ctx.stroke();
    return;
  }
  const strength = kind === 'kick' ? 1.18 : kind === 'block' ? 0.72 : 0.92;
  const radius = Math.max(3, px * (0.15 + age * 2.8) * strength);
  const halo = ctx.createRadialGradient(x, y, 0, x, y, radius);
  halo.addColorStop(0, rgba(color, 0.66 * opacity));
  halo.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
  ctx.beginPath();
  ctx.ellipse(x, y, radius * 0.81, radius * 0.59, -toward * 0.29, 0, TAU);
  ctx.lineWidth = Math.max(1.0, px * 0.024);
  ctx.strokeStyle = rgba(color, 0.87 * opacity);
  ctx.stroke();
  const rays = 4 + Math.round(10 * density);
  for (let i = 0; i < rays; i++) {
    const angle = i * 2.39996 + toward * 0.5, reach = (0.72 + (i % 4) * 0.16) * radius;
    const dx = Math.cos(angle) * reach, dy = Math.sin(angle) * reach;
    polygon(ctx, [[x + dx * 0.30, y + dy * 0.30], [x + dx * 0.61 - dy * 0.062, y + dy * 0.61 + dx * 0.062],
      [x + dx, y + dy], [x + dx * 0.61 + dy * 0.062, y + dy * 0.61 - dx * 0.062]], rgba(color, opacity));
  }
}

const WIDE = [-0.28, 2.89, 8.50, 1.27];
const LOW = [0.36, 1.66, 7.22, 1.26];
const CLOSE = [0.22, 2.00, 6.40, 1.32];
const KICK = [-0.20, 1.82, 6.21, 1.29];
const STEADY = [0.25, 2.13, 7.58, 1.26];

function shotAt(position, reduced) {
  if (reduced) return STEADY;
  if (position < 3) return lerp(WIDE, LOW, smooth((position - 1.24) / 1.53));
  if (position < 5) return lerp(LOW, CLOSE, smooth((position - 3.24) / 1.76));
  if (position < 7.28) return lerp(CLOSE, KICK, smooth((position - 5.25) / 1.75));
  return lerp(KICK, WIDE, smooth((position - 7.28) / 0.72));
}

export function createBlockBrawl(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const motion = new BrawlMotion();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const consolePanel = document.getElementById('console');
  const random = randomizer(84912);
  const city = buildCity(random);
  const scuffs = Array.from({ length: 87 }, () => [(random() - 0.5) * 19, -4 + random() * 11,
    0.10 + random() * 0.75, ['#98bed12a', '#46537539', '#060f1b5e'][Math.floor(random() * 3)]]);
  const rain = Array.from({ length: 116 }, () => [random(), random(), random(), random()]);
  let width, height, sky, vignette, panelWidth, panelHeight, shot = WIDE;
  let accent, contact;

  function resize(w, h) {
    if (w < 1 || h < 1 || w === width && h === height) return;
    width = w; height = h;
    const ratio = Math.min(devicePixelRatio || 1, 1.6, 1920 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    panelWidth = consolePanel?.offsetWidth ?? 0;
    panelHeight = consolePanel?.offsetHeight ?? 0;
    sky = ctx.createLinearGradient(0, 0, 0, height * 0.74);
    sky.addColorStop(0, '#090f20');
    sky.addColorStop(0.55, '#262849');
    sky.addColorStop(0.82, '#53516e');
    sky.addColorStop(1, '#3b4563');
    vignette = ctx.createRadialGradient(width / 2, height * 0.53, Math.min(width, height) * 0.27,
      width / 2, height * 0.53, Math.max(width, height) * 0.70);
    vignette.addColorStop(0, '#06091400');
    vignette.addColorStop(1, '#060914c7');
  }

  function render(dt, frame, presentation = 0) {
    if (!width) return;
    motion.advance(dt, frame);
    const portrait = width / height < 0.85;
    const overlay = 1 - presentation;
    const sidePanel = width >= 900 && height >= 420 && width / height >= 1.5;
    const fightX = width / 2 - (sidePanel && panelWidth ? (panelWidth + 26) * overlay * 0.45 : 0);
    const fightY = height * 0.53 - (sidePanel ? 0 : Math.min(panelHeight * 0.34, height * 0.12)) * overlay;
    const desired = shotAt(motion.beat + motion.phase, reduced.matches);
    shot = reduced.matches ? desired : lerp(shot, desired, 1 - Math.exp(-24 * dt));
    const framing = portrait && !reduced.matches ? [shot[0], shot[1], Math.max(6.05, shot[2] - 0.36), shot[3]] : shot;
    const view = camera(width, height, fightX, fightY, framing);
    const fighters = motion.poses.map(fighter);
    const density = clamp(frame?.density ?? 0.65);
    const pulse = motion.beat >= 0 ? (1 - motion.phase) ** 7 : 0;
    if (accent !== motion.accent) {
      accent = motion.accent;
      contact = accent && accentPosition(accent, fighters);
    }

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
    drawCity(ctx, view, city, width);
    drawRoof(ctx, view, width, height, scuffs, fighters, pulse);
    drawBoxes(ctx, view, RAILS);
    drawBoxes(ctx, view, fighters.flatMap(({ parts }) => parts));
    if (accent) drawAccent(ctx, view, accent, contact, density);

    const count = 23 + Math.round(density * 93);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const [offset, start, speed, length] = rain[i];
      const y = (start + motion.time * (0.28 + speed * 0.61)) % 1.1;
      const x = ((offset + y * 0.14) % 1) * width;
      const fall = (0.008 + length * 0.024) * Math.min(height, width * 1.25);
      ctx.moveTo(x, y * height); ctx.lineTo(x - fall * 0.37, y * height - fall);
    }
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = reduced.matches ? '#c5d9ee24' : '#c5d9ee42';
    ctx.stroke();
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }
  return { resize, render };
}
