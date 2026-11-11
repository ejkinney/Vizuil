import { scenes } from './scenes.mjs';
import { scenePreviews } from './scene-previews.mjs';
import { SceneShuffle } from './scene-shuffle.mjs';

const $ = id => document.getElementById(id);
const hosted = document.body.dataset.mode === 'site';
const viewer = !hosted && location.pathname.startsWith('/v/');
document.body.classList.toggle('viewer', viewer);
const suppliedKey = new URLSearchParams(location.hash.slice(1)).get('key');
if (!hosted && /^[a-f0-9]{36}$/.test(suppliedKey ?? '')) {
  sessionStorage.setItem('vizuil-key', suppliedKey);
  history.replaceState(null, '', location.pathname);
}
const key = hosted ? null : sessionStorage.getItem('vizuil-key');
let canvas = $('scene');
const dialog = $('share-dialog');
const welcomeDialog = $('welcome-dialog');
const anyDialogOpen = () => dialog.open || welcomeDialog.open;
const chrome = document.querySelectorAll('.chrome');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const spectrumCanvas = $('spectrum');
const spectrumContext = spectrumCanvas.getContext('2d');
const densityInput = $('density');
const outputInput = $('audio-output');
const doubleTimeButton = $('double-time');
const kickButton = $('kick');
const sceneToggle = $('scene-toggle');
const sceneMenu = $('scene-menu');
const sceneGrid = $('scene-grid');
const shuffleButton = $('shuffle-toggle');
const shuffleBars = $('shuffle-bars');
const shuffle = new SceneShuffle();
const statusText = {
  live: hosted ? 'Listening' : 'Desktop audio', quiet: 'Waiting for audio', demo: hosted ? 'Playing demo' : 'Silent demo',
  connecting: 'Opening audio', unavailable: 'Audio unavailable', off: 'Ready',
};
let currentFrame = null;
let detectedTempo = null;
let doubleTime = false;
let lastFrameAt = -Infinity;
let sleepTimer;
let sleeping = false;
let presentation = 0;
let pendingSource = false;
let selectedOutput = '';
let loadedOutputs = false;
let refreshingOutputs = false;
let editingDensity = false;
let activeShare = null;
let scene, sceneId;
let siteAudio;
let siteDensity = 0.65;
let shuffleEnabled = false;
let shufflePending = false;

for (const [id, entry] of scenes) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'scene-card';
  button.dataset.scene = id;
  button.title = entry.description;
  button.setAttribute('aria-label', `${entry.name}, ${entry.area}`);
  button.innerHTML = `<span class="scene-preview">${scenePreviews[id]}</span><span class="scene-card-copy"><strong>${entry.name}</strong><small>${entry.area}</small></span>`;
  button.addEventListener('click', () => {
    shuffle.reset();
    void chooseScene(id);
    closeSceneMenu();
  });
  sceneGrid.append(button);
}

function closeSceneMenu() {
  if (sceneMenu.hidden) return;
  sceneMenu.hidden = true;
  sceneToggle.setAttribute('aria-expanded', 'false');
  sceneToggle.focus({ preventScroll: true });
  scheduleSleep();
}

async function chooseScene(id) {
  if (!scenes.has(id) || sceneId === id) return;
  if (hosted) {
    showScene(id);
    if (currentFrame) currentFrame.scene = sceneId;
    return;
  }
  try { await api('scene', 'POST', { scene: id }); }
  catch (error) { showError($('error'), error.message); }
}

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
  document.title = `Vizuil · ${entry.area}`;
  setText($('scene-area'), `${entry.number} / ${entry.area}`);
  setText($('current-scene-name'), entry.name);
  $('scene-chooser-icon').innerHTML = scenePreviews[id];
  for (const button of sceneGrid.children) {
    const active = button.dataset.scene === id;
    button.setAttribute('aria-pressed', String(active));
  }
  scene = entry.create(canvas, { onPlay: sleep });
  scene.resize(canvas.clientWidth, canvas.clientHeight);
}

showScene(scenes.keys().next().value);
sceneToggle.addEventListener('click', () => {
  sceneMenu.hidden = !sceneMenu.hidden;
  sceneToggle.setAttribute('aria-expanded', String(!sceneMenu.hidden));
  if (!sceneMenu.hidden) {
    clearTimeout(sleepTimer);
    sceneGrid.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  } else scheduleSleep();
});
$('close-scenes').addEventListener('click', closeSceneMenu);
document.addEventListener('pointerdown', event => {
  if (!sceneMenu.hidden && !sceneMenu.contains(event.target) && !sceneToggle.contains(event.target)) closeSceneMenu();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSceneMenu(); });
