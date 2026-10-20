import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

interface Props {
  length?: number;
  value: string;
  onChange: (next: string) => void;
}

// Six-box OTP entry with auto-advance and backspace navigation.
export default function OtpInput({ length = 6, value, onChange }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleInput = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const chars = value.split('');
    chars[index] = digit;
    onChange(chars.join(''));
    if (digit && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!digits) return;
    e.preventDefault();
    onChange(digits);
    refs.current[Math.min(digits.length, length) - 1]?.focus();
  };

  return (
    <fieldset className="flex gap-2 justify-center" aria-label="Six-digit verification code">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Verification code digit ${i + 1}`}
          value={value[i] ?? ''}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="w-10 h-12 text-center text-xl font-bold rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-kyu-blue focus:border-kyu-blue"
        />
      ))}
    </fieldset>
  );
}
