import { useEffect, useState } from 'react';
import { searchPatients } from '../../shared/api/endpoints.js';

export default function usePatientSearch(query, active = true) {
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const normalized = query.trim();
    if (!active || !normalized) {
      setLoading(false); setError(null); setResults([]);
      return;
    }
    let current = true;
    const controller = new AbortController();
    setLoading(true); setError(null);
    const timer = setTimeout(() => {
      searchPatients(normalized, { signal: controller.signal }).then((items) => { if (current) setResults(items); })
        .catch((failure) => { if (current && failure.code !== 'request_cancelled') setError(failure.code ?? 'server_error'); })
        .finally(() => { if (current) setLoading(false); });
    }, 150);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [query, active]);
  return { results, error, loading };
}
