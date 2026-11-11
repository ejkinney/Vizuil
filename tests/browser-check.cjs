const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdir } = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const readline = require('node:readline');
const { setTimeout: delay } = require('node:timers/promises');

const [dotnet, checks, playwright, evidence, soakMinutes = '0'] = process.argv.slice(2);
const { chromium, webkit } = require(playwright);

async function waitFor(check, detail, limit = 6000) {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(75);
  }
  throw new Error(detail);
}

async function checkBeatStackMotion(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  try {
    const result = await page.evaluate(async () => {
      const { createBeatStack } = await import('/assets/beat-stack.mjs');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      const arc = ctx.arc.bind(ctx);
      let headX;
      ctx.arc = (x, y, radius, ...args) => {
        if (radius === 24) headX = x;
        arc(x, y, radius, ...args);
      };
      const scene = createBeatStack(canvas);
      scene.resize(1280, 720);
      const bands = Array(32).fill(0);
      bands[0] = 0.9;
      const frame = { source: 'demo', status: 'demo', generation: 1, spectrum: {
        bands, bpm: null, hits: [0, 0, 0],
      } };
      const sample = dt => {
        scene.render(dt, frame, 1);
        return headX;
      };
      const unlocked = [sample(0), sample(0.25)];
      frame.spectrum.bpm = 120;
      frame.spectrum.hits[0]++;
      const locked = [sample(0), sample(0.25), sample(0.25), sample(0.25)];
      return { unlocked, locked };
    });
    assert.equal(result.unlocked[0], result.unlocked[1], 'Beat Stack should wait for tempo lock');
    const [firstBeat, firstStep, secondBeat, secondStep] = result.locked;
    assert(firstBeat - firstStep > 10 && secondStep - secondBeat > 10,
      'Beat Stack should rock and step on both beats with reduced motion enabled');
  } finally {
    await page.emulateMedia({ reducedMotion: null });
  }
}

