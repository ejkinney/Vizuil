import assert from 'node:assert/strict';
import { PITCH_BINS } from '../Web/flight.mjs';
import { BANDS_PER_WING, FLEET_SIZE, SwarmFlight, WING_COUNT } from '../Web/swarm-flight.mjs';

const idle = { dx: 0, dy: 0, fire: false };
function settle(flight) {
  for (let tick = 0; tick < 144; tick++) flight.advance(idle);
}

const wide = new SwarmFlight(1000, 500);
settle(wide);
assert.equal(wide.ships.length, 24);
assert.equal(wide.field.columns, 8);
assert(wide.wings.every(wing => wing.ships.length === 3));
const xs = wide.ships.map(ship => ship.x);
assert(Math.max(...xs) - Math.min(...xs) > 730, 'The fleet must spread across the widescreen arena');
const firstFleet = wide.ships;
wide.resize(400, 880);
assert.equal(wide.field.columns, 4);
assert.equal(wide.ships, firstFleet, 'Rotating the display must keep the current wave');
assert(wide.ships.every(ship => ship.x > 0 && ship.x < 400 && ship.y > 0 && ship.y < 880));
assert(Math.abs(wide.player.y / 880 - 0.848) < 0.001);

const shotsByBand = [];
for (let bin = 0; bin < PITCH_BINS; bin++) {
  const flight = new SwarmFlight();
  settle(flight);
  const bands = new Float32Array(PITCH_BINS);
  bands[bin] = 0.9;
  flight.fireVolley(bands, 0.65);
  assert.deepEqual(flight.enemyShots.map(shot => shot.bin), [bin]);
  const [shot] = flight.enemyShots;
  const [leader] = flight.wings[Math.floor(bin / BANDS_PER_WING)].ships;
  assert.equal(shot.x, leader.x);
  assert.equal(leader.flash, 1);
  assert.equal(flight.bandFlashes[bin], 1);
  shotsByBand.push(flight.enemyShots[0]);
}
for (let bin = 4; bin < PITCH_BINS; bin += 4) {
  const lower = shotsByBand[bin - 1];
  const higher = shotsByBand[bin];
  assert(lower.radius > higher.radius, 'Lower frequency shots should be bigger');
  assert(Math.hypot(lower.vx, lower.vy) < Math.hypot(higher.vx, higher.vy), 'Lower frequency shots should travel slower');
}
for (const [bin, shouldHit] of [[0, true], [31, false]]) {
  const flight = new SwarmFlight();
  settle(flight);
  flight.enemyShots.push({ ...shotsByBand[bin], x: flight.player.x + 15, y: flight.player.y, vx: 0, vy: 0 });
  flight.advance(idle);
  assert.equal(flight.player.shieldUntil > 0, shouldHit, 'Hit detection should use the projectile size');
}

const manual = new SwarmFlight();
settle(manual);
const startY = manual.player.y;
for (let tick = 0; tick < 23; tick++) manual.advance({ ...idle, dy: -1 });
assert(manual.player.y < startY - 100);
for (let tick = 0; tick < 23; tick++) manual.advance({ ...idle, dy: 1 });
assert(Math.abs(manual.player.y - startY) < 1);
const [target, wingmate] = manual.wings[0].ships;
for (let tick = 0; tick < 140 && target.alive; tick++) {
  manual.advance({ x: target.x, y: 290, fire: true });
}
assert(!target.alive, 'Player shots should destroy a ship in the fleet');
assert.equal(manual.score, (FLEET_SIZE - manual.remaining) * 100);
const bands = new Float32Array(PITCH_BINS);
bands[3] = 0.9;
manual.fireVolley(bands, 0.65);
assert.equal(manual.enemyShots.length, 1);
assert.equal(manual.enemyShots[0].x, wingmate.x, 'A surviving wingmate takes over for the destroyed leader');

const chord = new SwarmFlight();
settle(chord);
bands.fill(0);
for (const bin of [2, 15, 29]) bands[bin] = 0.17;
chord.fireVolley(bands, 0.65);
assert.equal(chord.enemyShots.length, 0, 'A quiet band must not fire');
for (const bin of [2, 15, 29]) bands[bin] = 0.19;
bands[1] = 0.7;
bands[14] = 0.5;
chord.fireVolley(bands, 0.65);
assert.deepEqual(chord.enemyShots.map(shot => shot.bin), [1, 14, 29], 'Each active wing fires for its strongest band');
assert.deepEqual([...chord.bandFlashes.keys()].filter(bin => chord.bandFlashes[bin]), [1, 14, 29]);
chord.clearEnemyFire();
bands.fill(0.9);
chord.fireVolley(bands, 0.65);
assert.equal(chord.enemyShots.length, WING_COUNT, 'Even a full spectrum produces at most one shot per wing');
chord.clearEnemyFire();
chord.fireVolley(bands, 0.65);
assert.equal(chord.enemyShots.length, WING_COUNT, 'Treble can respond on consecutive beats as well as bass');

const synced = new SwarmFlight();
settle(synced);
const volleys = [];
const launches = [];
const original = synced.fireVolley.bind(synced);
synced.fireVolley = (bands, density) => {
  const before = synced.enemyShots.length;
  original(bands, density);
  volleys.push({ time: synced.time, beat: synced.motion.beat, phase: synced.motion.phase,
    bins: synced.enemyShots.slice(before).map(shot => shot.bin) });
};
const audio = (bpm, kick, levels, generation = 1, status = 'demo') => {
  const bands = new Float32Array(PITCH_BINS);
  for (const bin of levels) bands[bin] = 0.9;
  return { source: 'demo', generation, status, spectrum: { bpm, hits: [kick, 0, 0], bands } };
};
const step = (frame, control = idle) => {
  synced.listen(1 / 60, frame);
  const previous = new Set(synced.playerShots);
  synced.advance(control);
  if (synced.playerShots.some(shot => !previous.has(shot))) launches.push({ time: synced.time, pulse: synced.player.pulse });
};
for (let i = 0; i < 72; i++) step(audio(null, i % 2, [1, 17]));
assert.equal(volleys.length, 0, 'Wait for a tempo lock before firing');

