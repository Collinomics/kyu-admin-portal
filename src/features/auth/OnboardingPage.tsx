import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle2, RefreshCw, Clock, Link2Off } from 'lucide-react';
import OtpInput from './components/OtpInput';
import PasswordChecklist, { isStrongPassword } from './components/PasswordChecklist';
import KyCountdown from '../../components/ui/KyCountdown';
import KyButton from '../../components/ui/KyButton';
import kyuLogo from '../../../support/kyu_logo.png';
import { apiFetch } from '../../services/api';

const OTP_LIFETIME = 15 * 60;  // 15 minutes 
const RESEND_COOLDOWN = 30;
export default function OnboardingPage() {
  const [params] = useSearchParams();
  const email = (params.get('email') ?? '').trim().toLowerCase();
  const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const [step, setStep] = useState<'otp' | 'password' | 'done'>('otp');
  const [developmentOtp, setDevelopmentOtp] = useState('');
  const [otp, setOtp] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  // Countdown + cooldown state
  const [otpSeed, setOtpSeed] = useState(Date.now());       // restarts the 15-min timer
  const [otpExpired, setOtpExpired] = useState(false);
  const [cooldownSeed, setCooldownSeed] = useState(0);      // 0 = no active cooldown
  const [cooldownDone, setCooldownDone] = useState(true);

  const request = async (path: string, body: Record<string, string>) => {
    const response = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const firstError = Object.values(data.errors ?? {}).flat()[0];
      throw new Error(String(firstError ?? data.message ?? 'The request could not be completed.'));
    }
    return data;
  };

  const verifyOtp = async () => {
    if (otpExpired) { setError('This code has expired — request a new one below.'); return; }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await request('/api/v1/auth/onboarding/verify', { email, otp });
      setStep('password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code could not be verified.');
    } finally {
      setLoading(false);
    }
  };

  // Regenerate an expired or lost OTP.
  const resend = async () => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const data = await request('/api/v1/auth/onboarding/resend', { email });
      setDevelopmentOtp(data.data?.development_otp ?? '');
      setOtp('');
      setOtpExpired(false);
      setOtpSeed(Date.now());
      setCooldownSeed(Date.now());
      setCooldownDone(false);
      setNotice('A new code was issued. The previous code is now invalid.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'A new code could not be issued.');
    } finally {
      setLoading(false);
    }
  };

  const setPassword = async () => {
    if (!isStrongPassword(pw)) { setError('Your password does not meet all the requirements yet.'); return; }
    if (pw !== pw2) { setError('The two passwords do not match.'); return; }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      await request('/api/v1/auth/onboarding/complete', {
        email,
        otp,
        password: pw,
        password_confirmation: pw2,
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The account could not be activated.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page auth-flow-page relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-6">
      <div className="relative z-10 w-full max-w-md ky-rise-enter">
        <div className="overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-2xl shadow-slate-950/25 backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-white/15 bg-[#0E3F73]/90 px-6 py-5 backdrop-blur-md">
            <img src={kyuLogo} alt="KYU crest" className="h-11 w-11 rounded-full bg-white object-contain p-0.5 shadow-md ring-2 ring-white/20" />
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold text-white">Account Activation</h1>
              <p className="mt-0.5 truncate text-xs text-blue-100">{email || 'Activation link required'}</p>
            </div>
          </div>

          <div className="space-y-5 p-6 sm:p-7">
            {!hasValidEmail && (
              <div className="py-4 text-center">
                <Link2Off size={38} className="mx-auto text-amber-500" />
                <h2 className="mt-3 font-bold text-gray-800">Activation link incomplete</h2>
                <p className="mt-2 text-sm text-gray-500">Open the activation link issued with your account, or contact the administrator who created it.</p>
                <Link to="/login"><KyButton variant="outline" className="mt-5">Return to Sign In</KyButton></Link>
              </div>
            )}
            {hasValidEmail && step === 'otp' && (
              <>
                <div className="text-center">
                  <Mail size={28} className="mx-auto text-kyu-blue" />
                  <h2 className="mt-2 font-bold text-gray-800">Enter your one-time password</h2>
                  <p className="text-xs text-gray-500 mt-1">We sent a 6-digit code to your institutional email.</p>
                </div>

                <OtpInput value={otp} onChange={(v) => { setOtp(v); setError(''); setNotice(''); }} />

                {/* Live countdown to OTP expiry */}
                <KyCountdown
                  key={otpSeed}
                  seconds={OTP_LIFETIME}
                  label={otpExpired ? 'Code expired — request a new one' : 'Code expires in'}
                  accent={otpExpired ? 'orange' : 'blue'}
                  onExpire={() => setOtpExpired(true)}
                />

                {developmentOtp && (
                  <div className="rounded-lg border-2 border-dashed border-kyu-orange/60 bg-kyu-orange/5 p-3 text-[11px] text-gray-600">
                    <p className="font-bold text-kyu-orange-dark mb-1">Development verification code</p>
                    <p className="font-mono font-bold text-base text-kyu-blue">{developmentOtp}</p>
                  </div>
                )}

                <KyButton
                  variant="primary"
                  disabled={otp.length !== 6 || otpExpired}
                  onClick={verifyOtp}
                  loading={loading}
                  className="w-full"
                >
                  Verify & Continue
                </KyButton>

                <button
                  onClick={() => void resend()}
                  disabled={!cooldownDone || loading}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-kyu-blue hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {!cooldownDone ? (
                    <>
                      <Clock size={12} />
                      Wait <KyCountdown key={cooldownSeed} seconds={RESEND_COOLDOWN} label="" accent="orange" onExpire={() => setCooldownDone(true)} /> before requesting a new code
                    </>
                  ) : (
                    <>
                      <RefreshCw size={12} /> Code expired or not received? Send a new one
                    </>
                  )}
                </button>
              </>
            )}

            {hasValidEmail && step === 'password' && (
              <>
                <div className="text-center">
                  <CheckCircle2 size={28} className="mx-auto text-green-500" />
                  <h2 className="mt-2 font-bold text-gray-800">Email verified — set your password</h2>
                  <p className="text-xs text-gray-500 mt-1">Choose a password that meets every requirement below.</p>
                </div>

                <label htmlFor="activation-password" className="sr-only">New password</label>
                <input id="activation-password" name="password" autoComplete="new-password" type="password" value={pw} onChange={(e) => { setPw(e.target.value); setError(''); }}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-kyu-blue text-sm"
                  placeholder="New password" />
                <PasswordChecklist password={pw} />
                <label htmlFor="activation-password-confirmation" className="sr-only">Confirm password</label>
                <input id="activation-password-confirmation" name="password_confirmation" autoComplete="new-password" type="password" value={pw2} onChange={(e) => { setPw2(e.target.value); setError(''); }}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-kyu-blue text-sm"
                  placeholder="Confirm password" />

                <KyButton variant="primary" onClick={setPassword} loading={loading} className="w-full">Activate My Account</KyButton>
              </>
            )}

            {hasValidEmail && step === 'done' && (
              <div className="text-center py-4">
                <CheckCircle2 size={40} className="mx-auto text-green-500" />
                <h2 className="mt-3 font-bold text-gray-800">Account activated</h2>
                <p className="text-sm text-gray-500 mt-1">Welcome to Kyambogo PCS. You can now sign in with your new password.</p>
                <Link to="/login">
                  <KyButton variant="accent" className="mt-5">Go to Sign In</KyButton>
                </Link>
              </div>
            )}

            {notice && <p role="status" aria-live="polite" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
            {error && <p role="alert" aria-live="polite" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          </div>
        </div>
        <p className="mx-auto mt-4 w-fit rounded-full bg-white/80 px-3 py-1.5 text-center text-[11px] text-slate-600 shadow-sm backdrop-blur">University account activation</p>
      </div>
    </div>
  );
}
