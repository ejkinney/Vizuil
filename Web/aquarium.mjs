import { Mesh, box, oval, branch, fish, turtle, ray, jelly, crab, starfish,
  identity, transform, multiply, cameraMatrix } from './aquarium-geometry.mjs';
import { BeatClock } from './beat-clock.mjs';

const TAU = Math.PI * 2;
const WIDTH = 5.05, DEPTH = 2.52, SURFACE = 5.05;
const KELP_COUNT = 16;
const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const ease = (a, b, speed, dt) => a + (b - a) * (1 - Math.exp(-speed * dt));
const KELP_COLORS = [
  ['#49a388', '#85e2ae'], ['#4d9f70', '#a0df96'],
  ['#72994d', '#c1db7f'], ['#9b8b48', '#ebce80'],
];

export class AquariumSignal {
  levels = new Float32Array(KELP_COUNT);
  clock = new BeatClock();
  pulse = 0;
  shimmer = 0;
  pace = 1;
  generation;
  source;
  hits;
  active = false;

  advance(dt, frame) {
    const active = frame?.status === 'live' || frame?.status === 'demo';
    const audio = active ? frame.spectrum : null;
    const rhythm = audio ?? (frame?.status === 'quiet' ? frame.spectrum : null);
    const sameSource = rhythm && frame.generation === this.generation && frame.source === this.source && this.hits;
    const continuing = active && this.active && sameSource;
    if (!continuing) {
      this.levels.fill(0);
      this.shimmer = 0;
    }
    if (!sameSource) {
      this.pulse = 0;
      this.pace = 1;
    }
    this.active = active;
    this.generation = frame?.generation;
    this.source = frame?.source;
    const sparkle = continuing && audio.hits[2] > this.hits[2];
    this.hits = rhythm?.hits;
    const bpm = rhythm?.bpm;
    const beat = this.clock.advance(dt, frame);
    this.pace = bpm ? ease(this.pace, clamp(bpm / 120, 0.55, 1.6), 2, dt) : 1;
    this.pulse = bpm ? (beat ? 1 : this.pulse * Math.exp(-6 * dt)) : 0;
    this.shimmer = sparkle ? 1 : this.shimmer * Math.exp(-5 * dt);

    if (audio) {
      for (let i = 0; i < KELP_COUNT; i++) {
        const value = Math.max(audio.bands[i * 2], audio.bands[i * 2 + 1]);
        this.levels[i] = ease(this.levels[i], value, value > this.levels[i] ? 18 : 7, dt);
      }
    }
  }
}

