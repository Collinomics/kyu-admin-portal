import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

const variants = {
  primary: 'bg-kyu-blue text-white hover:bg-kyu-blue-dark shadow-sm',
  accent: 'bg-kyu-orange text-[#0B1F3A] hover:bg-kyu-orange-dark shadow-sm font-bold',
  outline: 'border border-gray-300 text-gray-600 hover:bg-gray-100 bg-white',
  ghost: 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
};

const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm' };

export default function KyButton({
  variant = 'primary', size = 'md', loading, icon, children, className = '', disabled, ...rest
}: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all
        focus:outline-none focus:ring-2 focus:ring-kyu-blue/50 disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}