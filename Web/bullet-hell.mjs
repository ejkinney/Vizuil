import {
  CARRIER_PANEL, Flight, layoutFor, PITCH_BINS, PITCH_FLOOR, pitchFamily, pitchRowY,
  projectileY, TICKS_PER_SECOND,
} from './flight.mjs';
import { BeatClock } from './beat-clock.mjs';

const SHOT_PALETTES = [
  ['#095998', '#1b8cca', '#42deff', '#d6ffff'],
  ['#624098', '#9a62e5', '#cf98ff', '#f9e8ff'],
  ['#935035', '#e6774c', '#ffc466', '#fff6c2'],
];
const NO_HITS = [false, false, false];
const PANEL_DARK = '#0b1324';
const BEACON_PULSE_SECONDS = 0.24;

function seeded(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function surface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function poly(ctx, color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  ctx.fill();
}

function stripe(ctx, color, x, y, w, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function ridge(height, waterline, seed, far) {
  const tile = surface(512, height);
  const ctx = tile.getContext('2d');
  const random = seeded(seed);
  const teeth = Array.from({ length: 15 }, (_, i) => ({
    x: i * 512 / 15 + random() * 18,
    tall: (far ? 0.14 : 0.25) + random() * (far ? 0.19 : 0.33),
    width: 14 + random() * 31,
  }));
  const colors = far ? ['#484967', '#5d536d', '#766279', '#947984'] : ['#1e3047', '#293c54', '#36465b', '#4b5464'];
  const base = waterline + (far ? -4 : 5);
  const heights = [];
  for (let x = 0; x < 512; x += 2) {
    let face = 0, form = 0;
    for (const tooth of teeth) {
      const distance = Math.abs(((x - tooth.x + 768) % 512) - 256);
      const peak = tooth.tall * Math.max(0, 1 - (distance / tooth.width) ** (far ? 1.3 : 0.57));
      if (peak > form) { form = peak; face = x >= tooth.x ? 1 : 0; }
    }
    const y = Math.round(base - height * form * (far ? 0.8 : 0.7) - (Math.sin(x * Math.PI / 64) + 1) * 4);
    heights[x] = y;
    stripe(ctx, colors[face], x, y, 2, base - y);
    stripe(ctx, colors[face + 2], x, y + 1, 2, 1);
    if (x % 6 !== 0) continue;
    const cut = (base - y) * random();
    stripe(ctx, colors[face + 1], x, y + cut, 2, Math.min(base - y - cut, 5 + random() * 21));
  }
  for (let i = 0; i < 170; i++) {
    const x = Math.floor(random() * 256) * 2;
    const y = heights[x] + (base - heights[x]) * (0.1 + 0.9 * random());
    stripe(ctx, colors[random() > 0.38 ? 0 : 2], x, y, 1 + (i % 3), 1 + (i % 2));
  }
  return tile;
}

class Canyon {
  constructor(layout) {
    this.layout = layout;
    const { width, height, portrait } = layout;
    this.waterline = Math.round(height * (portrait ? 0.54 : 0.61));
    this.sunX = width * (portrait ? 0.52 : 0.59);
    const sunY = height * (portrait ? 0.27 : 0.32);
    const sunRadius = Math.round(Math.min(width, height) * 0.15);
    const sky = surface(width, height);
    const ctx = sky.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, this.waterline);
    grad.addColorStop(0, '#10142f');
    grad.addColorStop(0.39, '#343453');
    grad.addColorStop(0.72, '#925e6b');
    grad.addColorStop(1, '#eda779');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, this.waterline);
    const halo = ctx.createRadialGradient(this.sunX, sunY, 0, this.sunX, sunY, sunRadius * 2.75);
    halo.addColorStop(0, '#ffc4827d');
    halo.addColorStop(1, '#ffc48200');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, width, this.waterline);
    for (let y = -sunRadius; y <= sunRadius; y++) {
      const r = Math.round(Math.sqrt(sunRadius ** 2 - y ** 2));
      if (y > -5 && (y + sunRadius) % (y > 18 ? 4 : 6) === 0) continue;
      stripe(ctx, y < -12 ? '#ffe6ae' : y < 12 ? '#ffd299' : '#f7b084', this.sunX - r, sunY + y, 2 * r);
    }
    const random = seeded(5187);
    for (let i = 0; i < 135; i++) {
      const x = random() * width;
      const y = random() * this.waterline * 0.94;
      if (Math.hypot(x - this.sunX, y - sunY) < sunRadius) continue;
      stripe(ctx, i % 3 ? '#ffe7b714' : '#ebd7ec3a', x, y, y > this.waterline / 2 ? 2 + random() * 15 : 1);
    }
    const sea = ctx.createLinearGradient(0, this.waterline, 0, height);
    sea.addColorStop(0, '#46506b');
    sea.addColorStop(0.13, '#28445c');
    sea.addColorStop(0.5, '#163c50');
    sea.addColorStop(1, '#0b253a');
    ctx.fillStyle = sea;
    ctx.fillRect(0, this.waterline, width, height - this.waterline);
    this.sky = sky;
    this.far = ridge(height, this.waterline, 241, true);
    this.near = ridge(height, this.waterline, 1322, false);
    this.waves = Array.from({ length: 215 }, (_, i) => {
      const depth = random() ** 1.4;
      return {
        x: random() * (width + 50), y: this.waterline + 3 + depth * (height - this.waterline), depth,
        width: 1 + (3 + depth * 29) * random(), color: i % 5 ? '#4e9aab' : '#e5a387',
        alpha: (0.12 + depth * 0.2) * (0.5 + random() * 0.5),
      };
    });
    this.embers = Array.from({ length: 28 }, () => [random() * width, random() * height, random()]);
  }

  draw(ctx, time, energy) {
    const { width, height } = this.layout;
    ctx.drawImage(this.sky, 0, 0);
    const layers = [[this.far, 8.1, 86], [this.near, 18, 12]];
    for (const [tile, speed, shift] of layers) {
      for (let x = -Math.floor((time * speed + shift) % tile.width); x < width; x += tile.width) {
        ctx.drawImage(tile, x, 0);
      }
    }
    stripe(ctx, '#6f7a816b', 0, this.waterline + 5, width);
    for (const wave of this.waves) {
      const x = (wave.x - time * (14 + wave.depth * 50)) % (width + 50);
      const wrap = (x + width + 50) % (width + 50) - 34;
      const glow = Math.max(0, 1 - Math.abs(wrap - this.sunX) / (26 + 63 * wave.depth));
      ctx.globalAlpha = wave.alpha + glow * (0.1 + 0.14 * energy);
      stripe(ctx, glow > 0.6 ? '#f6ad88' : wave.color, wrap, wave.y, Math.round(wave.width));
    }
    ctx.globalAlpha = 1;
    for (const [x, y, phase] of this.embers) {
      const drift = ((x - time * (14 + 26 * phase)) % width + width) % width;
      if (y > this.waterline * 1.18) continue;
      stripe(ctx, phase > 0.8 ? '#ffe0b664' : '#99b9d132', drift, y + 3 * Math.sin(time + phase * 12), phase > 0.8 ? 2 : 1);
    }
  }
}

