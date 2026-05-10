// apps/console/src/App.tsx
//
// Cycle 2.0b / D6: customer-side console. Was apps/teacher (renamed) +
// apps/admin (folded in under /admin/*). Both are SPA-internal routes; the
// customer reaches both via the same vhost. Role-gated:
//   - TEACHER             ← can see /, /questions, /exams, etc.
//   - SCHOOL_ADMIN        ← can see all the above PLUS /admin/*
//   - PLATFORM_ADMIN      ← same as SCHOOL_ADMIN (vendor staff dropping into a
//                            customer's console for support; logged via audit)
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import QuestionBankPage from './pages/QuestionBankPage';
import ExamBuilderPage from './pages/ExamBuilderPage';
import ResultsPage from './pages/ResultsPage';
import PinsPage from './pages/PinsPage';
import LiveProctorPage from './pages/LiveProctorPage';
import SharedExamsPage from './pages/SharedExamsPage';
import GradingPage from './pages/GradingPage';
import AIGeneratorPage from './pages/AIGeneratorPage';
import SectionsPage from './pages/SectionsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import QTIImportPage from './pages/QTIImportPage';
import BlueprintPage from './pages/BlueprintPage';
import AnswerDistributionPage from './pages/AnswerDistributionPage';
import StudentProgressPage from './pages/StudentProgressPage';
import FeedbackPage from './pages/FeedbackPage';
import MagicLinksPage from './pages/MagicLinksPage';

// Admin pages — folded in from apps/admin in cycle 2.0b. Live under
// pages/admin/* so they're easy to find and easy to extract again if
// the school-admin role outgrows being a sibling section.
import AdminOverviewPage from './pages/admin/OverviewPage';
import AdminMonitorPage from './pages/admin/MonitorPage';
import AdminUsersPage from './pages/admin/UsersPage';
import AdminClassesPage from './pages/admin/ClassesPage';
import AdminBulkImportPage from './pages/admin/BulkImportPage';
import AdminAuditPage from './pages/admin/AuditPage';
import AdminSchoolSettingsPage from './pages/admin/SchoolSettingsPage';
import AdminGDPRPage from './pages/admin/GDPRPage';
import AdminSENPage from './pages/admin/SENPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  // SCHOOL_ADMIN owns the customer-side admin surface; PLATFORM_ADMIN gets
  // the same view for support impersonation. TEACHER and STUDENT do not.
  const allowed = user.role === 'SCHOOL_ADMIN' || user.role === 'PLATFORM_ADMIN';
  return allowed ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/exams/:id/live" element={<PrivateRoute><LiveProctorPage /></PrivateRoute>} />
      <Route path="/exams/:id/grade" element={<PrivateRoute><GradingPage /></PrivateRoute>} />
      <Route path="/exams/:id/feedback" element={<PrivateRoute><FeedbackPage /></PrivateRoute>} />
      <Route path="/exams/:id/magic-links" element={<PrivateRoute><MagicLinksPage /></PrivateRoute>} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        {/* Teacher (and admin) surface */}
        <Route index                              element={<DashboardPage />} />
        <Route path="questions"                   element={<QuestionBankPage />} />
        <Route path="questions/ai"                element={<AIGeneratorPage />} />
        <Route path="questions/qti"               element={<QTIImportPage />} />
        <Route path="exams/new"                   element={<ExamBuilderPage />} />
        <Route path="exams/:id/edit"              element={<ExamBuilderPage />} />
        <Route path="exams/:id/sections"          element={<SectionsPage />} />
        <Route path="exams/:id/results"           element={<ResultsPage />} />
        <Route path="exams/:id/analytics"         element={<AnalyticsPage />} />
        <Route path="exams/:id/blueprint"         element={<BlueprintPage />} />
        <Route path="exams/:id/distribution"      element={<AnswerDistributionPage />} />
        <Route path="exams/:id/pins"              element={<PinsPage />} />
        <Route path="students/:studentId/progress" element={<StudentProgressPage />} />
        <Route path="shared"                      element={<SharedExamsPage />} />

        {/* School-admin surface (cycle 2.0b / D6) */}
        <Route path="admin"          element={<AdminRoute><AdminOverviewPage /></AdminRoute>} />
        <Route path="admin/monitor"  element={<AdminRoute><AdminMonitorPage /></AdminRoute>} />
        <Route path="admin/users"    element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
        <Route path="admin/classes"  element={<AdminRoute><AdminClassesPage /></AdminRoute>} />
        <Route path="admin/import"   element={<AdminRoute><AdminBulkImportPage /></AdminRoute>} />
        <Route path="admin/audit"    element={<AdminRoute><AdminAuditPage /></AdminRoute>} />
        <Route path="admin/school"   element={<AdminRoute><AdminSchoolSettingsPage /></AdminRoute>} />
        <Route path="admin/gdpr"     element={<AdminRoute><AdminGDPRPage /></AdminRoute>} />
        <Route path="admin/sen"      element={<AdminRoute><AdminSENPage /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
