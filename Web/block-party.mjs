import { BeatClock } from './beat-clock.mjs';

const ROWS = 7;
const STEP_HEIGHT = 0.89;
const HISTORY_INTERVAL = 0.18;
const HALF_TILE = 0.455;
const TILE_DEPTH = 0.81;
const SPECTRUM_LIFT = 0.82;
const INK = '#0c1025';
const PAPER = '#f7f2de';
const LIME = '#d7fa86';
const BANDS = ['#d7fa86', '#a896ff', '#61e1d2'];
const TILE_COLORS = [
  ['#f05754', '#aa373a', '#70232d'],
  ['#ff9b45', '#ba5a27', '#7f3b27'],
  ['#f6dc55', '#a18a32', '#655c27'],
  ['#72dc71', '#3a944b', '#28633f'],
  ['#58b6ff', '#327bbb', '#265487'],
  ['#7477fa', '#4845bd', '#343283'],
  ['#c779f7', '#8547b8', '#5b337f'],
];
const CRITTER_COLORS = ['#ff972f', '#f96f70', '#ffbe4f', '#ad8cf4', '#ffad7b', '#62dfc2'];
const SPRITE = { left: 0.79, top: 0.92, width: 1.58, height: 1.26 };
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (from, to, t) => from + (to - from) * t;

// Orthographic projection from a fixed camera above the +x/+z corner.
function project(x, y, z) {
  return { x: (x - z) * 0.88, y: (x + z) * 0.45 - y, depth: x + z + 0.9 * y };
}

const MAP_CENTER = project((ROWS - 1) / 4, -(ROWS - 1) * STEP_HEIGHT / 2, (ROWS - 1) / 4);

