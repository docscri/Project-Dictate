// Run against Vite on 5174 with VITE_USE_MOCK=false and API base http://127.0.0.1:8765.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const corePath = path.dirname(require.resolve('playwright-core/package.json', { paths: [process.env.PLAYWRIGHT_MODULE || __dirname] }));
const { wsServer } = require(path.join(corePath, 'lib/utilsBundle.js'));
const http = require('node:http');
const assert = require('node:assert/strict');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

(async () => {
  let outage = false, hold = null, consultationCreates = 0;
  const sockets = new Set();
  const records = {};
  for (const id of ['one', 'two']) {
    const patient = { id: `p-${id}`, name: `Patient ${id}`, age: 58, sex: 'male' };
    records[id] = { id: `c-${id}`, patient_id: patient.id, doctor_id: id, status: 'ready',
      created_at: new Date().toISOString(), patient, transcript: '', note: null };
  }
  const session = id => ({ user: { id, email: `${id}@example.com` }, access_token: `${id}-access`, refresh_token: `${id}-refresh` });
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const id = req.headers.authorization?.includes('two') ? 'two' : 'one';
    const current = records[id];
    let input = ''; for await (const chunk of req) input += chunk;
    const body = input ? JSON.parse(input) : {};
    const path = new URL(req.url, 'http://fixture').pathname;
    if (hold && path === hold.path && req.method === hold.method) {
      const pending = hold; pending.arrived.resolve(); await pending.release.promise;
    }
    let result, status = 200;
    if (path === '/api/auth/me') {
      if (outage) { status = 500; result = { code: 'server_error', message: 'PRIVATE PROVIDER DETAIL' }; }
      else result = session(id).user;
    } else if (path === '/api/auth/login') result = session(body.email.startsWith('two') ? 'two' : 'one');
    else if (path === '/api/auth/logout') result = { message: 'Logged out' };
    else if (path === '/api/profile') result = req.method === 'PUT' ? [{ id, name: body.name, specialty: body.specialty }] : { id, name: `Dr ${id}`, specialty: 'Cardiology' };
    else if (path === '/api/patients') result = req.method === 'POST' ? { id: 'created', ...body } : [current.patient];
    else if (path === '/api/consultations') {
      if (req.method === 'POST') { consultationCreates++; result = current; }
      else result = [current];
    } else if (path === `/api/consultations/${current.id}/pause`) { current.status = 'paused'; result = current; }
    else if (path.startsWith('/api/consultations/')) {
      if (req.method === 'DELETE') status = 204;
      else result = current;
    } else { status = 404; result = { code: 'not_found' }; }
    res.writeHead(status); res.end(status === 204 ? '' : JSON.stringify(result));
  });
  const wss = new wsServer({ server });
  wss.on('connection', socket => {
    sockets.add(socket);
    socket.send(JSON.stringify({ type: 'status', status: 'dictating' }));
    socket.send(JSON.stringify({ type: 'transcript', text: 'Kept words', final: true }));
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise(resolve => server.listen(8765, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
      window.testTracks = [];
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async options => {
        const stream = await original(options); window.testTracks.push(...stream.getTracks()); return stream;
      };
    });
    const first = await context.newPage(); const second = await context.newPage();
    for (const page of [first, second]) page.on('pageerror', error => errors.push(error.message));
    const button = (page, name) => page.getByRole('button', { name, exact: true });
    const state = page => page.evaluate(async () => {
      const source = performance.getEntriesByType('resource').find(item => item.name.includes('/src/shared/state/store.js'))?.name;
      return (await import(source)).getState();
    });
    const login = async (page, id) => {
      await page.goto('http://127.0.0.1:5174/login');
      await page.locator('.dictation-layout, .login-screen').waitFor();
      await page.evaluate(async () => { const source = performance.getEntriesByType('resource').find(item => item.name.includes('/src/shared/navigation.js')).name; (await import(source)).navigate('/login'); });
      await page.getByLabel('Email', { exact: true }).fill(`${id}@example.com`);
      await page.getByLabel('Password', { exact: true }).fill('fixture-password');
      await button(page, 'Sign in').click();
      await page.locator('.dictation-paper').waitFor();
      await button(page, 'Open consultations').click();
      await page.locator('.consultation-row').first().click();
      await button(page, /Start dictation|Resume/).waitFor();
    };
    const seed = async () => {
      await first.goto('http://127.0.0.1:5174/login');
      await first.evaluate(tokens => {
        localStorage.setItem('dictate.backend.session', JSON.stringify({ ...tokens, user_id: tokens.user.id }));
        localStorage.setItem('dictate.backend.selection.one', 'c-one');
      }, session('one'));
      await first.goto('http://127.0.0.1:5174/dictation');
      await button(first, 'Start dictation').waitFor();
      await second.goto('http://127.0.0.1:5174/dictation');
      await button(second, 'Start dictation').waitFor();
    };
    await seed();
    assert.equal(await button(first, 'New dictation').count(), 0);
    outage = true; await first.reload();
    await first.getByText('Something went wrong. Try again.', { exact: true }).waitFor();
    assert.ok(await first.evaluate(() => JSON.parse(localStorage.getItem('dictate.backend.session')).refresh_token));
    assert.equal(await first.getByText('PRIVATE PROVIDER DETAIL').count(), 0);
    outage = false; await button(first, 'Try again').click(); await button(first, 'Start dictation').waitFor();
    console.log('PASS startup outage: session retained, safe banner, manual retry recovers');

    await button(first, 'Start dictation').click(); await first.locator('.dictation-controls--listening').waitFor();
    await button(first, 'New dictation').waitFor();
    await button(second, 'Open consultations').click();
    await button(second, 'Profile').click();
    hold = { path: '/api/auth/logout', method: 'POST', arrived: deferred(), release: deferred() };
    await button(second, 'Sign out').click(); await hold.arrived.promise;
    await button(first, 'Sign in').waitFor();
    await button(second, 'Sign in').waitFor();
    hold.release.resolve(); hold = null;
    await first.waitForFunction(() => window.testTracks.length && window.testTracks.every(track => track.readyState === 'ended'));
    assert.deepEqual((await state(first)).dictationSessions, {});
    console.log('PASS cross-tab sign-out: Login, microphone stopped, transcript/account data cleared');

    await login(first, 'one'); await login(second, 'one');
    await button(first, 'Start dictation').click(); await first.locator('.dictation-controls--listening').waitFor();
    await login(second, 'two');
    await first.waitForFunction(async () => {
      const source = performance.getEntriesByType('resource').find(item => item.name.includes('/src/shared/state/store.js')).name;
      return (await import(source)).getState().user?.id === 'two';
    });
    await first.waitForFunction(() => window.testTracks.every(track => track.readyState === 'ended'));
    assert.equal((await state(first)).user.id, 'two');
    assert.equal((await state(first)).selectedConsultation, null);
    assert.deepEqual((await state(first)).dictationSessions, {});
    console.log('PASS cross-tab account switch: new patient/profile, old recording stopped and data cleared');

    await login(first, 'one'); await login(second, 'one');
    await first.evaluate(async () => {
      const source = performance.getEntriesByType('resource').find(item => item.name.includes('/src/shared/state/store.js')).name;
      (await import(source)).setState({ patientPopupOpen: true });
    });
    await first.getByRole('tab', { name: 'Add patient', exact: true }).click();
    await first.getByLabel('Patient name', { exact: true }).fill('Delayed patient');
    hold = { path: '/api/patients', method: 'POST', arrived: deferred(), release: deferred() };
    await button(first, 'Add patient').click(); await hold.arrived.promise;
    await button(first, 'Close popup').click();
    const createsBefore = consultationCreates;
    hold.release.resolve(); hold = null;
    await first.waitForTimeout(250);
    assert.equal(consultationCreates, createsBefore);
    assert.equal((await state(first)).selectedConsultation.id, 'c-one');
    console.log('PASS closed patient popup: delayed creation cannot start another consultation');

    await button(first, 'Start dictation').click(); await first.locator('.dictation-controls--listening').waitFor();
    hold = { path: '/api/consultations/c-one/pause', method: 'POST', arrived: deferred(), release: deferred() };
    await button(first, 'Pause').click(); await hold.arrived.promise;
    assert.equal((await state(first)).dictationSessions['c-one'].mode, 'paused');
    await login(second, 'two');
    await first.waitForFunction(async () => {
      const source = performance.getEntriesByType('resource').find(item => item.name.includes('/src/shared/state/store.js')).name;
      return (await import(source)).getState().user?.id === 'two';
    });
    hold.release.resolve(); hold = null; await first.waitForTimeout(250);
    const afterPause = await state(first);
    assert.equal(afterPause.user.id, 'two'); assert.equal(afterPause.selectedConsultation, null);
    assert.deepEqual(afterPause.dictationSessions, {});
    console.log('PASS delayed pause: previous account response cannot populate the new account');

    await login(first, 'one'); await login(second, 'one');
    await button(first, 'Resume').click(); await first.locator('.dictation-controls--listening').waitFor();
    const trackCount = await first.evaluate(() => window.testTracks.length);
    await second.evaluate(() => { const value = JSON.parse(localStorage.getItem('dictate.backend.session')); value.access_token = 'one-renewed-access'; localStorage.setItem('dictate.backend.session', JSON.stringify(value)); });
    await first.waitForTimeout(150);
    assert.equal((await state(first)).dictationSessions['c-one'].mode, 'listening');
    assert.equal(await first.evaluate(index => window.testTracks[index - 1].readyState, trackCount), 'live');
    console.log('PASS same-account token renewal: recording and transcript remain active');
    hold = { path: '/api/consultations/c-one', method: 'DELETE', arrived: deferred(), release: deferred() };
    await button(first, 'Delete all').click(); await button(first, 'Delete').click(); await hold.arrived.promise;
    await login(second, 'two');
    await first.waitForFunction(async () => {
      const source = performance.getEntriesByType('resource').find(item => item.name.includes('/src/shared/state/store.js')).name;
      return (await import(source)).getState().user?.id === 'two';
    });
    hold.release.resolve(); hold = null; await first.waitForTimeout(250);
    assert.equal((await state(first)).selectedConsultation, null);
    assert.deepEqual((await state(first)).dictationSessions, {});
    console.log('PASS delayed deletion: new account selection and data remain intact');

    await login(first, 'one'); await login(second, 'one');
    await button(first, 'Open consultations').click(); await button(first, 'Profile').click();
    await first.getByLabel('Full name', { exact: true }).fill('Previous account edit');
    hold = { path: '/api/profile', method: 'PUT', arrived: deferred(), release: deferred() };
    await button(first, 'Save changes').click(); await hold.arrived.promise;
    await login(second, 'two');
    await first.getByLabel('Full name', { exact: true }).waitFor();
    hold.release.resolve(); hold = null; await first.waitForTimeout(250);
    assert.equal(await first.getByLabel('Full name', { exact: true }).inputValue(), 'Dr two');
    assert.equal((await state(first)).user.id, 'two');
    console.log('PASS delayed profile save: new account form is not overwritten');
    assert.deepEqual(errors, []);
    console.log('PASS no uncaught browser errors');
  } finally {
    hold?.release.resolve();
    await browser.close();
    for (const socket of sockets) socket.terminate();
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
