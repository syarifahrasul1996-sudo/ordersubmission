import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Handle and suppress cross-origin JSONP "Script error." which can happen if
// the Google Apps Script Web App redirects to Google Login/Account blocks or has a connection issue.
window.addEventListener('error', (event) => {
  const msg = event.message || '';
  if (
    msg === 'Script error.' ||
    (msg && typeof msg === 'string' && (msg.includes('Script error') || msg.includes('Unexpected token')))
  ) {
    console.warn('Suppressed cross-origin/JSONP script error:', event);
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

window.onerror = function (message, source, lineno, colno, error) {
  if (
    message === 'Script error.' ||
    (message && typeof message === 'string' && (message.includes('Script error') || message.includes('Unexpected token')))
  ) {
    console.warn('Suppressed global onerror cross-origin / JSONP error:', message);
    return true; // Suppress error
  }
  return false;
};

window.addEventListener('unhandledrejection', (event) => {
  const r = event.reason;
  if (
    r && 
    (r.message === 'Script error.' || 
     (r.message && typeof r.message === 'string' && (r.message.includes('Script error') || r.message.includes('Unexpected token'))))
  ) {
    console.warn('Suppressed unhandled script promise rejection:', r.message);
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