function polygon(ctx, points, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function diamond(x, y, z, radius) {
  return [
    project(x - radius, y, z - radius), project(x + radius, y, z - radius),
    project(x + radius, y, z + radius), project(x - radius, y, z + radius),
  ];
}

function makeTile(x, z) {
  const row = x + z;
  const baseY = -row * STEP_HEIGHT;
  // The projected horizontal position fixes the frequency for every row.
  const band = (x - z + ROWS - 1) / 2;
  return {
    x, y: baseY, z, row, baseY, lift: 0, band,
    top: diamond(x, baseY, z, HALF_TILE),
    bottom: diamond(x, baseY - TILE_DEPTH, z, HALF_TILE), flash: 0, land: 0, from: null,
  };
}

function drawTile(ctx, tile) {
  const [surface, right, left] = TILE_COLORS[Math.round(tile.band)];
  const { top, bottom } = tile;
  ctx.lineWidth = 0.013;
  polygon(ctx, [top[2], bottom[2], bottom[3], top[3]], left, '#101326');
  polygon(ctx, [top[1], bottom[1], bottom[2], top[2]], right, '#101326');
  polygon(ctx, top, surface, '#101326');
  const seam = diamond(tile.x, tile.y, tile.z, 0.395);
  ctx.lineWidth = 0.016;
  polygon(ctx, seam, null, '#fff9de56');
  const glow = Math.max(tile.flash * 0.68, tile.lift / SPECTRUM_LIFT * 0.25);
  if (glow > 0.012) {
    ctx.globalAlpha = glow;
    polygon(ctx, top, '#fffee1');
    ctx.lineWidth = 0.027;
    polygon(ctx, seam, null, '#fffdf0');
    ctx.globalAlpha = 1;
  }
}

function shaded(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = shift => Math.round(clamp(((value >> shift) & 255) * amount, 0, 255));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

// Bake each set of flat-shaded 3D faces once. The animation only moves the finished critter.
function makeCritter(color, yaw) {
  const canvas = document.createElement('canvas');
  const resolution = 128;
  canvas.width = Math.ceil(SPRITE.width * resolution);
  canvas.height = Math.ceil(SPRITE.height * resolution);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(resolution, 0, 0, resolution, SPRITE.left * resolution, SPRITE.top * resolution);
  ctx.lineWidth = 0.008;
  ctx.lineJoin = 'round';
  const faces = [];
  const sin = Math.sin(yaw), cos = Math.cos(yaw);

  function face(vertices, base, brightness = 0) {
    const rotated = vertices.map(([x, y, z]) => [x * cos + z * sin, y, z * cos - x * sin]);
    const [a, b, c] = rotated;
    const [ux, uy, uz] = b.map((value, i) => value - a[i]);
    const [vx, vy, vz] = c.map((value, i) => value - a[i]);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (nx + 0.9 * ny + nz <= 1e-8) return;
    const light = Math.max(0, (-0.28 * nx + 0.84 * ny + 0.47 * nz) / Math.hypot(nx, ny, nz));
    const points = rotated.map(point => project(...point));
    const depth = points.reduce((sum, point) => sum + point.depth, 0) / points.length;
    faces.push({ points, depth, fill: shaded(base, 0.74 + 0.34 * light + brightness) });
  }

  function oval(cx, cy, cz, rx, ry, rz, base, bands, sides, brightness = 0) {
    const rings = Array.from({ length: bands + 1 }, (_, band) => {
      const latitude = Math.PI * (band / bands - 0.5);
      return Array.from({ length: sides }, (_, side) => {
        const turn = Math.PI * 2 * side / sides;
        return [
          cx + rx * Math.cos(latitude) * Math.cos(turn),
          cy + ry * Math.sin(latitude),
          cz + rz * Math.cos(latitude) * Math.sin(turn),
        ];
      });
    });
    for (let band = 0; band < bands; band++) {
      const lower = rings[band], upper = rings[band + 1];
      for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;
        const points = [lower[i], upper[i]];
        if (band < bands - 1) points.push(upper[next]);
        if (band > 0) points.push(lower[next]);
        face(points, base, brightness);
      }
    }
  }

  oval(0, 0.305, 0, 0.31, 0.305, 0.285, color, 6, 12);
  for (const side of [-1, 1]) {
    const x = side * 0.102;
    oval(x, 0.505, 0.197, 0.105, 0.145, 0.093, '#fff6df', 5, 10, 0.12);
    oval(x + 0.009, 0.501, 0.279, 0.047, 0.065, 0.025, '#262237', 4, 8);
    oval(x - 0.005, 0.523, 0.301, 0.017, 0.021, 0.008, '#fff9e9', 3, 6, 0.21);
  }

  // The angled, open muzzle gives the otherwise round silhouette its shape.
  const ring = (y, z, rx, ry) => Array.from({ length: 8 }, (_, i) => {
    const angle = Math.PI * i / 4;
    return [rx * Math.cos(angle), y + ry * Math.sin(angle), z];
  });
  const base = ring(0.306, 0.177, 0.124, 0.113);
  const tip = ring(0.342, 0.501, 0.109, 0.096);
  const lip = ring(0.342, 0.504, 0.073, 0.061);
  const inside = ring(0.342, 0.476, 0.063, 0.049);
  for (let i = 0; i < tip.length; i++) {
    const next = (i + 1) % tip.length;
    face([base[i], base[next], tip[next], tip[i]], color, 0.04);
    face([tip[i], tip[next], lip[next], lip[i]], color, 0.19);
    face([lip[i], lip[next], inside[next], inside[i]], '#73344a');
  }
  face(inside, '#47233a');

  faces.sort((a, b) => a.depth - b.depth);
  for (const { points, fill } of faces) polygon(ctx, points, fill, fill);
  return canvas;
}

function drawShadow(ctx, { x, z, air, shadow }, bounce) {
  const center = project(x, shadow.y, z);
  ctx.save();
  polygon(ctx, shadow.top);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(center.x, center.y + 0.03, 0.255 - 0.082 * air, 0.106 - 0.036 * air, 0, 0, Math.PI * 2);
  ctx.fillStyle = air + bounce > 0.36 ? '#1a19374d' : '#16132e70';
  ctx.fill();
  ctx.restore();
}

function critterPose(tile, phase, bounce) {
  const from = tile.from ?? tile;
  const progress = phase * phase * (3 - 2 * phase);
  const air = tile.from ? Math.sin(Math.PI * phase) : 0;
  const dx = tile.x - from.x, dz = tile.z - from.z;
  // The two critters pass on opposite sides of their shared edge.
  const lane = 0.36 * air;
  const x = mix(from.x, tile.x, progress) - lane * dz;
  const z = mix(from.z, tile.z, progress) + lane * dx;
  const step = tile.y - from.y;
  const lift = air * Math.max(step > 0 ? 0.84 : 0.62, Math.abs(step) * 0.6);
  const point = project(x, mix(from.y, tile.y, progress) + lift + 0.14 * bounce, z);
  return {
    tile, x, z, air, point,
    shadow: progress < 0.5 ? from : tile,
    row: Math.max(from.row, tile.row),
    lean: (dx - dz) * air * 0.21,
  };
}

function drawCritter(ctx, { tile, point, air, lean }, bounce, squash) {
  const settle = Math.max(squash, tile.land);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(lean);
  ctx.scale(1 + 0.14 * settle - 0.09 * air, 1 - 0.19 * settle + 0.17 * air + 0.06 * bounce);
  ctx.drawImage(tile.critter.sprite, -SPRITE.left, -SPRITE.top, SPRITE.width, SPRITE.height);
  ctx.restore();
}


function label(ctx, content, x, y, size, color, weight = 700, family = 'ui-monospace, Consolas, monospace') {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.fillText(content, x, y);
}

function background(ctx, layout) {
  const { width, height, unit, x, y } = layout;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, unit * 9.6);
  glow.addColorStop(0, '#2b244e');
  glow.addColorStop(0.57, '#161a38');
  glow.addColorStop(1, INK);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // A faint projected grid anchors the blocks.
  const grid = ctx.createLinearGradient(0, height * 0.62, 0, height);
  grid.addColorStop(0, '#8b82b900');
  grid.addColorStop(0.65, '#8b82b926');
  grid.addColorStop(1, '#8b82b914');
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -15; i <= 20; i++) {
    for (const [from, to] of [[project(i, -2.1, -22), project(i, -2.1, 25)], [project(-22, -2.1, i), project(25, -2.1, i)]]) {
      ctx.moveTo(x + from.x * unit, y + from.y * unit);
      ctx.lineTo(x + to.x * unit, y + to.y * unit);
    }
  }
  ctx.stroke();
}

