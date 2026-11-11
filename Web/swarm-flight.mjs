import { BeatClock } from './beat-clock.mjs';
import { PITCH_BINS } from './flight.mjs';

export const FIELD_WIDTH = 400;
export const FIELD_HEIGHT = 500;
export const STEP = 1 / 60;
export const PLAYER_NOSE_DISTANCE = 14;
export const WING_COUNT = 8;
export const BANDS_PER_WING = PITCH_BINS / WING_COUNT;
export const BEATS_PER_BAR = 4;
const BEATS_PER_PATTERN = 2 * BEATS_PER_BAR;
const WING_SLOTS = [[0, 10], [-22, -10], [22, -10]];
export const FLEET_SIZE = WING_COUNT * WING_SLOTS.length;
const BEAT_CAPTURE_SECONDS = 0.05;
const PLAYER_PULSE_SECONDS = 0.20;
const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);

const PATTERNS = [
  {
    name: 'Beat Sweep',
    pose: (beat, pulse) => ({
      x: -0.095 * Math.cos(Math.PI * beat),
      y: 0.025 * pulse,
      spread: 1,
      bank: -0.46 * Math.sin(Math.PI * beat),
    }),
  },
  {
    name: 'Four-Beat Dive',
    pose: (beat, pulse) => {
      const dive = (1 - Math.cos(TAU * beat / BEATS_PER_BAR)) / 2;
      return { x: 0, y: 0.15 * dive + 0.018 * pulse, spread: 1 - 0.16 * dive, bank: 0 };
    },
  },
  {
    name: 'Spectrum Lunge',
    pose: (beat, pulse, strength) => ({
      x: -0.042 * Math.cos(Math.PI * beat),
      y: (0.018 + 0.125 * strength) * pulse,
      spread: 1 + 0.07 * pulse,
      bank: -0.27 * Math.sin(Math.PI * beat),
    }),
  },
];

function fieldFor(width, height) {
  const columns = width >= 760 ? WING_COUNT : WING_COUNT / 2;
  const shipScale = Math.min(1.14, width * 0.7 / ((columns - 1) * 88));
  return { width, height, columns, shipScale, boltSpeed: 540 * height / FIELD_HEIGHT };
}

function formationAt(ship, field, motion, age, lead = 0) {
  const { width, height, columns, shipScale } = field;
  const { wing, slot } = ship;
  const row = Math.floor(wing.index / columns);
  const col = wing.index % columns;
  const spread = 2 * col / (columns - 1) - 1;
  const side = Math.sign(spread);
  const center = width / 2;
  const [slotX, slotY] = WING_SLOTS[slot];
  let x = center + spread * width * 0.35;
  let y = height * ((columns === WING_COUNT ? 0.35 : 0.45) - row * 0.20 + 0.07 * Math.abs(spread));
  let bank = 0;

  if (motion.amount > 0) {
    const progress = motion.phase + (motion.running ? lead / motion.period : 0);
    const beat = motion.beat + progress;
    const pulse = Math.sin(Math.PI * Math.min(1, progress) ** 0.6);
    const pose = PATTERNS[motion.mode].pose(beat, pulse, wing.strength);
    const transition = ease(Math.min(1, motion.beat % BEATS_PER_PATTERN + progress));
    if (transition < 1 && motion.mode !== motion.previous) {
      const previous = PATTERNS[motion.previous].pose(beat, pulse, wing.strength);
      for (const axis of ['x', 'y', 'spread', 'bank']) pose[axis] = mix(previous[axis], pose[axis], transition);
    }
    x += width * motion.amount * (pose.x + spread * 0.35 * (pose.spread - 1));
    y += height * motion.amount * pose.y;
    bank = motion.amount * pose.bank;
  }

  const entry = clamp((age + lead - Math.abs(spread) * 0.36 - row * 0.20) / 1.12, 0, 1);
  const arc = Math.sin(Math.PI * entry);
  return {
    x: mix(side * 55 + (side < 0 ? 0 : width), x, ease(entry)) + slotX * shipScale,
    y: y + (slotY * shipScale + height * 0.09 * arc),
    bank: bank - side * arc * 0.64,
  };
}

export class SwarmFlight {
  constructor(width = FIELD_WIDTH, height = FIELD_HEIGHT, random = Math.random) {
    this.field = fieldFor(width, height);
    this.random = random;
    this.time = 0;
    this.age = 0;
    this.wave = 0;
    this.score = 0;
    this.roundDelay = 0;
    this.enemyShots = [];
    this.playerShots = [];
    this.bursts = [];
    this.clock = new BeatClock();
    this.audioFrame = null;
    this.bpm = null;
    this.beatIndex = -1;
    this.beatBands = new Float32Array(PITCH_BINS);
    this.captureLeft = 0;
    this.beatShotPending = false;
    this.bandFlashes = new Float32Array(PITCH_BINS);
    this.motion = { mode: 0, previous: 0, beat: -1, phase: 0, period: 0.5, amount: 0, running: false };
    this.player = { x: width / 2, y: height * 0.848, bank: 0, nextShot: 0, shieldUntil: 0, pulse: 0 };
    this.spawnFleet();
  }

