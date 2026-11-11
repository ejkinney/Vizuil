// Small, flat-shaded meshes. All animals and scenery are built locally; no assets or libraries to fetch.
export const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function transform(x = 0, y = 0, z = 0, yaw = 0, sx = 1, sy = sx, sz = sx, roll = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw), a = Math.cos(roll), b = Math.sin(roll);
  return new Float32Array([c * a * sx, b * sx, -s * a * sx, 0,
    -c * b * sy, a * sy, s * b * sy, 0, s * sz, 0, c * sz, 0, x, y, z, 1]);
}
export function multiply(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
  }
  return out;
}
export function cameraMatrix(eye, target, width, height, perspective = false) {
  const unit = a => { const n = Math.hypot(...a); return a.map(v => v / n); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
  const z = unit(eye.map((v, i) => v - target[i]));
  const x = unit(cross([0, 1, 0], z)), y = cross(z, x);
  const view = new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  const near = 0.1, far = 80;
  if (perspective) {
    const distance = Math.hypot(...eye.map((v, i) => v - target[i]));
    const projection = new Float32Array([2 * distance / width, 0, 0, 0, 0, 2 * distance / height, 0, 0,
      0, 0, -(far + near) / (far - near), -1, 0, 0, -2 * far * near / (far - near), 0]);
    return multiply(projection, view);
  }
  const projection = new Float32Array([2 / width, 0, 0, 0, 0, 2 / height, 0, 0, 0, 0, -2 / (far - near), 0,
    0, 0, -(far + near) / (far - near), 1]);
  return multiply(projection, view);
}
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
export class Mesh {
  data = [];
  triangle(a, b, c, color, shade = 1) {
    const u = b.map((v, i) => v - a[i]), v = c.map((v, i) => v - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n);
    if (length < 1e-8) return this;
    const normal = n.map(v => v / length), tint = rgb(color).map(v => v * shade);
    for (const point of [a, b, c]) this.data.push(...point, ...normal, ...tint);
    return this;
  }
  quad(a, b, c, d, color, shade = 1) {
    this.triangle(a, b, c, color, shade); this.triangle(a, c, d, color, shade); return this;
  }
  add(mesh, matrix = identity()) {
    for (let i = 0; i < mesh.data.length; i += 9) {
      const p = mesh.data.slice(i, i + 3), n = mesh.data.slice(i + 3, i + 6);
      for (let r = 0; r < 3; r++) this.data.push(matrix[r] * p[0] + matrix[4 + r] * p[1] + matrix[8 + r] * p[2] + matrix[12 + r]);
      // Inverse transpose for the rotation + scale transforms used by the scene.
      const lengths = [0, 4, 8].map(k => matrix[k] ** 2 + matrix[k + 1] ** 2 + matrix[k + 2] ** 2);
      const normal = [0, 1, 2].map(r => matrix[r] * n[0] / lengths[0] + matrix[4 + r] * n[1] / lengths[1] + matrix[8 + r] * n[2] / lengths[2]);
      const length = Math.hypot(...normal);
      this.data.push(...normal.map(v => v / length), ...mesh.data.slice(i + 6, i + 9));
    }
    return this;
  }
}
export function box(x, y, z, sx, sy, sz, color) {
  const m = new Mesh(), p = [];
  for (const dz of [-1, 1]) for (const dy of [-1, 1]) for (const dx of [-1, 1]) p.push([x + dx * sx / 2, y + dy * sy / 2, z + dz * sz / 2]);
  for (const ids of [[0, 2, 3, 1], [4, 5, 7, 6], [0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3]]) m.quad(...ids.map(i => p[i]), color);
  return m;
}
export function oval(x, y, z, rx, ry, rz, color, sides = 7, bands = 4) {
  const m = new Mesh();
  const point = (i, j) => {
    const a = Math.PI * (i / bands - 0.5), b = Math.PI * 2 * j / sides;
    return [x + rx * Math.cos(a) * Math.cos(b), y + ry * Math.sin(a), z + rz * Math.cos(a) * Math.sin(b)];
  };
  for (let i = 0; i < bands; i++) for (let j = 0; j < sides; j++) {
    const shade = 0.94 + 0.06 * ((i * 7 + j * 3) % 5) / 4;
    m.triangle(point(i, j), point(i + 1, j), point(i + 1, j + 1), color, shade);
    m.triangle(point(i, j), point(i + 1, j + 1), point(i, j + 1), color, shade);
  }
  return m;
}
export function branch(a, b, radius, tip, color, sides = 5) {
  const m = new Mesh(), delta = b.map((v, i) => v - a[i]);
  const length = Math.hypot(...delta), d = delta.map(v => v / length);
  const u = Math.abs(d[1]) < 0.95 ? [d[2], 0, -d[0]] : [1, 0, 0];
  const scale = Math.hypot(...u); for (let i = 0; i < 3; i++) u[i] /= scale;
  const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const point = (p, r, i) => p.map((value, k) => value + r * (u[k] * Math.cos(i * Math.PI * 2 / sides) + v[k] * Math.sin(i * Math.PI * 2 / sides)));
  for (let i = 0; i < sides; i++) {
    m.quad(point(a, radius, i), point(a, radius, i + 1), point(b, tip, i + 1), point(b, tip, i), color);
    m.triangle(b, point(b, tip, i), point(b, tip, i + 1), color);
  }
  return m;
}
export function fin(points, color) {
  const m = new Mesh();
  for (let i = 1; i < points.length - 1; i++) m.triangle(points[0], points[i], points[i + 1], color);
  return m;
}
export function fish(kind) {
  const m = new Mesh(), tang = kind === 'tang', small = kind === 'shoal';
  const color = tang ? '#428bff' : small ? '#72e6ce' : '#ff8a40';
  if (tang || small) m.add(oval(0, 0, 0, 0.64, tang ? 0.48 : 0.22, tang ? 0.17 : 0.13, color, 8, 4));
  else {
    const rings = [[-0.68, 0.07], [-0.48, 0.2], [-0.35, 0.26], [-0.22, 0.3], [0.05, 0.32], [0.2, 0.3], [0.4, 0.24], [0.51, 0.18], [0.66, 0.06]];
    const p = (i, j) => { const [x, r] = rings[i], a = j * Math.PI / 4; return [x, r * Math.cos(a), r * 0.66 * Math.sin(a)]; };
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < 8; j++) {
      m.quad(p(i, j), p(i, j + 1), p(i + 1, j + 1), p(i + 1, j), [1, 4, 6].includes(i) ? '#fff4d5' : color);
    }
  }
  m.add(fin([[-0.43, 0.16, 0], [-0.3, tang ? 0.65 : 0.47, 0], [0.25, 0.25, 0]], tang ? '#3458ba' : color));
  m.add(fin([[-0.15, -0.16, 0], [-0.37, -0.39, 0], [0.28, -0.17, 0]], color));
  for (const side of [-1, 1]) {
    const z = side * (tang ? 0.15 : small ? 0.105 : 0.147);
    m.add(oval(0.43, 0.09, z, 0.091, 0.091, 0.035, '#fff4d8', 6, 3));
    m.add(oval(0.455, 0.09, z + side * 0.029, 0.048, 0.052, 0.018, '#112b3b', 6, 3));
    m.add(fin([[-0.04, 0.02, side * 0.13], [-0.31, -0.2, side * 0.39], [0.23, -0.12, side * 0.13]], tang ? '#ffd964' : color));
    if (tang) m.add(branch([-0.47, -0.02, side * 0.13], [0.22, 0.21, side * 0.15], 0.045, 0.075, '#203f86', 4));
  }
  const tail = fin([[0.04, 0, 0], [-0.48, 0.33, 0], [-0.4, 0, 0.04], [-0.48, -0.33, 0]], tang ? '#ffda68' : small ? '#b2f4e3' : '#ff9d51');
  return { body: m, tail };
}
export function turtle() {
  const m = new Mesh();
  m.add(oval(0, -0.08, 0, 0.72, 0.18, 0.55, '#e1d99b', 8, 3));
  m.add(oval(-0.06, 0.12, 0, 0.76, 0.36, 0.59, '#78965c', 8, 3));
  m.add(oval(0.84, 0.02, 0, 0.34, 0.22, 0.25, '#96b77c', 6, 3));
  // Raised shell plates keep the silhouette deliberately chunky.
  m.add(oval(-0.1, 0.42, 0, 0.31, 0.065, 0.26, '#b1bd7e', 6, 2));
  for (const side of [-1, 1]) {
    m.add(oval(0.99, 0.09, side * 0.19, 0.046, 0.055, 0.026, '#173d3b', 5, 3));
    m.add(fin([[-0.35, -0.06, side * 0.35], [-0.91, -0.13, side * 0.85], [-0.38, -0.14, side * 0.76]], '#87a46b'));
  }
  const flipper = fin([[0.42, 0, 0.3], [0.2, -0.12, 1.18], [-0.36, -0.14, 0.92], [-0.22, 0, 0.32]], '#a6be7f');
  return { body: m, flipper };
}
export function ray() {
  const m = oval(0, 0.02, 0, 0.68, 0.15, 0.37, '#8797c7', 6, 3);
  m.add(branch([-0.5, 0, 0], [-1.96, 0.02, 0], 0.061, 0.012, '#8494c3', 4));
  for (const side of [-1, 1]) {
    m.add(oval(0.4, 0.12, side * 0.16, 0.055, 0.04, 0.04, '#172d4e', 5, 2));
    m.add(fin([[0.65, 0, side * 0.2], [0.86, -0.03, side * 0.38], [0.4, 0, side * 0.36]], '#a5b5df'));
  }
  const wing = new Mesh();
  wing.triangle([0.52, 0, 0.2], [0.06, 0.11, 0.77], [-0.62, 0, 0.22], '#8d9fd0');
  wing.triangle([0.52, 0, 0.2], [0.16, 0.02, 1.48], [0.06, 0.11, 0.77], '#b0bde4');
  wing.triangle([0.06, 0.11, 0.77], [0.16, 0.02, 1.48], [-0.62, 0, 0.22], '#738bbd');
  return { body: m, wing };
}
export function jelly() {
  const m = new Mesh(), rim = [], center = [0, 0.45, 0];
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; rim.push([Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5]); }
  for (let i = 0; i < 8; i++) {
    const a = rim[i], b = rim[(i + 1) % 8];
    m.triangle(center, b, a, i % 2 ? '#d4b5ed' : '#a49bdb');
    m.quad(a, b, [b[0] * 1.06, -0.12, b[2] * 1.06], [a[0] * 1.06, -0.12, a[2] * 1.06], '#e2c5f1');
  }
  return m;
}
export function crab() {
  const m = oval(0, 0.19, 0, 0.38, 0.2, 0.27, '#ec8879', 6, 3);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const a = [side * 0.22, 0.16, 0.16 - i * 0.19], b = [side * 0.55, 0.13, 0.28 - i * 0.27];
      m.add(branch(a, b, 0.035, 0.03, '#d77b6b', 4));
      m.add(branch(b, [side * 0.63, 0.02, b[2] + 0.05], 0.03, 0.01, '#ee9d7d', 4));
    }
    m.add(branch([side * 0.26, 0.2, 0.18], [side * 0.53, 0.35, 0.52], 0.058, 0.05, '#f0a28b', 4));
    m.add(oval(side * 0.54, 0.42, 0.57, 0.14, 0.16, 0.12, '#ffa88b', 5, 3));
    m.add(branch([side * 0.13, 0.29, 0.18], [side * 0.15, 0.46, 0.21], 0.032, 0.028, '#f9b096', 4));
    m.add(oval(side * 0.15, 0.47, 0.22, 0.045, 0.045, 0.04, '#193745', 5, 2));
  }
  return m;
}
export function starfish() {
  const m = new Mesh(), top = [0, 0.13, 0];
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5, b = a + Math.PI / 5, c = a - Math.PI / 5;
    const tip = [Math.sin(a) * 0.5, 0.03, Math.cos(a) * 0.5];
    m.triangle(top, [Math.sin(b) * 0.18, 0.02, Math.cos(b) * 0.18], tip, '#f8b184');
    m.triangle(top, tip, [Math.sin(c) * 0.18, 0.02, Math.cos(c) * 0.18], '#e68c72');
  }
  return m;
}
