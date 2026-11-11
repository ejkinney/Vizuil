import assert from 'node:assert/strict';
import { StickDance } from '../Web/stick-dancer.mjs';
import { beatStackStep, jerseyClubPose, JERSEY_MOVE_COUNT } from '../Web/jersey-club.mjs';

const dt = 1 / 32;
const frame = (peaks = {}, bpm = null, generation = 1) => ({
  source: 'live', status: 'live', generation,
  spectrum: { bands: Array.from({ length: 32 }, (_, band) => peaks[band] ?? 0), hits: [0, 0, 0], bpm },
});
const targets = dance => dance.limbs.map(({ reach, bend }) => [reach.target, bend.target]);

for (const [index, bands] of [[0, [0, 5]], [1, [6, 11]], [2, [12, 19]], [3, [20, 31]]]) {
  for (const band of bands) {
    let rolls = 0;
    const dance = new StickDance(() => ++rolls / 10);
    const rest = targets(dance);
    dance.advance(dt, frame({ [band]: 0.25 }));
    assert.deepEqual(targets(dance), rest, `Weak signal in band ${band} should be ignored`);
    const held = frame({ [band]: 0.9 });
    dance.advance(dt, held);
    const firstPose = targets(dance);
    assert.deepEqual(firstPose.flatMap((target, i) => target.some((angle, joint) => angle !== rest[i][joint]) ? [i] : []), [index]);
    assert.notEqual(dance.limbs[index].reach.angle, rest[index][0]);
    for (let tick = 0; tick < 40; tick++) dance.advance(dt, held);
    assert.equal(rolls, 3, 'A held frequency should trigger one pose');
    assert.equal(dance.palette, 0, 'Movement works before tempo locks');
    dance.advance(dt, frame());
    dance.advance(dt, held);
    assert.notDeepEqual(targets(dance)[index], firstPose[index], 'Another hit should choose a fresh pose');
    dance.advance(dt, null);
    assert.deepEqual(targets(dance), rest, 'Disconnect should release all joints');
    for (let tick = 0; tick < 48; tick++) dance.advance(dt, null);
    assert.equal(dance.limbs[index].reach.angle, rest[index][0], 'A released limb should come fully to rest');
  }
}

const softHit = frame({ 31: 0.28 });
const sparse = new StickDance();
sparse.advance(dt, { ...softHit, density: 0 });
assert.equal(sparse.limbs[3].timeLeft, 0);
const dense = new StickDance();
dense.advance(dt, { ...softHit, density: 1 });
assert(dense.limbs[3].timeLeft > 0, 'Higher density should let softer peaks trigger a pose');

const dance = new StickDance();
function beats(count, input) {
  for (let tick = 0; tick < count * 16; tick++) dance.advance(dt, input);
}

const locked = frame({}, 120);
for (let beat = 1; beat <= 40; beat++) {
  beats(1, locked);
  assert.equal(dance.palette, Math.floor(beat / 8) % 5, `Palette on beat ${beat}`);
  assert.equal(dance.move, Math.floor((beat - 1) / 8) % JERSEY_MOVE_COUNT, `Move on beat ${beat}`);
}
beats(7, locked);
const lastPalette = dance.palette;
beats(8, frame());
assert.equal(dance.groove, 0, 'Losing lock should return to frequency-only movement');
beats(7, locked);
assert.equal(dance.palette, lastPalette, 'Relock should start a fresh eight-beat count');
assert.equal(dance.move, 0, 'Relock should restart with the Beat Stack step');
beats(1, locked);
assert.equal(dance.palette, (lastPalette + 1) % 5);
beats(7, locked);
const replacement = frame({}, 120, 2);
beats(7, replacement);
assert.equal(dance.palette, (lastPalette + 1) % 5, 'A new source should start a fresh eight-beat count');
beats(1, replacement);
assert.equal(dance.palette, (lastPalette + 2) % 5);

for (const beat of [0, 0.18, 0.36, 0.54, 0.76, 1.5]) {
  assert.deepEqual(jerseyClubPose(0, beat).feet, beatStackStep(beat).feet,
    'The first Stick Dancer move should use Beat Stack footwork');
}
const runningMan = jerseyClubPose(1, 0.5);
const runningManOtherSide = jerseyClubPose(1, 1.5);
assert(runningMan.feet[1][1] < -0.5 && runningManOtherSide.feet[0][1] < -0.5, 'Running Man should alternate knee lifts');
assert(jerseyClubPose(1, 0).feet[0][0] > jerseyClubPose(1, 0).feet[1][0], 'Running Man should cross the feet');
assert(jerseyClubPose(2, 1).hip[0] - jerseyClubPose(2, 0).hip[0] > 1.3, 'Jersey Slide should travel across the stage');
const hipRock = jerseyClubPose(3, 0);
const hipRockOtherSide = jerseyClubPose(3, 1);
assert(hipRock.hip[0] < 0 && hipRockOtherSide.hip[0] > 0, 'Rock Yo Hips should shift weight between sides');
assert.deepEqual(hipRock.feet.map(foot => foot[0]), hipRockOtherSide.feet.map(foot => foot[0]), 'Rock Yo Hips should keep a wide stance');
assert(hipRock.hands.every(([x, y]) => Math.hypot(x, y) < 0.3), 'Hands should stay near the hips');

const accented = new StickDance(() => 0.85);
const plain = new StickDance(() => 0.85);
for (let tick = 0; tick < 30; tick++) {
  accented.advance(dt, locked);
  plain.advance(dt, locked);
}
accented.advance(dt, frame({ 14: 0.92 }, 120));
plain.advance(dt, locked);
assert.equal(accented.groove, 1);
assert.deepEqual(accented.choreography, plain.choreography, 'Frequency peaks should leave beat timing intact');
assert.deepEqual(accented.limbs.map(limb => limb.timeLeft > 0), [false, false, false, false],
  'A midrange hit should not interrupt the timed dance');

console.log('Beat Stack lead step, steady choreography, tempo resets, and eight-beat palettes passed.');
