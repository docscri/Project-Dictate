import { useCallback, useEffect, useRef, useState } from 'react';

export default function useCompactPanels(selectedId) {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1220px)').matches);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const drawer = useRef(null);
  const drawerTrigger = useRef(null);
  const gesture = useRef(null);
  const swiped = useRef(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1220px)');
    const change = () => { setCompact(query.matches); setDrawerOpen(false); setControlsOpen(false); };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => { setDrawerOpen(false); }, [selectedId]);
  useEffect(() => {
    if (!compact || !drawerOpen) return;
    const previous = document.activeElement;
    drawer.current?.querySelector('button')?.focus();
    function keydown(event) {
      if (event.key === 'Escape') { setDrawerOpen(false); return; }
      if (event.key !== 'Tab') return;
      const items = [...drawer.current.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')].filter(item => item.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, [compact, drawerOpen]);
  useEffect(() => {
    if (!controlsOpen) return;
    const keydown = event => { if (event.key === 'Escape') setControlsOpen(false); };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [controlsOpen]);
  return { compact, drawerOpen, controlsOpen, drawer, drawerTrigger, closeDrawer,
    openDrawer: () => { setControlsOpen(false); setDrawerOpen(true); },
    setControlsOpen,
    toggleControls: () => { if (swiped.current) { swiped.current = false; return; } setControlsOpen(value => !value); },
    onPointerDown(event) { swiped.current = false; gesture.current = { y: event.clientY, id: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); },
    onPointerUp(event) {
      const start = gesture.current; gesture.current = null;
      if (!start || start.id !== event.pointerId) return;
      const delta = start.y - event.clientY;
      if (Math.abs(delta) >= 30) { swiped.current = true; event.preventDefault(); setControlsOpen(delta > 0); }
    },
    onPointerCancel() { gesture.current = null; },
  };
}
