import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/documents');
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;

const getStoredToken = () => {
  try {
    const token = localStorage.getItem('google_docs_access_token');
    const expiry = localStorage.getItem('google_docs_access_token_expiry');
    if (token && expiry && Date.now() < parseInt(expiry, 10)) {
      return token;
    }
    localStorage.removeItem('google_docs_access_token');
    localStorage.removeItem('google_docs_access_token_expiry');
  } catch (e) {
    console.warn('LocalStorage error:', e);
  }
  return null;
};

let cachedAccessToken: string | null = getStoredToken();

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      cachedAccessToken = getStoredToken();
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthSuccess) onAuthSuccess(user, "");
      }
    } else {
      cachedAccessToken = null;
      try {
        localStorage.removeItem('google_docs_access_token');
        localStorage.removeItem('google_docs_access_token_expiry');
      } catch (e) {}
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    try {
      localStorage.setItem('google_docs_access_token', cachedAccessToken);
      // Google access tokens expire in 1 hour (3600 seconds). We save it with a 55 minutes margin (3300 seconds).
      localStorage.setItem('google_docs_access_token_expiry', (Date.now() + 3300 * 1000).toString());
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  cachedAccessToken = getStoredToken();
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  try {
    localStorage.removeItem('google_docs_access_token');
    localStorage.removeItem('google_docs_access_token_expiry');
  } catch (e) {}
};
