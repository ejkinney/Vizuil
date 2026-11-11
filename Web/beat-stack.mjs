import { BeatClock } from './beat-clock.mjs';
import { BeatStackGame, PieceSelector, PIECES, COLUMNS, ROWS, BINS, BINS_PER_PIECE, pieceCells } from './beat-stack-game.mjs';
import { drawPlayer } from './beat-stack-player.mjs';

const PAPER = '#f8eddc';
const MUTED = '#c1b5cc';
const LIME = '#d9f38e';
const GRAPH = '#1b1428';
const HISTORY_WIDTH = 140;
const FONT = 'Consolas, ui-monospace, monospace';
const TITLE = '"Archivo Black", "Arial Black", system-ui, sans-serif';
const WIDE = { width: 1000, height: 592, gridX: 381, gridY: 59, cell: 33, sideX: 690, sideWidth: 285 };
const TALL = { width: 400, height: 502, gridX: 21, gridY: 89, cell: 26, sideX: 246, sideWidth: 142 };
const lerp = (a, b, t) => a + (b - a) * t;
const section = bin => Math.floor(bin / BINS_PER_PIECE);
const frequency = edge => 40 * 400 ** (edge / BINS);

function frequencyLabel(hz) {
  return hz >= 1000 ? `${Number((hz / 1000).toFixed(1))}k` : String(Math.round(hz));
}

const ranges = PIECES.map((_, type) =>
  [frequency(type * BINS_PER_PIECE), frequency((type + 1) * BINS_PER_PIECE)].map(frequencyLabel).join('–'));

function text(ctx, value, x, y, size, color = PAPER, font = FONT, weight = 700) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillText(value, x, y);
}

