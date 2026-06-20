import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Handle and suppress cross-origin JSONP "Script error." which can happen if
// the Google Apps Script Web App redirects to Google Login/Account blocks or has a connection issue.
window.addEventListener('error', (event) => {
  if (
    event.message === 'Script error.' ||
    (event.message && event.message.includes('Script error')) ||
    (event.message && event.message.includes('Unexpected token'))
  ) {
    console.warn('Suppressed cross-origin/JSONP script error:', event);
    event.preventDefault();
  }
});

// Register standard service worker for offline functionality
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
