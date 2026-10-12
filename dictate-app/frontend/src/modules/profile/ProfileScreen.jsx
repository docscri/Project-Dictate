import Button from '../../components/Button.jsx';
import Input from '../../components/Input.jsx';
import Banner from '../../components/Banner.jsx';
import DepartmentChips from '../../components/DepartmentChips.jsx';
import SoapSections from '../../components/SoapSections.jsx';
import { useStore } from '../../shared/state/store.js';
import { messageFor } from '../../shared/errors.js';
import { navigate } from '../../shared/navigation.js';
import useProfile from './useProfile.js';

export default function ProfileScreen() {
  const { user } = useStore();
  const { profile, name, setName, specialty, setSpecialty, pending, errorCode, invalidFields, save, signOut } = useProfile();
  const initials = (profile?.name ?? '').replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <main className="profile-screen" aria-busy={pending}>
      <aside className="profile-sidebar">
        <div className="account-brand">Dictate</div>
        <div className="profile-identity"><div className="profile-avatar" aria-hidden="true">{initials}</div><h2>{profile?.name}</h2><p>{profile?.specialty}</p></div>
        <div className="profile-sidebar-actions">
          <a className="profile-back" href="/dictation" onClick={(event) => { event.preventDefault(); navigate('/dictation'); }}>Back</a>
          <button className="profile-signout" type="button" disabled={pending} onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <section className="profile-panel paper-surface">
        <h1 className="account-heading">Profile</h1>
        {errorCode && <Banner className="account-banner" tone="danger">{messageFor(errorCode)}</Banner>}
        <form noValidate onSubmit={(event) => { event.preventDefault(); save(); }}>
          <div className="profile-fields-row">
            <Input label="Full name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} disabled={pending} invalid={errorCode === 'validation_error' && invalidFields.includes('name')} />
            <Input label="Email" type="email" value={user?.email ?? ''} readOnly />
          </div>
          <div className="account-form-section"><p className="account-label">Department</p><DepartmentChips value={specialty} onChange={setSpecialty} disabled={pending} invalid={errorCode === 'validation_error' && invalidFields.includes('specialty')} /></div>
          <div className="account-form-section"><p className="account-label">Your note sections</p><SoapSections /></div>
          <Button className="profile-save" size="lg" type="submit" disabled={pending}>Save changes</Button>
        </form>
      </section>
    </main>
  );
}

