import { PITCH_BINS, PITCH_FLOOR } from './flight.mjs';
import { BANDS_PER_WING, BEATS_PER_BAR, FIELD_HEIGHT, FIELD_WIDTH, PLAYER_NOSE_DISTANCE, STEP, SwarmFlight } from './swarm-flight.mjs';

const PALETTES = [
  ['#852e42', '#ff686d', '#ffd8d2'],
  ['#875431', '#ffb262', '#fff1c6'],
  ['#59682b', '#c7ea6e', '#f2ffc3'],
  ['#276449', '#62e8a0', '#c9ffe1'],
  ['#1a536e', '#52ddec', '#caffff'],
  ['#35487f', '#80a9ff', '#dce8ff'],
  ['#583583', '#b68cff', '#f1dfff'],
  ['#812a60', '#ff84cf', '#ffe4f5'],
];
const ENEMIES = [
  ['......c......', '.....mmm.....', 'd...mmcmm...d', 'mm.mmdmdmm.mm', 'cmmccclcccmmc', 'dmcmmlmlmmcmd', '.ddmmmmmmmdd.', '..mm.dmd.mm..', '..d...d...d..'],
  ['.m.........m.', '.mm.......mm.', '.dmm..c..mmd.', '..mdmmlmmdm..', '...ccmlmcc...', '..mmdmmmdmm..', '.mddmmdmmddm.', '.d..mdcdm..d.', '.....mmm.....'],
  ['.....ccc.....', '....mclcm....', '.m.mmmdmmm.m.', 'mmdmddmddmdmm', 'cmdcccmcccdmc', 'dmmlmclcmlmmd', '.dmmmmdmmmmd.', '..dmm...mmd..', '...d.....d...'],
  ['..m.......m..', '..dm.....md..', '...mm.c.mm...', 'm...mmlmm...m', 'cm.mdmlmdm.mc', 'dmmcmclmcmmmd', '.mdmcmcmcmdm.', '..ddmmmmmdd..', '....dmdmd....', '.....d.d.....'],
];
const PLAYER = [
  '........l........', '........l........', '.......lml.......', '.......lml.......',
  '......lmmml......', '......lcccl......', '.....mlcdclm.....', '.....mllcllm.....',
  '.m..mmlllllmm..m.', '.mm.mlmllllmm.mm.', '.llmmmlmlmlmmmll.', '.cclmllmlmllmlcc.',
  'mlmllllmlmllllmlm', 'mldmllmmdmmllmdlm', 'dd.dmlmmdmmlmd.dd', '.....dm...md.....',
];
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyP'];
const sectionFor = bin => Math.floor(bin / BANDS_PER_WING);
const colors = bin => PALETTES[sectionFor(bin)];
const wrap = (value, max) => ((value % max) + max) % max;

function surface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function sprite(rows, [dark, main, light], cockpit) {
  const art = surface(rows[0].length + 2, rows.length + 2);
  const ctx = art.getContext('2d');
  const inks = { d: dark, m: main, l: light, c: cockpit };
  rows.forEach((row, y) => [...row].forEach((ink, x) => {
    if (ink === '.') return;
    ctx.fillStyle = '#0c1124';
    ctx.fillRect(x, y, 3, 3);
  }));
  rows.forEach((row, y) => [...row].forEach((ink, x) => {
    if (ink === '.') return;
    ctx.fillStyle = inks[ink];
    ctx.fillRect(x + 1, y + 1, 1, 1);
  }));
  return art;
}

function noise(i) {
  return (Math.imul(i ^ 0x40ef5, 0x45d9f3b) >>> 0) / 4294967296;
}

