import { BeatClock } from './beat-clock.mjs';
import { cameraMatrix, identity, multiply, transform } from './aquarium-geometry.mjs';
import { buildSignalDesk, OPERATOR_X, OPERATOR_Z, OPERATOR_YAW } from './signal-desk-model.mjs';
import { BINS, COLUMNS, SCREEN_INTERVAL, PALETTES, createDeskScreens } from './signal-desk-screens.mjs';

const BANDS_PER_HAND = BINS / 2;
const clamp = v => Math.max(0, Math.min(1, v));
const ease = (value, target, speed, dt) => target + (value - target) * Math.exp(-speed * dt);
const origin = identity();
const operatorRoot = transform(OPERATOR_X, 0, OPERATOR_Z, OPERATOR_YAW);

export class SignalDeskAudio {
  clock = new BeatClock();
  palette = 0;
  pulse = 0;
  history = new Float32Array(COLUMNS * BINS);
  column = 0;
  levels = new Float32Array(BINS);
  hands = Array.from({ length: 2 }, () => ({ pitch: .5, strength: 0 }));
  #peaks = new Float32Array(BINS);
  #sampleAge = 0;
  #generation;
  #source;
  #status;

  advance(dt, frame) {
    const status = frame?.status;
    const changed = frame?.generation !== this.#generation || frame?.source !== this.#source ||
      (!frame && this.#status !== undefined);
    this.#generation = frame?.generation;
    this.#source = frame?.source;
    this.#status = status;
    if (changed) {
      this.palette = 0;
      this.pulse = 0;
      this.history.fill(0);
      this.levels.fill(0);
      this.#peaks.fill(0);
      this.#sampleAge = 0;
      this.column = 0;
      for (const hand of this.hands) { hand.strength = 0; hand.pitch = .5; }
    }
    const beat = this.clock.advance(dt, frame);
    if (beat && this.clock.beats > 1 && (this.clock.beats - 1) % 8 === 0) {
      this.palette = (this.palette + 1) % PALETTES.length;
    }
    this.pulse = beat ? 1 : this.pulse * Math.exp(-7 * dt);

    const live = status === 'demo' || status === 'live' ? frame.spectrum.bands : null;
    for (let i = 0; i < BINS; i++) {
      const amount = live?.[i] ?? 0;
      this.levels[i] = ease(this.levels[i], amount, amount > this.levels[i] ? 34 : 13, dt);
      this.#peaks[i] = Math.max(this.#peaks[i], amount);
    }
    for (const [side, hand] of this.hands.entries()) {
      let peak = 0, weight = 0, weightedPitch = 0;
      for (let i = 0; i < BANDS_PER_HAND; i++) {
        const value = this.levels[side * BANDS_PER_HAND + i];
        const importance = value ** 4;
        peak = Math.max(peak, value);
        weight += importance;
        weightedPitch += i * importance;
      }
      hand.strength = ease(hand.strength, clamp((peak - .015) * 1.24), 25, dt);
      hand.pitch = ease(hand.pitch, weight > .00001 ? weightedPitch / weight / (BANDS_PER_HAND - 1) : .5, 16, dt);
    }
    this.#sampleAge += dt;
    const sample = this.#sampleAge >= SCREEN_INTERVAL;
    if (sample) {
      this.#sampleAge %= SCREEN_INTERVAL;
      if (live || status === 'quiet') {
        this.history.set(this.#peaks, this.column * BINS);
        this.column = (this.column + 1) % COLUMNS;
        this.#peaks.fill(0);
      }
    }
    return changed || sample || beat;
  }
}

function makeRenderer(gl) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, `
    attribute vec3 aPosition, aNormal, aColor;
    uniform mat4 uView, uModel;
    varying vec3 vWorld, vLocal, vNormal, vColor;
    void main() {
      vec4 world = uModel * vec4(aPosition, 1.);
      gl_Position = uView * world;
      vWorld = world.xyz;
      vLocal = aPosition;
      vColor = aColor;
      vNormal = mat3(uModel) * aNormal;
    }
  `);
  const fragment = compile(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec3 uPrimary, uSecondary, uEye, uDark, uTint;
    uniform float uMode, uLight, uOpacity, uPulse;
    uniform vec4 uScreen;
    uniform sampler2D uAtlas;
    varying vec3 vWorld, vLocal, vNormal, vColor;
    void main() {
      vec3 color;
      if (uMode == 4.) {
        vec2 haze = (vWorld.xy - vec2(-1.5, 3.2)) / vec2(8.9, 5.9);
        float ambient = exp(-dot(haze, haze));
        color = uDark * (.40 + .60 * ambient) + uSecondary * (.057 * ambient);
      } else if (uMode == 3.) {
        vec2 pos = vWorld.xz;
        float distanceToEye = length(pos - uEye.xz);
        vec2 cell = abs(fract(pos * 1.24 + .5) - .5);
        float grid = 1. - smoothstep(.003, .029 + distanceToEye * .0011, min(cell.x, cell.y));
        vec2 coarse = abs(fract(pos * .31 + .5) - .5);
        float major = 1. - smoothstep(.003, .012, min(coarse.x, coarse.y));
        float pool = exp(-.19 * dot(pos - vec2(-.55,.52), pos - vec2(-.55,.52)));
        float contact = exp(-5. * dot(pos - vec2(1.23,.56), pos - vec2(1.23,.56)));
        float fog = 1. - smoothstep(6., 24., distanceToEye);
        color = uDark + (vec3(.017,.022,.027) + uPrimary *
          (.115 * pool * (1. + uPulse * .18) + .094 * grid + .052 * major)) * fog;
        color *= 1. - .52 * contact;
      } else if (uMode == 2.) {
        vec2 uv = vLocal.xy / uScreen.xy;
        uv *= 1. + .065 * dot(uv, uv);
        vec2 texel = uScreen.zw + (clamp(uv + .5, .006, .994) * .986 + .007) / vec2(3., 2.);
        color = texture2D(uAtlas, texel).rgb;
        float scan = .89 + .11 * sin(uv.y * 383.);
        float edge = 1. - smoothstep(.34, .73, length(uv));
        float reflection = exp(-20. * abs(uv.y + uv.x * .55 - .34));
        color = color * scan * (.48 + .58 * edge) + vec3(.030,.052,.054) * reflection;
      } else if (uMode == 1.) {
        color = uTint * uLight * vColor.r;
      } else {
        vec3 normal = normalize(vNormal);
        vec3 view = normalize(uEye - vWorld);
        vec3 lamp = normalize(vec3(-.49,.80,.59));
        float diffuse = max(0., dot(normal, lamp));
        float kicker = max(0., dot(normal, normalize(vec3(.64,.36,-.86))));
        float spec = pow(max(0., dot(normal, normalize(view + lamp))), 16.);
        float fresnel = pow(1. - max(0., dot(normal, view)), 3.);
        color = vColor * (.31 + .70 * diffuse) + vec3(.035,.048,.054);
        color += uPrimary * (.19 * kicker + .063 * fresnel) + uSecondary * (.11 * spec + .035 * diffuse);
      }
      gl_FragColor = vec4(color, uOpacity);
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(message);
  }
  const attributes = ['aPosition', 'aNormal', 'aColor'].map(name => gl.getAttribLocation(program, name));
  const uniforms = Object.fromEntries(
    ['View', 'Model', 'Primary', 'Secondary', 'Eye', 'Dark', 'Tint', 'Mode', 'Light', 'Opacity', 'Pulse', 'Screen', 'Atlas']
      .map(name => [name, gl.getUniformLocation(program, 'u' + name)]),
  );
  const buffers = [];
  let bound;
  const texture = gl.createTexture();
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const location of attributes) gl.enableVertexAttribArray(location);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.uniform1i(uniforms.Atlas, 0);
  return {
    upload(mesh) {
      const buffer = gl.createBuffer();
      buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.data), gl.STATIC_DRAW);
      return { buffer, count: mesh.data.length / 9 };
    },
    paint(atlas) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    },
    begin(view, eye, colors, pulse) {
      const dark = colors.primary.map((value, i) => [.010, .014, .021][i] + value * .019);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(...dark, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(uniforms.View, false, view);
      gl.uniform3fv(uniforms.Primary, colors.primary);
      gl.uniform3fv(uniforms.Secondary, colors.secondary);
      gl.uniform3fv(uniforms.Eye, eye);
      gl.uniform3fv(uniforms.Dark, dark);
      gl.uniform1f(uniforms.Pulse, pulse);
    },
    draw(mesh, model = origin, mode = 0, tint = null, light = 1, opacity = 1) {
      if (bound !== mesh) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
        attributes.forEach((location, i) => gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 36, i * 12));
        bound = mesh;
      }
      gl.uniformMatrix4fv(uniforms.Model, false, model);
      gl.uniform1f(uniforms.Mode, mode);
      gl.uniform1f(uniforms.Opacity, opacity);
      if (tint) {
        gl.uniform3fv(uniforms.Tint, tint);
        gl.uniform1f(uniforms.Light, light);
      }
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    },
    glass(mesh, model, w, h, index) {
      gl.uniform4f(uniforms.Screen, w, h, (index % 3) / 3, (1 - Math.floor(index / 3)) / 2);
      this.draw(mesh, model, 2);
    },
    glow(enabled) {
      gl.depthMask(!enabled);
      if (enabled) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.enable(gl.BLEND);
      } else {
        gl.disable(gl.BLEND);
      }
    },
    dispose() {
      for (const buffer of buffers) gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
    },
  };
}