async function checkBlockParty(page) {
  const result = await page.evaluate(async () => {
    const { createBlockParty } = await import('/assets/block-party.mjs');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const sprites = new Map();
    let placements;
    ctx.drawImage = (sprite, x, y, width) => {
      if (width === undefined) return;
      if (!sprites.has(sprite)) sprites.set(sprite, sprites.size);
      const { e, f } = ctx.getTransform();
      placements.push([`${e.toFixed(2)},${f.toFixed(2)}`, sprites.get(sprite), e.toFixed(2), f.toFixed(2)]);
    };
    const scene = createBlockParty(canvas);
    scene.resize(1280, 720);
    const frame = { generation: 1, status: 'live', spectrum: {
      hits: [0, 0, 0], energy: [0, 0, 0], bands: Array(32).fill(0), bpm: null,
    } };
    const sample = dt => {
      placements = [];
      scene.render(dt, frame);
      return placements;
    };
    const advance = ticks => {
      let positions;
      for (let tick = 0; tick < ticks; tick++) positions = sample(1 / 32);
      return positions;
    };
    const resting = sample(0);
    const rowCounts = new Map();
    for (const [, , , y] of resting) rowCounts.set(y, (rowCounts.get(y) ?? 0) + 1);
    const sortedRows = [...rowCounts].sort(([a], [b]) => Number(a) - Number(b));
    const pyramidRows = sortedRows.map(([, count]) => count);
    let before = new Map(resting);
    const slots = before.size;
    const rounds = [];
    let kicks = 0;
    const staysStill = () => {
      for (let tick = 0; tick < 64; tick++) {
        if (tick % 8 === 0) frame.spectrum.hits = [++kicks, 0, 0];
        if (sample(1 / 32).some(([slot, sprite]) => before.get(slot) !== sprite)) return false;
      }
      return true;
    };
    const beforeLock = staysStill();
    frame.spectrum.bpm = 120;
    frame.spectrum.hits = [++kicks, 0, 0];
    sample(0);
    const rejectedWeakKick = advance(4).every(([slot, sprite]) => before.get(slot) === sprite);
    frame.spectrum.bpm = null;
    frame.spectrum.bands[0] = 0.8;
    before = new Map(advance(96));
    frame.spectrum.bpm = 120;
    for (let beat = 1; beat <= 8; beat++) {
      frame.density = beat <= 4 ? 0 : 1;
      if (beat !== 4 && beat !== 8) frame.spectrum.hits = [++kicks, 0, 0];
      sample(beat === 1 ? 0 : 1 / 32);
      const airborne = advance(4);
      advance(3);
      if (beat === 2) frame.spectrum.hits = [++kicks, 0, 0];
      const settled = advance(8);
      const after = new Map(settled);
      const changed = settled.filter(([slot, sprite]) => before.get(slot) !== sprite).length;
      rounds.push({
        changed, airborne: airborne.length, settled: settled.length,
        unique: after.size, sameSlots: settled.every(([slot]) => before.has(slot)),
        sameCrew: [...before.values()].sort().join() === [...after.values()].sort().join(),
        allBounced: airborne.every(([slot]) => !before.has(slot)),
        sameLanes: airborne.map(([, , x]) => x).sort().join() === resting.map(([, , x]) => x).sort().join(),
      });
      before = after;
    }
    frame.spectrum.bpm = null;
    const afterUnlock = staysStill();
    frame.generation++;
    frame.spectrum.hits = [0, 0, 0];
    frame.spectrum.bands.fill(0);
    const restingSteps = new Map(advance(24));
    frame.spectrum.bands[0] = 0.8;
    frame.spectrum.bands[31] = 1;
    const raised = positions => positions.filter(([slot]) => !restingSteps.has(slot));
    const liveColumns = raised(advance(3)).length;
    const recentRows = raised(advance(5)).length;
    frame.status = 'off';
    frame.generation++;
    const cleared = raised(advance(18)).length;

    frame.status = 'live';
    frame.generation++;
    frame.spectrum.bands.fill(0);
    frame.spectrum.bands[15] = 1;
    sample(0);
    const frontPeaks = raised(advance(5)).map(([, , x, y]) => [Number(x), Number(y)]);
    const historyLanes = raised(advance(9)).map(([, , x]) => Number(x));
    const centerX = Number(resting.find(([, , , y]) => y === sortedRows[0][0])[2]);
    const frontY = Number(sortedRows.at(-1)[0]);
    const rowSpacing = Number(sortedRows[1][0]) - Number(sortedRows[0][0]);
    return { slots, pyramidRows, rounds, liveColumns, recentRows, cleared, beforeLock, afterUnlock, rejectedWeakKick,
      frontPeaks, historyLanes, centerX, frontY, rowSpacing };
  });
  assert.equal(result.slots, 28);
  assert(result.beforeLock && result.afterUnlock, 'Raw kicks should not bounce or swap critters while tempo is unlocked');
  assert(result.rejectedWeakKick, 'An unqualified bass hit should not anchor the Block Party beat');
  assert.deepEqual(result.pyramidRows, [1, 2, 3, 4, 5, 6, 7], 'The highest rear step should widen into seven lower rows');
  for (const [index, round] of result.rounds.entries()) {
    assert.equal(round.airborne, 28);
    assert.equal(round.settled, 28);
    assert.equal(round.unique, 28);
    assert(round.sameSlots && round.sameCrew && round.allBounced, `Unexpected placement on beat ${index + 1}`);
    if (index === 3) assert.equal(round.changed, 4);
    else if (index === 7) assert(round.changed > 4 && round.changed <= 12 && round.changed % 2 === 0);
    else assert(round.changed === 0 && round.sameLanes, `Critters changed lanes on beat ${index + 1}`);
  }
  assert.equal(result.liveColumns, 2, 'The lowest and highest frequencies should lift two live blocks');
  assert.equal(result.recentRows, 4, 'The peaks should also lift the preceding row');
  assert.equal(result.cleared, 0, 'The spectrum blocks should settle after Stop');
  assert.deepEqual(result.frontPeaks.map(([x]) => x), [result.centerX], 'A midrange peak should lift the center of the front row');
  assert(result.frontY - result.frontPeaks[0][1] > result.rowSpacing / 2, 'A strong peak should produce a pronounced lift');
  assert.equal(result.historyLanes.filter(x => x === result.centerX).length, 2, 'The peak should travel back in the same lane');
  assert.equal(result.historyLanes.filter(x => x < result.centerX).length, 1, 'A staggered row should share the center peak on the left');
  assert.equal(result.historyLanes.filter(x => x > result.centerX).length, 1, 'A staggered row should share the center peak on the right');
}

