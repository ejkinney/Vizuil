import { emptySpectrum } from './site-spectrum.mjs';

const demoBpm = 131;
const demoBeats = 388;
const demoUrl = new URL('./dadon.flac', import.meta.url);

const systemCaptureOptions = {
  video: { displaySurface: 'monitor', width: { ideal: 320 }, height: { ideal: 180 }, frameRate: { ideal: 1 } },
  audio: { suppressLocalAudioPlayback: false },
  audioSelection: 'preferred',
  monitorTypeSurfaces: 'include',
  systemAudio: 'include',
  windowAudio: 'exclude',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'exclude',
};

function release(session) {
  if (!session) return;
  session.download?.abort();
  session.stream?.getTracks().forEach(track => track.stop());
  void session.context.close().catch(() => {});
}

async function loadDemo(context, signal) {
  try {
    const response = await fetch(demoUrl, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch (cause) {
    throw new Error('Could not load the DaDon demo track. Try Demo again.', { cause });
  }
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

  function demoBeatPosition() {
    if (!current?.demo) return;
    const { context, demo } = current;
    const time = context.getOutputTimestamp?.().contextTime ?? context.currentTime;
    return Math.max(0, time - demo.start) / demo.secondsPerBeat;
  }

  async function select(source) {
    if (source === 'off') {
      stop();
      return;
    }

    const live = source === 'live';
    const context = new AudioContext({ sampleRate: 48000 });
    const next = { context, stream: null, download: live ? null : new AbortController() };
    release(pending);
    pending = next;
    const device = live ? 'System audio' : 'DaDon';
    if (!current) publish(source, 'connecting', device);
    const running = context.resume();
    // The sharing prompt can stay open while the audio context starts.
    running.catch(() => {});

    try {
      if (live) {
        const stream = await navigator.mediaDevices.getDisplayMedia(systemCaptureOptions);
        if (pending !== next) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        next.stream = stream;
        if (stream.getVideoTracks()[0]?.getSettings().displaySurface !== 'monitor') {
          throw new Error('Choose Entire Screen and turn on system audio in the browser picker.');
        }
        if (!stream.getAudioTracks().length) {
          throw new Error('No system audio was shared. Turn on system audio in the browser picker if it’s available.');
        }
      }
      const [buffer] = await Promise.all([
        live ? null : loadDemo(context, next.download.signal),
        context.audioWorklet.addModule(new URL('./site-audio-worklet.mjs', import.meta.url)),
        running,
      ]);
      if (pending !== next) return;

      const node = new AudioWorkletNode(context, 'vizuil-analyzer', {
        channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [1],
        processorOptions: { bpm: live ? null : demoBpm },
      });
      let playback;
      if (live) {
        // Keep the share active with the browser's stop control. Only the audio enters Web Audio.
        const tracks = next.stream.getTracks();
        if (tracks.some(track => track.readyState !== 'live')) throw new Error('Sharing ended. Share system audio again.');
        for (const track of tracks) {
          track.addEventListener('ended', () => { if (current === next) endCurrent(); });
        }
        const audio = new MediaStream(next.stream.getAudioTracks());
        context.createMediaStreamSource(audio).connect(node);
      } else {
        playback = context.createBufferSource();
        playback.buffer = buffer;
        playback.loopStart = 0;
        playback.loopEnd = buffer.duration;
        playback.loop = true;
        next.playback = playback;
        playback.connect(context.destination);
        playback.connect(node);
      }
      let revision = 0;
      next.restartAnalysis = () => {
        node.port.postMessage(++revision);
        generation++;
        publish(source, 'connecting', device);
      };
      node.port.onmessage = ({ data }) => {
        if (current !== next || data.revision !== revision) return;
        publish(source, live ? (data.quiet ? 'quiet' : 'live') : 'demo', device, data.spectrum);
      };
      node.addEventListener('processorerror', () => {
        if (current !== next) return;
        endCurrent();
        reportError('The audio analyzer stopped. Start listening again.');
      });
      node.connect(context.destination);
      if (playback) {
        const start = context.currentTime + 0.02;
        playback.start(start);
        // Use the decoded loop length so rounding to whole samples cannot build up drift.
        next.demo = { start, secondsPerBeat: buffer.duration / demoBeats };
      }
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
  return { canCapture, select, demoBeatPosition, kick: () => current?.restartAnalysis() };
}
