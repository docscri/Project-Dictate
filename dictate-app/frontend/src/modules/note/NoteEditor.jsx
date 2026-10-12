import { useEffect, useRef } from 'react';
import { sections } from '../../shared/state/notes.js';
import { highlightedParts } from '../../shared/note/highlights.js';

function Body({ section, text, terms, highlights, readOnly, invalid, onEdit }) {
  const element = useRef(null);
  function paint() {
    const target = element.current;
    if (!target) return;
    target.replaceChildren(...highlightedParts(text, terms, highlights, section).map(part => {
      if (!part.highlighted) return document.createTextNode(part.text);
      const span = document.createElement('span'); span.className = 'note-term'; span.textContent = part.text; return span;
    }));
  }
  useEffect(() => { if (document.activeElement !== element.current || readOnly) paint(); }, [text, terms, highlights, section, readOnly]);
  return <div ref={element} className="note-body" role="textbox" aria-label={section[0].toUpperCase() + section.slice(1)} aria-multiline="true" aria-readonly={readOnly} aria-invalid={invalid || undefined}
    contentEditable={!readOnly} suppressContentEditableWarning tabIndex={readOnly ? undefined : 0}
    onInput={event => onEdit(section, event.currentTarget.innerText.replace(/\r/g, ''))}
    onBlur={paint} onPaste={event => {
      if (readOnly) return;
      event.preventDefault(); const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0); range.deleteContents();
      const inserted = document.createTextNode(event.clipboardData.getData('text/plain'));
      range.insertNode(inserted); range.setStartAfter(inserted); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
      onEdit(section, event.currentTarget.innerText.replace(/\r/g, ''));
    }} />;
}
export default function NoteEditor({ note, terms = [], readOnly = false, invalidSections = [], onEdit }) {
  return <section className="note-editor" aria-label="SOAP note">{sections.map(section => <div className="note-section" key={section}>
    <span className="note-badge" aria-hidden="true">{section[0].toUpperCase()}</span>
    <div className="note-section__content"><h3 className="note-kicker">{section.toUpperCase()}</h3>
      <Body section={section} text={note[section] ?? ''} terms={terms} highlights={note.highlights ?? []} readOnly={readOnly} invalid={invalidSections.includes(section)} onEdit={onEdit} />
    </div>
  </div>)}</section>;
}
