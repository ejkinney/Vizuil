import { createBulletHell } from './bullet-hell.mjs';
import { createBlockParty } from './block-party.mjs';
import { createAquarium } from './aquarium.mjs';
import { createSignalSwarm } from './signal-swarm.mjs';
import { createBeatStack } from './beat-stack.mjs';
import { createStickDancer } from './stick-dancer.mjs';
import { createBlockBrawl } from './block-brawl.mjs';
import { createSignalDesk } from './signal-desk.mjs';

// A scene owns its renderer. Its input is the latest DisplayFrame, or null while disconnected.
// resize receives CSS-pixel dimensions, and render receives elapsed seconds since the last frame.
export const scenes = new Map([
  ['bullet-hell', {
    name: 'Bullet Hell', number: '01', area: 'Ion Gorge', create: createBulletHell,
    description: 'A pixel-art plane weaves through volleys in a canyon at dusk',
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
  ['stick-dancer', {
    name: 'Stick Dancer', number: '05', area: 'Dance Floor', create: createStickDancer,
    description: 'A stick figure attempts the Running Man, Jersey Slide, and Rock Yo Hips after tempo lock. Each limb reacts to its own frequency range, and the dancer and backdrop switch neon colors together every eight beats.',
  }],
  ['beat-stack', {
    name: 'Beat Stack', number: '05', area: 'Frequency Arcade', create: createBeatStack,
    description: 'A player steers falling blocks and capsules on the beat. Their shapes and colors match the eight frequency ranges in the scrolling spectrogram.',
  }],
  ['block-brawl', {
    name: 'Block Brawl', number: '07', area: 'Neon Rooftop', create: createBlockBrawl,
    description: 'Two block-built fighters trade beat-timed punches, blocks, dodges, and kicks on a neon rooftop.',
  }],
  ['signal-desk', {
    name: 'Signal Desk', number: '08', area: 'CRT Control Room', create: createSignalDesk,
    description: 'A 3D operator works a bank of CRTs. The low and high halves of the scrolling spectrogram drive separate hands, and the room changes accents every two measures.',
  }],
]);
