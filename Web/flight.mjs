export const TICKS_PER_SECOND = 60;
export const PITCH_BINS = 32;
export const PITCH_FLOOR = 0.01;
export const CARRIER_PANEL = { x: -52, y: -32, width: 28, height: 64 };

// Match the bass, mid, and treble groups used by the audio analyzer.
const FAMILY_EDGES = [0, 8, 22, PITCH_BINS];
const STEP = 8;
const LANES = 19;
const MAX_SHOTS = 240;
const MAX_STEPS = 25;
const ease = x => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function layoutFor(width, height) {
  const portrait = height > width;
  const yMin = portrait ? 0.27 : 0.23;
  const yMax = portrait ? 0.81 : 0.78;
  return {
    portrait, width, height,
    shipX: portrait ? 0.22 : 0.19,
    carrierX: portrait ? 0.82 : 0.83,
    carrierY: portrait ? 0.37 : 0.48,
    carrierScale: portrait ? 0.73 : 1,
    cruiseY: portrait ? 0.64 : 0.58,
    lanes: Array.from({ length: LANES }, (_, i) => lerp(yMin, yMax, i / (LANES - 1))),
    marginX: 17 / width,
    marginY: 10 / height,
  };
}

export function pitchFamily(bin) {
  return bin < FAMILY_EDGES[1] ? 0 : bin < FAMILY_EDGES[2] ? 1 : 2;
}

export function pitchRowY(bin) {
  return CARRIER_PANEL.y + (PITCH_BINS - bin - 0.5) * CARRIER_PANEL.height / PITCH_BINS;
}

export function muzzle(layout, bin) {
  return {
    x: layout.carrierX + CARRIER_PANEL.x * layout.carrierScale / layout.width,
    y: layout.carrierY + pitchRowY(bin) * layout.carrierScale / layout.height,
  };
}

function strongestPitch(bands, first, end) {
  let pitch = -1;
  let peak = 0;
  for (let bin = first; bin < end; bin++) {
    const strength = bands[bin];
    if (strength >= PITCH_FLOOR && strength > peak) {
      pitch = bin;
      peak = strength;
    }
  }
  return pitch;
}

export function projectileY(shot, time) {
  const age = time - shot.start;
  return shot.y + shot.vy * age + shot.wave * (Math.sin(shot.phase + age * shot.frequency) - Math.sin(shot.phase));
}

// The lane graph spans the full time each projectile can cross the ship. Edges check the
// swept interval, including the space between animation frames and between lane centers.
function planRoute(layout, start, fromLane, shots, target) {
  const secondsPerStep = STEP / TICKS_PER_SECOND;
  const obstacles = Array.from({ length: MAX_STEPS }, () => []);
  let lastStep = 0;
  for (const shot of shots) {
    const marginX = layout.marginX + shot.radius / layout.width;
    const marginY = layout.marginY + shot.radius / layout.height;
    const crossing = shot.start + (shot.x - layout.shipX) / shot.speed;
    const enter = crossing - marginX / shot.speed;
    const leave = crossing + marginX / shot.speed;
    if (leave < start) continue;
    const first = Math.max(0, Math.floor((enter - start) / secondsPerStep));
    const last = Math.floor((leave - start) / secondsPerStep);
    if (last >= MAX_STEPS) return null;
    lastStep = Math.max(lastStep, last);
    for (let step = first; step <= last; step++) {
      const stepStart = start + step * secondsPerStep;
      const begin = Math.max(stepStart, enter);
      const end = Math.min(stepStart + secondsPerStep, leave);
      const y = projectileY(shot, (begin + end) / 2);
      const sweep = (Math.abs(shot.vy) + Math.abs(shot.wave * shot.frequency)) * (end - begin) / 2;
      obstacles[step].push({
        begin: ease(clamp((begin - stepStart) / secondsPerStep, 0, 1)),
        end: ease(clamp((end - stepStart) / secondsPerStep, 0, 1)),
        low: y - sweep - marginY,
        high: y + sweep + marginY,
      });
    }
  }

  let costs = new Float64Array(LANES).fill(Infinity);
  costs[fromLane] = 0;
  const parents = [];
  const lanes = layout.lanes;
  for (let step = 0; step <= lastStep; step++) {
    const next = new Float64Array(LANES).fill(Infinity);
    const parent = new Int8Array(LANES).fill(-1);
    let reachable = false;
    for (let from = 0; from < LANES; from++) {
      if (!Number.isFinite(costs[from])) continue;
      for (let to = Math.max(0, from - 2); to <= Math.min(LANES - 1, from + 2); to++) {
        const cost = costs[from] + 0.055 * Math.abs(to - from) + 2.1 * (lanes[to] - target) ** 2;
        if (cost >= next[to]) continue;
        const blocked = obstacles[step].some(obstacle => {
          const a = lerp(lanes[from], lanes[to], obstacle.begin);
          const b = lerp(lanes[from], lanes[to], obstacle.end);
          return Math.min(a, b) <= obstacle.high && Math.max(a, b) >= obstacle.low;
        });
        if (blocked) continue;
        next[to] = cost;
        parent[to] = from;
        reachable = true;
      }
    }
    if (!reachable) return null;
    costs = next;
    parents.push(parent);
  }

  let lane = costs.indexOf(Math.min(...costs));
  const route = new Array(parents.length);
  for (let step = parents.length - 1; step >= 0; step--) {
    route[step] = lane;
    lane = parents[step][lane];
  }
  return route;
}

