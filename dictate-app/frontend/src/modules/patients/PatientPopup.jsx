import { useRef, useState } from 'react';
import Modal from '../../components/Modal.jsx';
import Tabs from '../../components/Tabs.jsx';
import Input from '../../components/Input.jsx';
import Button from '../../components/Button.jsx';
import Chip from '../../components/Chip.jsx';
import Banner from '../../components/Banner.jsx';
import { CloseIcon, SearchIcon } from '../../components/ConsultationIcons.jsx';
import { ErrorIcon, MicrophoneIcon } from '../../components/AccountIcons.jsx';
import { createPatient, createConsultation } from '../../shared/api/endpoints.js';
import { useStore, setState } from '../../shared/state/store.js';
import { initials, patientMeta } from '../../shared/patient.js';
import { messageFor } from '../../shared/errors.js';
import usePatientSearch from './usePatientSearch.js';
import useSessionGuard from '../../shared/auth/useSessionGuard.js';

const closePopup = () => setState({ patientPopupOpen: false });
const modes = [{ value: 'search', label: 'Search' }, { value: 'add', label: 'Add patient' }];
const sexes = ['Male', 'Female', 'Other'];

function PopupContent({ onStartDictation }) {
  const capture = useSessionGuard();
  const [mode, setMode] = useState('search');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [prepared, setPrepared] = useState(null);
  const [draft, setDraft] = useState({ name: '', age: '', sex: 'male' });
  const [error, setError] = useState(null);
  const [invalid, setInvalid] = useState({});
  const [pending, setPending] = useState(false);
  const createdPatient = useRef(null);
  const { results, error: searchError, loading } = usePatientSearch(query, mode === 'search');
  const changeDraft = (field, value) => { setDraft((previous) => ({ ...previous, [field]: value })); setInvalid((previous) => ({ ...previous, [field]: false })); setError(null); };

  async function prepare(patient, current) {
    if (!current()) return;
    const consultation = await createConsultation({ patient_id: patient.id });
    if (!current()) return;
    setState((previous) => ({ selectedPatient: patient, selectedConsultation: consultation, consultationsRevision: previous.consultationsRevision + 1 }));
    setPrepared({ patient, consultation });
  }
  async function selectPatient(patient) {
    if (pending) return;
    setSelected(patient);
    setPending(true); setError(null);
    const current = capture();
    try { await prepare(patient, current); }
    catch (failure) { if (current()) setError(failure.code ?? 'server_error'); }
    finally { if (current()) setPending(false); }
  }
  async function addPatient(event) {
    event.preventDefault();
    if (pending) return;
    const age = draft.age.trim() === '' ? null : Number(draft.age);
    const bad = { name: !draft.name.trim(), age: age !== null && (!Number.isInteger(age) || age < 0) };
    setInvalid(bad);
    if (bad.name || bad.age) { setError('validation_error'); return; }
    setPending(true); setError(null);
    const body = { name: draft.name.trim(), age, sex: draft.sex };
    const key = JSON.stringify(body);
    const current = capture();
    try {
      // Keep a successfully created patient if only consultation creation needs retrying.
      const patient = createdPatient.current?.key === key ? createdPatient.current.patient : await createPatient(body);
      if (!current()) return;
      createdPatient.current = { key, patient };
      setSelected(patient);
      await prepare(patient, current);
    } catch (failure) {
      if (!current()) return;
      setError(failure.code ?? 'server_error');
      if (failure.code === 'validation_error') setInvalid(Object.fromEntries((failure.fields?.length ? failure.fields : ['name', 'age', 'sex']).map(field => [field, true])));
    }
    finally { if (current()) setPending(false); }
  }
  function startDictation() {
    if (!prepared || pending) return;
    onStartDictation?.();
    closePopup();
  }
  return <Modal open onClose={closePopup} title="New consultation" header={false} className="patient-popup paper-surface" backdropClassName="patient-popup-backdrop">
    <div className="patient-popup__header"><span className="patient-popup__mic" aria-hidden="true"><MicrophoneIcon /></span><button type="button" className="patient-popup__close" aria-label="Close popup" onClick={closePopup}><CloseIcon /></button></div>
    {!selected && <Tabs id="patient-mode" label="Patient selection" items={modes} active={mode} onChange={(value) => { setMode(value); setError(null); }} className="patient-popup__tabs" />}
    {!selected && (error || searchError && mode === 'search') && <Banner tone="danger" className="patient-popup__error">{messageFor(error ?? searchError)}</Banner>}
    {selected ? <div className="patient-popup__ready" aria-busy={pending}>
      <div className="patient-result patient-result--selected">
        <span className="patient-result__initials">{initials(selected.name)}</span>
        <div className="patient-result__identity"><span className="patient-result__name">{selected.name}</span><span className="patient-result__meta">{patientMeta(selected)}</span></div>
      </div>
      {error && <Banner tone="danger" className="patient-popup__error">{messageFor(error)}</Banner>}
      <Button className="patient-popup__submit" size="lg" autoFocus disabled={pending} onClick={prepared ? startDictation : () => selectPatient(selected)}>{pending ? 'Preparing' : prepared ? 'Start dictation' : 'Try again'}</Button>
    </div> : <>
    <div role="tabpanel" id="patient-mode-search-panel" aria-labelledby="patient-mode-search-tab" hidden={mode !== 'search'}>
    {mode === 'search' && <div className="patient-search">
      <div className="patient-search__field"><SearchIcon /><Input label="Search by name" placeholder="Search by name" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); setError(null); }} /></div>
      <div className="patient-search__results" aria-busy={loading}>
        {results.map((patient) => <div key={patient.id} className={`patient-result${selected?.id === patient.id ? ' patient-result--selected' : ''}`}>
          <span className="patient-result__initials">{initials(patient.name)}</span>
          <div className="patient-result__identity"><span className="patient-result__name">{patient.name}</span><span className="patient-result__meta">{patientMeta(patient)}</span></div>
          <Button variant={selected?.id === patient.id ? 'primary' : 'outline'} size="sm" disabled={pending} aria-pressed={selected?.id === patient.id} onClick={() => selectPatient(patient)}>{selected?.id === patient.id && pending ? 'Selecting' : selected?.id === patient.id ? 'Selected' : 'Select'}</Button>
        </div>)}
      </div>
    </div>}
    </div>
    <div role="tabpanel" id="patient-mode-add-panel" aria-labelledby="patient-mode-add-tab" hidden={mode !== 'add'}>
    {mode === 'add' && <form className="patient-add" noValidate onSubmit={addPatient}>
      <div className="patient-add__fields">
        <Input label="Patient name" placeholder="Patient name" required value={draft.name} invalid={invalid.name} onChange={(event) => changeDraft('name', event.target.value)} disabled={pending} showInvalidIcon />
        <Input label="Age" placeholder="Age" type="number" min="0" step="1" value={draft.age} invalid={invalid.age} onChange={(event) => changeDraft('age', event.target.value)} disabled={pending} showInvalidIcon />
      </div>
      <fieldset className="patient-add__sex" aria-label="Sex" aria-invalid={invalid.sex || undefined}><div>{sexes.map((sex) => <Chip key={sex} label={sex} selected={draft.sex === sex.toLowerCase()} disabled={pending} onSelect={() => changeDraft('sex', sex.toLowerCase())} />)}{invalid.sex && <span className="patient-add__sex-error" aria-hidden="true"><ErrorIcon /></span>}</div></fieldset>
      <Button type="submit" size="lg" className="patient-popup__submit" disabled={pending}>Add patient</Button>
    </form>}
    </div>
    </>}
  </Modal>;
}
export default function PatientPopup({ onStartDictation }) { const patientPopupOpen = useStore(state => state.patientPopupOpen); return patientPopupOpen ? <PopupContent onStartDictation={onStartDictation} /> : null; }
