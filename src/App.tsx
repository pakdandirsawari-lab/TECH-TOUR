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
  const { activeRoute, isLocked, toasts, dismissToast } = useTourism();

  if (isLocked) {
    return (
      <>
        <LockScreen />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <AppShell>
        {activeRoute === 'dashboard' && <DashboardView />}
        {activeRoute === 'bookings' && <BookingsView />}
        {activeRoute === 'customers' && <CustomersView />}
        {activeRoute === 'payments' && <PaymentsView />}
        {activeRoute === 'expenses' && <ExpensesView />}
        {activeRoute === 'packages' && <PackagesView />}
        {activeRoute === 'staff' && <StaffPartnersView />}
        {activeRoute === 'reports' && <ReportsView />}
        {activeRoute === 'settings' && <SettingsView />}
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
