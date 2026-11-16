import appsScriptSource from '../../google-apps-script/Code.gs?raw';
import type { AgencySettings, AuthUser, CloudStatusInfo, TourismDatabase, UserRole } from '../types/tourism';

export const CLOUD_APPS_SCRIPT_CODE: string = appsScriptSource;
export const DEFAULT_SPREADSHEET_ID = '1BtuAFZPHsQPiXBijVVQTFWu4Dn2EsajLaSYaRtJHkcM';

export const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// In-memory session token (also backed by HttpOnly cookie from server.ts)
let inMemorySessionToken: string | null = null;

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(inMemorySessionToken ? { Authorization: `Bearer ${inMemorySessionToken}` } : {}),
    ...extra,
  };
}

async function apiJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: authHeaders((options.headers as Record<string, string>) || {}),
  });
  let json: (T & { ok?: boolean; error?: string; code?: string }) | null = null;
  try {
    json = (await res.json()) as T & { ok?: boolean; error?: string; code?: string };
  } catch {
    throw new Error(`Server returned invalid response (${res.status}).`);
  }
  if (!res.ok || (json && json.ok === false)) {
    const err = new Error(json?.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = json?.code;
    throw err;
  }
  return json as T;
}

export interface AuthMeResponse {
  ok: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  cloudConfigured: boolean;
  spreadsheetId: string;
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  return apiJson<AuthMeResponse>('/api/auth/me', { cache: 'no-store' });
}

export async function loginWithCredentials(
  email: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const res = await apiJson<{ ok: boolean; user: AuthUser; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  inMemorySessionToken = res.token;
  return { user: res.user, token: res.token };
}

export async function logoutSession(): Promise<void> {
  inMemorySessionToken = null;
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // ignore network errors on logout
  }
}

export async function fetchCloudStatus(): Promise<CloudStatusInfo> {
  return apiJson<CloudStatusInfo>('/api/cloud/status', { cache: 'no-store' });
}

export async function configureCloudSheets(params: {
  webAppUrl: string;
  apiSecret?: string;
  spreadsheetId?: string;
}): Promise<{ ok: boolean; spreadsheetTitle: string; spreadsheetId: string; version: number; updatedAt: string }> {
  return apiJson('/api/cloud/config', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function fetchCloudDatabase(): Promise<{
  version: number;
  updatedAt: string;
  data: TourismDatabase;
}> {
  return apiJson('/api/cloud/db', { cache: 'no-store' });
}

export async function fetchCloudVersion(): Promise<{
  configured: boolean;
  version: number;
  updatedAt: string | null;
}> {
  return apiJson('/api/cloud/version', { cache: 'no-store' });
}

export type CloudCollectionName =
  | 'bookings'
  | 'customers'
  | 'payments'
  | 'expenses'
  | 'packages'
  | 'staff'
  | 'partners';

export async function upsertCloudRecords(
  collection: CloudCollectionName,
  recordOrRecords: unknown | unknown[]
): Promise<{ version: number; updatedAt: string; added: number; updated: number }> {
  const payload = Array.isArray(recordOrRecords)
    ? { action: 'upsert', collection, records: recordOrRecords, clientId: CLIENT_INSTANCE_ID }
    : { action: 'upsert', collection, record: recordOrRecords, clientId: CLIENT_INSTANCE_ID };
  return apiJson('/api/cloud/mutate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteCloudRecord(
  collection: CloudCollectionName,
  id: string,
  cascadeBookingPayments = false
): Promise<{ version: number; updatedAt: string }> {
  return apiJson('/api/cloud/mutate', {
    method: 'POST',
    body: JSON.stringify({
      action: 'delete',
      collection,
      id,
      cascadeBookingPayments,
      clientId: CLIENT_INSTANCE_ID,
    }),
  });
}

export async function saveCloudSettings(
  settings: AgencySettings
): Promise<{ version: number; updatedAt: string }> {
  const { userProfile: _ignoredProfile, ...safeSettings } = settings;
  return apiJson('/api/cloud/mutate', {
    method: 'POST',
    body: JSON.stringify({
      action: 'saveSettings',
      settings: safeSettings,
      clientId: CLIENT_INSTANCE_ID,
    }),
  });
}

export async function migrateLocalDataToCloud(data: TourismDatabase): Promise<{
  ok: boolean;
  verified: boolean;
  summary: Record<string, { added: number; updated: number }>;
  version: number;
  updatedAt: string;
}> {
  return apiJson('/api/cloud/migrate', {
    method: 'POST',
    body: JSON.stringify({
      data,
      clientId: CLIENT_INSTANCE_ID,
    }),
  });
}

export async function fetchCloudUsers(): Promise<AuthUser[]> {
  const res = await apiJson<{ ok: boolean; users: AuthUser[] }>('/api/cloud/users', { cache: 'no-store' });
  return res.users || [];
}

export async function saveCloudUser(user: {
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
  password?: string;
}): Promise<AuthUser[]> {
  const res = await apiJson<{ ok: boolean; users: AuthUser[] }>('/api/cloud/users', {
    method: 'POST',
    body: JSON.stringify(user),
  });
  return res.users || [];
}

export async function removeCloudUser(userId: string): Promise<AuthUser[]> {
  const res = await apiJson<{ ok: boolean; users: AuthUser[] }>(
    `/api/cloud/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE' }
  );
  return res.users || [];
}
