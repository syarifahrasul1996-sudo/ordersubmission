import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { firebaseAuth } from './firebaseClient';

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/contacts');

let isSigningIn = false;

// Store OAuth access token strictly in memory (never in localStorage)
let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiry = 0;

function purgeLegacyLocalStorageTokens(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_access_token_expiry');
  } catch {
    // ignore storage errors
  }
}

purgeLegacyLocalStorageTokens();

function getValidInMemoryToken(): string | null {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiry) {
    return cachedAccessToken;
  }
  cachedAccessToken = null;
  cachedAccessTokenExpiry = 0;
  return null;
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  purgeLegacyLocalStorageTokens();
  return onAuthStateChanged(firebaseAuth, async (user: User | null) => {
    if (user) {
      const token = getValidInMemoryToken();
      if (token) {
        if (onAuthSuccess) onAuthSuccess(user, token);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      cachedAccessTokenExpiry = 0;
      purgeLegacyLocalStorageTokens();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(firebaseAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    cachedAccessTokenExpiry = Date.now() + 3500 * 1000;
    purgeLegacyLocalStorageTokens();

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    if (
      error.code === 'auth/popup-blocked' ||
      error.code === 'auth/cancelled-query' ||
      error.code === 'auth/popup-closed-by-user'
    ) {
      await signInWithRedirect(firebaseAuth, provider);
      return null;
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const handleRedirectResult = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await getRedirectResult(firebaseAuth);
    if (!result) return null;

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    cachedAccessTokenExpiry = Date.now() + 3500 * 1000;
    purgeLegacyLocalStorageTokens();

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Redirect result error:', error);
    throw error;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return getValidInMemoryToken();
};

export const logout = async () => {
  await firebaseAuth.signOut();
  cachedAccessToken = null;
  cachedAccessTokenExpiry = 0;
  purgeLegacyLocalStorageTokens();
};