shuffleButton.addEventListener('click', () => {
  shuffleEnabled = !shuffleEnabled;
  shuffle.reset();
  shuffleButton.setAttribute('aria-pressed', String(shuffleEnabled));
  setText($('shuffle-state'), shuffleEnabled ? 'On' : 'Off');
});
shuffleBars.addEventListener('change', () => shuffle.setBars(Number(shuffleBars.value)));
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
    if (hosted && currentFrame?.status === 'demo') {
      currentFrame.beatPosition = siteAudio.demoBeatPosition() * (doubleTime ? 2 : 1);
    }
    if (!viewer && shuffleEnabled && !shufflePending && shuffle.advance(dt, currentFrame)) {
      const choices = [...scenes.keys()].filter(id => id !== sceneId);
      const next = choices[Math.floor(Math.random() * choices.length)];
      shufflePending = true;
      void chooseScene(next).finally(() => { shufflePending = false; });
    }
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
  if (sleeping || anyDialogOpen() || !sceneMenu.hidden || (hosted && pendingSource)) return;
  sleepTimer = setTimeout(() => {
    if (anyDialogOpen() || !sceneMenu.hidden || document.activeElement?.matches('.chrome :focus-visible') || densityInput.matches(':active')) return;
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
window.addEventListener('focus', () => { if (anyDialogOpen()) wake(); });
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
  if (anyDialogOpen() || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      event.target.closest?.('input, select, textarea, [contenteditable]')) return;
  const shortcut = event.key.toLowerCase();
  if (shortcut === 'f') toggleFullscreen();
  if (shortcut === 'k' && !kickButton.disabled) {
    event.preventDefault();
    kickButton.click();
  }
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

function updateTempo() {
  const bpm = detectedTempo === null ? null : detectedTempo * (doubleTime ? 2 : 1);
  if (currentFrame) currentFrame.spectrum.bpm = bpm;
  doubleTimeButton.setAttribute('aria-pressed', String(doubleTime));
  setText($('tempo'), bpm === null ? '—' : String(Math.round(bpm)));
}

function updateSourceButtons(source) {
  const ready = Boolean((hosted || key) && currentFrame);
  const listen = $('listen');
  listen.disabled = !ready || pendingSource || (hosted && (!siteAudio?.canCapture || source === 'live'));
  listen.setAttribute('aria-pressed', String(source === 'live'));
  outputInput.disabled = !ready || pendingSource || !loadedOutputs;
  $('demo').disabled = !ready || pendingSource;
  $('stop').disabled = !ready || pendingSource || source === 'off';
  doubleTimeButton.disabled = !ready;
  kickButton.disabled = !ready || pendingSource || !['live', 'quiet', 'demo'].includes(currentFrame?.status);
  $('share').disabled = !key || !currentFrame;
  densityInput.disabled = !ready;
  sceneToggle.disabled = !ready;
  shuffleButton.disabled = !ready;
  $('demo').setAttribute('aria-pressed', String(source === 'demo'));
}

function receive(frame) {
  const oldGeneration = currentFrame?.generation;
  lastFrameAt = performance.now();
  currentFrame = frame;
  detectedTempo = frame.spectrum.bpm;
  if (!hosted) doubleTime = frame.doubleTime === true;
  showScene(frame.scene);
  setText($('status'), statusText[frame.status] ?? 'Connected');
  $('dot').classList.toggle('active', frame.status === 'live' || frame.status === 'demo');
  updateTempo();
  if (viewer) {
    message(frame.source === 'off' ? 'Connected. Start listening on the PC.' :
      frame.status === 'unavailable' ? 'The PC’s audio output is unavailable.' : '');
  } else {
    updateSourceButtons(frame.source);
    setText($('device'), frame.device ?? (frame.source === 'demo' ? 'Built-in audio test · silent' :
      hosted ? 'System audio' : frame.status === 'unavailable' ? 'Check the selected playback device' : 'Windows playback'));
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
  detectedTempo = null;
  setText($('status'), 'Disconnected');
  updateTempo();
  $('dot').classList.remove('active');
  updateSourceButtons('off');
  if (viewer) message('Waiting for the PC. If sharing ended, scan a new code.');
  else showError($('error'), 'Waiting for the launcher. If it closed, open Vizuil from Windows.');
}

if (hosted) {
  $('share').hidden = true;
  $('capture-help').hidden = false;
  setText($('listen'), 'Share System Audio');
  const { createSiteAudio } = await import('./site-audio.mjs');
  siteAudio = createSiteAudio(frame => receive({ ...frame, scene: sceneId, density: siteDensity }),
    text => showError($('error'), text));
  const open = $('open-listening');
  open.href = location.href;
  setText($('capture-instructions'), siteAudio.canCapture
    ? 'Choose Entire Screen and turn on system audio in the browser picker. Use Vizuil for Windows to pick a specific playback device.'
    : 'Open Vizuil in desktop Chrome or Edge to share system audio. Use Vizuil for Windows to pick a specific playback device.');
  open.hidden = window.top === window && siteAudio.canCapture;
  await siteAudio.select('off');
  if (!welcomeSeen()) {
    welcomeDialog.showModal();
    wake();
  }
} else if (viewer || key) {
  const connection = new EventSource(viewer ? `${location.pathname}/frames` : `/api/frames?key=${key}`);
  connection.addEventListener('message', event => receive(JSON.parse(event.data)));
  connection.addEventListener('error', disconnected);
  connection.addEventListener('open', () => showError($('error'), ''));
  if (!viewer) {
    $('output-picker').hidden = false;
    connection.addEventListener('open', refreshOutputs);
    window.addEventListener('focus', refreshOutputs);
    setInterval(() => { if (!document.hidden && currentFrame) void refreshOutputs(); }, 3000);
  }
} else {
  setText($('status'), 'Launcher needed');
  showError($('error'), 'Open Vizuil from its Windows system tray icon.');
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

async function refreshOutputs() {
  if (refreshingOutputs || pendingSource) return;
  refreshingOutputs = true;
  try {
    const { outputs, selectedOutputId } = await api('outputs');
    if (pendingSource) return;
    if (!loadedOutputs) selectedOutput = selectedOutputId ?? '';
    const choices = [{ id: '', name: 'Windows default' }, ...outputs];
    if (!choices.some(output => output.id === selectedOutput)) {
      const name = outputInput.selectedOptions[0]?.dataset.deviceName;
      choices.push({ id: selectedOutput, name: name ?? 'Selected output', disconnected: true });
    }
    if (choices.length !== outputInput.length || choices.some(({ id, name, disconnected }, i) =>
      outputInput[i].value !== id || outputInput[i].dataset.deviceName !== name || outputInput[i].disabled !== Boolean(disconnected))) {
      outputInput.replaceChildren(...choices.map(({ id, name, disconnected }) => {
        const option = new Option(disconnected ? `${name} (disconnected)` : name, id);
        option.dataset.deviceName = name;
        option.disabled = Boolean(disconnected);
        return option;
      }));
    }
    outputInput.value = selectedOutput;
    loadedOutputs = true;
    updateSourceButtons(currentFrame?.source);
  } catch {
    // Keep the last device list while Windows is unavailable and retry on the next refresh.
  } finally {
    refreshingOutputs = false;
  }
}

outputInput.addEventListener('change', async () => {
  const previous = selectedOutput;
  selectedOutput = outputInput.value;
  showError($('error'), '');
  if (currentFrame?.source === 'live' && !await selectSource('live')) {
    outputInput.value = selectedOutput = previous;
  }
});

async function selectSource(source) {
  pendingSource = true;
  if (hosted) scheduleSleep();
  updateSourceButtons(currentFrame?.source);
  showError($('error'), '');
  try {
    if (source === 'kick') {
      if (hosted) siteAudio.kick();
      else await api('kick', 'POST');
    } else if (hosted) await siteAudio.select(source);
    else await api('source', 'POST', { source, deviceId: source === 'live' ? selectedOutput || null : null });
    return true;
  }
  catch (error) { showError($('error'), error.message); return false; }
  finally {
    pendingSource = false;
    updateSourceButtons(currentFrame?.source);
    if (hosted) wake();
  }
}
for (const [button, source] of [['listen', 'live'], ['demo', 'demo'], ['stop', 'off'], ['kick', 'kick']]) {
  $(button).addEventListener('click', () => selectSource(source));
}

doubleTimeButton.addEventListener('click', async () => {
  if (hosted) {
    doubleTime = !doubleTime;
    updateTempo();
  } else {
    try { await api('double-time', 'POST', { enabled: !doubleTime }); }
    catch (error) { showError($('error'), error.message); }
  }
});

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
$('welcome-close').addEventListener('click', () => welcomeDialog.close());
$('welcome-explore').addEventListener('click', () => welcomeDialog.close());
welcomeDialog.addEventListener('close', () => {
  try { localStorage.setItem('vizuil-welcome-seen', '1'); } catch {}
  wake();
});
$('welcome-demo').addEventListener('click', async event => {
  const button = event.currentTarget;
  const label = $('welcome-demo-label');
  button.disabled = true;
  showError($('welcome-error'), '');
  setText(label, 'Starting demo…');
  if (await selectSource('demo')) {
    welcomeDialog.close();
  } else {
    setText(label, 'Play looping demo');
    button.disabled = false;
    showError($('welcome-error'), $('error').textContent || 'The demo could not start. Please try again.');
  }
});
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

function welcomeSeen() {
  try { return localStorage.getItem('vizuil-welcome-seen') === '1'; }
  catch { return false; }
}
if (!viewer && key) api('share').then(displayShare).catch(() => {});
