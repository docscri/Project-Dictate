import Banner from '../../components/Banner.jsx';
import { messageFor } from '../../shared/errors.js';
import WritingNote from './WritingNote.jsx';
import NoteEditor from './NoteEditor.jsx';

export default function NoteCanvas({ controller }) {
  const { record, note, edit } = controller;
  return <>{note.errorCode && <Banner tone="danger">{messageFor(note.errorCode)}</Banner>}
    {record.status === 'processing' ? <WritingNote stage={record.processing_stage} />
      : record.status === 'failed' && !note.manual ? <section className="note-failed">
        <span className="note-failed__icon" aria-hidden="true">⚠</span>
        <h2>{messageFor('note_failed_title')}</h2><p>{messageFor('note_failed_body')}</p>
      </section> : <NoteEditor key={record.id} note={note.draft} terms={record.terms ?? []} invalidSections={note.invalidSections} readOnly={record.status === 'signed' || note.locked || note.signing} onEdit={edit} />}
  </>;
}
