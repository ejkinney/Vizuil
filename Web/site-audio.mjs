import { emptySpectrum } from './site-spectrum.mjs';

export const captureSources = {
  browser: {
    name: 'Browser tab', device: 'Tab audio',
    instructions: 'Choose the tab playing sound and enable “Also share tab audio”.',
    noAudio: 'The selected tab supplied no audio. Choose it again with tab audio enabled.',
  },
  window: {
    name: 'App window', device: 'App window audio',
    instructions: 'Choose the app’s window and enable application audio if offered.',
    noAudio: 'The selected window supplied no audio. Enable window audio in the picker or try the app in a browser tab.',
  },
  monitor: {
    name: 'Entire screen', device: 'System audio',
    instructions: 'Choose Entire Screen and enable “Also share system audio”.',
    noAudio: 'The selected screen supplied no audio. Enable system audio in the picker or choose Browser tab or App window.',
  },
};

function captureOptions(surface) {
  return {
    video: { displaySurface: surface, width: { ideal: 320 }, height: { ideal: 180 }, frameRate: { ideal: 1 } },
    audio: { suppressLocalAudioPlayback: false },
    audioSelection: 'preferred',
    monitorTypeSurfaces: surface === 'monitor' ? 'include' : 'exclude',
    systemAudio: surface === 'monitor' ? 'include' : 'exclude',
    windowAudio: surface === 'window' ? 'window' : 'exclude',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'exclude',
  };
}

function release(session) {
  if (!session) return;
  session.stream?.getTracks().forEach(track => track.stop());
  void session.context.close().catch(() => {});
}

export function createSiteAudio(receive, reportError) {
  const policy = document.permissionsPolicy ?? document.featurePolicy;
  const canCapture = Boolean(navigator.mediaDevices?.getDisplayMedia &&
    policy?.allowsFeature('display-capture') !== false);
  let generation = 0;
  let current = null;
  let pending = null;

  function publish(source, status, device = null, spectrum = emptySpectrum()) {
    receive({ source, status, device, generation, spectrum });
  }

  function endCurrent() {
    const previous = current;
    current = null;
    release(previous);
    generation++;
    publish('off', 'off');
  }

  function stop() {
    const previous = pending;
    pending = null;
    release(previous);
    endCurrent();
  }

  async function select(source, surface) {
    if (source === 'off') {
      stop();
      return;
    }

    const context = new AudioContext({ sampleRate: 48000 });
    const next = { context, stream: null };
    release(pending);
    pending = next;
    const live = source === 'live';
    const choice = live ? captureSources[surface] : null;
    const device = choice?.device ?? null;
    if (!current) publish(source, 'connecting', device);
    const running = context.resume();
    // The sharing prompt can stay open while the audio context starts.
    running.catch(() => {});

    try {
      if (live) {
        const stream = await navigator.mediaDevices.getDisplayMedia(captureOptions(surface));
        if (pending !== next) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        next.stream = stream;
        if (stream.getVideoTracks()[0]?.getSettings().displaySurface !== surface) {
          throw new Error(`Choose a source under ${choice.name} in the browser picker. ${choice.instructions}`);
        }
        if (!stream.getAudioTracks().length) throw new Error(choice.noAudio);
      }
      await context.audioWorklet.addModule(new URL('./site-audio-worklet.mjs', import.meta.url));
      await running;
      if (pending !== next) return;

      const node = new AudioWorkletNode(context, 'visual-waltz-analyzer', {
        channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [1], processorOptions: { demo: !live },
      });
      if (live) {
        // Keep the share active with the browser's stop control. Only the audio enters Web Audio.
        const tracks = next.stream.getTracks();
        if (tracks.some(track => track.readyState !== 'live')) throw new Error('Sharing ended. Choose the audio source again.');
        for (const track of tracks) {
          track.addEventListener('ended', () => { if (current === next) endCurrent(); });
        }
        const audio = new MediaStream(next.stream.getAudioTracks());
        context.createMediaStreamSource(audio).connect(node);
      }
      node.port.onmessage = ({ data: { spectrum, quiet } }) => {
        if (current === next) publish(source, live ? (quiet ? 'quiet' : 'live') : 'demo', device, spectrum);
      };
      node.addEventListener('processorerror', () => {
        if (current !== next) return;
        endCurrent();
        reportError('The audio analyzer stopped. Start listening again.');
      });
      node.connect(context.destination);
      release(current);
      current = next;
      pending = null;
      generation++;
      publish(source, 'connecting', device);
    } catch (error) {
      if (pending !== next) return;
      pending = null;
      release(next);
      if (!current) publish('off', 'off');
      if (error.name === 'NotAllowedError') {
        throw new Error('Audio sharing was canceled or blocked. Try again in desktop Chrome or Edge.');
      }
      throw error;
    }
  }

  window.addEventListener('pagehide', stop);
  return { canCapture, select };
}
