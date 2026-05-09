// apps/admin/src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import UsersPage from './pages/UsersPage';
import ClassesPage from './pages/ClassesPage';
import MonitorPage from './pages/MonitorPage';
import AuditPage from './pages/AuditPage';
import BulkImportPage from './pages/BulkImportPage';
import SENPage from './pages/SENPage';
import SchoolSettingsPage from './pages/SchoolSettingsPage';
import GDPRPage from './pages/GDPRPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<OverviewPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/import" element={<BulkImportPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="monitor" element={<MonitorPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="sen" element={<SENPage />} />
        <Route path="settings" element={<SchoolSettingsPage />} />
        <Route path="gdpr" element={<GDPRPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