function makeRenderer(gl) {
  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(message);
    }
    return s;
  };
  const vertex = shader(gl.VERTEX_SHADER, `
    attribute vec3 aPosition, aNormal, aColor;
    uniform mat4 uView, uModel;
    uniform mediump float uTime;
    uniform vec2 uSway;
    varying vec3 vColor, vWorld, vNormal;
    void main() {
      vec3 local = aPosition;
      if (uSway.x > 0.) {
        // Higher points bend more, and the current takes longer to reach the tips.
        float phase = uTime * 1.8 + uSway.y - local.y * 2.6;
        float bend = uSway.x * local.y * local.y;
        local.x += bend * sin(phase);
        local.z += bend * .6 * cos(phase);
      }
      vec4 p = uModel * vec4(local, 1.);
      vColor = aColor; vWorld = p.xyz; vNormal = mat3(uModel) * aNormal;
      gl_Position = uView * p;
    }
  `);
  const fragment = shader(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform float uTime, uAlpha, uGlow, uCaustic;
    varying vec3 vColor, vWorld, vNormal;
    void main() {
      vec3 n = normalize(vNormal);
      float lamp = max(0., dot(n, normalize(vec3(-.42, .85, .38))));
      float rim = max(0., dot(n, normalize(vec3(.6, .28, -.8))));
      float web = sin(vWorld.x*4.3 + vWorld.z*2.9 + uTime*1.3) * sin(vWorld.z*4.8 - vWorld.x*1.6 - uTime);
      float caustic = pow(max(0., web), 3.) * uCaustic * max(0., n.y);
      vec3 color = vColor * (.54 + .46*lamp + .13*rim + uGlow) + vec3(.13,.29,.28)*caustic;
      color += vec3(.015,.036,.047)*(.65 + .35*rim);
      gl_FragColor = vec4(color, uAlpha);
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program); gl.deleteProgram(program); throw new Error(message);
  }
  const attrib = ['aPosition', 'aNormal', 'aColor'].map(name => gl.getAttribLocation(program, name));
  const [view, model, time, alpha, glow, caustic, swayUniform] = ['uView', 'uModel', 'uTime', 'uAlpha', 'uGlow', 'uCaustic', 'uSway']
    .map(name => gl.getUniformLocation(program, name));
  const buffers = [], still = identity();
  let bound, previousAlpha, previousGlow, previousCaustic, previousSway, previousPhase;
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0.021, 0.061, 0.093, 1);
  for (const index of attrib) gl.enableVertexAttribArray(index);
  return {
    upload(mesh) {
      const buffer = gl.createBuffer(); buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.data), gl.STATIC_DRAW);
      return { buffer, count: mesh.data.length / 9 };
    },
    begin(vp, seconds) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(view, false, vp); gl.uniform1f(time, seconds);
      bound = null;
    },
    transparent(enabled) {
      gl.depthMask(!enabled);
      if (enabled) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
    },
    draw(mesh, matrix = still, opacity = 1, light = 0, water = 0, sway = 0, phase = 0) {
      if (bound !== mesh) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
        for (let i = 0; i < attrib.length; i++) gl.vertexAttribPointer(attrib[i], 3, gl.FLOAT, false, 36, i * 12);
        bound = mesh;
      }
      if (opacity !== previousAlpha) gl.uniform1f(alpha, previousAlpha = opacity);
      if (light !== previousGlow) gl.uniform1f(glow, previousGlow = light);
      if (water !== previousCaustic) gl.uniform1f(caustic, previousCaustic = water);
      if (sway !== previousSway || phase !== previousPhase) {
        gl.uniform2f(swayUniform, sway, phase);
        previousSway = sway; previousPhase = phase;
      }
      gl.uniformMatrix4fv(model, false, matrix);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    },
    dispose() {
      for (const buffer of buffers) gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}

function randomizer(seed) {
  return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
}

