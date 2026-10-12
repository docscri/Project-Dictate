import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/account.css';
import './styles/dictation.css';
import './styles/note.css';

const page = import.meta.env.DEV && window.location.pathname === '/dev/components'
  ? React.createElement((await import('./pages/DevComponents.jsx')).default)
  : <App />;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>{page}</React.StrictMode>,
);
