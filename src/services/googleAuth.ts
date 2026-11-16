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
  requestAccessToken: (overrideConfig?: { prompt?: string; hint?: string }) => void;
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

export class GoogleAuthPopupError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GoogleAuthPopupError';
    this.code = code;
  }
}

// In-memory access token cache (never persisted in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

type AuthListener = (authenticated: boolean) => void;
const listeners = new Set<AuthListener>();

// Reusable GIS TokenClient and single active auth promise
let sharedTokenClient: GisTokenClient | null = null;
let pendingResolve: ((value: { accessToken: string }) => void) | null = null;
let pendingReject: ((reason?: unknown) => void) | null = null;
let pendingWatchdog: ReturnType<typeof setTimeout> | null = null;

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

function clearPendingAuth() {
  if (pendingWatchdog) {
    clearTimeout(pendingWatchdog);
    pendingWatchdog = null;
  }
  pendingResolve = null;
  pendingReject = null;
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
      }, 80);
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

function getOrCreateTokenClient(): GisTokenClient | null {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) return null;

  if (!sharedTokenClient) {
    sharedTokenClient = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES.join(' '),
      callback: (resp: TokenResponse) => {
        const resolveFn = pendingResolve;
        const rejectFn = pendingReject;
        clearPendingAuth();

        if (resp.error || !resp.access_token) {
          const errMsg = resp.error_description || resp.error || 'Google authorization was cancelled.';
          rejectFn?.(new GoogleAuthPopupError(resp.error || 'auth_error', errMsg));
          return;
        }
        cachedAccessToken = resp.access_token;
        const ttlMs = ((resp.expires_in ?? 3500) - 60) * 1000;
        tokenExpiresAt = Date.now() + Math.max(60_000, ttlMs);
        notifyListeners();
        resolveFn?.({ accessToken: resp.access_token });
      },
      error_callback: (err) => {
        const rejectFn = pendingReject;
        clearPendingAuth();

        const errType = err?.type || 'unknown';
        if (errType === 'popup_closed') {
          rejectFn?.(
            new GoogleAuthPopupError(
              'popup_closed',
              'Google sign-in popup window closed before completing authorization. If your browser or preview iframe restricts OAuth popups, switch to the "Apps Script Webhook" tab for popup-free backup.'
            )
          );
          return;
        }
        if (errType === 'popup_failed_to_open') {
          rejectFn?.(
            new GoogleAuthPopupError(
              'popup_failed_to_open',
              'Browser blocked the Google sign-in popup window. Please allow popups for this site or use the "Apps Script Webhook" tab instead.'
            )
          );
          return;
        }
        rejectFn?.(new GoogleAuthPopupError(errType, err?.message || `Google sign-in error (${errType})`));
      },
    });
  }

  return sharedTokenClient;
}

// Preload GIS script immediately so click handlers can invoke requestAccessToken synchronously
if (typeof window !== 'undefined') {
  void loadGisScript()
    .then(() => {
      getOrCreateTokenClient();
    })
    .catch(() => {
      // ignore preload failure; sign-in handler will surface actionable error
    });
}

/**
 * Initiates Google OAuth2 sign-in via GIS.
 * Invokes `requestAccessToken` synchronously when GIS is loaded so browsers/iframes preserve user-gesture activation.
 */
export function googleSignIn(): Promise<{ accessToken: string }> {
  const existingClient = getOrCreateTokenClient();

  const startRequest = (client: GisTokenClient) =>
    new Promise<{ accessToken: string }>((resolve, reject) => {
      if (pendingReject) {
        pendingReject(new GoogleAuthPopupError('superseded', 'Replaced by a new Google sign-in attempt.'));
        clearPendingAuth();
      }
      pendingResolve = resolve;
      pendingReject = reject;

      // Safety timeout in case popup hangs indefinitely without firing callback
      pendingWatchdog = setTimeout(() => {
        const rejectFn = pendingReject;
        clearPendingAuth();
        rejectFn?.(
          new GoogleAuthPopupError(
            'timeout',
            'Google sign-in timed out. Please try again or use the Apps Script Webhook mode.'
          )
        );
      }, 120_000);

      try {
        client.requestAccessToken({ prompt: '' });
      } catch (err) {
        clearPendingAuth();
        reject(err instanceof Error ? err : new Error('Failed to open Google sign-in popup.'));
      }
    });

  if (existingClient) {
    return startRequest(existingClient);
  }

  return loadGisScript().then(() => {
    const client = getOrCreateTokenClient();
    if (!client) {
      throw new Error('Google Identity Services is unavailable in this browser.');
    }
    return startRequest(client);
  });
}

export function getAccessTokenSync(): string | null {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }
  if (cachedAccessToken) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    window.gapi?.client?.setToken(null);
    notifyListeners();
  }
  return null;
}

export async function getAccessToken(): Promise<string | null> {
  return getAccessTokenSync();
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
