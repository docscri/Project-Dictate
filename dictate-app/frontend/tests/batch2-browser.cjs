// Isolated Vite: VITE_USE_MOCK=false, VITE_API_BASE_URL=http://127.0.0.1:8765, port 5174.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const assert = require('node:assert/strict');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

(async () => {
  const patient = { id: 'p1', name: 'Fixture Patient', age: 58, sex: 'male' };
  const record = { id: 'c1', patient_id: 'p1', doctor_id: 'one', status: 'saved', created_at: new Date().toISOString(), patient,
    transcript: 'Preserved transcript.', note: { subjective: 'Original note', objective: '', assessment: '', plan: '' } };
  const session = { user: { id: 'one', email: 'one@example.com' }, access_token: 'one-access', refresh_token: 'one-refresh' };
  let failSave = false, holdSave = null, holdCreate = null, failStatus = false, failDetail = false, validation = false, profileValidation = false;
  let saves = 0, signs = 0, finishes = 0, statusCalls = 0, patientSearchCalls = 0, cancelledSearch = false;
  const savedTexts = [], errors = [];
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Methods', '*'); res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, 'http://fixture'), path = url.pathname;
    let input = ''; for await (const chunk of req) input += chunk;
    const body = input ? JSON.parse(input) : {};
    let result, status = 200;
    if (path === '/api/auth/me') result = session.user;
    else if (path === '/api/profile') {
      if (req.method === 'PUT' && profileValidation) { status = 422; result = { code: 'validation_error', fields: ['specialty'], message: 'PRIVATE' }; }
      else result = { id: 'one', name: 'Dr Fixture', specialty: 'Cardiology' };
    } else if (path === '/api/consultations') {
      if (req.method === 'POST') {
        if (holdCreate) { const hold = holdCreate; holdCreate = null; hold.arrived.resolve(); await hold.release.promise; }
        result = record;
      } else result = [record];
    }
    else if (path === '/api/consultations/c1/status') {
      statusCalls++;
      if (failStatus) { status = 500; result = { code: 'server_error', message: 'PRIVATE' }; }
      else result = { id: 'c1', status: 'saved', processing_stage: 'completed' };
    } else if (path === '/api/consultations/c1/note') {
      saves++; savedTexts.push(body.note.subjective);
      if (holdSave) { const hold = holdSave; holdSave = null; hold.arrived.resolve(); await hold.release.promise; }
      if (validation) { status = 422; result = { code: 'validation_error', fields: ['plan'], message: 'PRIVATE' }; }
      else if (failSave) { status = 500; result = { code: 'server_error', message: 'PRIVATE' }; }
      else { record.note = body.note; result = record; }
    } else if (path === '/api/consultations/c1/sign') { signs++; record.status = 'signed'; result = record; }
    else if (path === '/api/dictation/finish') { finishes++; result = { status: 'processing' }; }
    else if (path === '/api/consultations/c1') {
      if (failDetail) { status = 500; result = { code: 'server_error', message: 'PRIVATE' }; }
      else result = record;
    } else if (path === '/api/patients') {
      patientSearchCalls++;
      if (url.searchParams.get('query') === 'old') {
        res.on('close', () => { if (!res.writableEnded) cancelledSearch = true; });
        return; // Hold until the user replaces the search.
      }
      result = [{ ...patient, name: url.searchParams.get('query') === 'new' ? 'Newest Result' : patient.name }];
    } else { status = 404; result = { code: 'not_found' }; }
    res.writeHead(status); res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(8765, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const subjective = () => page.getByRole('textbox', { name: 'Subjective', exact: true });
    const state = () => page.evaluate(async () => {
      const source = performance.getEntriesByType('resource').find(item => item.name.includes('/src/shared/state/store.js')).name;
      return (await import(source)).getState();
    });
    const waitSaved = () => page.waitForFunction(async () => {
      const source = performance.getEntriesByType('resource').find(item => item.name.includes('/src/shared/state/store.js')).name;
      const note = (await import(source)).getState().noteSessions.c1;
      return note && note.editVersion === note.savedVersion;
    });
    await page.goto('http://127.0.0.1:5174/login');
    await page.evaluate(tokens => {
      localStorage.setItem('dictate.backend.session', JSON.stringify({ ...tokens, user_id: tokens.user.id }));
      localStorage.setItem('dictate.backend.selection.one', 'c1');
    }, session);
    await page.goto('http://127.0.0.1:5174/dictation'); await subjective().waitFor();

    failSave = true; await subjective().fill('Keep this failed draft');
    await button('Try again').waitFor(); const failedCount = saves;
    await page.waitForTimeout(1200); assert.equal(saves, failedCount);
    assert.equal(await subjective().innerText(), 'Keep this failed draft');
    failSave = false; await button('Try again').click(); await waitSaved();
    assert.equal(record.note.subjective, 'Keep this failed draft');
    console.log('PASS failed-save banner, no retry loop, Try again saves the retained draft');

    const hold = { arrived: deferred(), release: deferred() }; holdSave = hold;
    await subjective().fill('Older in-flight text'); await hold.arrived.promise;
    await subjective().fill('Newest queued text'); failSave = true;
    hold.release.resolve(); await button('Try again').waitFor();
    failSave = false; await button('Try again').click(); await waitSaved();
    assert.equal(record.note.subjective, 'Newest queued text');
    console.log('PASS newer edit survives failure of the older in-flight save');

    failSave = true; await subjective().fill('Signing must save this');
    await button('Sign and save').click(); await button('Try again').waitFor(); assert.equal(signs, 0);
    let warned = false;
    page.once('dialog', async dialog => { warned = dialog.type() === 'beforeunload'; await dialog.dismiss(); });
    await page.reload({ timeout: 5000 }).catch(error => { assert.match(error.message, /ERR_ABORTED|Navigation|Timeout/i); });
    assert.equal(warned, true);
    if (await subjective().innerText() !== 'Signing must save this') await subjective().fill('Signing must save this');
    failSave = false; await button('Try again').click(); await waitSaved();
    assert.equal(record.note.subjective, 'Signing must save this');
    const clinicalStorage = await page.evaluate(() => Object.keys(localStorage).filter(key => /draft|noteSessions/.test(key)));
    assert.deepEqual(clinicalStorage, []);
    await button('Sign and save').click(); await page.locator('.note-signed').waitFor();
    assert.equal(signs, 1); assert.equal(await subjective().getAttribute('contenteditable'), 'false');
    console.log('PASS sign blocked by save failure; reload warning appears; successful save and signing lock work');

    record.status = 'processing'; record.processing_stage = 'structuring_note'; failStatus = true;
    await page.reload(); await button('Try again').waitFor(); const interruptedCalls = statusCalls;
    await page.waitForTimeout(1800); assert.equal(statusCalls, interruptedCalls);
    failStatus = false; failDetail = true; await button('Try again').click(); await button('Try again').waitFor();
    failDetail = false; record.status = 'saved'; await button('Try again').click(); await subjective().waitFor();
    assert.equal(finishes, 0); assert.equal((await state()).selectedConsultation.status, 'saved');
    console.log('PASS interrupted status and detail checks resume without another finish request');

    validation = true; await page.getByRole('textbox', { name: 'Plan', exact: true }).fill('Local plan');
    await page.getByText('Check the highlighted fields.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Plan', exact: true }).getAttribute('aria-invalid'), 'true');
    assert.equal(await subjective().getAttribute('aria-invalid'), null);
    validation = false; await button('Try again').click(); await waitSaved();
    await button('Open consultations').click(); await button('Profile').click(); profileValidation = true; await button('Save changes').click();
    await page.getByText('Check the highlighted fields.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('group', { name: 'Department', exact: true }).getAttribute('aria-invalid'), 'true');
    assert.equal(await page.getByLabel('Full name', { exact: true }).getAttribute('aria-invalid'), 'false');
    await page.getByRole('link', { name: 'Back to dictation', exact: true }).click(); await subjective().waitFor();
    console.log('PASS 422 highlights only the failed note section and profile department');

    await button('New dictation').click();
    const search = page.getByPlaceholder('Search by name');
    await page.waitForTimeout(300); assert.equal(patientSearchCalls, 0);
    await search.fill('old'); await page.waitForTimeout(400); await search.fill('new');
    await page.getByText('Newest Result', { exact: true }).waitFor();
    await page.waitForTimeout(150); assert.equal(cancelledSearch, true);
    const createHold = { arrived: deferred(), release: deferred() }; holdCreate = createHold;
    await page.locator('.patient-result').filter({ hasText: 'Newest Result' }).getByRole('button', { name: 'Select', exact: true }).click();
    await createHold.arrived.promise;
    await button('Preparing').waitFor();
    assert.equal(await page.getByText('Newest Result', { exact: true }).count(), 1);
    createHold.release.resolve(); await button('Start dictation').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByText('PRIVATE', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS outdated search transport aborts; newest result remains; no raw server copy or page errors');
    console.log(`Batch 2: 6 browser scenarios passed (${saves} saves, ${signs} sign, ${finishes} finish retries).`);
  } finally {
    await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
