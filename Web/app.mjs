import { scenes } from './scenes.mjs';

const $ = id => document.getElementById(id);
const hosted = document.body.dataset.mode === 'site';
const viewer = !hosted && location.pathname.startsWith('/v/');
document.body.classList.toggle('viewer', viewer);
const suppliedKey = new URLSearchParams(location.hash.slice(1)).get('key');
if (!hosted && /^[a-f0-9]{36}$/.test(suppliedKey ?? '')) {
  sessionStorage.setItem('visual-waltz-key', suppliedKey);
  history.replaceState(null, '', location.pathname);
}
const key = hosted ? null : sessionStorage.getItem('visual-waltz-key');
let canvas = $('scene');
const dialog = $('share-dialog');
const chrome = document.querySelectorAll('.chrome');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const spectrumCanvas = $('spectrum');
const spectrumContext = spectrumCanvas.getContext('2d');
const densityInput = $('density');
const captureInput = $('capture-source');
const statusText = {
  live: hosted ? 'Listening' : 'Desktop audio', quiet: 'Waiting for audio', demo: 'Silent demo',
  connecting: 'Opening audio', unavailable: 'Audio unavailable', off: 'Ready',
};
let currentFrame = null;
let lastFrameAt = -Infinity;
let sleepTimer;
let sleeping = false;
let presentation = 0;
let pendingSource = false;
let editingDensity = false;
let activeShare = null;
let scene, sceneId;
let siteAudio;
let siteDensity = 0.65;

function showScene(id) {
  const entry = scenes.get(id);
  if (sceneId === id || !entry) return;
  if (scene?.dispose) scene.dispose();
  if (scene) {
    const replacement = canvas.cloneNode(false);
    canvas.replaceWith(replacement);
    canvas = replacement;
  }
  sceneId = id;
  canvas.dataset.scene = id;
  canvas.setAttribute('aria-label', entry.description);
  document.title = `Visual Waltz · ${entry.area}`;
  setText($('scene-area'), `${entry.number} / ${entry.area}`);
  setText($('scene-number'), `VISUAL ${entry.number}`);
  setText($('scene-name'), entry.name);
  scene = entry.create(canvas, { onPlay: sleep });
  scene.resize(canvas.clientWidth, canvas.clientHeight);
  $('picker').value = id;
  if (canvas.tabIndex >= 0 && document.activeElement === $('picker')) canvas.focus({ preventScroll: true });
}

for (const [id, entry] of scenes) $('picker').add(new Option(entry.name, id));
showScene(scenes.keys().next().value);
$('picker').addEventListener('change', async event => {
  if (hosted) {
    showScene(event.target.value);
    currentFrame.scene = sceneId;
    return;
  }
  try { await api('scene', 'POST', { scene: event.target.value }); }
  catch (error) { $('picker').value = sceneId; showError($('error'), error.message); }
});
new ResizeObserver(() => scene.resize(canvas.clientWidth, canvas.clientHeight)).observe($('stage'));
const paintInterval = 1000 / 60;
let previousTime, nextPaint = 0;
function draw(now) {
  if (now + 0.8 >= nextPaint) {
    const dt = previousTime === undefined ? 0 : Math.min((now - previousTime) / 1000, 0.085);
    previousTime = now;
    if (now - nextPaint > 2 * paintInterval) nextPaint = now;
    nextPaint += paintInterval;
    if (!hosted && currentFrame && performance.now() - lastFrameAt > 1600) disconnected();
    const target = Number(sleeping);
    const step = dt / 0.44;
    presentation = reducedMotion.matches ? target : sleeping
      ? Math.min(target, presentation + step) : Math.max(target, presentation - step);
    const eased = presentation * presentation * (3 - 2 * presentation);
    scene.render(dt, currentFrame, eased);
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

function setSleeping(value) {
  if (sleeping === value) return;
  sleeping = value;
  document.body.classList.toggle('sleep', value);
  for (const item of chrome) item.inert = value;
}

function wake() {
  if (document.hidden || !document.hasFocus()) return;
  setSleeping(false);
  scheduleSleep();
}

function scheduleSleep() {
  clearTimeout(sleepTimer);
  if (sleeping || dialog.open || (hosted && pendingSource)) return;
  sleepTimer = setTimeout(() => {
    if (dialog.open || document.activeElement?.matches('.chrome :focus-visible') || densityInput.matches(':active')) return;
    setSleeping(true);
  }, 3000);
}

function sleep() {
  if (hosted && pendingSource) return;
  clearTimeout(sleepTimer);
  setSleeping(true);
}

if (document.hasFocus()) scheduleSleep();
else { sleep(); presentation = 1; }
window.addEventListener('blur', sleep);
window.addEventListener('focus', () => { if (dialog.open) wake(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) sleep(); });
document.addEventListener('focusout', scheduleSleep);
function wakeOnPointer(event) {
  if (!event.defaultPrevented) wake();
}
window.addEventListener('pointermove', wakeOnPointer, { passive: true });
window.addEventListener('pointerdown', wakeOnPointer, { passive: true });
window.addEventListener('pointerup', scheduleSleep, { passive: true });
window.addEventListener('pointercancel', scheduleSleep, { passive: true });
window.addEventListener('keydown', event => {
  if (event.defaultPrevented) return;
  wake();
  if (!dialog.open && !event.repeat && event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey &&
      !event.target.matches?.('input, select, textarea')) toggleFullscreen();
});

const fullscreen = $('fullscreen');
fullscreen.hidden = !document.documentElement.requestFullscreen || !document.fullscreenEnabled;
fullscreen.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  fullscreen.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
  wake();
});
async function toggleFullscreen() {
  if (fullscreen.hidden) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    if (!viewer) showError($('error'), 'Use F11 to enter browser fullscreen.');
  }
}

