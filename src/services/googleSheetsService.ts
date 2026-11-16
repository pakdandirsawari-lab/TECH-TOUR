import { TourismDatabase } from '../types/tourism';
import {
  clearCachedToken,
  getAccessToken,
  getAccessTokenSync,
  GoogleAuthPopupError,
  googleLogout,
  googleSignIn,
  SCOPES as GOOGLE_SHEETS_SCOPES,
  subscribeAuth,
} from './googleAuth';
import {
  BACKUP_TABS,
  BackupResult,
  BackupTabSummary,
  DEFAULT_BACKUP_SPREADSHEET_ID,
  serializeTourismDatabase,
  SheetsAuthExpiredError,
  SpreadsheetMetadata,
} from './sheetsBackup';

export {
  DEFAULT_BACKUP_SPREADSHEET_ID,
  GOOGLE_SHEETS_SCOPES,
  GoogleAuthPopupError,
  SheetsAuthExpiredError,
};
export type { BackupResult, BackupTabSummary, SpreadsheetMetadata };

export const SHEETS_DISCOVERY_DOC = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
export const JSON_SNAPSHOT_TAB = 'JSON_Snapshot';
export const GAPI_BACKUP_TABS = [...BACKUP_TABS, JSON_SNAPSHOT_TAB] as const;

const SHEETS_CELL_MAX_CHARS = 45000;

interface GapiErrorBody {
  result?: {
    error?: {
      code?: number;
      message?: string;
      status?: string;
    };
  };
  status?: number;
  message?: string;
}

interface GapiSheetsClient {
  spreadsheets: {
    get: (params: {
      spreadsheetId: string;
      fields?: string;
    }) => Promise<{
      result: {
        spreadsheetId?: string;
        spreadsheetUrl?: string;
        properties?: { title?: string };
        sheets?: Array<{ properties?: { title?: string } }>;
      };
    }>;
    batchUpdate: (params: {
      spreadsheetId: string;
      resource: {
        requests: Array<Record<string, unknown>>;
      };
    }) => Promise<{ result: unknown }>;
    values: {
      batchClear: (params: {
        spreadsheetId: string;
        resource: { ranges: string[] };
      }) => Promise<{ result: unknown }>;
      batchUpdate: (params: {
        spreadsheetId: string;
        resource: {
          valueInputOption: 'RAW' | 'USER_ENTERED';
          data: Array<{
            range: string;
            majorDimension: 'ROWS' | 'COLUMNS';
            values: (string | number)[][];
          }>;
        };
      }) => Promise<{ result: { totalUpdatedCells?: number } }>;
      update: (params: {
        spreadsheetId: string;
        range: string;
        valueInputOption: 'RAW' | 'USER_ENTERED';
        resource: {
          majorDimension?: 'ROWS' | 'COLUMNS';
          values: (string | number)[][];
        };
      }) => Promise<{ result: { updatedCells?: number } }>;
    };
  };
}

interface GapiGlobal {
  load: (
    libraries: string,
    callbackOrOptions:
      | (() => void)
      | {
          callback: () => void;
          onerror?: (err: unknown) => void;
          timeout?: number;
          ontimeout?: () => void;
        }
  ) => void;
  client: {
    init: (config: { discoveryDocs?: string[]; apiKey?: string }) => Promise<void>;
    setToken: (token: { access_token: string } | null) => void;
    getToken: () => { access_token?: string } | null;
    sheets?: GapiSheetsClient;
  };
}

declare global {
  interface Window {
    gapi?: GapiGlobal;
  }
}

export interface SerializedTourismJsonPayload {
  schemaVersion: string;
  exportedAt: string;
  spreadsheetId: string;
  agency: {
    agencyName: string;
    address: string;
    phone: string;
    whatsapp: string;
    email: string;
    gstNumber: string;
    currency: string;
    dateFormat: string;
    theme: string;
    requireLogin: boolean;
    userProfile: {
      name: string;
      email: string;
      role: string;
    };
  };
  financialSummary: {
    totalBookings: number;
    totalCustomers: number;
    totalPayments: number;
    totalExpenses: number;
    totalPackages: number;
    totalStaff: number;
    totalPartners: number;
    totalRevenue: number;
    totalExpensesAmount: number;
    netProfit: number;
    totalOutstanding: number;
  };
  collections: {
    bookings: TourismDatabase['bookings'];
    customers: TourismDatabase['customers'];
    payments: TourismDatabase['payments'];
    expenses: TourismDatabase['expenses'];
    packages: TourismDatabase['packages'];
    staff: TourismDatabase['staff'];
    partners: TourismDatabase['partners'];
  };
}

