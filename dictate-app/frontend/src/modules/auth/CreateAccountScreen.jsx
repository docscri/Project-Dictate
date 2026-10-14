import { useState } from 'react';
import Input from '../../components/Input.jsx';
import Banner from '../../components/Banner.jsx';
import DepartmentSelect from '../../components/DepartmentSelect.jsx';
import SoapSections from '../../components/SoapSections.jsx';
import { ArrowLeftIcon, ArrowRightIcon } from '../../components/AccountIcons.jsx';
import { messageFor } from '../../shared/errors.js';
import { navigate } from '../../shared/navigation.js';
import useAuth from './useAuth.js';

export default function CreateAccountScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [specialty, setSpecialty] = useState('');
  const { pending, errorCode, invalidFields, submitSignup } = useAuth();
  const isInvalid = (field) => errorCode === 'validation_error' && invalidFields.includes(field);

  return (
    <main className="signup-screen">
      <section className="signup-form-panel paper-surface">
        <a className="signup-back" href="/login" aria-label="Back to login" onClick={(event) => { event.preventDefault(); navigate('/login'); }}><ArrowLeftIcon /></a>
        <div className="signup-form-content">
          <h1 className="account-compact-heading">Begin with voice</h1>
          {errorCode && <Banner className="account-banner" tone="danger">{messageFor(errorCode)}</Banner>}
          <form className="account-compact-form" noValidate onSubmit={(event) => { event.preventDefault(); submitSignup({ name, email, password, specialty }); }}>
            <Input label="Full name" autoComplete="name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} disabled={pending} invalid={isInvalid('name')} showInvalidIcon />
            <Input label="Email" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} invalid={isInvalid('email')} showInvalidIcon />
            <Input label="Password" type="password" autoComplete="new-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} invalid={isInvalid('password')} showInvalidIcon />
            <DepartmentSelect value={specialty} onChange={setSpecialty} disabled={pending} invalid={isInvalid('specialty')} placeholder="Department" />
            <button className="account-action-circle signup-submit" type="submit" aria-label="Create account" disabled={pending}><ArrowRightIcon /></button>
          </form>
        </div>
      </section>
      <aside className="signup-preview-panel">
        <div className="signup-preview-content"><div className="soap-preview paper-surface"><h2 className="soap-preview-heading">{specialty || 'Department'}</h2><SoapSections preview /></div></div>
      </aside>
    </main>
  );
}
