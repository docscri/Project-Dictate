import { useEffect, useState } from 'react';
import { stages } from '../../shared/state/notes.js';

export default function WritingNote({ stage }) {
  const index = stages.findIndex(([key]) => key === stage);
  const label = stages[index]?.[1];
  const [previous, setPrevious] = useState(null);
  const [shown, setShown] = useState(stage);
  useEffect(() => { if (stage !== shown) { setPrevious(shown); setShown(stage); } }, [stage, shown]);
  return <section className="writing-note" aria-live="polite">
    <div className="writing-note__lines">
      {previous && <p key={previous} className="writing-note__previous" aria-hidden="true">{stages.find(([key]) => key === previous)?.[1]}</p>}
      <h2 key={stage}><span>{label}</span></h2>
    </div>
  </section>;
}