let gapiInitPromise: Promise<GapiGlobal> | null = null;

function sanitizeFormulaCell(value: string | number): string | number {
  if (typeof value === 'number') return value;
  const str = String(value ?? '');
  if (/^[=+\-@]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

function loadGapiScript(): Promise<void> {
  if (window.gapi) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://apis.google.com/js/api.js"]');
    if (existing) {
      const interval = setInterval(() => {
        if (window.gapi) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(interval);
        if (window.gapi) resolve();
        else reject(new Error('Google API Client (gapi) script failed to load in time.'));
      }, 10000);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google API Client (gapi) script.'));
    document.head.appendChild(script);
  });
}

/**
 * Loads and initializes the Google API Client Library (`gapi.client`) with the Sheets v4 discovery doc.
 */
export async function loadGapiClient(): Promise<GapiGlobal> {
  if (window.gapi?.client?.sheets) {
    return window.gapi;
  }
  if (!gapiInitPromise) {
    gapiInitPromise = (async () => {
      await loadGapiScript();
      const gapi = window.gapi;
      if (!gapi) {
        throw new Error('Google API Client (gapi) is unavailable in this browser.');
      }

      await new Promise<void>((resolve, reject) => {
        gapi.load('client', {
          callback: () => resolve(),
          onerror: (err) => reject(err instanceof Error ? err : new Error('Failed to load gapi.client module.')),
          timeout: 10000,
          ontimeout: () => reject(new Error('Timed out loading gapi.client module.')),
        });
      });

      await gapi.client.init({
        discoveryDocs: [SHEETS_DISCOVERY_DOC],
      });

      if (!gapi.client.sheets) {
        throw new Error('Google Sheets v4 discovery client did not initialize.');
      }

      return gapi;
    })().catch((err) => {
      gapiInitPromise = null;
      throw err;
    });
  }
  return gapiInitPromise;
}

/**
 * Attaches or clears the in-memory OAuth access token on `gapi.client`.
 */
export function setGapiAccessToken(accessToken: string | null): void {
  if (!window.gapi?.client) return;
  if (accessToken) {
    window.gapi.client.setToken({ access_token: accessToken });
  } else {
    window.gapi.client.setToken(null);
  }
}

/**
 * Authenticates the user directly with Google Identity Services (GIS) for the
 * Google Sheets API scope and attaches the resulting access token to `gapi.client`.
 * Initiates `googleSignIn()` before any `await` to preserve browser user-gesture popup permission.
 */
export async function authenticateWithGoogleSheets(): Promise<{ accessToken: string }> {
  const signInPromise = googleSignIn();
  const result = await signInPromise;
  try {
    await loadGapiClient();
    setGapiAccessToken(result.accessToken);
  } catch {
    // gapi will still be initialized and token attached on first API call
  }
  return result;
}

/**
 * Synchronously returns the active in-memory OAuth access token for the Google Sheets API, or null.
 */
export function getGoogleSheetsAccessTokenSync(): string | null {
  return getAccessTokenSync();
}

/**
 * Returns the active in-memory OAuth access token for the Google Sheets API, or null.
 */
export async function getGoogleSheetsAccessToken(): Promise<string | null> {
  return getAccessToken();
}

/**
 * Subscribes to Google Sheets in-memory OAuth authentication state changes.
 */
export function subscribeGoogleSheetsAuth(listener: (authenticated: boolean) => void): () => void {
  return subscribeAuth(listener);
}

/**
 * Clears any cached in-memory Google Sheets token and detaches it from `gapi.client`.
 */
export function clearGoogleSheetsAuthToken(): void {
  clearCachedToken();
  setGapiAccessToken(null);
}

/**
 * Revokes and signs out of the current Google Sheets OAuth session.
 */
export async function signOutGoogleSheets(): Promise<void> {
  await googleLogout();
  setGapiAccessToken(null);
}

function handleGapiError(err: unknown): never {
  const e = err as GapiErrorBody;
  const code = e?.result?.error?.code ?? e?.status;
  if (code === 401) {
    clearGoogleSheetsAuthToken();
    throw new SheetsAuthExpiredError('Google session expired. Please sign in with Google again.');
  }
  const msg = e?.result?.error?.message || e?.message || 'Google Sheets API request failed via gapi.';
  throw new Error(msg);
}

/**
 * Serializes the full TourismContext state (bookings, customers, payments, expenses,
 * packages, staff, partners, and non-sensitive settings) into a structured JSON payload.
 */
export function serializeTourismStateToJson(
  db: TourismDatabase,
  spreadsheetId: string = DEFAULT_BACKUP_SPREADSHEET_ID
): SerializedTourismJsonPayload {
  const paidByBooking = new Map<string, number>();
  for (const p of db.payments) {
    paidByBooking.set(p.bookingId, (paidByBooking.get(p.bookingId) ?? 0) + (Number(p.amount) || 0));
  }

  const totalRevenue = db.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalExpensesAmount = db.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const netProfit = totalRevenue - totalExpensesAmount;
  const activeBookings = db.bookings.filter((b) => b.status !== 'Cancelled');
  const totalOutstanding = activeBookings.reduce((s, b) => {
    const paid = paidByBooking.get(b.id) ?? 0;
    return s + Math.max(0, b.totalCost - paid);
  }, 0);

  return {
    schemaVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    spreadsheetId: spreadsheetId.trim() || DEFAULT_BACKUP_SPREADSHEET_ID,
    agency: {
      agencyName: db.settings.agencyName,
      address: db.settings.address,
      phone: db.settings.phone,
      whatsapp: db.settings.whatsapp,
      email: db.settings.email,
      gstNumber: db.settings.gstNumber,
      currency: db.settings.currency,
      dateFormat: db.settings.dateFormat,
      theme: db.settings.theme,
      requireLogin: db.settings.requireLogin,
      userProfile: {
        name: db.settings.userProfile.name,
        email: db.settings.userProfile.email,
        role: db.settings.userProfile.role,
      },
    },
    financialSummary: {
      totalBookings: db.bookings.length,
      totalCustomers: db.customers.length,
      totalPayments: db.payments.length,
      totalExpenses: db.expenses.length,
      totalPackages: db.packages.length,
      totalStaff: db.staff.length,
      totalPartners: db.partners.length,
      totalRevenue,
      totalExpensesAmount,
      netProfit,
      totalOutstanding,
    },
    collections: {
      bookings: db.bookings,
      customers: db.customers,
      payments: db.payments,
      expenses: db.expenses,
      packages: db.packages,
      staff: db.staff,
      partners: db.partners,
    },
  };
}

/**
 * Converts a serialized JSON payload into cell-limit-safe rows for the `JSON_Snapshot` tab.
 * Google Sheets limits individual cells to 50,000 characters, so large sections are chunked cleanly.
 */
function buildJsonSnapshotRows(payload: SerializedTourismJsonPayload): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['Section', 'Chunk Index', 'Total Chunks', 'Record Count', 'Exported At (ISO)', 'JSON Payload'],
  ];

  const appendJsonEntry = (sectionName: string, recordCount: number, data: unknown) => {
    const json = JSON.stringify(data);
    const totalChunks = Math.max(1, Math.ceil(json.length / SHEETS_CELL_MAX_CHARS));
    for (let i = 0; i < totalChunks; i++) {
      const slice = json.slice(i * SHEETS_CELL_MAX_CHARS, (i + 1) * SHEETS_CELL_MAX_CHARS);
      rows.push([sectionName, i + 1, totalChunks, recordCount, payload.exportedAt, slice]);
    }
  };

  appendJsonEntry('agency_and_summary', 1, {
    schemaVersion: payload.schemaVersion,
    exportedAt: payload.exportedAt,
    agency: payload.agency,
    financialSummary: payload.financialSummary,
  });
  appendJsonEntry('bookings', payload.collections.bookings.length, payload.collections.bookings);
  appendJsonEntry('customers', payload.collections.customers.length, payload.collections.customers);
  appendJsonEntry('payments', payload.collections.payments.length, payload.collections.payments);
  appendJsonEntry('expenses', payload.collections.expenses.length, payload.collections.expenses);
  appendJsonEntry('packages', payload.collections.packages.length, payload.collections.packages);
  appendJsonEntry('staff', payload.collections.staff.length, payload.collections.staff);
  appendJsonEntry('partners', payload.collections.partners.length, payload.collections.partners);
  appendJsonEntry('full_state_json', 1, payload);

  return rows;
}

