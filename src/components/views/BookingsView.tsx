import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Edit2,
  Eye,
  Plus,
  Printer,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useTourism } from '../../context/TourismContext';
import { Booking, BookingStatus, PaymentMethod } from '../../types/tourism';
import {
  formatCurrency,
  formatDate,
  generateBookingId,
  getTodayISO,
  isValidEmail,
  isValidPhone,
} from '../../utils/formatters';
import { ConfirmDialog, EmptyState, Modal, StatusLabel } from '../ui/CommonUI';

const STATUS_OPTIONS: BookingStatus[] = ['Confirmed', 'Pending', 'Completed', 'Cancelled'];
const PAYMENT_METHODS: PaymentMethod[] = ['UPI', 'Bank Transfer', 'Cash', 'Card', 'Other'];

export function BookingsView() {
  const {
    db,
    canDelete,
    focusedRecordId,
    setFocusedRecordId,
    getPaidForBooking,
    getRemainingForBooking,
    addBooking,
    updateBooking,
    deleteBooking,
    addCustomer,
    addPayment,
    showToast,
  } = useTourism();

  const { currency, dateFormat } = db.settings;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [destinationFilter, setDestinationFilter] = useState<string>('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [deletingBooking, setDeletingBooking] = useState<Booking | null>(null);

  // Quick inline payment inside Viewing Modal
  const [quickPayOpen, setQuickPayOpen] = useState(false);
  const [quickPayAmount, setQuickPayAmount] = useState('');
  const [quickPayMethod, setQuickPayMethod] = useState<PaymentMethod>('UPI');
  const [quickPayRef, setQuickPayRef] = useState('');
  const [quickPayDate, setQuickPayDate] = useState(getTodayISO());

  // Booking Form State
  const [bookingDate, setBookingDate] = useState(getTodayISO());
  const [customerId, setCustomerId] = useState('');
  const [quickCustomerMode, setQuickCustomerMode] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustCity, setNewCustCity] = useState('');

  const [packageId, setPackageId] = useState('');
  const [destination, setDestination] = useState('');
  const [packageName, setPackageName] = useState('');
  const [travelStartDate, setTravelStartDate] = useState(getTodayISO());
  const [travelEndDate, setTravelEndDate] = useState(getTodayISO());
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [vehicleDetails, setVehicleDetails] = useState('');
  const [hotelDetails, setHotelDetails] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [advancePayment, setAdvancePayment] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>('UPI');
  const [advanceRef, setAdvanceRef] = useState('');
  const [status, setStatus] = useState<BookingStatus>('Confirmed');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Open detail modal if navigated from Dashboard / Global Search / Packages
  useEffect(() => {
    if (focusedRecordId) {
      const targetBooking = db.bookings.find((b) => b.id === focusedRecordId);
      if (targetBooking) {
        setViewingBooking(targetBooking);
        setFocusedRecordId(null);
        return;
      }
      // Check if focusedRecordId is a packageId shortcut ("NEW_FROM_PKG:PKG-101")
      if (focusedRecordId.startsWith('NEW_FROM_PKG:')) {
        const pkgId = focusedRecordId.replace('NEW_FROM_PKG:', '');
        openCreateModal(pkgId);
        setFocusedRecordId(null);
      }
    }
  }, [focusedRecordId, db.bookings]);

  // Keep viewingBooking fresh when payments change
  const activeViewingBooking = useMemo(() => {
    if (!viewingBooking) return null;
    return db.bookings.find((b) => b.id === viewingBooking.id) ?? null;
  }, [viewingBooking, db.bookings]);

  const destinations = useMemo(() => {
    const set = new Set<string>();
    db.bookings.forEach((b) => set.add(b.destination));
    db.packages.forEach((p) => set.add(p.destination));
    return Array.from(set).sort();
  }, [db.bookings, db.packages]);

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.bookings
      .filter((b) => {
        if (statusFilter !== 'All' && b.status !== statusFilter) return false;
        if (destinationFilter !== 'All' && b.destination !== destinationFilter) return false;
        if (dateFrom && b.travelStartDate < dateFrom) return false;
        if (dateTo && b.travelStartDate > dateTo) return false;
        if (q) {
          const hit =
            b.id.toLowerCase().includes(q) ||
            b.customerName.toLowerCase().includes(q) ||
            b.customerPhone.toLowerCase().includes(q) ||
            b.destination.toLowerCase().includes(q) ||
            b.packageName.toLowerCase().includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate));
  }, [db.bookings, search, statusFilter, destinationFilter, dateFrom, dateTo]);

  const previewBookingId = useMemo(
    () => (editingBooking ? editingBooking.id : generateBookingId(db.bookings.map((b) => b.id))),
    [editingBooking, db.bookings]
  );

  const openCreateModal = (preselectPkgId?: string) => {
    setEditingBooking(null);
    setBookingDate(getTodayISO());
    setCustomerId(db.customers[0]?.id ?? '');
    setQuickCustomerMode(db.customers.length === 0);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustEmail('');
    setNewCustCity('');

    const pkg = db.packages.find((p) => p.id === preselectPkgId) ?? db.packages[0];
    if (pkg) {
      setPackageId(pkg.id);
      setPackageName(pkg.name);
      setDestination(pkg.destination);
      setVehicleDetails(pkg.vehicleDetails);
      setHotelDetails(pkg.hotelDetails);
      setTotalCost(String(pkg.pricePerPerson * 2));
      const start = getTodayISO();
      const endDateObj = new Date(start);
      endDateObj.setDate(endDateObj.getDate() + Math.max(1, pkg.durationDays - 1));
      setTravelStartDate(start);
      setTravelEndDate(endDateObj.toISOString().slice(0, 10));
    } else {
      setPackageId('');
      setPackageName('');
      setDestination('');
      setVehicleDetails('');
      setHotelDetails('');
      setTotalCost('');
      setTravelStartDate(getTodayISO());
      setTravelEndDate(getTodayISO());
    }

    setAdults(2);
    setChildren(0);
    setRooms(1);
    setAdvancePayment('0');
    setAdvanceMethod('UPI');
    setAdvanceRef('');
    setStatus('Confirmed');
    setNotes('');
    setFormError('');
    setFormOpen(true);
  };

  const openEditModal = (b: Booking) => {
    setEditingBooking(b);
    setBookingDate(b.bookingDate);
    setCustomerId(b.customerId);
    setQuickCustomerMode(false);
    setPackageId(b.packageId);
    setPackageName(b.packageName);
    setDestination(b.destination);
    setTravelStartDate(b.travelStartDate);
    setTravelEndDate(b.travelEndDate);
    setAdults(b.adults);
    setChildren(b.children);
    setRooms(b.rooms);
    setVehicleDetails(b.vehicleDetails);
    setHotelDetails(b.hotelDetails);
    setTotalCost(String(b.totalCost));
    setStatus(b.status);
    setNotes(b.notes);
    setFormError('');
    setFormOpen(true);
  };

  const handlePackageChange = (newPkgId: string) => {
    setPackageId(newPkgId);
    const pkg = db.packages.find((p) => p.id === newPkgId);
    if (pkg) {
      setPackageName(pkg.name);
      setDestination(pkg.destination);
      setHotelDetails(pkg.hotelDetails);
      setVehicleDetails(pkg.vehicleDetails);
      const estimated = Math.round(pkg.pricePerPerson * (adults + children * 0.5));
      setTotalCost(String(estimated));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    let resolvedCustomerId = customerId;
    let resolvedCustomerName = '';
    let resolvedCustomerPhone = '';
    let resolvedCustomerEmail = '';

    if (quickCustomerMode) {
      if (!newCustName.trim()) return setFormError('Please enter customer full name.');
      if (!isValidPhone(newCustPhone)) return setFormError('Please enter a valid 10-digit phone number.');
      if (!isValidEmail(newCustEmail)) return setFormError('Please enter a valid email address.');
    } else {
      const cust = db.customers.find((c) => c.id === customerId);
      if (!cust) return setFormError('Please select a customer.');
      resolvedCustomerName = cust.fullName;
      resolvedCustomerPhone = cust.phone;
      resolvedCustomerEmail = cust.email;
    }

    if (!destination.trim()) return setFormError('Tour destination is required.');
    if (!packageName.trim()) return setFormError('Package name is required.');
    if (travelEndDate < travelStartDate) return setFormError('Travel end date cannot be earlier than start date.');
    const costNum = Number(totalCost);
    if (!Number.isFinite(costNum) || costNum <= 0) return setFormError('Total tour cost must be greater than ₹0.');

    const advNum = Number(advancePayment) || 0;
    if (!editingBooking && advNum < 0) return setFormError('Advance payment cannot be negative.');
    if (!editingBooking && advNum > costNum) {
      return setFormError('Advance payment cannot exceed total tour cost.');
    }

    if (quickCustomerMode) {
      const createdCust = addCustomer({
        fullName: newCustName.trim(),
        phone: newCustPhone.trim(),
        whatsapp: newCustPhone.trim(),
        email: newCustEmail.trim(),
        address: '',
        city: newCustCity.trim() || 'Siliguri',
        state: 'West Bengal',
        notes: 'Created inline during booking.',
        isDemo: false,
      });
      resolvedCustomerId = createdCust.id;
      resolvedCustomerName = createdCust.fullName;
      resolvedCustomerPhone = createdCust.phone;
      resolvedCustomerEmail = createdCust.email;
    }

    const payload: Omit<Booking, 'id'> = {
      bookingDate,
      customerId: resolvedCustomerId,
      customerName: resolvedCustomerName,
      customerPhone: resolvedCustomerPhone,
      customerEmail: resolvedCustomerEmail,
      destination: destination.trim(),
      packageId,
      packageName: packageName.trim(),
      travelStartDate,
      travelEndDate,
      adults: Math.max(1, Number(adults) || 1),
      children: Math.max(0, Number(children) || 0),
      rooms: Math.max(1, Number(rooms) || 1),
      vehicleDetails: vehicleDetails.trim(),
      hotelDetails: hotelDetails.trim(),
      totalCost: costNum,
      status,
      notes: notes.trim(),
      isDemo: editingBooking ? editingBooking.isDemo : false,
    };

    if (editingBooking) {
      updateBooking({ ...payload, id: editingBooking.id });
    } else {
      addBooking(payload, advNum, advanceMethod, advanceRef.trim());
    }
    setFormOpen(false);
  };

  const handleQuickPaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeViewingBooking) return;
    const amt = Number(quickPayAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('error', 'Enter a valid payment amount greater than ₹0.');
      return;
    }
    addPayment({
      bookingId: activeViewingBooking.id,
      customerId: activeViewingBooking.customerId,
      customerName: activeViewingBooking.customerName,
      paymentDate: quickPayDate,
      amount: amt,
      method: quickPayMethod,
      transactionRef: quickPayRef.trim() || `TXN-${Date.now().toString().slice(-6)}`,
      notes: `Installment recorded from booking ${activeViewingBooking.id}`,
      isDemo: false,
    });
    setQuickPayOpen(false);
    setQuickPayAmount('');
    setQuickPayRef('');
  };

  const linkedPayments = useMemo(() => {
    if (!activeViewingBooking) return [];
    return db.payments
      .filter((p) => p.bookingId === activeViewingBooking.id)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [activeViewingBooking, db.payments]);

  const linkedExpenses = useMemo(() => {
    if (!activeViewingBooking) return [];
    return db.expenses.filter((e) => e.relatedBookingId === activeViewingBooking.id);
  }, [activeViewingBooking, db.expenses]);

  const existingPaidOnEdit = editingBooking ? getPaidForBooking(editingBooking.id) : 0;
  const computedRemainingPreview = editingBooking
    ? Math.max(0, (Number(totalCost) || 0) - existingPaidOnEdit)
    : Math.max(0, (Number(totalCost) || 0) - (Number(advancePayment) || 0));

  return (
    <div className="space-y-6">
      {/* Action & Filter Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search booking ID, customer, destination, package..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Add New Booking
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            value={destinationFilter}
            onChange={(e) => setDestinationFilter(e.target.value)}
            aria-label="Filter by destination"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="All">All Destinations</option>
            {destinations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by booking status"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="All">All Statuses</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {st}
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

      {/* Bookings Table */}
      {filteredBookings.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title="No bookings match your filters"
          description="Create a new tour booking or clear your active search and date filters."
          actionLabel="Add New Booking"
          onAction={() => openCreateModal()}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                  <th className="px-4 py-3.5">Booking ID</th>
                  <th className="px-4 py-3.5">Customer</th>
                  <th className="px-4 py-3.5">Package & Destination</th>
                  <th className="px-4 py-3.5">Travel Dates</th>
                  <th className="px-4 py-3.5 text-right">Total Cost</th>
                  <th className="px-4 py-3.5 text-right">Paid</th>
                  <th className="px-4 py-3.5 text-right">Balance</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredBookings.map((b) => {
                  const paid = getPaidForBooking(b.id);
                  const balance = getRemainingForBooking(b);
                  return (
                    <tr key={b.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3.5">
                        <div className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">{b.id}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {formatDate(b.bookingDate, dateFormat)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{b.customerName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{b.customerPhone}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{b.destination}</div>
                        <div className="max-w-[210px] truncate text-xs text-slate-500 dark:text-slate-400">
                          {b.packageName}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                        <div>{formatDate(b.travelStartDate, dateFormat)}</div>
                        <div className="text-[11px] text-slate-400">to {formatDate(b.travelEndDate, dateFormat)}</div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatCurrency(b.totalCost, currency)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(paid, currency)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold tabular-nums">
                        <span className={balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}>
                          {formatCurrency(balance, currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusLabel status={b.status} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingBooking(b)}
                            title="View & Print Booking"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(b)}
                            title="Edit Booking"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setDeletingBooking(b)}
                              title="Delete Booking"
                              className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
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

      {/* Create / Edit Booking Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingBooking ? `Edit Booking · ${editingBooking.id}` : `New Booking · ${previewBookingId}`}
        subtitle="Tour cost and remaining balance are synchronized automatically with recorded payments."
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {formError}
            </div>
          )}

          {/* Row 1: Booking ID, Booking Date, Status */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Booking ID</label>
              <input
                type="text"
                value={previewBookingId}
                disabled
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Booking Date</label>
              <input
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Booking Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BookingStatus)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Customer Selection or Inline Quick Add */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Customer Information</label>
              {!editingBooking && (
                <button
                  type="button"
                  onClick={() => setQuickCustomerMode((m) => !m)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {quickCustomerMode ? 'Select Existing Customer' : 'Quick Add New Customer'}
                </button>
              )}
            </div>

            {!quickCustomerMode ? (
              <div className="mt-2.5">
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  {db.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.phone}) · {c.city}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Full Name *"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="Phone Number *"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <input
                  type="email"
                  placeholder="Email Address"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <input
                  type="text"
                  placeholder="City"
                  value={newCustCity}
                  onChange={(e) => setNewCustCity(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            )}
          </div>

          {/* Package & Destination */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Tour Package</label>
              <select
                value={packageId}
                onChange={(e) => handlePackageChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Custom / Manual Package</option>
                {db.packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.destination} · {formatCurrency(p.pricePerPerson, currency)}/person)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Tour Destination *</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                required
                placeholder="e.g., Darjeeling"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Travel Dates & Pax */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Start Date *</label>
              <input
                type="date"
                value={travelStartDate}
                onChange={(e) => setTravelStartDate(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">End Date *</label>
              <input
                type="date"
                value={travelEndDate}
                onChange={(e) => setTravelEndDate(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Adults</label>
              <input
                type="number"
                min={1}
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Children</label>
              <input
                type="number"
                min={0}
                value={children}
                onChange={(e) => setChildren(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Rooms</label>
              <input
                type="number"
                min={1}
                value={rooms}
                onChange={(e) => setRooms(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Hotel & Vehicle Details */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Hotel Details</label>
              <input
                type="text"
                value={hotelDetails}
                onChange={(e) => setHotelDetails(e.target.value)}
                placeholder="Hotel name & room plan"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Vehicle Details</label>
              <input
                type="text"
                value={vehicleDetails}
                onChange={(e) => setVehicleDetails(e.target.value)}
                placeholder="Cab type & reg number"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Financials */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Total Tour Cost ({currency}) *
                </label>
                <input
                  type="number"
                  min={1}
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              {!editingBooking ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Advance Payment ({currency})
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={advancePayment}
                    onChange={(e) => setAdvancePayment(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Payments Received ({currency})
                  </label>
                  <input
                    type="text"
                    value={formatCurrency(existingPaidOnEdit, currency)}
                    disabled
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-sm font-semibold text-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Remaining Payment ({currency})
                </label>
                <input
                  type="text"
                  value={formatCurrency(computedRemainingPreview, currency)}
                  disabled
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-sm font-bold text-amber-700 dark:border-slate-700 dark:bg-slate-800 dark:text-amber-400"
                />
              </div>
            </div>

            {!editingBooking && Number(advancePayment) > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Advance Payment Method
                  </label>
                  <select
                    value={advanceMethod}
                    onChange={(e) => setAdvanceMethod(e.target.value as PaymentMethod)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Transaction Reference
                  </label>
                  <input
                    type="text"
                    value={advanceRef}
                    onChange={(e) => setAdvanceRef(e.target.value)}
                    placeholder="UPI / NEFT / Receipt ref"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Special Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Pickup timings, dietary notes, room preferences..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {editingBooking ? 'Save Changes' : 'Create Booking'}
            </button>
          </div>
        </form>
      </Modal>

      {/* View & Print Booking Details Modal */}
      {activeViewingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]">
          <div className="print-only-container w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            {/* Printable Agency Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Tour Booking Confirmation</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{db.settings.agencyName}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{db.settings.address}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {db.settings.phone} · {db.settings.email}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg font-bold text-slate-900 dark:text-white">{activeViewingBooking.id}</p>
                <p className="text-xs text-slate-500">
                  Booked: {formatDate(activeViewingBooking.bookingDate, dateFormat)}
                </p>
                <div className="mt-1.5">
                  <StatusLabel status={activeViewingBooking.status} />
                </div>
              </div>
            </div>

            {/* Guest & Tour Info */}
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="text-xs font-bold text-slate-500">Guest Details</h3>
                <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                  {activeViewingBooking.customerName}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{activeViewingBooking.customerPhone}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{activeViewingBooking.customerEmail}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Travellers: {activeViewingBooking.adults} Adult(s), {activeViewingBooking.children} Child(ren) ·{' '}
                  {activeViewingBooking.rooms} Room(s)
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="text-xs font-bold text-slate-500">Tour & Logistics</h3>
                <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">
                  {activeViewingBooking.packageName} ({activeViewingBooking.destination})
                </p>
                <p className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-300">
                  {formatDate(activeViewingBooking.travelStartDate, dateFormat)} to{' '}
                  {formatDate(activeViewingBooking.travelEndDate, dateFormat)}
                </p>
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-semibold">Hotel:</span> {activeViewingBooking.hotelDetails || 'TBA'}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-semibold">Vehicle:</span> {activeViewingBooking.vehicleDetails || 'TBA'}
                </p>
              </div>
            </div>

            {/* Payment Breakdown */}
            <div className="mt-5 grid grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <p className="text-xs text-slate-500">Total Tour Cost</p>
                <p className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-white">
                  {formatCurrency(activeViewingBooking.totalCost, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Paid</p>
                <p className="mt-1 font-mono text-base font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                  {formatCurrency(getPaidForBooking(activeViewingBooking.id), currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Remaining Balance</p>
                <p className="mt-1 font-mono text-base font-bold text-amber-600 tabular-nums dark:text-amber-400">
                  {formatCurrency(getRemainingForBooking(activeViewingBooking), currency)}
                </p>
              </div>
            </div>

            {activeViewingBooking.notes && (
              <div className="mt-4 rounded-lg border border-slate-200 p-3 text-xs text-slate-700 dark:border-slate-800 dark:text-slate-300">
                <span className="font-semibold">Special Notes:</span> {activeViewingBooking.notes}
              </div>
            )}

            {/* Payment History for this booking */}
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Payment Installments ({linkedPayments.length})
                </h4>
                {getRemainingForBooking(activeViewingBooking) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickPayAmount(String(getRemainingForBooking(activeViewingBooking)));
                      setQuickPayOpen((v) => !v);
                    }}
                    className="no-print text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    + Add Payment
                  </button>
                )}
              </div>

              {quickPayOpen && (
                <form
                  onSubmit={handleQuickPaymentSubmit}
                  className="no-print mt-3 grid grid-cols-1 gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 sm:grid-cols-4 dark:border-blue-900 dark:bg-blue-950/30"
                >
                  <input
                    type="number"
                    min={1}
                    placeholder="Amount"
                    value={quickPayAmount}
                    onChange={(e) => setQuickPayAmount(e.target.value)}
                    required
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <select
                    value={quickPayMethod}
                    onChange={(e) => setQuickPayMethod(e.target.value as PaymentMethod)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={quickPayDate}
                    onChange={(e) => setQuickPayDate(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ref No."
                      value={quickPayRef}
                      onChange={(e) => setQuickPayRef(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      Save
                    </button>
                  </div>
                </form>
              )}

              {linkedPayments.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No payments recorded for this booking yet.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                        <th className="px-3 py-2">Payment ID</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Method</th>
                        <th className="px-3 py-2">Reference</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {linkedPayments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-3 py-2 font-mono font-semibold">{p.id}</td>
                          <td className="px-3 py-2 font-mono">{formatDate(p.paymentDate, dateFormat)}</td>
                          <td className="px-3 py-2">{p.method}</td>
                          <td className="px-3 py-2 text-slate-500">{p.transactionRef || '—'}</td>
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

            {/* Linked Expenses (no-print internal view) */}
            {linkedExpenses.length > 0 && (
              <div className="mt-5 no-print">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Related Trip Expenses ({linkedExpenses.length})
                </h4>
                <div className="mt-2 space-y-1.5">
                  {linkedExpenses.map((ex) => (
                    <div
                      key={ex.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"
                    >
                      <span>
                        <span className="font-semibold">{ex.category}:</span> {ex.description} ({ex.vendorName})
                      </span>
                      <span className="font-mono font-semibold">{formatCurrency(ex.amount, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <Printer className="h-4 w-4" />
                Print Booking Details
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewingBooking(null);
                  setQuickPayOpen(false);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deletingBooking)}
        title="Delete Booking?"
        message={
          deletingBooking
            ? `Are you sure you want to delete booking ${deletingBooking.id} for ${deletingBooking.customerName}? All linked payment records for this booking will also be removed so financial totals remain accurate.`
            : ''
        }
        onConfirm={() => {
          if (deletingBooking) {
            deleteBooking(deletingBooking.id);
            setDeletingBooking(null);
          }
        }}
        onCancel={() => setDeletingBooking(null)}
      />
    </div>
  );
}
