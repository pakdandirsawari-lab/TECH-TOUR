// Direct Google Identity Services (GIS) OAuth2 Token Client — No Firebase SDK required.
export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '1063154027713-julv2o3pe9s9t8ha08jmbhjr3d9kgsk5.apps.googleusercontent.com';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (err: { type: string; message?: string }) => void;
          }) => GisTokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

// In-memory access token cache (never persisted in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

type AuthListener = (authenticated: boolean) => void;
const listeners = new Set<AuthListener>();

function notifyListeners() {
  const authed = Boolean(cachedAccessToken && Date.now() < tokenExpiresAt);
  listeners.forEach((cb) => cb(authed));
}

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  listener(Boolean(cachedAccessToken && Date.now() < tokenExpiresAt));
  return () => {
    listeners.delete(listener);
  };
}

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      const checkInterval = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkInterval);
        if (window.google?.accounts?.oauth2) resolve();
        else reject(new Error('Google Identity Services script failed to initialize.'));
      }, 8000);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
    document.head.appendChild(script);
  });
}

export async function googleSignIn(): Promise<{ accessToken: string }> {
  await loadGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Identity Services is unavailable in this browser.');
  }

  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES.join(' '),
      callback: (resp: TokenResponse) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'Google authorization was cancelled.'));
          return;
        }
        cachedAccessToken = resp.access_token;
        const ttlMs = ((resp.expires_in ?? 3500) - 60) * 1000;
        tokenExpiresAt = Date.now() + Math.max(60_000, ttlMs);
        notifyListeners();
        resolve({ accessToken: resp.access_token });
      },
      error_callback: (err) => {
        reject(new Error(err?.message || `Google sign-in popup error (${err?.type || 'unknown'})`));
      },
    });

    client.requestAccessToken({ prompt: 'consent' });
  });
}

export async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }
  if (cachedAccessToken) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    notifyListeners();
  }
  return null;
}

export function clearCachedToken(): void {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
  window.gapi?.client?.setToken(null);
  notifyListeners();
}

export async function googleLogout(): Promise<void> {
  const tokenToRevoke = cachedAccessToken;
  cachedAccessToken = null;
  tokenExpiresAt = 0;
  window.gapi?.client?.setToken(null);
  notifyListeners();
  if (tokenToRevoke && window.google?.accounts?.oauth2) {
    try {
      window.google.accounts.oauth2.revoke(tokenToRevoke);
    } catch {
      // ignore revoke errors
    }
  }
}
