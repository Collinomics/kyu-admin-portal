import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, BookOpen, Bot, LockKeyhole } from 'lucide-react';
import { useAuth } from './AuthContext';
import { AuthRequestError } from './authErrors';
import { UNIVERSITY } from '../../utils/university';
import { consumeAuthNotice } from '../../services/api';
import KyButton from '../../components/ui/KyButton';
import KyCountdown from '../../components/ui/KyCountdown';
import kyuLogo from '../../../support/kyu_logo.png';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(() => consumeAuthNotice());
  const [loading, setLoading] = useState(false);

  const [locked, setLocked] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

  if (user) return <Navigate to="/admin/dashboard" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (locked || loading) return;
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter your institutional email and password.');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      navigate('/admin/dashboard');
    } catch (cause) {
      if (cause instanceof AuthRequestError && cause.code === 'ACCOUNT_LOCKED') {
        setRetryAfter(Math.max(1, cause.retryAfter));
        setLocked(true);
      } else if (cause instanceof AuthRequestError && cause.code === 'ONBOARDING_REQUIRED') {
        navigate(`/onboarding?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      } else {
        setError(cause instanceof Error ? cause.message : 'Incorrect email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-white/80 bg-white/70 py-3 pl-10 pr-10 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white/90 focus:ring-4 focus:ring-blue-100/80';

  return (
    <div className="login-page relative min-h-screen flex overflow-hidden">
      {/* LEFT — brand panel */}
      <div className="relative z-10 hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-kyu-orange/10" />

        <div className="auth-enter-left relative flex flex-col items-center self-center text-center">
          <img src={kyuLogo} alt="Kyambogo University crest" className="mb-5 h-24 w-24 object-contain" />
          <h1 className="text-3xl font-extrabold text-kyu-orange">KYU PCS</h1>
          <p className="text-sm text-blue-100 mt-1 italic">{UNIVERSITY.motto}</p>
        </div>

        <div className="auth-enter-left auth-delay-1 relative space-y-6">
          <h2 className="text-4xl font-bold text-white leading-tight">
            One governed catalogue.<br />Every approved programme.
          </h2>
          <ul className="space-y-4 text-blue-100 text-sm">
            <li className="flex items-center gap-3">
              <BookOpen size={20} className="text-kyu-orange" /> Standardized programme profiles with career guidance
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck size={20} className="text-kyu-orange" /> Role-based user and access management
            </li>
            <li className="flex items-center gap-3">
              <Bot size={20} className="text-kyu-orange" /> AI-assisted applicant navigation
            </li>
          </ul>
        </div>

        <p className="auth-enter-left auth-delay-2 relative text-xs text-blue-200">© 2026 {UNIVERSITY.name} · {UNIVERSITY.address}</p>
      </div>

      {/* RIGHT — form OR locked card */}
      <div className="relative z-10 flex flex-1 items-center justify-center bg-transparent p-4 sm:p-6">
        {locked ? (
          /* ===== LOCKED STATE ===== */
          <div className="auth-enter-right w-full max-w-md rounded-3xl border border-white/80 bg-white/[0.86] p-8 text-center shadow-2xl shadow-slate-950/30 backdrop-blur-2xl">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-red-100 text-red-500 flex items-center justify-center">
              <LockKeyhole size={30} />
            </div>
            <h2 className="mt-4 text-xl font-bold text-gray-800">Account locked</h2>
            <p className="mt-2 text-sm text-gray-500">
              The server temporarily locked this account after repeated failed attempts.
              You can wait for the lock to expire or reset your password securely by email.
            </p>
            <div className="mt-6 space-y-3">
              {retryAfter > 0 && <KyCountdown seconds={retryAfter} label="Automatic retry available in" accent="orange" onExpire={() => { setLocked(false); setRetryAfter(0); }} />}
              <Link to="/forgot-password">
                <KyButton variant="accent" className="w-full">Reset my password by email</KyButton>
              </Link>
              <p className="text-xs text-gray-400">
                Administrator: {UNIVERSITY.email} · {UNIVERSITY.phone}
              </p>
            </div>
          </div>
        ) : (
          /* ===== NORMAL LOGIN FORM ===== */
          <form onSubmit={handleSubmit} className="auth-enter-right relative w-full max-w-md overflow-hidden rounded-3xl border border-white/85 bg-white/[0.86] p-6 shadow-2xl shadow-slate-950/30 backdrop-blur-2xl sm:p-8">
            <div className="mb-5 flex flex-col items-center text-center lg:hidden"><img src={kyuLogo} alt="Kyambogo University crest" className="mb-3 h-20 w-20 object-contain" /><h1 className="text-2xl font-extrabold text-kyu-orange">KYU PCS</h1><p className="mt-1 text-xs italic text-slate-600">{UNIVERSITY.motto}</p></div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0E3F73] text-white shadow-lg shadow-blue-950/20"><ShieldCheck size={22} /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#1B5EA9]">KYU staff access</p>
                <h2 className="mt-0.5 text-2xl font-extrabold tracking-tight text-slate-900">Welcome back</h2>
              </div>
            </div>
            <p className="mt-3 border-b border-slate-200/80 pb-3 text-sm leading-6 text-slate-600 sm:mt-4">Sign in to manage the governed programme catalogue.</p>

            <div className="mt-3 space-y-4 sm:mt-4">
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-slate-700">Institutional Email</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input id="login-email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="name@kyu.ac.ug" />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-slate-700">Password</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-kyu-blue"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end -mt-2">
                <Link to="/forgot-password" className="text-xs font-semibold text-kyu-blue hover:underline">
                  Forgot password?
                </Link>
              </div>

              {error && (
                <p role="alert" aria-live="polite" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}

              <KyButton type="submit" loading={loading} className="w-full">
                {!loading && 'Sign In'}
              </KyButton>

              <div className="flex items-center justify-center gap-2 rounded-xl border border-blue-100/80 bg-blue-50/60 px-3 py-2.5 text-xs font-semibold text-slate-600"><Lock size={14} className="text-[#1B5EA9]" /> Institutional accounts only</div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
