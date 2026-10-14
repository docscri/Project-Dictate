import { cloneElement, useEffect, useRef, useState } from 'react';
import Tabs from '../../components/Tabs.jsx';
import Banner from '../../components/Banner.jsx';
import DictationControls from './DictationControls.jsx';
import LiveTranscript from './LiveTranscript.jsx';
import useDictation from './useDictation.js';
import useCompactPanels from './useCompactPanels.js';
import { CloseIcon, QuoteIcon, MenuIcon } from '../../components/ConsultationIcons.jsx';
import { MicrophoneIcon } from '../../components/AccountIcons.jsx';
import { loadProfile } from '../../shared/state/profile.js';
import { useStore, setState } from '../../shared/state/store.js';
import { navigate } from '../../shared/navigation.js';
import { initials, patientTitle, patientMeta } from '../../shared/patient.js';
import { messageFor } from '../../shared/errors.js';
import useSessionGuard from '../../shared/auth/useSessionGuard.js';

export default function DictationScreen({ consultationList, patientPopup, noteController, noteCanvas, notePanel }) {
  const capture = useSessionGuard();
  const { selectedConsultation, selectedPatient, doctorProfile, user } = useStore(state => ({ selectedConsultation: state.selectedConsultation, selectedPatient: state.selectedPatient, doctorProfile: state.doctorProfile, user: state.user }));
  const [error, setError] = useState(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sourcesDrawer = useRef(null);
  const sourcesTrigger = useRef(null);
  const control = useDictation();
  const noteAvailable = noteController?.note.manual || ['processing', 'saved', 'failed', 'signed'].includes(selectedConsultation?.status);
  const showNote = noteAvailable && noteController?.note.activeTab === 'note';
  const canStartAnother = Boolean(selectedConsultation && (control.session.hasStarted
    || ['dictating', 'paused', 'processing', 'saved', 'failed', 'signed'].includes(selectedConsultation.status)));
  const panels = useCompactPanels(selectedConsultation?.id);
  const newConsultation = () => { panels.closeDrawer(); setSourcesOpen(false); setState({ patientPopupOpen: true }); };
  const startAnother = () => {
    if (['listening', 'reconnecting'].includes(control.underlying)) control.pause();
    newConsultation();
  };

  useEffect(() => {
    let active = true;
    const current = capture();
    loadProfile().catch((failure) => { if (active && current()) setError(failure.code ?? 'server_error'); });
    return () => { active = false; };
  }, [user?.email]);
  useEffect(() => {
    if (['listening', 'paused', 'reconnecting'].includes(control.underlying)) {
      panels.closeDrawer();
      setSourcesOpen(false);
    }
  }, [control.underlying, panels.closeDrawer]);
  useEffect(() => {
    if (!sourcesOpen) return undefined;
    const previous = document.activeElement;
    sourcesDrawer.current?.querySelector('button')?.focus();
    function keydown(event) {
      if (event.key === 'Escape') { setSourcesOpen(false); return; }
      if (event.key !== 'Tab') return;
      const items = [...sourcesDrawer.current.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')].filter(item => item.getClientRects().length);
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    }
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, [sourcesOpen]);

  const anyDrawerOpen = panels.drawerOpen || sourcesOpen;
  return <main className="dictation-layout">
    <header className="dictation-topbar" inert={anyDrawerOpen}>
      <button ref={panels.drawerTrigger} type="button" className="dictation-topbar__round" aria-label="Open consultations" aria-expanded={panels.drawerOpen} aria-controls="consultation-sidebar" onClick={() => { setSourcesOpen(false); panels.openDrawer(); }}><MenuIcon /></button>
      <Tabs id="dictation-view" label="Consultation view" className="dictation-tabs" items={[{ value: 'live', label: 'Live transcript', shortLabel: 'Live' }, { value: 'note', label: 'Clinical note', shortLabel: 'Note', disabled: !noteAvailable }]} active={showNote ? 'note' : 'live'} onChange={noteController?.changeTab} />
      <button ref={sourcesTrigger} type="button" className="dictation-topbar__round" aria-label="Sources" aria-expanded={sourcesOpen} aria-controls="dictation-sources" onClick={() => { panels.closeDrawer(); setSourcesOpen(true); }}><QuoteIcon /></button>
    </header>
    {anyDrawerOpen && <button type="button" tabIndex={-1} aria-label="Close drawer" className="dictation-drawer-backdrop" onClick={() => { panels.closeDrawer(); setSourcesOpen(false); }} />}
    <aside id="consultation-sidebar" ref={panels.drawer} className={`dictation-sidebar${panels.drawerOpen ? ' dictation-sidebar--open' : ''}`} role="dialog" aria-modal={panels.drawerOpen || undefined} aria-label="Consultations" inert={!panels.drawerOpen}>
      <div className="dictation-sidebar__top"><div className="dictation-wordmark">Dictate</div><div className="dictation-sidebar__tools">
        <button type="button" className="dictation-icon-button" aria-label="Close consultations" onClick={panels.closeDrawer}><CloseIcon /></button>
      </div></div>
      <h1 className="consultation-kicker dictation-sidebar__heading">CONSULTATIONS</h1>
      <div className="dictation-list-slot">{cloneElement(consultationList, { onSelected: panels.closeDrawer })}</div>
      <button type="button" className="dictation-profile" aria-label="Profile" onClick={() => navigate('/profile')}>
        <span className={`dictation-profile__avatar${!doctorProfile ? ' is-loading' : ''}`}>{doctorProfile ? initials(doctorProfile.name ?? user?.name) : ''}</span>
        <span className="dictation-profile__identity">{doctorProfile ? <><span>{doctorProfile.name ?? user?.name}</span><span>{doctorProfile.specialty}</span></> : <span className="dictation-profile-skeleton"><i /><i /></span>}</span>
      </button>
    </aside>
    <aside id="dictation-sources" ref={sourcesDrawer} className={`dictation-sources${sourcesOpen ? ' dictation-sources--open' : ''}`} role="dialog" aria-modal={sourcesOpen || undefined} aria-label="Sources" inert={!sourcesOpen}>
      <div className="dictation-sources__top"><h2>Sources</h2><button type="button" className="dictation-icon-button" aria-label="Close sources" onClick={() => setSourcesOpen(false)}><CloseIcon /></button></div>
      <p>No citations are attached to this consultation.</p>
    </aside>
    <section className="dictation-paper paper-surface" inert={anyDrawerOpen}>
      <div className="dictation-column">
        <header className="dictation-patient"><h2>{patientTitle(selectedPatient)}</h2><p>{patientMeta(selectedPatient)}</p></header>
        {error && <Banner tone="danger">{messageFor(error)}</Banner>}
        <div className="dictation-view-panel" role="tabpanel" id="dictation-view-live-panel" aria-labelledby="dictation-view-live-tab" tabIndex={0} hidden={showNote}>{!showNote && <LiveTranscript control={control} />}</div>
        <div className="dictation-view-panel" role="tabpanel" id="dictation-view-note-panel" aria-labelledby="dictation-view-note-tab" tabIndex={0} hidden={!showNote}>{showNote && noteCanvas}</div>
      </div>
    </section>
    {canStartAnother && <button type="button" className="dictation-new-microphone" aria-label="New dictation" title="New dictation" disabled={control.underlying === 'connecting'} inert={anyDrawerOpen} onClick={startAnother}><MicrophoneIcon /></button>}
    <section className={`dictation-dock${noteAvailable ? ' dictation-dock--note' : ''}${selectedConsultation?.status === 'processing' ? ' dictation-dock--processing' : ''}${selectedConsultation?.status === 'failed' && !noteController?.note.manual ? ' dictation-dock--failed' : ''}${control.underlying === 'ready' && !noteAvailable ? ' dictation-dock--ready' : ''}${control.underlying === 'micOff' ? ' dictation-dock--mic-off' : ''}${['connecting', 'listening', 'paused', 'reconnecting'].includes(control.underlying) ? ' dictation-dock--active' : ''}${control.mode === 'confirmDelete' ? ' dictation-dock--confirm' : ''}`} inert={anyDrawerOpen} aria-label="Dictation controls">
      {noteAvailable ? notePanel : <DictationControls control={control} onStart={selectedConsultation ? control.start : newConsultation} startLabel={selectedConsultation ? 'Start dictation' : 'New consultation'} />}
    </section>
    {cloneElement(patientPopup, { onStartDictation: control.start })}
  </main>;
}
