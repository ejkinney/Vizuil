import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BeatStackGame, BINS, COLUMNS, PIECES, ROWS, PieceSelector, pieceForBin } from '../Web/beat-stack-game.mjs';
import { drawPlayer } from '../Web/beat-stack-player.mjs';

test('all 32 bands select one of the seven tetrominoes', () => {
  assert.equal(PIECES.length, 7);
  const covered = new Set();
  for (let bin = 0; bin < BINS; bin++) {
    const bands = Array(BINS).fill(0);
    bands[bin] = 1;
    const selector = new PieceSelector();
    selector.sample(bands);
    const type = pieceForBin(bin);
    assert.deepEqual(selector.next(0.65), { bin, type });
    assert(PIECES[type].turns.every(turn => turn.length === 4));
    covered.add(type);
  }
  assert.equal(covered.size, 7);
});

test('starts empty and clears only full rows, dropping the rows above together', () => {
  const game = new BeatStackGame();
  assert.equal(COLUMNS, 10);
  assert.equal(ROWS, 20);
  assert(game.board.every(cell => cell === null));
  const bottom = (ROWS - 1) * COLUMNS;
  const off = () => null;

  // Four adjacent cells of the same color from separate pieces should stay on the board.
  game.board[bottom] = { id: 10, type: 0 };
  game.active = { type: 0, id: 11, turn: 0, x: 1, y: ROWS - 1 };
  assert.equal(game.step(off).kind, 'land');
  assert.equal(game.step(off).kind, 'rest');
  assert.equal(game.board.filter(Boolean).length, 5);

  // A single O fills the last two columns of both rows, regardless of their colors.
  for (const row of [bottom - COLUMNS, bottom]) {
    for (let x = 0; x < COLUMNS - 2; x++) game.board[row + x] = { id: 20 + x, type: x % PIECES.length };
  }
  const remaining = { id: 99, type: 3 };
  game.board[bottom - COLUMNS * 2 + 2] = remaining;
  game.active = { type: 1, id: 30, turn: 0, x: COLUMNS - 2, y: ROWS - 2 };
  assert.equal(game.step(off).kind, 'land');
  assert.equal(game.step(off).tiles.length, COLUMNS * 2);
  assert.equal(game.cleared, 2);
  assert.equal(game.board[bottom + 2], remaining);
  assert.equal(game.board.filter(Boolean).length, 1);
});

test('the Beat Stack player points sideways, up, and down with elbows near the torso', () => {
  const strokes = [];
  let path = [];
  const ctx = {
    lineWidth: 0,
    beginPath() { path = []; }, moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    stroke() { strokes.push({ width: this.lineWidth, path }); },
    createLinearGradient() { return { addColorStop() {} }; },
    save() {}, restore() {}, translate() {}, scale() {}, arc() {}, ellipse() {}, fill() {},
  };
  const cue = (change) => {
    strokes.length = 0;
    drawPlayer(ctx, 0, 0, 320, { beat: 0, phase: 0, bounce: 0,
      shift: 0, dropping: false, turnSide: 0, actionPhase: 0.2, ...change });
    const arm = strokes.filter(({ width }) => width === 0.115).at(-1);
    const finger = strokes.filter(({ width }) => width === 0.065).at(-1);
    assert(arm && finger, 'The selected arm should draw a pointing finger');
    assert(Math.abs(arm.path[1][0] - arm.path[0][0]) < 0.3,
      `The elbow should stay close to the side: ${JSON.stringify(arm.path)}`);
    return finger.path;
  };
  const sideways = cue({ shift: 1 });
  assert(sideways[1][0] > sideways[0][0] + 0.1, 'A shift should point sideways');
  const upward = cue({ turnSide: 1 });
  assert(upward[1][1] < upward[0][1] - 0.1, 'A block turn should point up');
  const downward = cue({ dropping: true });
  assert(downward[1][1] > downward[0][1] + 0.1, 'A drop should point down');
});
