import { Route, Routes } from 'react-router-dom';
import { RequireAccess, RequireAuth } from './auth/guards';
import AppLayout from './components/layout/AppLayout';
import { NAV_ITEMS } from './config/navigation';
import { PERMISSIONS } from './config/permissions';
import AssignmentsPage from './features/assignments/AssignmentsPage';
import CompaniesPage from './features/companies/CompaniesPage';
import CompanyDetailPage from './features/companies/CompanyDetailPage';
import CompanySettlementsPage from './features/company-settlements/CompanySettlementsPage';
import DriverDetailPage from './features/drivers/DriverDetailPage';
import AdvancesPage from './features/driver-finance/AdvancesPage';
import EarningsPage from './features/driver-finance/EarningsPage';
import { DriverExpensesPage, LvExpensesPage } from './features/driver-finance/ExpensePages';
import DriversPage from './features/drivers/DriversPage';
import GstPage, { TaxReportsPage } from './features/gst/GstPage';
import ImportBatchPage from './features/imports/ImportBatchPage';
import ImportsPage from './features/imports/ImportsPage';
import PaymentsPage from './features/payments/PaymentsPage';
import {
  CompanyProfitPage,
  MonthlyProfitPage,
  OverallProfitPage,
} from './features/profit/ProfitPages';
import { ExportsPage } from './features/reports/ReportsPage';
import {
  DriverReportsPage,
  ExpenseReportsPage,
  PaymentReportsPage,
  ProfitReportsPage,
  ReconciliationPage,
  SettlementReportsPage,
  TripReportsPage,
} from './features/reports/reportPages';
import RolesPage from './features/roles/RolesPage';
import SettingsPage from './features/settings/SettingsPage';
import SettlementDetailPage from './features/settlements/SettlementDetailPage';
import SettlementsPage from './features/settlements/SettlementsPage';
import TripDetailPage from './features/trips/TripDetailPage';
import TripsPage from './features/trips/TripsPage';
import UsersPage from './features/users/UsersPage';
import VehicleTypeDetailPage from './features/vehicle-types/VehicleTypeDetailPage';
import VehicleTypesPage from './features/vehicle-types/VehicleTypesPage';
import VehicleDetailPage from './features/vehicles/VehicleDetailPage';
import VehiclesPage from './features/vehicles/VehiclesPage';
import DashboardPage from './pages/DashboardPage';
import FinanceDashboardPage from './pages/FinanceDashboardPage';
import LoginPage from './pages/LoginPage';
import ModulePlaceholderPage from './pages/ModulePlaceholderPage';
import NotFoundPage from './pages/NotFoundPage';

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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
