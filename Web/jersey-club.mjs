const mix = (a, b, t) => a + (b - a) * t;

// Foot targets are on the stage. Hand targets are relative to the hips. The third
// coordinate on each foot is toe pitch, positive when the toe points down.
function pose(hip, lean, feet, hands) {
  return { hip, lean, feet, hands };
}

// Each move is written for one beat. Its mirrored beat finishes the step.
const runningMan = [
  [0, pose([0.04, -1.00], -0.15, [[0.29, -0.09, 0.27], [-0.37, -0.04, -0.30]], [[-0.42, -0.85], [0.46, -0.39]])],
  [0.22, pose([-0.04, -0.96], -0.10, [[0.24, -0.05, -0.19], [-0.46, -0.12, 0.55]], [[-0.54, -0.64], [0.38, -0.59]])],
  [0.50, pose([-0.20, -1.13], 0.10, [[-0.38, -0.04, -0.22], [0.33, -0.63, 0.35]], [[-0.37, -0.33], [0.56, -0.98]])],
  [0.74, pose([-0.18, -1.05], 0.18, [[-0.48, -0.06, 0.10], [0.10, -0.42, 0.38]], [[-0.45, -0.29], [0.47, -0.98]])],
];

const jerseySlide = [
  [0, pose([-0.73, -1.03], -0.11, [[-1.01, -0.04, -0.13], [-0.52, -0.04, -0.10]], [[-0.50, -0.77], [0.21, -0.56]])],
  [0.23, pose([-0.61, -1.01], 0.13, [[-0.99, -0.06, 0.09], [-0.01, -0.28, -0.22]], [[-0.24, -0.45], [0.74, -0.88]])],
  [0.49, pose([-0.14, -0.91], 0.25, [[-0.91, -0.13, 0.43], [0.78, -0.05, -0.19]], [[-0.12, -0.62], [0.95, -1.04]])],
  [0.76, pose([0.48, -1.05], 0.20, [[-0.17, -0.10, 0.28], [1.00, -0.04, -0.13]], [[-0.44, -0.38], [0.72, -0.91]])],
];

const rockYoHips = [
  [0, pose([-0.32, -1.05], 0.28, [[-0.57, -0.04, -0.12], [0.57, -0.07, 0.12]], [[-0.15, -0.14], [0.17, -0.18]])],
  [0.28, pose([-0.24, -0.91], 0.20, [[-0.57, -0.04, -0.12], [0.57, -0.06, 0.10]], [[-0.16, -0.13], [0.17, -0.16]])],
  [0.52, pose([0.03, -0.98], -0.04, [[-0.57, -0.05, 0.06], [0.57, -0.04, -0.13]], [[-0.17, -0.14], [0.17, -0.16]])],
  [0.82, pose([0.28, -1.08], -0.26, [[-0.57, -0.07, 0.12], [0.57, -0.04, -0.12]], [[-0.17, -0.17], [0.14, -0.12]])],
];

function mirror(pose) {
  const flip = ([x, ...rest]) => [-x, ...rest];
  return {
    hip: flip(pose.hip), lean: -pose.lean,
    feet: [flip(pose.feet[1]), flip(pose.feet[0])], hands: [flip(pose.hands[1]), flip(pose.hands[0])],
  };
}

export function blendPoses(a, b, t) {
  const point = (from, to) => from.map((value, i) => mix(value, to[i], t));
  return {
    hip: point(a.hip, b.hip), lean: mix(a.lean, b.lean, t),
    feet: a.feet.map((foot, i) => point(foot, b.feet[i])),
    hands: a.hands.map((hand, i) => point(hand, b.hands[i])),
  };
}

const moves = [runningMan, jerseySlide, rockYoHips].map(frames => [...frames, [1, mirror(frames[0][1])]]);
export const JERSEY_MOVE_COUNT = moves.length;

export function jerseyClubPose(move, beat) {
  const frames = moves[move];
  const phase = beat % 1;
  const next = frames.findIndex(([at]) => at > phase);
  const [start, from] = frames[next - 1];
  const [end, to] = frames[next];
  const t = (phase - start) / (end - start);
  const shape = blendPoses(from, to, t * t * (3 - 2 * t));
  return Math.floor(beat) % 2 ? mirror(shape) : shape;
}
