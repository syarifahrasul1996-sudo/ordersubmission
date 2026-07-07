import { getAuth } from './lib/firebase';
const auth = getAuth();
import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/contacts');

let isSigningIn = false;

const getStoredToken = () => {
  const token = localStorage.getItem('google_access_token');
  const expiry = localStorage.getItem('google_access_token_expiry');
  if (token && expiry && Date.now() < parseInt(expiry, 10)) {
    return token;
  }
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_access_token_expiry');
  return null;
}

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
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      localStorage.removeItem('google_access_token');
      localStorage.removeItem('google_access_token_expiry');
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    // Try popup first as it is more reliable in iframes if successful
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    localStorage.setItem('google_access_token', cachedAccessToken);
    localStorage.setItem('google_access_token_expiry', (Date.now() + 3500 * 1000).toString());

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-query' || error.code === 'auth/popup-closed-by-user') {
      // Fallback to redirect if popup is blocked or closed prematurely
      console.log('Popup issue detected, trying redirect...');
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const handleRedirectResult = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await getRedirectResult(auth);
    if (!result) return null;
    
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
       throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    localStorage.setItem('google_access_token', cachedAccessToken);
    localStorage.setItem('google_access_token_expiry', (Date.now() + 3500 * 1000).toString());

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Redirect result error:', error);
    throw error;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return getStoredToken();
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_access_token_expiry');
};
