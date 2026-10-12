import { useState } from 'react';
import Button from '../../components/Button.jsx';
import Input from '../../components/Input.jsx';
import Banner from '../../components/Banner.jsx';
import DepartmentChips from '../../components/DepartmentChips.jsx';
import SoapSections from '../../components/SoapSections.jsx';
import { defaultDepartment } from '../../shared/account.js';
import { messageFor } from '../../shared/errors.js';
import { navigate } from '../../shared/navigation.js';
import useAuth from './useAuth.js';

export default function CreateAccountScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [specialty, setSpecialty] = useState(defaultDepartment);
  const { pending, errorCode, invalidFields, submitSignup } = useAuth();
  return (
    <main className="signup-screen">
      <section className="signup-form-panel paper-surface">
        <div className="signup-form-content">
          <p className="account-eyebrow">Create account</p>
          <h1 className="account-heading">Set up your dictation</h1>
          {errorCode && <Banner className="account-banner" tone="danger">{messageFor(errorCode)}</Banner>}
          <form noValidate onSubmit={(event) => { event.preventDefault(); submitSignup({ name, email, password, specialty }); }}>
            <div className="signup-fields-row">
              <Input label="Full name" autoComplete="name" placeholder="Dr. Priya Sharma" value={name} onChange={(event) => setName(event.target.value)} disabled={pending} invalid={errorCode === 'validation_error' && invalidFields.includes('name')} />
              <Input label="Email" type="email" autoComplete="email" placeholder="you@hospital.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} invalid={errorCode === 'validation_error' && invalidFields.includes('email')} />
            </div>
            <div className="account-form-section"><Input label="Password" type="password" autoComplete="new-password" placeholder="Create a password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} invalid={errorCode === 'validation_error' && invalidFields.includes('password')} /></div>
            <div className="account-form-section"><p className="account-label">Department</p><DepartmentChips value={specialty} onChange={setSpecialty} disabled={pending} invalid={errorCode === 'validation_error' && invalidFields.includes('specialty')} /></div>
            <Button className="account-submit signup-submit" type="submit" size="lg" disabled={pending}>Create account</Button>
          </form>
          <a className="account-link signup-back" href="/login" onClick={(event) => { event.preventDefault(); navigate('/login'); }}>Back to Login</a>
        </div>
      </section>
      <aside className="signup-preview-panel">
        <div className="signup-preview-content">
          <p className="account-eyebrow">Your note format</p>
          <div className="soap-preview paper-surface"><h2 className="soap-preview-heading">{specialty} <span>· SOAP note</span></h2><SoapSections preview /></div>
          <p className="soap-preview-caption">Every dictation is sorted into these sections automatically.</p>
        </div>
      </aside>
    </main>
  );
}