function panel(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function drawBackdrop(ctx, width, height, centerX) {
  const halo = ctx.createRadialGradient(centerX, height * 0.46, 10, centerX, height * 0.46, Math.max(width * 0.6, height * 0.7));
  halo.addColorStop(0, '#42334f');
  halo.addColorStop(0.57, '#231b36');
  halo.addColorStop(1, '#131022');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath();
  for (let x = -height; x < width; x += 28) {
    ctx.moveTo(x, height);
    ctx.lineTo(x + height * 0.85, 0);
  }
  ctx.strokeStyle = '#d0b3d509';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function block(ctx, x, y, size, type, hot = false) {
  const [dark, color, light] = PIECES[type].colors;
  const round = PIECES[type].capsule ? size * 0.4 : size * 0.12;
  const rim = size * 0.11;
  panel(ctx, x, y, size, size, round, dark);
  panel(ctx, x + rim, y + rim * 0.67, size - rim * 2, size - rim * 2.25, round * 0.8, color);
  if (size >= 13) {
    ctx.fillStyle = light;
    ctx.globalAlpha = hot ? 0.95 : 0.62;
    ctx.fillRect(x + size * 0.26, y + size * 0.2, size * 0.48, size * 0.085);
    ctx.globalAlpha = 1;
  }
}

function capsule(ctx, [[x1, y1], [x2, y2]], size, color, hot) {
  const [dark, main, light] = color;
  const length = Math.hypot(x2 - x1, y2 - y1);
  ctx.save();
  ctx.translate((x1 + x2 + size) / 2, (y1 + y2 + size) / 2);
  ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
  const width = size + length;
  panel(ctx, -width / 2, -size * 0.46, width, size * 0.92, size * 0.46, dark);
  panel(ctx, -width / 2 + size * 0.1, -size * 0.39, width - size * 0.2, size * 0.68, size * 0.34, main);
  panel(ctx, -width * 0.3, -size * 0.27, width * 0.6, size * (hot ? 0.11 : 0.075), size * 0.05, light);
  ctx.fillStyle = dark;
  ctx.fillRect(-size * 0.025, -size * 0.32, size * 0.05, size * 0.67);
  ctx.restore();
}

function shape(ctx, type, coordinates, size, hot) {
  if (PIECES[type].capsule) capsule(ctx, coordinates, size, PIECES[type].colors, hot);
  else for (const [x, y] of coordinates) block(ctx, x, y, size, type, hot);
}

function preview(ctx, type, centerX, centerY, cell) {
  const points = PIECES[type].turns[0];
  const left = centerX - (1 + Math.max(...points.map(([x]) => x))) * cell / 2;
  const top = centerY - (1 + Math.max(...points.map(([, y]) => y))) * cell / 2;
  shape(ctx, type, points.map(([x, y]) => [left + x * cell, top + y * cell]), cell * 0.9, false);
}

function drawTitle(ctx, wide, game, pulse, tempo, spectrum, status) {
  const x = wide ? 24 : 14;
  const y = wide ? 54 : 23;
  ctx.fillStyle = tempo ? LIME : '#8f7c9b';
  ctx.beginPath();
  ctx.arc(x + 3, y - 4, wide ? 4 : 2.5, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, 'AUTOPLAY', x + (wide ? 16 : 10), y, wide ? 12 : 9, MUTED);
  if (wide) {
    text(ctx, 'BEAT', x - 4, 131, 82, PAPER, TITLE, 950);
    text(ctx, 'STACK', x - 4, 206, 82, LIME, TITLE, 950);
  } else {
    text(ctx, 'BEAT', x - 2, 61, 38, PAPER, TITLE, 950);
    text(ctx, 'STACK', x + 6 + ctx.measureText('BEAT').width, 61, 38, LIME, TITLE, 950);
  }
  const beatX = wide ? x : 285;
  const beatY = wide ? 237 : 30;
  const step = wide ? 37 : 24;
  for (let beat = 0; beat < 4; beat++) {
    const active = tempo && game.beat && (game.beat - 1) % 4 === beat;
    ctx.fillStyle = active ? (pulse > 0.35 ? '#f6ffbc' : LIME) : '#685775';
    ctx.fillRect(beatX + beat * step, beatY, step - (wide ? 5 : 4), wide ? 5 : 3);
  }
  const message = tempo ? `${Math.round(tempo)} BPM` : spectrum || status === 'quiet' ? 'FINDING TEMPO' : 'WAITING FOR AUDIO';
  text(ctx, message, beatX, beatY + (wide ? 24 : 20), wide ? 13 : 9, tempo ? LIME : MUTED);
}

function drawField(ctx, layout, game, action, motion, pulse) {
  const { gridX: x, gridY: y, cell, wide } = layout;
  const width = cell * COLUMNS;
  const height = cell * ROWS;
  const edge = wide ? 15 : 9;
  const head = wide ? 32 : 17;
  const foot = wide ? 39 : 28;
  const [,, light] = PIECES[game.active?.type ?? action.to?.type ?? 3].colors;

  panel(ctx, x - edge - 3, y - head + 9, width + (edge + 3) * 2, height + head + foot + 4, 17, '#151121');
  const enamel = ctx.createLinearGradient(x, y - head, x + width, y + height);
  enamel.addColorStop(0, '#51445f');
  enamel.addColorStop(0.55, '#2d253d');
  enamel.addColorStop(1, '#473656');
  panel(ctx, x - edge, y - head, width + edge * 2, height + head + foot, wide ? 15 : 10, enamel, '#826d91');
  ctx.fillStyle = pulse > 0.22 ? light : '#9981aa';
  ctx.fillRect(x, y - (wide ? 12 : 7), width, wide ? 2 : 1.5);
  if (wide) text(ctx, `ROUND ${String(game.round).padStart(2, '0')}`, x, y - 18, 10, MUTED);
  panel(ctx, x - 2, y - 2, width + 4, height + 4, 2, '#130f1e', '#a494b45c');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = '#191427';
  ctx.fillRect(x, y, width, height);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#221a2f' : '#241b32';
      ctx.fillRect(x + col * cell + 1, y + row * cell + 1, cell - 1, cell - 1);
    }
  }

  const tileAt = index => [x + (index % COLUMNS) * cell + 1, y + Math.floor(index / COLUMNS) * cell + 1];
  const inFlight = motion < 1 && action.kind === 'land' ? action.to.id : 0;
  const progress = 1 - (1 - motion) ** 3;
  for (const [index, tile] of game.board.entries()) {
    if (!tile || tile.id === inFlight) continue;
    const [tx, ty] = tileAt(index);
    const startY = motion < 1 && action.previous ? tileAt(action.previous.get(tile))[1] : ty;
    block(ctx, tx, lerp(startY, ty, progress), cell - 2, tile.type);
  }
  if (game.active) {
    const ghost = game.landing();
    if (ghost.y !== game.active.y) {
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = `${PIECES[ghost.type].colors[1]}73`;
      for (const [gx, gy] of pieceCells(ghost)) {
        ctx.beginPath();
        ctx.roundRect(x + gx * cell + 3, y + gy * cell + 3, cell - 6, cell - 6, 3);
        ctx.stroke();
      }
    }
  }
  const piece = inFlight ? action.to : game.active;
  if (piece) {
    const target = pieceCells(piece);
    const from = action.from && motion < 1 ? pieceCells(action.from) : target;
    const offset = action.kind === 'spawn' ? (1 - progress) * -0.86 : 0;
    const coordinates = target.map(([col, row], i) => [
      x + lerp(from[i][0], col, progress) * cell + 1,
      y + (lerp(from[i][1], row, progress) + offset) * cell + 1,
    ]);
    shape(ctx, piece.type, coordinates, cell - 2, pulse > 0.3);
  }

  if (action.kind === 'clear' && motion < 1) {
    const alpha = 1 - motion;
    for (const { index, type } of action.tiles) {
      const [tx, ty] = tileAt(index);
      const [, color, bright] = PIECES[type].colors;
      ctx.globalAlpha = alpha * 0.56;
      ctx.fillStyle = color;
      ctx.fillRect(tx, ty, cell - 2, cell - 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = bright;
      ctx.fillRect(tx, ty + cell * 0.48, cell - 1, 2);
      for (let spark = 0; spark < 4; spark++) {
        const angle = index * 1.7 + spark * Math.PI * 0.5;
        const travel = (0.2 + motion) * cell * (0.68 + spark * 0.22);
        ctx.fillRect(tx + cell / 2 + Math.cos(angle) * travel, ty + cell / 2 + Math.sin(angle) * travel, 3, 3);
      }
    }
    ctx.globalAlpha = 1;
  }
  if (game.topOut) {
    panel(ctx, x + 20, y + height * 0.39, width - 40, 49, 7, '#241b34f0', '#b88caa');
    ctx.textAlign = 'center';
    text(ctx, 'NEXT ROUND', x + width / 2, y + height * 0.39 + 30, 14, PAPER);
    ctx.textAlign = 'start';
  }
  ctx.restore();
  text(ctx, `${String(game.cleared).padStart(3, '0')} CLEARED`, x, y + height + (wide ? 24 : 19), wide ? 13 : 10, LIME);
  ctx.textAlign = 'right';
  text(ctx, wide ? `${String(game.placed).padStart(3, '0')} PLAYED` : `ROUND ${game.round}`,
    x + width, y + height + (wide ? 24 : 19), wide ? 11 : 9, MUTED);
  ctx.textAlign = 'start';
}

function drawSpectrum(ctx, layout, history, choice, pulse) {
  const { wide, sideX: x, sideWidth: width } = layout;
  const head = wide ? 34 : 74;
  const cardHeight = wide ? 138 : 84;
  const y = wide ? 221 : 195;
  const graphWidth = width - (wide ? 109 : 34);
  const rowHeight = wide ? 8.75 : 5.4;
  const groupHeight = rowHeight * BINS_PER_PIECE;
  const graphHeight = rowHeight * BINS;
  const [dark, accent] = PIECES[choice?.type ?? 3].colors;

  panel(ctx, x, head, width, cardHeight, wide ? 12 : 8, '#2b213a', '#7c6286');
  ctx.fillStyle = choice ? accent : '#776387';
  ctx.fillRect(x + (wide ? 14 : 10), head + (wide ? 37 : 25), width - (wide ? 28 : 20), 1);
  text(ctx, 'NEXT', x + (wide ? 14 : 10), head + (wide ? 25 : 17), wide ? 13 : 10, PAPER);
  if (choice) {
    const binHz = frequency(choice.bin + 0.5);
    const pitch = binHz >= 1000 ? `${(binHz / 1000).toFixed(1)} kHz` : `${Math.round(binHz)} Hz`;
    ctx.textAlign = 'right';
    text(ctx, pitch, x + width - (wide ? 14 : 10), head + (wide ? 25 : 17), wide ? 13 : 10, accent);
    ctx.textAlign = 'start';
    preview(ctx, choice.type, x + width / 2, head + (wide ? 88 : 56), wide ? 26 : 15);
  } else {
    ctx.textAlign = 'center';
    text(ctx, '—', x + width / 2, head + (wide ? 96 : 61), wide ? 23 : 14, MUTED);
    ctx.textAlign = 'start';
  }

  text(ctx, 'SPECTROGRAM', x, y - (wide ? 19 : 13), wide ? 13 : 10, PAPER);
  ctx.textAlign = 'right';
  text(ctx, wide ? 'FREQUENCY / Hz' : '16 kHz', x + width, y - (wide ? 19 : 13), wide ? 10 : 9, MUTED);
  ctx.textAlign = 'start';
  panel(ctx, x - 1, y - 1, width + 2, graphHeight + 2, 4, GRAPH, '#776487');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(history, x, y, graphWidth, graphHeight);
  for (const [type, { colors }] of PIECES.entries()) {
    const row = y + (PIECES.length - 1 - type) * groupHeight;
    const active = choice?.type === type;
    ctx.fillStyle = active ? `${dark}9e` : '#30253f';
    ctx.fillRect(x + graphWidth, row, width - graphWidth, groupHeight);
    ctx.fillStyle = colors[1];
    ctx.fillRect(x + graphWidth - (active ? 4 : 2), row + 1, active ? 4 : 2, groupHeight - 2);
    ctx.fillStyle = '#b5a3cc35';
    if (type < PIECES.length - 1) ctx.fillRect(x, row, width, 0.8);
    preview(ctx, type, x + graphWidth + (wide ? 22 : 18), row + groupHeight / 2, wide ? 6.4 : 4.6);
    if (wide) text(ctx, ranges[type], x + graphWidth + 41, row + groupHeight / 2 + 4, 10.5, active ? accent : MUTED);
  }
  if (choice) {
    const row = y + (BINS - 1 - choice.bin) * rowHeight;
    const highlight = ctx.createLinearGradient(x, row, x + graphWidth, row);
    highlight.addColorStop(0, '#ffffff00');
    highlight.addColorStop(1, PIECES[choice.type].colors[2]);
    ctx.globalAlpha = 0.25 + pulse * 0.49;
    ctx.fillStyle = highlight;
    ctx.fillRect(x, row, graphWidth, rowHeight);
    ctx.globalAlpha = 1;
  }
  text(ctx, '40 Hz', x, y + graphHeight + (wide ? 17 : 13), wide ? 10 : 9, MUTED);
  ctx.textAlign = 'right';
  text(ctx, 'NOW', x + graphWidth, y + graphHeight + (wide ? 17 : 13), wide ? 10 : 9, MUTED);
  ctx.textAlign = 'start';
}

export function createBeatStack(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const history = document.createElement('canvas');
  history.width = HISTORY_WIDTH;
  history.height = BINS;
  const historyCtx = history.getContext('2d', { alpha: false });
  const consolePanel = document.getElementById('console');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const clock = new BeatClock();
  let game, selector, previousFrame, layout;
  let age, duration, action;

  function reset() {
    game = new BeatStackGame();
    selector = new PieceSelector();
    action = { kind: 'rest' };
    age = 1;
    duration = 0.2;
    historyCtx.fillStyle = GRAPH;
    historyCtx.fillRect(0, 0, HISTORY_WIDTH, BINS);
  }
  reset();

  function sample(bands) {
    selector.sample(bands);
    historyCtx.drawImage(history, -1, 0);
    historyCtx.fillStyle = GRAPH;
    historyCtx.fillRect(HISTORY_WIDTH - 1, 0, 1, BINS);
    if (!bands) return;
    for (let bin = 0; bin < BINS; bin++) {
      if (bands[bin] < 0.055) continue;
      historyCtx.globalAlpha = Math.min(1, (bands[bin] * 1.35) ** 1.48);
      historyCtx.fillStyle = PIECES[section(bin)].colors[1];
      historyCtx.fillRect(HISTORY_WIDTH - 1, BINS - 1 - bin, 1, 1);
    }
    historyCtx.globalAlpha = 1;
  }

  function resize(width, height) {
    if (width < 1 || height < 1 || width === layout?.viewportWidth && height === layout?.viewportHeight) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    const wide = width / height >= 1.17;
    layout = { ...(wide ? WIDE : TALL), wide, viewportWidth: width, viewportHeight: height };
  }

  function render(dt, frame, presentation = 0) {
    if (!layout) return;
    const hasAudio = frame?.status === 'live' || frame?.status === 'demo';
    const spectrum = hasAudio ? frame.spectrum : null;
    if (frame !== previousFrame) {
      const newSource = frame?.generation !== previousFrame?.generation || frame?.source !== previousFrame?.source;
      if (newSource) reset();
      if (frame) sample(spectrum?.bands);
      previousFrame = frame;
    }
    age += dt;
    const tempo = frame?.spectrum.bpm;
    if (clock.advance(dt, frame)) {
      action = game.step(() => selector.next(frame.density ?? 0.6));
      duration = Math.min(0.2, 0.37 * 60 / tempo);
      age = 0;
    }
    const motion = Math.min(1, age / duration);
    const pulse = tempo ? Math.max(0, 1 - age / Math.min(0.27, 0.55 * 60 / tempo)) ** 1.5 : 0;
    const { wide, viewportWidth, viewportHeight, width, height } = layout;
    const margin = viewportWidth > 600 ? 24 : 8;
    const chrome = 1 - presentation;
    const top = lerp(margin, viewportWidth > 600 ? 70 : 51, chrome);
    const sidePanel = viewportWidth >= 900 && viewportHeight >= 420 && viewportWidth / viewportHeight >= 1.5;
    const consoleHeight = consolePanel?.offsetHeight ?? 0;
    const right = margin + (sidePanel && consoleHeight ? consolePanel.offsetWidth + 12 : 0) * chrome;
    const bottom = margin + (!sidePanel && consoleHeight ? consoleHeight + 8 : 0) * chrome;
    const scale = Math.max(0.1, Math.min((viewportWidth - right - margin) / width, (viewportHeight - top - bottom) / height));
    const x = margin + (viewportWidth - margin - right - width * scale) / 2;
    const y = top + (viewportHeight - top - bottom - height * scale) / 2;
    drawBackdrop(ctx, viewportWidth, viewportHeight, x + width * scale / 2);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    drawTitle(ctx, wide, game, pulse, tempo, spectrum, frame?.status);
    // Footwork and gestures are part of the beat visualization itself.
    const player = {
      tempo,
      beat: clock.started ? game.beat : 0,
      phase: Math.min(1, age * (tempo ?? 0) / 60),
      bounce: pulse,
      shift: action.kind === 'shift' ? Math.sign(action.to.x - action.from.x) : 0,
      dropping: (action.kind === 'drop' || action.kind === 'land') && action.to.y > action.from.y,
      motion,
    };
    if (wide) drawPlayer(ctx, 16, 284, 328, player);
    else drawPlayer(ctx, 246, 389, 143, player);
    drawField(ctx, layout, game, action, reducedMotion.matches ? 1 : motion, pulse);
    drawSpectrum(ctx, layout, history, game.next, pulse);
    ctx.restore();
  }

  return { resize, render };
}
