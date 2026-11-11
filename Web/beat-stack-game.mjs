export const COLUMNS = 8;
export const ROWS = 14;
export const BINS = 32;
export const BINS_PER_PIECE = 4;

function rotations(cells) {
  const turns = [];
  const layouts = new Set();
  while (true) {
    const layout = cells.map(([x, y]) => x + y * COLUMNS).sort((a, b) => a - b).join(',');
    if (layouts.has(layout)) return turns;
    layouts.add(layout);
    turns.push(cells);
    const right = Math.max(...cells.map(([, y]) => y));
    cells = cells.map(([x, y]) => [right - y, x]);
  }
}

// Four adjacent logarithmic analyzer bands share one piece, from bass to treble.
export const PIECES = [
  { colors: ['#963f58', '#fc6e79', '#ffc5b4'], cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { colors: ['#9b4d33', '#ff9d55', '#ffdeb0'], cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { colors: ['#8d6e2e', '#f4ce62', '#fff1a4'], cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { colors: ['#5b732f', '#b9e361', '#eafda3'], cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
  { colors: ['#277367', '#62d9b5', '#b6ffe5'], cells: [[1, 0], [1, 1], [1, 2], [0, 2]] },
  { colors: ['#345ba0', '#65a8ff', '#c1e1ff'], cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { colors: ['#59468c', '#a58bf6', '#e4ceff'], cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { colors: ['#893d75', '#ed80c7', '#ffcae9'], cells: [[0, 0], [1, 0]], capsule: true },
].map(({ cells, ...style }) => ({ ...style, turns: rotations(cells) }));

export class PieceSelector {
  peaks = Array(BINS).fill(0);
  credit = Array(PIECES.length).fill(0);

  sample(bands) {
    for (let bin = 0; bin < BINS; bin++) {
      this.peaks[bin] = Math.max(this.peaks[bin] * 0.96, bands?.[bin] ?? 0);
    }
  }

  next(density) {
    let winner = null;
    let total = 0;
    for (let type = 0; type < PIECES.length; type++) {
      const start = type * BINS_PER_PIECE;
      let bin = start;
      for (let i = start + 1; i < start + BINS_PER_PIECE; i++) {
        if (this.peaks[i] > this.peaks[bin]) bin = i;
      }
      const strength = Math.max(0, this.peaks[bin] - 0.14);
      if (!strength) {
        this.credit[type] = 0;
        continue;
      }
      const weight = strength ** (1.65 - density * 1.1);
      total += weight;
      this.credit[type] += weight;
      if (!winner || this.credit[type] > this.credit[winner.type]) winner = { type, bin };
    }
    if (winner) this.credit[winner.type] -= total;
    return winner;
  }
}

function startingBoard() {
  const board = Array(ROWS * COLUMNS).fill(null);
  const floor = ['......6.', '24...171', '413..256'];
  floor.forEach((row, index) => {
    [...row].forEach((value, x) => {
      if (value === '.') return;
      const cell = (ROWS - floor.length + index) * COLUMNS + x;
      board[cell] = { type: Number(value) - 1, id: -1 - cell };
    });
  });
  return board;
}

export function pieceCells({ type, turn, x, y }) {
  return PIECES[type].turns[turn].map(([dx, dy]) => [x + dx, y + dy]);
}

function fits(board, piece) {
  return pieceCells(piece).every(([x, y]) => x >= 0 && x < COLUMNS && y < ROWS && !board[y * COLUMNS + x]);
}

function land(board, piece) {
  let y = piece.y;
  while (fits(board, { ...piece, y: y + 1 })) y++;
  return { ...piece, y };
}

function place(board, piece) {
  const next = [...board];
  for (const [x, y] of pieceCells(piece)) next[y * COLUMNS + x] = { type: piece.type, id: piece.id };
  return next;
}

function findClear(board) {
  const lines = [];
  for (let row = 0; row < ROWS; row++) {
    if (board.slice(row * COLUMNS, (row + 1) * COLUMNS).every(Boolean)) lines.push(row);
  }
  if (lines.length) {
    return { lines, cells: lines.flatMap(row => Array.from({ length: COLUMNS }, (_, x) => row * COLUMNS + x)) };
  }

  const cells = new Set();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLUMNS; x++) {
      const first = y * COLUMNS + x;
      const tile = board[first];
      if (!tile) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const stride = dy * COLUMNS + dx;
        const preceding = (x - dx >= 0 && y - dy >= 0) ? board[first - stride] : null;
        if (preceding?.type === tile.type) continue;
        const run = [];
        let shared = false;
        for (let step = 0; x + step * dx < COLUMNS && y + step * dy < ROWS; step++) {
          const index = first + step * stride;
          if (board[index]?.type !== tile.type) break;
          if (board[index].id !== tile.id) shared = true;
          run.push(index);
        }
        if (run.length >= 4 && shared) run.forEach(index => cells.add(index));
      }
    }
  }
  return cells.size ? { lines, cells: [...cells] } : null;
}

function collapse(board, { lines, cells }) {
  if (lines.length) {
    return Array(lines.length * COLUMNS).fill(null).concat(
      board.filter((_, index) => !lines.includes(Math.floor(index / COLUMNS))));
  }
  const next = [...board];
  const cleared = new Set(cells);
  // Gravity pulls down the tiles above a match while preserving any gaps below it.
  for (let x = 0; x < COLUMNS; x++) {
    let destination = ROWS - 1;
    for (let y = ROWS - 1; y >= 0; y--) {
      const index = y * COLUMNS + x;
      if (!cleared.has(index)) next[destination-- * COLUMNS + x] = board[index];
    }
    while (destination >= 0) next[destination-- * COLUMNS + x] = null;
  }
  return next;
}

function placementValue(board, piece) {
  const placed = place(board, piece);
  const clear = findClear(placed);
  const result = clear ? collapse(placed, clear) : placed;
  const heights = Array(COLUMNS).fill(0);
  let holes = 0;
  let neighbors = 0;
  for (let x = 0; x < COLUMNS; x++) {
    for (let y = 0; y < ROWS; y++) {
      const index = y * COLUMNS + x;
      if (!result[index]) {
        if (heights[x]) holes++;
        continue;
      }
      heights[x] ||= ROWS - y;
      const tile = result[index];
      const adjoining = [x < COLUMNS - 1 ? result[index + 1] : null, result[index + COLUMNS]];
      neighbors += adjoining.filter(other => other?.type === tile.type && other.id !== tile.id).length;
    }
  }
  const totalHeight = heights.reduce((sum, height) => sum + height, 0);
  const roughness = heights.slice(1).reduce((sum, height, index) => sum + Math.abs(height - heights[index]), 0);
  return (clear?.cells.length ?? 0) * 3 + (clear?.lines.length ?? 0) * 2 + neighbors * 0.72 -
    holes * 4.2 - roughness * 0.34 - totalHeight * 0.31 - Math.max(...heights) ** 2 * 0.11;
}

function planDrop(board, piece) {
  const turns = PIECES[piece.type].turns.length;
  const seen = new Set([piece.x]);
  const reachable = [{ piece, path: [] }];
  let best = { path: [], score: -Infinity };
  for (const { piece: pose, path } of reachable) {
    const score = placementValue(board, land(board, pose)) - path.length * 0.22;
    if (score > best.score) best = { path, score };
    // The route is made of legal turns and one-column moves above the pile.
    for (const [dx, turn] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) {
      const next = { ...pose, x: pose.x + dx, turn: (pose.turn + turn + turns) % turns };
      const key = next.x + next.turn * COLUMNS;
      if (seen.has(key) || !fits(board, next)) continue;
      seen.add(key);
      reachable.push({ piece: next, path: [...path, next] });
    }
  }
  return best.path;
}

export class BeatStackGame {
  board = startingBoard();
  beat = 0;
  round = 1;
  cleared = 0;
  placed = 0;
  active = null;
  next = null;
  topOut = false;
  pendingClear = null;
  path = [];

  step(selectPiece) {
    this.beat++;
    if (this.topOut) {
      this.board = startingBoard();
      this.topOut = false;
      this.round++;
      return { kind: 'restart' };
    }
    if (this.pendingClear) {
      const clear = this.pendingClear;
      const previous = new Map(this.board.flatMap((tile, index) => tile ? [[tile, index]] : []));
      const tiles = clear.cells.map(index => ({ index, type: this.board[index].type }));
      this.board = collapse(this.board, clear);
      this.cleared += tiles.length;
      this.pendingClear = findClear(this.board);
      return { kind: 'clear', tiles, previous };
    }
    if (!this.active) {
      const choice = this.next ?? selectPiece();
      if (!choice) return { kind: 'rest' };
      const shape = PIECES[choice.type].turns[0];
      const width = 1 + Math.max(...shape.map(([x]) => x));
      const piece = { ...choice, id: this.placed + 1, x: Math.floor((COLUMNS - width) / 2), y: 0, turn: 0 };
      if (!fits(this.board, piece)) {
        this.topOut = true;
        this.next = choice;
        return { kind: 'top' };
      }
      this.active = piece;
      this.path = planDrop(this.board, piece);
      this.next = selectPiece();
      return { kind: 'spawn', to: piece };
    }

    const from = this.active;
    const nextPose = this.path.shift();
    if (nextPose) {
      this.active = nextPose;
      return { kind: nextPose.turn === from.turn ? 'shift' : 'turn', from, to: nextPose };
    }
    const target = land(this.board, from);
    if (from.y === 0 && target.y >= 4) {
      this.active = { ...from, y: Math.ceil(target.y * 0.44) };
      return { kind: 'drop', from, to: this.active };
    }
    this.board = place(this.board, target);
    this.active = null;
    this.placed++;
    this.pendingClear = findClear(this.board);
    return { kind: 'land', from, to: target };
  }

  landing() {
    return this.active ? land(this.board, this.active) : null;
  }
}