function paintSpace(width, height, wide) {
  const art = surface(width, height);
  const ctx = art.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, width * 0.46, height);
  sky.addColorStop(0, '#0e1029');
  sky.addColorStop(0.57, '#19142e');
  sky.addColorStop(1, '#100e22');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const clouds = [
    [0.19, 0.79, 0.47, '#a1476c48'], [0.78, 0.22, 0.36, '#4838a750'], [0.98, 0.88, 0.35, '#2b678c31'],
  ];
  for (const [x, y, radius, color] of clouds) {
    const glow = ctx.createRadialGradient(width * x, height * y, 0, width * x, height * y, width * radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, '#00000000');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }
  for (let i = 0; i < 850; i++) {
    const x = Math.floor(noise(i * 23 + 87) * width);
    const y = Math.floor(noise(i * 83 + 51) * height);
    ctx.fillStyle = ['#ffcccf14', '#a8baff33', '#e9edff48'][i % 3];
    ctx.fillRect(x, y, i % 17 === 0 ? 2 : 1, 1);
  }

  const radius = Math.min(width, height) * (wide ? 0.184 : 0.25);
  ctx.translate(width * (wide ? 0.146 : 0.04), height * (wide ? 0.833 : 0.83));
  ctx.rotate(-0.25);
  const ring = (start, end) => {
    for (const [offset, color, line] of [[0, '#864b7c79', 12], [0.14, '#e78b9c6b', 4], [0.27, '#af74945c', 7], [0.49, '#ed9f9944', 1]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = line * radius / 126;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * (1.53 + offset), radius * (0.29 + offset * 0.21), 0, start, end);
      ctx.stroke();
    }
  };
  ring(Math.PI, 2 * Math.PI);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();
  const bands = ['#754c72', '#ad617f', '#99567a', '#633f71', '#845582', '#a66781', '#4b345d'];
  const strip = Math.max(3, Math.floor(radius / 25));
  for (let y = -radius; y < radius; y += strip) {
    ctx.fillStyle = bands[wrap(Math.floor((y + radius) / (3 * strip) + 0.7 * Math.sin(y * 0.17)), bands.length)];
    ctx.fillRect(-radius, y, radius * 2, strip + 1);
  }
  for (let i = 0; i < 200; i++) {
    const x = radius * (2 * noise(18 * i + 11) - 1);
    const y = radius * (2 * noise(9 * i + 613) - 1);
    ctx.fillStyle = i % 3 ? '#fac0bc22' : '#2d183b44';
    ctx.fillRect(x, y, 3 + 14 * noise(i * 17), Math.max(1, strip / 3));
  }
  const shade = ctx.createLinearGradient(-radius * 0.73, -radius, radius * 0.62, radius);
  shade.addColorStop(0, '#ffac9e52');
  shade.addColorStop(0.37, '#37203d08');
  shade.addColorStop(0.78, '#21152b8c');
  shade.addColorStop(1, '#171124fa');
  ctx.fillStyle = shade;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();
  ring(0, Math.PI);
  return art;
}

function label(ctx, value, x, y, size, ink, weight = 600) {
  ctx.fillStyle = ink;
  ctx.font = `${weight} ${size}px Consolas, ui-monospace, monospace`;
  ctx.fillText(value, x, y);
}

function drawHistory(ctx, history, flashes, x, y, width, rowHeight, wide) {
  const height = PITCH_BINS * rowHeight;
  ctx.fillStyle = '#100e24';
  ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
  ctx.drawImage(history, x, y, width, height);
  const railWidth = wide ? 7 : 5;
  for (const [section, [dark, main]] of PALETTES.entries()) {
    const top = y + (PALETTES.length - 1 - section) * BANDS_PER_WING * rowHeight;
    ctx.globalAlpha = 0.23;
    ctx.fillStyle = dark;
    ctx.fillRect(x, top, width, rowHeight * BANDS_PER_WING);
    ctx.globalAlpha = 1;
    ctx.fillStyle = main;
    ctx.fillRect(x + width - railWidth, top, railWidth, rowHeight * BANDS_PER_WING - 1);
  }
  ctx.strokeStyle = '#a398ca39';
  ctx.strokeRect(x - 0.5, y - 0.5, width + 1, height + 1);
  for (let bin = 0; bin < PITCH_BINS; bin++) {
    const row = y + (PITCH_BINS - 1 - bin) * rowHeight;
    if (flashes[bin] < 0.08) continue;
    const [, main, light] = colors(bin);
    const flashWidth = railWidth + (wide ? 23 : 16);
    ctx.globalAlpha = flashes[bin] * 0.57;
    ctx.fillStyle = main;
    ctx.fillRect(x + width - flashWidth, row - 1, flashWidth + 5, rowHeight + 2);
    ctx.globalAlpha = flashes[bin];
    ctx.fillStyle = light;
    ctx.fillRect(x + width - flashWidth, row, flashWidth + 5, rowHeight);
  }
  ctx.globalAlpha = 1;
}

