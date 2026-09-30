import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import { NAV_ITEMS } from './config/navigation';
import DashboardPage from './pages/DashboardPage';
import ModulePlaceholderPage from './pages/ModulePlaceholderPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        {/* Replaced module by module as each phase is delivered. */}
        {NAV_ITEMS.filter((item) => item.path !== '/').map((item) => (
          <Route
            key={item.path}
            path={item.path}
            element={<ModulePlaceholderPage title={item.label} phase={item.phase} />}
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
