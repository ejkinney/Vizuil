import assert from 'node:assert/strict';
import { BrawlMotion } from '../Web/block-brawl-motion.mjs';

const DT = 1 / 120;
const frame = (bpm = 120) => ({ generation: 1, source: 'demo', status: 'demo', density: 0.65,
  spectrum: { bpm, bands: [0.8, ...Array(31).fill(0)], hits: [0, 0, 0] } });
const expected = [null, 'block', null, 'dodge', null, 'counter', null, 'kick'];
const ticks = (motion, input, seconds) => {
  for (let elapsed = 0; elapsed < seconds; elapsed += DT) motion.advance(DT, input);
};

for (const bpm of [50, 120, 220]) {
  const motion = new BrawlMotion();
  const input = frame(bpm);
  motion.advance(0, input);
  input.spectrum.hits[0]++;
  const beats = [];
  let previous;
  while (beats.length < 16 && motion.time < 24) {
    motion.advance(DT, input);
    const id = motion.lead * 8 + motion.beat;
    if (motion.beat < 0 || id === previous) continue;
    previous = id;
    const kind = expected[motion.beat];
    assert.equal(motion.accent?.kind ?? null, kind);
    assert.equal(motion.phase, 0, 'Each event starts at its authored downbeat pose');
    if (kind) {
      assert.equal(motion.accent.age, 0);
      assert.equal(motion.accent.actor, kind === 'counter' ? 1 - motion.lead : motion.lead);
      if (kind === 'block') {
        const separation = 2.6 - motion.poses.reduce((total, pose) => total + pose.x + pose.nearHand[0], 0);
        assert(separation > 0 && separation < 0.31, 'The two gloves meet at the block pose');
      }
      if (kind === 'dodge') {
        assert(motion.poses[1 - motion.lead].hip < 0.7, 'The defender ducks under the swing');
        assert(motion.poses[1 - motion.lead].z < -0.35);
      }
      if (kind === 'counter') assert(motion.poses[1 - motion.lead].nearHand[0] > 1.10);
      if (kind === 'kick') assert(motion.poses[motion.lead].nearFoot[1] > 1.3);
    }
    beats.push({ id, time: motion.time });
  }
  assert.deepEqual(beats.map(beat => beat.id), Array.from({ length: 16 }, (_, i) => i));
  for (const [index, beat] of beats.entries()) {
    assert(Math.abs(beat.time - beats[0].time - index * 60 / bpm) < DT + 1e-8);
  }
}

const motion = new BrawlMotion();
const input = frame(null);
ticks(motion, input, 1.5);
assert.equal(motion.beat, -1);
assert.equal(motion.accent, null);
input.spectrum.bpm = 120;
input.spectrum.hits[0]++;
motion.advance(DT, input);
assert.equal(motion.beat, 0);
ticks(motion, input, 0.51);
assert.equal(motion.accent.kind, 'block');
input.status = 'quiet';
input.spectrum.bpm = 120.2;
ticks(motion, input, 0.5);
assert.equal(motion.beat, 2, 'Brief silence and small tempo updates keep the phrase moving');
input.spectrum.bpm = 175;
motion.advance(DT, input);
assert.equal(motion.beat, -1, 'A new tempo clears the old phrase until the clock restarts');
assert.equal(motion.accent, null);
ticks(motion, input, 0.35);
assert.equal(motion.beat, 0);
ticks(motion, input, 0.35);
assert.equal(motion.accent.kind, 'block');
input.status = 'off';
ticks(motion, input, 0.22);
assert.equal(motion.beat, -1);
assert.equal(motion.accent, null);
assert(motion.poses.every(pose => Math.abs(pose.x) < 0.05), 'Stop returns both fighters to guard');

input.status = 'live';
input.source = 'live';
input.generation++;
ticks(motion, input, 0.7);
assert.equal(motion.accent.kind, 'block');
input.generation++;
input.spectrum.hits[0] = 0;
motion.advance(DT, input);
assert.equal(motion.beat, -1, 'A replacement audio endpoint drops the prior fight state');
assert.equal(motion.accent, null);
ticks(motion, input, 0.7);
assert.equal(motion.accent.kind, 'block');
motion.advance(DT, null);
assert.equal(motion.beat, -1);
assert.equal(motion.accent, null);
motion.advance(DT, input);
assert.equal(motion.beat, -1);
ticks(motion, input, 0.35);
assert.equal(motion.beat, 0, 'Reconnection starts a new phrase');

console.log('Block Brawl choreography at 50, 120, and 220 BPM, tempo changes, source resets, Stop, and reconnect passed.');
