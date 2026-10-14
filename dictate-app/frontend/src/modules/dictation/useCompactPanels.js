import { useCallback, useEffect, useRef, useState } from 'react';

export default function useCompactPanels(selectedId) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef(null);
  const drawerTrigger = useRef(null);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => { setDrawerOpen(false); }, [selectedId]);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const previous = document.activeElement;
    drawer.current?.querySelector('button')?.focus();
    function keydown(event) {
      if (event.key === 'Escape') { closeDrawer(); return; }
      if (event.key !== 'Tab') return;
      const items = [...drawer.current.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]')].filter(item => item.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, [drawerOpen, closeDrawer]);

  return { drawerOpen, drawer, drawerTrigger, closeDrawer, openDrawer: () => setDrawerOpen(true) };
}
