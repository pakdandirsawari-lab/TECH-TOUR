import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Check, Edit2, Eye, Package, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { useTourism } from '../../context/TourismContext';
import { DESTINATION_GALLERY } from '../../data/emptyDatabase';
import { PackageStatus, TourPackage } from '../../types/tourism';
import { formatCurrency } from '../../utils/formatters';
import { ConfirmDialog, DestinationImage, EmptyState, Modal, StatusLabel } from '../ui/CommonUI';

const STATUSES: PackageStatus[] = ['Active', 'Seasonal', 'Inactive'];

export function PackagesView() {
  const {
    db,
    canDelete,
    focusedRecordId,
    setFocusedRecordId,
    navigateToRecord,
    addPackage,
    updatePackage,
    deletePackage,
  } = useTourism();

  const { currency } = db.settings;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [formOpen, setFormOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<TourPackage | null>(null);
  const [viewingPkg, setViewingPkg] = useState<TourPackage | null>(null);
  const [deletingPkg, setDeletingPkg] = useState<TourPackage | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [durationDays, setDurationDays] = useState(4);
  const [durationNights, setDurationNights] = useState(3);
  const [description, setDescription] = useState('');
  const [itineraryText, setItineraryText] = useState('');
  const [hotelDetails, setHotelDetails] = useState('');
  const [vehicleDetails, setVehicleDetails] = useState('');
  const [pricePerPerson, setPricePerPerson] = useState('');
  const [minPersons, setMinPersons] = useState(2);
  const [maxPersons, setMaxPersons] = useState(12);
  const [includedText, setIncludedText] = useState('');
  const [excludedText, setExcludedText] = useState('');
  const [imageUrl, setImageUrl] = useState(DESTINATION_GALLERY[0].url);
  const [status, setStatus] = useState<PackageStatus>('Active');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (focusedRecordId) {
      const target = db.packages.find((p) => p.id === focusedRecordId);
      if (target) {
        setViewingPkg(target);
        setFocusedRecordId(null);
      }
    }
  }, [focusedRecordId, db.packages]);

  const filteredPackages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.packages.filter((p) => {
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (q) {
        return (
          p.name.toLowerCase().includes(q) ||
          p.destination.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [db.packages, search, statusFilter]);

  const openAddModal = () => {
    setEditingPkg(null);
    setName('');
    setDestination('');
    setDurationDays(4);
    setDurationNights(3);
    setDescription('');
    setItineraryText('Day 1: Arrival & transfer\nDay 2: Local sightseeing\nDay 3: Excursion\nDay 4: Departure');
    setHotelDetails('');
    setVehicleDetails('');
    setPricePerPerson('');
    setMinPersons(2);
    setMaxPersons(12);
    setIncludedText('Hotel Accommodation\nDaily Breakfast & Dinner\nAll Sightseeing Transfers');
    setExcludedText('Airfare / Train Tickets\nEntry Fees & Personal Expenses');
    setImageUrl(DESTINATION_GALLERY[0].url);
    setStatus('Active');
    setFormError('');
    setFormOpen(true);
  };

  const openEditModal = (p: TourPackage) => {
    setEditingPkg(p);
    setName(p.name);
    setDestination(p.destination);
    setDurationDays(p.durationDays);
    setDurationNights(p.durationNights);
    setDescription(p.description);
    setItineraryText(p.itinerary.join('\n'));
    setHotelDetails(p.hotelDetails);
    setVehicleDetails(p.vehicleDetails);
    setPricePerPerson(String(p.pricePerPerson));
    setMinPersons(p.minPersons);
    setMaxPersons(p.maxPersons);
    setIncludedText(p.includedServices.join('\n'));
    setExcludedText(p.excludedServices.join('\n'));
    setImageUrl(p.imageUrl);
    setStatus(p.status);
    setFormError('');
    setFormOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1500000) {
      setFormError('Image size must be under 1.5 MB for local storage.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setImageUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) return setFormError('Package name is required.');
    if (!destination.trim()) return setFormError('Destination is required.');
    const price = Number(pricePerPerson);
    if (!Number.isFinite(price) || price <= 0) return setFormError('Price per person must be greater than ₹0.');

    const payload: Omit<TourPackage, 'id'> = {
      name: name.trim(),
      destination: destination.trim(),
      durationDays: Math.max(1, Number(durationDays) || 1),
      durationNights: Math.max(0, Number(durationNights) || 0),
      description: description.trim(),
      itinerary: itineraryText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      hotelDetails: hotelDetails.trim(),
      vehicleDetails: vehicleDetails.trim(),
      pricePerPerson: price,
      minPersons: Math.max(1, Number(minPersons) || 1),
      maxPersons: Math.max(1, Number(maxPersons) || 2),
      includedServices: includedText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      excludedServices: excludedText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      imageUrl,
      status,
      isDemo: editingPkg ? editingPkg.isDemo : false,
    };

    if (editingPkg) {
      updatePackage({ ...payload, id: editingPkg.id });
    } else {
      addPackage(payload);
    }
    setFormOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[240px]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search packages by name or destination..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter packages by status"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="All">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Add Package
        </button>
      </div>

      {/* Package Cards Grid */}
      {filteredPackages.length === 0 ? (
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title="No tour packages found"
          description="Create reusable tour packages with itineraries, pricing, hotel & vehicle specifications."
          actionLabel="Add Package"
          onAction={openAddModal}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredPackages.map((pkg) => (
            <div
              key={pkg.id}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                <DestinationImage src={pkg.imageUrl} alt={`${pkg.name} - ${pkg.destination}`} />
              </div>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{pkg.id}</span>
                      <span aria-hidden="true">·</span>
                      <span>{pkg.destination}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {pkg.durationDays}D / {pkg.durationNights}N
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">{pkg.name}</h3>
                  </div>
                  <StatusLabel status={pkg.status} />
                </div>

                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {pkg.description}
                </p>

                <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div>
                    <span className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-white">
                      {formatCurrency(pkg.pricePerPerson, currency)}
                    </span>
                    <span className="text-xs text-slate-500"> / person</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    Min {pkg.minPersons} · Max {pkg.maxPersons} pax
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => navigateToRecord('bookings', `NEW_FROM_PKG:${pkg.id}`)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Book Package
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setViewingPkg(pkg)}
                      title="View Package Details"
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(pkg)}
                      title="Edit Package"
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeletingPkg(pkg)}
                        title="Delete Package"
                        className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-red-950/60"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Package Details Modal */}
      <Modal
        open={Boolean(viewingPkg)}
        onClose={() => setViewingPkg(null)}
        title={viewingPkg ? `${viewingPkg.name} (${viewingPkg.id})` : ''}
        subtitle={
          viewingPkg
            ? `${viewingPkg.destination} · ${viewingPkg.durationDays} Days / ${viewingPkg.durationNights} Nights`
            : undefined
        }
        maxWidth="max-w-3xl"
      >
        {viewingPkg && (
          <div className="space-y-5">
            <div className="aspect-[16/9] w-full overflow-hidden rounded-xl bg-slate-100">
              <DestinationImage src={viewingPkg.imageUrl} alt={viewingPkg.name} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <p className="text-xs text-slate-500">Package Price</p>
                <p className="font-mono text-xl font-bold text-blue-600 dark:text-blue-400">
                  {formatCurrency(viewingPkg.pricePerPerson, currency)}{' '}
                  <span className="text-xs font-normal text-slate-500">per person</span>
                </p>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <p>
                  <strong>Hotel:</strong> {viewingPkg.hotelDetails || 'Standard'}
                </p>
                <p>
                  <strong>Vehicle:</strong> {viewingPkg.vehicleDetails || 'Private Cab'}
                </p>
              </div>
              <StatusLabel status={viewingPkg.status} />
            </div>

            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{viewingPkg.description}</p>

            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Day-by-Day Itinerary</h4>
              <ul className="mt-2 space-y-2">
                {viewingPkg.itinerary.map((step, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs text-slate-700 dark:border-slate-800 dark:text-slate-300"
                  >
                    {step}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Included Services</h4>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {viewingPkg.includedServices.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <h4 className="text-xs font-bold text-red-700 dark:text-red-400">Excluded Services</h4>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  {viewingPkg.excludedServices.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Add / Edit Package Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingPkg ? `Edit Package · ${editingPkg.id}` : 'Create Tour Package'}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Package Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Destination *</label>
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

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Days</label>
              <input
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Nights</label>
              <input
                type="number"
                min={0}
                value={durationNights}
                onChange={(e) => setDurationNights(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Price / Person ({currency}) *
              </label>
              <input
                type="number"
                min={1}
                value={pricePerPerson}
                onChange={(e) => setPricePerPerson(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Min Pax</label>
              <input
                type="number"
                min={1}
                value={minPersons}
                onChange={(e) => setMinPersons(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Max Pax</label>
              <input
                type="number"
                min={1}
                value={maxPersons}
                onChange={(e) => setMaxPersons(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Hotel Details</label>
              <input
                type="text"
                value={hotelDetails}
                onChange={(e) => setHotelDetails(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Vehicle Details</label>
              <input
                type="text"
                value={vehicleDetails}
                onChange={(e) => setVehicleDetails(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Package Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PackageStatus)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Image Picker or Upload */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Package Destination Photo
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
                <Upload className="h-3.5 w-3.5" />
                Upload Custom Image
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {DESTINATION_GALLERY.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  onClick={() => setImageUrl(item.url)}
                  className={`overflow-hidden rounded-lg border-2 transition-all ${
                    imageUrl === item.url ? 'border-blue-600 ring-2 ring-blue-200' : 'border-transparent opacity-75 hover:opacity-100'
                  }`}
                >
                  <img src={item.url} alt={item.label} className="aspect-[4/3] w-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Package Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Itinerary (one day per line)
            </label>
            <textarea
              rows={3}
              value={itineraryText}
              onChange={(e) => setItineraryText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Included Services (one per line)
              </label>
              <textarea
                rows={3}
                value={includedText}
                onChange={(e) => setIncludedText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Excluded Services (one per line)
              </label>
              <textarea
                rows={3}
                value={excludedText}
                onChange={(e) => setExcludedText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
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
              {editingPkg ? 'Save Package' : 'Create Package'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingPkg)}
        title="Delete Tour Package?"
        message={
          deletingPkg ? `Delete "${deletingPkg.name}" (${deletingPkg.id}) from the package catalog?` : ''
        }
        onConfirm={() => {
          if (deletingPkg) {
            deletePackage(deletingPkg.id);
            setDeletingPkg(null);
          }
        }}
        onCancel={() => setDeletingPkg(null)}
      />
    </div>
  );
}
