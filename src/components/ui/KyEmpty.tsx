import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface Props {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}

export default function KyEmpty({ icon, title, hint, action }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center">
        {icon ?? <Inbox size={26} />}
      </div>
      <h3 className="mt-3 font-bold text-gray-700">{title}</h3>
      {hint && <p className="mt-1 text-sm text-gray-400 max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}