function buildTank(upload) {
  const frame = new Mesh(), sand = new Mesh(), reef = new Mesh(), surfaces = new Mesh(), rays = new Mesh();
  const rand = randomizer(36031), w = WIDTH, d = DEPTH, h = SURFACE;
  frame.add(box(0, -0.46, 0, w * 2 + 0.28, 0.56, d * 2 + 0.28, '#133949'));
  frame.add(box(0, -0.19, 0, w * 2 + 0.38, 0.1, d * 2 + 0.38, '#3b7a83'));
  frame.add(box(0, -0.73, 0, w * 2 + 0.17, 0.1, d * 2 + 0.17, '#0d2a3c'));
  frame.add(box(0, -0.43, d + 0.144, 1.54, 0.115, 0.025, '#94e5cb'));
  for (const side of [-1, 1]) {
    frame.add(box(side * w, h / 2, d, 0.039, h, 0.04, '#61b6b5'));
    frame.add(box(side * w, h / 2, -d, 0.03, h, 0.03, '#3e888f'));
    frame.add(box(side * w, h, 0, 0.045, 0.052, d * 2, '#85d2c7'));
    frame.add(box(0, h, side * d, w * 2, 0.052, 0.045, '#85d2c7'));
    frame.add(box(side * w, 0, 0, 0.055, 0.08, d * 2, '#619d9a'));
    frame.add(box(0, 0, side * d, w * 2, 0.08, 0.055, '#619d9a'));
  }
  const sandColors = ['#c1bda0', '#b1b69e', '#bebfa1', '#afb99e', '#ccd0af', '#bdc7ad'];
  const nx = 17, nz = 10;
  const grid = Array.from({ length: nz + 1 }, (_, j) => Array.from({ length: nx + 1 }, (_, i) => [
    (i / nx * 2 - 1) * (w - 0.025) + (i === 0 || i === nx ? 0 : (rand() - 0.5) * 0.27),
    0.066 + rand() * 0.056,
    (j / nz * 2 - 1) * (d - 0.025) + (j === 0 || j === nz ? 0 : (rand() - 0.5) * 0.21),
  ]));
  const sandColor = () => sandColors[Math.floor(rand() * sandColors.length)];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = grid[j][i], b = grid[j + 1][i], c = grid[j + 1][i + 1], e = grid[j][i + 1];
    sand.triangle(a, b, c, sandColor()); sand.triangle(a, c, e, sandColor());
  }
  frame.add(box(0, -0.055, 0, w * 2 - 0.022, 0.22, d * 2 - 0.022, '#8a9b8e'));
  const rockColors = ['#345b69', '#517579', '#577b80', '#668784', '#7c9693'];
  const rocks = [[-3.85, -1.58, 0.9], [-3.95, 0.18, 0.56], [-3.08, -1.97, 0.55],
    [4.04, -1.73, 0.79], [3.48, -1.86, 0.63], [4.24, 0.21, 0.63], [2.98, 0.92, 0.38],
    [-1.96, 1.68, 0.35], [-2.5, 1.49, 0.28], [0.78, -1.95, 0.4]];
  for (const [x, z, r] of rocks) {
    reef.add(oval(x, r * 0.48, z, r, r * 0.74, r * 0.65, rockColors[Math.floor(rand() * rockColors.length)], 6, 3));
  }
  for (let i = 0; i < 66; i++) {
    const x = (rand() - 0.5) * 9.65, z = (rand() - 0.5) * 4.72, r = 0.025 + rand() * 0.082;
    reef.add(oval(x, 0.095, z, r, r * 0.55, r * 0.82, rockColors[Math.floor(rand() * rockColors.length)], 5, 2));
  }
  for (const [x, z, size, color] of [[-3.75, -1.41, 0.9, '#ec8b96'], [-4.29, 0.08, 0.63, '#fcad93'],
    [3.7, -1.49, 0.81, '#aa9be1'], [4.13, 0.27, 0.52, '#f4a3aa'], [2.95, 0.86, 0.37, '#fdc39f']]) {
    const y = 0.36, center = [x, y + size * 0.59, z];
    reef.add(branch([x, 0.1, z], center, size * 0.17, size * 0.095, color));
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5, tip = [x + Math.cos(a) * size * 0.41, y + size * (0.88 + rand() * 0.43), z + Math.sin(a) * size * 0.43];
      reef.add(branch(center, tip, size * 0.088, size * 0.045, color));
      if (k % 2 === 0) reef.add(branch(tip, [tip[0] + 0.08, tip[1] + size * 0.25, tip[2] - 0.1], size * 0.046, size * 0.015, color));
    }
  }
  const stars = starfish();
  for (const [x, z, yaw, scale] of [[-2.74, 2.01, 0.3, 0.73], [2.48, 1.83, 1, 0.62], [0.45, 1.58, 2.3, 0.48]]) {
    reef.add(stars, transform(x, 0.14, z, yaw, scale));
  }
  // Only the three faces toward the camera are tinted; the inside stays readable.
  const edge = h - 0.15;
  surfaces.quad([-w, 0, d], [w, 0, d], [w, edge, d], [-w, edge, d], '#4fa6b2');
  surfaces.quad([w, 0, d], [w, 0, -d], [w, edge, -d], [w, edge, d], '#3b8fa1');
  surfaces.quad([-w, edge, -d], [-w, edge, d], [w, edge, d], [w, edge, -d], '#65c9cb');
  const glints = new Mesh();
  for (let i = 0; i < 19; i++) {
    const x = (rand() - 0.5) * 9.5, z = (rand() - 0.5) * 4.65, span = 0.3 + rand() * 0.69;
    glints.triangle([x, edge + 0.012, z], [x + span * 0.79, edge + 0.012, z - 0.025], [x + span, edge + 0.012, z + 0.032], '#a9f2e3');
  }
  for (const [x, z, size] of [[-3.5, -1.9, 1.7], [-1.8, -1.3, 1.15], [0.45, -2.06, 1.9], [2.25, -1.25, 1.3]]) {
    rays.triangle([x, edge, z], [x + 0.13, edge, z + 0.15], [x + size, 0.18, z + 1.8], '#8aece0');
    rays.triangle([x + 0.13, edge, z + 0.15], [x + size + 0.61, 0.18, z + 1.9], [x + size, 0.18, z + 1.8], '#89e4e8');
  }
  const pedestalShadow = new Mesh();
  for (let i = 12; i >= 1; i--) {
    const ring = i / 12;
    pedestalShadow.add(oval(0.12, -0.84 - i * 0.002, 0.24, 6.85 * ring, 0.005, 3.3 * ring,
      i > 10 ? '#061722' : i > 8 ? '#081b29' : i > 6 ? '#0a2030' : '#0b2434', 24, 2));
  }
  return Object.fromEntries(Object.entries({ frame, sand, reef, surfaces, rays, glints, pedestalShadow }).map(([key, mesh]) => [key, upload(mesh)]));
}

