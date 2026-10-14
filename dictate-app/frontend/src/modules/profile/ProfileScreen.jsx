import Input from '../../components/Input.jsx';
import Banner from '../../components/Banner.jsx';
import DepartmentSelect from '../../components/DepartmentSelect.jsx';
import SoapSections from '../../components/SoapSections.jsx';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from '../../components/AccountIcons.jsx';
import { messageFor } from '../../shared/errors.js';
import { navigate } from '../../shared/navigation.js';
import useProfile from './useProfile.js';

export default function ProfileScreen() {
  const { profile, name, setName, email, setEmail, specialty, setSpecialty, pending, errorCode, invalidFields, saved, save, signOut } = useProfile();
  const initials = (profile?.name ?? '').replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const isInvalid = (field) => errorCode === 'validation_error' && invalidFields.includes(field);

  return (
    <main className="profile-screen" aria-busy={pending}>
      <section className="profile-panel paper-surface">
        <a className="profile-back" href="/dictation" aria-label="Back to dictation" onClick={(event) => { event.preventDefault(); navigate('/dictation'); }}><ArrowLeftIcon /></a>
        <h1 className="account-visually-hidden">Profile</h1>
        <div className="profile-form-stage">
          {errorCode && <Banner className="account-banner" tone="danger">{messageFor(errorCode)}</Banner>}
          {!profile ? <div className="profile-form-skeleton" aria-label="Loading profile details"><span className="profile-form-skeleton__avatar" /><span /><span /><span /><span className="profile-form-skeleton__action" /></div> : <form className="account-compact-form profile-compact-form" noValidate onSubmit={(event) => { event.preventDefault(); save(); }}>
            <div className="profile-avatar" aria-hidden="true">{initials}</div>
            <Input label="Full name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} disabled={pending} invalid={isInvalid('name')} showInvalidIcon />
            <Input label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} invalid={isInvalid('email')} showInvalidIcon />
            <DepartmentSelect value={specialty} onChange={setSpecialty} disabled={pending} invalid={isInvalid('specialty')} />
            <button className={`profile-save${saved ? ' profile-save--saved' : ''}`} type="submit" aria-label="Save changes" disabled={pending}><span className="account-action-circle">{saved ? <CheckIcon /> : <ArrowRightIcon />}</span></button>
            {saved && <span className="profile-saved-status" role="status">Saved</span>}
          </form>}
        </div>
        <button className="profile-signout profile-signout-bottom" type="button" disabled={pending} onClick={signOut}>Sign out</button>
      </section>
      <aside className="profile-preview-panel"><div className="profile-preview-content"><div className="soap-preview paper-surface"><h2 className="soap-preview-heading">{specialty}</h2><SoapSections preview /></div></div></aside>
    </main>
  );
}