// Aim the local Y axis of a tapered limb at the next joint.
function segment(a, b) {
  const d = b.map((v, i) => v - a[i]);
  const length = Math.hypot(...d);
  const [x, y, z] = d.map(v => v / length);
  const horizontal = Math.hypot(z, x);
  const tx = horizontal > .0001 ? z / horizontal : 1;
  const tz = horizontal > .0001 ? -x / horizontal : 0;
  return new Float32Array([tx, 0, tz, 0, ...d, 0, -tz * y, tz * x - tx * z, tx * y, 0, ...a, 1]);
}

function drawOperator(draw, operator, signal, colors, time, reducedMotion) {
  const { seat, clothes, accents, head, headset, upper, sleeve, seam, elbow, palm, knuckles, finger } = operator;
  draw(seat, operatorRoot);
  draw(clothes, operatorRoot);
  draw(accents, operatorRoot, 1, colors.primary, .70 + signal.pulse * .19);
  const [low, high] = signal.hands;
  const headYaw = .20 + .15 * (high.strength - low.strength);
  const nod = reducedMotion ? 0 : -.056 * signal.pulse;
  const helmet = multiply(operatorRoot, transform(0, 2.65 + nod, .13, headYaw, 1, 1, 1, nod));
  draw(head, helmet);
  draw(headset, helmet, 1, colors.primary, .93 + signal.pulse * .12);

  for (const [i, { pitch, strength }] of signal.hands.entries()) {
    const side = i * 2 - 1;
    const tint = i ? colors.secondary : colors.primary;
    const motion = strength * (reducedMotion ? .64 : 1);
    const shift = (pitch - .5) * .50 * motion;
    const wrist = [.343 * side + shift, 1.803 + motion * (.31 + .039 * Math.sin(time * 13 + side)), 1.10 + motion * (.14 - pitch * .21)];
    const shoulder = [side * .395, 2.026, .116];
    const joint = [side * .494 + shift * .42, 1.734 + motion * .19, .516];
    const cuff = joint.map((value, axis) => value + (wrist[axis] - value) * .84);
    draw(upper, multiply(operatorRoot, segment(shoulder, joint)));
    draw(elbow, multiply(operatorRoot, transform(...joint)));
    draw(sleeve, multiply(operatorRoot, segment(joint, wrist)));
    draw(seam, multiply(operatorRoot, segment(cuff, wrist)), 1, tint, .53 + motion * .37);
    const hand = multiply(operatorRoot, transform(...wrist, shift * 1.4));
    draw(palm, hand);
    draw(knuckles, hand, 1, tint, .48 + strength * .40);

    for (let f = 0; f < 4; f++) {
      const x = (f - 1.5) * .043;
      const startBand = i * BANDS_PER_HAND + f * 4;
      const press = Math.max(...signal.levels.subarray(startBand, startBand + 4));
      const extension = [0.060, .087, .079, .051][f];
      const curl = press * (.064 + .037 * Math.sin(time * 19 + f * 1.8));
      const base = [x, .015, .115], middle = [x * 1.2, .013 - curl * .44, .171];
      const tip = [x * 1.38, -.049 - curl, .163 + extension - curl * .47];
      draw(finger, multiply(hand, segment(base, middle)));
      draw(finger, multiply(hand, segment(middle, tip)));
    }
    draw(finger, multiply(hand, segment([-side * .072, -.006, .048], [-side * .133, -.047, .153])));
  }
}

