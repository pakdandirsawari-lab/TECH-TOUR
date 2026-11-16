import React, { useMemo, useState } from 'react';
import { Building2, Edit2, Eye, IndianRupee, Plus, Search, Trash2, UserCheck } from 'lucide-react';
import { useTourism } from '../../context/TourismContext';
import {
  Partner,
  PartnerType,
  PaymentMethod,
  StaffDesignation,
  StaffMember,
  StaffStatus,
} from '../../types/tourism';
import { formatCurrency, formatDate, formatMonthYear, getTodayISO, isValidPhone } from '../../utils/formatters';
import { ConfirmDialog, EmptyState, Modal, StatusLabel } from '../ui/CommonUI';

const DESIGNATIONS: StaffDesignation[] = [
  'Tour Manager',
  'Tour Guide',
  'Driver',
  'Booking Staff',
  'Accountant',
  'Office Manager',
];

const STAFF_STATUSES: StaffStatus[] = ['Active', 'On Leave', 'Inactive'];
const PARTNER_TYPES: PartnerType[] = ['Hotel', 'Vehicle Provider', 'Tour Operator', 'Local Agent'];
const PAY_METHODS: PaymentMethod[] = ['Bank Transfer', 'UPI', 'Cash', 'Card', 'Other'];

export function StaffPartnersView() {
  const {
    db,
    isAdmin,
    addStaff,
    updateStaff,
    deleteStaff,
    recordStaffSalary,
    addPartner,
    updatePartner,
    deletePartner,
  } = useTourism();

  const { currency, dateFormat } = db.settings;

  const [activeTab, setActiveTab] = useState<'staff' | 'partners'>('staff');
  const [search, setSearch] = useState('');
  const [partnerTypeFilter, setPartnerTypeFilter] = useState('All');

  // Staff Modals
  const [staffFormOpen, setStaffFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [viewingStaff, setViewingStaff] = useState<StaffMember | null>(null);
  const [salaryTargetStaff, setSalaryTargetStaff] = useState<StaffMember | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<StaffMember | null>(null);

  // Staff Form Fields
  const [sName, setSName] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sAddress, setSAddress] = useState('');
  const [sDesignation, setSDesignation] = useState<StaffDesignation>('Tour Manager');
  const [sJoiningDate, setSJoiningDate] = useState(getTodayISO());
  const [sSalary, setSSalary] = useState('');
  const [sStatus, setSStatus] = useState<StaffStatus>('Active');
  const [sError, setSError] = useState('');

  // Salary Payment Form Fields
  const [salMonth, setSalMonth] = useState(getTodayISO().slice(0, 7));
  const [salAmount, setSalAmount] = useState('');
  const [salDate, setSalDate] = useState(getTodayISO());
  const [salMethod, setSalMethod] = useState<PaymentMethod>('Bank Transfer');
  const [salNotes, setSalNotes] = useState('');
  const [salLogExpense, setSalLogExpense] = useState(true);

  // Partner Modals
  const [partnerFormOpen, setPartnerFormOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [deletingPartner, setDeletingPartner] = useState<Partner | null>(null);

  // Partner Form Fields
  const [pName, setPName] = useState('');
  const [pType, setPType] = useState<PartnerType>('Hotel');
  const [pLocation, setPLocation] = useState('');
  const [pContact, setPContact] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pRateNotes, setPRateNotes] = useState('');
  const [pStatus, setPStatus] = useState<'Active' | 'Inactive'>('Active');
  const [pError, setPError] = useState('');

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.staff.filter(
      (s) =>
        !q ||
        s.fullName.toLowerCase().includes(q) ||
        s.designation.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q)
    );
  }, [db.staff, search]);

  const filteredPartners = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.partners.filter((p) => {
      if (partnerTypeFilter !== 'All' && p.type !== partnerTypeFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q) ||
        p.contactPerson.toLowerCase().includes(q)
      );
    });
  }, [db.partners, search, partnerTypeFilter]);

  const activeViewingStaff = useMemo(
    () => (viewingStaff ? db.staff.find((s) => s.id === viewingStaff.id) ?? null : null),
    [viewingStaff, db.staff]
  );

  // Staff handlers
  const openAddStaff = () => {
    setEditingStaff(null);
    setSName('');
    setSPhone('');
    setSEmail('');
    setSAddress('');
    setSDesignation('Tour Manager');
    setSJoiningDate(getTodayISO());
    setSSalary('');
    setSStatus('Active');
    setSError('');
    setStaffFormOpen(true);
  };

  const openEditStaff = (s: StaffMember) => {
    setEditingStaff(s);
    setSName(s.fullName);
    setSPhone(s.phone);
    setSEmail(s.email);
    setSAddress(s.address);
    setSDesignation(s.designation);
    setSJoiningDate(s.joiningDate);
    setSSalary(String(s.monthlySalary));
    setSStatus(s.status);
    setSError('');
    setStaffFormOpen(true);
  };

  const handleStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSError('');
    if (!sName.trim()) return setSError('Full name is required.');
    if (!isValidPhone(sPhone)) return setSError('Enter a valid phone number.');
    const sal = Number(sSalary);
    if (!Number.isFinite(sal) || sal <= 0) return setSError('Monthly salary must be greater than ₹0.');

    const payload = {
      fullName: sName.trim(),
      phone: sPhone.trim(),
      email: sEmail.trim(),
      address: sAddress.trim(),
      designation: sDesignation,
      joiningDate: sJoiningDate,
      monthlySalary: sal,
      status: sStatus,
      isDemo: editingStaff ? editingStaff.isDemo : false,
    };

    if (editingStaff) {
      updateStaff({ ...payload, id: editingStaff.id, salaryRecords: editingStaff.salaryRecords });
    } else {
      addStaff(payload);
    }
    setStaffFormOpen(false);
  };

  const openSalaryModal = (s: StaffMember) => {
    setSalaryTargetStaff(s);
    setSalMonth(getTodayISO().slice(0, 7));
    setSalAmount(String(s.monthlySalary));
    setSalDate(getTodayISO());
    setSalMethod('Bank Transfer');
    setSalNotes('');
    setSalLogExpense(true);
  };

  const handleSalarySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryTargetStaff) return;
    const amt = Number(salAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    recordStaffSalary(
      salaryTargetStaff.id,
      {
        month: salMonth,
        amount: amt,
        paidDate: salDate,
        method: salMethod,
        notes: salNotes.trim(),
      },
      salLogExpense
    );
    setSalaryTargetStaff(null);
  };

  // Partner handlers
  const openAddPartner = () => {
    setEditingPartner(null);
    setPName('');
    setPType('Hotel');
    setPLocation('');
    setPContact('');
    setPPhone('');
    setPEmail('');
    setPRateNotes('');
    setPStatus('Active');
    setPError('');
    setPartnerFormOpen(true);
  };

  const openEditPartner = (p: Partner) => {
    setEditingPartner(p);
    setPName(p.name);
    setPType(p.type);
    setPLocation(p.location);
    setPContact(p.contactPerson);
    setPPhone(p.phone);
    setPEmail(p.email);
    setPRateNotes(p.rateNotes);
    setPStatus(p.status);
    setPError('');
    setPartnerFormOpen(true);
  };

  const handlePartnerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPError('');
    if (!pName.trim()) return setPError('Partner / Organization name is required.');
    if (!isValidPhone(pPhone)) return setPError('Enter a valid phone number.');

    const payload = {
      name: pName.trim(),
      type: pType,
      location: pLocation.trim(),
      contactPerson: pContact.trim(),
      phone: pPhone.trim(),
      email: pEmail.trim(),
      rateNotes: pRateNotes.trim(),
      status: pStatus,
      isDemo: editingPartner ? editingPartner.isDemo : false,
    };

    if (editingPartner) {
      updatePartner({ ...payload, id: editingPartner.id });
    } else {
      addPartner(payload);
    }
    setPartnerFormOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Tabs & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('staff')}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'staff'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            Staff Members ({db.staff.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('partners')}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'partners'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
            }`}
          >
            Hotels & Partners ({db.partners.length})
          </button>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-end gap-3 min-w-[240px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'staff' ? 'Search staff...' : 'Search partners...'}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {activeTab === 'partners' && (
            <select
              value={partnerTypeFilter}
              onChange={(e) => setPartnerTypeFilter(e.target.value)}
              aria-label="Filter by partner type"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="All">All Partner Types</option>
              {PARTNER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={activeTab === 'staff' ? openAddStaff : openAddPartner}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              {activeTab === 'staff' ? 'Add Staff' : 'Add Partner'}
            </button>
          )}
        </div>
      </div>

      {/* Staff Tab */}
      {activeTab === 'staff' && (
        <>
          {filteredStaff.length === 0 ? (
            <EmptyState
              icon={<UserCheck className="h-6 w-6" />}
              title="No staff members found"
              description="Add tour managers, guides, drivers, and office staff to track payroll and operations."
              actionLabel="Add Staff"
              onAction={openAddStaff}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                      <th className="px-4 py-3.5">Staff ID</th>
                      <th className="px-4 py-3.5">Name & Contact</th>
                      <th className="px-4 py-3.5">Designation</th>
                      <th className="px-4 py-3.5">Joining Date</th>
                      <th className="px-4 py-3.5 text-right">Monthly Salary</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredStaff.map((s) => (
                      <tr key={s.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                          {s.id}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{s.fullName}</div>
                          <div className="text-xs text-slate-500">{s.phone}</div>
                        </td>
                        <td className="px-4 py-3.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                          {s.designation}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                          {formatDate(s.joiningDate, dateFormat)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                          {formatCurrency(s.monthlySalary, currency)}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusLabel status={s.status} />
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => openSalaryModal(s)}
                                title="Record Salary Payout"
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                              >
                                <IndianRupee className="h-3 w-3" />
                                Pay
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setViewingStaff(s)}
                              title="Staff Profile & Salary History"
                              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditStaff(s)}
                                  title="Edit Staff"
                                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingStaff(s)}
                                  title="Delete Staff"
                                  className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/60"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
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
        </>
      )}

      {/* Partners Tab */}
      {activeTab === 'partners' && (
        <>
          {filteredPartners.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-6 w-6" />}
              title="No partners found"
              description="Add partner hotels, cab fleet providers, tour operators, and local destination agents."
              actionLabel="Add Partner"
              onAction={openAddPartner}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredPartners.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          {p.type} · {p.location}
                        </p>
                        <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">{p.name}</h3>
                      </div>
                      <StatusLabel status={p.status} />
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <p>
                        Contact: <strong>{p.contactPerson || '—'}</strong> · {p.phone}
                      </p>
                      <p>{p.email || '—'}</p>
                      {p.rateNotes && (
                        <p className="mt-2 rounded-lg bg-slate-50 p-2.5 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                          {p.rateNotes}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                    <span className="font-mono text-xs text-slate-400">{p.id}</span>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditPartner(p)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingPartner(p)}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/60"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Staff Add/Edit Modal */}
      <Modal
        open={staffFormOpen}
        onClose={() => setStaffFormOpen(false)}
        title={editingStaff ? `Edit Staff · ${editingStaff.id}` : 'Add Staff Member'}
      >
        <form onSubmit={handleStaffSubmit} className="space-y-4">
          {sError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{sError}</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Full Name *</label>
              <input
                type="text"
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Phone Number *</label>
              <input
                type="text"
                value={sPhone}
                onChange={(e) => setSPhone(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Email</label>
              <input
                type="email"
                value={sEmail}
                onChange={(e) => setSEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Designation</label>
              <select
                value={sDesignation}
                onChange={(e) => setSDesignation(e.target.value as StaffDesignation)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {DESIGNATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Joining Date</label>
              <input
                type="date"
                value={sJoiningDate}
                onChange={(e) => setSJoiningDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Monthly Salary ({currency}) *
              </label>
              <input
                type="number"
                min={1}
                value={sSalary}
                onChange={(e) => setSSalary(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Address</label>
              <input
                type="text"
                value={sAddress}
                onChange={(e) => setSAddress(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Status</label>
              <select
                value={sStatus}
                onChange={(e) => setSStatus(e.target.value as StaffStatus)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {STAFF_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setStaffFormOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {editingStaff ? 'Save Staff' : 'Add Staff'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Staff Profile & Salary History Modal */}
      <Modal
        open={Boolean(activeViewingStaff)}
        onClose={() => setViewingStaff(null)}
        title={activeViewingStaff ? `${activeViewingStaff.fullName} · ${activeViewingStaff.id}` : ''}
        subtitle={activeViewingStaff ? `${activeViewingStaff.designation} · Joined ${formatDate(activeViewingStaff.joiningDate, dateFormat)}` : undefined}
      >
        {activeViewingStaff && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-800/50">
              <div>
                <p className="text-slate-500">Phone & Email</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-white">{activeViewingStaff.phone}</p>
                <p className="text-slate-600 dark:text-slate-300">{activeViewingStaff.email || '—'}</p>
              </div>
              <div>
                <p className="text-slate-500">Monthly Salary & Status</p>
                <p className="mt-1 font-mono text-base font-bold text-slate-900 dark:text-white">
                  {formatCurrency(activeViewingStaff.monthlySalary, currency)}
                </p>
                <div className="mt-1">
                  <StatusLabel status={activeViewingStaff.status} />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Salary Payment History</h4>
                <button
                  type="button"
                  onClick={() => openSalaryModal(activeViewingStaff)}
                  className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  + Pay Salary
                </button>
              </div>

              {activeViewingStaff.salaryRecords.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No salary payouts recorded yet.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50">
                        <th className="px-3 py-2">Month</th>
                        <th className="px-3 py-2">Paid Date</th>
                        <th className="px-3 py-2">Method</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {activeViewingStaff.salaryRecords.map((sr) => (
                        <tr key={sr.id}>
                          <td className="px-3 py-2 font-medium">{formatMonthYear(sr.month)}</td>
                          <td className="px-3 py-2 font-mono">{formatDate(sr.paidDate, dateFormat)}</td>
                          <td className="px-3 py-2">{sr.method}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold">
                            {formatCurrency(sr.amount, currency)}
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

      {/* Pay Salary Modal */}
      <Modal
        open={Boolean(salaryTargetStaff)}
        onClose={() => setSalaryTargetStaff(null)}
        title={salaryTargetStaff ? `Record Salary · ${salaryTargetStaff.fullName}` : ''}
      >
        {salaryTargetStaff && (
          <form onSubmit={handleSalarySubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Salary Month</label>
                <input
                  type="month"
                  value={salMonth}
                  onChange={(e) => setSalMonth(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Amount ({currency})
                </label>
                <input
                  type="number"
                  min={1}
                  value={salAmount}
                  onChange={(e) => setSalAmount(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Paid Date</label>
                <input
                  type="date"
                  value={salDate}
                  onChange={(e) => setSalDate(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Method</label>
                <select
                  value={salMethod}
                  onChange={(e) => setSalMethod(e.target.value as PaymentMethod)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {PAY_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={salLogExpense}
                onChange={(e) => setSalLogExpense(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Also record this payout in Expenses (Category: Staff Salary) for Profit & Loss accuracy
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Notes</label>
              <input
                type="text"
                value={salNotes}
                onChange={(e) => setSalNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSalaryTargetStaff(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Confirm Salary Payout
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Partner Add/Edit Modal */}
      <Modal
        open={partnerFormOpen}
        onClose={() => setPartnerFormOpen(false)}
        title={editingPartner ? `Edit Partner · ${editingPartner.id}` : 'Add Agency Partner'}
      >
        <form onSubmit={handlePartnerSubmit} className="space-y-4">
          {pError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{pError}</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Organization / Hotel Name *
              </label>
              <input
                type="text"
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Partner Type</label>
              <select
                value={pType}
                onChange={(e) => setPType(e.target.value as PartnerType)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {PARTNER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Location / City</label>
              <input
                type="text"
                value={pLocation}
                onChange={(e) => setPLocation(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Contact Person</label>
              <input
                type="text"
                value={pContact}
                onChange={(e) => setPContact(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Phone *</label>
              <input
                type="text"
                value={pPhone}
                onChange={(e) => setPPhone(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Email</label>
              <input
                type="email"
                value={pEmail}
                onChange={(e) => setPEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                B2B Rate / Commission Notes
              </label>
              <input
                type="text"
                value={pRateNotes}
                onChange={(e) => setPRateNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Status</label>
              <select
                value={pStatus}
                onChange={(e) => setPStatus(e.target.value as 'Active' | 'Inactive')}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setPartnerFormOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {editingPartner ? 'Save Partner' : 'Add Partner'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingStaff)}
        title="Remove Staff Member?"
        message={deletingStaff ? `Remove ${deletingStaff.fullName} (${deletingStaff.designation})?` : ''}
        onConfirm={() => {
          if (deletingStaff) {
            deleteStaff(deletingStaff.id);
            setDeletingStaff(null);
          }
        }}
        onCancel={() => setDeletingStaff(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingPartner)}
        title="Delete Partner?"
        message={deletingPartner ? `Remove partner ${deletingPartner.name}?` : ''}
        onConfirm={() => {
          if (deletingPartner) {
            deletePartner(deletingPartner.id);
            setDeletingPartner(null);
          }
        }}
        onCancel={() => setDeletingPartner(null)}
      />
    </div>
  );
}
