import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setTokens, clearTokens, getAccessToken, getRefreshToken, captureSession, listenForSessionChanges, onSessionInvalidated } from '../src/shared/auth/session.js';
import { getState, setState } from '../src/shared/state/store.js';
import { request } from '../src/shared/api/client.js';

const values = new Map();
const events = new EventTarget();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
globalThis.window = { addEventListener: (...args) => events.addEventListener(...args), removeEventListener: (...args) => events.removeEventListener(...args), history: { replaceState() {}, pushState() {} } };
const key = 'dictate.backend.session';
const tokens = id => ({ access_token: `${id}-access`, refresh_token: `${id}-refresh`, user: { id } });
const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const storage = () => { const event = new Event('storage'); Object.defineProperty(event, 'key', { value: key }); events.dispatchEvent(event); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { clearTokens(); setTokens(tokens('one')); setState({ sessionReady: true, path: '/dictation' }); });

test('temporary refresh network failure preserves tokens and local work', async () => {
  const draft = { draft: { subjective: 'unsaved words' } };
  setState({ noteSessions: { one: draft }, dictationSessions: { one: { finalText: 'kept transcript' } } });
  let calls = 0;
  globalThis.fetch = async () => { if (++calls === 1) return respond(401, {}); throw new TypeError('offline'); };
  await assert.rejects(request('GET', '/test'), error => error.code === 'server_error');
  assert.equal(calls, 2);
  assert.equal(getAccessToken(), 'one-access');
  assert.equal(getRefreshToken(), 'one-refresh');
  assert.equal(getState().noteSessions.one, draft);
  assert.equal(getState().dictationSessions.one.finalText, 'kept transcript');
});

test('temporary refresh server failure preserves the session', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? respond(401, {}) : respond(500, { code: 'server_error' });
  await assert.rejects(request('GET', '/test'), error => error.code === 'server_error');
  assert.equal(getAccessToken(), 'one-access');
});

test('rejected refresh clears the session and shows the existing notice', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? respond(401, {}) : respond(401, { code: 'session_expired' });
  await assert.rejects(request('GET', '/test'), error => error.code === 'session_expired');
  assert.equal(getAccessToken(), null);
  assert.equal(getState().path, '/login');
  assert.equal(getState().sessionNotice, 'session_expired');
});

test('successful refresh retries once without invalidating recording ownership', async () => {
  const current = captureSession();
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? respond(401, {}) : calls === 2 ? respond(200, { ...tokens('one'), access_token: 'renewed' }) : respond(200, { ok: true });
  assert.deepEqual(await request('GET', '/test'), { ok: true });
  assert.equal(calls, 3);
  assert.equal(current(), true);
  assert.equal(getAccessToken(), 'renewed');
});

test('an old 401 cannot refresh or clear a newer account', async () => {
  const wait = deferred(); let calls = 0;
  globalThis.fetch = () => { ++calls; return wait.promise; };
  const result = request('GET', '/test');
  setTokens(tokens('two'));
  wait.resolve(respond(401, {}));
  await assert.rejects(result, error => error.code === 'session_changed');
  assert.equal(calls, 1); assert.equal(getAccessToken(), 'two-access');
});

test('an old successful response cannot be consumed by a newer account', async () => {
  const wait = deferred(); globalThis.fetch = () => wait.promise;
  const result = request('GET', '/test');
  setTokens(tokens('two')); wait.resolve(respond(200, { private: 'one' }));
  await assert.rejects(result, error => error.code === 'session_changed');
});

test('a delayed refresh cannot restore the previous account', async () => {
  const wait = deferred(); let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? respond(401, {}) : wait.promise;
  const result = request('GET', '/test');
  await new Promise(resolve => setImmediate(resolve));
  setTokens(tokens('two')); wait.resolve(respond(200, tokens('one')));
  await assert.rejects(result, error => error.code === 'session_changed');
  assert.equal(getAccessToken(), 'two-access');
});

test('another tab sign-out invalidates capture and clears old account data', () => {
  const current = captureSession(); let stopped = false; let change;
  const off = onSessionInvalidated(() => { stopped = true; });
  const stop = listenForSessionChanges(value => { change = value; });
  setState({ consultations: [{ id: 'private' }], noteSessions: { one: { draft: 'private' } } });
  values.delete(key); storage(); off(); stop();
  assert.equal(stopped, true); assert.equal(current(), false); assert.equal(change, false);
  assert.equal(getAccessToken(), null); assert.equal(getState().user, null);
  assert.deepEqual(getState().consultations, []); assert.deepEqual(getState().noteSessions, {});
});

test('another tab account change clears data but retains its new tokens', () => {
  let change; const stop = listenForSessionChanges(value => { change = value; });
  setState({ selectedConsultation: { id: 'old' } });
  values.set(key, JSON.stringify({ ...tokens('two'), user_id: 'two' })); storage(); stop();
  assert.equal(change, true); assert.equal(getAccessToken(), 'two-access');
  assert.equal(getState().selectedConsultation, null); assert.equal(getState().user, null);
});

test('same-account refresh in another tab preserves data and ownership', () => {
  const current = captureSession(); const user = getState().user;
  setState({ selectedConsultation: { id: 'kept' } });
  let calls = 0; const stop = listenForSessionChanges(() => { ++calls; });
  values.set(key, JSON.stringify({ ...tokens('one'), access_token: 'renewed', user_id: 'one' })); storage(); stop();
  assert.equal(current(), true); assert.equal(getState().user, user);
  assert.equal(getState().selectedConsultation.id, 'kept'); assert.equal(calls, 0);
});

test('concurrent unauthorized requests share one refresh and retry once each', async () => {
  const wait = deferred(); let refreshes = 0; let attempts = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/api/auth/refresh')) { refreshes++; return wait.promise; }
    attempts++;
    return options.headers.Authorization === 'Bearer renewed' ? respond(200, { ok: true }) : respond(401, {});
  };
  const first = request('GET', '/test-one'); const second = request('GET', '/test-two');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshes, 1);
  wait.resolve(respond(200, { ...tokens('one'), access_token: 'renewed' }));
  assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }]);
  assert.equal(refreshes, 1); assert.equal(attempts, 4);
});

test('a malformed refresh response does not remove valid stored tokens', async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? respond(401, {}) : respond(200, { user: { id: 'one' } });
  await assert.rejects(request('GET', '/test'), error => error.code === 'server_error');
  assert.equal(getAccessToken(), 'one-access'); assert.equal(getRefreshToken(), 'one-refresh');
});

test('a request cannot use another account tokens before its storage event arrives', async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; return respond(200, {}); };
  values.set(key, JSON.stringify({ ...tokens('two'), user_id: 'two' }));
  await assert.rejects(request('PUT', '/test', { name: 'Old account edit' }), error => error.code === 'session_changed');
  assert.equal(calls, 0);
});
