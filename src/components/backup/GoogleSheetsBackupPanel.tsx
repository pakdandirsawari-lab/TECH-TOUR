import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  DatabaseZap,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useTourism } from '../../context/TourismContext';
import {
  CLOUD_APPS_SCRIPT_CODE,
  DEFAULT_SPREADSHEET_ID,
  fetchCloudUsers,
  removeCloudUser,
  saveCloudUser,
} from '../../services/cloudSheetsApi';
import type { AuthUser, UserRole } from '../../types/tourism';
import { ConfirmDialog } from '../ui/CommonUI';

export function GoogleSheetsBackupPanel() {
  const {
    db,
    isAdmin,
    currentUser,
    cloudStatus,
    syncStatus,
    cloudError,
    cloudVersion,
    lastSyncedAt,
    refreshFromCloud,
    connectCloudSheets,
    localScan,
    migrationState,
    rescanLocalData,
    runLocalMigration,
    showToast,
  } = useTourism();

  const [spreadsheetId, setSpreadsheetId] = useState(
    () => cloudStatus?.spreadsheetId || DEFAULT_SPREADSHEET_ID
  );
  const [webAppUrl, setWebAppUrl] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const [showScriptCode, setShowScriptCode] = useState(() => !cloudStatus?.configured);
  const [copiedScript, setCopiedScript] = useState(false);

  const [includeDemoOnRescan, setIncludeDemoOnRescan] = useState(false);
  const [clearLocalAfterVerify, setClearLocalAfterVerify] = useState(true);

  // Cloud RBAC Users state
  const [cloudUsers, setCloudUsers] = useState<AuthUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('staff');
  const [userStatus, setUserStatus] = useState<'Active' | 'Inactive'>('Active');
  const [userPassword, setUserPassword] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (cloudStatus?.spreadsheetId) {
      setSpreadsheetId(cloudStatus.spreadsheetId);
    }
  }, [cloudStatus?.spreadsheetId]);

  const loadCloudUsers = useCallback(async () => {
    if (!isAdmin || !cloudStatus?.configured || !cloudStatus.connected) return;
    setLoadingUsers(true);
    setUsersError('');
    try {
      const list = await fetchCloudUsers();
      setCloudUsers(list);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Unable to load users from Google Sheets.');
    } finally {
      setLoadingUsers(false);
    }
  }, [cloudStatus?.configured, cloudStatus?.connected, isAdmin]);

  useEffect(() => {
    void loadCloudUsers();
  }, [loadCloudUsers]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webAppUrl.trim().startsWith('https://script.google.com/')) {
      showToast('error', 'Enter a valid Google Apps Script Web App URL starting with https://script.google.com/.');
      return;
    }
    setIsConnecting(true);
    const ok = await connectCloudSheets({
      webAppUrl: webAppUrl.trim(),
      apiSecret: apiSecret.trim() || undefined,
      spreadsheetId: spreadsheetId.trim() || DEFAULT_SPREADSHEET_ID,
    });
    setIsConnecting(false);
    if (ok) {
      setWebAppUrl('');
      setApiSecret('');
      setShowScriptCode(false);
      await loadCloudUsers();
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(CLOUD_APPS_SCRIPT_CODE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2200);
      showToast('success', 'Complete Code.gs copied to clipboard.');
    } catch {
      showToast('error', 'Copy failed. Select the code box manually to copy.');
    }
  };

  const resetUserForm = () => {
    setEditingUser(null);
    setUserName('');
    setUserEmail('');
    setUserRole('staff');
    setUserStatus('Active');
    setUserPassword('');
  };

  const handleEditUser = (u: AuthUser) => {
    setEditingUser(u);
    setUserName(u.name);
    setUserEmail(u.email);
    setUserRole(u.role);
    setUserStatus(u.status);
    setUserPassword('');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userEmail.trim()) {
      showToast('error', 'Name and email are required.');
      return;
    }
    if (!editingUser && !userPassword.trim()) {
      showToast('error', 'Password is required when creating a new user.');
      return;
    }
    setSavingUser(true);
    try {
      const updated = await saveCloudUser({
        id: editingUser?.id,
        name: userName.trim(),
        email: userEmail.trim().toLowerCase(),
        role: userRole,
        status: userStatus,
        ...(userPassword.trim() ? { password: userPassword.trim() } : {}),
      });
      setCloudUsers(updated);
      showToast('success', editingUser ? 'User updated in Google Sheets.' : 'User created in Google Sheets.');
      resetUserForm();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save user.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    try {
      const updated = await removeCloudUser(deletingUser.id);
      setCloudUsers(updated);
      showToast('success', `Removed user ${deletingUser.email}.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete user.');
    } finally {
      setDeletingUser(null);
    }
  };

  const totalCloudRecords =
    db.bookings.length +
    db.customers.length +
    db.payments.length +
    db.expenses.length +
    db.packages.length +
    db.staff.length +
    db.partners.length;

  return (
    <div className="space-y-6">
      {/* 1. Google Sheets Central Cloud Connection */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Google Sheets Central Cloud Database
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Single source of truth for all users and devices via Google Apps Script Web App API ({totalCloudRecords}{' '}
                shared records loaded · Sync version v{cloudVersion}).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                cloudStatus?.connected
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : cloudStatus?.configured
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                    : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              }`}
            >
              {syncStatus === 'syncing' || syncStatus === 'connecting' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : cloudStatus?.connected ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5" />
              )}
              {cloudStatus?.connected
                ? `Connected${lastSyncedAt ? ` · ${lastSyncedAt}` : ''}`
                : cloudStatus?.configured
                  ? 'Connection Error'
                  : 'Not Connected Yet'}
            </span>

            {cloudStatus?.configured && (
              <button
                type="button"
                onClick={() => void refreshFromCloud(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            )}
          </div>
        </div>

        {cloudError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{cloudError}</span>
          </div>
        )}

        <form onSubmit={handleConnect} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Google Spreadsheet ID
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={spreadsheetId}
                  onChange={(e) => setSpreadsheetId(e.target.value)}
                  placeholder={DEFAULT_SPREADSHEET_ID}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <a
                  href={`https://docs.google.com/spreadsheets/d/${spreadsheetId.trim() || DEFAULT_SPREADSHEET_ID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </a>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Apps Script API_SECRET (Optional)
              </label>
              <div className="relative mt-1.5">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder={
                    cloudStatus?.hasApiSecret
                      ? '•••••••• (Stored securely on server)'
                      : 'Matches API_SECRET in Script Properties'
                  }
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 font-mono text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Google Apps Script Web App URL (<code className="font-mono">/exec</code>)
              </label>
              {webAppUrl.trim().startsWith('https://script.google.com/') && (
                <a
                  href={`${webAppUrl.trim().split('?')[0]}?action=ping`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  <ExternalLink className="h-3 w-3" />
                  Test /exec in Browser
                </a>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <input
                type="url"
                value={webAppUrl}
                onChange={(e) => setWebAppUrl(e.target.value)}
                placeholder={
                  cloudStatus?.webAppUrlPreview
                    ? `Current: ${cloudStatus.webAppUrlPreview} (paste to update)`
                    : 'https://script.google.com/macros/s/.../exec'
                }
                className="flex-1 min-w-[260px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                type="submit"
                disabled={isConnecting}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                {isConnecting ? 'Connecting & Initializing...' : 'Connect & Initialize Sheets'}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Stored securely on the backend server only. Important: Apps Script must be deployed with{' '}
              <strong>Execute as: Me</strong>, <strong>Who has access: Anyone</strong>, and whenever you edit{' '}
              <code className="font-mono">Code.gs</code> you must click <strong>Deploy → Manage deployments → Edit → New version → Deploy</strong>.
            </p>
          </div>
        </form>

        {/* Toggle Complete Code.gs Deployment Guide */}
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowScriptCode((s) => !s)}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              {showScriptCode ? 'Hide Google Apps Script Backend Code & Guide' : 'Show Complete Code.gs & Beginner Setup Steps'}
            </button>
            <button
              type="button"
              onClick={handleCopyScript}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {copiedScript ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedScript ? 'Copied Code.gs' : 'Copy Code.gs'}
            </button>
          </div>

          {showScriptCode && (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <ol className="list-decimal space-y-1.5 pl-4 text-xs text-slate-700 dark:text-slate-300">
                <li>
                  Open your Google Sheet (ID: <code className="font-mono">{spreadsheetId || DEFAULT_SPREADSHEET_ID}</code>) and click{' '}
                  <strong>Extensions → Apps Script</strong>.
                </li>
                <li>
                  Delete any existing code in <code className="font-mono">Code.gs</code>, paste the complete script below, and click <strong>Save</strong>.
                </li>
                <li>
                  Select <code className="font-mono">testAndInitialize</code> in the top toolbar and click{' '}
                  <strong>Run</strong> once to grant Google Sheets permission and create all tabs/headers.
                </li>
                <li>
                  Click <strong>Deploy → New deployment</strong> (or if updating an existing deployment,{' '}
                  <strong>Deploy → Manage deployments → Edit (pencil) → Version: New version</strong>) with{' '}
                  <strong>Execute as: Me</strong> and <strong>Who has access: Anyone</strong>.
                </li>
                <li>
                  Copy the resulting <code className="font-mono">https://script.google.com/macros/s/.../exec</code> URL and paste it above.
                </li>
              </ol>
              <pre className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] text-slate-100 dark:border-slate-700">
                {CLOUD_APPS_SCRIPT_CODE}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* 2. Local Browser Storage Scanner & Verified Cloud Migration */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Migrate Existing Local Browser Data to Google Sheets
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Scans <code className="font-mono">localStorage</code>, <code className="font-mono">sessionStorage</code>, and{' '}
                <code className="font-mono">IndexedDB</code>. Deduplicates records by ID and never clears local data until cloud
                verification succeeds.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void rescanLocalData(includeDemoOnRescan)}
            disabled={migrationState.status === 'scanning' || migrationState.status === 'migrating'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${migrationState.status === 'scanning' ? 'animate-spin' : ''}`} />
            Rescan Storage
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          {localScan ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Detected Local Records: <span className="font-mono">{localScan.totalRecords}</span>
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  Sources:{' '}
                  {localScan.sourcesFound.length > 0 ? localScan.sourcesFound.join(', ') : 'None detected'}
                  {localScan.demoRecordsSkipped > 0
                    ? ` (${localScan.demoRecordsSkipped} sample demo items skipped)`
                    : ''}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
                {[
                  ['Customers', localScan.counts.customers],
                  ['Bookings', localScan.counts.bookings],
                  ['Payments', localScan.counts.payments],
                  ['Expenses', localScan.counts.expenses],
                  ['Packages', localScan.counts.packages],
                  ['Staff', localScan.counts.staff],
                  ['Partners', localScan.counts.partners],
                ].map(([label, count]) => (
                  <div
                    key={String(label)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <p className="text-[11px] text-slate-500">{label}</p>
                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{count}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Click Rescan Storage to inspect local browser storage.</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={clearLocalAfterVerify}
                onChange={(e) => setClearLocalAfterVerify(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Remove local browser cache keys only after verified Google Sheets sync
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={includeDemoOnRescan}
                onChange={(e) => {
                  const next = e.target.checked;
                  setIncludeDemoOnRescan(next);
                  void rescanLocalData(next);
                }}
                className="rounded border-slate-300 text-blue-600"
              />
              Include legacy sample/demo-flagged records if present
            </label>
          </div>

          <button
            type="button"
            onClick={() => void runLocalMigration(clearLocalAfterVerify)}
            disabled={
              migrationState.status === 'migrating' ||
              !cloudStatus?.connected ||
              !localScan ||
              localScan.totalRecords === 0
            }
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {migrationState.status === 'migrating' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <DatabaseZap className="h-4 w-4" />
            )}
            {migrationState.status === 'migrating'
              ? 'Migrating & Verifying...'
              : `Migrate ${localScan?.totalRecords ?? 0} Records to Google Sheets`}
          </button>
        </div>

        {migrationState.message && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium ${
              migrationState.status === 'error'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
                : migrationState.status === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
            }`}
          >
            {migrationState.status === 'migrating' || migrationState.status === 'scanning' ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : migrationState.status === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>{migrationState.message}</span>
          </div>
        )}
      </div>

      {/* 3. Admin & Staff Role-Based Access Control (Users Sheet) */}
      {isAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Admin & Staff Access Control (Google Sheets Users)
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Manage team logins stored in the <code className="font-mono">Users</code> sheet with salted SHA-256 hashes.{' '}
                  <strong>Admin</strong> has full access; <strong>Staff</strong> can manage bookings/customers/payments/expenses
                  but cannot delete records or change cloud settings.
                </p>
              </div>
            </div>

            {cloudStatus?.connected && (
              <button
                type="button"
                onClick={() => void loadCloudUsers()}
                disabled={loadingUsers}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
                Reload Users
              </button>
            )}
          </div>

          {!cloudStatus?.connected ? (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
              Connect your Google Sheets Web App URL above to manage Admin and Staff accounts in the cloud{' '}
              <code className="font-mono">Users</code> sheet.
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              {usersError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                  {usersError}
                </div>
              )}

              {/* User Table */}
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Name</th>
                      <th className="px-4 py-2.5 font-semibold">Email</th>
                      <th className="px-4 py-2.5 font-semibold">Role</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {cloudUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">{u.name}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-600 dark:text-slate-300">{u.email}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                              u.role === 'admin'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            <Shield className="h-3 w-3" />
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                              u.status === 'Active'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditUser(u)}
                              className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Edit
                            </button>
                            {u.email.toLowerCase() !== currentUser?.email.toLowerCase() && (
                              <button
                                type="button"
                                onClick={() => setDeletingUser(u)}
                                className="text-red-600 hover:text-red-700"
                                title="Remove User"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add / Edit User Form */}
              <form
                onSubmit={handleSaveUser}
                className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                    <UserPlus className="h-4 w-4 text-blue-600" />
                    <span>{editingUser ? `Edit User · ${editingUser.email}` : 'Add Admin or Staff Account'}</span>
                  </div>
                  {editingUser && (
                    <button
                      type="button"
                      onClick={resetUserForm}
                      className="text-xs font-semibold text-slate-500 hover:underline"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Full Name *"
                    required
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="Work Email *"
                    required
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <select
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value as UserRole)}
                    aria-label="User Role"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                  <select
                    value={userStatus}
                    onChange={(e) => setUserStatus(e.target.value as 'Active' | 'Inactive')}
                    aria-label="Account Status"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                  <input
                    type="password"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder={editingUser ? 'New password (optional)' : 'Password *'}
                    required={!editingUser}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingUser}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {savingUser ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {editingUser ? 'Update User in Sheets' : 'Add User to Sheets'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deletingUser)}
        title="Remove User Account?"
        message={
          deletingUser
            ? `Remove ${deletingUser.name} (${deletingUser.email}) from Google Sheets access? They will no longer be able to sign in.`
            : ''
        }
        confirmLabel="Remove User"
        onConfirm={() => void handleDeleteUser()}
        onCancel={() => setDeletingUser(null)}
      />
    </div>
  );
}
