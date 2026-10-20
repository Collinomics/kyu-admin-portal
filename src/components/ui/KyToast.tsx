import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type Tone = 'success' | 'error' | 'info';
interface Toast { id: number; tone: Tone; message: string; }

const ToastContext = createContext<{ toast: (message: string, tone?: Tone) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const toneBar: Record<Tone, string> = {
  success: 'border-l-green-500',
  error: 'border-l-red-500',
  info: 'border-l-kyu-blue',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback((message: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, message }]);
    window.setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Stacked toasts, bottom-right */}
      <div className="fixed bottom-6 right-6 z-[110] space-y-2 w-80 max-w-[calc(100vw-3rem)]">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-start gap-2.5 rounded-xl border border-gray-200 border-l-4 shadow-xl p-3.5 bg-white ${toneBar[t.tone]}`}>
            {t.tone === 'success' && <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-0.5" />}
            {t.tone === 'error' && <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />}
            {t.tone === 'info' && <Info size={18} className="text-kyu-blue shrink-0 mt-0.5" />}
            <p className="text-sm text-gray-700 flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}