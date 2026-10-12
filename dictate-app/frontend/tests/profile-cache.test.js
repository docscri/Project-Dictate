import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProfile } from '../src/shared/state/profile.js';
import { getState } from '../src/shared/state/store.js';
import { clearTokens, setTokens } from '../src/shared/auth/session.js';

const tokens = id => ({ user: { id }, access_token: `${id}-access`, refresh_token: `${id}-refresh` });
const reply = profile => new Response(JSON.stringify(profile), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('simultaneous profile consumers share a request and reuse the result', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0, release;
  globalThis.fetch = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  try {
    setTokens(tokens('one'));
    const first = loadProfile(), second = loadProfile();
    assert.equal(first, second); assert.equal(calls, 1);
    release(reply({ id: 'one', name: 'Doctor One' }));
    const profile = await first;
    assert.equal(await loadProfile(), profile);
    assert.equal(getState().doctorProfile, profile); assert.equal(calls, 1);
  } finally { globalThis.fetch = previousFetch; clearTokens(); }
});

test('a delayed profile cannot populate a replacement account', async () => {
  const previousFetch = globalThis.fetch;
  let release;
  globalThis.fetch = () => new Promise(resolve => { release = resolve; });
  try {
    setTokens(tokens('one'));
    const old = loadProfile();
    const rejected = assert.rejects(old, error => error.code === 'session_changed');
    setTokens(tokens('two'));
    release(reply({ id: 'one', name: 'Old Doctor' }));
    await rejected;
    assert.equal(getState().user.id, 'two'); assert.equal(getState().doctorProfile, null);
  } finally { globalThis.fetch = previousFetch; clearTokens(); }
});