/**
 * Fetches spreadsheet metadata using `gapi.client.sheets.spreadsheets.get`.
 */
export async function fetchSpreadsheetMetadataWithGapi(
  spreadsheetId: string,
  accessToken?: string
): Promise<SpreadsheetMetadata> {
  const cleanId = spreadsheetId.trim() || DEFAULT_BACKUP_SPREADSHEET_ID;
  const token = accessToken ?? (await getAccessToken());
  if (!token) {
    throw new SheetsAuthExpiredError('Google sign-in is required to read spreadsheet metadata.');
  }

  const gapi = await loadGapiClient();
  gapi.client.setToken({ access_token: token });

  try {
    const resp = await gapi.client.sheets!.spreadsheets.get({
      spreadsheetId: cleanId,
      fields: 'spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title',
    });
    const data = resp.result;
    return {
      spreadsheetId: data.spreadsheetId || cleanId,
      title: data.properties?.title || 'Untitled Spreadsheet',
      sheetTitles: Array.isArray(data.sheets)
        ? data.sheets.map((s) => s.properties?.title || '').filter(Boolean)
        : [],
      spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${cleanId}`,
    };
  } catch (err) {
    handleGapiError(err);
  }
}

/**
 * Ensures all required tabs exist in the target spreadsheet via `gapi.client.sheets.spreadsheets.batchUpdate`.
 */
async function ensureTabsExistWithGapi(
  gapi: GapiGlobal,
  spreadsheetId: string,
  existingTitles: string[],
  requiredTabs: readonly string[]
): Promise<void> {
  const missingTabs = requiredTabs.filter((tab) => !existingTitles.includes(tab));
  if (missingTabs.length === 0) return;

  try {
    await gapi.client.sheets!.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: missingTabs.map((title) => ({
          addSheet: {
            properties: {
              title,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        })),
      },
    });
  } catch (err) {
    handleGapiError(err);
  }
}

/**
 * Serializes the complete TourismContext database state as both JSON (`JSON_Snapshot` tab)
 * and formatted domain tabs, and pushes everything via `gapi.client.sheets` to the target Spreadsheet ID.
 */
export async function pushJsonStateViaGapi(
  db: TourismDatabase,
  spreadsheetId: string = DEFAULT_BACKUP_SPREADSHEET_ID,
  accessToken?: string
): Promise<BackupResult> {
  const cleanId = spreadsheetId.trim() || DEFAULT_BACKUP_SPREADSHEET_ID;
  const token = accessToken ?? (await getAccessToken());
  if (!token) {
    throw new SheetsAuthExpiredError('Google sign-in is required to push data to Google Sheets.');
  }

  const gapi = await loadGapiClient();
  gapi.client.setToken({ access_token: token });

  const metadata = await fetchSpreadsheetMetadataWithGapi(cleanId, token);
  await ensureTabsExistWithGapi(gapi, cleanId, metadata.sheetTitles, GAPI_BACKUP_TABS);

  const jsonPayload = serializeTourismStateToJson(db, cleanId);
  const jsonSnapshotRows = buildJsonSnapshotRows(jsonPayload);
  const tabularPayloads = serializeTourismDatabase(db);

  try {
    // 1. Clear only our managed backup tabs (full-sheet A1 notation avoids grid-limit errors on new tabs)
    await gapi.client.sheets!.spreadsheets.values.batchClear({
      spreadsheetId: cleanId,
      resource: {
        ranges: GAPI_BACKUP_TABS.map((t) => `'${t}'`),
      },
    });

    // 2. Write formatted domain tabs via USER_ENTERED (with formula-injection sanitization)
    const tabularData = BACKUP_TABS.map((tab) => ({
      range: `'${tab}'!A1`,
      majorDimension: 'ROWS' as const,
      values: tabularPayloads[tab].map((row) => row.map(sanitizeFormulaCell)),
    }));

    const tabularWriteResp = await gapi.client.sheets!.spreadsheets.values.batchUpdate({
      spreadsheetId: cleanId,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: tabularData,
      },
    });

    // 3. Write raw serialized JSON payload into JSON_Snapshot via RAW so JSON strings stay exact
    const jsonWriteResp = await gapi.client.sheets!.spreadsheets.values.update({
      spreadsheetId: cleanId,
      range: `'${JSON_SNAPSHOT_TAB}'!A1`,
      valueInputOption: 'RAW',
      resource: {
        majorDimension: 'ROWS',
        values: jsonSnapshotRows,
      },
    });

    const updatedTabs: BackupTabSummary[] = [
      ...BACKUP_TABS.map((tab) => ({
        tabName: tab,
        rowCount: Math.max(0, tabularPayloads[tab].length - 1),
      })),
      {
        tabName: JSON_SNAPSHOT_TAB,
        rowCount: Math.max(0, jsonSnapshotRows.length - 1),
      },
    ];

    const totalCellsWritten =
      (tabularWriteResp.result.totalUpdatedCells ?? 0) + (jsonWriteResp.result.updatedCells ?? 0);

    return {
      spreadsheetId: cleanId,
      spreadsheetTitle: metadata.title,
      spreadsheetUrl: metadata.spreadsheetUrl,
      updatedTabs,
      totalCellsWritten,
      timestamp: new Date().toLocaleString(),
    };
  } catch (err) {
    handleGapiError(err);
  }
}

/**
 * Pushes solely the serialized JSON state (per-collection + full-state JSON) to `JSON_Snapshot` via `gapi`.
 */
export async function pushJsonOnlyToSheetViaGapi(
  db: TourismDatabase,
  spreadsheetId: string = DEFAULT_BACKUP_SPREADSHEET_ID,
  accessToken?: string
): Promise<BackupResult> {
  const cleanId = spreadsheetId.trim() || DEFAULT_BACKUP_SPREADSHEET_ID;
  const token = accessToken ?? (await getAccessToken());
  if (!token) {
    throw new SheetsAuthExpiredError('Google sign-in is required to push JSON state to Google Sheets.');
  }

  const gapi = await loadGapiClient();
  gapi.client.setToken({ access_token: token });

  const metadata = await fetchSpreadsheetMetadataWithGapi(cleanId, token);
  await ensureTabsExistWithGapi(gapi, cleanId, metadata.sheetTitles, [JSON_SNAPSHOT_TAB]);

  const jsonPayload = serializeTourismStateToJson(db, cleanId);
  const jsonSnapshotRows = buildJsonSnapshotRows(jsonPayload);

  try {
    await gapi.client.sheets!.spreadsheets.values.batchClear({
      spreadsheetId: cleanId,
      resource: { ranges: [`'${JSON_SNAPSHOT_TAB}'`] },
    });

    const writeResp = await gapi.client.sheets!.spreadsheets.values.update({
      spreadsheetId: cleanId,
      range: `'${JSON_SNAPSHOT_TAB}'!A1`,
      valueInputOption: 'RAW',
      resource: {
        majorDimension: 'ROWS',
        values: jsonSnapshotRows,
      },
    });

    return {
      spreadsheetId: cleanId,
      spreadsheetTitle: metadata.title,
      spreadsheetUrl: metadata.spreadsheetUrl,
      updatedTabs: [
        {
          tabName: JSON_SNAPSHOT_TAB,
          rowCount: Math.max(0, jsonSnapshotRows.length - 1),
        },
      ],
      totalCellsWritten: writeResp.result.updatedCells ?? 0,
      timestamp: new Date().toLocaleString(),
    };
  } catch (err) {
    handleGapiError(err);
  }
}

/**
 * High-level helper that serializes the TourismContext state and exports both
 * structured domain sheets and the JSON snapshot to the configured Spreadsheet ID.
 */
export async function exportTourismStateToSpreadsheet(
  db: TourismDatabase,
  spreadsheetId: string = DEFAULT_BACKUP_SPREADSHEET_ID,
  accessToken?: string
): Promise<BackupResult> {
  return pushJsonStateViaGapi(db, spreadsheetId, accessToken);
}
