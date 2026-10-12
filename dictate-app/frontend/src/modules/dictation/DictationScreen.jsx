import { cloneElement, useEffect, useState } from 'react';
import Button from '../../components/Button.jsx';
import Tabs from '../../components/Tabs.jsx';
import Banner from '../../components/Banner.jsx';
import DictationControls from './DictationControls.jsx';
import LiveTranscript from './LiveTranscript.jsx';
import useDictation from './useDictation.js';
import useCompactPanels from './useCompactPanels.js';
import { PlusIcon } from '../../components/ConsultationIcons.jsx';
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
  const control = useDictation();
  const noteAvailable = noteController?.note.manual || ['processing', 'saved', 'failed', 'signed'].includes(selectedConsultation?.status);
  const showNote = noteAvailable && noteController?.note.activeTab === 'note';
  const panels = useCompactPanels(selectedConsultation?.id);
  const newConsultation = () => { panels.closeDrawer(); panels.setControlsOpen(false); setState({ patientPopupOpen: true }); };
  useEffect(() => {
    let active = true;
    const current = capture();
    loadProfile().catch((failure) => { if (active && current()) setError(failure.code ?? 'server_error'); });
    return () => { active = false; };
  }, [user?.email]);
  return <main className="dictation-layout">
    <header className="dictation-compact-header" inert={panels.drawerOpen}>
      <button ref={panels.drawerTrigger} type="button" className="dictation-drawer-trigger" aria-label="Open consultations" aria-expanded={panels.drawerOpen} aria-controls="consultation-sidebar" onClick={panels.openDrawer}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
      <span className="dictation-wordmark">Dictate</span>
      <button type="button" className="dictation-compact-profile" aria-label="Profile" onClick={() => navigate('/profile')}><span className="dictation-profile__avatar">{initials(doctorProfile?.name ?? user?.name)}</span></button>
    </header>
    {panels.compact && panels.drawerOpen && <button type="button" tabIndex={-1} aria-label="Close consultations" className="dictation-drawer-backdrop" onClick={panels.closeDrawer} />}
    <aside id="consultation-sidebar" ref={panels.drawer} className={`dictation-sidebar${panels.drawerOpen ? ' dictation-sidebar--open' : ''}`} role={panels.compact && panels.drawerOpen ? 'dialog' : undefined} aria-modal={panels.compact && panels.drawerOpen ? true : undefined} aria-label={panels.compact ? 'Consultations' : undefined} inert={panels.compact && !panels.drawerOpen}>
      <button type="button" className="dictation-drawer-close" aria-label="Close consultations" onClick={panels.closeDrawer}>×</button>
      <div className="dictation-wordmark">Dictate</div>
      <Button variant="accent" className="new-consultation" onClick={newConsultation}><PlusIcon />New consultation</Button>
      <h1 className="consultation-kicker dictation-sidebar__heading">CONSULTATIONS</h1>
      <div className="dictation-list-slot">{cloneElement(consultationList, { onSelected: panels.closeDrawer })}</div>
      <button type="button" className="dictation-profile" aria-label="Profile" onClick={() => navigate('/profile')}>
        <span className="dictation-profile__avatar">{initials(doctorProfile?.name ?? user?.name)}</span>
        <span className="dictation-profile__identity"><span>{doctorProfile?.name ?? user?.name}</span><span>{doctorProfile?.specialty}</span></span>
      </button>
    </aside>
    <section className="dictation-paper paper-surface" inert={panels.drawerOpen}>
      <header className="dictation-paper__header">
        <div className="dictation-patient"><h2>{patientTitle(selectedPatient)}</h2><p>{patientMeta(selectedPatient)}</p></div>
        <Tabs id="dictation-view" label="Consultation view" className="dictation-tabs" items={[{ value: 'live', label: 'Live transcript' }, { value: 'note', label: 'Clinical note', disabled: !noteAvailable }]} active={showNote ? 'note' : 'live'} onChange={noteController?.changeTab} />
      </header>
      {error && <Banner tone="danger">{messageFor(error)}</Banner>}
      <div className="dictation-view-panel" role="tabpanel" id="dictation-view-live-panel" aria-labelledby="dictation-view-live-tab" tabIndex={0} hidden={showNote}>{!showNote && <LiveTranscript control={control} />}</div>
      <div className="dictation-view-panel" role="tabpanel" id="dictation-view-note-panel" aria-labelledby="dictation-view-note-tab" tabIndex={0} hidden={!showNote}>{showNote && noteCanvas}</div>
    </section>
    <section className={`dictation-dock${noteAvailable ? ' dictation-dock--note' : ''}${panels.controlsOpen ? ' dictation-dock--open' : ''}${['listening', 'paused', 'reconnecting'].includes(control.underlying) ? ' dictation-dock--active' : ''}${control.mode === 'confirmDelete' ? ' dictation-dock--confirm' : ''}`} inert={panels.drawerOpen} aria-label="Dictation controls">
      <button type="button" className="dictation-dock-handle" aria-label={panels.controlsOpen ? 'Collapse dictation controls' : 'Expand dictation controls'} aria-expanded={panels.controlsOpen} aria-controls="dictation-dock-content" onClick={panels.toggleControls} onPointerDown={panels.onPointerDown} onPointerUp={panels.onPointerUp} onPointerCancel={panels.onPointerCancel}><span /></button>
      <div id="dictation-dock-content" className="dictation-dock-content">{noteAvailable ? notePanel : <DictationControls control={control} />}
        <Button variant="outline" className="dictation-dock-new" onClick={newConsultation}><PlusIcon />New consultation</Button>
      </div>
    </section>
    {patientPopup}
  </main>;
}
