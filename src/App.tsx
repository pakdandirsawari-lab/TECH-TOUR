import React from 'react';
import { AppShell, LockScreen } from './components/layout/AppShell';
import { ToastStack } from './components/ui/CommonUI';
import { BookingsView } from './components/views/BookingsView';
import { CustomersView } from './components/views/CustomersView';
import { DashboardView } from './components/views/DashboardView';
import { ExpensesView } from './components/views/ExpensesView';
import { PackagesView } from './components/views/PackagesView';
import { PaymentsView } from './components/views/PaymentsView';
import { ReportsView } from './components/views/ReportsView';
import { SettingsView } from './components/views/SettingsView';
import { StaffPartnersView } from './components/views/StaffPartnersView';
import { TourismProvider, useTourism } from './context/TourismContext';

function WorkspaceRouter() {
  const { activeRoute, currentUser, isAuthChecking, isAdmin, toasts, dismissToast } = useTourism();

  if (isAuthChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1739] p-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-9 w-9 animate-spin rounded-full border-3 border-blue-400 border-t-transparent" />
          <p className="text-sm font-medium text-slate-200">Verifying workspace session...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <LockScreen />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const resolvedRoute = !isAdmin && activeRoute === 'settings' ? 'dashboard' : activeRoute;

  return (
    <>
      <AppShell>
        {resolvedRoute === 'dashboard' && <DashboardView />}
        {resolvedRoute === 'bookings' && <BookingsView />}
        {resolvedRoute === 'customers' && <CustomersView />}
        {resolvedRoute === 'payments' && <PaymentsView />}
        {resolvedRoute === 'expenses' && <ExpensesView />}
        {resolvedRoute === 'packages' && <PackagesView />}
        {resolvedRoute === 'staff' && <StaffPartnersView />}
        {resolvedRoute === 'reports' && <ReportsView />}
        {resolvedRoute === 'settings' && <SettingsView />}
      </AppShell>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default function App() {
  return (
    <TourismProvider>
      <WorkspaceRouter />
    </TourismProvider>
  );
}
