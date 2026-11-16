import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Edit2, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useTourism } from '../../context/TourismContext';
import { Payment, PaymentMethod } from '../../types/tourism';
import { formatCurrency, formatDate, getTodayISO } from '../../utils/formatters';
import { ConfirmDialog, EmptyState, Modal } from '../ui/CommonUI';

const METHODS: PaymentMethod[] = ['UPI', 'Bank Transfer', 'Cash', 'Card', 'Other'];

export function PaymentsView() {
  const {
    db,
    canDelete,
    focusedRecordId,
    setFocusedRecordId,
    getPaidForBooking,
    getRemainingForBooking,
    addPayment,
    updatePayment,
    deletePayment,
  } = useTourism();

  const { currency, dateFormat } = db.settings;

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<Payment | null>(null);

  // Form State
  const [bookingId, setBookingId] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayISO());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (focusedRecordId) {
      const targetPay = db.payments.find((p) => p.id === focusedRecordId);
      if (targetPay) {
        setReceiptPayment(targetPay);
        setFocusedRecordId(null);
        return;
      }
      if (focusedRecordId.startsWith('PAY_BOOKING:')) {
        const bId = focusedRecordId.replace('PAY_BOOKING:', '');
        openCreateModal(bId);
        setFocusedRecordId(null);
      }
    }
  }, [focusedRecordId, db.payments]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.payments
      .filter((p) => {
        if (methodFilter !== 'All' && p.method !== methodFilter) return false;
        if (dateFrom && p.paymentDate < dateFrom) return false;
        if (dateTo && p.paymentDate > dateTo) return false;
        if (q) {
          return (
            p.id.toLowerCase().includes(q) ||
            p.bookingId.toLowerCase().includes(q) ||
            p.customerName.toLowerCase().includes(q) ||
            p.transactionRef.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [db.payments, search, methodFilter, dateFrom, dateTo]);

  const totalFilteredCollected = useMemo(
    () => filteredPayments.reduce((sum, p) => sum + p.amount, 0),
    [filteredPayments]
  );

  const selectedBooking = useMemo(
    () => db.bookings.find((b) => b.id === bookingId) ?? null,
    [db.bookings, bookingId]
  );

  const openCreateModal = (preselectBookingId?: string) => {
    setEditingPayment(null);
    const defaultBooking =
      db.bookings.find((b) => b.id === preselectBookingId) ??
      db.bookings.find((b) => getRemainingForBooking(b) > 0) ??
      db.bookings[0];

    setBookingId(defaultBooking?.id ?? '');
    setPaymentDate(getTodayISO());
    setAmount(defaultBooking ? String(getRemainingForBooking(defaultBooking) || '') : '');
    setMethod('UPI');
    setTransactionRef('');
    setNotes('');
    setFormError('');
    setFormOpen(true);
  };

  const openEditModal = (p: Payment) => {
    setEditingPayment(p);
    setBookingId(p.bookingId);
    setPaymentDate(p.paymentDate);
    setAmount(String(p.amount));
    setMethod(p.method);
    setTransactionRef(p.transactionRef);
    setNotes(p.notes);
    setFormError('');
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const bk = db.bookings.find((b) => b.id === bookingId);
    if (!bk) return setFormError('Please select a valid booking.');
    const amtNum = Number(amount);
    if (!Number.isFinite(amtNum) || amtNum <= 0) return setFormError('Payment amount must be greater than ₹0.');

    const payload: Omit<Payment, 'id'> = {
      bookingId: bk.id,
      customerId: bk.customerId,
      customerName: bk.customerName,
      paymentDate,
      amount: amtNum,
      method,
      transactionRef: transactionRef.trim(),
      notes: notes.trim(),
      isDemo: editingPayment ? editingPayment.isDemo : false,
    };

    if (editingPayment) {
      updatePayment({ ...payload, id: editingPayment.id });
    } else {
      addPayment(payload);
    }
    setFormOpen(false);
  };

  const receiptBooking = useMemo(() => {
    if (!receiptPayment) return null;
    return db.bookings.find((b) => b.id === receiptPayment.bookingId) ?? null;
  }, [receiptPayment, db.bookings]);

  return (
    <div className="space-y-6">
      {/* Toolbar & Summary */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search payment ID, booking ID, customer, ref..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[11px] text-slate-500">Filtered Collections</p>
              <p className="font-mono text-base font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                {formatCurrency(totalFilteredCollected, currency)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCreateModal()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              Record New Payment
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            aria-label="Filter by payment method"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="All">All Payment Methods</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 shrink-0">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 shrink-0">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        </div>
      </div>

      {/* Payments Table */}
      {filteredPayments.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-6 w-6" />}
          title="No payments found"
          description="Record customer advances and balance settlements against any booking."
          actionLabel="Record New Payment"
          onAction={() => openCreateModal()}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-4 py-3.5">Payment ID</th>
                  <th className="px-4 py-3.5">Booking ID</th>
                  <th className="px-4 py-3.5">Customer</th>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Method & Ref</th>
                  <th className="px-4 py-3.5 text-right">Amount</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                      {p.id}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {p.bookingId}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-slate-100">{p.customerName}</td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {formatDate(p.paymentDate, dateFormat)}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{p.method}</div>
                      <div className="font-mono text-[11px] text-slate-400">{p.transactionRef || '—'}</div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                      {formatCurrency(p.amount, currency)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setReceiptPayment(p)}
                          title="Print Payment Receipt"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          title="Edit Payment"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeletingPayment(p)}
                            title="Delete Payment"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/60"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record / Edit Payment Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingPayment ? `Edit Payment · ${editingPayment.id}` : 'Record New Payment'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Booking ID *</label>
            <select
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {db.bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} · {b.customerName} ({b.destination})
                </option>
              ))}
            </select>
          </div>

          {selectedBooking && (
            <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <span className="text-slate-500">Booking Total</span>
                <p className="font-mono font-bold text-slate-900 dark:text-white">
                  {formatCurrency(selectedBooking.totalCost, currency)}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Already Paid</span>
                <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(getPaidForBooking(selectedBooking.id), currency)}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Outstanding</span>
                <p className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(getRemainingForBooking(selectedBooking), currency)}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Payment Date *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
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
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Transaction Reference
              </label>
              <input
                type="text"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="UPI ID / NEFT / UTR / Receipt No."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Payment Notes</label>
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
              {editingPayment ? 'Save Payment' : 'Record Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Printable Payment Receipt Modal */}
      {receiptPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]">
          <div className="print-only-container w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Official Payment Receipt</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{db.settings.agencyName}</h2>
                <p className="text-xs text-slate-500">{db.settings.address}</p>
                <p className="text-xs text-slate-500">
                  Phone: {db.settings.phone} {db.settings.gstNumber ? `· GSTIN: ${db.settings.gstNumber}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-base font-bold text-slate-900 dark:text-white">{receiptPayment.id}</p>
                <p className="font-mono text-xs text-slate-500">
                  Date: {formatDate(receiptPayment.paymentDate, dateFormat)}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Received From:</span>
                <span className="font-semibold text-slate-900 dark:text-white">{receiptPayment.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Booking Reference:</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {receiptPayment.bookingId}
                  {receiptBooking ? ` (${receiptBooking.destination})` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-medium text-slate-900 dark:text-white">{receiptPayment.method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Transaction Reference:</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {receiptPayment.transactionRef || '—'}
                </span>
              </div>
              {receiptPayment.notes && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500 shrink-0">Notes:</span>
                  <span className="text-right text-slate-700 dark:text-slate-300">{receiptPayment.notes}</span>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Amount Received</span>
                <span className="font-mono text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                  {formatCurrency(receiptPayment.amount, currency)}
                </span>
              </div>
              {receiptBooking && (
                <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-xs dark:border-slate-700">
                  <span className="text-slate-500">Remaining Booking Balance</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {formatCurrency(getRemainingForBooking(receiptBooking), currency)}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between text-xs text-slate-400">
              <span>Computer-generated receipt · {db.settings.agencyName}</span>
              <span>Authorized Signatory</span>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Printer className="h-4 w-4" />
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setReceiptPayment(null)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deletingPayment)}
        title="Delete Payment Record?"
        message={
          deletingPayment
            ? `Delete payment ${deletingPayment.id} of ${formatCurrency(deletingPayment.amount, currency)}? Booking ${deletingPayment.bookingId}'s outstanding balance will update automatically.`
            : ''
        }
        onConfirm={() => {
          if (deletingPayment) {
            deletePayment(deletingPayment.id);
            setDeletingPayment(null);
          }
        }}
        onCancel={() => setDeletingPayment(null)}
      />
    </div>
  );
}
