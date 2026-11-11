const LEG_LENGTHS = [0.65, 0.62];
const ARM_LENGTHS = [0.58, 0.54];
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

function endOf(start, length, angle) {
  return [start[0] + length * Math.sin(angle), start[1] + length * Math.cos(angle)];
}

export function bodyAt([hipX, hipY], lean) {
  const cos = Math.cos(lean), sin = Math.sin(lean);
  return (x, y) => [hipX + x * cos - y * sin, hipY + x * sin + y * cos];
}

function limbStart(body, { side, leg }) {
  return leg ? body(side * 0.12, 0) : body(side * 0.25, -0.94);
}

export function limbPoints(body, limb, { angle, lower, pitch }, lean) {
  const { side, leg } = limb;
  const start = limbStart(body, limb);
  const [upperLength, lowerLength] = leg ? LEG_LENGTHS : ARM_LENGTHS;
  if (!leg && lean !== undefined) {
    // Fold raised elbows down and keep clearance from both the shoulder and the leaning torso.
    const outward = Math.asin(Math.sin(side * angle));
    const tilt = side * lean;
    angle = side * clamp(outward, Math.max(0.32, 0.38 - tilt), Math.min(1.24, 1.30 - tilt));
  }
  const middle = endOf(start, upperLength, angle);
  const tip = endOf(middle, lowerLength, lower);
  const toe = leg ? [tip[0] + side * 0.22 * Math.cos(pitch), tip[1] + 0.22 * Math.sin(pitch)] : tip;
  return { start, middle, tip, toe, leg };
}

export function floorOf(legs) {
  return Math.max(...legs.flatMap(({ tip, toe }) => [tip[1], toe[1]]));
}

// Aim two fixed-length segments at the ankle or wrist while keeping the knee or elbow bent outward.
export function aimLimb(body, limb, target, pitch = 0) {
  const [x, y] = limbStart(body, limb);
  const dx = target[0] - x, dy = target[1] - y;
  const [upper, lower] = limb.leg ? LEG_LENGTHS : ARM_LENGTHS;
  const distance = clamp(Math.hypot(dx, dy), Math.abs(upper - lower) + 0.001, upper + lower - 0.001);
  const fromTarget = Math.acos((upper ** 2 + distance ** 2 - lower ** 2) / (2 * upper * distance));
  const bend = Math.PI - Math.acos((upper ** 2 + lower ** 2 - distance ** 2) / (2 * upper * lower));
  const angle = Math.atan2(dx, dy) + limb.side * fromTarget;
  return { angle, lower: angle - limb.side * bend, pitch };
}
