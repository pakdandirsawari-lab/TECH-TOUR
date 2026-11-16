import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearGoogleSheetsAuthToken,
  DEFAULT_BACKUP_SPREADSHEET_ID,
  exportTourismStateToSpreadsheet,
  getGoogleSheetsAccessToken,
  serializeTourismStateToJson,
  SerializedTourismJsonPayload,
  SheetsAuthExpiredError,
} from '../services/googleSheetsService';
import { BackupResult, backupViaAppsScriptWebhook } from '../services/sheetsBackup';
import { tourismRepository } from '../services/storage';
import {
  AgencySettings,
  AppRoute,
  Booking,
  Customer,
  Expense,
  Partner,
  Payment,
  PaymentMethod,
  SalaryRecord,
  StaffMember,
  TourPackage,
  TourismDatabase,
} from '../types/tourism';
import { generateBookingId, generateNextId, getTodayISO } from '../utils/formatters';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface TourismContextValue {
  db: TourismDatabase;
  activeRoute: AppRoute;
  setActiveRoute: (route: AppRoute) => void;
  focusedRecordId: string | null;
  setFocusedRecordId: (id: string | null) => void;
  navigateToRecord: (route: AppRoute, recordId?: string) => void;
  isLocked: boolean;
  unlockApp: (password: string) => boolean;
  lockApp: () => void;
  toasts: ToastMessage[];
  showToast: (type: ToastMessage['type'], message: string) => void;
  dismissToast: (id: string) => void;

  // Financial helpers
  getPaidForBooking: (bookingId: string) => number;
  getRemainingForBooking: (booking: Booking) => number;
  getCustomerStats: (customerId: string) => { totalBookings: number; totalSpent: number; totalBookedValue: number };
  financialSummary: {
    totalBookings: number;
    totalCustomers: number;
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    totalOutstanding: number;
    activeBookingValue: number;
  };

  // CRUD: Bookings
  addBooking: (
    booking: Omit<Booking, 'id'>,
    advanceAmount?: number,
    advanceMethod?: PaymentMethod,
    advanceRef?: string
  ) => Booking;
  updateBooking: (booking: Booking) => void;
  deleteBooking: (bookingId: string) => void;

  // CRUD: Customers
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt'>) => Customer;
  updateCustomer: (customer: Customer) => void;
  deleteCustomer: (customerId: string) => void;

  // CRUD: Payments
  addPayment: (payment: Omit<Payment, 'id'>) => Payment;
  updatePayment: (payment: Payment) => void;
  deletePayment: (paymentId: string) => void;

  // CRUD: Expenses
  addExpense: (expense: Omit<Expense, 'id'>) => Expense;
  updateExpense: (expense: Expense) => void;
  deleteExpense: (expenseId: string) => void;

  // CRUD: Packages
  addPackage: (pkg: Omit<TourPackage, 'id'>) => TourPackage;
  updatePackage: (pkg: TourPackage) => void;
  deletePackage: (packageId: string) => void;

  // CRUD: Staff & Partners
  addStaff: (member: Omit<StaffMember, 'id' | 'salaryRecords'>) => StaffMember;
  updateStaff: (member: StaffMember) => void;
  deleteStaff: (staffId: string) => void;
  recordStaffSalary: (staffId: string, salary: Omit<SalaryRecord, 'id'>, logAsExpense: boolean) => void;

  addPartner: (partner: Omit<Partner, 'id'>) => Partner;
  updatePartner: (partner: Partner) => void;
  deletePartner: (partnerId: string) => void;

  // Settings & Data management
  updateSettings: (nextSettings: AgencySettings) => void;
  clearDemoDataOnly: () => void;
  resetDemoData: () => void;
  exportBackup: () => string;
  importBackup: (jsonText: string) => void;

  // Google Sheets Cloud Backup Sync
  isSyncingSheets: boolean;
  lastSheetsBackup: BackupResult | null;
  sheetsSyncError: string | null;
  serializeCurrentStateAsJson: (spreadsheetId?: string) => SerializedTourismJsonPayload;
  syncAllToSheets: (spreadsheetId?: string) => Promise<{ ok: boolean; authExpired?: boolean; result?: BackupResult }>;
  syncViaAppsScript: (webhookUrl: string, spreadsheetId?: string) => Promise<{ ok: boolean; result?: BackupResult }>;
}

const TourismContext = createContext<TourismContextValue | null>(null);

