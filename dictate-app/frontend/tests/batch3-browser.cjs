// Isolated Vite: VITE_USE_MOCK=false, VITE_API_BASE_URL=http://127.0.0.1:8765, port 5174.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const session = { user: { id: 'one', email: 'one@example.com' }, access_token: 'access', refresh_token: 'refresh' };
  const rows = Array.from({ length: 123 }, (_, index) => ({ id: `c${index}`, doctor_id: 'one', patient_id: `p${index}`,
    status: 'ready', created_at: new Date(Date.UTC(2026, 9, 9, 12, 0, 0) - index * 60000).toISOString(),
    patient: { id: `p${index}`, name: `Patient ${index}`, age: 58, sex: 'male' } }));
  let profileCalls = 0, failPage = false, failDetail = false, profile = { id: 'one', name: 'Dr Fixture', specialty: 'Cardiology' };
  const offsets = [], detailCalls = [], errors = [];
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Methods', '*'); res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, 'http://fixture'), path = url.pathname;
    let input = ''; for await (const chunk of req) input += chunk;
    let result, status = 200;
    if (path === '/api/auth/me') result = session.user;
    else if (path === '/api/profile') {
      if (req.method === 'PUT') profile = { ...profile, ...JSON.parse(input) };
      else profileCalls++;
      result = profile;
    } else if (path === '/api/consultations') {
      const offset = Number(url.searchParams.get('offset')); offsets.push(offset);
      assert.equal(Number(url.searchParams.get('limit')), 50);
      if (failPage && offset === 50) { status = 500; result = { code: 'server_error', message: 'PRIVATE' }; }
      else result = rows.slice(offset, offset + 50);
    } else if (/^\/api\/consultations\/c\d+$/.test(path)) {
      const id = path.split('/').at(-1); detailCalls.push(id);
      if (failDetail) { status = 500; result = { code: 'server_error' }; }
      else result = { ...rows.find(row => row.id === id), status: id === 'c0' ? 'saved' : 'ready', transcript: 'Retained words',
        note: id === 'c0' ? { subjective: 'Original note', objective: '', assessment: '', plan: '' } : null };
    } else if (path === '/api/patients') result = rows.slice(0, 4).map(row => row.patient);
    else { status = 404; result = { code: 'not_found' }; }
    res.writeHead(status); res.end(JSON.stringify(result));
  });
  await new Promise(resolve => server.listen(8765, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    await page.goto('http://127.0.0.1:5174/login');
    await page.evaluate(tokens => {
      localStorage.setItem('dictate.backend.session', JSON.stringify({ ...tokens, user_id: 'one' }));
      localStorage.setItem('dictate.backend.selection.one', 'c90');
    }, session);
    await page.goto('http://127.0.0.1:5174/dictation');
    await page.waitForFunction(() => document.querySelectorAll('.consultation-row').length === 50);
    await page.getByRole('heading', { name: 'Patient 90, 58', exact: true }).waitFor();
    assert.equal(profileCalls, 1); assert.ok(detailCalls.includes('c90'));
    await page.screenshot({ path: path.join(os.tmpdir(), 'dictate-batch3-ready.png') });
    console.log('PASS first page is bounded and an older remembered selection restores directly');

    failPage = true;
    await button('Open consultations').click();
    await page.locator('.consultation-list').evaluate(node => { node.scrollTop = node.scrollHeight; });
    await page.locator('.consultation-list').getByRole('button', { name: 'Try again' }).waitFor();
    const failedCount = offsets.length; await page.waitForTimeout(500); assert.equal(offsets.length, failedCount);
    assert.equal(await page.locator('.consultation-row').count(), 50);
    failPage = false; await page.locator('.consultation-list').getByRole('button', { name: 'Try again' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.consultation-row').length === 100);
    await page.locator('.consultation-row').last().focus();
    await page.waitForFunction(() => document.querySelectorAll('.consultation-row').length === 123);
    assert.ok(offsets.includes(100));
    assert.equal(await page.locator('.consultation-row').evaluateAll(nodes => new Set(nodes.map(node => node.textContent)).size), 123);
    console.log('PASS page failure retains rows, stops retries; manual retry and keyboard load all 123 rows');

    failDetail = true; await page.locator('.consultation-row').first().click();
    await button('Open consultations').click();
    await page.locator('.consultation-list').getByRole('button', { name: 'Try again' }).waitFor();
    failDetail = false; await page.locator('.consultation-list').getByRole('button', { name: 'Try again' }).click();
    await page.getByRole('heading', { name: 'Patient 0, 58', exact: true }).waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'dictate-batch3-note.png') });
    console.log('PASS detail retry works after the last list page');

    const live = page.getByRole('tab', { name: 'Live transcript', exact: true });
    await live.focus(); await live.press('End');
    assert.equal(await page.getByRole('tab', { name: 'Clinical note' }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await live.getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    for (const tab of await page.getByRole('tab').all()) {
      const panel = page.locator(`[id="${await tab.getAttribute('aria-controls')}"]`);
      assert.equal(await panel.count(), 1);
      assert.equal(await panel.getAttribute('aria-labelledby'), await tab.getAttribute('id'));
    }
    const focus = await live.evaluate(node => ({ width: getComputedStyle(node).outlineWidth, style: getComputedStyle(node).outlineStyle }));
    assert.equal(focus.width, '2px'); assert.notEqual(focus.style, 'none');
    await button('Sources').focus();
    await page.evaluate(async () => {
      const source = performance.getEntriesByType('resource').find(item => item.name.includes('/src/shared/state/store.js')).name;
      (await import(source)).setState({ patientPopupOpen: true });
    });
    const search = page.getByRole('tab', { name: 'Search', exact: true });
    await search.focus(); await search.press('ArrowRight');
    await page.getByRole('textbox', { name: 'Patient name', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await button('Sources').evaluate(node => document.activeElement === node), true);
    console.log('PASS keyboard tabs, linked panels, visible focus and popup Escape focus return');

    await button('Open consultations').click(); await button('Profile').click(); await page.getByRole('textbox', { name: 'Full name' }).waitFor();
    assert.equal(profileCalls, 1);
    await page.getByRole('textbox', { name: 'Full name' }).fill('Dr Updated');
    await button('Save changes').click(); await page.getByText('Saved', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Back to dictation', exact: true }).click();
    await button('Open consultations').click();
    await page.locator('.dictation-profile').getByText('Dr Updated', { exact: true }).waitFor();
    assert.equal(profileCalls, 1);
    console.log('PASS profile fetch is shared and a saved profile updates the sidebar');

    await page.evaluate(async () => {
      const source = performance.getEntriesByType('resource').find(item => item.name.includes('/src/shared/state/store.js')).name;
      const { getState, setState } = await import(source);
      window.sidebarMutations = 0;
      const observer = new MutationObserver(records => { window.sidebarMutations += records.length; });
      observer.observe(document.querySelector('.consultation-list'), { subtree: true, childList: true, attributes: true, characterData: true });
      for (let index = 0; index < 100; index++) {
        setState(state => ({ dictationSessions: { ...state.dictationSessions, [getState().selectedConsultation.id]: { confirmed: ['Retained'], interim: `Words ${index}`, status: 'paused', elapsed: index } } }));
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      observer.disconnect();
    });
    assert.equal(await page.evaluate(() => window.sidebarMutations), 0);
    assert.deepEqual(errors, []);
    assert.equal(await page.getByText('PRIVATE', { exact: false }).count(), 0);
    console.log('PASS sustained transcript updates leave the sidebar DOM untouched; no browser errors or raw server text');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
