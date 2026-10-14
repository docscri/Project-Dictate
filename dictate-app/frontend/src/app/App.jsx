import { useEffect } from 'react';
import LoginScreen from '../modules/auth/LoginScreen.jsx';
import CreateAccountScreen from '../modules/auth/CreateAccountScreen.jsx';
import ProfileScreen from '../modules/profile/ProfileScreen.jsx';
import DictationScreen from '../modules/dictation/DictationScreen.jsx';
import ConsultationList from '../modules/consultations/ConsultationList.jsx';
import PatientPopup from '../modules/patients/PatientPopup.jsx';
import useNoteStatus from '../modules/note/useNoteStatus.js';
import useAutosave from '../modules/note/useAutosave.js';
import NoteCanvas from '../modules/note/NoteCanvas.jsx';
import SignPanel from '../modules/note/SignPanel.jsx';
import { getMe } from '../shared/api/endpoints.js';
import { getAccessToken, getRefreshToken, captureSession, listenForSessionChanges } from '../shared/auth/session.js';
import { useState } from 'react';
import Banner from '../components/Banner.jsx';
import Button from '../components/Button.jsx';
import { messageFor } from '../shared/errors.js';
import { useStore, setState } from '../shared/state/store.js';
import { navigate } from '../shared/navigation.js';
import useUnsavedChanges from '../shared/state/useUnsavedChanges.js';

let startup;
function DictationPage() {
  const controller = useNoteStatus();
  const flush = useAutosave(controller);
  const doctorProfile = useStore(state => state.doctorProfile);
  const newConsultation = () => setState({ patientPopupOpen: true });
  const notePanel = controller.record && <SignPanel controller={controller} profile={doctorProfile} onSign={() => controller.sign(flush)} onRetrySave={() => controller.retrySave(flush)} onNew={newConsultation} />;
  return <DictationScreen consultationList={<ConsultationList />} patientPopup={<PatientPopup />} noteController={controller}
    noteCanvas={controller.record && <NoteCanvas controller={controller} />} notePanel={notePanel} />;
}
function checkSession() {
  if (!getAccessToken() && !getRefreshToken()) return Promise.resolve(null);
  return getMe();
}

export default function App() {
  useUnsavedChanges();
  const { path, user, sessionReady } = useStore(state => ({ path: state.path, user: state.user, sessionReady: state.sessionReady }));
  const [startupError, setStartupError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    function verify() {
      const version = ++sequence;
      const current = captureSession();
      const requestedPath = window.location.pathname;
      const hadToken = Boolean(getAccessToken() || getRefreshToken());
      setStartupError(null);
      startup = startup?.current() ? startup : { current, promise: checkSession() };
      startup.promise.then(currentUser => {
        if (!active || version !== sequence || !current()) return;
        setState({ user: currentUser, sessionReady: true });
        const destination = currentUser ? (requestedPath === '/profile' ? '/profile' : '/dictation')
          : !hadToken && requestedPath === '/signup' ? '/signup' : '/login';
        navigate(destination, { replace: true });
      }).catch(error => {
        if (!active || version !== sequence || !current()) return;
        setStartupError(error.code ?? 'server_error');
      });
    }
    verify();
    const stopListening = listenForSessionChanges(hasTokens => {
      startup = null;
      setState({ sessionReady: !hasTokens });
      if (hasTokens) verify();
      else { ++sequence; setStartupError(null); navigate('/login', { replace: true }); }
    });
    const onPopState = () => {
      const requested = window.location.pathname;
      if (!getAccessToken() && ['/profile', '/dictation'].includes(requested)) navigate('/login', { replace: true });
      else setState({ path: requested });
    };
    window.addEventListener('popstate', onPopState);
    return () => { active = false; stopListening(); window.removeEventListener('popstate', onPopState); };
  }, [attempt]);
  if (startupError && !user) return <main className="app-start paper-surface">
    <Banner tone="danger">{messageFor(startupError)}</Banner>
    <Button onClick={() => { startup = null; setAttempt(value => value + 1); }}>Try again</Button>
  </main>;
  if (!sessionReady) return <main className="app-start" aria-busy="true"><span className="app-start__brand">Dictate</span><span className="sr-only">Loading</span></main>;
  if (path === '/signup') return <CreateAccountScreen />;
  if (path === '/profile' && user) return <ProfileScreen />;
  if (path === '/dictation' && user) return <DictationPage />;
  return <LoginScreen />;
}
