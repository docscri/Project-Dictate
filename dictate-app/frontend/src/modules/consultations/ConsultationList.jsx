import StatusLabel from '../../components/StatusLabel.jsx';
import Banner from '../../components/Banner.jsx';
import { useStore } from '../../shared/state/store.js';
import { patientTitle } from '../../shared/patient.js';
import { messageFor } from '../../shared/errors.js';
import useConsultations from './useConsultations.js';
import { memo, useEffect, useMemo, useRef } from 'react';
import Button from '../../components/Button.jsx';

const noop = () => {};

function localDay(date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
function groupLabel(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (localDay(date) === localDay(today)) return 'TODAY';
  if (localDay(date) === localDay(yesterday)) return 'YESTERDAY';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function localTime(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

export default memo(function ConsultationList({ onSelected = noop, searchQuery = '' }) {
  const { consultations, consultationsLoaded, selectedId } = useStore(state => ({ consultations: state.consultations, consultationsLoaded: state.consultationsLoaded, selectedId: state.selectedConsultation?.id }));
  const { select, error, loadMore, retry, loading, hasMore } = useConsultations();
  const container = useRef(null), sentinel = useRef(null);
  const visibleConsultations = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return query ? consultations.filter(item => patientTitle(item.patient).toLocaleLowerCase().includes(query)) : consultations;
  }, [consultations, searchQuery]);
  const groups = useMemo(() => Map.groupBy(visibleConsultations, item => groupLabel(item.created_at)), [visibleConsultations]);
  useEffect(() => {
    if (!hasMore || loading || error || !sentinel.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) loadMore(); }, { root: container.current });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [hasMore, loading, error, loadMore]);
  return <div className="consultation-list" ref={container} aria-busy={loading}>
    {error && <Banner tone="danger">{messageFor(error)}<Button onClick={retry}>Try again</Button></Banner>}
    {!consultationsLoaded && !consultations.length && !error && <div className="consultation-skeleton-list" aria-label="Loading consultations" role="status"><span className="sr-only">Loading consultations</span>{[0, 1, 2, 3].map((item) => <div className="consultation-skeleton" key={item}><i /><i /><i /></div>)}</div>}
    {consultationsLoaded && !consultations.length && <p className="consultation-empty">No consultations yet. Tap the microphone to begin.</p>}
    {searchQuery.trim() && visibleConsultations.length === 0 && <p className="consultation-empty">No matching consultations.</p>}
    {[...groups].map(([label, items]) => <section className="consultation-group" key={label} aria-label={label}>
      <h2 className="consultation-kicker">{label}</h2>
      {items.map((item) => <button type="button" key={item.id} className={`consultation-row${selectedId === item.id ? ' consultation-row--active' : ''}`} aria-pressed={selectedId === item.id} onFocus={() => { if (hasMore && !error && item.id === consultations.at(-1)?.id) loadMore(); }} onClick={() => { select(item.id); onSelected(); }}>
        <span className="consultation-row__top"><span className="consultation-row__name">{patientTitle(item.patient)}</span><time dateTime={item.created_at}>{localTime(item.created_at)}</time></span>
        <StatusLabel status={item.status} />
      </button>)}
    </section>)}
    {hasMore && <div className="consultation-list-sentinel" ref={sentinel} aria-hidden="true" />}
  </div>;
});
