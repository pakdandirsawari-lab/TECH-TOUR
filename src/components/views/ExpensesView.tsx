import React, { useMemo, useState } from 'react';
import { Edit2, Plus, Receipt, Search, Trash2 } from 'lucide-react';
import { useTourism } from '../../context/TourismContext';
import { Expense, ExpenseCategory, PaymentMethod } from '../../types/tourism';
import { formatCurrency, formatDate, formatMonthYear, getTodayISO } from '../../utils/formatters';
import { ConfirmDialog, EmptyState, Modal } from '../ui/CommonUI';

const CATEGORIES: ExpenseCategory[] = [
  'Hotel',
  'Vehicle',
  'Food',
  'Driver',
  'Guide',
  'Permit',
  'Marketing',
  'Office Rent',
  'Staff Salary',
  'Other',
];

const METHODS: PaymentMethod[] = ['Bank Transfer', 'UPI', 'Cash', 'Card', 'Other'];

export function ExpensesView() {
  const { db, addExpense, updateExpense, deleteExpense } = useTourism();
  const { currency, dateFormat } = db.settings;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [monthFilter, setMonthFilter] = useState<string>('All');

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);

  // Form State
  const [expenseDate, setExpenseDate] = useState(getTodayISO());
  const [category, setCategory] = useState<ExpenseCategory>('Hotel');
  const [description, setDescription] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [relatedBookingId, setRelatedBookingId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bank Transfer');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    db.expenses.forEach((e) => {
      if (e.expenseDate.length >= 7) set.add(e.expenseDate.slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [db.expenses]);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.expenses
      .filter((e) => {
        if (categoryFilter !== 'All' && e.category !== categoryFilter) return false;
        if (monthFilter !== 'All' && !e.expenseDate.startsWith(monthFilter)) return false;
        if (q) {
          return (
            e.id.toLowerCase().includes(q) ||
            e.description.toLowerCase().includes(q) ||
            e.vendorName.toLowerCase().includes(q) ||
            e.category.toLowerCase().includes(q) ||
            (e.relatedBookingId ?? '').toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  }, [db.expenses, search, categoryFilter, monthFilter]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredExpenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredExpenses]);

  const monthlyReport = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of db.expenses) {
      const m = e.expenseDate.slice(0, 7);
      if (m) map.set(m, (map.get(m) ?? 0) + e.amount);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [db.expenses]);

  const filteredTotal = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );

  const openAddModal = () => {
    setEditingExpense(null);
    setExpenseDate(getTodayISO());
    setCategory('Hotel');
    setDescription('');
    setVendorName('');
    setRelatedBookingId('');
    setAmount('');
    setPaymentMethod('Bank Transfer');
    setNotes('');
    setFormError('');
    setFormOpen(true);
  };

  const openEditModal = (e: Expense) => {
    setEditingExpense(e);
    setExpenseDate(e.expenseDate);
    setCategory(e.category);
    setDescription(e.description);
    setVendorName(e.vendorName);
    setRelatedBookingId(e.relatedBookingId ?? '');
    setAmount(String(e.amount));
    setPaymentMethod(e.paymentMethod);
    setNotes(e.notes);
    setFormError('');
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!description.trim()) return setFormError('Expense description is required.');
    if (!vendorName.trim()) return setFormError('Vendor / Payee name is required.');
    const amtNum = Number(amount);
    if (!Number.isFinite(amtNum) || amtNum <= 0) return setFormError('Amount must be greater than ₹0.');

    const payload: Omit<Expense, 'id'> = {
      expenseDate,
      category,
      description: description.trim(),
      vendorName: vendorName.trim(),
      relatedBookingId: relatedBookingId || undefined,
      amount: amtNum,
      paymentMethod,
      notes: notes.trim(),
      isDemo: editingExpense ? editingExpense.isDemo : false,
    };

    if (editingExpense) {
      updateExpense({ ...payload, id: editingExpense.id });
    } else {
      addExpense(payload);
    }
    setFormOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, vendor, booking ID..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[11px] text-slate-500">Filtered Total</p>
              <p className="font-mono text-base font-bold text-slate-900 tabular-nums dark:text-white">
                {formatCurrency(filteredTotal, currency)}
              </p>
            </div>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Add Expense
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by expense category"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="All">All Expense Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            aria-label="Filter by month"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="All">All Months</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatMonthYear(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Category & Monthly Expense Summaries */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Expenses by Category</h3>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {categoryTotals.length === 0 ? (
              <p className="col-span-full text-xs text-slate-400">No expenses in current selection.</p>
            ) : (
              categoryTotals.map(([cat, total]) => (
                <div
                  key={cat}
                  className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{cat}</p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums dark:text-white">
                    {formatCurrency(total, currency)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Monthly Expense Report</h3>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {monthlyReport.length === 0 ? (
              <p className="col-span-full text-xs text-slate-400">No monthly expense data yet.</p>
            ) : (
              monthlyReport.map(([monthKey, total]) => (
                <div
                  key={monthKey}
                  className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {formatMonthYear(monthKey)}
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-amber-600 tabular-nums dark:text-amber-400">
                    {formatCurrency(total, currency)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Expense Table */}
      {filteredExpenses.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="No expenses found"
          description="Record hotel payouts, vehicle rentals, permits, salaries, and office expenses."
          actionLabel="Add Expense"
          onAction={openAddModal}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-4 py-3.5">Expense ID</th>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Description & Vendor</th>
                  <th className="px-4 py-3.5">Booking</th>
                  <th className="px-4 py-3.5 text-right">Amount</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredExpenses.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                      {e.id}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {formatDate(e.expenseDate, dateFormat)}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                      {e.category}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{e.description}</div>
                      <div className="text-xs text-slate-500">
                        {e.vendorName} · {e.paymentMethod}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                      {e.relatedBookingId || 'General'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-slate-900 tabular-nums dark:text-white">
                      {formatCurrency(e.amount, currency)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(e)}
                          title="Edit Expense"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingExpense(e)}
                          title="Delete Expense"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/60"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Expense Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingExpense ? `Edit Expense · ${editingExpense.id}` : 'Add Business Expense'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Expense Date *</label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Description *</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="e.g., Hotel room block settlement or vehicle fuel"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Vendor Name *</label>
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Related Booking ID (Optional)
              </label>
              <select
                value={relatedBookingId}
                onChange={(e) => setRelatedBookingId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">General Overhead (No Booking)</option>
                {db.bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {b.customerName} ({b.destination})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Amount ({currency}) *
              </label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {editingExpense ? 'Save Expense' : 'Record Expense'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingExpense)}
        title="Delete Expense Record?"
        message={
          deletingExpense
            ? `Delete expense ${deletingExpense.id} (${deletingExpense.description} — ${formatCurrency(deletingExpense.amount, currency)})?`
            : ''
        }
        onConfirm={() => {
          if (deletingExpense) {
            deleteExpense(deletingExpense.id);
            setDeletingExpense(null);
          }
        }}
        onCancel={() => setDeletingExpense(null)}
      />
    </div>
  );
}
