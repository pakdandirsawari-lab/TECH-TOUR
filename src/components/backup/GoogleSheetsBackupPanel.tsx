import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  LogOut,
  RefreshCw,
  UploadCloud,
} from 'lucide-react';
import { useTourism } from '../../context/TourismContext';
import {
  authenticateWithGoogleSheets,
  clearGoogleSheetsAuthToken,
  DEFAULT_BACKUP_SPREADSHEET_ID,
  fetchSpreadsheetMetadataWithGapi,
  GAPI_BACKUP_TABS,
  getGoogleSheetsAccessToken,
  GoogleAuthPopupError,
  SheetsAuthExpiredError,
  signOutGoogleSheets,
  SpreadsheetMetadata,
  subscribeGoogleSheetsAuth,
} from '../../services/googleSheetsService';
import { APPS_SCRIPT_TEMPLATE } from '../../services/sheetsBackup';
import { ConfirmDialog } from '../ui/CommonUI';

const WEBHOOK_STORAGE_KEY = 'hh_tms_apps_script_url';

function GoogleSignInButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
    >
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
      <span>Sign in with Google</span>
    </button>
  );
}

export function GoogleSheetsBackupPanel() {
  const {
    db,
    showToast,
    isSyncingSheets,
    lastSheetsBackup,
    sheetsSyncError,
    syncAllToSheets,
    syncViaAppsScript,
  } = useTourism();

  const [mode, setMode] = useState<'oauth' | 'apps_script'>('oauth');
  const [spreadsheetId, setSpreadsheetId] = useState(DEFAULT_BACKUP_SPREADSHEET_ID);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isCheckingMeta, setIsCheckingMeta] = useState(false);
  const [metadata, setMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [confirmBackupOpen, setConfirmBackupOpen] = useState(false);
  const [localError, setLocalError] = useState('');

  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem(WEBHOOK_STORAGE_KEY) || '');
  const [copiedScript, setCopiedScript] = useState(false);
  const [popupBlockedError, setPopupBlockedError] = useState(false);

  useEffect(() => {
    const unsub = subscribeGoogleSheetsAuth((authed) => {
      setIsAuthenticated(authed);
    });
    return () => unsub();
  }, []);

  const handleSignIn = () => {
    setIsSigningIn(true);
    setLocalError('');
    setPopupBlockedError(false);

    // Call synchronously in click stack so browser/iframe preserves user-gesture popup activation
    void authenticateWithGoogleSheets()
      .then(async (res) => {
        setIsAuthenticated(true);
        showToast('success', 'Authorized Google Sheets access.');
        setIsCheckingMeta(true);
        try {
          const meta = await fetchSpreadsheetMetadataWithGapi(spreadsheetId, res.accessToken);
          setMetadata(meta);
        } catch (err) {
          setLocalError(err instanceof Error ? err.message : 'Unable to read spreadsheet metadata.');
        } finally {
          setIsCheckingMeta(false);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Google sign-in failed.';
        const isPopupErr =
          err instanceof GoogleAuthPopupError &&
          (err.code === 'popup_closed' || err.code === 'popup_failed_to_open');
        setPopupBlockedError(isPopupErr);
        setLocalError(message);
        showToast('error', message);
      })
      .finally(() => {
        setIsSigningIn(false);
      });
  };

  const handleSignOut = async () => {
    await signOutGoogleSheets();
    setMetadata(null);
    showToast('info', 'Disconnected Google Sheets session.');
  };

  const handleCheckSpreadsheet = async () => {
    setLocalError('');
    const token = await getGoogleSheetsAccessToken();
    if (!token) {
      setIsAuthenticated(false);
      return;
    }
    setIsCheckingMeta(true);
    try {
      const meta = await fetchSpreadsheetMetadataWithGapi(spreadsheetId, token);
      setMetadata(meta);
      showToast('success', `Verified spreadsheet "${meta.title}"`);
    } catch (err) {
      if (err instanceof SheetsAuthExpiredError) {
        clearGoogleSheetsAuthToken();
      }
      const msg = err instanceof Error ? err.message : 'Could not fetch spreadsheet details.';
      setLocalError(msg);
      showToast('error', msg);
    } finally {
      setIsCheckingMeta(false);
    }
  };

  const handleRequestBackup = async () => {
    setLocalError('');
    if (mode === 'apps_script') {
      if (!webhookUrl.trim().startsWith('https://script.google.com/')) {
        setLocalError('Enter your Google Apps Script Web App URL (https://script.google.com/...).');
        return;
      }
      localStorage.setItem(WEBHOOK_STORAGE_KEY, webhookUrl.trim());
      setConfirmBackupOpen(true);
      return;
    }

    const token = await getGoogleSheetsAccessToken();
    if (!token) {
      setIsAuthenticated(false);
      showToast('info', 'Please sign in with Google to authorize spreadsheet access.');
      return;
    }
    if (!spreadsheetId.trim()) {
      setLocalError('Please enter a valid Google Spreadsheet ID.');
      return;
    }
    if (!metadata || metadata.spreadsheetId !== spreadsheetId.trim()) {
      setIsCheckingMeta(true);
      try {
        const meta = await fetchSpreadsheetMetadataWithGapi(spreadsheetId, token);
        setMetadata(meta);
      } catch (err) {
        if (err instanceof SheetsAuthExpiredError) {
          clearGoogleSheetsAuthToken();
        }
        const msg = err instanceof Error ? err.message : 'Unable to verify spreadsheet ID.';
        setLocalError(msg);
        setIsCheckingMeta(false);
        return;
      }
      setIsCheckingMeta(false);
    }
    setConfirmBackupOpen(true);
  };

  const executeBackup = async () => {
    setConfirmBackupOpen(false);
    setLocalError('');
    if (mode === 'apps_script') {
      await syncViaAppsScript(webhookUrl, spreadsheetId);
      return;
    }
    await syncAllToSheets(spreadsheetId);
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
      showToast('success', 'Apps Script code copied to clipboard.');
    } catch {
      showToast('error', 'Failed to copy script.');
    }
  };

  const totalRecordsCount =
    db.bookings.length +
    db.customers.length +
    db.payments.length +
    db.expenses.length +
    db.packages.length +
    db.staff.length +
    db.partners.length;

  const displayedError = localError || sheetsSyncError;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Direct Google Sheets Backup (No Firebase)
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Serializes all {totalRecordsCount} records as JSON and formatted tables across {GAPI_BACKUP_TABS.length} tabs using the Google API Client (<code className="font-mono">gapi</code>) or an Apps Script Webhook.
            </p>
          </div>
        </div>

        {/* Mode Switch */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setMode('oauth')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'oauth'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Direct Google Sign-In
          </button>
          <button
            type="button"
            onClick={() => setMode('apps_script')}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              mode === 'apps_script'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Apps Script Webhook
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {/* Target Spreadsheet ID */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Target Google Spreadsheet ID
          </label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <input
              type="text"
              value={spreadsheetId}
              onChange={(e) => {
                setSpreadsheetId(e.target.value);
                setMetadata(null);
              }}
              placeholder="Enter Google Spreadsheet ID"
              className="flex-1 min-w-[240px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {mode === 'oauth' && isAuthenticated && (
              <button
                type="button"
                onClick={handleCheckSpreadsheet}
                disabled={isCheckingMeta}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {isCheckingMeta ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Verify Sheet
              </button>
            )}
            <a
              href={`https://docs.google.com/spreadsheets/d/${spreadsheetId.trim()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-blue-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Sheet
            </a>
          </div>
        </div>

        {/* Mode 1: Direct Google Identity Services OAuth */}
        {mode === 'oauth' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            {!isAuthenticated ? (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Sign in directly with Google (via Google Identity Services) to grant temporary permission to update your spreadsheet.
                </p>
                <GoogleSignInButton onClick={handleSignIn} disabled={isSigningIn} />
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Google Sheets Authorized (Direct In-Memory Token)
                  </p>
                  {metadata && (
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                      Connected to: <strong>{metadata.title}</strong> ({metadata.sheetTitles.length} existing tabs)
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              </>
            )}
          </div>
        )}

        {/* Mode 2: Apps Script Webhook (Zero Sign-In) */}
        {mode === 'apps_script' && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Google Apps Script Web App URL (Optional Login-Free Push)
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  In your Google Sheet: Extensions → Apps Script → Paste & Deploy as Web App (Anyone):
                </span>
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  {copiedScript ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedScript ? 'Copied' : 'Copy Script'}
                </button>
              </div>
              <pre className="max-h-36 overflow-auto rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] text-slate-100 dark:border-slate-700">
                {APPS_SCRIPT_TEMPLATE}
              </pre>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Note: Do not click <strong>Run</strong> on <code className="font-mono">doPost</code> in the Apps Script editor (it has no HTTP <code className="font-mono">postData</code> there). Select <code className="font-mono">testAuthorization</code> if you want to authorize in the editor, then click <strong>Deploy → New deployment → Web app</strong> (Execute as: <em>Me</em>, Who has access: <em>Anyone</em>).
              </p>
            </div>
          </div>
        )}

        {displayedError && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            <span>{displayedError}</span>
            {popupBlockedError && mode === 'oauth' && (
              <button
                type="button"
                onClick={() => {
                  setMode('apps_script');
                  setLocalError('');
                  setPopupBlockedError(false);
                }}
                className="rounded-md bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-200 dark:bg-red-900/60 dark:text-red-200"
              >
                Switch to Apps Script Webhook (No Popup)
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tabs synced: <span className="font-mono">{GAPI_BACKUP_TABS.join(', ')}</span>
          </p>

          <button
            type="button"
            onClick={handleRequestBackup}
            disabled={isSyncingSheets || isCheckingMeta || (mode === 'oauth' && !isAuthenticated)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSyncingSheets ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {isSyncingSheets ? 'Syncing to Google Sheets...' : 'Backup All Data to Spreadsheet'}
          </button>
        </div>

        {lastSheetsBackup && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 font-bold text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              <span>Backup Complete · {lastSheetsBackup.timestamp}</span>
            </div>
            <p className="mt-1 text-emerald-700 dark:text-emerald-400">
              Synced {lastSheetsBackup.updatedTabs.length} tabs ({lastSheetsBackup.totalCellsWritten} cells) in "
              {lastSheetsBackup.spreadsheetTitle}".
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5 text-[11px] text-emerald-800 dark:text-emerald-300">
              {lastSheetsBackup.updatedTabs.map((t) => (
                <div key={t.tabName} className="font-mono">
                  {t.tabName}: {t.rowCount}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmBackupOpen}
        title="Overwrite Spreadsheet Backup Tabs?"
        message={`This will clear and overwrite the Summary, Bookings (${db.bookings.length}), Customers (${db.customers.length}), Payments (${db.payments.length}), Expenses (${db.expenses.length}), Packages (${db.packages.length}), Staff (${db.staff.length}), Staff_Salaries, Partners (${db.partners.length}), Settings, and JSON_Snapshot tabs in "${metadata?.title || spreadsheetId}". Unrelated tabs will not be touched.`}
        confirmLabel="Confirm & Backup"
        onConfirm={executeBackup}
        onCancel={() => setConfirmBackupOpen(false)}
      />
    </div>
  );
}
