import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SignalDeskAudio, signalDeskCamera } from '../Web/signal-desk.mjs';
import { OPERATOR_X, OPERATOR_Z } from '../Web/signal-desk-model.mjs';

const frame = (status = 'demo', bpm = 120) => ({
  source: status, status, generation: 1,
  spectrum: { bpm, hits: [0, 0, 0], bands: Array(32).fill(0) },
});
const camera = (signal, reducedMotion = false) => signalDeskCamera(signal.clock, 16 / 9, 1, reducedMotion).eye;
const shot = ([x, y]) => `${y > 3.15 ? 'high' : 'low'} ${x < OPERATOR_X ? 'left' : 'right'}`;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9);

test('Signal Desk follows the four-measure cycle, including when opened mid-song', () => {
  const signal = new SignalDeskAudio();
  const demo = frame();
  assert.equal(shot(camera(signal)), 'high left');
  assert.deepEqual([9, 13, 17, 21, 25].map(beatPosition => {
    signal.advance(0, { ...demo, beatPosition });
    return shot(camera(signal));
  }), ['low left', 'high right', 'high left', 'low right', 'low left']);
  assert.equal(shot(camera(signal, true)), 'high left');
});

test('Signal Desk glides on the downbeat and holds after 320 milliseconds', () => {
  for (const bpm of [120, 240]) {
    const signal = new SignalDeskAudio();
    const demo = frame('demo', bpm);
    const at = beatPosition => {
      signal.advance(0, { ...demo, beatPosition });
      return camera(signal);
    };
    const start = at(3.99);
    assert.deepEqual(at(4), start);
    const halfway = at(4 + .16 * bpm / 60);
    near(halfway[0], OPERATOR_X);
    assert.ok(halfway[2] > start[2], 'The glide follows an arc behind the chair');
    near(Math.hypot(halfway[0] - OPERATOR_X, halfway[2] - OPERATOR_Z), 3.2);
    near(halfway[1], (3.48 + 1.25) / 2);
    const settled = at(4 + .321 * bpm / 60);
    assert.equal(shot(settled), 'low right');
    assert.deepEqual(at(7.99), settled);
  }
});

test('Signal Desk returns to its first shot when the live beat grid resets', () => {
  const signal = new SignalDeskAudio();
  const live = frame('live');
  const first = camera(signal);
  const finishMeasure = period => {
    for (let beat = 0; beat < 5; beat++) signal.advance(period, live);
    signal.advance(.2, live);
    signal.advance(.14, live);
    assert.equal(shot(camera(signal)), 'low right');
  };
  finishMeasure(.5);
  live.spectrum.bpm = 240;
  signal.advance(0, live);
  assert.deepEqual(camera(signal), first);
  finishMeasure(.25);
  live.generation++;
  signal.advance(0, live);
  assert.deepEqual(camera(signal), first);
  finishMeasure(.25);
  signal.advance(0, null);
  assert.deepEqual(camera(signal), first);
});