step(audio(150, 0, []));
for (let i = 0; i < 10; i++) step(audio(150, 1, [29]));
assert.equal(volleys.length, 0, 'A false bass hit from an offbeat treble sound must not anchor the tempo');
const start = synced.time;
for (let tick = 0; tick < 24 * 7; tick++) {
  const beat = Math.floor(tick / 24);
  const offset = tick % 24;
  const levels = offset < 4 ? [1, ...(beat % 2 === 0 ? [17] : [])] : offset === 12 ? [29] : [];
  step(audio(150, beat + 2, levels), { ...idle, fire: true });
}
assert.equal(volleys.length, 7, 'The same kick band should shoot on every beat at 150 BPM');
assert.equal(launches.length, 7, 'Holding Space must not add shots between locked beats');
for (const [beat, volley] of volleys.entries()) {
  assert.deepEqual(volley.bins, beat % 2 === 0 ? [1, 17] : [1], 'Use the active bands around the beat');
  assert(Math.abs(volley.time - start - (0.4 * beat + 4 / 60)) <= 1 / 60, 'Volleys should remain in tempo');
  assert.equal(launches[beat].pulse, 1, 'Start the nose pulse on the exact frame that launches the shot');
  assert.equal(launches[beat].time, volley.time, 'The player and enemy volleys share a frame');
  assert.equal(volley.beat, beat, 'The formation and volleys share the beat count');
  assert.equal(volley.phase, 0, 'The formation and volleys start their beat on the same frame');
}
assert(synced.player.pulse < 0.01, 'The nose light should fade between beats');

step(audio(150, 9, [1]));
for (let i = 0; i < 4; i++) step(audio(150, 0, [31], 2, 'quiet'));
assert.equal(volleys.length, 7, 'Changing sources cancels a pending beat');
assert.equal(launches.length, 7);
assert.equal(synced.enemyShots.length, 0);
assert(synced.bandFlashes.every(value => value === 0));
for (let i = 0; i < 70; i++) step(audio(150, 0, [31], 2, 'quiet'));
assert.equal(volleys.length, 7, 'Quiet frames should never trigger enemy fire');
assert(launches.length > 7, 'The player should keep time through a quiet passage while tempo is locked');

const dance = new SwarmFlight(880, 500, () => 0);
settle(dance);
const samples = new Map();
for (let tick = 0; tick < 30 * 27; tick++) {
  const beat = Math.floor(tick / 30);
  dance.listen(1 / 60, audio(120, beat, [0, 16]));
  dance.advance(idle);
  if (!dance.motion.running) continue;
  const { beat: index, phase } = dance.motion;
  const [low] = dance.wings[0].ships;
  const [quiet] = dance.wings[1].ships;
  if (phase === 0) samples.set(index, { pattern: dance.patternName, x: low.x, y: low.y, quietY: quiet.y });
  if (phase >= 0.3 && phase < 0.34) {
    const start = samples.get(index);
    start.lowLunge = low.y - start.y;
    start.quietLunge = quiet.y - start.quietY;
  }
}
assert.equal(samples.get(7).pattern, 'Beat Sweep');
assert.equal(samples.get(8).pattern, 'Four-Beat Dive');
assert.equal(samples.get(15).pattern, 'Four-Beat Dive');
assert.equal(samples.get(16).pattern, 'Spectrum Lunge');
assert.equal(samples.get(24).pattern, 'Beat Sweep');
assert(Math.abs(samples.get(2).x - samples.get(3).x) > 150, 'The whole formation should sweep on consecutive beats');
assert(samples.get(14).y - samples.get(12).y > 70, 'The dive should reach its low point halfway through the four beats');
assert(samples.get(18).lowLunge - samples.get(18).quietLunge > 40, 'Loud wings should lunge farther than quiet wings');
for (let tick = 0; tick < 20; tick++) {
  dance.listen(1 / 60, null);
  dance.advance(idle);
}
assert.equal(dance.motion.running, false);
assert.equal(dance.motion.amount, 0, 'The formation should settle after disconnecting');

const auto = new SwarmFlight(880, 500, () => 0.8);
for (let tick = 0; tick < 60 * 8; tick++) auto.advance(null);
assert.equal(auto.remaining, FLEET_SIZE, 'Autopilot keeps the full formation visible while waiting for the beat');
assert.equal(auto.playerShots.length, 0);
const patterns = new Set();
for (let tick = 0; tick < 60 * 360; tick++) {
  const beat = Math.floor(tick / 30);
  const levels = [0, 2, 7 + beat % 5, 16 + beat % 7, 25 + beat % 7];
  auto.listen(1 / 60, audio(120, beat, levels));
  auto.advance(null);
  patterns.add(auto.patternName);
}
assert.deepEqual([...patterns], ['Beat Sweep', 'Spectrum Lunge', 'Four-Beat Dive']);
assert(auto.wave >= 3, 'Autopilot should clear and replace fleets using only beat-locked shots');
console.log('24-ship layouts, spectrum volleys, synchronized choreography, and automatic wave progression passed.');