function carrierArt() {
  const art = surface(121, 72);
  const ctx = art.getContext('2d');
  ctx.translate(60, 36);
  poly(ctx, '#111b2d', [-47, -29, -19, -29, -14, -24, -3, -26, 2, -33, 17, -33, 20, -22, 37, -19, 42, -9, 51, -5, 58, 9, 53, 22, 25, 31, -19, 31, -47, 27]);
  poly(ctx, '#344158', [-47, -23, -22, -23, -24, 1, 4, 2, 39, 1, 55, 10, 50, 21, 25, 28, -22, 28, -47, 23]);
  poly(ctx, '#8390a4', [-43, 3, -22, -3, 7, -2, 38, -5, 53, 6, 41, 13, 17, 17, -35, 17]);
  poly(ctx, '#bcc7cc', [-40, 7, -24, 1, 9, 2, 36, -2, 46, 5, 20, 9, -20, 13]);
  poly(ctx, '#515e75', [-34, -5, -23, -20, 9, -25, 30, -20, 39, -7, 21, 1, -18, 1]);
  poly(ctx, '#a7b5be', [-29, -7, -19, -18, 8, -22, 25, -18, 30, -13, 4, -9, -11, -3]);
  poly(ctx, '#15243a', [-21, -11, -16, -16, 7, -20, 24, -16, 16, -12, -5, -10]);
  poly(ctx, '#437f91', [-16, -13, -12, -16, 6, -18, 15, -16, 9, -14]);
  stripe(ctx, '#a4e0de', -10, -16, 11);
  poly(ctx, '#47536b', [3, -22, 5, -31, 15, -31, 16, -22]);
  stripe(ctx, '#bec6cf', 7, -30, 6, 7);
  stripe(ctx, '#647586', 11, -36, 2, 7);
  stripe(ctx, '#fc9e72', 11, -36, 2, 2);
  for (let i = 0; i < 6; i++) {
    const x = -17 + i * 9;
    stripe(ctx, '#202f46', x, 19, 5, 4);
    stripe(ctx, i % 3 ? '#527e91' : '#e69c76', x + 1, 20, 3);
  }
  stripe(ctx, '#a6bbc4', -29, 10, 38);
  stripe(ctx, '#d1ccbe', 15, 9, 15);
  stripe(ctx, '#151f32', -17, 29, 39, 3);
  stripe(ctx, '#729099', 42, 13, 9, 3);
  stripe(ctx, '#4ef1e7', 48, 15, 5, 2);

  const { x, y, width, height } = CARRIER_PANEL;
  stripe(ctx, '#111b2d', x, y - 4, width + 7, height + 8);
  stripe(ctx, '#43536a', x, y - 3, width + 5, height + 6);
  stripe(ctx, '#a7b5be', x, y - 2, width + 4);
  stripe(ctx, '#24354b', x, y + height, width + 5, 2);
  stripe(ctx, '#7a8c9d', x, y + height + 2, width + 4);
  stripe(ctx, '#1e2d43', x + width, y, 4, height);
  for (const bin of [31, 22, 21, 8, 7, 0]) {
    stripe(ctx, SHOT_PALETTES[pitchFamily(bin)][1], x + width + 1, pitchRowY(bin), 2);
  }
  return art;
}