  resize(width, height) {
    const xRatio = width / this.field.width;
    const yRatio = height / this.field.height;
    for (const actors of [[this.player], this.playerShots, this.enemyShots, this.bursts]) {
      for (const actor of actors) {
        actor.x *= xRatio;
        actor.y *= yRatio;
      }
    }
    for (const shot of this.enemyShots) {
      shot.vx *= xRatio;
      shot.vy *= yRatio;
    }
    this.player.x = clamp(this.player.x, 16, width - 16);
    this.player.y = clamp(this.player.y, height * 0.54, height - 30);
    this.field = fieldFor(width, height);
    for (const ship of this.ships) Object.assign(ship, formationAt(ship, this.field, this.motion, this.age));
  }

  spawnFleet() {
    this.age = 0;
    this.wave++;
    this.target = null;
    this.wings = Array.from({ length: WING_COUNT }, (_, index) => {
      const wing = { index, strength: 0 };
      wing.ships = WING_SLOTS.map((_, slot) => {
        const ship = { wing, slot, alive: true, flash: 0 };
        return Object.assign(ship, formationAt(ship, this.field, this.motion, this.age));
      });
      return wing;
    });
    this.ships = this.wings.flatMap(wing => wing.ships);
    this.remaining = this.ships.length;
  }

  get patternName() {
    return PATTERNS[this.motion.mode].name;
  }

  clearEnemyFire() {
    this.bandFlashes.fill(0);
    this.enemyShots.length = 0;
    for (const ship of this.ships) ship.flash = 0;
  }

  listen(dt, frame) {
    const previous = this.audioFrame;
    const active = frame?.status === 'live' || frame?.status === 'demo';
    const wasActive = previous?.status === 'live' || previous?.status === 'demo';
    const rhythm = active || frame?.status === 'quiet' ? frame.spectrum : null;
    const sameSource = frame?.generation === previous?.generation && frame?.source === previous?.source;
    this.audioFrame = frame;
    this.bpm = rhythm?.bpm ?? null;
    if (!sameSource || !active && wasActive) this.clearEnemyFire();

    const beat = this.clock.advance(dt, frame);
    if (!sameSource || !this.bpm) {
      this.captureLeft = 0;
      this.beatIndex = -1;
      this.beatShotPending = false;
      this.player.pulse = 0;
      this.motion.running = false;
    }
    if (!this.bpm) return;
    if (beat) {
      // Collect one stream interval around the beat so a kick arriving just after the clock edge still counts.
      this.beatIndex++;
      if (active) this.beatBands.set(rhythm.bands);
      else this.beatBands.fill(0);
      this.captureLeft = BEAT_CAPTURE_SECONDS;
      return;
    }
    if (this.captureLeft <= 0) return;
    if (active) {
      for (let bin = 0; bin < PITCH_BINS; bin++) this.beatBands[bin] = Math.max(this.beatBands[bin], rhythm.bands[bin]);
    }
    this.captureLeft -= dt;
    if (this.captureLeft <= 1e-6) {
      this.captureLeft = 0;
      this.beatShotPending = true;
    }
  }

  fireVolley(bands, density) {
    const floor = mix(0.27, 0.14, density);
    for (const wing of this.wings) {
      const first = wing.index * BANDS_PER_WING;
      let bin = first;
      for (let candidate = first + 1; candidate < first + BANDS_PER_WING; candidate++) {
        if (bands[candidate] > bands[bin]) bin = candidate;
      }
      const strength = bands[bin];
      wing.strength = strength >= floor ? strength : 0;
      if (wing.strength === 0) continue;
      const ship = wing.ships.find(ship => ship.alive && ship.x >= 13 && ship.x <= this.field.width - 13);
      if (!ship) continue;
      this.bandFlashes[bin] = 1;
      ship.flash = 1;
      const pitch = wing.index / (WING_COUNT - 1);
      const radius = mix(9.5, 3.1, pitch);
      const speed = (mix(105, 222, pitch) + 46 * strength) * this.field.height / FIELD_HEIGHT;
      const y = ship.y + 8 + radius;
      const angle = clamp(Math.atan2(this.player.x - ship.x, this.player.y - y), -0.72, 0.72);
      this.enemyShots.push({ x: ship.x, y, vx: speed * Math.sin(angle), vy: speed * Math.cos(angle), radius, bin });
    }
  }

  autopilot() {
    const { player, field } = this;
    if (!this.target?.alive) {
      let best = Infinity;
      for (const ship of this.ships) {
        if (!ship.alive) continue;
        const cost = Math.abs(ship.x - player.x) - 0.72 * ship.y;
        if (cost >= best) continue;
        this.target = ship;
        best = cost;
      }
    }
    let x = field.width * (0.5 + 0.16 * Math.sin(this.time * 2));
    let y = field.height * (0.782 + 0.124 * Math.sin(this.time * 1.47));
    if (this.target?.alive) {
      const travel = Math.max(0, player.y - this.target.y) / field.boltSpeed;
      x = formationAt(this.target, field, this.motion, this.age, travel).x;
    }
    let nearest = 0.43;
    for (const shot of this.enemyShots) {
      const until = (player.y - shot.y) / shot.vy;
      const offset = player.x - (shot.x + until * shot.vx);
      if (until < -0.04 || until >= nearest || Math.abs(offset) > 32 + shot.radius) continue;
      const direction = player.x < 58 ? 1 : player.x > field.width - 58 ? -1 : Math.sign(offset) || 1;
      x = player.x + direction * 55;
      y = player.y + 22;
      nearest = until;
    }
    return { x, y };
  }

