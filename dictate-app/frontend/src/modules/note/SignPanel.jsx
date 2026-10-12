import Button from '../../components/Button.jsx';
import { stages } from '../../shared/state/notes.js';

function Progress({ stage }) {
  const step = stages.findIndex(([key]) => key === stage) + 1;
  return <div className="note-progress"><progress aria-label="Writing note progress" max="5" value={step} />{step > 0 && <p>Step {step} of 5</p>}</div>;
}
export default function SignPanel({ controller, onSign, onNew, onRetrySave, profile }) {
  const { record, note, retry, manual } = controller;
  if (record.status === 'processing') return <><Progress stage={record.processing_stage} />{note.errorCode && <Button onClick={retry}>Try again</Button>}</>;
  if (record.status === 'failed' && !note.manual) return <aside className="note-panel note-panel--failed">
    {note.lastStage && <div className="note-failure-progress"><Progress stage={note.lastStage} /><p>Stopped at {stages.find(([key]) => key === note.lastStage)?.[1]}</p></div>}
    <div className="note-panel__actions"><Button variant="accent" className="note-primary" onClick={retry} disabled={record.status === 'processing'}>Try again</Button><Button variant="outline" onClick={manual}>Edit manually</Button></div>
  </aside>;
  const name = (profile?.name ?? '').replace(/^Dr\.?\s*/i, '');
  const time = record.signed_at ? new Date(record.signed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  return <aside className="note-panel"><div className="note-panel__actions">
    {record.status === 'signed' ? <section className="note-signed">
      <h2><span className="note-check" aria-hidden="true">✓</span>Signed and saved</h2>
      <p>Dr. {name}{time ? `, today ${time}` : ''}. This note is now read-only.</p>
    </section> : <>
      <div className="note-review"><span aria-hidden="true">ⓘ</span><p><strong>Drafted by AI.</strong> Review each section before signing. Edits save automatically.</p></div>
      <Button variant="accent" className="note-primary" disabled={note.signing} onClick={onSign}>Sign and save</Button>
      {note.errorCode && note.editVersion > note.savedVersion && !note.locked && <Button variant="outline" disabled={note.signing} onClick={onRetrySave}>Try again</Button>}
    </>}
    <Button variant="outline" className="note-new" onClick={onNew}>New dictation</Button>
  </div></aside>;
}
