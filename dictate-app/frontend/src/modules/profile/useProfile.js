import { useEffect, useState } from 'react';
import { getProfile, updateProfile, logout } from '../../shared/api/endpoints.js';
import { clearTokens } from '../../shared/auth/session.js';
import { setState } from '../../shared/state/store.js';
import { navigate } from '../../shared/navigation.js';
import { defaultDepartment } from '../../shared/account.js';
import { loadProfile } from '../../shared/state/profile.js';
import useSessionGuard from '../../shared/auth/useSessionGuard.js';

export default function useProfile() {
  const capture = useSessionGuard();
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState(defaultDepartment);
  const [pending, setPending] = useState(true);
  const [errorCode, setErrorCode] = useState(null);
  const [invalidFields, setInvalidFields] = useState([]);
  useEffect(() => {
    let active = true;
    const current = capture();
    loadProfile().then((result) => {
      if (!active || !current()) return;
      setProfile(result); setName(result.name ?? ''); setSpecialty(result.specialty ?? defaultDepartment);
    }).catch((error) => { if (active && current()) setErrorCode(error.code ?? 'server_error'); })
      .finally(() => { if (active && current()) setPending(false); });
    return () => { active = false; };
  }, []);
  async function save() {
    if (pending) return;
    setErrorCode(null);
    setInvalidFields([]);
    if (!name.trim()) { setErrorCode('validation_error'); setInvalidFields(['name']); return; }
    setPending(true);
    const current = capture();
    try {
      const result = await updateProfile({ name: name.trim(), specialty });
      const updated = Array.isArray(result) ? result[0] : result;
      const refreshed = updated ?? await getProfile();
      if (current()) { setProfile(refreshed); setState({ doctorProfile: refreshed }); }
    } catch (error) { if (current()) { setErrorCode(error.code ?? 'server_error'); if (error.code === 'validation_error') setInvalidFields(error.fields?.length ? error.fields : ['name', 'specialty']); } }
    finally { if (current()) setPending(false); }
  }
  async function signOut() {
    const current = capture();
    setPending(true);
    try { await logout(); }
    catch { /* Local sign-out must succeed even if the server is unavailable. */ }
    finally {
      if (!current()) return;
      clearTokens(); setState({ user: null, sessionNotice: null });
      navigate('/login', { replace: true });
    }
  }
  return { profile, name, setName, specialty, setSpecialty, pending, errorCode, invalidFields, save, signOut };
}