function drawArena(ctx, flight, ships, playerArt, energy, labelOpacity) {
  const { time, player, field: { width, height, shipScale } } = flight;
  ctx.fillStyle = '#080e2438';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#8193e014';
  for (let x = 28; x < width; x += 43) ctx.fillRect(x, 0, 0.6, height);
  for (let y = wrap(time * 9, 42); y < height; y += 42) ctx.fillRect(0, y, width, 0.7);
  const starCount = Math.min(300, Math.round(width * height / 2600));
  for (let i = 0; i < starCount; i++) {
    const speed = 11 + noise(i * 7 + 32) * 44;
    const x = noise(i * 31 + 293) * width;
    const y = wrap(noise(i * 97 + 32) * height + time * speed, height);
    ctx.fillStyle = i % 4 === 0 ? '#c1d6ff65' : '#ad9dd044';
    ctx.fillRect(x, y, i % 4 === 0 ? 1.8 : 0.9, speed * (0.027 + 0.035 * energy));
  }

  for (const ship of flight.ships) {
    if (!ship.alive) continue;
    const { wing, x, y, bank, flash } = ship;
    const [, main, light] = PALETTES[wing.index];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bank);
    ctx.scale(shipScale, shipScale);
    ctx.fillStyle = main;
    ctx.globalAlpha = 0.26 + flash * 0.55;
    ctx.fillRect(-5, -13 - 5 * flash, 1.8, 7 + 6 * flash);
    ctx.fillRect(3, -13 - 5 * flash, 1.8, 7 + 6 * flash);
    ctx.globalAlpha = 1;
    ctx.drawImage(ships[wing.index], -13, -9, 26, 19);
    if (flash > 0.18) {
      ctx.globalAlpha = 0.48 * flash;
      ctx.strokeStyle = main;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 9, 4 + 12 * (1 - flash), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = flash;
      ctx.fillStyle = light;
      ctx.fillRect(-2.2, 6, 4.4, 9);
      ctx.fillRect(-5, 9, 10, 2);
    }
    ctx.restore();
  }

  for (const shot of flight.enemyShots) {
    const [dark, main, light] = colors(shot.bin);
    const r = shot.radius;
    ctx.save();
    ctx.translate(shot.x, shot.y);
    ctx.rotate(-Math.atan2(shot.vx, shot.vy));
    ctx.scale(r, r);
    ctx.fillStyle = dark;
    ctx.fillRect(-1, -0.75, 2, 1.5);
    ctx.fillRect(-0.65, -1.2, 1.3, 2.4);
    ctx.fillStyle = main;
    ctx.fillRect(-0.75, -0.58, 1.5, 1.16);
    ctx.fillRect(-0.46, -0.91, 0.92, 1.82);
    ctx.fillStyle = light;
    ctx.fillRect(-0.32, 0.02, 0.64, 0.72);
    ctx.restore();
  }
  for (const shot of flight.playerShots) {
    ctx.fillStyle = '#69f1e845';
    ctx.fillRect(shot.x - 4.5, shot.y - 8, 9, 17);
    ctx.fillStyle = '#79fff2';
    ctx.fillRect(shot.x - 1.5, shot.y - 7, 3, 13);
    ctx.fillStyle = '#f4fff0';
    ctx.fillRect(shot.x - 0.8, shot.y - 7, 1.6, 6);
  }

  for (const burst of flight.bursts) {
    const progress = (time - burst.start) / 0.46;
    const [, main, light] = PALETTES[burst.wing ?? 4];
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = main;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(burst.x, burst.y, 6 + progress * 25, 0, 2 * Math.PI);
    ctx.stroke();
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.4 + burst.x;
      const distance = 4 + progress * (18 + 22 * noise(i * 113 + 16));
      ctx.fillStyle = i % 3 ? main : light;
      ctx.fillRect(burst.x + distance * Math.cos(angle), burst.y + distance * Math.sin(angle), 3 - 2 * progress, 3 - 2 * progress);
    }
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.bank);
  const exhaust = 10 + 8 * energy + 4 * Math.sin(time * 48);
  for (const x of [-7, 4]) {
    ctx.fillStyle = '#35d4ff53';
    ctx.fillRect(x - 1.5, 10, 6, exhaust);
    ctx.fillStyle = '#73fcec';
    ctx.fillRect(x, 10, 3, exhaust * 0.69);
    ctx.fillStyle = '#fffac5';
    ctx.fillRect(x + 0.7, 10, 1.6, exhaust * 0.44);
  }
  ctx.drawImage(playerArt, -17, -16, 34, 32);
  const nose = -PLAYER_NOSE_DISTANCE;
  const pulse = player.pulse;
  if (pulse > 0) {
    const radius = 10 + 4 * (1 - pulse);
    const glow = ctx.createRadialGradient(0, nose, 0, 0, nose, radius);
    glow.addColorStop(0, '#bdfff5');
    glow.addColorStop(0.4, '#4deed6a8');
    glow.addColorStop(1, '#4deed600');
    ctx.globalAlpha = pulse;
    ctx.fillStyle = glow;
    ctx.fillRect(-radius, nose - radius, radius * 2, radius * 2);
    ctx.fillStyle = '#b7fff3';
    ctx.fillRect(-5, nose - 0.8, 10, 1.6);
    ctx.fillRect(-0.8, nose - 6, 1.6, 8);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = pulse > 0.18 ? '#f4fff0' : '#68b5c4';
  ctx.fillRect(-1.35, nose - 1.35, 2.7, 2.7);
  if (time < player.shieldUntil) {
    ctx.strokeStyle = '#7ffff0';
    ctx.globalAlpha = 0.35 + 0.26 * Math.sin(time * 34);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();

  if (flight.remaining === 0 && labelOpacity > 0) {
    ctx.globalAlpha = labelOpacity;
    ctx.textAlign = 'center';
    label(ctx, 'FLEET CLEARED', width / 2, height * 0.45, 19, '#fff0ce', 750);
    ctx.textAlign = 'start';
    ctx.globalAlpha = 1;
  }
}

function drawHud(ctx, history, flight, layout, manual, touch, presentation, labelOpacity) {
  const { width, height } = layout;
  const wide = width >= 640;
  const inset = wide ? 26 : 13;
  const awakeY = width > 600 ? 83 : 58;
  const baseline = Math.round(awakeY + (24 - awakeY) * presentation);
  const muted = '#b8b2d5';
  const cream = '#fff0d9';
  const { motion } = flight;
  const beat = motion.running ? motion.beat % BEATS_PER_BAR : -1;
  const heading = beat >= 0 ? flight.patternName.toUpperCase() : flight.bpm ? 'FINDING THE BEAT' : 'WAITING FOR TEMPO';
  label(ctx, heading, inset, baseline, wide ? 14 : 12, cream, 750);
  for (let i = 0; i < BEATS_PER_BAR; i++) {
    const x = inset + 19 * i;
    const w = i === 0 ? 15 : 13;
    ctx.fillStyle = i === 0 ? '#674c56' : '#353852';
    ctx.fillRect(x, baseline + 8, w, 5);
    if (i !== beat) continue;
    ctx.fillStyle = i === 0 ? '#ffc485' : '#83f5e8';
    ctx.fillRect(x, baseline + 7, w, 7);
    ctx.fillStyle = cream;
    ctx.fillRect(x, baseline + 7, w * Math.max(0, 1 - motion.phase), 2);
  }
  if (beat >= 0) label(ctx, `${Math.round(flight.bpm)} BPM`, inset + 83, baseline + 14, 11, muted);
  if (labelOpacity > 0) {
    ctx.globalAlpha = labelOpacity;
    const score = String(flight.score).padStart(5, '0');
    label(ctx, `${score} · WAVE ${flight.wave} · ${flight.remaining} LEFT`, inset, baseline + 31, width < 350 ? 9 : 10, cream);
    const controls = touch ? (flight.bpm ? 'DRAG TO STEER' : 'DRAG TO STEER & FIRE') :
      (flight.bpm ? 'ARROWS STEER · P AUTO' : 'ARROWS · SPACE FIRE · P AUTO');
    label(ctx, manual && wide ? `MANUAL · ${controls}` : controls, inset, baseline + 46, width < 350 ? 9 : 10, muted);
    ctx.globalAlpha = 1;
  }

  const chartWidth = Math.min(214, Math.floor(width * (wide ? 0.27 : 0.37)));
  const chartX = width - chartWidth - inset;
  const chartY = baseline + 7;
  const rowHeight = Math.max(1, Math.min(wide ? 2.3 : 1.6, height * 0.14 / PITCH_BINS));
  label(ctx, 'SPECTRUM → FIRE', chartX, baseline, wide ? 13 : 11, cream, 750);
  drawHistory(ctx, history, flight.bandFlashes, chartX, chartY, chartWidth, rowHeight, wide);
  if (wide) {
    ctx.textAlign = 'right';
    label(ctx, 'HIGH', chartX - 6, chartY + 8, 9, muted);
    label(ctx, 'LOW', chartX - 6, chartY + rowHeight * PITCH_BINS, 9, muted);
    ctx.textAlign = 'start';
  }
}

export function createSignalSwarm(canvas, { onPlay } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const shipArt = PALETTES.map((palette, section) => sprite(ENEMIES[Math.floor(section / 2)], palette, palette[2]));
  const playerArt = sprite(PLAYER, ['#396877', '#b9d4cd', '#fff6df'], '#6cf9eb');
  const history = surface(126, PITCH_BINS);
  const historyCtx = history.getContext('2d', { alpha: false });
  const flight = new SwarmFlight();
  const events = new AbortController();
  const keys = new Set();
  const touch = matchMedia('(pointer: coarse)').matches;
  let previousFrame, layout, space, pointer;
  let manual = false;
  let fireQueued = false;
  let lag = 0;

  canvas.tabIndex = 0;
  canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown W A S D Space P');

  function keydown(event) {
    if (!KEYS.includes(event.code) || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]')) return;
    if (event.target.closest?.('input, select, textarea, [contenteditable], button:focus-visible, a:focus-visible')) return;
    event.preventDefault();
    if (event.code === 'KeyP') {
      if (event.repeat) return;
      manual = !manual;
      keys.clear();
      fireQueued = false;
    } else {
      manual = true;
      keys.add(event.code);
      if (event.code === 'Space' && !event.repeat) fireQueued = true;
    }
    onPlay?.();
  }

  function release() {
    keys.clear();
    fireQueued = false;
    pointer = null;
  }

  const listener = { signal: events.signal };
  window.addEventListener('keydown', keydown, { ...listener, capture: true });
  window.addEventListener('keyup', event => keys.delete(event.code), { ...listener, capture: true });
  window.addEventListener('blur', release, listener);
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer || !layout) return;
    // Leave the top edge available for a tap to reveal the app controls.
    if (event.pointerType === 'touch' && event.clientY < layout.height * 0.16) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: flight.player.x, y: flight.player.y,
      originX: flight.player.x, originY: flight.player.y, scale: layout.scale, fire: true };
    onPlay?.();
  }, listener);
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer?.id) return;
    event.preventDefault();
    pointer.x = pointer.originX + (event.clientX - pointer.startX) / pointer.scale;
    pointer.y = pointer.originY + (event.clientY - pointer.startY) / pointer.scale;
  }, listener);
  canvas.addEventListener('lostpointercapture', event => {
    if (event.pointerId === pointer?.id) pointer = null;
  }, listener);

  function control() {
    if (pointer) return pointer;
    if (!manual) return null;
    const pressed = (arrow, letter) => keys.has(arrow) || keys.has(letter);
    return {
      dx: Number(pressed('ArrowRight', 'KeyD')) - Number(pressed('ArrowLeft', 'KeyA')),
      dy: Number(pressed('ArrowDown', 'KeyS')) - Number(pressed('ArrowUp', 'KeyW')),
      fire: fireQueued || keys.has('Space'),
    };
  }

  function clearHistory() {
    historyCtx.fillStyle = '#17152b';
    historyCtx.fillRect(0, 0, history.width, history.height);
  }
  clearHistory();

  function pushHistory(bands) {
    historyCtx.drawImage(history, -1, 0);
    historyCtx.fillStyle = '#17152b';
    historyCtx.fillRect(history.width - 1, 0, 1, PITCH_BINS);
    if (!bands) return;
    for (let bin = 0; bin < PITCH_BINS; bin++) {
      if (bands[bin] < PITCH_FLOOR) continue;
      historyCtx.globalAlpha = bands[bin] ** 1.3;
      historyCtx.fillStyle = colors(bin)[1];
      historyCtx.fillRect(history.width - 1, PITCH_BINS - 1 - bin, 1, 1);
    }
    historyCtx.globalAlpha = 1;
  }

  function resize(width, height) {
    if (width < 1 || height < 1 || width === layout?.width && height === layout?.height) return;
    const pixelRatio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const scale = Math.min(width / FIELD_WIDTH, height / FIELD_HEIGHT);
    layout = { width, height, scale };
    pointer = null;
    flight.resize(width / scale, height / scale);
    space = paintSpace(width, height, width >= height);
  }

  function render(dt, frame, presentation = 0) {
    if (!layout) return;
    const spectrum = frame?.status === 'live' || frame?.status === 'demo' ? frame.spectrum : null;
    if (frame !== previousFrame) {
      const newSource = frame?.source !== previousFrame?.source || frame?.generation !== previousFrame?.generation;
      if (newSource || !frame) clearHistory();
      if (frame) pushHistory(spectrum?.bands);
      previousFrame = frame;
    }
    flight.listen(dt, frame);
    lag = Math.min(lag + dt, STEP * 5);
    while (lag >= STEP) {
      flight.advance(control());
      fireQueued = false;
      lag -= STEP;
    }

    ctx.drawImage(space, 0, 0);
    const playing = manual || !!pointer;
    const labelOpacity = playing ? 1 : Math.max(0, 1 - presentation * 2);
    ctx.save();
    ctx.scale(layout.scale, layout.scale);
    drawArena(ctx, flight, shipArt, playerArt, spectrum?.level ?? 0, labelOpacity);
    ctx.restore();
    if (spectrum || flight.bpm || labelOpacity > 0) drawHud(ctx, history, flight, layout, playing, touch, presentation, labelOpacity);
  }

  function dispose() {
    events.abort();
    canvas.removeAttribute('tabindex');
    canvas.removeAttribute('aria-keyshortcuts');
  }
  return { resize, render, dispose };
}
