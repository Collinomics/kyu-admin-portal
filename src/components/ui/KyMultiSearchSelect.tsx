import { X } from 'lucide-react';
import KySearchSelect, { type SearchSelectOption } from './KySearchSelect';

interface Props {
  label: string;
  values: string[];
  options: SearchSelectOption[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  help?: string;
}

export default function KyMultiSearchSelect({ label, values, options, onChange, placeholder, disabled, help }: Props) {
  const selected = values.map((value) => options.find((option) => option.value === value)).filter((option): option is SearchSelectOption => Boolean(option));
  const available = options.filter((option) => !values.includes(option.value));

  return <div>
    <KySearchSelect
      label={label}
      value=""
      options={available}
      disabled={disabled || available.length === 0}
      placeholder={available.length === 0 && values.length > 0 ? 'All available items selected' : placeholder}
      onChange={(value) => { if (value) onChange([...values, value]); }}
      help={help}
    />
    {selected.length > 0 && <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto" aria-label={`${label} selections`}>
      {selected.map((option) => <span key={option.value} className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-kyu-blue">
        <span className="truncate">{option.label}</span>
        <button type="button" onClick={() => onChange(values.filter((value) => value !== option.value))} className="shrink-0 rounded-full p-0.5 hover:bg-blue-100" aria-label={`Remove ${option.label}`}><X size={12} /></button>
      </span>)}
    </div>}
  </div>;
}