export function TourismProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<TourismDatabase>(() => tourismRepository.load());
  const [activeRoute, setActiveRoute] = useState<AppRoute>('dashboard');
  const [focusedRecordId, setFocusedRecordId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(() => tourismRepository.load().settings.requireLogin);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [lastSheetsBackup, setLastSheetsBackup] = useState<BackupResult | null>(null);
  const [sheetsSyncError, setSheetsSyncError] = useState<string | null>(null);

  // Persist changes
  useEffect(() => {
    tourismRepository.save(db);
  }, [db]);

  // Sync Tailwind dark mode class with settings.theme
  useEffect(() => {
    const root = document.documentElement;
    if (db.settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [db.settings.theme]);

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const navigateToRecord = useCallback((route: AppRoute, recordId?: string) => {
    setActiveRoute(route);
    setFocusedRecordId(recordId ?? null);
  }, []);

  const unlockApp = useCallback(
    (password: string) => {
      if (password === db.settings.userProfile.password) {
        setIsLocked(false);
        showToast('success', `Welcome back, ${db.settings.userProfile.name}`);
        return true;
      }
      return false;
    },
    [db.settings.userProfile.password, db.settings.userProfile.name, showToast]
  );

  const lockApp = useCallback(() => {
    setIsLocked(true);
  }, []);

  // Financial selectors
  const paymentsByBooking = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of db.payments) {
      map.set(p.bookingId, (map.get(p.bookingId) ?? 0) + (Number(p.amount) || 0));
    }
    return map;
  }, [db.payments]);

  const getPaidForBooking = useCallback(
    (bookingId: string) => paymentsByBooking.get(bookingId) ?? 0,
    [paymentsByBooking]
  );

  const getRemainingForBooking = useCallback(
    (booking: Booking) => {
      if (booking.status === 'Cancelled') return 0;
      const paid = paymentsByBooking.get(booking.id) ?? 0;
      return Math.max(0, booking.totalCost - paid);
    },
    [paymentsByBooking]
  );

  const getCustomerStats = useCallback(
    (customerId: string) => {
      const custBookings = db.bookings.filter((b) => b.customerId === customerId);
      const totalBookedValue = custBookings
        .filter((b) => b.status !== 'Cancelled')
        .reduce((sum, b) => sum + b.totalCost, 0);
      const totalSpent = db.payments
        .filter((p) => p.customerId === customerId)
        .reduce((sum, p) => sum + p.amount, 0);
      return {
        totalBookings: custBookings.length,
        totalSpent,
        totalBookedValue,
      };
    },
    [db.bookings, db.payments]
  );

  const financialSummary = useMemo(() => {
    const totalRevenue = db.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalExpenses = db.expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const activeBookings = db.bookings.filter((b) => b.status !== 'Cancelled');
    const activeBookingValue = activeBookings.reduce((sum, b) => sum + b.totalCost, 0);
    const totalOutstanding = activeBookings.reduce((sum, b) => {
      const paid = paymentsByBooking.get(b.id) ?? 0;
      return sum + Math.max(0, b.totalCost - paid);
    }, 0);

    return {
      totalBookings: db.bookings.length,
      totalCustomers: db.customers.length,
      totalRevenue,
      totalExpenses,
      netProfit,
      totalOutstanding,
      activeBookingValue,
    };
  }, [db.bookings, db.customers.length, db.expenses, db.payments, paymentsByBooking]);

  // CRUD Bookings
  const addBooking = useCallback(
    (
      bookingInput: Omit<Booking, 'id'>,
      advanceAmount = 0,
      advanceMethod: PaymentMethod = 'UPI',
      advanceRef = ''
    ): Booking => {
      let createdBooking!: Booking;
      setDb((prev) => {
        const newId = generateBookingId(prev.bookings.map((b) => b.id));
        createdBooking = { ...bookingInput, id: newId };
        let nextPayments = prev.payments;
        if (advanceAmount > 0) {
          const payId = generateNextId(
            'PAY',
            prev.payments.map((p) => p.id),
            4
          );
          const initialPayment: Payment = {
            id: payId,
            bookingId: newId,
            customerId: createdBooking.customerId,
            customerName: createdBooking.customerName,
            paymentDate: createdBooking.bookingDate || getTodayISO(),
            amount: advanceAmount,
            method: advanceMethod,
            transactionRef: advanceRef || `ADV-${newId}`,
            notes: `Initial advance payment for ${newId}`,
            isDemo: false,
          };
          nextPayments = [initialPayment, ...prev.payments];
        }
        return {
          ...prev,
          bookings: [createdBooking, ...prev.bookings],
          payments: nextPayments,
        };
      });
      showToast('success', 'Booking created successfully.');
      return createdBooking;
    },
    [showToast]
  );

  const updateBooking = useCallback(
    (booking: Booking) => {
      setDb((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) => (b.id === booking.id ? booking : b)),
        payments: prev.payments.map((p) =>
          p.bookingId === booking.id ? { ...p, customerName: booking.customerName, customerId: booking.customerId } : p
        ),
      }));
      showToast('success', `Booking ${booking.id} updated.`);
    },
    [showToast]
  );

  const deleteBooking = useCallback(
    (bookingId: string) => {
      setDb((prev) => ({
        ...prev,
        bookings: prev.bookings.filter((b) => b.id !== bookingId),
        payments: prev.payments.filter((p) => p.bookingId !== bookingId),
        expenses: prev.expenses.map((e) =>
          e.relatedBookingId === bookingId ? { ...e, relatedBookingId: undefined } : e
        ),
      }));
      showToast('success', `Booking ${bookingId} and its linked payment records deleted.`);
    },
    [showToast]
  );

  // CRUD Customers
  const addCustomer = useCallback(
    (input: Omit<Customer, 'id' | 'createdAt'>): Customer => {
      let created!: Customer;
      setDb((prev) => {
        const id = generateNextId(
          'CUS',
          prev.customers.map((c) => c.id),
          4
        );
        created = { ...input, id, createdAt: getTodayISO() };
        return { ...prev, customers: [created, ...prev.customers] };
      });
      showToast('success', 'Customer added successfully.');
      return created;
    },
    [showToast]
  );

  const updateCustomer = useCallback(
    (customer: Customer) => {
      setDb((prev) => ({
        ...prev,
        customers: prev.customers.map((c) => (c.id === customer.id ? customer : c)),
        bookings: prev.bookings.map((b) =>
          b.customerId === customer.id
            ? {
                ...b,
                customerName: customer.fullName,
                customerPhone: customer.phone,
                customerEmail: customer.email,
              }
            : b
        ),
        payments: prev.payments.map((p) =>
          p.customerId === customer.id ? { ...p, customerName: customer.fullName } : p
        ),
      }));
      showToast('success', `Customer ${customer.fullName} updated.`);
    },
    [showToast]
  );

  const deleteCustomer = useCallback(
    (customerId: string) => {
      setDb((prev) => ({
        ...prev,
        customers: prev.customers.filter((c) => c.id !== customerId),
      }));
      showToast('success', 'Customer deleted.');
    },
    [showToast]
  );

  // CRUD Payments
  const addPayment = useCallback(
    (input: Omit<Payment, 'id'>): Payment => {
      let created!: Payment;
      setDb((prev) => {
        const id = generateNextId(
          'PAY',
          prev.payments.map((p) => p.id),
          4
        );
        created = { ...input, id };
        return { ...prev, payments: [created, ...prev.payments] };
      });
      showToast('success', 'Payment recorded and booking balance updated.');
      return created;
    },
    [showToast]
  );

  const updatePayment = useCallback(
    (payment: Payment) => {
      setDb((prev) => ({
        ...prev,
        payments: prev.payments.map((p) => (p.id === payment.id ? payment : p)),
      }));
      showToast('success', `Payment ${payment.id} updated.`);
    },
    [showToast]
  );

  const deletePayment = useCallback(
    (paymentId: string) => {
      setDb((prev) => ({
        ...prev,
        payments: prev.payments.filter((p) => p.id !== paymentId),
      }));
      showToast('success', `Payment ${paymentId} deleted.`);
    },
    [showToast]
  );

  // CRUD Expenses
  const addExpense = useCallback(
    (input: Omit<Expense, 'id'>): Expense => {
      let created!: Expense;
      setDb((prev) => {
        const id = generateNextId(
          'EXP',
          prev.expenses.map((e) => e.id),
          4
        );
        created = { ...input, id };
        return { ...prev, expenses: [created, ...prev.expenses] };
      });
      showToast('success', 'Expense recorded.');
      return created;
    },
    [showToast]
  );

  const updateExpense = useCallback(
    (expense: Expense) => {
      setDb((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === expense.id ? expense : e)),
      }));
      showToast('success', `Expense ${expense.id} updated.`);
    },
    [showToast]
  );

  const deleteExpense = useCallback(
    (expenseId: string) => {
      setDb((prev) => ({
        ...prev,
        expenses: prev.expenses.filter((e) => e.id !== expenseId),
      }));
      showToast('success', `Expense ${expenseId} deleted.`);
    },
    [showToast]
  );

  // CRUD Packages
  const addPackage = useCallback(
    (input: Omit<TourPackage, 'id'>): TourPackage => {
      let created!: TourPackage;
      setDb((prev) => {
        const id = generateNextId(
          'PKG',
          prev.packages.map((p) => p.id),
          3
        );
        created = { ...input, id };
        return { ...prev, packages: [created, ...prev.packages] };
      });
      showToast('success', 'Tour package added.');
      return created;
    },
    [showToast]
  );

  const updatePackage = useCallback(
    (pkg: TourPackage) => {
      setDb((prev) => ({
        ...prev,
        packages: prev.packages.map((p) => (p.id === pkg.id ? pkg : p)),
      }));
      showToast('success', `Package ${pkg.name} updated.`);
    },
    [showToast]
  );

  const deletePackage = useCallback(
    (packageId: string) => {
      setDb((prev) => ({
        ...prev,
        packages: prev.packages.filter((p) => p.id !== packageId),
      }));
      showToast('success', 'Tour package deleted.');
    },
    [showToast]
  );

  // CRUD Staff & Partners
  const addStaff = useCallback(
    (input: Omit<StaffMember, 'id' | 'salaryRecords'>): StaffMember => {
      let created!: StaffMember;
      setDb((prev) => {
        const id = generateNextId(
          'STF',
          prev.staff.map((s) => s.id),
          3
        );
        created = { ...input, id, salaryRecords: [] };
        return { ...prev, staff: [created, ...prev.staff] };
      });
      showToast('success', 'Staff member added.');
      return created;
    },
    [showToast]
  );

  const updateStaff = useCallback(
    (member: StaffMember) => {
      setDb((prev) => ({
        ...prev,
        staff: prev.staff.map((s) => (s.id === member.id ? member : s)),
      }));
      showToast('success', `Staff profile for ${member.fullName} updated.`);
    },
    [showToast]
  );

  const deleteStaff = useCallback(
    (staffId: string) => {
      setDb((prev) => ({
        ...prev,
        staff: prev.staff.filter((s) => s.id !== staffId),
      }));
      showToast('success', 'Staff member removed.');
    },
    [showToast]
  );

  const recordStaffSalary = useCallback(
    (staffId: string, salary: Omit<SalaryRecord, 'id'>, logAsExpense: boolean) => {
      setDb((prev) => {
        const member = prev.staff.find((s) => s.id === staffId);
        if (!member) return prev;
        const salId = `SAL-${Date.now().toString().slice(-5)}`;
        const newSalaryRecord: SalaryRecord = { ...salary, id: salId };
        const updatedStaff = prev.staff.map((s) =>
          s.id === staffId ? { ...s, salaryRecords: [newSalaryRecord, ...s.salaryRecords] } : s
        );
        let updatedExpenses = prev.expenses;
        if (logAsExpense) {
          const expId = generateNextId(
            'EXP',
            prev.expenses.map((e) => e.id),
            4
          );
          const salaryExpense: Expense = {
            id: expId,
            expenseDate: salary.paidDate,
            category: 'Staff Salary',
            description: `Salary for ${member.fullName} (${salary.month})`,
            vendorName: member.fullName,
            amount: salary.amount,
            paymentMethod: salary.method,
            notes: salary.notes || `${member.designation} salary payout`,
            isDemo: false,
          };
          updatedExpenses = [salaryExpense, ...prev.expenses];
        }
        return { ...prev, staff: updatedStaff, expenses: updatedExpenses };
      });
      showToast('success', logAsExpense ? 'Salary recorded & added to Expenses.' : 'Salary payment recorded.');
    },
    [showToast]
  );

  const addPartner = useCallback(
    (input: Omit<Partner, 'id'>): Partner => {
      let created!: Partner;
      setDb((prev) => {
        const id = generateNextId(
          'PRT',
          prev.partners.map((p) => p.id),
          3
        );
        created = { ...input, id };
        return { ...prev, partners: [created, ...prev.partners] };
      });
      showToast('success', 'Partner added.');
      return created;
    },
    [showToast]
  );

  const updatePartner = useCallback(
    (partner: Partner) => {
      setDb((prev) => ({
        ...prev,
        partners: prev.partners.map((p) => (p.id === partner.id ? partner : p)),
      }));
      showToast('success', `Partner ${partner.name} updated.`);
    },
    [showToast]
  );

  const deletePartner = useCallback(
    (partnerId: string) => {
      setDb((prev) => ({
        ...prev,
        partners: prev.partners.filter((p) => p.id !== partnerId),
      }));
      showToast('success', 'Partner deleted.');
    },
    [showToast]
  );

  // Settings & Data Management
  const updateSettings = useCallback(
    (nextSettings: AgencySettings) => {
      setDb((prev) => ({ ...prev, settings: nextSettings }));
      showToast('success', 'Agency settings saved.');
    },
    [showToast]
  );

  const clearDemoDataOnly = useCallback(() => {
    setDb((prev) => tourismRepository.clearDemoRecords(prev));
    showToast('info', 'All demo records removed. Your custom records are preserved.');
  }, [showToast]);

  const resetDemoData = useCallback(() => {
    const fresh = tourismRepository.resetToDemo();
    setDb(fresh);
    showToast('info', 'Database restored to initial Indian travel agency demo dataset.');
  }, [showToast]);

  const exportBackup = useCallback(() => {
    return tourismRepository.exportJson(db);
  }, [db]);

  const importBackup = useCallback(
    (jsonText: string) => {
      try {
        const restored = tourismRepository.parseImportedJson(jsonText);
        setDb(restored);
        showToast('success', 'Backup restored successfully.');
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Failed to import backup.');
      }
    },
    [showToast]
  );

  const serializeCurrentStateAsJson = useCallback(
    (spreadsheetId = DEFAULT_BACKUP_SPREADSHEET_ID) => serializeTourismStateToJson(db, spreadsheetId),
    [db]
  );

  const syncAllToSheets = useCallback(
    async (
      spreadsheetId = DEFAULT_BACKUP_SPREADSHEET_ID
    ): Promise<{ ok: boolean; authExpired?: boolean; result?: BackupResult }> => {
      setSheetsSyncError(null);
      const token = await getGoogleSheetsAccessToken();
      if (!token) {
        const msg = 'Google authorization is required before backing up to Google Sheets.';
        setSheetsSyncError(msg);
        showToast('info', msg);
        return { ok: false, authExpired: true };
      }
      setIsSyncingSheets(true);
      try {
        const result = await exportTourismStateToSpreadsheet(db, spreadsheetId, token);
        setLastSheetsBackup(result);
        showToast('success', `All agency data & JSON snapshot backed up to "${result.spreadsheetTitle}" via gapi!`);
        return { ok: true, result };
      } catch (err) {
        if (err instanceof SheetsAuthExpiredError) {
          clearGoogleSheetsAuthToken();
          setSheetsSyncError(err.message);
          showToast('error', err.message);
          return { ok: false, authExpired: true };
        }
        const msg = err instanceof Error ? err.message : 'Failed to back up data to Google Sheets.';
        setSheetsSyncError(msg);
        showToast('error', msg);
        return { ok: false };
      } finally {
        setIsSyncingSheets(false);
      }
    },
    [db, showToast]
  );

  const syncViaAppsScript = useCallback(
    async (
      webhookUrl: string,
      spreadsheetId = DEFAULT_BACKUP_SPREADSHEET_ID
    ): Promise<{ ok: boolean; result?: BackupResult }> => {
      setSheetsSyncError(null);
      setIsSyncingSheets(true);
      try {
        const result = await backupViaAppsScriptWebhook(webhookUrl, db, spreadsheetId);
        setLastSheetsBackup(result);
        showToast('success', 'All agency data sent to Google Sheets via Apps Script!');
        return { ok: true, result };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Apps Script backup failed.';
        setSheetsSyncError(msg);
        showToast('error', msg);
        return { ok: false };
      } finally {
        setIsSyncingSheets(false);
      }
    },
    [db, showToast]
  );

  return (
    <TourismContext.Provider
      value={{
        db,
        activeRoute,
        setActiveRoute,
        focusedRecordId,
        setFocusedRecordId,
        navigateToRecord,
        isLocked,
        unlockApp,
        lockApp,
        toasts,
        showToast,
        dismissToast,
        getPaidForBooking,
        getRemainingForBooking,
        getCustomerStats,
        financialSummary,
        addBooking,
        updateBooking,
        deleteBooking,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        addPayment,
        updatePayment,
        deletePayment,
        addExpense,
        updateExpense,
        deleteExpense,
        addPackage,
        updatePackage,
        deletePackage,
        addStaff,
        updateStaff,
        deleteStaff,
        recordStaffSalary,
        addPartner,
        updatePartner,
        deletePartner,
        updateSettings,
        clearDemoDataOnly,
        resetDemoData,
        exportBackup,
        importBackup,
        isSyncingSheets,
        lastSheetsBackup,
        sheetsSyncError,
        serializeCurrentStateAsJson,
        syncAllToSheets,
        syncViaAppsScript,
      }}
    >
      {children}
    </TourismContext.Provider>
  );
}

export function useTourism(): TourismContextValue {
  const ctx = useContext(TourismContext);
  if (!ctx) throw new Error('useTourism must be used inside TourismProvider');
  return ctx;
}
