import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Eye, Mail, MapPin, Phone, Plus, Search, Trash2, Users } from 'lucide-react';
import { useTourism } from '../../context/TourismContext';
import { Customer } from '../../types/tourism';
import { formatCurrency, formatDate, isValidEmail, isValidPhone } from '../../utils/formatters';
import { ConfirmDialog, EmptyState, Modal, StatusLabel } from '../ui/CommonUI';

export function CustomersView() {
  const {
    db,
    focusedRecordId,
    setFocusedRecordId,
    getCustomerStats,
    getPaidForBooking,
    addCustomer,
    updateCustomer,
    deleteCustomer,
  } = useTourism();

  const { currency, dateFormat } = db.settings;

  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (focusedRecordId) {
      const target = db.customers.find((c) => c.id === focusedRecordId);
      if (target) {
        setViewingCustomer(target);
        setFocusedRecordId(null);
      }
    }
  }, [focusedRecordId, db.customers]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.customers.filter((c) => {
      if (!q) return true;
      return (
        c.fullName.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    });
  }, [db.customers, search]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setFullName('');
    setPhone('');
    setWhatsapp('');
    setEmail('');
    setAddress('');
    setCity('');
    setStateName('');
    setNotes('');
    setFormError('');
    setFormOpen(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setFullName(c.fullName);
    setPhone(c.phone);
    setWhatsapp(c.whatsapp);
    setEmail(c.email);
    setAddress(c.address);
    setCity(c.city);
    setStateName(c.state);
    setNotes(c.notes);
    setFormError('');
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!fullName.trim()) return setFormError('Full name is required.');
    if (!isValidPhone(phone)) return setFormError('Enter a valid 10-digit phone number.');
    if (!isValidEmail(email)) return setFormError('Enter a valid email address.');

    const payload = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim() || phone.trim(),
      email: email.trim(),
      address: address.trim(),
      city: city.trim(),
      state: stateName.trim(),
      notes: notes.trim(),
      isDemo: editingCustomer ? editingCustomer.isDemo : false,
    };

    if (editingCustomer) {
      updateCustomer({ ...payload, id: editingCustomer.id, createdAt: editingCustomer.createdAt });
    } else {
      addCustomer(payload);
    }
    setFormOpen(false);
  };

  const customerBookings = useMemo(() => {
    if (!viewingCustomer) return [];
    return db.bookings
      .filter((b) => b.customerId === viewingCustomer.id)
      .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate));
  }, [viewingCustomer, db.bookings]);

  const customerPayments = useMemo(() => {
    if (!viewingCustomer) return [];
    return db.payments
      .filter((p) => p.customerId === viewingCustomer.id)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [viewingCustomer, db.payments]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name, ID, phone, city..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Customer
        </button>
      </div>

      {/* Customers Table */}
      {filteredCustomers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No customers found"
          description="Add your first traveller profile to track bookings, preferences, and payment history."
          actionLabel="Add Customer"
          onAction={openAddModal}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-4 py-3.5">Customer ID</th>
                  <th className="px-4 py-3.5">Full Name</th>
                  <th className="px-4 py-3.5">Contact</th>
                  <th className="px-4 py-3.5">Location</th>
                  <th className="px-4 py-3.5 text-right">Bookings</th>
                  <th className="px-4 py-3.5 text-right">Total Spending</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCustomers.map((c) => {
                  const stats = getCustomerStats(c.id);
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                        {c.id}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{c.fullName}</div>
                        {c.notes && (
                          <div className="max-w-[220px] truncate text-xs text-slate-400">{c.notes}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{c.phone}</div>
                        <div className="text-slate-500">{c.email || '—'}</div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold tabular-nums">
                        {stats.totalBookings}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                        {formatCurrency(stats.totalSpent, currency)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingCustomer(c)}
                            title="View Customer Profile"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            title="Edit Customer"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingCustomer(c)}
                            title="Delete Customer"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/60"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingCustomer ? `Edit Customer · ${editingCustomer.id}` : 'Add New Customer'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Full Name *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Phone Number *</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="+91 98XXXXXXXX"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">WhatsApp Number</label>
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="Same as phone if blank"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">State</label>
              <input
                type="text"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
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
              {editingCustomer ? 'Save Changes' : 'Add Customer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Profile Modal */}
      <Modal
        open={Boolean(viewingCustomer)}
        onClose={() => setViewingCustomer(null)}
        title={viewingCustomer ? `${viewingCustomer.fullName} · ${viewingCustomer.id}` : ''}
        subtitle={viewingCustomer ? `Registered ${formatDate(viewingCustomer.createdAt, dateFormat)}` : undefined}
        maxWidth="max-w-3xl"
      >
        {viewingCustomer && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-4 sm:col-span-2 dark:border-slate-800">
                <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-blue-600" />
                    <span>
                      Phone: <strong>{viewingCustomer.phone}</strong> · WhatsApp: <strong>{viewingCustomer.whatsapp || viewingCustomer.phone}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-blue-600" />
                    <span>{viewingCustomer.email || 'No email recorded'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-blue-600" />
                    <span>
                      {[viewingCustomer.address, viewingCustomer.city, viewingCustomer.state]
                        .filter(Boolean)
                        .join(', ') || 'No address recorded'}
                    </span>
                  </div>
                  {viewingCustomer.notes && (
                    <p className="pt-1 text-slate-500">Notes: {viewingCustomer.notes}</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <p className="text-xs text-slate-500">Total Bookings</p>
                <p className="mt-0.5 font-mono text-xl font-bold text-slate-900 dark:text-white">
                  {getCustomerStats(viewingCustomer.id).totalBookings}
                </p>
                <p className="mt-3 text-xs text-slate-500">Total Spending (Paid)</p>
                <p className="mt-0.5 font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(getCustomerStats(viewingCustomer.id).totalSpent, currency)}
                </p>
              </div>
            </div>

            {/* Booking History */}
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Booking History ({customerBookings.length})
              </h4>
              {customerBookings.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No tours booked yet.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                        <th className="px-3 py-2">Booking ID</th>
                        <th className="px-3 py-2">Destination</th>
                        <th className="px-3 py-2">Travel Date</th>
                        <th className="px-3 py-2 text-right">Paid / Total</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {customerBookings.map((b) => (
                        <tr key={b.id}>
                          <td className="px-3 py-2 font-mono font-bold text-blue-600">{b.id}</td>
                          <td className="px-3 py-2">{b.destination}</td>
                          <td className="px-3 py-2 font-mono">{formatDate(b.travelStartDate, dateFormat)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">
                            {formatCurrency(getPaidForBooking(b.id), currency)} / {formatCurrency(b.totalCost, currency)}
                          </td>
                          <td className="px-3 py-2">
                            <StatusLabel status={b.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Payment History */}
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Payment History ({customerPayments.length})
              </h4>
              {customerPayments.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No payments received yet.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                        <th className="px-3 py-2">Payment ID</th>
                        <th className="px-3 py-2">Booking</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Method</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {customerPayments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-3 py-2 font-mono font-semibold">{p.id}</td>
                          <td className="px-3 py-2 font-mono">{p.bookingId}</td>
                          <td className="px-3 py-2 font-mono">{formatDate(p.paymentDate, dateFormat)}</td>
                          <td className="px-3 py-2">{p.method}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-emerald-600 tabular-nums">
                            {formatCurrency(p.amount, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingCustomer)}
        title="Delete Customer?"
        message={
          deletingCustomer
            ? `Delete ${deletingCustomer.fullName} (${deletingCustomer.id}) from the customer directory? Existing historical booking records will remain intact.`
            : ''
        }
        onConfirm={() => {
          if (deletingCustomer) {
            deleteCustomer(deletingCustomer.id);
            setDeletingCustomer(null);
          }
        }}
        onCancel={() => setDeletingCustomer(null)}
      />
    </div>
  );
}
