import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { useTourism } from '../../context/TourismContext';
import {
  authenticateWithGoogleSheets,
  DEFAULT_BACKUP_SPREADSHEET_ID,
  getGoogleSheetsAccessToken,
} from '../../services/googleSheetsService';
import { DateFormatOption } from '../../types/tourism';
import { ConfirmDialog } from '../ui/CommonUI';
import { GoogleSheetsBackupPanel } from '../backup/GoogleSheetsBackupPanel';

export function SettingsView() {
  const {
    db,
    updateSettings,
    clearDemoDataOnly,
    resetDemoData,
    exportBackup,
    importBackup,
    lockApp,
    showToast,
    isSyncingSheets,
    lastSheetsBackup,
    sheetsSyncError,
    syncAllToSheets,
  } = useTourism();

  const [agencyName, setAgencyName] = useState(db.settings.agencyName);
  const [agencyLogo, setAgencyLogo] = useState(db.settings.agencyLogo);
  const [address, setAddress] = useState(db.settings.address);
  const [phone, setPhone] = useState(db.settings.phone);
  const [whatsapp, setWhatsapp] = useState(db.settings.whatsapp);
  const [email, setEmail] = useState(db.settings.email);
  const [gstNumber, setGstNumber] = useState(db.settings.gstNumber);
  const [currency, setCurrency] = useState(db.settings.currency);
  const [dateFormat, setDateFormat] = useState<DateFormatOption>(db.settings.dateFormat);
  const [theme, setTheme] = useState<'light' | 'dark'>(db.settings.theme);

  const [userName, setUserName] = useState(db.settings.userProfile.name);
  const [userEmail, setUserEmail] = useState(db.settings.userProfile.email);
  const [userRole, setUserRole] = useState(db.settings.userProfile.role);
  const [newPassword, setNewPassword] = useState('');
  const [requireLogin, setRequireLogin] = useState(db.settings.requireLogin);

  const [confirmAction, setConfirmAction] = useState<'clear_demo' | 'reset_demo' | 'sync_sheets' | null>(null);
  const [isAuthorizingSheets, setIsAuthorizingSheets] = useState(false);
  const [sheetsStatusFeedback, setSheetsStatusFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1000000) {
      showToast('error', 'Logo image should be smaller than 1 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setAgencyLogo(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agencyName.trim()) {
      showToast('error', 'Agency Name cannot be empty.');
      return;
    }
    updateSettings({
      ...db.settings,
      agencyName: agencyName.trim(),
      agencyLogo,
      address: address.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim(),
      email: email.trim(),
      gstNumber: gstNumber.trim(),
      currency,
      dateFormat,
      theme,
      requireLogin,
      userProfile: {
        ...db.settings.userProfile,
        name: userName.trim() || db.settings.userProfile.name,
        email: userEmail.trim() || db.settings.userProfile.email,
        role: userRole.trim() || db.settings.userProfile.role,
        password: newPassword.trim() ? newPassword.trim() : db.settings.userProfile.password,
      },
    });
    setNewPassword('');
  };

  const handleDownloadBackup = () => {
    const json = exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tourism_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', 'JSON backup downloaded.');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        importBackup(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleQuickSyncClick = async () => {
    setSheetsStatusFeedback(null);
    let token = await getGoogleSheetsAccessToken();
    if (!token) {
      setIsAuthorizingSheets(true);
      setSheetsStatusFeedback({
        type: 'info',
        message: 'Authorizing with Google Sheets API...',
      });
      try {
        const res = await authenticateWithGoogleSheets();
        token = res.accessToken;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Google authentication failed.';
        setSheetsStatusFeedback({ type: 'error', message });
        showToast('error', message);
        setIsAuthorizingSheets(false);
        return;
      } finally {
        setIsAuthorizingSheets(false);
      }
    }
    if (token) {
      setSheetsStatusFeedback(null);
      setConfirmAction('sync_sheets');
    }
  };

  const executeQuickSync = async () => {
    setConfirmAction(null);
    setSheetsStatusFeedback({
      type: 'info',
      message: 'Serializing TourismContext data and exporting to Google Sheets...',
    });
    const res = await syncAllToSheets(DEFAULT_BACKUP_SPREADSHEET_ID);
    if (res.ok && res.result) {
      setSheetsStatusFeedback({
        type: 'success',
        message: `Synced ${res.result.updatedTabs.length} tabs (${res.result.totalCellsWritten} cells) to "${res.result.spreadsheetTitle}" at ${res.result.timestamp}.`,
      });
    } else {
      setSheetsStatusFeedback({
        type: 'error',
        message: sheetsSyncError || 'Failed to sync data to Google Sheets. Please try again.',
      });
    }
  };

  const isSheetsBusy = isAuthorizingSheets || isSyncingSheets;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Quick Sync to Google Sheets Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Google Sheets Quick Sync</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Serialize all bookings, customers, payments, expenses, packages, staff, and partners to Spreadsheet ID{' '}
                <span className="font-mono text-slate-700 dark:text-slate-300">{DEFAULT_BACKUP_SPREADSHEET_ID}</span>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={`https://docs.google.com/spreadsheets/d/${DEFAULT_BACKUP_SPREADSHEET_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Sheet
            </a>
            <button
              type="button"
              onClick={handleQuickSyncClick}
              disabled={isSheetsBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSheetsBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              {isAuthorizingSheets
                ? 'Authorizing Google...'
                : isSyncingSheets
                  ? 'Syncing to Google Sheets...'
                  : 'Sync to Google Sheets'}
            </button>
          </div>
        </div>

        {(sheetsStatusFeedback || (sheetsSyncError && !isSheetsBusy) || lastSheetsBackup) && (
          <div className="mt-4">
            {sheetsStatusFeedback?.type === 'error' || (!sheetsStatusFeedback && sheetsSyncError) ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{sheetsStatusFeedback?.message || sheetsSyncError}</span>
              </div>
            ) : sheetsStatusFeedback?.type === 'info' ? (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                <span>{sheetsStatusFeedback.message}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  {sheetsStatusFeedback?.message ||
                    (lastSheetsBackup
                      ? `Last synced ${lastSheetsBackup.updatedTabs.length} tabs (${lastSheetsBackup.totalCellsWritten} cells) to "${lastSheetsBackup.spreadsheetTitle}" at ${lastSheetsBackup.timestamp}.`
                      : '')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Agency Details */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Travel Agency Profile</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Appears in sidebar, printed booking vouchers, and official payment receipts.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Agency Name *</label>
              <input
                type="text"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Agency Logo</label>
              <div className="mt-1 flex items-center gap-3">
                {agencyLogo && (
                  <img src={agencyLogo} alt="Logo preview" className="h-9 w-9 rounded-lg object-cover border" />
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                  <Upload className="h-3.5 w-3.5" />
                  Upload Logo
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {agencyLogo && (
                  <button
                    type="button"
                    onClick={() => setAgencyLogo('')}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Agency Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">WhatsApp Number</label>
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Official Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">GSTIN (Optional)</label>
              <input
                type="text"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Regional & Theme Preferences */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Regional & Display Preferences</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="₹">Indian Rupee (₹)</option>
                <option value="$">US Dollar ($)</option>
                <option value="€">Euro (€)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Date Format</label>
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as DateFormatOption)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="DD-MM-YYYY">DD-MM-YYYY (India Standard)</option>
                <option value="MM-DD-YYYY">MM-DD-YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Theme Preference</label>
              <select
                value={theme}
                onChange={(e) => {
                  const next = e.target.value as 'light' | 'dark';
                  setTheme(next);
                  updateSettings({ ...db.settings, theme: next });
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="light">Light Mode (Blue & White)</option>
                <option value="dark">Dark Mode (Slate Navy)</option>
              </select>
            </div>
          </div>
        </div>

        {/* User Profile & Password */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Administrator Profile & Security</h2>
            </div>
            <button
              type="button"
              onClick={lockApp}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              <Lock className="h-3.5 w-3.5" />
              Test Lock Screen
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">User Full Name</label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Role / Title</label>
              <input
                type="text"
                value={userRole}
                onChange={(e) => setUserRole(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">User Email</label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Change Password (leave blank to keep current)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={requireLogin}
              onChange={(e) => setRequireLogin(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            Require password sign-in whenever the workspace opens
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Save className="h-4 w-4" />
            Save All Settings
          </button>
        </div>
      </form>

      {/* Google Sheets Backup */}
      <GoogleSheetsBackupPanel />

      {/* Storage & Backup Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Database Storage & Backup</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Your agency records are currently stored in <strong>local browser storage (localStorage)</strong> via a modular repository interface. Data is not synced to a remote cloud database. Use JSON export regularly to keep offline backups.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-4 w-4" />
            Export JSON Backup
          </button>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <Upload className="h-4 w-4" />
            Restore JSON Backup
            <input type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
          </label>

          <button
            type="button"
            onClick={() => setConfirmAction('clear_demo')}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <Trash2 className="h-4 w-4" />
            Clear Demo Data Only
          </button>

          <button
            type="button"
            onClick={() => setConfirmAction('reset_demo')}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Demo Data
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction === 'clear_demo'}
        title="Clear Sample Demo Data?"
        message="This will remove all pre-loaded demo records while keeping any bookings, customers, payments, or packages you added yourself."
        confirmLabel="Clear Demo Records"
        onConfirm={() => {
          clearDemoDataOnly();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'reset_demo'}
        title="Reset Entire Database?"
        message="This will replace all current data with the initial 10 customers, 12 bookings, 12 payments, 10 expenses, 8 packages, and 5 staff demo records."
        confirmLabel="Reset All Data"
        onConfirm={() => {
          resetDemoData();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'sync_sheets'}
        title="Sync All Data to Google Sheets?"
        message={`This will serialize all current agency records (${db.bookings.length} bookings, ${db.customers.length} customers, ${db.payments.length} payments, ${db.expenses.length} expenses, ${db.packages.length} packages, ${db.staff.length} staff, ${db.partners.length} partners) and overwrite the backup tabs and JSON_Snapshot in Spreadsheet ID ${DEFAULT_BACKUP_SPREADSHEET_ID}.`}
        confirmLabel="Sync Now"
        onConfirm={executeQuickSync}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
