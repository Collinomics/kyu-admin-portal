import { Check, X } from 'lucide-react';

const rules = [
  { label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number', test: (p: string) => /\d/.test(p) },
  { label: 'One symbol (!@#…)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

// Reusable password-complexity checklist.
export function isStrongPassword(p: string) {
  return rules.every((r) => r.test(p));
}

export default function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
      {rules.map((r) => {
        const ok = r.test(password);
        return (
          <li key={r.label} className={`flex items-center gap-1.5 text-[11px] font-semibold ${ok ? 'text-green-600' : 'text-gray-400'}`}>
            {ok ? <Check size={12} /> : <X size={12} />} {r.label}
          </li>
        );
      })}
    </ul>
  );
}
