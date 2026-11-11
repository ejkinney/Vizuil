import { createStickDancer } from './stick-dancer.mjs';
import { createBlockParty } from './block-party.mjs';
import { createAquarium } from './aquarium.mjs';
import { createSignalSwarm } from './signal-swarm.mjs';
import { createBeatStack } from './beat-stack.mjs';
import { createBlockBrawl } from './block-brawl.mjs';
import { createSignalDesk } from './signal-desk.mjs';

// A scene owns its renderer. Its input is the latest DisplayFrame, or null while disconnected.
// resize receives CSS-pixel dimensions, and render receives elapsed seconds since the last frame.
export const scenes = new Map([
  ['stick-dancer', {
    name: 'Stick Dancer', number: '01', area: 'Dance Floor', create: createStickDancer,
    description: 'A stick figure begins with Beat Stack footwork, then loops through the Running Man, Jersey Slide, and Rock Yo Hips after tempo lock. Before tempo lock, frequency bands add gentle limb accents. The backdrop changes neon colors every eight beats.',
  }],
  ['block-party', {
    name: 'Block Party', number: '02', area: 'Block Spectrograph', create: createBlockParty,
    description: 'Critters bounce on a pyramid of rising spectrum blocks and trade places every fourth beat',
  }],
  ['tidal-garden', {
    name: 'Tidal Garden', number: '03', area: 'Living Spectrum', create: createAquarium,
    description: 'A low-poly 3D aquarium with beat-driven sea creatures and a row of waving kelp that responds to bass through treble',
  }],
  ['signal-swarm', {
    name: 'Signal Swarm', number: '04', area: 'Spectrum Fleet', create: createSignalSwarm,
    description: 'Twenty-four ships fly in eight colored wings. The wings sweep, dive, or lunge in time with the music. On each locked beat, enemy shots match the brightest active bands in the spectrogram, and the player fires automatically. Steer with arrows or WASD, fire with Space before tempo lock, and toggle autopilot with P. On touch screens, drag to steer.',
  }],
  ['beat-stack', {
    name: 'Beat Stack', number: '05', area: 'Frequency Arcade', create: createBeatStack,
    description: 'A dancing stick figure points sideways to steer, upward to turn, and down to drop tetrominoes on the beat. Full rows clear, and seven frequency ranges in the scrolling spectrogram supply the pieces.',
  }],
  ['block-brawl', {
    name: 'Artificial Spar', number: '07', area: 'Color Field', create: createBlockBrawl,
    description: 'Two simple humanoid silhouettes sidestep, parry, and trade kicks. Every eight beats, their contrasting colors and the flat background shift together.',
  }],
  ['signal-desk', {
    name: 'Signal Desk', number: '08', area: 'CRT Control Room', create: createSignalDesk,
    description: 'Look over the shoulders of an operator working a bank of CRTs. The camera changes angle each measure, and the low and high halves of the scrolling spectrogram drive separate hands.',
  }],
]);
