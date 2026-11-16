import React, { useEffect, useState } from 'react';
import {
  Database,
  Download,
  LogOut,
  Save,
  Shield,
  Upload,
} from 'lucide-react';
import { useTourism } from '../../context/TourismContext';
import { DateFormatOption } from '../../types/tourism';
import { GoogleSheetsBackupPanel } from '../backup/GoogleSheetsBackupPanel';

export function SettingsView() {
  const {
    db,
    isAdmin,
    currentUser,
    updateSettings,
    exportBackup,
    importBackup,
    signOut,
    showToast,
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

  useEffect(() => {
    setAgencyName(db.settings.agencyName);
    setAgencyLogo(db.settings.agencyLogo);
    setAddress(db.settings.address);
    setPhone(db.settings.phone);
    setWhatsapp(db.settings.whatsapp);
    setEmail(db.settings.email);
    setGstNumber(db.settings.gstNumber);
    setCurrency(db.settings.currency);
    setDateFormat(db.settings.dateFormat);
    setTheme(db.settings.theme);
  }, [db.settings]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <div className="flex items-center gap-2 font-bold">
          <Shield className="h-5 w-5" />
          <span>Administrator Access Required</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed">
          Only users with the <strong>Admin</strong> role can modify agency settings, cloud database configuration, or user permissions.
        </p>
      </div>
    );
  }

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
    });
  };

  const handleDownloadBackup = () => {
    const json = exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tourism_cloud_snapshot_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('success', 'Cloud snapshot JSON downloaded.');
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Google Sheets Central Cloud DB, Migration & RBAC Users */}
      <div id="google-sheets-cloud-panel">
        <GoogleSheetsBackupPanel />
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Agency Details */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Travel Agency Profile</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Saved in the shared Google Sheets Settings tab — reflects across all connected browsers and printable vouchers.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Signed in as <strong>{currentUser?.name}</strong></span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          </div>

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

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Save className="h-4 w-4" />
            Save Agency Settings to Google Sheets
          </button>
        </div>
      </form>

      {/* JSON Archive Export / Cloud Merge */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Offline JSON Snapshot & Merge</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              All operational records live permanently in <strong>Google Sheets</strong>. You can still download a portable JSON archive anytime or merge an existing JSON backup cleanly into Google Sheets without creating duplicate IDs.
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
            Download Cloud JSON Archive
          </button>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <Upload className="h-4 w-4" />
            Import & Merge JSON into Google Sheets
            <input type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
          </label>
        </div>
      </div>
    </div>
  );
}
