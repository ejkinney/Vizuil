const BODY = '#f8eddc';
const FAR_LIMB = '#ae9bb6';
const FLOOR = 235;
const STEP_POSITIONS = [[128, 188], [103, 188], [103, 213], [128, 213]];

function limb(ctx, points, color, width) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function circle(ctx, x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function drawPlayer(ctx, x, y, width, { tempo, beat, phase, bounce, shift, dropping, motion }) {
  const pace = Math.max(0, Math.min(1, ((tempo ?? 65) - 65) / 115));
  // The same four-count step continues under every gesture, including beats without a game move.
  const from = STEP_POSITIONS[beat ? (beat - 1) % STEP_POSITIONS.length : 0];
  const to = STEP_POSITIONS[beat % STEP_POSITIONS.length];
  const weight = beat ? Math.cos(Math.PI * phase) : 0;
  const rock = beat % 2 === 1 ? weight : -weight;
  const stride = (1 - weight) / 2;
  const lift = beat ? Math.sin(Math.PI * phase) : 0;
  const accent = motion < 1 ? Math.sin(Math.PI * Math.sqrt(motion)) : 0;
  const push = shift * accent;
  const throwDown = dropping ? accent : 0;

  const hip = [156 + 11 * rock + 10 * push, 138 + 7 * pace + 5 * bounce + 8 * throwDown];
  const lean = 14 * pace + 17 * rock + 51 * push;
  const shoulder = [hip[0] + lean * 0.65, hip[1] - 62 + 10 * Math.abs(push)];
  const head = [hip[0] + lean, shoulder[1] - 34 + 5 * throwDown];

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(width / 320, width / 320);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const halo = ctx.createLinearGradient(52, 32, 257, 225);
  halo.addColorStop(0, '#453657');
  halo.addColorStop(1, '#29213d');
  circle(ctx, 156, 130, 115, halo);
  ctx.strokeStyle = '#806891';
  ctx.lineWidth = 1;
  ctx.stroke();
  limb(ctx, [[35, 244], [285, 244]], '#776387', 1);

  for (const [index, side, color] of [[0, -1, FAR_LIMB], [1, 1, BODY]]) {
    const step = from[index] === to[index] ? 0 : lift;
    const footX = from[index] + (to[index] - from[index]) * stride;
    const footY = FLOOR - step * (26 + pace * 8);
    const knee = [(hip[0] + footX) / 2 + side * (14 + 9 * step), (hip[1] + footY) / 2 - 6 * step];
    limb(ctx, [hip, knee, [footX, footY], [footX + side * 17, footY + step * 3]], color, 12);
  }

  limb(ctx, [hip, shoulder, [head[0], head[1] + 17]], BODY, 17);
  for (const [side, color] of [[-1, FAR_LIMB], [1, BODY]]) {
    const reach = Math.max(0, push * side);
    const elbow = [shoulder[0] + side * (33 + 10 * reach), shoulder[1] + 29 + 18 * throwDown];
    const hand = [shoulder[0] + side * (50 + 16 * throwDown + 17 * reach),
      shoulder[1] + 6 + 14 * side * rock + 83 * throwDown - 11 * reach];
    limb(ctx, [[shoulder[0] + side * 5, shoulder[1] + 3], elbow, hand], color, 11);
  }
  circle(ctx, ...head, 24, BODY);
  ctx.restore();
}
