import { useCallback, useEffect, useRef, useState } from 'react';
import { listConsultations, getConsultation, getPatient } from '../../shared/api/endpoints.js';
import { getState, setState, useStore, rememberedConsultationId } from '../../shared/state/store.js';
import useSessionGuard from '../../shared/auth/useSessionGuard.js';
import { mergeConsultationPage } from '../../shared/state/consultations.js';

const pageSize = 50;

export default function useConsultations() {
  const capture = useSessionGuard();
  const consultationsRevision = useStore(state => state.consultationsRevision);
  const [error, setError] = useState(null);
  const [paging, setPaging] = useState({ loading: false, hasMore: true });
  const pager = useRef(null);
  const selection = useRef(0);
  const failedSelection = useRef(null);
  const select = useCallback(async (id) => {
    const version = ++selection.current;
    const current = capture();
    setError(null);
    failedSelection.current = null;
    try {
      const consultation = await getConsultation(id);
      if (!current() || selection.current !== version) return;
      let patient = consultation.patient;
      if (!patient) {
        try { patient = await getPatient(consultation.patient_id); }
        catch (failure) { if (failure.code !== 'not_found') throw failure; patient = null; }
      }
      if (current() && selection.current === version) setState({ selectedConsultation: consultation, selectedPatient: patient });
    } catch (failure) {
      if (current() && selection.current === version) {
        failedSelection.current = id;
        setError(failure.code ?? 'server_error');
      }
    }
  }, []);
  const loadMore = useCallback(async () => {
    const page = pager.current;
    if (!page || !page.active || page.busy || !page.hasMore) return;
    page.busy = true;
    const current = capture();
    const selectionAtStart = selection.current;
    setError(null);
    setPaging({ loading: true, hasMore: page.hasMore });
    try {
      const items = await listConsultations({ limit: pageSize, offset: page.offset, signal: page.controller.signal });
      if (!page.active || !current() || pager.current !== page) return;
      const firstPage = page.offset === 0;
      setState(previous => ({ consultations: mergeConsultationPage(firstPage ? [] : previous.consultations, items), consultationsLoaded: true }));
      page.offset += items.length; page.hasMore = items.length === pageSize;
      if (firstPage && !getState().selectedConsultation && selection.current === selectionAtStart) {
        // Restore an older selection directly; it need not be on the first page.
        const target = rememberedConsultationId() ?? items[0]?.id;
        if (target) await select(target);
      }
    } catch (failure) {
      if (page.active && current() && pager.current === page && failure.code !== 'request_cancelled') setError(failure.code ?? 'server_error');
    } finally {
      page.busy = false;
      if (page.active && current() && pager.current === page) setPaging({ loading: false, hasMore: page.hasMore });
    }
  }, [select]);
  useEffect(() => {
    const page = { offset: 0, hasMore: true, busy: false, active: true, controller: new AbortController() };
    pager.current = page; loadMore();
    return () => { page.active = false; page.controller.abort(); ++selection.current; };
  }, [consultationsRevision, loadMore]);
  const retry = () => failedSelection.current ? select(failedSelection.current) : loadMore();
  return { select, error, loadMore, retry, ...paging };
}
