import { useEffect, useRef, useState } from 'react';
import { finishDictation, getConsultationStatus, getConsultation, signConsultation } from '../../shared/api/endpoints.js';
import { handleConsultationError } from '../../shared/api/consultationErrors.js';
import { pollIntervalMs } from '../../shared/config.js';
import { getState, useStore } from '../../shared/state/store.js';
import { noteSession, changeNote, currentNote, applyConsultation, emptyNote, stages } from '../../shared/state/notes.js';
import useSessionGuard from '../../shared/auth/useSessionGuard.js';

export default function useNoteStatus() {
  const capture = useSessionGuard();
  const [pollAttempt, setPollAttempt] = useState(0);
  const { selectedConsultation: record, noteSessions } = useStore(state => ({ selectedConsultation: state.selectedConsultation, noteSessions: state.noteSessions }));
  const id = record?.id, note = noteSessions[id] ?? noteSession(record);
  const retrying = useRef(false);
  useEffect(() => { if (id && !getState().noteSessions[id]) changeNote(id, noteSession(record)); }, [id, record]);
  useEffect(() => {
    if (!id || record.status !== 'processing' || record.processing_pending) return;
    let active = true, timer;
    const owner = getState().user;
    const current = capture();
    const valid = () => active && current() && getState().user === owner;
    async function poll() {
      try {
        const status = await getConsultationStatus(id);
        if (!valid()) return;
        changeNote(id, { errorCode: null });
        if (stages.some(([key]) => key === status.processing_stage)) changeNote(id, { lastStage: status.processing_stage });
        if (['saved', 'signed'].includes(status.status)) {
          const detail = await getConsultation(id);
          if (!valid()) return;
          changeNote(id, prior => ({
            ...(prior.editVersion > prior.savedVersion ? {} : { draft: { ...emptyNote(), ...detail.note }, editVersion: 0, savedVersion: 0 }),
            activeTab: 'note', manual: false,
          }));
          applyConsultation(detail); return;
        }
        if (status.status === 'failed') { changeNote(id, { activeTab: 'note' }); applyConsultation({ id, ...status }); return; }
        if (status.status !== 'processing') { applyConsultation({ id, ...status }); return; }
        // Poll only while the server still reports processing.
        applyConsultation({ id, ...status, status: 'processing' });
      } catch (error) { if (valid()) await handleConsultationError(id, error); return; }
      if (valid()) timer = setTimeout(poll, pollIntervalMs);
    }
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [id, record?.status, record?.processing_pending, pollAttempt]);
  async function retry() {
    if (id && record.status === 'processing' && note.errorCode) { changeNote(id, { errorCode: null }); setPollAttempt(value => value + 1); return; }
    if (!id || record.status !== 'failed' || retrying.current) return;
    retrying.current = true;
    const owner = getState().user;
    changeNote(id, { errorCode: null });
    try {
      const result = await finishDictation({ consultation_id: id });
      if (getState().user !== owner) return;
      changeNote(id, { activeTab: 'note', manual: false, lastStage: result.processing_stage ?? 'finalizing_transcript' });
      applyConsultation({ id, ...result });
    } catch (error) { if (getState().user === owner) await handleConsultationError(id, error); }
    finally { retrying.current = false; }
  }
  async function retrySave(flush) {
    if (!id || currentNote(id).signing || record.status === 'signed' || record.status === 'processing') return;
    const current = capture();
    changeNote(id, { signing: true, errorCode: null });
    try { await flush(); }
    catch (error) { if (current()) await handleConsultationError(id, error); }
    finally { if (current()) changeNote(id, { signing: false }); }
  }
  async function sign(flush) {
    if (!id || currentNote(id).signing || record.status === 'signed' || record.status === 'processing') return;
    const owner = getState().user;
    changeNote(id, { signing: true, errorCode: null });
    try {
      await flush();
      if (getState().user !== owner) return;
      const result = await signConsultation(id);
      if (getState().user !== owner) return;
      applyConsultation(result); changeNote(id, { activeTab: 'note', manual: false });
    } catch (error) { if (getState().user === owner) await handleConsultationError(id, error); }
    finally { if (getState().user === owner) changeNote(id, { signing: false }); }
  }
  return { id, record, note, retry, sign, retrySave,
    changeTab: activeTab => changeNote(id, { activeTab }),
    edit: (section, text) => { if (record.status !== 'signed' && !currentNote(id).locked) changeNote(id, prior => ({ draft: { ...prior.draft, [section]: text }, editVersion: prior.editVersion + 1, errorCode: null, invalidSections: (prior.invalidSections ?? []).filter(key => key !== section) })); },
    manual: () => changeNote(id, prior => ({ draft: emptyNote(), manual: true, activeTab: 'note', editVersion: prior.editVersion + 1, errorCode: null })),
  };
}
