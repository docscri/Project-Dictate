import { useEffect, useRef } from 'react';
import { captureSession } from './session.js';
import { getState } from '../state/store.js';

// Capture before awaiting work. Refresh is allowed; unmount or a new account is not.
export default function useSessionGuard() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return () => {
    const current = captureSession();
    const owner = getState().user;
    return () => mounted.current && current() && getState().user === owner;
  };
}
