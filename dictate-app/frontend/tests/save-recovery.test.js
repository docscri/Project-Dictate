import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setTokens, clearTokens, getAccessToken } from '../src/shared/auth/session.js';
import { getState, setState } from '../src/shared/state/store.js';
import { changeNote, currentNote, noteSession } from '../src/shared/state/notes.js';
import { saveNote, flushNote } from '../src/modules/note/useAutosave.js';
import { request } from '../src/shared/api/client.js';
import { hasUnsavedNotes, protectUnsavedNotes } from '../src/shared/state/useUnsavedChanges.js';

const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
globalThis.window = { history: { replaceState() {}, pushState() {} } };
const session = id => ({ access_token: `${id}-access`, refresh_token: `${id}-refresh`, user: { id } });
const respond = (status, body) => new Response(JSON.stringify(body), { status });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const record = { id: 'c1', status: 'saved', note: { subjective: 'original', objective: '', assessment: '', plan: '' } };
const edit = text => changeNote('c1', prior => ({ draft: { ...prior.draft, subjective: text }, editVersion: prior.editVersion + 1 }));
const tick = () => new Promise(resolve => setImmediate(resolve));
beforeEach(() => {
  clearTokens(); setTokens(session('one'));
  setState({ selectedConsultation: record, consultations: [record], noteSessions: { c1: noteSession(record) } });
});

test('a newer queued edit saves after an older write fails', async () => {
  const first = deferred(); const writes = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); writes.push(body.note.subjective);
    return writes.length === 1 ? first.promise : respond(200, { ...record, note: body.note });
  };
  const owner = getState().user;
  edit('first edit'); const old = saveNote('c1', owner); const failure = assert.rejects(old, error => error.code === 'server_error');
  edit('latest edit'); const newer = saveNote('c1', owner);
  first.resolve(respond(500, { code: 'server_error', message: 'PRIVATE DETAIL' }));
  await failure; await newer;
  assert.deepEqual(writes, ['first edit', 'latest edit']);
  assert.equal(currentNote('c1').savedVersion, 2);
  assert.equal(currentNote('c1').draft.subjective, 'latest edit');
  assert.equal(currentNote('c1').errorCode, null);
});

test('an older successful response preserves text typed during the save', async () => {
  const wait = deferred(); globalThis.fetch = () => wait.promise;
  edit('first'); const save = saveNote('c1', getState().user);
  edit('new unsaved text'); wait.resolve(respond(200, { ...record, note: { ...record.note, subjective: 'first' } }));
  await save;
  assert.equal(currentNote('c1').draft.subjective, 'new unsaved text');
  assert.equal(currentNote('c1').savedVersion, 1);
  assert.equal(hasUnsavedNotes(), true);
});

test('failed unchanged text is not retried automatically but explicit flush recovers', async () => {
  let calls = 0;
  globalThis.fetch = async (_url, options) => ++calls === 1 ? respond(500, { code: 'server_error' }) : respond(200, { ...record, note: JSON.parse(options.body).note });
  edit('kept draft'); const owner = getState().user;
  await assert.rejects(saveNote('c1', owner)); await saveNote('c1', owner);
  assert.equal(calls, 1); assert.equal(currentNote('c1').draft.subjective, 'kept draft');
  await flushNote('c1', owner);
  assert.equal(calls, 2); assert.equal(hasUnsavedNotes(), false);
});

test('flush waits for the current save and then saves the newest edit', async () => {
  const wait = deferred(); const writes = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); writes.push(body.note.subjective);
    return writes.length === 1 ? wait.promise : respond(200, { ...record, note: body.note });
  };
  edit('older'); const owner = getState().user; const old = saveNote('c1', owner);
  edit('newest'); const flush = flushNote('c1', owner);
  await tick(); assert.equal(writes.length, 1);
  wait.resolve(respond(200, { ...record, note: { ...record.note, subjective: 'older' } }));
  await old; await flush;
  assert.deepEqual(writes, ['older', 'newest']); assert.equal(hasUnsavedNotes(), false);
});

