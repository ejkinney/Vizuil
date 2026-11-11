import { Mesh, box, oval, branch, transform } from './aquarium-geometry.mjs';

const TAU = Math.PI * 2;
const ivory = '#ced6cc', shell = '#8daba4', edge = '#455d62';
const graphite = '#232c39', rubber = '#131b23', metal = '#4e656b', white = '#e1eee5';
export const OPERATOR_X = 1.16, OPERATOR_Z = 0.49, OPERATOR_YAW = -1.15;

// Clockwise as viewed from the back. Each bevel keeps the same outline.
function outline(width, height, radius, z) {
  const points = [];
  for (let corner = 0; corner < 4; corner++) {
    const start = corner * Math.PI / 2;
    const cx = (width / 2 - radius) * (corner === 0 || corner === 3 ? 1 : -1);
    const cy = (height / 2 - radius) * (corner < 2 ? 1 : -1);
    for (let i = 0; i <= 4; i++) {
      const a = start + i * Math.PI / 8;
      points.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a), z]);
    }
  }
  return points;
}

function casing(width, height, depth, radius, color) {
  const m = new Mesh();
  const rings = [
    outline(width * .83, height * .86, radius, -depth),
    outline(width, height, radius, -depth * .43),
    outline(width, height, radius, -.065),
    outline(width - .12, height - .12, radius * .82, 0),
  ];
  for (let row = 0; row < rings.length - 1; row++) {
    const a = rings[row], b = rings[row + 1];
    for (let i = 0; i < a.length; i++) {
      const next = (i + 1) % a.length;
      m.quad(a[i], a[next], b[next], b[i], color, [.72, .88, 1][row]);
    }
  }
  for (const [rim, direction] of [[rings[0], -1], [rings.at(-1), 1]]) {
    for (let i = 0; i < rim.length; i++) {
      const j = (i + 1) % rim.length;
      m.triangle([0, 0, rim[0][2]], rim[direction > 0 ? i : j], rim[direction > 0 ? j : i], color, .78);
    }
  }
  return m;
}

function panel(width, height, radius, z) {
  const points = outline(width, height, radius, z);
  const m = new Mesh();
  for (let i = 0; i < points.length; i++) {
    m.triangle([0, 0, z], points[i], points[(i + 1) % points.length], '#ffffff');
  }
  return m;
}

function addRing(mesh, center, radius, thickness, ratio, tilt, color) {
  const point = (r, a) => {
    const y = r * Math.sin(a) * ratio;
    return [center[0] + r * Math.cos(a), center[1] + y * Math.cos(tilt), center[2] + y * Math.sin(tilt)];
  };
  for (let i = 0; i < 48; i++) {
    const a = i * TAU / 48, b = (i + 1) * TAU / 48;
    mesh.quad(point(radius, a), point(radius, b), point(radius - thickness, b), point(radius - thickness, a), color);
  }
}

function room() {
  const backdrop = new Mesh(), floor = new Mesh(), frame = new Mesh(), wiring = new Mesh(), rings = new Mesh(), halos = new Mesh();
  backdrop.quad([-45, -20, -26], [45, -20, -26], [45, 31, -26], [-45, 31, -26], white);
  floor.quad([-24, 0, 22], [24, 0, 22], [24, 0, -26], [-24, 0, -26], white);
  for (const z of [-2.55, 2.45]) {
    const low = z < 0 ? .015 : .045, high = 4.85;
    const left = -3.7, right = 2.9, thickness = z < 0 ? .012 : .008;
    frame.add(box((left + right) / 2, high, z, right - left, thickness, thickness, white));
    frame.add(box((left + right) / 2, low, z, right - left, thickness, thickness, white));
    for (const x of [left, right]) frame.add(box(x, (low + high) / 2, z, thickness, high - low, thickness, white));
    if (z > 0) {
      for (const x of [left, right]) {
        frame.add(box(x, high, -.05, thickness, thickness, 5, white));
        frame.add(box(x, low, -.05, thickness, thickness, 5, white));
      }
    }
  }
  const nodes = [[-9, 2.1, -2.4], [-4.65, 1.28, -1.82], [-3.98, 2.97, -2.15], [-3.51, 4.35, -2.7],
    [-1.8, 5.0, -3.4], [2.61, 4.57, -3.12], [3.77, 2.15, -2.1], [4.9, 3.08, -2.55], [8.5, 3.24, -2.76]];
  for (let i = 1; i < nodes.length; i++) wiring.add(branch(nodes[i - 1], nodes[i], .014, .014, white, 4));
  for (const [i, radius, tilt] of [[1, .56, .93], [2, .35, .52], [3, .55, .43], [5, .56, -.72], [6, .82, .65]]) {
    const center = nodes[i];
    for (const size of [1, .70, .38]) {
      addRing(rings, center, radius * size, .022, .54, tilt, white);
      addRing(halos, center, radius * size + .041, .106, .54, tilt, '#777777');
      addRing(halos, center, radius * size + .081, .188, .54, tilt, '#333333');
    }
  }
  const floorCenter = [1.22, .027, .88];
  for (const radius of [1.75, 2.05, 2.12]) addRing(rings, floorCenter, radius, .014, 1, Math.PI / 2, white);
  return { backdrop, floor, frame, wiring, rings, halos };
}