export function createSignalDesk(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const notice = document.createElement('p');
  notice.className = 'signal-desk-notice';
  notice.textContent = 'Signal Desk requires WebGL.';
  notice.hidden = true;
  canvas.after(notice);
  if (!gl) {
    notice.hidden = false;
    return { resize() {}, render() {}, dispose() { notice.remove(); } };
  }
  const screens = createDeskScreens();
  const signal = new SignalDeskAudio();
  let aspect = 0, time = 0, models, renderer, refresh = true;

  function initialize() {
    try {
      renderer = makeRenderer(gl);
      const { operator, screens: displays, ...set } = buildSignalDesk();
      const upload = renderer.upload;
      const scene = Object.fromEntries(Object.entries(set).map(([name, mesh]) => [name, upload(mesh)]));
      models = { ...scene,
        operator: Object.fromEntries(Object.entries(operator).map(([name, mesh]) => [name, upload(mesh)])),
        displays: displays.map(({ body, trim, glass, ...screen }) => ({ ...screen, body: upload(body), trim: upload(trim), glass: upload(glass) })),
      };
      notice.hidden = true;
      refresh = true;
    } catch (error) {
      renderer?.dispose();
      renderer = null;
      notice.textContent = 'Signal Desk could not start the 3D display.';
      notice.hidden = false;
      console.error(error);
    }
  }
  function lost(event) {
    event.preventDefault();
    renderer = null;
    notice.textContent = 'The 3D display is reconnecting.';
    notice.hidden = false;
  }
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', initialize);
  initialize();

  return {
    resize(width, height) {
      aspect = width / Math.max(1, height);
      const resolution = Math.min(window.devicePixelRatio || 1, 1.6, 1800 / Math.max(1, width, height));
      canvas.width = Math.max(1, Math.round(width * resolution));
      canvas.height = Math.max(1, Math.round(height * resolution));
    },
    render(dt, frame, presentation = 1) {
      const dirty = signal.advance(dt, frame);
      time += dt;
      if (!renderer || !aspect) return;
      if (dirty || refresh) {
        screens.paint(signal, time);
        renderer.paint(screens.atlas);
        refresh = false;
      }
      const colors = PALETTES[signal.palette];
      const yaw = -.042 + (reducedMotion.matches ? 0 : .13 * Math.sin(time * .29));
      const portrait = aspect < .88;
      const distance = 10.9;
      const subject = [portrait ? -.88 : -.50, portrait ? 2.30 - .76 * (1 - presentation) : 2.25, .04];
      const eye = [subject[0] + distance * Math.sin(yaw), 4.68, distance * Math.cos(yaw)];
      const height = Math.max(5.90, (portrait ? 5.95 : 7.82) / aspect) + (1 - presentation) * (portrait ? .63 : .27);
      const view = cameraMatrix(eye, subject, height * aspect, height, true);
      renderer.begin(view, eye, colors, signal.pulse);
      const { draw } = renderer;
      draw(models.backdrop, origin, 4);
      draw(models.floor, origin, 3);
      draw(models.frame, origin, 1, colors.secondary, .24);
      draw(models.wiring, origin, 1, colors.secondary, .34);
      draw(models.rings, origin, 1, colors.primary, .86 + .20 * signal.pulse);
      draw(models.furniture);
      draw(models.stands);
      draw(models.keys);
      draw(models.trim, origin, 1, colors.primary, .74);
      for (const [i, { x, y, z, yaw, roll, float, body, trim, glass, displayWidth, displayHeight }] of models.displays.entries()) {
        const hover = float && !reducedMotion.matches ? .035 * Math.sin(time * .94 + i) : 0;
        const model = transform(x, y + hover, z, yaw, 1, 1, 1, roll);
        draw(body, model);
        draw(trim, model, 1, i === 2 || i === 5 ? colors.secondary : colors.primary, .51 + signal.pulse * .16);
        renderer.glass(glass, model, displayWidth, displayHeight, i);
      }
      drawOperator(draw, models.operator, signal, colors, time, reducedMotion.matches);
      renderer.glow(true);
      draw(models.halos, origin, 1, colors.primary, .85, .15 + signal.pulse * .14 + clamp(frame?.density ?? .65) * .13);
      renderer.glow(false);
    },
    dispose() {
      notice.remove();
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', initialize);
      renderer?.dispose();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