test('flush rejects a failed write and never marks it saved', async () => {
  globalThis.fetch = async () => respond(500, { code: 'server_error' }); edit('do not sign');
  await assert.rejects(flushNote('c1', getState().user), error => error.code === 'server_error');
  assert.equal(currentNote('c1').savedVersion, 0); assert.equal(hasUnsavedNotes(), true);
});

test('another account has an independent save queue', async () => {
  const wait = deferred(); let calls = 0;
  globalThis.fetch = async (_url, options) => ++calls === 1 ? wait.promise : respond(200, { ...record, note: JSON.parse(options.body).note });
  edit('private one'); const old = saveNote('c1', getState().user); const rejected = assert.rejects(old, error => error.code === 'session_changed');
  setTokens(session('two')); setState({ selectedConsultation: record, noteSessions: { c1: noteSession(record) } });
  edit('private two'); await saveNote('c1', getState().user);
  wait.resolve(respond(200, record)); await rejected;
  assert.equal(currentNote('c1').draft.subjective, 'private two');
});

test('request timeout aborts a hung fetch and retains session and edits', async () => {
  let signal; globalThis.fetch = (_url, options) => { signal = options.signal; return new Promise(() => {}); };
  edit('unsaved'); await assert.rejects(request('GET', '/test', undefined, false, { timeoutMs: 15 }), error => error.code === 'server_error');
  assert.equal(signal.aborted, true); assert.equal(getAccessToken(), 'one-access'); assert.equal(currentNote('c1').draft.subjective, 'unsaved');
});

test('request timeout also bounds a hung response body', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
  await assert.rejects(request('GET', '/test', undefined, false, { timeoutMs: 15 }), error => error.code === 'server_error');
});

test('dictation request timeout uses the connection message and keeps transcript', async () => {
  const previous = globalThis.location;
  globalThis.location = { pathname: '/dictation' };
  setState({ dictationSessions: { c1: { finalText: 'Kept words' } } });
  globalThis.fetch = () => new Promise(() => {});
  try {
    await assert.rejects(request('GET', '/test', undefined, false, { timeoutMs: 15 }), error => error.code === 'connection_error');
    assert.equal(getState().dictationSessions.c1.finalText, 'Kept words');
  } finally { globalThis.location = previous; }
});

test('a request waiting for refresh is bounded without clearing the session', async () => {
  const wait = deferred(); let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? respond(401, {}) : wait.promise;
  edit('keep while refreshing');
  await assert.rejects(request('GET', '/test', undefined, false, { timeoutMs: 20 }), error => error.code === 'server_error');
  assert.equal(calls, 2); assert.equal(getAccessToken(), 'one-access'); assert.equal(hasUnsavedNotes(), true);
  // A shared refresh may complete for other requests after this caller times out.
  wait.resolve(respond(200, session('one'))); await tick();
});

test('cancelled search aborts transport without refresh or session clearing', async () => {
  const controller = new AbortController(); let calls = 0, signal;
  globalThis.fetch = (_url, options) => { calls++; signal = options.signal; return new Promise(() => {}); };
  const result = request('GET', '/test', undefined, false, { signal: controller.signal }); controller.abort();
  await assert.rejects(result, error => error.code === 'request_cancelled');
  assert.equal(signal.aborted, true); assert.equal(calls, 1); assert.equal(getAccessToken(), 'one-access');
});

test('an already cancelled request never opens a connection', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0; globalThis.fetch = () => { calls++; };
  await assert.rejects(request('GET', '/test', undefined, false, { signal: controller.signal }), error => error.code === 'request_cancelled');
  assert.equal(calls, 0);
});

test('reload warning protects dirty notes including another consultation', () => {
  changeNote('hidden', { editVersion: 1, savedVersion: 0 });
  const event = { preventDefault() { this.prevented = true; } }; protectUnsavedNotes(event);
  assert.equal(event.prevented, true); assert.equal(event.returnValue, '');
  changeNote('hidden', { savedVersion: 1 }); assert.equal(hasUnsavedNotes(), false);
  const clean = { preventDefault() { throw new Error('clean page must not warn'); } }; protectUnsavedNotes(clean);
  clearTokens(); assert.equal(hasUnsavedNotes(), false);
});
