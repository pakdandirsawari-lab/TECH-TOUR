import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTourism } from '../../context/TourismContext';
import { exportToCSV, formatCurrency, formatDate, formatMonthYear, getTodayISO } from '../../utils/formatters';

type ReportTab = 'pnl' | 'bookings' | 'rev_exp' | 'dest_pkg' | 'customers_due';
type Granularity = 'daily' | 'monthly' | 'yearly';

export function ReportsView() {
  const { db, getPaidForBooking, getRemainingForBooking, navigateToRecord } = useTourism();
  const { currency, dateFormat } = db.settings;

  const [tab, setTab] = useState<ReportTab>('pnl');
  const [granularity, setGranularity] = useState<Granularity>('monthly');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const applyPreset = (preset: 'all' | 'month' | '30d' | 'year') => {
    const today = getTodayISO();
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (preset === 'month') {
      setDateFrom(`${today.slice(0, 7)}-01`);
      setDateTo(today);
    } else if (preset === '30d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      setDateFrom(d.toISOString().slice(0, 10));
      setDateTo(today);
    } else if (preset === 'year') {
      setDateFrom(`${today.slice(0, 4)}-01-01`);
      setDateTo(today);
    }
  };

  const inRange = (dateStr: string) => {
    if (dateFrom && dateStr < dateFrom) return false;
    if (dateTo && dateStr > dateTo) return false;
    return true;
  };

  const rangedBookings = useMemo(() => db.bookings.filter((b) => inRange(b.bookingDate)), [db.bookings, dateFrom, dateTo]);
  const rangedPayments = useMemo(() => db.payments.filter((p) => inRange(p.paymentDate)), [db.payments, dateFrom, dateTo]);
  const rangedExpenses = useMemo(() => db.expenses.filter((e) => inRange(e.expenseDate)), [db.expenses, dateFrom, dateTo]);

  // Strict Financial Calculations
  const metrics = useMemo(() => {
    const totalRevenue = rangedPayments.reduce((s, p) => s + p.amount, 0);
    const totalExpenses = rangedExpenses.reduce((s, e) => s + e.amount, 0);
    const netProfit = totalRevenue - totalExpenses;
    const activeBookings = rangedBookings.filter((b) => b.status !== 'Cancelled');
    const activeValue = activeBookings.reduce((s, b) => s + b.totalCost, 0);
    const outstanding = activeBookings.reduce((s, b) => s + getRemainingForBooking(b), 0);
    return { totalRevenue, totalExpenses, netProfit, activeValue, outstanding };
  }, [rangedPayments, rangedExpenses, rangedBookings, getRemainingForBooking]);

  // Monthly Profit & Loss rows
  const pnlRows = useMemo(() => {
    const map = new Map<string, { period: string; label: string; revenue: number; expenses: number; profit: number }>();
    for (const p of rangedPayments) {
      const k = p.paymentDate.slice(0, 7);
      if (!map.has(k)) map.set(k, { period: k, label: formatMonthYear(k), revenue: 0, expenses: 0, profit: 0 });
      map.get(k)!.revenue += p.amount;
    }
    for (const e of rangedExpenses) {
      const k = e.expenseDate.slice(0, 7);
      if (!map.has(k)) map.set(k, { period: k, label: formatMonthYear(k), revenue: 0, expenses: 0, profit: 0 });
      map.get(k)!.expenses += e.amount;
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, profit: r.revenue - r.expenses }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }, [rangedPayments, rangedExpenses]);

  // Daily / Monthly / Yearly Booking Aggregation
  const bookingPeriodRows = useMemo(() => {
    const map = new Map<string, { key: string; label: string; count: number; pax: number; totalValue: number; collected: number }>();
    for (const b of rangedBookings) {
      let key = b.bookingDate;
      let label = formatDate(b.bookingDate, dateFormat);
      if (granularity === 'monthly') {
        key = b.bookingDate.slice(0, 7);
        label = formatMonthYear(key);
      } else if (granularity === 'yearly') {
        key = b.bookingDate.slice(0, 4);
        label = key;
      }
      if (!map.has(key)) {
        map.set(key, { key, label, count: 0, pax: 0, totalValue: 0, collected: 0 });
      }
      const row = map.get(key)!;
      row.count += 1;
      row.pax += b.adults + b.children;
      if (b.status !== 'Cancelled') row.totalValue += b.totalCost;
      row.collected += getPaidForBooking(b.id);
    }
    return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [rangedBookings, granularity, dateFormat, getPaidForBooking]);

  // Revenue by Payment Method & Expense by Category
  const revenueByMethod = useMemo(() => {
    const map = new Map<string, { method: string; count: number; amount: number }>();
    for (const p of rangedPayments) {
      if (!map.has(p.method)) map.set(p.method, { method: p.method, count: 0, amount: 0 });
      const row = map.get(p.method)!;
      row.count += 1;
      row.amount += p.amount;
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [rangedPayments]);

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, { category: string; count: number; amount: number }>();
    for (const e of rangedExpenses) {
      if (!map.has(e.category)) map.set(e.category, { category: e.category, count: 0, amount: 0 });
      const row = map.get(e.category)!;
      row.count += 1;
      row.amount += e.amount;
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [rangedExpenses]);

  // Destination & Package wise report
  const destinationStats = useMemo(() => {
    const map = new Map<string, { destination: string; bookings: number; value: number; collected: number }>();
    for (const b of rangedBookings) {
      if (!map.has(b.destination)) {
        map.set(b.destination, { destination: b.destination, bookings: 0, value: 0, collected: 0 });
      }
      const row = map.get(b.destination)!;
      row.bookings += 1;
      if (b.status !== 'Cancelled') row.value += b.totalCost;
      row.collected += getPaidForBooking(b.id);
    }
    return Array.from(map.values()).sort((a, b) => b.bookings - a.bookings);
  }, [rangedBookings, getPaidForBooking]);

  const packageStats = useMemo(() => {
    const map = new Map<string, { packageName: string; destination: string; bookings: number; collected: number }>();
    for (const b of rangedBookings) {
      const k = b.packageName;
      if (!map.has(k)) {
        map.set(k, { packageName: k, destination: b.destination, bookings: 0, collected: 0 });
      }
      const row = map.get(k)!;
      row.bookings += 1;
      row.collected += getPaidForBooking(b.id);
    }
    return Array.from(map.values()).sort((a, b) => b.collected - a.collected);
  }, [rangedBookings, getPaidForBooking]);

  // Customer Spending & Outstanding Payment Report
  const customerReport = useMemo(() => {
    return db.customers
      .map((c) => {
        const cBookings = rangedBookings.filter((b) => b.customerId === c.id);
        const cPayments = rangedPayments.filter((p) => p.customerId === c.id);
        const paid = cPayments.reduce((s, p) => s + p.amount, 0);
        const booked = cBookings.filter((b) => b.status !== 'Cancelled').reduce((s, b) => s + b.totalCost, 0);
        return {
          id: c.id,
          name: c.fullName,
          city: c.city,
          phone: c.phone,
          bookingsCount: cBookings.length,
          bookedValue: booked,
          paidAmount: paid,
        };
      })
      .filter((r) => r.bookingsCount > 0 || r.paidAmount > 0)
      .sort((a, b) => b.paidAmount - a.paidAmount);
  }, [db.customers, rangedBookings, rangedPayments]);

  const outstandingBookings = useMemo(() => {
    return rangedBookings
      .filter((b) => b.status !== 'Cancelled' && getRemainingForBooking(b) > 0)
      .map((b) => ({
        booking: b,
        paid: getPaidForBooking(b.id),
        remaining: getRemainingForBooking(b),
      }))
      .sort((a, b) => b.remaining - a.remaining);
  }, [rangedBookings, getPaidForBooking, getRemainingForBooking]);

  const handleExportCSV = () => {
    if (tab === 'pnl') {
      exportToCSV(
        'profit_and_loss_report',
        ['Month', 'Revenue Received (INR)', 'Expenses (INR)', 'Net Profit (INR)'],
        pnlRows.map((r) => [r.label, r.revenue, r.expenses, r.profit])
      );
    } else if (tab === 'bookings') {
      exportToCSV(
        `bookings_${granularity}_report`,
        ['Period', 'Bookings Count', 'Total Travellers', 'Active Booking Value (INR)', 'Collected (INR)'],
        bookingPeriodRows.map((r) => [r.label, r.count, r.pax, r.totalValue, r.collected])
      );
    } else if (tab === 'rev_exp') {
      exportToCSV(
        'revenue_expense_breakdown',
        ['Type', 'Category / Method', 'Transactions', 'Amount (INR)'],
        [
          ...revenueByMethod.map((r) => ['Revenue', r.method, r.count, r.amount]),
          ...expenseByCategory.map((e) => ['Expense', e.category, e.count, e.amount]),
        ]
      );
    } else if (tab === 'dest_pkg') {
      exportToCSV(
        'destination_package_report',
        ['Type', 'Name', 'Bookings', 'Revenue Collected (INR)'],
        [
          ...destinationStats.map((d) => ['Destination', d.destination, d.bookings, d.collected]),
          ...packageStats.map((p) => ['Package', p.packageName, p.bookings, p.collected]),
        ]
      );
    } else {
      exportToCSV(
        'outstanding_payments_report',
        ['Booking ID', 'Customer', 'Phone', 'Destination', 'Total Cost', 'Paid', 'Outstanding Balance'],
        outstandingBookings.map((o) => [
          o.booking.id,
          o.booking.customerName,
          o.booking.customerPhone,
          o.booking.destination,
          o.booking.totalCost,
          o.paid,
          o.remaining,
        ])
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter & Export Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'pnl', label: 'Profit & Loss' },
                { id: 'bookings', label: 'Booking Reports' },
                { id: 'rev_exp', label: 'Revenue & Expense' },
                { id: 'dest_pkg', label: 'Destination & Package' },
                { id: 'customers_due', label: 'Customers & Outstanding' },
              ] as { id: ReportTab; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Report
            </button>
          </div>
        </div>

        {/* Date Range Filters */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset('all')}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => applyPreset('month')}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => applyPreset('30d')}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset('year')}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              This Year
            </button>
          </div>
        </div>
      </div>

      {/* Printable Report Header */}
      <div className="print-only-container space-y-6">
        {/* Financial Summary Strip */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500">Total Revenue (Payments Received)</p>
            <p className="mt-1 font-mono text-xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
              {formatCurrency(metrics.totalRevenue, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500">Total Expenses</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
              {formatCurrency(metrics.totalExpenses, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500">Net Profit (Revenue − Expenses)</p>
            <p
              className={`mt-1 font-mono text-xl font-bold tabular-nums ${
                metrics.netProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatCurrency(metrics.netProfit, currency)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500">Outstanding Receivables</p>
            <p className="mt-1 font-mono text-xl font-bold text-amber-600 tabular-nums dark:text-amber-400">
              {formatCurrency(metrics.outstanding, currency)}
            </p>
          </div>
        </div>

        {/* TAB 1: Profit & Loss */}
        {tab === 'pnl' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Monthly Profit & Loss Trend</h3>
              <p className="text-xs text-slate-500">
                Revenue reflects actual payments collected; unpaid balances are excluded from revenue.
              </p>
              <div className="mt-4 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pnlRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${currency}${Math.round(v / 1000)}k`}
                    />
                    <Tooltip formatter={(val) => formatCurrency(Number(val ?? 0), currency)} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="revenue" name="Revenue Collected" fill="#16A34A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Net Profit" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                    <th className="px-5 py-3">Month</th>
                    <th className="px-4 py-3 text-right">Revenue Collected</th>
                    <th className="px-4 py-3 text-right">Expenses</th>
                    <th className="px-5 py-3 text-right">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pnlRows.map((r) => (
                    <tr key={r.period}>
                      <td className="px-5 py-3 font-medium">{r.label}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-emerald-600 tabular-nums">
                        {formatCurrency(r.revenue, currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums">
                        {formatCurrency(r.expenses, currency)}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-mono text-xs font-bold tabular-nums ${
                          r.profit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {formatCurrency(r.profit, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Daily / Monthly / Yearly Booking Report */}
        {tab === 'bookings' && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {granularity.charAt(0).toUpperCase() + granularity.slice(1)} Booking Report
              </h3>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800 no-print">
                {(['daily', 'monthly', 'yearly'] as Granularity[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGranularity(g)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold capitalize ${
                      granularity === g
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                    <th className="px-5 py-3">Period</th>
                    <th className="px-4 py-3 text-right">Bookings</th>
                    <th className="px-4 py-3 text-right">Travellers</th>
                    <th className="px-4 py-3 text-right">Active Booking Value</th>
                    <th className="px-5 py-3 text-right">Payments Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {bookingPeriodRows.map((r) => (
                    <tr key={r.key}>
                      <td className="px-5 py-3 font-mono text-xs font-semibold">{r.label}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">{r.count}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">{r.pax}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums">
                        {formatCurrency(r.totalValue, currency)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-bold text-emerald-600 tabular-nums">
                        {formatCurrency(r.collected, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Revenue & Expense Breakdown */}
        {tab === 'rev_exp' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Revenue Report by Payment Method</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50">
                    <th className="px-5 py-3">Payment Method</th>
                    <th className="px-4 py-3 text-right">Receipts</th>
                    <th className="px-5 py-3 text-right">Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {revenueByMethod.map((r) => (
                    <tr key={r.method}>
                      <td className="px-5 py-3 font-medium">{r.method}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{r.count}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-bold text-emerald-600 tabular-nums">
                        {formatCurrency(r.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Expense Report by Category</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50">
                    <th className="px-5 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Entries</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {expenseByCategory.map((e) => (
                    <tr key={e.category}>
                      <td className="px-5 py-3 font-medium">{e.category}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{e.count}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-bold tabular-nums">
                        {formatCurrency(e.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: Destination & Package Reports */}
        {tab === 'dest_pkg' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Destination-Wise Booking Report</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50">
                    <th className="px-5 py-3">Destination</th>
                    <th className="px-4 py-3 text-right">Bookings</th>
                    <th className="px-5 py-3 text-right">Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {destinationStats.map((d) => (
                    <tr key={d.destination}>
                      <td className="px-5 py-3 font-medium">{d.destination}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{d.bookings}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-bold text-emerald-600 tabular-nums">
                        {formatCurrency(d.collected, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Package-Wise Booking Report</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50">
                    <th className="px-5 py-3">Package</th>
                    <th className="px-4 py-3 text-right">Bookings</th>
                    <th className="px-5 py-3 text-right">Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {packageStats.map((p) => (
                    <tr key={p.packageName}>
                      <td className="px-5 py-3">
                        <div className="font-medium">{p.packageName}</div>
                        <div className="text-xs text-slate-500">{p.destination}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{p.bookings}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs font-bold text-emerald-600 tabular-nums">
                        {formatCurrency(p.collected, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: Customer & Outstanding Payments Report */}
        {tab === 'customers_due' && (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Outstanding Payment Report ({outstandingBookings.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50">
                      <th className="px-5 py-3">Booking ID</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Travel Start</th>
                      <th className="px-4 py-3 text-right">Total Cost</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Outstanding</th>
                      <th className="px-5 py-3 text-right no-print">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {outstandingBookings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-6 text-center text-xs text-slate-500">
                          All active bookings are fully paid.
                        </td>
                      </tr>
                    ) : (
                      outstandingBookings.map((o) => (
                        <tr key={o.booking.id}>
                          <td className="px-5 py-3 font-mono text-xs font-bold text-blue-600">{o.booking.id}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{o.booking.customerName}</div>
                            <div className="text-xs text-slate-500">{o.booking.customerPhone}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            {formatDate(o.booking.travelStartDate, dateFormat)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                            {formatCurrency(o.booking.totalCost, currency)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600 tabular-nums">
                            {formatCurrency(o.paid, currency)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs font-bold text-amber-600 tabular-nums">
                            {formatCurrency(o.remaining, currency)}
                          </td>
                          <td className="px-5 py-3 text-right no-print">
                            <button
                              type="button"
                              onClick={() => navigateToRecord('payments', `PAY_BOOKING:${o.booking.id}`)}
                              className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300"
                            >
                              Record Payment
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Customer Report</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50">
                      <th className="px-5 py-3">Customer</th>
                      <th className="px-4 py-3">City</th>
                      <th className="px-4 py-3 text-right">Bookings</th>
                      <th className="px-4 py-3 text-right">Booked Value</th>
                      <th className="px-5 py-3 text-right">Actual Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {customerReport.map((c) => (
                      <tr key={c.id}>
                        <td className="px-5 py-3">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-slate-500">{c.phone}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{c.city || '—'}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{c.bookingsCount}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                          {formatCurrency(c.bookedValue, currency)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs font-bold text-emerald-600 tabular-nums">
                          {formatCurrency(c.paidAmount, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
