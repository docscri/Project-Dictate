import { useState } from 'react';
import Input from '../../components/Input.jsx';
import Banner from '../../components/Banner.jsx';
import BackgroundWave from '../../components/BackgroundWave.jsx';
import { ArrowRightIcon, MicrophoneIcon } from '../../components/AccountIcons.jsx';
import { messageFor } from '../../shared/errors.js';
import { useStore, setState } from '../../shared/state/store.js';
import { navigate } from '../../shared/navigation.js';
import useAuth from './useAuth.js';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { sessionNotice } = useStore();
  const { pending, errorCode, invalidFields, submitLogin } = useAuth();
  const notice = errorCode ?? sessionNotice;
  const credentialNotice = notice === 'invalid_credentials' || notice === 'session_expired';
  return (
    <main className={`login-screen${pending ? ' login-screen--signing-in' : ''}`}>
      <div className="account-brand login-card-brand">Dictate</div>
      <BackgroundWave />
      <section className={`login-card${notice ? ' login-card--notice' : ''}`} aria-label="Sign in">
        <div className="login-mic"><MicrophoneIcon /></div>
        <form noValidate onSubmit={async (event) => {
          event.preventDefault();
          setState({ sessionNotice: null });
          await submitLogin({ email, password });
        }}>
          <div className="account-fields">
            <Input label="Email" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} invalid={credentialNotice || (errorCode === 'validation_error' && invalidFields.includes('email'))} showInvalidIcon />
            <Input label="Password" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} invalid={credentialNotice || (errorCode === 'validation_error' && invalidFields.includes('password'))}
              showInvalidIcon action={<button className="login-submit" type="submit" aria-label={pending ? 'Signing in' : 'Sign in'} disabled={pending}><ArrowRightIcon /></button>} />
          </div>
        </form>
        {notice && <Banner className="login-notice" tone="danger" role={errorCode ? 'alert' : 'status'}>{messageFor(notice)}</Banner>}
        <p className="login-footer"><a className="account-link" href="/signup" onClick={(event) => { event.preventDefault(); setState({ sessionNotice: null }); navigate('/signup'); }}>Create account</a></p>
      </section>
    </main>
  );
}

