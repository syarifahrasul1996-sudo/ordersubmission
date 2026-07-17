import { getAnalytics, isSupported, logEvent } from 'firebase/analytics';
import firebaseConfig from '../../firebase-applet-config.json';

let analyticsInstance: any = null;

/**
 * Initializes Firebase Analytics safely if supported by the browser and if a measurement ID is configured.
 */
export async function initAnalytics(app: any) {
  try {
    const supported = await isSupported();
    if (supported && firebaseConfig.measurementId) {
      analyticsInstance = getAnalytics(app);
      console.log('Firebase Analytics initialized successfully.');
    } else {
      console.log('Firebase Analytics is not supported in this environment or measurementId is empty.');
    }
  } catch (error) {
    console.warn('Failed to initialize Firebase Analytics:', error);
  }
}

/**
 * Tracks a custom or standard event with parameters.
 * Falls back to console logging if Firebase Analytics is not active.
 */
export function trackEvent(eventName: string, params?: Record<string, any>) {
  try {
    if (analyticsInstance) {
      logEvent(analyticsInstance, eventName, params);
      // In development/sandbox environments, also log to the console for easy verification
      console.log(`[Firebase Analytics] Event: ${eventName}`, params);
    } else {
      console.log(`[Firebase Analytics Simulator] Event: ${eventName}`, params);
    }
  } catch (err) {
    console.error(`Failed to log analytics event: ${eventName}`, err);
  }
}
