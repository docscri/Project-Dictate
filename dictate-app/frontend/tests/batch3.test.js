import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoreSnapshot, getState, setState, subscribe } from '../src/shared/state/store.js';
import { consultationSummary, mergeConsultationPage, updateConsultationSummaries } from '../src/shared/state/consultations.js';
import { nextEnabledTab } from '../src/shared/accessibility/tabs.js';

test('sidebar snapshot stays stable throughout 1000 transcript updates', () => {
  setState({ consultations: [{ id: 'c1' }], selectedConsultation: { id: 'c1' } });
  const snapshot = createStoreSnapshot(state => ({ rows: state.consultations, selectedId: state.selectedConsultation?.id }));
  const original = snapshot();
  for (let count = 0; count < 1000; count++) {
    setState({ dictationSessions: { c1: { interim: `words ${count}` } } });
    assert.equal(snapshot(), original);
  }
  setState({ selectedConsultation: { id: 'c2' } });
  assert.notEqual(snapshot(), original);
});
test('no-change store updates do not notify subscribers', () => {
  let calls = 0;
  const unsubscribe = subscribe(() => calls++);
  setState({}); setState({ consultations: getState().consultations });
  unsubscribe(); assert.equal(calls, 0);
});
test('pages are deduplicated, ordered and exclude clinical payloads', () => {
  const rows = mergeConsultationPage([{ id: 'a', created_at: '2026-01-01' }], [
    { id: 'b', created_at: '2026-02-01', transcript: 'private', note: {}, terms: [] },
    { id: 'a', created_at: '2026-02-01' },
  ]);
  assert.deepEqual(rows.map(row => row.id), ['b', 'a']);
  assert.equal(rows.length, 2); assert.equal('transcript' in rows[0], false);
  assert.deepEqual(consultationSummary({ id: 'c', note: {}, terms: [], transcript: 'private' }), { id: 'c' });
});
test('editing a note keeps the list reference stable; status changes update only its row', () => {
  const rows = [{ id: 'a', status: 'saved' }, { id: 'b', status: 'saved' }];
  assert.equal(updateConsultationSummaries(rows, { id: 'a', note: {}, transcript: 'new' }), rows);
  const changed = updateConsultationSummaries(rows, { id: 'a', status: 'signed', note: {} });
  assert.equal(changed[1], rows[1]); assert.equal(changed[0].status, 'signed');
  assert.equal('note' in changed[0], false);
});
test('keyboard tabs wrap, skip disabled tabs and support Home and End', () => {
  const items = [{ value: 'one' }, { value: 'two', disabled: true }, { value: 'three' }];
  assert.equal(nextEnabledTab(items, 'one', 'ArrowRight'), 'three');
  assert.equal(nextEnabledTab(items, 'one', 'ArrowLeft'), 'three');
  assert.equal(nextEnabledTab(items, 'three', 'ArrowRight'), 'one');
  assert.equal(nextEnabledTab(items, 'three', 'Home'), 'one');
  assert.equal(nextEnabledTab(items, 'one', 'End'), 'three');
  assert.equal(nextEnabledTab(items, 'one', 'Enter'), null);
  assert.equal(nextEnabledTab([{ value: 'one', disabled: true }], 'one', 'Home'), null);
});