function kelpMesh() {
  const m = new Mesh();
  let previous = [0, 0, 0];
  for (let i = 1; i <= 6; i++) {
    const a = i * 0.62, side = i % 2 ? 1 : -1;
    const tip = [Math.sin(a) * 0.22, i * 0.44, Math.sin(a * 1.8) * 0.13];
    m.add(branch(previous, tip, 0.05 - i * 0.005, 0.048 - i * 0.005, '#469d82', 4));
    const ridge = [tip[0] + side * 0.31, tip[1] + 0.17, tip[2] + 0.05];
    const end = [tip[0] + side * (0.72 - i * 0.055), tip[1] + 0.45, tip[2] + 0.22];
    m.triangle(tip, ridge, end, '#68c29b');
    m.triangle(tip, end, [ridge[0], ridge[1] - 0.13, ridge[2] + 0.19], '#399d84');
    previous = tip;
  }
  return m;
}

function spectrumKelpMesh(index) {
  const mesh = new Mesh();
  const [stem, blade] = KELP_COLORS[Math.floor(index * KELP_COLORS.length / KELP_COUNT)];
  let root = [0, 0, 0];
  for (let node = 1; node <= 6; node++) {
    const height = node * 0.147;
    const side = (index + node) % 2 === 0 ? 1 : -1;
    const base = [Math.sin(node * 0.83 + index) * height * 0.075, height, Math.cos(node * 0.7) * height * 0.065];
    const stemWidth = 0.025 - node * 0.0027;
    mesh.add(branch(root, base, stemWidth + 0.003, stemWidth, stem, 4));
    root = base;

    // A raised vein and two planes give each ribbon a fold without smoothing the facets.
    const [x, y, z] = base;
    const reach = side * (0.29 - height * 0.14 + 0.027 * Math.sin(index + node));
    const tip = [x + reach, y + 0.20, z - 0.11];
    const vein = [x + reach * 0.65, y + 0.095, z + 0.028];
    const high = [x + reach * 0.51, y + 0.16, z - 0.016];
    const low = [x + reach * 0.73, y + 0.035, z - 0.032];
    mesh.triangle(base, high, vein, blade);
    mesh.triangle(high, tip, vein, blade);
    mesh.triangle(base, vein, low, stem);
    mesh.triangle(low, vein, tip, stem);
  }
  return mesh;
}

function caption(canvas) {
  const node = document.createElement('aside');
  node.className = 'aquarium-caption';
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = `<p class="aquarium-kicker"><span></span>03 / LIVING SPECTRUM</p>
    <p class="aquarium-title">Tidal <em>Garden</em></p>
    <p class="aquarium-note">A little ocean, moved by music.</p>
    <p class="aquarium-key"><span></span> BASS <b>→</b> TREBLE</p>`;
  canvas.after(node);
  return node;
}

