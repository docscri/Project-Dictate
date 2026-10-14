import { useEffect, useState } from 'react';
import { getProfile, updateProfile, logout } from '../../shared/api/endpoints.js';
import { clearTokens } from '../../shared/auth/session.js';
import { getState, setState } from '../../shared/state/store.js';
import { navigate } from '../../shared/navigation.js';
import { defaultDepartment } from '../../shared/account.js';
import { loadProfile } from '../../shared/state/profile.js';
import useSessionGuard from '../../shared/auth/useSessionGuard.js';

export default function useProfile() {
  const capture = useSessionGuard();
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [specialty, setSpecialty] = useState(defaultDepartment);
  const [pending, setPending] = useState(true);
  const [errorCode, setErrorCode] = useState(null);
  const [invalidFields, setInvalidFields] = useState([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    const current = capture();
    loadProfile().then((result) => {
      if (!active || !current()) return;
      setProfile(result); setName(result.name ?? ''); setEmail(result.email ?? getState().user?.email ?? ''); setSpecialty(result.specialty ?? defaultDepartment);
    }).catch((error) => { if (active && current()) setErrorCode(error.code ?? 'server_error'); })
      .finally(() => { if (active && current()) setPending(false); });
    return () => { active = false; };
  }, []);
  async function save() {
    if (pending) return;
    setErrorCode(null);
    setInvalidFields([]);
    setSaved(false);
    const normalizedEmail = email.trim().toLowerCase();
    const fields = [];
    if (!name.trim()) fields.push('name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) fields.push('email');
    if (fields.length) { setErrorCode('validation_error'); setInvalidFields(fields); return; }
    setPending(true);
    const current = capture();
    try {
      const result = await updateProfile({ name: name.trim(), email: normalizedEmail, specialty });
      const updated = Array.isArray(result) ? result[0] : result;
      const refreshed = updated ?? await getProfile();
      if (current()) {
        setProfile(refreshed);
        setEmail(refreshed.email ?? normalizedEmail);
        setState((state) => ({ doctorProfile: refreshed, user: state.user ? { ...state.user, email: refreshed.email ?? normalizedEmail } : state.user }));
        setSaved(true);
      }
    } catch (error) { if (current()) { setErrorCode(error.code ?? 'server_error'); if (error.code === 'validation_error') setInvalidFields(error.fields?.length ? error.fields : ['name', 'email', 'specialty']); } }
    finally { if (current()) setPending(false); }
  }
  function signOut() {
    if (pending) return;
    // Dispatch remote revocation while the current token still exists, then end the local session immediately.
    const remoteLogout = logout();
    clearTokens(); setState({ user: null, sessionNotice: null });
    navigate('/login', { replace: true });
    remoteLogout.catch(() => { /* Local sign-out already completed. */ });
  }
  function changeName(value) { setSaved(false); setName(value); }
  function changeEmail(value) { setSaved(false); setEmail(value); }
  function changeSpecialty(value) { setSaved(false); setSpecialty(value); }
  return { profile, name, setName: changeName, email, setEmail: changeEmail, specialty, setSpecialty: changeSpecialty, pending, errorCode, invalidFields, saved, save, signOut };
}
