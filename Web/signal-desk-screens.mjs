export const BINS = 32;
export const COLUMNS = 108;
export const SCREEN_INTERVAL = 1 / 30;
const WIDTH = 320, HEIGHT = 208;

const palettes = [
  [[.57, 1, .18], [.25, .98, .77]],
  [[.25, .87, 1], [.60, .46, 1]],
  [[.91, .43, 1], [1, .36, .52]],
  [[1, .77, .26], [1, .40, .22]],
];
const css = rgb => `rgb(${rgb.map(value => Math.round(value * 255)).join(' ')})`;
export const PALETTES = palettes.map(([primary, secondary]) => ({
  primary, secondary, ink: css(primary), alt: css(secondary),
}));

export function createDeskScreens() {
  const atlas = document.createElement('canvas');
  atlas.width = WIDTH * 3;
  atlas.height = HEIGHT * 2;
  const ctx = atlas.getContext('2d', { alpha: false });
  const heatmap = document.createElement('canvas');
  heatmap.width = COLUMNS;
  heatmap.height = BINS;
  const heat = heatmap.getContext('2d', { alpha: false });
  const pixels = heat.createImageData(COLUMNS, BINS);
  for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 255;

  function label(text, x, y, size = 13, color = '#c8ddcf') {
    ctx.fillStyle = color;
    ctx.font = `700 ${size}px Consolas, monospace`;
    ctx.fillText(text, x, y);
  }

  function grid(x, y, w, h, ink, columns, rows) {
    ctx.strokeStyle = ink;
    ctx.globalAlpha = .26;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= columns; i++) {
      const px = x + w * i / columns;
      ctx.moveTo(px, y);
      ctx.lineTo(px, y + h);
    }
    for (let i = 0; i <= rows; i++) {
      const py = y + h * i / rows;
      ctx.moveTo(x, py);
      ctx.lineTo(x + w, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function spectrogram(signal, colors) {
    const { data } = pixels;
    for (let col = 0; col < COLUMNS; col++) {
      const offset = ((signal.column + col) % COLUMNS) * BINS;
      for (let bin = 0; bin < BINS; bin++) {
        const dest = ((BINS - 1 - bin) * COLUMNS + col) * 4;
        const power = Math.min(1, signal.history[offset + bin] * 1.2) ** .78;
        const rgb = bin < 16 ? colors.primary : colors.secondary;
        for (let c = 0; c < 3; c++) data[dest + c] = 8 + power * (rgb[c] * 173 + 60 * power);
      }
    }
    heat.putImageData(pixels, 0, 0);
    label('SPECTROGRAM', 15, 24, 19, colors.ink);
    label('16 kHz', 15, 54, 13);
    label('40 Hz', 15, 169, 13);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(heatmap, 72, 42, 225, 126);
    grid(72, 42, 225, 126, colors.ink, 6, 4);
    ctx.fillStyle = colors.ink;
    ctx.fillRect(297, 42, 2, 126);
    for (let side = 0; side < 2; side++) {
      const { pitch, strength } = signal.hands[side];
      if (strength > .045) {
        const row = side * 16 + pitch * 15;
        ctx.fillStyle = side ? colors.alt : colors.ink;
        ctx.fillRect(299, 42 + (31 - row) / 31 * 126 - 2, 10, 4);
      }
    }
    label('PAST', 72, 188);
    label('NOW', 272, 188, 13, colors.ink);
  }

  function bands(signal, colors, side) {
    const ink = side ? colors.alt : colors.ink;
    label(side ? 'UPPER / HIGH' : 'BASS / LOW MID', 18, 31, 23, ink);
    grid(19, 48, 282, 120, ink, 8, 5);
    for (let i = 0; i < 16; i++) {
      const amount = signal.levels[side * 16 + i];
      const height = 2 + amount ** .73 * 113;
      const x = 22 + i * 17.45;
      ctx.fillStyle = ink;
      ctx.globalAlpha = .26 + amount * .67;
      ctx.fillRect(x, 167 - height, 13, height);
      ctx.globalAlpha = 1;
      ctx.fillRect(x, 166 - height, 13, 2);
    }
    const { pitch, strength } = signal.hands[side];
    if (strength > .045) {
      ctx.fillStyle = '#f2fff0';
      ctx.fillRect(22 + pitch * 15 * 17.45, 173, 9, 5);
    }
    label('HAND INPUT', 19, 193, 14);
  }

  function globe(signal, colors, time) {
    const cx = 160, cy = 100, radius = 69 + 4 * signal.pulse;
    label('FREQUENCY FIELD', 16, 22, 17, colors.ink);
    grid(16, 33, 288, 146, colors.ink, 8, 6);
    for (let line = -2; line <= 2; line++) {
      ctx.strokeStyle = colors.ink;
      ctx.globalAlpha = .60 - Math.abs(line) * .09;
      ctx.beginPath();
      ctx.ellipse(cx, cy + line * 22, radius * Math.sqrt(1 - (line * .30) ** 2), 12 - Math.abs(line) * 2, -.10, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let line = 0; line < 5; line++) {
      ctx.strokeStyle = colors.alt;
      ctx.globalAlpha = .59;
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * Math.max(.045, Math.abs(Math.sin(time * .52 + line * .63))), radius, -.21, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.ink;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < BINS; i++) {
      const height = 2 + 28 * signal.levels[i];
      ctx.fillStyle = i < 16 ? colors.ink : colors.alt;
      ctx.fillRect(20 + i * 8.8, 196 - height, 5, height);
    }
  }

  function traces(signal, colors) {
    label('SIGNAL TRACE', 17, 28, 22, colors.ink);
    grid(19, 46, 280, 137, colors.ink, 7, 4);
    for (let side = 0; side < 2; side++) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = side ? colors.alt : colors.ink;
      ctx.beginPath();
      for (let i = 0; i < COLUMNS; i++) {
        const start = ((signal.column + i) % COLUMNS) * BINS + side * 16;
        let peak = 0;
        for (let bin = start; bin < start + 16; bin++) peak = Math.max(peak, signal.history[bin]);
        const x = 19 + i / (COLUMNS - 1) * 280;
        const y = 110 + side * 61 - peak * 55;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function rhythm(signal, colors) {
    const { bpm, beats } = signal.clock;
    label('TEMPO', 18, 30, 22, colors.ink);
    label(bpm ? String(Math.round(bpm)) : '—', 17, 116, 78, colors.ink);
    label('BPM', 187, 112, 24);
    for (let i = 0; i < 8; i++) {
      const active = beats > 0 && i === (beats - 1) % 8;
      const x = 19 + i * 35 + (i >= 4 ? 5 : 0);
      ctx.fillStyle = active ? colors.ink : '#263437';
      ctx.fillRect(x, 143, 27, 30);
      if (i % 4 === 0) label(i === 0 ? '1' : '2', x + 7, 165, 17, active ? '#17221e' : '#b3c9ba');
    }
  }

  return {
    atlas,
    paint(signal, time) {
      const colors = PALETTES[signal.palette];
      const panels = [
        () => spectrogram(signal, colors), () => bands(signal, colors, 0), () => bands(signal, colors, 1),
        () => globe(signal, colors, time), () => traces(signal, colors), () => rhythm(signal, colors),
      ];
      for (const [i, draw] of panels.entries()) {
        ctx.save();
        ctx.translate(i % 3 * WIDTH, Math.floor(i / 3) * HEIGHT);
        ctx.beginPath();
        ctx.rect(0, 0, WIDTH, HEIGHT);
        ctx.clip();
        ctx.fillStyle = '#0a1418';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        draw();
        ctx.restore();
      }
    },
  };
}