function drawFloorShadow(ctx, x, y, unit) {
  ctx.save();
  ctx.translate(x, y + unit * 5.0);
  ctx.scale(unit * 6.9, unit * 0.8);
  const floorShadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  floorShadow.addColorStop(0, '#080c20b0');
  floorShadow.addColorStop(1, '#080c2000');
  ctx.fillStyle = floorShadow;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function drawTitle(ctx, layout) {
  const { wide, unit, x } = layout;
  const sans = 'system-ui, sans-serif';
  const titleSize = unit * (wide ? 1.43 : 1.16);
  if (wide) {
    const tx = layout.titleX;
    const ty = layout.titleY;
    ctx.fillStyle = BANDS[2];
    ctx.fillRect(tx, ty - 4, unit * 0.3, 2);
    label(ctx, '02 / BLOCK SPECTROGRAPH', tx + unit * 0.43, ty, Math.max(10, unit * 0.155), BANDS[2]);
    label(ctx, 'BLOCK', tx - unit * 0.055, ty + unit * 1.49, titleSize, PAPER, 900, sans);
    label(ctx, 'PARTY', tx - unit * 0.055, ty + unit * 2.69, titleSize, LIME, 900, sans);
    label(ctx, 'BASS TO TREBLE / NEWEST IN FRONT', tx, ty + unit * 3.27, Math.max(9, unit * 0.133), '#aba6ca');
  } else {
    ctx.textAlign = 'center';
    label(ctx, '02 / BLOCK SPECTROGRAPH', x, layout.titleY - unit * 1.22, Math.max(9, unit * 0.18), BANDS[2]);
    label(ctx, 'BLOCK PARTY', x, layout.titleY, titleSize, PAPER, 900, sans);
    ctx.textAlign = 'left';
  }
}

function meters(ctx, layout, accents, signal) {
  const { wide, unit, titleX, titleY, x, y } = layout;
  const spacing = Math.max(72, unit * 1.07);
  const origin = wide ? titleX : x - spacing * 1.5 + 11;
  const baseline = wide ? titleY + unit * 4.48 : y + unit * 6.12;
  const size = Math.max(2.7, unit * 0.047);
  const names = ['BASS', 'MID', 'HIGH'];
  for (let band = 0; band < BANDS.length; band++) {
    const left = origin + spacing * band;
    const value = (signal?.energy[band] ?? 0) * 0.63 + accents[band] * 0.37;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = value * 6 > i ? BANDS[band] : '#43415f';
      ctx.fillRect(left + i * size * 1.6, baseline - size * (1 + i * 0.36), size, size * (1 + i * 0.36));
    }
    label(ctx, names[band], left, baseline + Math.max(13, unit * 0.24), Math.max(8, unit * 0.115), '#b0abc9');
  }
}

