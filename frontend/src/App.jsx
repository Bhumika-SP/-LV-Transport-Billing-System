import { Route, Routes } from 'react-router-dom';
import { RequireAccess, RequireAuth } from './auth/guards';
import AppLayout from './components/layout/AppLayout';
import { NAV_ITEMS } from './config/navigation';
import RolesPage from './features/roles/RolesPage';
import UsersPage from './features/users/UsersPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ModulePlaceholderPage from './pages/ModulePlaceholderPage';
import NotFoundPage from './pages/NotFoundPage';

/** Delivered modules: nav path -> page. Everything else renders a placeholder. */
const PAGES = {
  '/users': UsersPage,
  '/roles': RolesPage,
};

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
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