function drawSpectrum(bands) {
  const { width, height } = spectrumCanvas;
  spectrumContext.drawImage(spectrumCanvas, -1, 0);
  spectrumContext.fillStyle = '#091121';
  spectrumContext.fillRect(width - 1, 0, 1, height);
  for (let i = 0; i < bands.length; i++) {
    const value = bands[i];
    if (value < 0.01) continue;
    const hue = 221 - 180 * value;
    spectrumContext.fillStyle = `hsl(${hue} 86% ${21 + 49 * value}%)`;
    spectrumContext.fillRect(width - 1, height - 1 - i, 1, 1);
  }
}

function setText(element, value) { if (element.textContent !== value) element.textContent = value; }
function message(text) {
  setText($('viewer-message'), text);
  $('viewer-message').hidden = text.length === 0;
}
function showError(element, text) { setText(element, text); element.hidden = text.length === 0; }

function updateSourceButtons(source) {
  const ready = Boolean((hosted || key) && currentFrame);
  const listen = $('listen');
  listen.disabled = !ready || pendingSource || (hosted && !siteAudio?.canCapture);
  if (hosted) {
    captureInput.disabled = listen.disabled;
    setText(listen, source === 'live' ? 'Change Source' : 'Start Listening');
  } else listen.setAttribute('aria-pressed', String(source === 'live'));
  $('demo').disabled = !ready || pendingSource;
  $('stop').disabled = !ready || pendingSource || source === 'off';
  $('share').disabled = !key || !currentFrame;
  densityInput.disabled = !ready;
  $('picker').disabled = !ready;
  $('demo').setAttribute('aria-pressed', String(source === 'demo'));
}

function receive(frame) {
  const oldGeneration = currentFrame?.generation;
  lastFrameAt = performance.now();
  currentFrame = frame;
  showScene(frame.scene);
  setText($('status'), statusText[frame.status] ?? 'Connected');
  $('dot').classList.toggle('active', frame.status === 'live' || frame.status === 'demo');
  setText($('tempo'), frame.spectrum.bpm === null ? '—' : String(Math.round(frame.spectrum.bpm)));
  if (viewer) {
    message(frame.source === 'off' ? 'Connected. Start listening on the PC.' :
      frame.status === 'unavailable' ? 'The PC’s audio output is unavailable.' : '');
  } else {
    updateSourceButtons(frame.source);
    setText($('device'), frame.device ?? (frame.source === 'demo' ? 'Built-in audio test · silent' :
      hosted ? 'Browser audio' : frame.status === 'unavailable' ? 'Checking for a Windows output device…' : 'Windows playback'));
    if (frame.generation !== oldGeneration) spectrumContext.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
    drawSpectrum(frame.spectrum.bands);
    if (!editingDensity) {
      densityInput.value = String(Math.round(frame.density * 100));
      setText($('density-value'), `${densityInput.value}%`);
    }
  }
}

function disconnected() {
  currentFrame = null;
  setText($('status'), 'Disconnected');
  setText($('tempo'), '—');
  $('dot').classList.remove('active');
  updateSourceButtons('off');
  if (viewer) message('Waiting for the PC. If sharing ended, scan a new code.');
  else showError($('error'), 'Waiting for the launcher. If it closed, open Visual Waltz from Windows.');
}

