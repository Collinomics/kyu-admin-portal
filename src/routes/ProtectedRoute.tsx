import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import { canAccess } from './navigation';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center" aria-label="Restoring session">
        <div className="text-center text-slate-600">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-kyu-blue" />
          <p className="text-sm font-semibold">Restoring your secure session…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  if (!canAccess(user.role, location.pathname)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-500 flex items-center justify-center mb-4">
          <ShieldAlert size={30} />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">403 — Outside your scope</h1>
        <p className="mt-2 text-sm text-slate-500 max-w-md">
          Your role does not include this area. If you believe you need access,
          contact the System Administrator.
        </p>
        <button
          onClick={() => navigate('/admin/dashboard')}
          className="mt-6 px-5 py-2.5 rounded-lg bg-kyu-blue text-white text-sm font-bold hover:bg-kyu-blue-dark"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
