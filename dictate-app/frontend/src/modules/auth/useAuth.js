import { useState } from 'react';
import { login, signup } from '../../shared/api/endpoints.js';
import { setTokens, clearTokens } from '../../shared/auth/session.js';
import { setState } from '../../shared/state/store.js';
import { navigate } from '../../shared/navigation.js';
import useSessionGuard from '../../shared/auth/useSessionGuard.js';

export default function useAuth() {
  const capture = useSessionGuard();
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState(null);
  const [invalidFields, setInvalidFields] = useState([]);
  async function submit(kind, values) {
    if (pending) return false;
    setErrorCode(null);
    setInvalidFields([]);
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email?.trim() ?? '') && values.password && (kind === 'login' || (values.name?.trim() && values.specialty));
    if (!valid) {
      setErrorCode('validation_error');
      setInvalidFields([!values.name?.trim() && kind === 'signup' && 'name', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email?.trim() ?? '') && 'email', !values.password && 'password'].filter(Boolean));
      return false;
    }
    setPending(true);
    const current = capture();
    try {
      const result = await (kind === 'login' ? login : signup)({ ...values, email: values.email.trim() });
      if (!current()) return false;
      if (kind === 'signup' && result.confirmation_required && !result.access_token) {
        clearTokens();
        setState({ user: null, sessionNotice: null });
        navigate('/login');
        return true;
      }
      if (!result.access_token || !result.refresh_token) throw { code: kind === 'signup' ? 'signup_failed' : 'server_error' };
      setTokens(result);
      setState({ user: result.user, sessionNotice: null });
      navigate('/dictation', { replace: true });
      return true;
    } catch (error) {
      if (!current()) return false;
      setErrorCode(error.code ?? (kind === 'signup' ? 'signup_failed' : 'server_error'));
      if (error.code === 'validation_error') setInvalidFields(error.fields?.length ? error.fields : kind === 'login' ? ['email', 'password'] : ['name', 'email', 'password']);
      return false;
    } finally { if (current()) setPending(false); }
  }
  return { pending, errorCode, invalidFields, submitLogin: (values) => submit('login', values), submitSignup: (values) => submit('signup', values) };
}
