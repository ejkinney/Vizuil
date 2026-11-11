import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SceneShuffle } from '../Web/scene-shuffle.mjs';

const frame = (beatPosition, generation = 1, bpm = 120) => ({
  source: 'demo', status: 'demo', generation, beatPosition,
  spectrum: { bpm, hits: [0], bands: [] },
});

test('32 bars changes after 128 beats and then waits another 128', () => {
  const shuffle = new SceneShuffle();
  for (let beat = 0; beat < 128; beat++) assert.equal(shuffle.advance(0.5, frame(beat)), false);
  assert.equal(shuffle.advance(0.5, frame(128)), true);
  for (let beat = 129; beat < 256; beat++) assert.equal(shuffle.advance(0.5, frame(beat)), false);
  assert.equal(shuffle.advance(0.5, frame(256)), true);
});

test('64 bars and source changes start a new full interval', () => {
  const shuffle = new SceneShuffle();
  shuffle.setBars(64);
  for (let beat = 0; beat < 255; beat++) assert.equal(shuffle.advance(0.5, frame(beat)), false);
  assert.equal(shuffle.advance(0.5, frame(255)), false);
  assert.equal(shuffle.advance(0.5, frame(256)), true);
  assert.equal(shuffle.advance(0.5, frame(257, 2)), false);
  for (let beat = 258; beat < 513; beat++) assert.equal(shuffle.advance(0.5, frame(beat, 2)), false);
  assert.equal(shuffle.advance(0.5, frame(513, 2)), true);
});

test('shuffle pauses without a detected tempo', () => {
  const shuffle = new SceneShuffle();
  for (let beat = 0; beat < 110; beat++) shuffle.advance(0.5, frame(beat));
  assert.equal(shuffle.advance(0.5, frame(110, 1, null)), false);
  for (let beat = 111; beat < 239; beat++) assert.equal(shuffle.advance(0.5, frame(beat)), false);
  assert.equal(shuffle.advance(0.5, frame(239)), true);
});
