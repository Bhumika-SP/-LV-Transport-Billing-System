import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAccess, RequireAuth } from './auth/guards';
import AppLayout from './components/layout/AppLayout';
import { NAV_ITEMS } from './config/navigation';
import { PERMISSIONS } from './config/permissions';
import LoginPage from './pages/LoginPage';
import ModulePlaceholderPage from './pages/ModulePlaceholderPage';
import NotFoundPage from './pages/NotFoundPage';

// Feature pages load on demand so the first screen does not download every module.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AssignmentsPage = lazy(() => import('./features/assignments/AssignmentsPage'));
const CompaniesPage = lazy(() => import('./features/companies/CompaniesPage'));
const CompanyDetailPage = lazy(() => import('./features/companies/CompanyDetailPage'));
const CompanySettlementsPage = lazy(
  () => import('./features/company-settlements/CompanySettlementsPage'),
);
const DriverDetailPage = lazy(() => import('./features/drivers/DriverDetailPage'));
const AdvancesPage = lazy(() => import('./features/driver-finance/AdvancesPage'));
const EarningsPage = lazy(() => import('./features/driver-finance/EarningsPage'));
const DriverExpensesPage = lazy(() =>
  import('./features/driver-finance/ExpensePages').then((m) => ({ default: m.DriverExpensesPage })),
);
const LvExpensesPage = lazy(() =>
  import('./features/driver-finance/ExpensePages').then((m) => ({ default: m.LvExpensesPage })),
);
const DriversPage = lazy(() => import('./features/drivers/DriversPage'));
const AuditLogsPage = lazy(() => import('./features/audit/AuditLogsPage'));
const GstPage = lazy(() => import('./features/gst/GstPage'));
const TaxReportsPage = lazy(() =>
  import('./features/gst/GstPage').then((m) => ({ default: m.TaxReportsPage })),
);
const ImportBatchPage = lazy(() => import('./features/imports/ImportBatchPage'));
const NotificationsPage = lazy(() => import('./features/notifications/NotificationsPage'));
const ImportsPage = lazy(() => import('./features/imports/ImportsPage'));
const PaymentsPage = lazy(() => import('./features/payments/PaymentsPage'));
const CompanyProfitPage = lazy(() =>
  import('./features/profit/ProfitPages').then((m) => ({ default: m.CompanyProfitPage })),
);
const MonthlyProfitPage = lazy(() =>
  import('./features/profit/ProfitPages').then((m) => ({ default: m.MonthlyProfitPage })),
);
const OverallProfitPage = lazy(() =>
  import('./features/profit/ProfitPages').then((m) => ({ default: m.OverallProfitPage })),
);
const ExportsPage = lazy(() =>
  import('./features/reports/ReportsPage').then((m) => ({ default: m.ExportsPage })),
);
const DriverReportsPage = lazy(() =>
  import('./features/reports/reportPages').then((m) => ({ default: m.DriverReportsPage })),
);
const ExpenseReportsPage = lazy(() =>
  import('./features/reports/reportPages').then((m) => ({ default: m.ExpenseReportsPage })),
);
const PaymentReportsPage = lazy(() =>
  import('./features/reports/reportPages').then((m) => ({ default: m.PaymentReportsPage })),
);
const ProfitReportsPage = lazy(() =>
  import('./features/reports/reportPages').then((m) => ({ default: m.ProfitReportsPage })),
);
const ReconciliationPage = lazy(() =>
  import('./features/reports/reportPages').then((m) => ({ default: m.ReconciliationPage })),
);
const SettlementReportsPage = lazy(() =>
  import('./features/reports/reportPages').then((m) => ({ default: m.SettlementReportsPage })),
);
const TripReportsPage = lazy(() =>
  import('./features/reports/reportPages').then((m) => ({ default: m.TripReportsPage })),
);
const RolesPage = lazy(() => import('./features/roles/RolesPage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));
const SettlementDetailPage = lazy(() => import('./features/settlements/SettlementDetailPage'));
const SettlementsPage = lazy(() => import('./features/settlements/SettlementsPage'));
const TripDetailPage = lazy(() => import('./features/trips/TripDetailPage'));
const TripsPage = lazy(() => import('./features/trips/TripsPage'));
const UsersPage = lazy(() => import('./features/users/UsersPage'));
const VehicleTypeDetailPage = lazy(() => import('./features/vehicle-types/VehicleTypeDetailPage'));
const VehicleTypesPage = lazy(() => import('./features/vehicle-types/VehicleTypesPage'));
const VehicleDetailPage = lazy(() => import('./features/vehicles/VehicleDetailPage'));
const VehiclesPage = lazy(() => import('./features/vehicles/VehiclesPage'));
const FinanceDashboardPage = lazy(() => import('./pages/FinanceDashboardPage'));

/** Delivered modules: nav path -> page. Everything else renders a placeholder. */
const PAGES = {
  '/users': UsersPage,
  '/roles': RolesPage,
  '/settings': SettingsPage,
  '/companies': CompaniesPage,
  '/drivers': DriversPage,
  '/vehicles': VehiclesPage,
  '/vehicle-types': VehicleTypesPage,
  '/assignments': AssignmentsPage,
  '/company-settlements': CompanySettlementsPage,
  '/trips': TripsPage,
  '/imports': ImportsPage,
  '/earnings': EarningsPage,
  '/driver-expenses': DriverExpensesPage,
  '/lv-expenses': LvExpensesPage,
  '/advances': AdvancesPage,
  '/settlements': SettlementsPage,
  '/payments': PaymentsPage,
  '/profit/company': CompanyProfitPage,
  '/profit/monthly': MonthlyProfitPage,
  '/profit/overall': OverallProfitPage,
  '/finance': FinanceDashboardPage,
  '/reconciliation': ReconciliationPage,
  '/exports': ExportsPage,
  '/gst': GstPage,
  '/audit': AuditLogsPage,
  '/tax-reports': TaxReportsPage,
  '/reports/drivers': DriverReportsPage,
  '/reports/trips': TripReportsPage,
  '/reports/expenses': ExpenseReportsPage,
  '/reports/settlements': SettlementReportsPage,
  '/reports/payments': PaymentReportsPage,
  '/reports/profit': ProfitReportsPage,
};

/** Routes that are not nav entries (detail pages). */
const DETAIL_ROUTES = [
  { path: '/companies/:id', Page: CompanyDetailPage, permission: PERMISSIONS.MASTER_VIEW },
  { path: '/drivers/:id', Page: DriverDetailPage, permission: PERMISSIONS.MASTER_VIEW },
  { path: '/vehicles/:id', Page: VehicleDetailPage, permission: PERMISSIONS.MASTER_VIEW },
  { path: '/vehicle-types/:id', Page: VehicleTypeDetailPage, permission: PERMISSIONS.MASTER_VIEW },
  { path: '/trips/:id', Page: TripDetailPage, permission: PERMISSIONS.TRIP_VIEW },
  { path: '/imports/:id', Page: ImportBatchPage, permission: PERMISSIONS.IMPORT_VIEW },
  { path: '/settlements/:id', Page: SettlementDetailPage, permission: PERMISSIONS.SETTLEMENT_VIEW },
];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          {NAV_ITEMS.filter((item) => item.path !== '/').map((item) => {
            const Page = PAGES[item.path];
            return (
              <Route
                key={item.path}
                path={item.path}
                element={
                  <RequireAccess permission={item.permission} roles={item.roles}>
                    {Page ? (
                      <Page />
                    ) : (
                      <ModulePlaceholderPage title={item.label} phase={item.phase} />
                    )}
                  </RequireAccess>
                }
              />
            );
          })}
          {DETAIL_ROUTES.map(({ path, Page, permission }) => (
            <Route
              key={path}
              path={path}
              element={
                <RequireAccess permission={permission}>
                  <Page />
                </RequireAccess>
              }
            />
          ))}
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
