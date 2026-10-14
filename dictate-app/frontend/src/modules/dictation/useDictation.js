import { useEffect, useRef, useState } from 'react';
import { pauseConsultation, deleteConsultation, previewDictation, finishDictation } from '../../shared/api/endpoints.js';
import { changeNote } from '../../shared/state/notes.js';
import { handleConsultationError } from '../../shared/api/consultationErrors.js';
import { useMock } from '../../shared/config.js';
import { createMicCapture, requestMicrophoneAccess } from '../../shared/audio/micCapture.js';
import { openDictationSocket } from '../../shared/realtime/dictationSocket.js';
import { expireSession, onSessionInvalidated } from '../../shared/auth/session.js';
import useSessionGuard from '../../shared/auth/useSessionGuard.js';
import { getState, setState, useStore } from '../../shared/state/store.js';
import { states, stateForStatus } from './dictationStates.js';
import { updateConsultationSummaries } from '../../shared/state/consultations.js';

const elapsedAt = (session, now = Date.now()) => (session.elapsed ?? 0) + (session.startedAt == null ? 0 : Math.max(0, now - session.startedAt));
// A server "dictating" record does not mean this window owns its stream.
const initial = consultation => ({ mode: consultation?.status === 'dictating' ? states.paused : stateForStatus(consultation?.status), elapsed: 0, startedAt: null, finalText: consultation?.transcript ?? '', interimText: '', finalCount: 0, errorCode: null });
function update(id, changes, consultation) {
  setState(current => {
    if (!current.user) return {};
    const prior = current.dictationSessions[id] ?? initial(current.selectedConsultation?.id === id ? current.selectedConsultation : null);
    return { dictationSessions: { ...current.dictationSessions, [id]: { ...prior, ...(typeof changes === 'function' ? changes(prior) : changes) } },
      ...(consultation ? { consultations: updateConsultationSummaries(current.consultations, { id, ...consultation }),
        ...(current.selectedConsultation?.id === id ? { selectedConsultation: { ...current.selectedConsultation, ...consultation } } : {}) } : {}) };
  });
}
export default function useDictation() {
  const captureSessionGuard = useSessionGuard();
  const { selectedConsultation, selectedPatient, dictationSessions, user } = useStore(state => ({ selectedConsultation: state.selectedConsultation, selectedPatient: state.selectedPatient, dictationSessions: state.dictationSessions, user: state.user }));
  const id = selectedConsultation?.id, session = dictationSessions[id] ?? initial(selectedConsultation);
  const mode = session.mode, underlying = mode === states.confirmDelete ? session.previousMode : mode;
  const [now, setNow] = useState(Date.now()), [pending, setPending] = useState(false);
  const busy = useRef(false), runtime = useRef(null), generation = useRef(0);
  const operationVersion = useRef(0);
  const currentSession = () => getState().dictationSessions[id] ?? initial(getState().selectedConsultation);
  async function release(flush = false, previous = runtime.current) {
    if (runtime.current === previous) runtime.current = null;
    if (!previous) return;
    await previous.capture?.stop({ flush }); previous.transport?.close();
  }
  function disconnect(code) {
    if (runtime.current?.id !== id || runtime.current?.finishing || !runtime.current.current()) return;
    update(id, prior => ({ mode: code === 'mic_off' ? states.micOff : code === 'connection_error' ? states.reconnecting : states.paused,
      elapsed: elapsedAt(prior), startedAt: null, errorCode: ['connection_error', 'mic_off'].includes(code) ? null : code }));
    release(); if (code === 'session_expired') expireSession();
  }
  useEffect(() => {
    const stopListening = onSessionInvalidated(() => {
      ++generation.current; ++operationVersion.current;
      const active = runtime.current; runtime.current = null;
      active?.transport?.close(); active?.capture?.stop();
    });
    busy.current = false; setPending(false);
    return () => {
      stopListening(); ++operationVersion.current;
      ++generation.current;
      const active = runtime.current; if (!active) return;
      runtime.current = null; active.capture?.stop(); active.transport?.close();
      const previous = getState().dictationSessions[active.id];
      if (previous && getState().user === active.owner) {
        update(active.id, { mode: states.paused, elapsed: elapsedAt(previous), startedAt: null }, { status: 'paused' });
        if (useMock) pauseConsultation(active.id).catch(() => {});
      }
    };
  }, [id, user]);
  useEffect(() => {
    if (underlying !== states.listening) return;
    const interval = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(interval);
  }, [id, underlying]);
  const seconds = Math.floor(elapsedAt(session, Math.max(now, session.startedAt ?? now)) / 1000);
  const timer = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const deleteDisabled = !id || ['processing', 'signed'].includes(selectedConsultation.status);
  async function run(operation) {
    if (!id || busy.current) return;
    const ownerCurrent = captureSessionGuard();
    const version = ++operationVersion.current;
    const current = () => ownerCurrent() && version === operationVersion.current && getState().selectedConsultation?.id === id;
    busy.current = true; setPending(true); update(id, { errorCode: null });
    try { await operation(current); }
    catch (error) {
      if (!current()) return;
      if (error.code === 'mic_off') update(id, { mode: states.micOff, startedAt: null });
      else if (error.code === 'connection_error') update(id, prior => ({ mode: states.reconnecting, elapsed: elapsedAt(prior), startedAt: null }));
      else update(id, { errorCode: error.code ?? 'server_error' });
      if (['locked', 'invalid_state', 'already_processing'].includes(error.code)) await handleConsultationError(id, error);
    } finally { if (current()) { busy.current = false; setPending(false); } }
  }
  async function begin(reset) {
    const version = ++generation.current;
    const ownerCurrent = captureSessionGuard();
    const current = () => ownerCurrent() && version === generation.current && getState().selectedConsultation?.id === id;
    const prior = currentSession();
    update(id, { mode: states.connecting, errorCode: null, hasStarted: true });
    let capture;
    try {
      // Calling capture before an await preserves Safari's button activation.
      const capturePromise = useMock ? Promise.resolve(null) : createMicCapture({ onFrame: frame => current() && runtime.current?.id === id && runtime.current.transport?.sendAudio(frame), onUnavailable: () => { if (current()) disconnect('mic_off'); } });
      capturePromise.catch(() => {});
      await release(); capture = await capturePromise;
      if (!current()) { await capture?.stop(); return; }
      if (reset) update(id, { elapsed: 0 });
      if (useMock) await previewDictation(id, 'start');
      if (!current()) { await capture?.stop(); return; }
      runtime.current = { id, capture, current, owner: getState().user, transport: null };
      const transport = openDictationSocket(id, { offset: reset ? 0 : prior.finalCount,
        onEvent(event) {
          if (!current() || runtime.current?.id !== id) return;
          if (event.type === 'status') { update(id, { mode: states.listening, startedAt: Date.now() }, { status: 'dictating' }); capture?.start(); }
          else if (event.type === 'transcript') update(id, snapshot => event.final ? {
            finalText: [snapshot.finalText, event.text.trim()].filter(Boolean).join(' '), interimText: '', finalCount: snapshot.finalCount + 1,
          } : { interimText: event.text });
        }, onError: code => { if (current()) disconnect(code); }, onClose: () => { if (current()) disconnect('connection_error'); } });
      if (runtime.current?.id === id) runtime.current.transport = transport;
      else transport.close();
      await transport.ready;
    } catch (error) {
      await capture?.stop();
      if (!current()) return;
      await release();
      update(id, { mode: reset ? states.ready : states.paused, startedAt: null });
      throw error;
    }
  }
  const start = () => run(() => begin(true)), resume = () => run(() => begin(false)), retry = () => run(() => begin(false));
  const allowMicrophone = () => run(async current => { if (!useMock) await requestMicrophoneAccess(); if (current()) update(id, { mode: states.ready, errorCode: null }); });
  const pause = () => run(async current => {
    const active = runtime.current;
    await active?.capture?.stop({ flush: true });
    if (!current()) return;
    update(id, snapshot => ({ mode: states.paused, elapsed: elapsedAt(snapshot), startedAt: null }), { status: 'paused' });
    try {
      const consultation = await pauseConsultation(id);
      if (!current()) return;
      await release(false, active);
      if (!current()) return;
      update(id, { mode: states.paused, startedAt: null }, consultation);
    } catch (error) {
      if (!current()) return;
      await release(false, active);
      if (!current()) return;
      update(id, snapshot => ({ mode: states.paused, elapsed: elapsedAt(snapshot), startedAt: null }));
      throw error;
    }
  });
  const stop = () => run(async current => {
    const active = runtime.current;
    const previousStatus = selectedConsultation.status;
    const previousStage = selectedConsultation.processing_stage;
    if (runtime.current) runtime.current.finishing = true;
    changeNote(id, { activeTab: 'note', lastStage: 'finalizing_transcript', errorCode: null });
    update(id, snapshot => ({ mode: states.finishing, elapsed: elapsedAt(snapshot), startedAt: null, interimText: '', errorCode: null }),
      { status: 'processing', processing_stage: 'finalizing_transcript', processing_pending: true });
    try {
      await active?.capture?.stop({ flush: true });
      if (!current()) return;
      // Finish owns server stream finalization. Keep the socket open until it acknowledges.
      const result = await finishDictation({ consultation_id: id });
      if (!current()) return;
      changeNote(id, { activeTab: 'note', lastStage: result.processing_stage ?? 'finalizing_transcript', errorCode: null });
      update(id, { mode: states.paused, startedAt: null, interimText: '', errorCode: null }, { ...result, processing_pending: false });
    } catch (error) {
      if (current()) update(id, { mode: states.paused, startedAt: null }, { status: previousStatus, processing_stage: previousStage, processing_pending: false });
      throw error;
    } finally {
      if (current()) ++generation.current;
      await release(false, active);
      if (current()) update(id, snapshot => ({ mode: states.paused, elapsed: elapsedAt(snapshot), startedAt: null }));
    }
  });
  function deleteAll() { if (!deleteDisabled && !busy.current) update(id, prior => ({ mode: states.confirmDelete, previousMode: prior.mode, errorCode: null })); }
  const keep = () => { if (!busy.current) update(id, prior => ({ mode: prior.previousMode })); };
  const remove = () => run(async current => {
    const active = runtime.current;
    await deleteConsultation(id);
    if (!current()) return;
    ++generation.current; await release(false, active);
    if (!current()) return;
    setState(current => { const next = { ...current.dictationSessions }; delete next[id];
      const notes = { ...current.noteSessions }; delete notes[id];
      return { dictationSessions: next, noteSessions: notes, consultations: current.consultations.filter(item => item.id !== id),
        ...(current.selectedConsultation?.id === id ? { selectedConsultation: null, selectedPatient: null } : {}) }; });
  });
  useEffect(() => {
    function spaceControl(event) {
      if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (getState().patientPopupOpen || event.target?.closest('input, textarea, select, [contenteditable="true"], button, a, [role="dialog"]')) return;
      if (![states.listening, states.paused].includes(underlying) || ['processing', 'signed', 'saved', 'failed'].includes(selectedConsultation?.status)) return;
      event.preventDefault();
      if (underlying === states.listening) pause(); else resume();
    }
    window.addEventListener('keydown', spaceControl);
    return () => window.removeEventListener('keydown', spaceControl);
  });
  return { mode, underlying, timer, pending, errorCode: session.errorCode, session, deleteDisabled,
    startDisabled: Boolean(selectedConsultation && (!selectedPatient || !['ready', 'paused'].includes(selectedConsultation.status))),
    pauseDisabled: underlying !== states.listening, resumeDisabled: underlying !== states.paused || !['paused', 'dictating'].includes(selectedConsultation?.status),
    stopDisabled: ![states.listening, states.paused, states.reconnecting].includes(underlying),
    status: ['signed', 'processing', 'saved', 'failed'].includes(selectedConsultation?.status) ? selectedConsultation.status : underlying === states.listening ? 'dictating' : underlying,
    start, pause, resume, stop, retry, allowMicrophone, deleteAll, keep, remove };
}