export function createBlockParty(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const backdrop = document.createElement('canvas');
  const backdropCtx = backdrop.getContext('2d', { alpha: false });
  const rows = Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: row + 1 }, (_, x) => makeTile(x, row - x)));
  const tiles = rows.flat();
  const sprites = CRITTER_COLORS.map(color => [makeCritter(color, 0.21), makeCritter(color, 1.36)]);
  for (const tile of tiles) {
    const color = (2 * tile.x + 3 * tile.z + Math.floor(tile.row / 2)) % sprites.length;
    tile.critter = { color, sprite: sprites[color][(tile.x + Math.floor(tile.row / 2)) % 2] };
  }
  const edges = rows.slice(0, -1).flatMap((row, i) => row.flatMap(tile => [
    [tile, rows[i + 1][tile.x]], [tile, rows[i + 1][tile.x + 1]],
  ]));
  const accents = [0, 0, 0];
  const levels = new Float32Array(TILE_COLORS.length);
  const historyPeaks = new Float32Array(levels.length);
  const history = Array.from({ length: ROWS - 1 }, () => new Float32Array(levels.length));
  const clock = new BeatClock();
  let layout;
  let previousGeneration, previousSource, previousHits;
  let historyAge = 0, bounceAge = Infinity, bouncePeriod = 0.5, beat = 0;
  let swapping = [], phase = 1, hopDuration = 0.32;

  function startSwaps(pairCount) {
    const choices = edges.filter(([a, b]) => a.critter.color !== b.critter.color);
    while (choices.length && swapping.length < pairCount * 2) {
      const [[a, b]] = choices.splice(Math.floor(Math.random() * choices.length), 1);
      if (a.from || b.from) continue;
      const critter = a.critter;
      a.critter = b.critter;
      b.critter = critter;
      a.from = b;
      b.from = a;
      a.flash = b.flash = 0.36;
      swapping.push(a, b);
    }
    if (swapping.length) {
      hopDuration = clamp(bouncePeriod * 0.72, 0.21, 0.48);
      phase = 0;
    }
  }

  function resize(width, height) {
    if (!width || !height || layout?.width === width && layout.height === height) return;
    const wide = width / height >= 1.45;
    const unit = wide ? Math.min(width / 22.5, height / 13.6) : Math.min(width / 13.65, height / 17);
    const x = width / 2 - (wide ? 3.8 * unit : 0);
    const y = height / 2 + (wide ? -0.15 : 0.05) * unit;
    const titleX = width / 2 + unit * 3.3;
    const titleY = wide ? height * 0.19 : y - unit * 6.9;
    const idleUnit = Math.min(width / 12.5, height / 12.6);
    const scale = Math.min(window.devicePixelRatio || 1, 1.75, 1920 / Math.max(width, height));
    layout = { width, height, unit, x, y, wide, titleX, titleY, idleUnit, scale };
    canvas.width = backdrop.width = Math.round(width * scale);
    canvas.height = backdrop.height = Math.round(height * scale);
    backdropCtx.setTransform(scale, 0, 0, scale, 0, 0);
    background(backdropCtx, { width, height, x: width / 2, y: height / 2, unit: idleUnit });
  }

  function render(dt, frame, presentation = 0) {
    if (!layout) return;
    const signal = frame?.status === 'live' || frame?.status === 'demo' ? frame.spectrum : null;
    const rhythm = signal ?? (frame?.status === 'quiet' ? frame.spectrum : null);
    const sameSource = rhythm && frame.generation === previousGeneration && frame.source === previousSource && previousHits;
    const hits = accents.map((_, band) => Boolean(sameSource && rhythm.hits[band] > previousHits[band]));
    if (!sameSource || !rhythm.bpm) bounceAge = Infinity;
    previousGeneration = frame?.generation;
    previousSource = frame?.source;
    previousHits = rhythm?.hits;
    bounceAge += dt;
    for (let band = 0; band < accents.length; band++) {
      accents[band] = hits[band] ? 1 : Math.max(0, accents[band] - dt * (band === 0 ? 4.1 : 5.3));
    }

    if (!signal || !sameSource) {
      for (const row of history) row.fill(0);
      historyPeaks.fill(0);
      historyAge = 0;
    }
    const bands = signal?.bands ?? [];
    for (let x = 0; x < levels.length; x++) {
      const first = Math.floor(x * bands.length / levels.length);
      const end = Math.floor((x + 1) * bands.length / levels.length);
      levels[x] = 0;
      for (let i = first; i < end; i++) levels[x] = Math.max(levels[x], bands[i]);
      historyPeaks[x] = Math.max(historyPeaks[x], levels[x]);
    }
    if (signal && (historyAge += dt) >= HISTORY_INTERVAL) {
      const oldest = history.shift();
      oldest.set(historyPeaks);
      history.push(oldest);
      historyPeaks.fill(0);
      historyAge %= HISTORY_INTERVAL;
    }
    const follow = 1 - Math.exp(-15 * dt);
    for (const tile of tiles) {
      tile.flash = Math.max(0, tile.flash - dt * 3.15);
      tile.land = Math.max(0, tile.land - dt * 7.8);
      const spectrum = history[tile.row] ?? levels;
      const low = Math.floor(tile.band), high = Math.ceil(tile.band);
      const level = mix(spectrum[low], spectrum[high], tile.band - low);
      const lift = mix(tile.lift, SPECTRUM_LIFT * level, follow);
      tile.lift = lift < 0.002 ? 0 : lift;
      const y = tile.baseY + tile.lift;
      if (y !== tile.y) {
        tile.y = y;
        tile.top = diamond(tile.x, y, tile.z, HALF_TILE);
      }
    }

    if (phase < 1) {
      phase = Math.min(1, phase + dt / hopDuration);
      if (phase === 1) {
        for (const tile of swapping) {
          tile.from = null;
          tile.land = 1;
          tile.flash = 0.94;
        }
        swapping = [];
      }
    }

    const bpm = rhythm?.bpm;
    if (!bpm || !sameSource) beat = 0;
    if (clock.advance(dt, frame)) {
      bounceAge = 0;
      bouncePeriod = 60 / bpm;
      beat++;
      if (beat % 4 === 0 && phase === 1) startSwaps(2 + Math.round(4 * (frame?.density ?? 0.65)));
    }

    const bouncePhase = Math.min(1, bounceAge / (bouncePeriod * 0.55));
    const bounce = Math.sin(Math.PI * bouncePhase);
    const squash = 0.38 * (1 - bouncePhase) ** 4;
    const poses = tiles.map(tile => critterPose(tile, phase, bounce));
    poses.sort((a, b) => a.point.depth - b.point.depth);

    ctx.resetTransform();
    ctx.drawImage(backdrop, 0, 0);
    ctx.scale(layout.scale, layout.scale);
    const unit = mix(layout.unit, layout.idleUnit, presentation);
    const x = mix(layout.x, layout.width / 2, presentation);
    const y = mix(layout.y, layout.height / 2 + layout.idleUnit * 0.6, presentation);
    drawFloorShadow(ctx, x, y, unit);
    if (presentation < 0.5) {
      ctx.globalAlpha = 1 - presentation * 2;
      drawTitle(ctx, layout);
      meters(ctx, layout, accents, signal);
      ctx.globalAlpha = 1;
    }
    ctx.translate(x, y);
    ctx.scale(unit, unit);
    ctx.translate(-MAP_CENTER.x, -MAP_CENTER.y);
    for (let row = 0; row < rows.length; row++) {
      for (const tile of rows[row]) drawTile(ctx, tile);
      for (const pose of poses) {
        if (pose.shadow.row === row) drawShadow(ctx, pose, bounce);
      }
      for (const pose of poses) {
        if (pose.row === row) drawCritter(ctx, pose, bounce, squash);
      }
    }
  }

  return { resize, render };
}
