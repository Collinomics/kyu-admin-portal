import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import ProtectedRoute from './routes/ProtectedRoute';
import { AuthProvider } from './features/auth/AuthContext';
import { ToastProvider } from './components/ui/KyToast';
import ErrorBoundary from './components/ErrorBoundary';
import NotFoundPage from './components/NotFoundPage';
import LoginPage from './features/auth/LoginPage';
import OnboardingPage from './features/auth/OnboardingPage';
import ForgotPasswordPage from './features/auth/ForgotPasswordPage';
import ResetPasswordPage from './features/auth/ResetPasswordPage';
import DashboardPage from './features/dashboard/DashboardPage';
import UsersPage from './features/users/UsersPage';
import ProgrammesPage from './features/programmes/ProgrammesPage';
import AdmissionsPage from './features/admissions/AdmissionsPage';
import SettingsPage from './features/settings/SettingsPage';
import AuditLogPage from './features/audit/AuditLogPage';
import RolesPage from './features/roles/RolesPage';
import OrganisationPage from './features/organisation/OrganisationPage';
import AffiliatesPage from './features/organisation/AffiliatesPage';
import MotionEnhancer from './components/MotionEnhancer';
import MyAccountPage from './features/profile/MyAccountPage';

const AiMonitorModule = lazy(() => import('./features/ai-monitor/AiMonitorModule'));
const CataloguePage = lazy(() => import('./features/catalogue/CataloguePage'));

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <MotionEnhancer />
          <ErrorBoundary>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              <Route path="/" element={<Suspense fallback={<div className="min-h-screen bg-[#0E3F73]" role="status" aria-label="Loading programme catalogue" />}><CataloguePage /></Suspense>} />
              <Route path="/catalogue" element={<Navigate to="/" replace />} />

              {/* Protected admin area */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="organisation" element={<OrganisationPage />} />
                <Route path="affiliates" element={<AffiliatesPage />} />
                <Route path="programmes" element={<ProgrammesPage />} />
                <Route path="admissions" element={<AdmissionsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="audit-log" element={<AuditLogPage />} />
                <Route path="roles" element={<RolesPage />} />
                <Route path="profile" element={<MyAccountPage />} />
                <Route
                  path="ai-monitor/*"
                  element={
                    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />}>
                      <AiMonitorModule />
                    </Suspense>
                  }
                />
              </Route>

              {/* Anything else = friendly 404 */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