function desk() {
  const furniture = new Mesh(), trim = new Mesh(), keys = new Mesh();
  const top = casing(3.46, 2.52, .15, .23, ivory);
  furniture.add(top, new Float32Array([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, -1.16, 1.59, .51, 1]));
  for (const [x, z] of [[-2.62, 1.46], [.26, 1.46], [-2.62, -.49], [.28, -.49]]) {
    const foot = [x + (x > 0 ? .17 : -.17), .1, z + (z > .2 ? .17 : -.13)];
    furniture.add(branch([x, 1.49, z], foot, .082, .062, ivory, 8));
    furniture.add(oval(foot[0], .082, foot[2], .105, .062, .101, rubber, 10, 5));
  }
  furniture.add(box(-1.14, 1.43, 1.47, 2.98, .08, .22, edge));
  trim.add(box(-1.19, 1.47, 1.58, 2.85, .022, .023, white));
  furniture.add(box(-1.89, 1.64, 1.04, .64, .12, .40, graphite));
  furniture.add(box(-1.89, 1.71, 1.04, .59, .027, .36, metal));
  for (let i = 0; i < 4; i++) trim.add(box(-2.09 + i * .108, 1.729, 1.14, .04, .013, .033, white));
  furniture.add(oval(-1.79, 1.751, .98, .065, .041, .065, rubber, 10, 4));

  const keyboard = transform(OPERATOR_X, 0, OPERATOR_Z, OPERATOR_YAW);
  furniture.add(box(0, 1.648, 1.34, 1.40, .11, .51, graphite), keyboard);
  furniture.add(box(0, 1.708, 1.34, 1.36, .025, .47, edge), keyboard);
  trim.add(box(0, 1.658, 1.083, 1.26, .023, .012, white), keyboard);
  for (let i = 0; i < 12; i++) for (let j = 0; j < 4; j++) {
    if (j === 0 && i >= 3 && i <= 8) continue;
    const key = box((i - 5.5) * .106, 1.733, 1.176 + j * .094, .091, .033, .074,
      i < 2 || i > 9 ? '#8f9b9b' : '#c1cbbd');
    keys.add(key, keyboard);
  }
  keys.add(box(0, 1.733, 1.176, .608, .033, .074, ivory), keyboard);
  return { furniture, trim, keys };
}

function monitors() {
  const stands = new Mesh();
  const screens = [
    { x: -1.36, y: 2.39, z: -.35, yaw: .07, roll: .018, w: 1.92, h: 1.21 },
    { x: -2.83, y: 2.24, z: -.26, yaw: .38, roll: .10, w: 1.04, h: .80 },
    { x: .08, y: 2.32, z: -.64, yaw: -.23, roll: -.055, w: .94, h: .78 },
    { x: -1.64, y: 3.85, z: -.89, yaw: .14, roll: -.070, w: 1.61, h: 1.18, float: true },
    { x: -3.08, y: 3.47, z: -1.0, yaw: .40, roll: .13, w: 1.07, h: .71, float: true },
    { x: -.17, y: 3.56, z: -.97, yaw: -.25, roll: -.10, w: 1.13, h: .80, float: true },
  ];
  for (const screen of screens) {
    const { x, y, z, w, h, float } = screen;
    const body = casing(w, h, float ? .36 : .49, .15, float ? shell : ivory);
    body.add(casing(w - .14, h - .13, .09, .12, graphite), transform(0, 0, .019));
    for (let i = 0; i < 4; i++) body.add(box(w * .24 + i * .043, -h / 2 + .076, .024, .022, .012, .013, metal));
    const trim = panel(w - .23, h - .226, .085, .021);
    const displayWidth = w - .266, displayHeight = h - .26;
    Object.assign(screen, {
      body, trim, glass: panel(displayWidth, displayHeight, .071, .025), displayWidth, displayHeight,
    });
    if (float) {
      stands.add(branch([x + .16, y - .03, z - .37], [x + .26, y + .24, -2.32], .022, .026, edge, 6));
      stands.add(oval(x + .26, y + .24, -2.32, .068, .068, .068, shell, 8, 4));
    } else {
      const stem = z - .28;
      stands.add(oval(x, 1.628, stem + .11, w * .26, .045, .26, graphite, 16, 5));
      stands.add(branch([x, 1.63, stem], [x, y - h * .39, stem], .077, .086, metal, 9));
    }
  }
  return { stands, screens };
}