if (hosted) {
  $('share').hidden = true;
  $('capture-picker').hidden = false;
  $('capture-help').hidden = false;
  const { captureSources, createSiteAudio } = await import('./site-audio.mjs');
  siteAudio = createSiteAudio(frame => receive({ ...frame, scene: sceneId, density: siteDensity }),
    text => showError($('error'), text));
  const open = $('open-listening');
  open.href = location.href;
  for (const [id, choice] of Object.entries(captureSources)) captureInput.add(new Option(choice.name, id));
  function updateCaptureHelp() {
    const choice = captureSources[captureInput.value];
    const entireScreen = captureInput.value === 'monitor';
    const instructions = entireScreen
      ? `${choice.instructions} If Entire Screen is missing, use a regular Chrome or Edge window.`
      : choice.instructions;
    setText($('capture-instructions'), siteAudio.canCapture
      ? instructions : 'Open Visual Waltz in desktop Chrome or Edge to share audio.');
    open.hidden = window.top === window && siteAudio.canCapture;
  }
  captureInput.addEventListener('change', () => {
    updateCaptureHelp();
    showError($('error'), '');
  });
  updateCaptureHelp();
  await siteAudio.select('off');
} else if (viewer || key) {
  const connection = new EventSource(viewer ? `${location.pathname}/frames` : `/api/frames?key=${key}`);
  connection.addEventListener('message', event => receive(JSON.parse(event.data)));
  connection.addEventListener('error', disconnected);
  connection.addEventListener('open', () => showError($('error'), ''));
} else {
  setText($('status'), 'Launcher needed');
  showError($('error'), 'Open Visual Waltz from its Windows system tray icon.');
}
updateSourceButtons('off');

async function api(path, method = 'GET', body) {
  const headers = { Authorization: `Bearer ${key}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api/${path}`, { method, headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.detail ?? problem.message ?? 'The launcher could not complete that action.');
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function selectSource(source) {
  pendingSource = true;
  if (hosted) scheduleSleep();
  updateSourceButtons(currentFrame?.source);
  showError($('error'), '');
  try {
    if (hosted) await siteAudio.select(source, captureInput.value);
    else await api('source', 'POST', { source });
  }
  catch (error) { showError($('error'), error.message); }
  finally {
    pendingSource = false;
    updateSourceButtons(currentFrame?.source);
    if (hosted) wake();
  }
}
for (const [button, source] of [['listen', 'live'], ['demo', 'demo'], ['stop', 'off']]) {
  $(button).addEventListener('click', () => selectSource(source));
}

densityInput.addEventListener('input', () => {
  editingDensity = true;
  setText($('density-value'), `${densityInput.value}%`);
  if (hosted) currentFrame.density = siteDensity = Number(densityInput.value) / 100;
});
densityInput.addEventListener('change', async () => {
  try { if (!hosted) await api('density', 'POST', { density: Number(densityInput.value) / 100 }); }
  catch (error) { showError($('error'), error.message); }
  finally { editingDensity = false; }
});

const networks = $('network');
const startShare = $('start-share');
const stopShare = $('stop-share');
const linkInput = $('viewer-link');

function displayShare(info) {
  activeShare = info;
  $('share-setup').hidden = Boolean(info);
  $('share-active').hidden = !info;
  $('share').setAttribute('aria-pressed', String(Boolean(info)));
  setText($('share'), info ? 'Phone Sharing On' : 'Share to Phone');
  if (!info) return;
  $('qr').src = `data:image/png;base64,${info.qr}`;
  linkInput.value = info.url;
  setText($('copy-link'), 'Copy');
}

$('share').addEventListener('click', async () => {
  showError($('share-error'), '');
  dialog.showModal();
  startShare.disabled = true;
  try {
    const [info, choices] = await Promise.all([api('share'), api('networks')]);
    if (!dialog.open) return;
    displayShare(info);
    const last = networks.value;
    networks.replaceChildren(...choices.map(choice => new Option(`${choice.name} · ${choice.address}`, choice.address)));
    if (choices.some(choice => choice.address === last)) networks.value = last;
    if (!choices.length && !info) showError($('share-error'), 'Connect this PC to Wi-Fi or Ethernet and reopen sharing.');
    startShare.disabled = choices.length === 0;
  } catch (error) { showError($('share-error'), error.message); }
});
$('close-share').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', wake);
startShare.addEventListener('click', async () => {
  startShare.disabled = true;
  showError($('share-error'), '');
  try { displayShare(await api('share', 'POST', { address: networks.value })); }
  catch (error) { showError($('share-error'), error.message); }
  finally { startShare.disabled = false; }
});
stopShare.addEventListener('click', async () => {
  stopShare.disabled = true;
  try { await api('share', 'DELETE'); displayShare(null); }
  catch (error) { showError($('share-error'), error.message); }
  finally { stopShare.disabled = false; }
});
$('copy-link').addEventListener('click', async () => {
  if (!activeShare) return;
  try { await navigator.clipboard.writeText(linkInput.value); }
  catch {
    linkInput.select();
    if (!document.execCommand('copy')) return;
  }
  setText($('copy-link'), 'Copied');
});
if (!viewer && key) api('share').then(displayShare).catch(() => {});
