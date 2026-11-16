import React, { useMemo } from 'react';
import {
  ArrowUpRight,
  CalendarCheck,
  CreditCard,
  IndianRupee,
  MapPin,
  Plus,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTourism } from '../../context/TourismContext';
import { formatCurrency, formatDate, formatMonthYear } from '../../utils/formatters';
import { DestinationImage, StatusLabel } from '../ui/CommonUI';

const PIE_COLORS = ['#1D4ED8', '#0284C7', '#0D9488', '#D97706', '#4F46E5', '#E11D48', '#7C3AED', '#059669'];

export function DashboardView() {
  const { db, financialSummary, getPaidForBooking, setActiveRoute, navigateToRecord } = useTourism();
  const { currency, dateFormat } = db.settings;

  // Dynamic monthly revenue (payments received) vs expenses
  const monthlyChartData = useMemo(() => {
    const map = new Map<string, { monthKey: string; label: string; revenue: number; expenses: number }>();

    for (const p of db.payments) {
      const key = p.paymentDate.slice(0, 7);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { monthKey: key, label: formatMonthYear(key), revenue: 0, expenses: 0 });
      }
      map.get(key)!.revenue += p.amount;
    }

    for (const e of db.expenses) {
      const key = e.expenseDate.slice(0, 7);
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { monthKey: key, label: formatMonthYear(key), revenue: 0, expenses: 0 });
      }
      map.get(key)!.expenses += e.amount;
    }

    return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [db.payments, db.expenses]);

  // Dynamic bookings by destination
  const destinationPieData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of db.bookings) {
      counts.set(b.destination, (counts.get(b.destination) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [db.bookings]);

  // Recent 5 bookings
  const recentBookings = useMemo(
    () => [...db.bookings].sort((a, b) => b.bookingDate.localeCompare(a.bookingDate)).slice(0, 5),
    [db.bookings]
  );

  // Top packages by booking count & collected revenue
  const topPackages = useMemo(() => {
    const pkgStats = new Map<string, { id: string; name: string; destination: string; bookingsCount: number; collected: number }>();
    for (const pkg of db.packages) {
      pkgStats.set(pkg.id, {
        id: pkg.id,
        name: pkg.name,
        destination: pkg.destination,
        bookingsCount: 0,
        collected: 0,
      });
    }
    for (const b of db.bookings) {
      if (b.status === 'Cancelled') continue;
      const entry = pkgStats.get(b.packageId);
      if (entry) {
        entry.bookingsCount += 1;
        entry.collected += getPaidForBooking(b.id);
      }
    }
    return Array.from(pkgStats.values())
      .sort((a, b) => b.bookingsCount - a.bookingsCount || b.collected - a.collected)
      .slice(0, 5);
  }, [db.packages, db.bookings, getPaidForBooking]);

  // Recent 5 payments
  const recentPayments = useMemo(
    () => [...db.payments].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).slice(0, 5),
    [db.payments]
  );

  // Top 5 expenses
  const topExpenses = useMemo(
    () => [...db.expenses].sort((a, b) => b.amount - a.amount).slice(0, 5),
    [db.expenses]
  );

  const statCards = [
    {
      label: 'Total Bookings',
      value: String(financialSummary.totalBookings),
      note: `${db.bookings.filter((b) => b.status === 'Confirmed').length} confirmed active`,
      icon: CalendarCheck,
      accent: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
      route: 'bookings' as const,
    },
    {
      label: 'Total Customers',
      value: String(financialSummary.totalCustomers),
      note: 'Registered client profiles',
      icon: Users,
      accent: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400',
      route: 'customers' as const,
    },
    {
      label: 'Total Revenue',
      value: formatCurrency(financialSummary.totalRevenue, currency),
      note: 'Actual payments received',
      icon: IndianRupee,
      accent: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
      route: 'payments' as const,
    },
    {
      label: 'Total Expenses',
      value: formatCurrency(financialSummary.totalExpenses, currency),
      note: 'Recorded business payouts',
      icon: Receipt,
      accent: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
      route: 'expenses' as const,
    },
    {
      label: 'Net Profit',
      value: formatCurrency(financialSummary.netProfit, currency),
      note: `Outstanding: ${formatCurrency(financialSummary.totalOutstanding, currency)}`,
      icon: TrendingUp,
      accent:
        financialSummary.netProfit >= 0
          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400'
          : 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400',
      route: 'reports' as const,
    },
  ];

  const hasDemoRecords = db.bookings.some((b) => b.isDemo) || db.customers.some((c) => c.isDemo);

  return (
    <div className="space-y-6">
      {/* Honest Local Storage & Demo Data Indicator */}
      {hasDemoRecords && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          <p>
            <span className="font-semibold">Demo Dataset Active:</span> Sample Indian travel agency records are loaded in local browser storage so you can explore immediately. Add your own bookings or clear demo data anytime in Settings.
          </p>
          <button
            type="button"
            onClick={() => setActiveRoute('settings')}
            className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900 dark:text-blue-300"
          >
            Manage Data
          </button>
        </div>
      )}

      {/* 5 KPI Statistic Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => setActiveRoute(card.route)}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-xs transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{card.label}</span>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.accent}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <p className="font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-white">
                  {card.value}
                </p>
                <p className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="truncate">{card.note}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-blue-600" />
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Travel Destination Banner */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-xs dark:border-slate-800">
        <div className="h-56 sm:h-64 w-full">
          <DestinationImage
            src="/src/assets/images/dest_darjeeling_tea_1794845744114.jpg"
            alt="Darjeeling Kanchenjunga Himalayan Sunrise"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/65 to-slate-950/20" />
        </div>
        <div className="absolute inset-0 flex flex-col justify-center p-6 sm:p-8 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-medium text-sky-300">
            <MapPin className="h-3.5 w-3.5" />
            <span>North Bengal · Sikkim · Meghalaya Operations</span>
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl text-balance">
            {db.settings.agencyName} Operations Hub
          </h2>
          <p className="mt-2 text-sm text-slate-200">
            {db.packages.filter((p) => p.status === 'Active').length} active tour packages ·{' '}
            {db.bookings.filter((b) => b.status === 'Confirmed').length} confirmed upcoming departures ·{' '}
            {formatCurrency(financialSummary.totalOutstanding, currency)} pending collection
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveRoute('bookings')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              New Booking
            </button>
            <button
              type="button"
              onClick={() => setActiveRoute('packages')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25 whitespace-nowrap"
            >
              Browse Packages
            </button>
          </div>
        </div>
      </div>

      {/* Charts Row: Monthly Revenue vs Expenses & Bookings by Destination */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Monthly Revenue vs Expenses</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Actual collections received vs recorded operating payouts
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveRoute('reports')}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Full P&L Report
            </button>
          </div>
          <div className="h-72 w-full">
            {monthlyChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No financial records available yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${currency}${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value ?? 0), currency)}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="revenue" name="Revenue Collected" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Bookings by Destination</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Distribution across tour circuits</p>
          </div>
          <div className="h-72 w-full">
            {destinationPieData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No bookings recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={destinationPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={52}
                    outerRadius={84}
                    paddingAngle={2}
                  >
                    {destinationPieData.map((entry, idx) => (
                      <Cell key={entry.name} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => `${Number(val ?? 0)} booking(s)`} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Recent Bookings & Top Packages */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs xl:col-span-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Recent Bookings</h3>
            <button
              type="button"
              onClick={() => setActiveRoute('bookings')}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              View All
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-5 py-3">Booking ID</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3">Travel Date</th>
                  <th className="px-4 py-3 text-right">Paid / Total</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentBookings.map((b) => {
                  const paid = getPaidForBooking(b.id);
                  return (
                    <tr
                      key={b.id}
                      onClick={() => navigateToRecord('bookings', b.id)}
                      className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <td className="px-5 py-3 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {b.id}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{b.customerName}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{b.destination}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {formatDate(b.travelStartDate, dateFormat)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(paid, currency)}
                        </span>
                        <span className="text-slate-400"> / {formatCurrency(b.totalCost, currency)}</span>
                      </td>
                      <td className="px-5 py-3">
                        <StatusLabel status={b.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Packages Table */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Top Packages</h3>
            <button
              type="button"
              onClick={() => setActiveRoute('packages')}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              All Packages
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {topPackages.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                onClick={() => navigateToRecord('packages', pkg.id)}
                className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{pkg.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {pkg.destination} · {pkg.bookingsCount} booking(s)
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-xs font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                    {formatCurrency(pkg.collected, currency)}
                  </p>
                  <p className="text-[11px] text-slate-400">collected</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Payments, Top Expenses, and Staff Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Payments */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Recent Payments</h3>
            <button
              type="button"
              onClick={() => setActiveRoute('payments')}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Ledger
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{p.customerName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {p.bookingId} · {p.method} · {formatDate(p.paymentDate, dateFormat)}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-emerald-600 tabular-nums dark:text-emerald-400 shrink-0">
                  +{formatCurrency(p.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Expenses */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Top Expenses</h3>
            <button
              type="button"
              onClick={() => setActiveRoute('expenses')}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              All Expenses
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {topExpenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{e.description}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {e.category} · {e.vendorName}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-slate-900 tabular-nums dark:text-slate-100 shrink-0">
                  {formatCurrency(e.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Staff Overview */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Staff Overview</h3>
            <button
              type="button"
              onClick={() => setActiveRoute('staff')}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              Manage Team
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {db.staff.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{s.fullName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {s.designation} · {formatCurrency(s.monthlySalary, currency)}/mo
                  </p>
                </div>
                <StatusLabel status={s.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
