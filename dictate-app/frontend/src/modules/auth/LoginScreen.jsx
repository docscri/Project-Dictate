import { useState } from 'react';
import Button from '../../components/Button.jsx';
import Input from '../../components/Input.jsx';
import Banner from '../../components/Banner.jsx';
import BackgroundWave from '../../components/BackgroundWave.jsx';
import { MicrophoneIcon, EyeIcon } from '../../components/AccountIcons.jsx';
import { messageFor } from '../../shared/errors.js';
import { useStore, setState } from '../../shared/state/store.js';
import { navigate } from '../../shared/navigation.js';
import useAuth from './useAuth.js';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { sessionNotice } = useStore();
  const { pending, errorCode, invalidFields, submitLogin } = useAuth();
  const notice = errorCode ?? sessionNotice;
  return (
    <main className={`login-screen${pending ? ' login-screen--signing-in' : ''}`}>
      <div className="account-brand">Dictate</div>
      <BackgroundWave />
      <section className={`login-card paper-surface${notice ? ' login-card--notice' : ''}`}>
        <div className={`login-mic${sessionNotice && !errorCode ? ' login-mic--notice' : ''}`}><MicrophoneIcon /></div>
        <h1 className="login-heading">Good morning,<br />doctor</h1>
        {notice && <Banner className="account-banner" tone={errorCode ? 'danger' : 'warn'}>{messageFor(notice)}</Banner>}
        <form noValidate onSubmit={async (event) => {
          event.preventDefault();
          setState({ sessionNotice: null });
          await submitLogin({ email, password });
        }}>
          <div className="account-fields">
            <Input label="Email" type="email" autoComplete="email" placeholder="doctor@hospital.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} invalid={errorCode === 'validation_error' && invalidFields.includes('email')} />
            <Input label="Password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} invalid={errorCode === 'validation_error' && invalidFields.includes('password')}
              action={<button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={pending} onClick={() => setShowPassword(!showPassword)}><EyeIcon hidden={showPassword} /></button>} />
          </div>
          <Button className="account-submit" variant="primary" size="lg" type="submit" disabled={pending}>Sign in</Button>
        </form>
        <p className="login-footer">New doctor? <a className="account-link" href="/signup" onClick={(event) => { event.preventDefault(); setState({ sessionNotice: null }); navigate('/signup'); }}>Create your account</a></p>
      </section>
    </main>
  );
}