function shipArt() {
  const art = surface(29, 16);
  const ctx = art.getContext('2d');
  poly(ctx, '#101a2a', [1, 6, 5, 4, 9, 5, 11, 1, 15, 1, 19, 5, 24, 6, 29, 9, 23, 12, 16, 12, 13, 15, 9, 15, 6, 11, 1, 11]);
  poly(ctx, '#d07148', [2, 6, 7, 6, 12, 8, 21, 7, 27, 9, 21, 11, 11, 11, 6, 10, 2, 10]);
  poly(ctx, '#ffd89d', [5, 7, 13, 7, 17, 6, 23, 7, 26, 9, 15, 9, 11, 10, 5, 9]);
  poly(ctx, '#edac6c', [9, 6, 12, 2, 14, 2, 18, 6, 15, 7]);
  poly(ctx, '#bf6447', [9, 10, 16, 10, 13, 14, 10, 14]);
  stripe(ctx, '#264a66', 17, 6, 5, 2);
  stripe(ctx, '#8decf1', 18, 6, 3);
  stripe(ctx, '#fff0b6', 24, 8, 2);
  stripe(ctx, '#aeffff', 1, 8, 3);
  return art;
}

function drawBeaconPulse(ctx, phase) {
  const x = 12, y = -35;
  const radius = 7 + Math.round(24 * phase);
  ctx.save();
  ctx.globalAlpha = (1 - phase) * 0.8;
  for (let i = 0; i <= 8; i++) {
    const angle = Math.PI * i / 8;
    stripe(ctx, '#8df7fa', x + radius * Math.cos(angle) - 1, y - radius * 0.72 * Math.sin(angle), 3, 2);
  }
  stripe(ctx, '#e0ffff', x - 2, y - 1, 5, 3);
  ctx.restore();
}

function drawShot(ctx, layout, shot, time) {
  const x = (shot.x - shot.speed * (time - shot.start)) * layout.width;
  const y = projectileY(shot, time) * layout.height;
  if (y < -8 || y > layout.height + 8) return;
  const [shade, glow, color, light] = SHOT_PALETTES[shot.band];
  const r = shot.radius;
  ctx.globalAlpha = 0.25;
  stripe(ctx, glow, x, y - 1, r * 5, 2);
  ctx.globalAlpha = 1;
  stripe(ctx, shade, x - r, y - r + 1, r * 2 + 2, r * 2 - 1);
  stripe(ctx, color, x - r + 1, y - r + 1, r * 2 - 1, r * 2 - 1);
  stripe(ctx, light, x - r + 1, y - 1, Math.ceil(r), 2);
}