  advance(control) {
    this.time += STEP;
    this.age += STEP;
    const { motion } = this;
    const beat = this.beatShotPending;
    if (beat) {
      if (!motion.running) motion.previous = motion.mode;
      if (this.beatIndex > 0 && this.beatIndex % BEATS_PER_PATTERN === 0) {
        motion.previous = motion.mode;
        motion.mode = (motion.mode + 1 + Math.floor(this.random() * (PATTERNS.length - 1))) % PATTERNS.length;
      }
      motion.beat = this.beatIndex;
      motion.phase = 0;
      motion.period = 60 / this.bpm;
      motion.running = true;
    } else if (motion.running) {
      motion.phase = Math.min(1, motion.phase + STEP / motion.period);
    }
    motion.amount = clamp(motion.amount + (motion.running ? 1 : -1) * STEP * 5, 0, 1);
    for (let bin = 0; bin < PITCH_BINS; bin++) this.bandFlashes[bin] *= 0.92;
    for (const ship of this.ships) {
      if (!ship.alive) continue;
      Object.assign(ship, formationAt(ship, this.field, motion, this.age));
      ship.flash *= 0.88;
    }
    if (beat) {
      const { status, density } = this.audioFrame;
      if (status === 'live' || status === 'demo') this.fireVolley(this.beatBands, density ?? 0.65);
      else for (const wing of this.wings) wing.strength = 0;
    }

    const { player, field } = this;
    const input = control ?? this.autopilot();
    const limit = Math.max(320, field.width * 0.65) * STEP;
    const targetX = clamp(input.x ?? player.x + input.dx * limit, 16, field.width - 16);
    const targetY = clamp(input.y ?? player.y + input.dy * limit, field.height * 0.54, field.height - 30);
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const distance = Math.hypot(dx, dy);
    const fraction = distance > limit ? limit / distance : 1;
    player.x += dx * fraction;
    player.y += dy * fraction;
    player.bank = mix(player.bank, clamp(dx * fraction / limit, -1, 1) * 0.37, 0.24);

    player.pulse = Math.max(0, player.pulse - STEP / PLAYER_PULSE_SECONDS);
    if (beat || !this.bpm && input.fire && this.time >= player.nextShot) {
      this.playerShots.push({
        x: player.x + PLAYER_NOSE_DISTANCE * Math.sin(player.bank),
        y: player.y - PLAYER_NOSE_DISTANCE * Math.cos(player.bank),
      });
      if (beat) player.pulse = 1;
      this.beatShotPending = false;
      player.nextShot = this.time + 0.155;
    }
    this.playerShots = this.playerShots.filter(shot => {
      const oldY = shot.y;
      shot.y -= field.boltSpeed * STEP;
      if (shot.y < -8) return false;
      let hit = null;
      for (const ship of this.ships) {
        if (!ship.alive || Math.abs(ship.x - shot.x) >= 13 * field.shipScale ||
            ship.y <= shot.y - 12 * field.shipScale || ship.y >= oldY + 12 * field.shipScale) continue;
        if (!hit || ship.y > hit.y) hit = ship;
      }
      if (!hit) return true;
      hit.alive = false;
      this.remaining--;
      this.score += 100;
      this.bursts.push({ x: hit.x, y: hit.y, wing: hit.wing.index, start: this.time });
      if (this.remaining === 0) this.roundDelay = this.time + 1.55;
      return false;
    });

    this.enemyShots = this.enemyShots.filter(shot => {
      shot.x += shot.vx * STEP;
      shot.y += shot.vy * STEP;
      if (shot.x < -12 || shot.x > field.width + 12 || shot.y > field.height + 16) return false;
      if (this.time >= player.shieldUntil && Math.hypot(player.x - shot.x, player.y - shot.y) < 8 + shot.radius) {
        this.hitPlayer();
        return false;
      }
      return true;
    });
    if (this.time >= player.shieldUntil && this.ships.some(ship =>
      ship.alive && Math.hypot(player.x - ship.x, player.y - ship.y) < 10 + 9 * field.shipScale)) this.hitPlayer();

    this.bursts = this.bursts.filter(burst => this.time - burst.start < 0.46);
    if (this.remaining === 0 && this.time >= this.roundDelay) this.spawnFleet();
  }

  hitPlayer() {
    const { player } = this;
    this.bursts.push({ x: player.x, y: player.y, wing: null, start: this.time });
    player.shieldUntil = this.time + 1.3;
  }
}
