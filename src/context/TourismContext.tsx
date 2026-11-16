import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createEmptyDatabase } from '../data/emptyDatabase';
import {
  configureCloudSheets,
  deleteCloudRecord,
  fetchAuthMe,
  fetchCloudDatabase,
  fetchCloudStatus,
  fetchCloudVersion,
  loginWithCredentials,
  logoutSession,
  migrateLocalDataToCloud,
  saveCloudSettings,
  upsertCloudRecords,
} from '../services/cloudSheetsApi';
import {
  clearVerifiedLocalStorageKeys,
  scanBrowserStorageForTourismData,
} from '../services/localMigration';
import { tourismJsonHelpers } from '../services/storage';
import type {
  AgencySettings,
  AppRoute,
  AuthUser,
  Booking,
  CloudStatusInfo,
  CloudSyncStatus,
  Customer,
  Expense,
  LocalStorageScanResult,
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

export interface MigrationState {
  status: 'idle' | 'scanning' | 'migrating' | 'success' | 'error';
  message: string;
}

interface TourismContextValue {
  db: TourismDatabase;
  activeRoute: AppRoute;
  setActiveRoute: (route: AppRoute) => void;
  focusedRecordId: string | null;
  setFocusedRecordId: (id: string | null) => void;
  navigateToRecord: (route: AppRoute, recordId?: string) => void;

  // Authentication & RBAC
  currentUser: AuthUser | null;
  isAuthChecking: boolean;
  isAdmin: boolean;
  canDelete: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;

  // Google Sheets Central Cloud Sync
  cloudStatus: CloudStatusInfo | null;
  syncStatus: CloudSyncStatus;
  cloudError: string | null;
  cloudVersion: number;
  lastSyncedAt: string | null;
  refreshFromCloud: (silent?: boolean) => Promise<void>;
  connectCloudSheets: (params: {
    webAppUrl: string;
    apiSecret?: string;
    spreadsheetId?: string;
  }) => Promise<boolean>;

  // Local Storage Migration
  localScan: LocalStorageScanResult | null;
  migrationState: MigrationState;
  rescanLocalData: (includeDemo?: boolean) => Promise<LocalStorageScanResult>;
  runLocalMigration: (clearLocalAfterVerify?: boolean) => Promise<boolean>;

  // Notifications
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

  // Settings & JSON Import/Export
  updateSettings: (nextSettings: AgencySettings) => void;
  exportBackup: () => string;
  importBackup: (jsonText: string) => void;
}

const TourismContext = createContext<TourismContextValue | null>(null);

export function TourismProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<TourismDatabase>(() => createEmptyDatabase());
  const [activeRoute, setActiveRoute] = useState<AppRoute>('dashboard');
  const [focusedRecordId, setFocusedRecordId] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [cloudStatus, setCloudStatus] = useState<CloudStatusInfo | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>('idle');
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudVersion, setCloudVersion] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [localScan, setLocalScan] = useState<LocalStorageScanResult | null>(null);
  const [migrationState, setMigrationState] = useState<MigrationState>({ status: 'idle', message: '' });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const knownVersionRef = useRef(0);
  const isFetchingCloudRef = useRef(false);
  const dbRef = useRef(db);
  dbRef.current = db;

  const isAdmin = currentUser?.role === 'admin';
  const canDelete = isAdmin;

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const navigateToRecord = useCallback((route: AppRoute, recordId?: string) => {
    setActiveRoute(route);
    setFocusedRecordId(recordId ?? null);
  }, []);

  // Sync Tailwind dark mode class with settings.theme
  useEffect(() => {
    const root = document.documentElement;
    if (db.settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [db.settings.theme]);

  const applyCloudSnapshot = useCallback(
    (payload: { version: number; updatedAt: string; data: TourismDatabase }, userOverride?: AuthUser | null) => {
      knownVersionRef.current = payload.version;
      setCloudVersion(payload.version);
      setLastSyncedAt(new Date().toLocaleTimeString());
      setSyncStatus('synced');
      setCloudError(null);
      const activeUser = userOverride ?? currentUser;
      setDb((prev) => ({
        ...payload.data,
        settings: {
          ...prev.settings,
          ...payload.data.settings,
          userProfile: activeUser
            ? {
                id: activeUser.id,
                name: activeUser.name,
                email: activeUser.email,
                role: activeUser.role === 'admin' ? 'Administrator' : 'Staff Member',
                avatar: activeUser.avatar,
              }
            : payload.data.settings.userProfile,
        },
      }));
    },
    [currentUser]
  );

  const refreshFromCloud = useCallback(
    async (silent = false) => {
      if (!currentUser || isFetchingCloudRef.current) return;
      isFetchingCloudRef.current = true;
      if (!silent) setSyncStatus('syncing');
      try {
        const status = await fetchCloudStatus();
        setCloudStatus(status);
        if (!status.configured) {
          setSyncStatus('unconfigured');
          setCloudError(null);
          return;
        }
        if (!status.connected) {
          setSyncStatus('error');
          setCloudError(status.error || 'Unable to reach Google Sheets Web App.');
          return;
        }
        const snapshot = await fetchCloudDatabase();
        applyCloudSnapshot(snapshot, currentUser);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to sync with Google Sheets.';
        setSyncStatus('error');
        setCloudError(msg);
        if (!silent) showToast('error', msg);
      } finally {
        isFetchingCloudRef.current = false;
      }
    },
    [applyCloudSnapshot, currentUser, showToast]
  );

  // Check initial authentication session on mount (never loads customer PII before auth)
  useEffect(() => {
    let active = true;
    void fetchAuthMe()
      .then((res) => {
        if (!active) return;
        if (res.authenticated && res.user) {
          setCurrentUser(res.user);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => {
        if (active) setCurrentUser(null);
      })
      .finally(() => {
        if (active) setIsAuthChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Load shared Google Sheets data & scan local browser storage when authenticated
  useEffect(() => {
    if (!currentUser) {
      setDb(createEmptyDatabase());
      setCloudStatus(null);
      setSyncStatus('idle');
      knownVersionRef.current = 0;
      setCloudVersion(0);
      return;
    }

    void refreshFromCloud(false);

    if (currentUser.role === 'admin') {
      void scanBrowserStorageForTourismData(false).then((scan) => {
        setLocalScan(scan);
      });
    }
  }, [currentUser, refreshFromCloud]);

  // Real-time 4-second polling + SSE subscription when Google Sheets is connected
  useEffect(() => {
    if (!currentUser || !cloudStatus?.configured || !cloudStatus.connected) return;
    let active = true;

    const checkAndPullIfStale = async () => {
      if (!active || isFetchingCloudRef.current) return;
      try {
        const v = await fetchCloudVersion();
        if (active && v.configured && v.version > knownVersionRef.current) {
          await refreshFromCloud(true);
        }
      } catch {
        // silent transient poll failure
      }
    };

    const pollTimer = setInterval(() => {
      void checkAndPullIfStale();
    }, 4000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkAndPullIfStale();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/cloud/events', { withCredentials: true });
      eventSource.onmessage = (event) => {
        if (!active) return;
        try {
          const msg = JSON.parse(event.data) as { type?: string; version?: number };
          if (
            msg.type === 'db_updated' &&
            typeof msg.version === 'number' &&
            msg.version > knownVersionRef.current
          ) {
            void refreshFromCloud(true);
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // SSE optional; 4s poll remains active
    }

    return () => {
      active = false;
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      eventSource?.close();
    };
  }, [cloudStatus?.configured, cloudStatus?.connected, currentUser, refreshFromCloud]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { user } = await loginWithCredentials(email, password);
      setCurrentUser(user);
      showToast('success', `Signed in as ${user.name} (${user.role.toUpperCase()})`);
    },
    [showToast]
  );

  const signOut = useCallback(async () => {
    await logoutSession();
    setCurrentUser(null);
    setDb(createEmptyDatabase());
    setActiveRoute('dashboard');
    showToast('info', 'Signed out securely.');
  }, [showToast]);

  const connectCloudSheets = useCallback(
    async (params: { webAppUrl: string; apiSecret?: string; spreadsheetId?: string }): Promise<boolean> => {
      setSyncStatus('connecting');
      setCloudError(null);
      try {
        const res = await configureCloudSheets(params);
        showToast('success', `Connected to Google Sheet "${res.spreadsheetTitle}"!`);
        await refreshFromCloud(false);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to connect Google Sheets.';
        setSyncStatus('error');
        setCloudError(msg);
        showToast('error', msg);
        return false;
      }
    },
    [refreshFromCloud, showToast]
  );

  const rescanLocalData = useCallback(async (includeDemo = false) => {
    setMigrationState({ status: 'scanning', message: 'Scanning localStorage, sessionStorage, and IndexedDB...' });
    const scan = await scanBrowserStorageForTourismData(includeDemo);
    setLocalScan(scan);
    setMigrationState({
      status: 'idle',
      message:
        scan.totalRecords > 0
          ? `Found ${scan.totalRecords} local records across ${scan.sourcesFound.join(', ')}.`
          : 'No unmigrated local records detected.',
    });
    return scan;
  }, []);

  const runLocalMigration = useCallback(
    async (clearLocalAfterVerify = true): Promise<boolean> => {
      if (!cloudStatus?.configured) {
        const msg = 'Connect your Google Apps Script Web App URL first before migrating.';
        setMigrationState({ status: 'error', message: msg });
        showToast('error', msg);
        return false;
      }

      setMigrationState({ status: 'migrating', message: 'Uploading and verifying local records in Google Sheets...' });
      try {
        const scan = localScan ?? (await scanBrowserStorageForTourismData(false));
        const res = await migrateLocalDataToCloud(scan.data);
        if (!res.ok || !res.verified) {
          throw new Error('Cloud migration verification did not pass. Local data was preserved.');
        }

        const addedTotal = Object.values(res.summary || {}).reduce((sum, s) => sum + (s.added || 0), 0);
        const updatedTotal = Object.values(res.summary || {}).reduce((sum, s) => sum + (s.updated || 0), 0);

        if (clearLocalAfterVerify) {
          clearVerifiedLocalStorageKeys(scan);
          const refreshedScan = await scanBrowserStorageForTourismData(false);
          setLocalScan(refreshedScan);
        }

        await refreshFromCloud(true);
        const successMsg = `Verified Google Sheets migration: ${addedTotal} added, ${updatedTotal} updated without duplicates.`;
        setMigrationState({ status: 'success', message: successMsg });
        showToast('success', successMsg);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Migration failed. Existing local data was kept safe.';
        setMigrationState({ status: 'error', message: msg });
        showToast('error', msg);
        return false;
      }
    },
    [cloudStatus?.configured, localScan, refreshFromCloud, showToast]
  );

  // Helper to run cloud writes and update version/status cleanly
  const syncMutation = useCallback(
    async (op: () => Promise<{ version: number; updatedAt: string }>, successToast?: string) => {
      if (!cloudStatus?.configured) {
        const msg = 'Google Sheets is not connected yet. Configure Web App URL in Settings to save changes to the cloud.';
        showToast('error', msg);
        setSyncStatus('unconfigured');
        return;
      }
      setSyncStatus('syncing');
      try {
        const res = await op();
        if (typeof res.version === 'number' && res.version > knownVersionRef.current) {
          knownVersionRef.current = res.version;
          setCloudVersion(res.version);
        }
        setLastSyncedAt(new Date().toLocaleTimeString());
        setSyncStatus('synced');
        setCloudError(null);
        if (successToast) showToast('success', successToast);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Google Sheets sync failed.';
        setSyncStatus('error');
        setCloudError(msg);
        showToast('error', msg);
        void refreshFromCloud(true);
      }
    },
    [cloudStatus?.configured, refreshFromCloud, showToast]
  );

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

  // CRUD: Bookings
  const addBooking = useCallback(
    (
      bookingInput: Omit<Booking, 'id'>,
      advanceAmount = 0,
      advanceMethod: PaymentMethod = 'UPI',
      advanceRef = ''
    ): Booking => {
      const snapshot = dbRef.current;
      const newId = generateBookingId(snapshot.bookings.map((b) => b.id));
      const createdBooking: Booking = { ...bookingInput, id: newId };
      let initialPayment: Payment | null = null;
      if (advanceAmount > 0) {
        const payId = generateNextId('PAY', snapshot.payments.map((p) => p.id), 4);
        initialPayment = {
          id: payId,
          bookingId: newId,
          customerId: createdBooking.customerId,
          customerName: createdBooking.customerName,
          paymentDate: createdBooking.bookingDate || getTodayISO(),
          amount: advanceAmount,
          method: advanceMethod,
          transactionRef: advanceRef || `ADV-${newId}`,
          notes: `Initial advance payment for ${newId}`,
        };
      }

      setDb((prev) => ({
        ...prev,
        bookings: [createdBooking, ...prev.bookings],
        payments: initialPayment ? [initialPayment, ...prev.payments] : prev.payments,
      }));

      void syncMutation(async () => {
        const res = await upsertCloudRecords('bookings', createdBooking);
        if (initialPayment) {
          return upsertCloudRecords('payments', initialPayment);
        }
        return res;
      }, 'Booking saved to Google Sheets.');

      return createdBooking;
    },
    [syncMutation]
  );

  const updateBooking = useCallback(
    (booking: Booking) => {
      const affectedPayments = dbRef.current.payments
        .filter((p) => p.bookingId === booking.id)
        .map((p) => ({ ...p, customerName: booking.customerName, customerId: booking.customerId }));

      setDb((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) => (b.id === booking.id ? booking : b)),
        payments: prev.payments.map((p) =>
          p.bookingId === booking.id ? { ...p, customerName: booking.customerName, customerId: booking.customerId } : p
        ),
      }));

      void syncMutation(async () => {
        const res = await upsertCloudRecords('bookings', booking);
        if (affectedPayments.length > 0) {
          return upsertCloudRecords('payments', affectedPayments);
        }
        return res;
      }, `Booking ${booking.id} synced to Google Sheets.`);
    },
    [syncMutation]
  );

  const deleteBooking = useCallback(
    (bookingId: string) => {
      if (!canDelete) {
        showToast('error', 'Only Administrators can delete bookings.');
        return;
      }
      setDb((prev) => ({
        ...prev,
        bookings: prev.bookings.filter((b) => b.id !== bookingId),
        payments: prev.payments.filter((p) => p.bookingId !== bookingId),
        expenses: prev.expenses.map((e) =>
          e.relatedBookingId === bookingId ? { ...e, relatedBookingId: undefined } : e
        ),
      }));

      void syncMutation(
        () => deleteCloudRecord('bookings', bookingId, true),
        `Booking ${bookingId} and linked payments deleted from Google Sheets.`
      );
    },
    [canDelete, showToast, syncMutation]
  );

  // CRUD: Customers
  const addCustomer = useCallback(
    (input: Omit<Customer, 'id' | 'createdAt'>): Customer => {
      const id = generateNextId('CUS', dbRef.current.customers.map((c) => c.id), 4);
      const created: Customer = { ...input, id, createdAt: getTodayISO() };
      setDb((prev) => ({ ...prev, customers: [created, ...prev.customers] }));
      void syncMutation(() => upsertCloudRecords('customers', created), 'Customer saved to Google Sheets.');
      return created;
    },
    [syncMutation]
  );

  const updateCustomer = useCallback(
    (customer: Customer) => {
      const linkedBookings = dbRef.current.bookings
        .filter((b) => b.customerId === customer.id)
        .map((b) => ({
          ...b,
          customerName: customer.fullName,
          customerPhone: customer.phone,
          customerEmail: customer.email,
        }));
      const linkedPayments = dbRef.current.payments
        .filter((p) => p.customerId === customer.id)
        .map((p) => ({ ...p, customerName: customer.fullName }));

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

      void syncMutation(async () => {
        let res = await upsertCloudRecords('customers', customer);
        if (linkedBookings.length > 0) res = await upsertCloudRecords('bookings', linkedBookings);
        if (linkedPayments.length > 0) res = await upsertCloudRecords('payments', linkedPayments);
        return res;
      }, `Customer ${customer.fullName} synced to Google Sheets.`);
    },
    [syncMutation]
  );

  const deleteCustomer = useCallback(
    (customerId: string) => {
      if (!canDelete) {
        showToast('error', 'Only Administrators can delete customers.');
        return;
      }
      setDb((prev) => ({
        ...prev,
        customers: prev.customers.filter((c) => c.id !== customerId),
      }));
      void syncMutation(() => deleteCloudRecord('customers', customerId), 'Customer deleted from Google Sheets.');
    },
    [canDelete, showToast, syncMutation]
  );

  // CRUD: Payments
  const addPayment = useCallback(
    (input: Omit<Payment, 'id'>): Payment => {
      const id = generateNextId('PAY', dbRef.current.payments.map((p) => p.id), 4);
      const created: Payment = { ...input, id };
      setDb((prev) => ({ ...prev, payments: [created, ...prev.payments] }));
      void syncMutation(
        () => upsertCloudRecords('payments', created),
        'Payment recorded in Google Sheets.'
      );
      return created;
    },
    [syncMutation]
  );

  const updatePayment = useCallback(
    (payment: Payment) => {
      setDb((prev) => ({
        ...prev,
        payments: prev.payments.map((p) => (p.id === payment.id ? payment : p)),
      }));
      void syncMutation(
        () => upsertCloudRecords('payments', payment),
        `Payment ${payment.id} synced to Google Sheets.`
      );
    },
    [syncMutation]
  );

  const deletePayment = useCallback(
    (paymentId: string) => {
      if (!canDelete) {
        showToast('error', 'Only Administrators can delete payments.');
        return;
      }
      setDb((prev) => ({
        ...prev,
        payments: prev.payments.filter((p) => p.id !== paymentId),
      }));
      void syncMutation(
        () => deleteCloudRecord('payments', paymentId),
        `Payment ${paymentId} deleted from Google Sheets.`
      );
    },
    [canDelete, showToast, syncMutation]
  );

  // CRUD: Expenses
  const addExpense = useCallback(
    (input: Omit<Expense, 'id'>): Expense => {
      const id = generateNextId('EXP', dbRef.current.expenses.map((e) => e.id), 4);
      const created: Expense = { ...input, id };
      setDb((prev) => ({ ...prev, expenses: [created, ...prev.expenses] }));
      void syncMutation(() => upsertCloudRecords('expenses', created), 'Expense saved to Google Sheets.');
      return created;
    },
    [syncMutation]
  );

  const updateExpense = useCallback(
    (expense: Expense) => {
      setDb((prev) => ({
        ...prev,
        expenses: prev.expenses.map((e) => (e.id === expense.id ? expense : e)),
      }));
      void syncMutation(
        () => upsertCloudRecords('expenses', expense),
        `Expense ${expense.id} synced to Google Sheets.`
      );
    },
    [syncMutation]
  );

  const deleteExpense = useCallback(
    (expenseId: string) => {
      if (!canDelete) {
        showToast('error', 'Only Administrators can delete expenses.');
        return;
      }
      setDb((prev) => ({
        ...prev,
        expenses: prev.expenses.filter((e) => e.id !== expenseId),
      }));
      void syncMutation(
        () => deleteCloudRecord('expenses', expenseId),
        `Expense ${expenseId} deleted from Google Sheets.`
      );
    },
    [canDelete, showToast, syncMutation]
  );

  // CRUD: Packages
  const addPackage = useCallback(
    (input: Omit<TourPackage, 'id'>): TourPackage => {
      const id = generateNextId('PKG', dbRef.current.packages.map((p) => p.id), 3);
      const created: TourPackage = { ...input, id };
      setDb((prev) => ({ ...prev, packages: [created, ...prev.packages] }));
      void syncMutation(() => upsertCloudRecords('packages', created), 'Tour package saved to Google Sheets.');
      return created;
    },
    [syncMutation]
  );

  const updatePackage = useCallback(
    (pkg: TourPackage) => {
      setDb((prev) => ({
        ...prev,
        packages: prev.packages.map((p) => (p.id === pkg.id ? pkg : p)),
      }));
      void syncMutation(
        () => upsertCloudRecords('packages', pkg),
        `Package ${pkg.name} synced to Google Sheets.`
      );
    },
    [syncMutation]
  );

  const deletePackage = useCallback(
    (packageId: string) => {
      if (!canDelete) {
        showToast('error', 'Only Administrators can delete packages.');
        return;
      }
      setDb((prev) => ({
        ...prev,
        packages: prev.packages.filter((p) => p.id !== packageId),
      }));
      void syncMutation(() => deleteCloudRecord('packages', packageId), 'Package deleted from Google Sheets.');
    },
    [canDelete, showToast, syncMutation]
  );

  // CRUD: Staff & Partners (Admin-controlled on backend)
  const addStaff = useCallback(
    (input: Omit<StaffMember, 'id' | 'salaryRecords'>): StaffMember => {
      const id = generateNextId('STF', dbRef.current.staff.map((s) => s.id), 3);
      const created: StaffMember = { ...input, id, salaryRecords: [] };
      setDb((prev) => ({ ...prev, staff: [created, ...prev.staff] }));
      void syncMutation(() => upsertCloudRecords('staff', created), 'Staff member saved to Google Sheets.');
      return created;
    },
    [syncMutation]
  );

  const updateStaff = useCallback(
    (member: StaffMember) => {
      setDb((prev) => ({
        ...prev,
        staff: prev.staff.map((s) => (s.id === member.id ? member : s)),
      }));
      void syncMutation(
        () => upsertCloudRecords('staff', member),
        `Staff profile for ${member.fullName} synced.`
      );
    },
    [syncMutation]
  );

  const deleteStaff = useCallback(
    (staffId: string) => {
      if (!canDelete) {
        showToast('error', 'Only Administrators can remove staff records.');
        return;
      }
      setDb((prev) => ({
        ...prev,
        staff: prev.staff.filter((s) => s.id !== staffId),
      }));
      void syncMutation(() => deleteCloudRecord('staff', staffId), 'Staff member deleted from Google Sheets.');
    },
    [canDelete, showToast, syncMutation]
  );

  const recordStaffSalary = useCallback(
    (staffId: string, salary: Omit<SalaryRecord, 'id'>, logAsExpense: boolean) => {
      const snapshot = dbRef.current;
      const member = snapshot.staff.find((s) => s.id === staffId);
      if (!member) return;

      const salId = `SAL-${Date.now().toString().slice(-5)}`;
      const newSalaryRecord: SalaryRecord = { ...salary, id: salId };
      const updatedMember: StaffMember = {
        ...member,
        salaryRecords: [newSalaryRecord, ...member.salaryRecords],
      };

      let salaryExpense: Expense | null = null;
      if (logAsExpense) {
        const expId = generateNextId('EXP', snapshot.expenses.map((e) => e.id), 4);
        salaryExpense = {
          id: expId,
          expenseDate: salary.paidDate,
          category: 'Staff Salary',
          description: `Salary for ${member.fullName} (${salary.month})`,
          vendorName: member.fullName,
          amount: salary.amount,
          paymentMethod: salary.method,
          notes: salary.notes || `${member.designation} salary payout`,
        };
      }

      setDb((prev) => ({
        ...prev,
        staff: prev.staff.map((s) => (s.id === staffId ? updatedMember : s)),
        expenses: salaryExpense ? [salaryExpense, ...prev.expenses] : prev.expenses,
      }));

      void syncMutation(async () => {
        const res = await upsertCloudRecords('staff', updatedMember);
        if (salaryExpense) {
          return upsertCloudRecords('expenses', salaryExpense);
        }
        return res;
      }, logAsExpense ? 'Salary recorded & added to Expenses in Google Sheets.' : 'Salary recorded in Google Sheets.');
    },
    [syncMutation]
  );

  const addPartner = useCallback(
    (input: Omit<Partner, 'id'>): Partner => {
      const id = generateNextId('PRT', dbRef.current.partners.map((p) => p.id), 3);
      const created: Partner = { ...input, id };
      setDb((prev) => ({ ...prev, partners: [created, ...prev.partners] }));
      void syncMutation(() => upsertCloudRecords('partners', created), 'Partner saved to Google Sheets.');
      return created;
    },
    [syncMutation]
  );

  const updatePartner = useCallback(
    (partner: Partner) => {
      setDb((prev) => ({
        ...prev,
        partners: prev.partners.map((p) => (p.id === partner.id ? partner : p)),
      }));
      void syncMutation(
        () => upsertCloudRecords('partners', partner),
        `Partner ${partner.name} synced to Google Sheets.`
      );
    },
    [syncMutation]
  );

  const deletePartner = useCallback(
    (partnerId: string) => {
      if (!canDelete) {
        showToast('error', 'Only Administrators can delete partners.');
        return;
      }
      setDb((prev) => ({
        ...prev,
        partners: prev.partners.filter((p) => p.id !== partnerId),
      }));
      void syncMutation(() => deleteCloudRecord('partners', partnerId), 'Partner deleted from Google Sheets.');
    },
    [canDelete, showToast, syncMutation]
  );

  // Settings & Cloud JSON Import/Export
  const updateSettings = useCallback(
    (nextSettings: AgencySettings) => {
      setDb((prev) => ({ ...prev, settings: nextSettings }));
      void syncMutation(() => saveCloudSettings(nextSettings), 'Agency settings saved to Google Sheets.');
    },
    [syncMutation]
  );

  const exportBackup = useCallback(() => {
    return tourismJsonHelpers.exportJson(db);
  }, [db]);

  const importBackup = useCallback(
    (jsonText: string) => {
      if (!isAdmin) {
        showToast('error', 'Only Administrators can import backups into Google Sheets.');
        return;
      }
      try {
        const parsed = tourismJsonHelpers.parseImportedJson(jsonText);
        setSyncStatus('syncing');
        void migrateLocalDataToCloud(parsed)
          .then(async (res) => {
            if (!res.ok) throw new Error('Cloud import failed.');
            await refreshFromCloud(true);
            showToast('success', 'JSON backup imported and merged into Google Sheets.');
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : 'Failed to import backup into Google Sheets.';
            setSyncStatus('error');
            showToast('error', msg);
          });
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Invalid JSON backup file.');
      }
    },
    [isAdmin, refreshFromCloud, showToast]
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
        currentUser,
        isAuthChecking,
        isAdmin,
        canDelete,
        signIn,
        signOut,
        cloudStatus,
        syncStatus,
        cloudError,
        cloudVersion,
        lastSyncedAt,
        refreshFromCloud,
        connectCloudSheets,
        localScan,
        migrationState,
        rescanLocalData,
        runLocalMigration,
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
        exportBackup,
        importBackup,
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
