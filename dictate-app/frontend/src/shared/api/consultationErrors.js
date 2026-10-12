import { getConsultation } from './endpoints.js';
import { getState, setState } from '../state/store.js';
import { applyConsultation, changeNote } from '../state/notes.js';

// Reconcile server state once. Retain draft text, save versions and transcript.
export async function handleConsultationError(id, error) {
  const owner = getState().user;
  if (!owner) return;
  const code = error.code ?? 'server_error';
  changeNote(id, { errorCode: code, ...(code === 'locked' ? { locked: true } : {}),
    ...(code === 'validation_error' ? { invalidSections: error.fields?.length ? error.fields : ['subjective', 'objective', 'assessment', 'plan'] } : {}) });
  if (code === 'locked') applyConsultation({ id, status: 'signed' });
  if (code === 'already_processing') { applyConsultation({ id, status: 'processing' }); changeNote(id, { activeTab: 'note' }); }
  if (!['invalid_state', 'locked', 'already_processing'].includes(code)) return;
  try {
    const record = await getConsultation(id);
    if (getState().user !== owner) return;
    applyConsultation(record);
    changeNote(id, { errorCode: code, locked: record.status === 'signed',
      ...(['processing', 'saved', 'signed', 'failed'].includes(record.status) ? { activeTab: 'note' } : {}) });
    setState(state => {
      const previous = state.dictationSessions[id];
      if (!previous) return {};
      const mode = record.status === 'dictating' ? previous.mode : record.status === 'ready' ? 'ready' : 'paused';
      return { dictationSessions: { ...state.dictationSessions, [id]: { ...previous, mode, errorCode: code } } };
    });
  } catch { /* Original error stays visible; no retry or replacement of local text. */ }
}