function operator() {
  const seat = new Mesh(), clothes = new Mesh(), accents = new Mesh(), head = new Mesh(), headset = new Mesh();
  seat.add(oval(0, 1.10, -.16, .52, .12, .48, graphite, 20, 7));
  seat.add(oval(0, 1.55, -.49, .45, .50, .135, metal, 20, 9));
  seat.add(oval(0, 1.57, -.57, .37, .38, .10, graphite, 16, 7));
  seat.add(branch([0, .20, -.15], [0, 1.06, -.15], .082, .103, metal, 10));
  for (let i = 0; i < 5; i++) {
    const a = TAU * i / 5, x = .55 * Math.cos(a), z = -.15 + .55 * Math.sin(a);
    seat.add(branch([0, .25, -.15], [x, .13, z], .050, .045, edge, 6));
    seat.add(oval(x, .083, z, .079, .074, .079, rubber, 10, 4));
  }
  clothes.add(oval(0, 1.27, -.04, .40, .25, .31, graphite, 16, 7));
  clothes.add(oval(0, 1.79, .022, .451, .53, .275, graphite, 18, 9));
  clothes.add(oval(0, 1.90, .15, .325, .32, .20, shell, 16, 7));
  clothes.add(oval(0, 1.71, .282, .31, .19, .087, edge, 14, 6));
  clothes.add(oval(0, 2.23, .075, .224, .14, .197, rubber, 14, 6));
  clothes.add(branch([0, 2.23, .09], [0, 2.52, .12], .108, .114, shell, 11));
  for (const s of [-1, 1]) {
    clothes.add(oval(.389 * s, 2.02, .107, .17, .205, .18, ivory, 14, 7));
    clothes.add(branch([.215 * s, 1.27, .13], [.29 * s, 1.13, .65], .209, .167, graphite, 13));
    clothes.add(branch([.29 * s, 1.14, .62], [.34 * s, .43, .77], .163, .12, edge, 11));
    clothes.add(oval(.29 * s, 1.06, .66, .165, .163, .167, graphite, 12, 6));
    clothes.add(oval(.34 * s, .15, .94, .205, .13, .36, ivory, 18, 7));
    clothes.add(oval(.34 * s, .259, .93, .213, .16, .353, graphite, 18, 8));
    clothes.add(oval(.34 * s, .353, .78, .187, .229, .215, rubber, 16, 8));
    clothes.add(oval(.34 * s, .254, 1.124, .179, .105, .175, shell, 14, 6));
    accents.add(oval(.34 * s, .165, 1.183, .176, .032, .114, white, 14, 5));
    accents.add(branch([.12 * s, 2.105, .30], [.257 * s, 1.81, .314], .027, .023, white, 6));
    accents.add(oval(.34 * s, .419, .945, .10, .038, .034, white, 12, 5));
  }
  head.add(oval(0, .02, 0, .46, .422, .402, rubber, 24, 12));
  head.add(oval(0, .052, -.045, .435, .418, .372, shell, 22, 11));
  head.add(oval(0, -.097, .19, .393, .286, .276, ivory, 22, 10));
  head.add(oval(0, -.01, .24, .397, .229, .25, graphite, 22, 10));
  head.add(oval(0, .018, .285, .36, .180, .225, '#111e23', 24, 11));
  for (const s of [-1, 1]) {
    head.add(oval(s * .425, -.018, -.012, .107, .232, .215, graphite, 20, 10));
    head.add(oval(s * .490, -.018, -.012, .074, .185, .168, ivory, 20, 10));
    headset.add(oval(s * .544, -.018, -.012, .027, .12, .110, white, 20, 10));
    head.add(oval(s * .565, -.019, -.013, .014, .079, .074, edge, 16, 8));
    headset.add(oval(s * .166, .034, .478, .086, .025, .017, white, 16, 6));
  }
  for (let i = 0; i < 14; i++) {
    const a = i * Math.PI / 14, b = (i + 1) * Math.PI / 14;
    const point = t => [.462 * Math.cos(t), .427 * Math.sin(t) + .043, -.095];
    head.add(branch(point(a), point(b), .046, .046, graphite, 6));
  }
  head.add(branch([.47, -.107, .11], [.413, -.208, .295], .022, .017, graphite, 7));
  head.add(branch([.413, -.208, .295], [.250, -.232, .422], .017, .017, graphite, 7));
  headset.add(oval(.247, -.232, .421, .047, .028, .024, white, 12, 6));
  return { seat, clothes, accents, head, headset,
    upper: branch([0, 0, 0], [0, 1, 0], .126, .094, ivory, 12),
    sleeve: branch([0, 0, 0], [0, 1, 0], .104, .062, graphite, 12),
    seam: branch([0, 0, 0], [0, 1, 0], .079, .066, white, 12),
    elbow: oval(0, 0, 0, .102, .104, .10, graphite, 12, 6),
    palm: oval(0, 0, .056, .104, .062, .127, graphite, 14, 7),
    knuckles: oval(0, .036, .075, .082, .029, .076, white, 14, 7),
    finger: branch([0, 0, 0], [0, 1, 0], .023, .016, ivory, 7),
  };
}

export function buildSignalDesk() {
  return { ...room(), ...desk(), ...monitors(), operator: operator() };
}
