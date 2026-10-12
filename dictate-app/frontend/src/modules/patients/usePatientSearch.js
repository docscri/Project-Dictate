import { useEffect, useState } from 'react';
import { searchPatients } from '../../shared/api/endpoints.js';

export default function usePatientSearch(query, active = true) {
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!active) return;
    let current = true;
    const controller = new AbortController();
    setLoading(true); setError(null); setResults([]);
    const timer = setTimeout(() => {
      searchPatients(query, { signal: controller.signal }).then((items) => { if (current) setResults(items); })
        .catch((failure) => { if (current && failure.code !== 'request_cancelled') setError(failure.code ?? 'server_error'); })
        .finally(() => { if (current) setLoading(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [query, active]);
  return { results, error, loading };
}
