import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SearchSelectOption {
  value: string;
  label: string;
  keywords?: string;
}

interface Props {
  label?: string;
  value: string;
  options: SearchSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  help?: string;
}

export default function KySearchSelect({ label, value, options, onChange, placeholder = 'Select an option…', disabled, help }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => `${option.label} ${option.keywords ?? ''}`.toLowerCase().includes(needle));
  }, [options, query]);

  const choose = (next: string) => {
    onChange(next);
    setQuery('');
    setOpen(false);
  };

  return <div className="relative">
    {label && <label className="mb-1 block text-sm font-semibold text-gray-700">{label}</label>}
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        disabled={disabled}
        value={open ? query : (selected?.label ?? '')}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { setOpen(false); setQuery(''); }
          if (event.key === 'Enter' && open && filtered.length === 1) { event.preventDefault(); choose(filtered[0].value); }
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-9 text-sm focus:border-kyu-blue focus:outline-none focus:ring-2 focus:ring-kyu-blue disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      />
      <button type="button" tabIndex={-1} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => setOpen((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400" aria-label="Toggle options"><ChevronDown size={16} /></button>
    </div>
    {help && <p className="mt-1 text-[11px] text-slate-400">{help}</p>}
    {open && !disabled && <div role="listbox" className="absolute z-[110] mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
      {value && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose('')} className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100">{placeholder}</button>}
      {filtered.length === 0 ? <p className="px-3 py-3 text-sm text-slate-500">No matching options</p> : filtered.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.value)} className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50">
        <span className="min-w-0 flex-1">{option.label}</span>{option.value === value && <Check size={15} className="mt-0.5 shrink-0 text-kyu-blue" />}
      </button>)}
    </div>}
  </div>;
}