async function checkCarrierBeacon(page) {
  const pulses = await page.evaluate(async () => {
    const { createBulletHell } = await import('/assets/bullet-hell.mjs');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const fill = ctx.fillRect.bind(ctx);
    let pulsed;
    ctx.fillRect = (...args) => {
      if (ctx.fillStyle === '#e0ffff') pulsed = true;
      fill(...args);
    };
    const scene = createBulletHell(canvas);
    scene.resize(1200, 700);
    const frame = { generation: 1, source: 'live', status: 'live', spectrum: {
      bpm: null, hits: [0, 0, 0], bands: Array(32).fill(0), energy: [0, 0, 0], level: 0,
    } };
    const sample = (dt, input = frame) => {
      pulsed = false;
      scene.render(dt, input);
      return pulsed;
    };
    const beforeLock = sample(0);
    frame.spectrum.bpm = 120;
    frame.spectrum.hits = [1, 0, 1];
    frame.spectrum.bands[31] = 1;
    const treble = sample(0);
    frame.spectrum.hits = [2, 0, 1];
    frame.spectrum.bands[0] = 0.8;
    const kick = sample(0);
    let faded;
    for (let i = 0; i < 5; i++) faded = sample(0.05);
    let coasted;
    for (let i = 0; i < 6; i++) coasted = sample(0.05);
    const disconnected = sample(0, null);
    const reconnected = sample(0, { ...frame, generation: 2 });
    return { beforeLock, treble, kick, faded, coasted, disconnected, reconnected };
  });
  assert.deepEqual(pulses, {
    beforeLock: false, treble: false, kick: true, faded: false, coasted: true, disconnected: false, reconnected: false,
  }, 'The carrier beacon should follow the same kick and tempo lock as the other scenes');
}

async function soak(desktop, status, errors) {
  await desktop.setViewportSize({ width: 1920, height: 1080 });
  await desktop.locator('#demo').click();
  await desktop.waitForFunction(() => document.body.classList.contains('sleep'));
  const cdp = await desktop.context().newCDPSession(desktop);
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return (await cdp.send('Runtime.getHeapUsage')).usedSize;
  };
  const initialHeap = await heap();
  const start = performance.now();
  let leastFps = Infinity;
  do {
    const [framesBefore, timeBefore] = await desktop.evaluate(() => [window.scenePaints, performance.now()]);
    await delay(5000);
    const [framesAfter, timeAfter] = await desktop.evaluate(() => [window.scenePaints, performance.now()]);
    const fps = 1000 * (framesAfter - framesBefore) / (timeAfter - timeBefore);
    leastFps = Math.min(leastFps, fps);
    assert.equal(await status(), 'Silent demo');
    assert.deepEqual(errors, []);
    const elapsed = (performance.now() - start) / 60000;
    console.log(`Soak ${elapsed.toFixed(1)} min, ${fps.toFixed(1)} FPS`);
    if (elapsed < Number(soakMinutes)) await delay(Math.min(55000, (Number(soakMinutes) - elapsed) * 60000));
  } while (performance.now() - start < Number(soakMinutes) * 60000);
  const growth = (await heap()) - initialHeap;
  assert(growth < 3 * 1024 * 1024, `Retained heap grew by ${growth} bytes`);
  assert(leastFps > 30, `Renderer slowed to ${leastFps} FPS`);
  console.log(`Soak passed. Retained JS heap delta ${growth} bytes.`);
}

