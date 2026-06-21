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
if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // In dev mode, unregister any active service worker to avoid stale production caches blocking dynamic module imports
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('Successfully unregistered stale service worker in DEV mode');
          }
        });
      }
    }).catch(err => {
      console.warn('Failed to query service workers:', err);
    });
  } else {
    try {
      registerSW({ 
        immediate: true,
        onRegisterError(error) {
          console.warn('PWA service worker registration skipped or failed:', error);
        }
      });
    } catch (err) {
      console.warn('PWA service worker initialization failed:', err);
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