export function createBulletHell(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const viewer = Boolean(canvas.closest('.viewer'));
  const carrier = carrierArt();
  const plane = shipArt();
  const history = surface(CARRIER_PANEL.width, PITCH_BINS);
  const historyCtx = history.getContext('2d', { alpha: false });
  const beatClock = new BeatClock();
  let flight, scenery, wide;
  let lag = 0, clock = 0;
  let beaconAge = Infinity;
  let previousFrame = null;
  const pending = [...NO_HITS];

  function clearPanel() {
    stripe(historyCtx, PANEL_DARK, 0, 0, history.width, history.height);
  }

  function scrollPanel(bands) {
    historyCtx.drawImage(history, 1, 0);
    stripe(historyCtx, PANEL_DARK, 0, 0, 1, PITCH_BINS);
    if (!bands) return;
    for (let bin = 0; bin < PITCH_BINS; bin++) {
      const strength = bands[bin];
      if (strength < PITCH_FLOOR) continue;
      historyCtx.globalAlpha = Math.sqrt(strength);
      stripe(historyCtx, SHOT_PALETTES[pitchFamily(bin)][2], 0, PITCH_BINS - 1 - bin, 1);
    }
    historyCtx.globalAlpha = 1;
  }

  clearPanel();

  function resize(viewWidth, viewHeight) {
    wide = !viewer && viewWidth >= 900 && viewHeight >= 420 && viewWidth / viewHeight >= 1.5;
    const logicalScale = Math.max(1, Math.min(viewWidth, viewHeight) / 270, Math.max(viewWidth, viewHeight) / 1000);
    const width = Math.max(180, Math.round(viewWidth / logicalScale));
    const height = Math.max(155, Math.round(viewHeight / logicalScale));
    if (canvas.width === width && canvas.height === height && flight) return;
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = false;
    const layout = layoutFor(width, height);
    flight = new Flight(layout);
    scenery = new Canyon(layout);
    lag = 0;
    pending.fill(false);
  }

  function render(dt, frame, presentation = 0) {
    if (!flight) return;
    const live = frame?.status === 'live' || frame?.status === 'demo';
    const signal = live ? frame.spectrum : null;
    if (frame !== previousFrame) {
      const sourceChanged = frame?.generation !== previousFrame?.generation || frame?.source !== previousFrame?.source;
      if (sourceChanged || !frame) {
        clearPanel();
        flight.flashes.fill(0);
        beaconAge = Infinity;
      }
      if (signal && previousFrame && !sourceChanged) {
        for (let i = 0; i < pending.length; i++) pending[i] ||= signal.hits[i] > previousFrame.spectrum.hits[i];
      } else {
        pending.fill(false);
      }
      if (frame) scrollPanel(signal?.bands);
      previousFrame = frame;
    }
    const beat = beatClock.advance(dt, frame);
    beaconAge = signal?.bpm ? (beat ? 0 : beaconAge + dt) : Infinity;
    clock += dt;
    lag = Math.min(lag + dt, 5 / TICKS_PER_SECOND);
    while (lag >= 1 / TICKS_PER_SECOND) {
      flight.advance(signal, pending, frame?.density ?? 0.65);
      pending.fill(false);
      lag -= 1 / TICKS_PER_SECOND;
    }

    const layout = flight.layout;
    const { width, height, carrierX, carrierY, carrierScale, shipX } = layout;
    const energy = signal?.level ?? 0;
    const time = flight.time;
    scenery.draw(ctx, clock, energy);
    const active = 1 - presentation;
    const scale = 1 - (wide ? 0.28 : 0.12) * active;
    const centerX = width * (0.5 - (wide ? 0.14 * active : 0));
    ctx.save();
    ctx.translate(centerX, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -height / 2);
    ctx.globalAlpha = 0.15;
    stripe(ctx, '#0a1429', carrierX * width - 36 * carrierScale, scenery.waterline + 18, 69 * carrierScale, 3);
    stripe(ctx, '#0a1429', carrierX * width - 23 * carrierScale, scenery.waterline + 23, 52 * carrierScale, 2);
    ctx.globalAlpha = 1;
    const panel = CARRIER_PANEL;
    ctx.save();
    ctx.translate(carrierX * width, carrierY * height);
    ctx.scale(carrierScale, carrierScale);
    ctx.drawImage(carrier, -60, -36);
    if (beaconAge < BEACON_PULSE_SECONDS) drawBeaconPulse(ctx, beaconAge / BEACON_PULSE_SECONDS);
    ctx.drawImage(history, panel.x, panel.y, panel.width, panel.height);
    stripe(ctx, '#91c5e523', panel.x, panel.y, 1, panel.height);
    for (let bin = 0; bin < PITCH_BINS; bin++) {
      const intensity = flight.flashes[bin];
      if (intensity < 0.08) continue;
      const y = pitchRowY(bin);
      const [, , color, light] = SHOT_PALETTES[pitchFamily(bin)];
      ctx.globalAlpha = intensity;
      ctx.fillStyle = color;
      ctx.fillRect(panel.x - 8 * intensity, y - 1, 8 * intensity + 5, 2);
      ctx.fillStyle = light;
      ctx.fillRect(panel.x - 1, y - 0.5, 4, 1);
    }
    ctx.restore();
    for (const shot of flight.shots) drawShot(ctx, layout, shot, time);

    const ship = flight.shipAt();
    ctx.save();
    ctx.translate(Math.round(shipX * width), Math.round(ship.y * height));
    ctx.rotate(ship.bank);
    const exhaust = 5 + Math.round(energy * 6 + 2 * Math.sin(clock * 36));
    stripe(ctx, '#48cde27e', -14 - exhaust, 0, exhaust + 3, 2);
    stripe(ctx, '#bcf3f9', -16, 0, 5, 1);
    ctx.drawImage(plane, -14, -8);
    ctx.restore();
    ctx.restore();
  }

  return { resize, render };
}
