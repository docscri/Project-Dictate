import { useEffect } from 'react';
import { updateConsultationNote } from '../../shared/api/endpoints.js';
import { handleConsultationError } from '../../shared/api/consultationErrors.js';
import { ApiError } from '../../shared/api/client.js';
import { autosaveDelayMs } from '../../shared/config.js';
import { getState } from '../../shared/state/store.js';
import { currentNote, changeNote, applyConsultation, sections } from '../../shared/state/notes.js';

// A consultation has a single save queue, including saves already in flight.
const queues = new WeakMap();
function queueFor(owner) {
  if (!queues.has(owner)) queues.set(owner, new Map());
  return queues.get(owner);
}
export async function saveNote(id, owner, explicit = false) {
  if (!owner || getState().user !== owner) return;
  const jobs = queueFor(owner);
  while (jobs.has(id)) {
    // A failed older write must not discard text waiting behind it.
    try { await jobs.get(id); } catch { /* Re-evaluate the latest version below. */ }
  }
  if (getState().user !== owner) return;
  const snapshot = currentNote(id);
  if (snapshot.locked) throw new ApiError('locked');
  if (!explicit && snapshot.failedSaveVersion === snapshot.editVersion) return;
  if (snapshot.editVersion <= snapshot.savedVersion) return;
  const body = { note: Object.fromEntries(sections.map(key => [key, snapshot.draft[key]])) };
  const job = updateConsultationNote(id, body).then(record => {
    if (getState().user !== owner) return;
    // Preserve text typed while the request was in flight.
    applyConsultation(record);
    changeNote(id, prior => ({ savedVersion: snapshot.editVersion, failedSaveVersion: null, errorCode: null,
      ...(prior.editVersion === snapshot.editVersion ? { draft: { ...prior.draft, ...record.note } } : {}) }));
  }).catch(async error => {
    if (getState().user === owner) { changeNote(id, { failedSaveVersion: snapshot.editVersion }); await handleConsultationError(id, error); }
    throw error;
  }).finally(() => { if (jobs.get(id) === job) jobs.delete(id); });
  jobs.set(id, job); await job;
}
export async function flushNote(id, owner) {
  if (!id || !owner) return;
  const jobs = queueFor(owner);
  while (getState().user === owner && (jobs.has(id) || currentNote(id).editVersion > currentNote(id).savedVersion)) await saveNote(id, owner, true);
}
export default function useAutosave({ id, record, note }) {
  useEffect(() => {
    if (!id || !['ready', 'failed', 'saved'].includes(record.status) || note.locked || note.signing || note.editVersion <= note.savedVersion) return;
    const owner = getState().user;
    const timer = setTimeout(() => saveNote(id, owner).catch(() => {}), autosaveDelayMs);
    return () => clearTimeout(timer);
  }, [id, record?.status, note.editVersion, note.savedVersion, note.signing, note.locked]);
  // Keep drafts in the shared store when switching consultation. Complete a pending edit.
  useEffect(() => {
    const owner = getState().user;
    return () => { if (id && getState().user === owner) saveNote(id, owner).catch(() => {}); };
  }, [id]);
  return async function flush() {
    const owner = getState().user;
    await flushNote(id, owner);
  };
}
