import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Compass,
  CreditCard,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  Lock,
  Menu,
  Package,
  Receipt,
  Search,
  Settings,
  Users,
  UserCheck,
  X,
} from 'lucide-react';
import { useTourism } from '../../context/TourismContext';
import { AppRoute } from '../../types/tourism';
import { formatCurrency, formatDate, getTodayISO } from '../../utils/formatters';
import { GoogleSheetsBackupPanel } from '../backup/GoogleSheetsBackupPanel';
import { Modal } from '../ui/CommonUI';

const NAV_ITEMS: { id: AppRoute; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'bookings', label: 'Bookings', icon: CalendarCheck },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'packages', label: 'Packages', icon: Package },
  { id: 'staff', label: 'Staff & Partners', icon: UserCheck },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const ROUTE_TITLES: Record<AppRoute, string> = {
  dashboard: 'Agency Dashboard',
  bookings: 'Booking Management',
  customers: 'Customer Directory',
  payments: 'Payments & Collections',
  expenses: 'Expense Ledger',
  packages: 'Tour Packages',
  staff: 'Staff & Partners',
  reports: 'Reports & Analytics',
  settings: 'Agency Settings',
};

export function LockScreen() {
  const { db, unlockApp } = useTourism();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockApp(password)) {
      setError('Incorrect password. Default demo password is "admin123" unless changed in Settings.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B1739] p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-white p-8 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Compass className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{db.settings.agencyName}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Tourism Management Console</p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
          <img
            src={db.settings.userProfile.avatar}
            alt={db.settings.userProfile.name}
            referrerPolicy="no-referrer"
            className="h-11 w-11 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {db.settings.userProfile.name}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {db.settings.userProfile.role} · {db.settings.userProfile.email}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Administrator Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="Enter password (demo: admin123)"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              autoFocus
            />
            {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Sign In to Workspace
          </button>
        </form>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { db, activeRoute, setActiveRoute, navigateToRecord, getRemainingForBooking, lockApp } = useTourism();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sheetsBackupOpen, setSheetsBackupOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotificationsOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: { type: string; title: string; subtitle: string; route: AppRoute; id: string }[] = [];

    for (const b of db.bookings) {
      if (
        b.id.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.destination.toLowerCase().includes(q) ||
        b.packageName.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'Booking',
          title: `${b.id} · ${b.customerName}`,
          subtitle: `${b.destination} (${formatDate(b.travelStartDate, db.settings.dateFormat)})`,
          route: 'bookings',
          id: b.id,
        });
      }
    }

    for (const c of db.customers) {
      if (
        c.fullName.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'Customer',
          title: `${c.fullName} (${c.id})`,
          subtitle: `${c.city}, ${c.state} · ${c.phone}`,
          route: 'customers',
          id: c.id,
        });
      }
    }

    for (const p of db.packages) {
      if (p.name.toLowerCase().includes(q) || p.destination.toLowerCase().includes(q)) {
        results.push({
          type: 'Package',
          title: p.name,
          subtitle: `${p.destination} · ${formatCurrency(p.pricePerPerson, db.settings.currency)}/person`,
          route: 'packages',
          id: p.id,
        });
      }
    }

    for (const pay of db.payments) {
      if (
        pay.id.toLowerCase().includes(q) ||
        pay.bookingId.toLowerCase().includes(q) ||
        pay.transactionRef.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'Payment',
          title: `${pay.id} · ${formatCurrency(pay.amount, db.settings.currency)}`,
          subtitle: `${pay.customerName} (${pay.bookingId})`,
          route: 'payments',
          id: pay.id,
        });
      }
    }

    return results.slice(0, 8);
  }, [db.bookings, db.customers, db.packages, db.payments, db.settings.currency, db.settings.dateFormat, searchQuery]);

  const notifications = useMemo(() => {
    const items: { id: string; title: string; detail: string; route: AppRoute; targetId?: string; tone: 'amber' | 'blue' }[] = [];
    const today = getTodayISO();

    // Pending or partially paid active bookings
    for (const b of db.bookings) {
      if (b.status === 'Cancelled') continue;
      const remaining = getRemainingForBooking(b);
      if (remaining > 0) {
        items.push({
          id: `bal-${b.id}`,
          title: `Pending Balance: ${b.id}`,
          detail: `${b.customerName} owes ${formatCurrency(remaining, db.settings.currency)} (${b.destination})`,
          route: 'bookings',
          targetId: b.id,
          tone: 'amber',
        });
      }
      if (b.status === 'Confirmed' && b.travelStartDate >= today) {
        const diffDays = Math.ceil(
          (new Date(b.travelStartDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays <= 14) {
          items.push({
            id: `trip-${b.id}`,
            title: `Upcoming Tour in ${diffDays}d: ${b.destination}`,
            detail: `${b.customerName} · Starts ${formatDate(b.travelStartDate, db.settings.dateFormat)}`,
            route: 'bookings',
            targetId: b.id,
            tone: 'blue',
          });
        }
      }
    }
    return items.slice(0, 8);
  }, [db.bookings, db.settings.currency, db.settings.dateFormat, getRemainingForBooking]);

  const todayFormatted = formatDate(getTodayISO(), db.settings.dateFormat);

  const handleNavClick = (route: AppRoute) => {
    setActiveRoute(route);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-[#F4F7FB] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden no-print"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Dark Navy Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[#0B1739] text-slate-200 transition-all duration-200 lg:static no-print ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Agency Brand */}
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            {db.settings.agencyLogo ? (
              <img
                src={db.settings.agencyLogo}
                alt={db.settings.agencyName}
                className="h-9 w-9 shrink-0 rounded-lg object-cover bg-white"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                <Compass className="h-5 w-5" />
              </div>
            )}
            {!sidebarCollapsed && (
              <span className="truncate font-display text-sm font-bold tracking-tight text-white">
                {db.settings.agencyName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-md p-1 text-slate-400 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom Storage Status & Collapse */}
        <div className="border-t border-white/10 p-3 space-y-2">
          {!sidebarCollapsed && (
            <div className="rounded-lg bg-white/5 px-3 py-2.5 text-xs text-slate-300">
              <div className="flex items-center gap-2 font-medium text-white">
                <Database className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                <span>Local Browser Storage</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Back up anytime to Google Sheets or JSON in Settings.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSheetsBackupOpen(true)}
            title="Backup to Google Sheets"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600/90 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
            {!sidebarCollapsed && <span>Backup to Sheets</span>}
          </button>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={lockApp}
              title="Lock Workspace"
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Lock className="h-3.5 w-3.5 shrink-0" />
              {!sidebarCollapsed && <span>Lock Screen</span>}
            </button>

            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:flex items-center justify-center rounded-lg bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate font-display text-lg font-bold text-slate-900 sm:text-xl dark:text-white">
              {ROUTE_TITLES[activeRoute]}
            </h1>
          </div>

          {/* Search Bar */}
          <div ref={searchRef} className="relative hidden md:block w-full max-w-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Search bookings, customers, packages..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800"
              />
            </div>

            {searchOpen && searchQuery.trim() !== '' && (
              <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {searchResults.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    No matching records for "{searchQuery}"
                  </p>
                ) : (
                  searchResults.map((res) => (
                    <button
                      key={`${res.type}-${res.id}`}
                      type="button"
                      onClick={() => {
                        navigateToRecord(res.route, res.id);
                        setSearchOpen(false);
                        setSearchQuery('');
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{res.title}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{res.subtitle}</p>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        {res.type}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Right Header Controls: Current Date, Notifications, User Profile */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="hidden xl:flex items-center gap-1.5 text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
              <span>Date:</span>
              <span className="text-slate-800 dark:text-slate-200">{todayFormatted}</span>
            </div>

            {/* Notifications */}
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen((o) => !o)}
                aria-label="Operational notifications"
                className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Bell className="h-4 w-4" />
                {notifications.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                    {notifications.length}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white py-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Operational Alerts</span>
                    <span className="text-[11px] text-slate-500">{notifications.length} active</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-slate-500">All collections and trips are up to date.</p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            navigateToRecord(n.route, n.targetId);
                            setNotificationsOpen(false);
                          }}
                          className="w-full px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <p
                            className={`text-xs font-semibold ${
                              n.tone === 'amber'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-blue-700 dark:text-blue-400'
                            }`}
                          >
                            {n.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{n.detail}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile */}
            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white py-1 pl-1.5 pr-2.5 text-left transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <img
                  src={db.settings.userProfile.avatar}
                  alt={db.settings.userProfile.name}
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 rounded-md object-cover"
                />
                <div className="hidden sm:block leading-tight">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                    {db.settings.userProfile.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {db.settings.userProfile.role}
                  </p>
                </div>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-800">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                      {db.settings.userProfile.name}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {db.settings.userProfile.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveRoute('settings');
                      setProfileOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Profile & Agency Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      lockApp();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Lock Screen
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>

      <Modal
        open={sheetsBackupOpen}
        onClose={() => setSheetsBackupOpen(false)}
        title="Backup Agency Data to Google Sheets"
        subtitle="Connect your Google account and push all current records to your spreadsheet."
        maxWidth="max-w-2xl"
      >
        <GoogleSheetsBackupPanel />
      </Modal>
    </div>
  );
}
