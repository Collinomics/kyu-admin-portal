import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import { HelpCircle, AlertCircle } from 'lucide-react';

interface BaseProps {
  label?: string;
  help?: string;   // Inline help shown under the field.
  error?: string;  // Plain-language error replaces the help text.
}

// Shared wrapper: label + control + help/error line
function FieldShell({ label, help, error, children }: BaseProps & { children: ReactNode }) {
  return (
    <div>
      {label && <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>}
      {children}
      {help && !error && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
          <HelpCircle size={11} className="shrink-0" /> {help}
        </p>
      )}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-600">
          <AlertCircle size={11} className="shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

const control = 'w-full px-3 py-2.5 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 transition-colors disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';
const state = (error?: string) =>
  error ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-kyu-blue focus:border-kyu-blue';

export function KyInput({ label, help, error, className = '', ...rest }: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} help={help} error={error}>
      <input className={`${control} ${state(error)} ${className}`} {...rest} />
    </FieldShell>
  );
}

export function KySelect({ label, help, error, className = '', children, ...rest }: BaseProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell label={label} help={help} error={error}>
      <select className={`${control} ${state(error)} ${className}`} {...rest}>{children}</select>
    </FieldShell>
  );
}

export function KyTextarea({ label, help, error, className = '', ...rest }: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} help={help} error={error}>
      <textarea className={`${control} ${state(error)} ${className}`} {...rest} />
    </FieldShell>
  );
}