export class Flight {
  constructor(layout, seed = 0x5b852a1d) {
    this.layout = layout;
    this.randomState = seed;
    this.tick = 0;
    this.shots = [];
    this.route = [];
    this.segmentStart = 0;
    this.fromLane = this.toLane = this.nearestLane(layout.cruiseY);
    this.flashes = new Float32Array(PITCH_BINS);
    this.nextShot = [0, 0, 0];
    this.nextSustain = 0;
    this.pattern = 0;
    this.emitted = 0;
  }

  random() {
    let state = this.randomState;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    this.randomState = state;
    return (state >>> 0) / 4294967296;
  }

  get time() { return this.tick / TICKS_PER_SECOND; }

  shipAt(tick = this.tick) {
    const age = clamp((tick - this.segmentStart) / STEP, 0, 1);
    const from = this.layout.lanes[this.fromLane];
    const to = this.layout.lanes[this.toLane];
    return { y: lerp(from, to, ease(age)), bank: (to - from) * age * (1 - age) * 13 };
  }

  nearestLane(y) {
    const lanes = this.layout.lanes;
    return clamp(Math.round((y - lanes[0]) / (lanes.at(-1) - lanes[0]) * (LANES - 1)), 0, LANES - 1);
  }

  cruise() {
    return this.layout.cruiseY + 0.041 * Math.sin(this.time * 0.76) + 0.021 * Math.sin(this.time * 1.29);
  }

  advance(signal, hits, density) {
    this.tick++;
    if (this.tick >= this.segmentStart + STEP) {
      this.segmentStart = this.tick;
      this.fromLane = this.toLane;
      this.toLane = this.route.shift() ?? this.fromLane + clamp(this.nearestLane(this.cruise()) - this.fromLane, -2, 2);
    }

    const time = this.time;
    let keep = 0;
    for (const shot of this.shots) {
      if (shot.x - shot.speed * (time - shot.start) > -0.06) this.shots[keep++] = shot;
    }
    this.shots.length = keep;
    for (let bin = 0; bin < PITCH_BINS; bin++) this.flashes[bin] *= 0.88;
    if (!signal || signal.level < 0.028) return;

    let sustainedPitch = -1;
    if (this.tick >= this.nextSustain && signal.level > 0.17) {
      sustainedPitch = strongestPitch(signal.bands, 0, PITCH_BINS);
      this.nextSustain = this.tick + Math.round(lerp(40, 9, density * signal.level));
    }
    const sustainedFamily = sustainedPitch === -1 ? -1 : pitchFamily(sustainedPitch);
    const volley = [];
    for (let band = 0; band < this.nextShot.length; band++) {
      if (this.tick < this.nextShot[band] || (!hits[band] && band !== sustainedFamily)) continue;
      const pitch = band === sustainedFamily ? sustainedPitch
        : strongestPitch(signal.bands, FAMILY_EDGES[band], FAMILY_EDGES[band + 1]);
      if (pitch === -1) continue;
      this.nextShot[band] = this.tick + [11, 8, 7][band];
      const force = clamp(0.31 * signal.level + 0.39 * signal.energy[band] + 0.55 * density, 0.16, 1);
      this.makeVolley(volley, band, pitch, force);
    }
    if (volley.length > 0) this.launch(volley);
  }

  makeVolley(volley, band, pitch, force) {
    const { portrait } = this.layout;
    const count = Math.round(lerp([8, 6, 5][band], [26, 19, 16][band], force));
    const ship = this.shipAt();
    const { x, y } = muzzle(this.layout, pitch);
    const speed = [0.39, 0.46, 0.65][band] * (portrait ? 0.88 : 1);
    const travel = (x - this.layout.shipX) / speed;
    const aim = ((lerp(this.layout.cruiseY, ship.y, 0.69) - y) + (this.random() - 0.5) * 0.19) / travel;
    const angle = this.pattern++ * 1.78;
    for (let i = 0; i < count; i++) {
      const spread = 2 * i / (count - 1) - 1;
      const lane = spread * [0.24, 0.12, 0.20][band] * (portrait ? 0.78 : 1);
      volley.push({
        band, pitch, start: this.time, x, y,
        speed: speed * (0.88 + force * 0.18 + (band === 2 ? this.random() * 0.20 : 0.035 * spread)),
        vy: aim + lane,
        wave: band === 0 ? 0.007 : band === 1 ? 0.044 : 0.018,
        frequency: band === 1 ? 4.4 : 3.0,
        phase: angle + i * (band === 1 ? 0.22 : 0.17),
        radius: [2.8, 2.2, 1.5][band],
      });
    }
  }

  launch(volley) {
    let candidates = volley.slice(0, MAX_SHOTS - this.shots.length);
    const start = (this.segmentStart + STEP) / TICKS_PER_SECOND;
    while (candidates.length > 0) {
      const route = planRoute(this.layout, start, this.toLane, this.shots.concat(candidates), this.cruise());
      if (route) {
        this.route = route;
        this.shots.push(...candidates);
        this.emitted += candidates.length;
        for (const shot of candidates) this.flashes[shot.pitch] = 1;
        return;
      }
      candidates = candidates.filter((_, i) => i % 2 === 1);
    }
  }
}