export function createAquarium(canvas) {
  const label = caption(canvas);
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: true });
  if (!gl) {
    label.classList.add('aquarium-unavailable');
    label.querySelector('.aquarium-note').textContent = '3D graphics are unavailable in this browser.';
    return { resize() {}, render() {}, dispose: () => label.remove() };
  }

  const signal = new AquariumSignal(), rand = randomizer(12914);
  const kelp = [[-4.33, -2.02, 1.12], [-3.68, -2.22, 0.89], [-4.63, -1.14, 0.73],
    [4.55, -1.96, 0.96], [3.85, -2.19, 0.72], [4.61, -0.61, 0.62]];
  const bubbles = Array.from({ length: 45 }, (_, i) => ({
    x: [-4.27, 3.86, -1.3][i % 3] + (rand() - 0.5) * 0.62,
    z: [-1.27, -0.97, -2][i % 3] + (rand() - 0.5) * 0.46,
    y: rand() * 4.55 + 0.2, size: 0.035 + rand() * 0.065, drift: 0.3 + rand() * 0.34,
  }));
  const swimmers = [
    ['clown', 2.2, 1.33, 0.42, 0.92, -1.18], ['clown', 2.7, 1.7, 1.45, 0.74, -0.46],
    ['clown', 2.4, 1.58, 3.24, 0.68, 0.2], ['tang', 3.64, 1.23, 1.75, 0.81, 0],
    ['tang', 3.37, 1.23, 4.4, 0.70, 0.1],
  ];
  const spectrumKelp = Array.from({ length: KELP_COUNT }, (_, i) => ({
    x: (i - (KELP_COUNT - 1) / 2) * 0.49,
    height: 0.62 + rand() * 0.22,
    yaw: (rand() - 0.5) * 0.65,
  }));
  let renderer, tank, models, aspect, viewHeight, idleViewHeight, offsetX, offsetY, portraitScale;
  let layoutWidth, layoutHeight, t = 0, swim = 0, finClock = 0, bubbleClock = 0;
  let lost = false;
  function initialize() {
    renderer = makeRenderer(gl);
    const upload = renderer.upload;
    tank = buildTank(upload);
    const parts = creature => Object.fromEntries(Object.entries(creature).map(([key, mesh]) => [key, upload(mesh)]));
    models = { clown: parts(fish('clown')), tang: parts(fish('tang')), shoal: parts(fish('shoal')),
      turtle: parts(turtle()), ray: parts(ray()), jelly: upload(jelly()), crab: upload(crab()), kelp: upload(kelpMesh()),
      spectrumKelp: spectrumKelp.map((_, i) => upload(spectrumKelpMesh(i))),
      tentacle: upload(branch([0, 0, 0], [0, -1, 0], 0.018, 0.008, '#c6a4e7', 4)),
      bubble: upload(oval(0, 0, 0, 1, 1, 1, '#ace7ed', 5, 2)) };
  }
  initialize();
  const contextLost = event => { event.preventDefault(); lost = true; };
  const contextRestored = () => { initialize(); lost = false; };
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);

  function resize(width, height) {
    if (!width || !height || width === layoutWidth && height === layoutHeight) return;
    layoutWidth = width; layoutHeight = height;
    aspect = width / height;
    const wide = aspect >= 1.52 && width >= 900;
    const portrait = aspect < 0.82;
    label.classList.toggle('aquarium-wide', wide);
    const resolution = Math.min(window.devicePixelRatio || 1, 1.5, 1728 / Math.max(width, height));
    canvas.width = Math.round(width * resolution); canvas.height = Math.round(height * resolution);
    portraitScale = portrait ? 0.77 : 1;
    viewHeight = Math.max(wide ? 9.8 : 10.3, (wide ? 17.5 : portrait ? 9.92 : 12.2) / aspect);
    idleViewHeight = Math.max(9.45, (portrait ? 9.65 : 11.7) / aspect);
    offsetX = wide ? -0.29 : 0;
    offsetY = wide ? 0.035 : portrait ? -0.02 : -0.13;
  }

  function render(dt, frame, presentation = 0) {
    if (!viewHeight || lost) return;
    signal.advance(dt, frame);
    t += dt; swim += dt * signal.pace; finClock += dt * signal.pace * TAU * 2;
    const density = clamp(frame?.density ?? 0.65);
    const pulse = signal.pulse, highs = signal.shimmer;
    bubbleClock += dt * (1 + signal.levels[KELP_COUNT - 1] * 0.9 + highs * 0.65);
    const yaw = 0.55 + 0.065 * Math.sin(t * 0.19);
    const height = viewHeight + (idleViewHeight - viewHeight) * presentation;
    let view = cameraMatrix([15.5 * Math.sin(yaw), 8.05, 15.5 * Math.cos(yaw)], [0, 2.2, 0], height * aspect, height);
    if (portraitScale < 1) view = multiply(view, transform(0, 0, 0, 0, portraitScale, 1.13, 0.89));
    view[12] += offsetX * (1 - presentation);
    view[13] += offsetY * (1 - presentation);
    renderer.begin(view, t % 900);
    const draw = renderer.draw;
    draw(tank.pedestalShadow); draw(tank.frame); draw(tank.sand, undefined, 1, 0, 0.55 + pulse * 0.37); draw(tank.reef);
    for (let i = 0; i < kelp.length; i++) {
      const [x, z, size] = kelp[i];
      draw(models.kelp, transform(x, 0.12, z, i * 1.25 + 0.27 * Math.sin(t * 0.9 + i), size, size * (1 + pulse * 0.07), size,
        0.06 * Math.sin(t * 0.95 + i)));
    }
    for (let i = 0; i < spectrumKelp.length; i++) {
      const { x, height, yaw } = spectrumKelp[i];
      const energy = signal.levels[i] ** 0.73;
      draw(models.spectrumKelp[i], transform(x, 0.10, -1.04, yaw, 1, height + energy * 1.32, 1),
        1, energy * 0.32, 0, 0.20 + energy * 0.14, i * -0.43);
    }

    function drawFish(kind, x, y, z, heading, size, phase) {
      const m = models[kind], wag = Math.sin(finClock + phase) * (0.31 + pulse * 0.31);
      const root = transform(x, y, z, heading + wag * 0.17, size, size, size, wag * 0.11);
      draw(m.body, root); draw(m.tail, multiply(root, transform(-0.62, 0, 0, wag)));
    }
    for (let i = 0; i < swimmers.length; i++) {
      const [kind, rx, rz, phase, size, center] = swimmers[i];
      const a = swim * (kind === 'tang' ? 0.49 : 0.61) + phase;
      drawFish(kind, center + rx * Math.cos(a), 1.72 + i * 0.31 + 0.33 * Math.sin(a * 1.4 + i) + pulse * 0.105,
        rz * Math.sin(a), Math.atan2(-rz * Math.cos(a), -rx * Math.sin(a)), size, phase);
    }
    const shoalCount = 6 + Math.round(density * 12), school = swim * 0.66 + 1.18;
    for (let i = 0; i < shoalCount; i++) {
      const a = school - i * 0.058, row = i % 3;
      const x = 3.4 * Math.cos(a) + (row - 1) * 0.21;
      const z = 1.4 * Math.sin(a) + (row - 1) * 0.24;
      drawFish('shoal', x, 3.84 + Math.sin(a * 1.9) * 0.25 - row * 0.21 + pulse * 0.15,
        z, Math.atan2(-1.4 * Math.cos(a), -3.4 * Math.sin(a)), 0.26 + (i % 4) * 0.019, i * 0.34);
    }

    const flaps = (mesh, root, amount) => {
      for (const side of [-1, 1]) {
        const hinge = identity(), a = amount * side;
        hinge[5] = Math.cos(a); hinge[6] = Math.sin(a); hinge[9] = -Math.sin(a) * side; hinge[10] = Math.cos(a) * side;
        draw(mesh, multiply(root, hinge));
      }
    };
    let a = swim * 0.28 + 0.46;
    let root = transform(2.72 * Math.cos(a), 2.8 + 0.32 * Math.sin(a * 1.31) + pulse * 0.11, 1.32 * Math.sin(a),
      Math.atan2(-1.32 * Math.cos(a), -2.72 * Math.sin(a)), 0.94);
    draw(models.turtle.body, root);
    flaps(models.turtle.flipper, root, 0.36 * Math.sin(finClock * 0.5 + 0.5) + pulse * 0.32);
    a = swim * 0.34 + 2.41;
    root = transform(2.56 * Math.cos(a), 0.9 + 0.22 * Math.sin(a * 2) + pulse * 0.12, 0.96 * Math.sin(a),
      Math.atan2(-0.96 * Math.cos(a), -2.56 * Math.sin(a)), 0.83);
    draw(models.ray.body, root);
    flaps(models.ray.wing, root, 0.38 * Math.sin(finClock * 0.5 + 1.7) + pulse * 0.24);
    draw(models.crab, transform(1.78 + Math.sin(t * 0.62) * 0.71, 0.11 + 0.026 * Math.abs(Math.sin(t * 12)), 1.88, -0.28 + 0.19 * Math.sin(t * 0.65), 0.83));
    draw(models.crab, transform(-3.48 + Math.sin(t * 0.47) * 0.48, 0.12, 1.02, 0.42, 0.61));

    renderer.transparent(true);
    draw(tank.rays, undefined, 0.083 + pulse * 0.055, 0.42);
    for (let i = 0; i < 3; i++) {
      const x = 3.19 + (i - 1) * 0.86 + Math.sin(t * 0.41 + i) * 0.32;
      const y = 2.58 + (i % 2) * 0.67 + Math.sin(t * 0.73 + i * 2) * 0.25 + pulse * 0.19;
      const z = -1.47 + (i % 2) * 0.68 + Math.cos(t * 0.51 + i) * 0.32;
      const size = [0.89, 0.72, 0.63][i], contract = pulse * 0.18 + 0.045 * Math.sin(finClock * 0.5 + i);
      draw(models.jelly, transform(x, y, z, t * 0.19 + i, size * (1 - contract), size * (1 + contract), size * (1 - contract)), 0.92, 0.17 + highs * 0.17);
      for (let j = 0; j < 7; j++) {
        const angle = j * TAU / 7 + t * 0.19 + i, radius = size * (1 - contract) * 0.36;
        const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
        const roll = Math.sin(t * 1.22 + j * 0.75 + i) * 0.19;
        const length = size * (0.63 + (j % 3) * 0.13);
        draw(models.tentacle, transform(px, y - size * 0.06, pz, angle, size, length, size, roll), 0.7, 0.15);
      }
    }
    const bubbleCount = 14 + Math.round(density * 18 + highs * 13);
    for (let i = 0; i < bubbleCount; i++) {
      const { x, y, z, size, drift } = bubbles[i];
      const rise = (y + bubbleClock * drift) % (SURFACE - 0.45) + 0.18;
      draw(models.bubble, transform(x + 0.14 * Math.sin(rise * 2.1 + i), rise, z + 0.09 * Math.cos(rise + i), i, size),
        (0.42 + highs * 0.25) * Math.min(1, rise * 2, (SURFACE - rise) * 2.5), 0.53);
    }
    draw(tank.surfaces, undefined, 0.145, 0.33);
    draw(tank.glints, undefined, 0.52 + pulse * 0.24, 0.48);
    renderer.transparent(false);
  }

  return { resize, render, dispose() {
    label.remove();
    canvas.removeEventListener('webglcontextlost', contextLost);
    canvas.removeEventListener('webglcontextrestored', contextRestored);
    if (!lost) renderer.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } };
}
