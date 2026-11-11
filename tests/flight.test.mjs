import assert from 'node:assert/strict';
import { Flight, layoutFor, muzzle, PITCH_BINS, projectileY, TICKS_PER_SECOND } from '../Web/flight.mjs';

const landscape = layoutFor(480, 270);
const testPitches = [2, 15, 28];
const noHits = [false, false, false];

for (const [band, pitch] of testPitches.entries()) {
  const bands = new Float32Array(PITCH_BINS);
  bands[pitch] = 0.9;
  const energy = [0, 0, 0];
  energy[band] = 0.9;
  const onset = new Flight(landscape);
  onset.advance({ level: 0.16, energy, bands }, testPitches.map((_, i) => i === band), 0.65);
  const sustained = new Flight(landscape);
  sustained.advance({ level: 0.8, energy, bands }, noHits, 0.65);
  for (const flight of [onset, sustained]) {
    assert(flight.shots.length > 0, `Expected shots from row ${pitch}`);
    assert.equal(flight.flashes[pitch], 1);
    const origin = muzzle(landscape, pitch);
    for (const shot of flight.shots) {
      assert.equal(shot.band, band);
      assert.equal(shot.pitch, pitch);
      assert.equal(shot.x, origin.x);
      assert.equal(projectileY(shot, shot.start), origin.y);
    }
  }
}
assert(muzzle(landscape, 2).y > muzzle(landscape, 15).y);
assert(muzzle(landscape, 15).y > muzzle(landscape, 28).y);

const bands = new Float32Array(PITCH_BINS);
for (const pitch of testPitches) {
  bands[pitch] = 0.9;
  bands[pitch + 1] = 0.4;
}
const simultaneous = new Flight(layoutFor(270, 584));
simultaneous.advance({ level: 0.8, energy: [0.9, 0.9, 0.9], bands }, [true, true, true], 0.65);
assert.deepEqual([...new Set(simultaneous.shots.map(shot => shot.pitch))], testPitches);
assert.deepEqual(Array.from(simultaneous.flashes.keys()).filter(pitch => simultaneous.flashes[pitch]), testPitches);
bands.fill(0.005);
const dark = new Flight(landscape);
dark.advance({ level: 0.8, energy: [0.9, 0.9, 0.9], bands }, [true, true, true], 0.65);
assert.equal(dark.shots.length, 0);
assert(dark.flashes.every(intensity => intensity === 0));
console.log('Onset and sustained shots match their pitch rows, including simultaneous hits and dark bands.');

for (const [width, height] of [[480, 270], [270, 480], [270, 584]]) {
  const layout = layoutFor(width, height);
  const flight = new Flight(layout, 0xa1c786db);
  const ticks = 30 * 60 * TICKS_PER_SECOND;
  const start = performance.now();
  let peak = 0, lowest = 1, highest = 0;
  const families = new Set();
  const pitches = new Set();
  const spectrum = { level: 0, energy: [1, 0.94, 0.87], bands: new Float32Array(PITCH_BINS) };
  for (let tick = 0; tick < ticks; tick++) {
    spectrum.level = 0.65 + 0.35 * Math.abs(Math.sin(tick / 161));
    spectrum.bands.fill(0);
    const peaks = [Math.floor(tick / 101) % 8, 8 + Math.floor(tick / 127) % 14, 22 + Math.floor(tick / 73) % 10];
    for (let band = 0; band < peaks.length; band++) {
      spectrum.bands[peaks[band]] = band === Math.floor(tick / 173) % 3 ? 1 : 0.8;
    }
    const hot = tick % 720 < 680;
    flight.advance(hot ? spectrum : null,
      [tick % 21 === 0, tick % 16 === 5, tick % 11 === 8], 1);
    peak = Math.max(peak, flight.shots.length);
    const y = flight.shipAt().y;
    lowest = Math.min(lowest, y);
    highest = Math.max(highest, y);
    for (const shot of flight.shots) {
      families.add(shot.band);
      pitches.add(shot.pitch);
      const x = shot.x - shot.speed * (flight.time - shot.start);
      if (Math.abs(x - layout.shipX) > layout.marginX + shot.radius / width + shot.speed / TICKS_PER_SECOND) continue;
      // Sample within the next tick as well as at its boundary.
      for (const part of [0, 0.25, 0.5, 0.75, 1]) {
        const age = part / TICKS_PER_SECOND;
        if (Math.abs(x - shot.speed * age - layout.shipX) > layout.marginX + shot.radius / width) continue;
        const separation = Math.abs(projectileY(shot, flight.time + age) - flight.shipAt(flight.tick + part).y);
        if (separation <= layout.marginY + shot.radius / height) assert.fail(`Collision at tick ${tick}, ${width}×${height}`);
      }
    }
  }
  assert(peak >= 65 && peak <= 240, `Unexpected peak projectile count ${peak}`);
  assert(highest - lowest > 0.26, 'The ship should make visible dodges across the scene');
  assert.equal(families.size, 3);
  assert.equal(pitches.size, PITCH_BINS);
  for (let tick = 0; tick < 4 * TICKS_PER_SECOND; tick++) flight.advance(null, noHits, 1);
  assert.equal(flight.shots.length, 0, 'Quiet passages should clear the playfield');
  console.log(`${width}×${height}: 30 minutes simulated, ${flight.emitted} projectiles, peak ${peak}, no collisions (${Math.round(performance.now() - start)} ms).`);
}
