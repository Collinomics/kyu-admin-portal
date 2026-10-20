import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TimerOff, LockKeyhole } from 'lucide-react';
import KyButton from './ui/KyButton';
import KyCountdown from './ui/KyCountdown';
import { KyInput } from './ui/KyField';
import { useAuth } from '../features/auth/AuthContext';

const WARNING_SECONDS = 60;

// Locks the session after `minutes` of inactivity:
// active → warning (60s countdown) → locked (re-auth or sign out)
export default function SessionGuard({ minutes = 30 }: { minutes?: number }) {
  const { reauthenticate, logout } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<'active' | 'warning' | 'locked'>('active');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const idleTimer = useRef<number | null>(null);
  const lastActivity = useRef(Date.now());

  const armIdleTimer = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setPhase('warning'), minutes * 60 * 1000);
  }, [minutes]);

  // Listen to user activity; throttle to once per second
  useEffect(() => {
    const onActivity = () => {
      if (phase !== 'active') return;
      const now = Date.now();
      if (now - lastActivity.current > 1000) {
        lastActivity.current = now;
        armIdleTimer();
      }
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    armIdleTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [phase, armIdleTimer]);

  const unlock = async () => {
    const ok = await reauthenticate(password);
    if (ok) {
      setPassword('');
      setError('');
      setPhase('active');
    } else {
      setError('Incorrect password — try again, or sign out.');
    }
  };

  if (phase === 'warning') {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
          <TimerOff size={32} className="mx-auto text-kyu-orange-dark" />
          <h3 className="mt-3 font-bold text-gray-800">Are you still there?</h3>
          <p className="text-sm text-gray-500 mt-1">
            You have been inactive for {minutes} minute{minutes === 1 ? '' : 's'}.
            For your security, this screen will lock in:
          </p>
          <div className="mt-4">
            <KyCountdown seconds={WARNING_SECONDS} label="Signing out in" accent="orange" onExpire={() => setPhase('locked')} />
          </div>
          <KyButton variant="accent" className="w-full mt-5" onClick={() => setPhase('active')}>
            Stay signed in
          </KyButton>
        </div>
      </div>
    );
  }

  if (phase === 'locked') {
    return (
      <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-lg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <div className="text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-kyu-blue/10 text-kyu-blue flex items-center justify-center">
              <LockKeyhole size={26} />
            </div>
            <h3 className="mt-3 font-bold text-gray-800">Session locked</h3>
            <p className="text-sm text-gray-500 mt-1">
              After {minutes} minutes of inactivity your session was locked.
              Re-enter your password to continue where you left off.
            </p>
          </div>
          <div className="mt-5 space-y-3">
            <KyInput
              label="Password" type="password" placeholder="••••••••"
              value={password} error={error || undefined}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
            />
            <KyButton className="w-full" onClick={unlock}>Unlock Session</KyButton>
            <KyButton variant="outline" className="w-full" onClick={async () => { await logout(); navigate('/login'); }}>
              Sign Out
            </KyButton>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
