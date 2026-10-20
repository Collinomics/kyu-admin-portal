import type { ReactNode } from 'react';
import kyuLogo from '../../../assets/kyu-logo.png';

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

// The standard centered card used by every auth screen (login, onboarding, reset…)
export default function AuthCard({ title, subtitle, children, footer }: Props) {
  return (
    <div className="login-page auth-flow-page relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-6">
      <div className="relative z-10 w-full max-w-md ky-rise-enter">
        <div className="overflow-hidden rounded-3xl border border-white/60 bg-white/80 shadow-2xl shadow-slate-950/25 backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-white/15 bg-[#0E3F73]/90 px-6 py-5 backdrop-blur-md">
            <img src={kyuLogo} alt="KYU crest" className="h-11 w-11 rounded-full bg-white object-contain p-0.5 shadow-md ring-2 ring-white/20" />
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold text-white">{title}</h1>
              {subtitle && <p className="mt-0.5 truncate text-xs text-blue-100">{subtitle}</p>}
            </div>
          </div>
          <div className="space-y-5 p-6 sm:p-7">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center [&_a]:rounded-lg [&_a]:bg-white/80 [&_a]:px-3 [&_a]:py-2 [&_a]:shadow-sm [&_a]:backdrop-blur">{footer}</div>}
      </div>
    </div>
  );
}