async function main() {
  await mkdir(evidence, { recursive: true });
  const host = spawn(dotnet, [checks, '--serve'], { windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
  let browser, phoneBrowser, desktopPlayer, relay;
  const watch = new AbortController();
  try {
    const url = await new Promise((resolve, reject) => {
      const limit = setTimeout(() => reject(new Error('Launcher did not start')), 10000);
      const lines = readline.createInterface({ input: host.stdout });
      lines.on('line', line => {
        if (line.startsWith('http://')) { clearTimeout(limit); resolve(line.trim()); }
        else console.log(line);
      });
      host.once('error', reject);
      host.once('exit', code => { clearTimeout(limit); reject(new Error(`Launcher exited with ${code}`)); });
    });
    const origin = new URL(url).origin;
    const key = new URLSearchParams(new URL(url).hash.slice(1)).get('key');
    assert.equal((await fetch(`${origin}/api/networks`)).status, 401);
    assert.equal((await fetch(`${origin}/api/frames?key=wrong`)).status, 401);
    browser = await chromium.launch({ channel: 'msedge', ignoreDefaultArgs: ['--mute-audio'], args: ['--autoplay-policy=no-user-gesture-required'] });
    const desktopContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const desktop = await desktopContext.newPage();
    await desktop.addInitScript(() => {
      window.scenePaints = 0;
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (this.canvas.id === 'scene' && args.length === 3 && args[0].width === this.canvas.width) window.scenePaints++;
        return drawImage.apply(this, args);
      };
    });
    const errors = [];
    desktop.on('pageerror', error => errors.push(error.message));
    desktop.on('console', message => { if (message.type() === 'error') console.log('Desktop console:', message.text().replace(/\?key=[a-f0-9]+/g, '')); });
    await desktop.goto(url);
    const status = () => desktop.locator('#status').textContent();
    await waitFor(async () => await status() === 'Ready', 'Desktop did not connect');
    if (process.env.VIZUIL_SOAK_ONLY === '1') { await soak(desktop, status, errors); return; }
    await checkBeatStackMotion(desktop);
    await checkCarrierBeacon(desktop);
    await desktop.screenshot({ path: path.join(evidence, 'desktop-controls.png') });
    const isSleeping = () => document.body.classList.contains('sleep') && document.querySelector('#console').inert;
    await desktop.waitForFunction(isSleeping);
    await desktop.mouse.move(250, 300);
    await desktop.waitForFunction(() => !document.querySelector('#console').inert);
    const focusSession = await desktopContext.newCDPSession(desktop);
    await focusSession.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    const otherTab = await desktopContext.newPage();
    await otherTab.bringToFront();
    await desktop.waitForFunction(isSleeping, null, { timeout: 1500 });
    await otherTab.close();
    await desktop.bringToFront();
    await desktop.mouse.move(251, 300);
    await desktop.waitForFunction(() => !document.querySelector('#console').inert);
    await focusSession.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await focusSession.detach();
    await desktop.locator('#fullscreen').click();
    assert(await desktop.evaluate(() => Boolean(document.fullscreenElement)));
    await desktop.keyboard.press('f');

    await desktop.locator('#demo').click();
    await waitFor(async () => await status() === 'Silent demo', 'Demo did not start');
    await desktop.waitForFunction(() => document.body.classList.contains('sleep'));
    await delay(250);
    await desktop.screenshot({ path: path.join(evidence, 'landscape.png') });
    await desktop.setViewportSize({ width: 1080, height: 1920 });
    await delay(1200);
    await desktop.screenshot({ path: path.join(evidence, 'portrait.png') });

    await desktop.mouse.move(250, 300);
    await desktop.locator('#share').click();
    await desktop.waitForFunction(() => document.querySelector('#network').options.length > 0);
    const networks = await desktop.locator('#network option').evaluateAll(options => options.map(option => ({ name: option.text, value: option.value })));
    const network = networks.find(option => option.name.startsWith('Ethernet 2 ·')) ?? networks[0];
    await desktop.locator('#network').selectOption(network.value);
    await desktop.locator('#start-share').click();
    await desktop.waitForFunction(() => !document.querySelector('#share-active').hidden);
    const viewerUrl = await desktop.locator('#viewer-link').inputValue();
    await desktop.waitForFunction(() => document.querySelector('#qr').naturalWidth > 0);
    assert.equal(new URL(viewerUrl).hostname, network.value);
    const viewerOrigin = new URL(viewerUrl).origin;
    assert.equal((await fetch(`${viewerOrigin}/api/source`, { method: 'POST', headers: { Authorization: `Bearer ${key}` } })).status, 404);
    assert.equal((await fetch(`${viewerOrigin}/v/wrong`)).status, 404);

    if (process.env.VIZUIL_PHONE_ENGINE === 'webkit') phoneBrowser = await webkit.launch();
    const mobile = await (phoneBrowser ?? browser).newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const phone = await mobile.newPage();
    phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(viewerUrl);
    await waitFor(async () => await phone.locator('#status').textContent() === 'Silent demo', 'Mobile demo did not sync');
    assert.equal(await phone.locator('#console').isVisible(), false);
    await phone.waitForFunction(() => document.body.classList.contains('sleep'));
    await delay(250);
    await phone.screenshot({ path: path.join(evidence, 'phone.png'), scale: 'css' });

    await desktop.locator('#close-share').click();
    await desktop.locator('#picker').selectOption('block-party');
    await waitFor(async () => await desktop.locator('#scene-name').textContent() === 'Block Party', 'Desktop did not switch scenes');
    await checkBlockParty(desktop);
    await waitFor(async () => await phone.locator('#scene').getAttribute('data-scene') === 'block-party', 'Phone did not follow the selected scene');
    await desktop.setViewportSize({ width: 1920, height: 1080 });
    await desktop.waitForFunction(() => document.body.classList.contains('sleep'));
    const mapPixels = () => desktop.locator('#scene').evaluate(canvas => {
      const ctx = canvas.getContext('2d');
      const { width, height } = canvas;
      // Sample the middle steps to catch motion from the spectrum and critters.
      const pixels = ctx.getImageData(width * 0.6, height * 0.41, 150, 96).data;
      return pixels.reduce((hash, value) => (Math.imul(hash, 31) + value) | 0, 0);
    });
    const firstPose = await mapPixels();
    await waitFor(async () => await mapPixels() !== firstPose, 'Block Party did not animate in Demo');
    await delay(250);
    await desktop.screenshot({ path: path.join(evidence, 'block-party.png') });
    await phone.screenshot({ path: path.join(evidence, 'block-party-phone.png'), scale: 'css' });

    await desktop.mouse.move(255, 300);
    await desktop.locator('#picker').selectOption('tidal-garden');
    for (const [page, name] of [[desktop, 'tidal-garden'], [phone, 'tidal-garden-phone']]) {
      await page.waitForFunction(() => document.querySelector('#scene').dataset.scene === 'tidal-garden');
      assert(await page.locator('#scene').evaluate(canvas => {
        const gl = canvas.getContext('webgl');
        return gl && gl.getError() === gl.NO_ERROR && gl.drawingBufferWidth > 0;
      }), `${name} should have a working 3D canvas`);
      await page.waitForFunction(() => document.body.classList.contains('sleep'));
      await delay(250);
      const first = await page.screenshot({ path: path.join(evidence, `${name}.png`), scale: 'css' });
      await delay(210);
      assert(!(await page.screenshot({ scale: 'css' })).equals(first), `${name} did not animate`);
    }
    await desktop.mouse.move(256, 302);
    await desktop.locator('#picker').selectOption('block-party');
    await waitFor(async () => await desktop.locator('#scene-name').textContent() === 'Block Party', 'Could not leave the aquarium');
    assert.equal(await desktop.locator('.aquarium-caption').count(), 0);
    console.log('Tidal Garden rendered and animated on desktop and the shared phone viewer.');

    await phone.setViewportSize({ width: 844, height: 390 });
    await phone.waitForFunction(() => document.querySelector('#scene').width > document.querySelector('#scene').height);
    // Close an actual open SSE socket; browser offline emulation can leave existing streams alive.
    const liveConnections = new Set();
    let interrupted = false;
    relay = http.createServer((request, response) => {
      if (interrupted) { request.socket.destroy(); return; }
      const upstream = http.get(new URL(request.url, viewerOrigin), data => {
        response.writeHead(data.statusCode, data.headers);
        data.pipe(response);
      });
      if (request.url.endsWith('/frames')) liveConnections.add(request.socket);
      response.on('close', () => { liveConnections.delete(request.socket); upstream.destroy(); });
      upstream.on('error', () => response.destroy());
    });
    await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
    await phone.goto(`http://127.0.0.1:${relay.address().port}${new URL(viewerUrl).pathname}`);
    await waitFor(async () => await phone.locator('#status').textContent() === 'Silent demo', 'Proxied viewer did not connect');
    interrupted = true;
    for (const socket of liveConnections) socket.destroy();
    await waitFor(async () => await phone.locator('#status').textContent() === 'Disconnected', 'Phone did not report loss of connection');
    interrupted = false;
    await waitFor(async () => await phone.locator('#status').textContent() === 'Silent demo', 'Phone did not recover after network interruption');
    await desktop.mouse.move(250, 300);
    await desktop.locator('#share').click();
    await desktop.locator('#stop-share').click();
    await waitFor(async () => await phone.locator('#status').textContent() === 'Disconnected', 'Stopping share did not disconnect phone');
    await assert.rejects(fetch(viewerUrl));
    await desktop.locator('#close-share').click();
    await mobile.close();
    await desktop.locator('#stop').click();
    await waitFor(async () => await status() === 'Ready', 'Stopping Demo did not return to Ready');
    await delay(520);
    const stoppedPose = await mapPixels();
    await delay(500);
    assert.equal(await mapPixels(), stoppedPose, 'Block Party kept moving after Stop');
    await desktop.locator('#picker').selectOption('bullet-hell');
    await waitFor(async () => await desktop.locator('#scene-name').textContent() === 'Bullet Hell', 'Could not return to Bullet Hell');
    assert.deepEqual(errors, []);
    console.log('Pyramid steps, every-beat bounces, fourth-beat swaps, spectrum history, fullscreen, phone layout, and sharing passed.');
    if (process.env.VIZUIL_PHONE_ONLY === '1') return;

    await desktop.mouse.move(260, 300);
    let latest;
    const frames = await fetch(`${origin}/api/frames?key=${key}`, { signal: watch.signal });
    (async () => {
      let buffered = '';
      for await (const chunk of frames.body.pipeThrough(new TextDecoderStream())) {
        const lines = (buffered + chunk).split('\n');
        buffered = lines.pop();
        for (const line of lines) if (line.startsWith('data: ')) latest = JSON.parse(line.slice(6));
      }
    })().catch(error => { if (!watch.signal.aborted) console.error(error.message); });
    await desktop.locator('#listen').click();
    await waitFor(() => ['quiet', 'live'].includes(latest?.status), 'Windows loopback did not open');
    async function probeFrequency() {
      const peaks = new Array(32).fill(0);
      let quiet = true;
      for (let i = 0; i < 12; i++) {
        quiet &&= latest.status === 'quiet';
        latest.spectrum.bands.forEach((level, band) => { peaks[band] = Math.max(peaks[band], level); });
        await delay(60);
      }
      let band = 21;
      for (let i = 22; i < 29; i++) if (peaks[i] < peaks[band]) band = i;
      const frequency = Math.round(40 * 400 ** ((band + 0.5) / 32));
      return { frequency, quiet, detected: () => latest.spectrum.bands[band] >= Math.max(0.48, peaks[band] + 0.1) };
    }

    const browserTone = await probeFrequency();
    await desktop.evaluate(frequency => {
      const audio = new AudioContext();
      const tone = audio.createOscillator();
      const amp = audio.createGain();
      amp.gain.value = 0;
      tone.frequency.value = frequency;
      tone.connect(amp).connect(audio.destination);
      tone.start();
      for (let step = 0; step < 12; step++) {
        const time = audio.currentTime + 0.05 + step * 0.125;
        amp.gain.setValueAtTime(0.002, time);
        amp.gain.linearRampToValueAtTime(step % 4 === 0 ? 0.036 : 0.021, time + 0.007);
        amp.gain.exponentialRampToValueAtTime(0.002, time + 0.12);
      }
      tone.stop(audio.currentTime + 1.6);
      tone.onended = () => audio.close();
    }, browserTone.frequency);
    await waitFor(browserTone.detected, 'Browser test tone was not captured');
    if (browserTone.quiet) await waitFor(() => latest.status === 'quiet', 'Capture did not return to quiet after browser playback');
    else await delay(1600);

    const desktopTone = await probeFrequency();
    desktopPlayer = spawn('ffplay.exe', ['-nodisp', '-autoexit', '-loglevel', 'error', '-f', 'lavfi',
      `aevalsrc=0.035*sin(2*PI*${desktopTone.frequency}*t)*exp(-9*mod(t\\,0.25)):s=48000:d=1.8`],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'inherit'] });
    desktopPlayer.on('error', error => console.error(error.message));
    await waitFor(desktopTone.detected, 'Standalone desktop test tone was not captured');
    if (desktopTone.quiet) await waitFor(() => latest.status === 'quiet', 'Capture did not return to quiet after desktop playback');
    await desktop.mouse.move(262, 300);
    await desktop.locator('#stop').click();
    await waitFor(async () => await status() === 'Ready', 'Stopping live capture did not return to Ready');
    assert.deepEqual(errors, []);
    console.log('Windows loopback detected the browser and standalone playback probes, and Stop released capture.');
    if (browserTone.quiet && desktopTone.quiet) console.log('Live capture returned to quiet between playback sources.');

    if (Number(soakMinutes) > 0) await soak(desktop, status, errors);
  } finally {
    watch.abort();
    desktopPlayer?.kill();
    await phoneBrowser?.close();
    await browser?.close();
    relay?.close();
    host.stdin.end('\n');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
