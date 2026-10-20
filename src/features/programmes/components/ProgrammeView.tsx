import { AlertTriangle, History } from 'lucide-react';
import KyModal from '../../../components/ui/KyModal';
import KyBadge from '../../../components/ui/KyBadge';
import type { ProgrammeProfile } from '../types';
import { statusMeta } from '../types';

const sections: Array<{ key: keyof ProgrammeProfile; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'objectiveImpact', label: 'Objective / Impact' },
  { key: 'philosophyOriginality', label: 'Philosophy & Originality' },
  { key: 'careerProspects', label: 'Career Prospects' },
  { key: 'admissionRequirements', label: 'Admission Requirements' },
  { key: 'structureContent', label: 'Structure & Content' },
];

export default function ProgrammeView({ programme, onClose }: { programme: ProgrammeProfile | null; onClose: () => void }) {
  if (!programme) return null;
  return (
    <KyModal
      open
      size="lg"
      title={programme.name}
      subtitle={`${programme.code} · ${programme.category} · ${programme.department}`}
      onClose={onClose}
    >
      <div className="mb-4 flex items-center gap-2">
        <KyBadge tone={statusMeta[programme.status].tone}>{statusMeta[programme.status].label}</KyBadge>
        {programme.isFeatured && <KyBadge tone="orange">Featured</KyBadge>}
        <span className="text-[11px] text-gray-400">Coordinator: {programme.coordinator}</span>
      </div>
      <dl className="mb-5 grid gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs sm:grid-cols-2">
        <div><dt className="font-bold uppercase tracking-wider text-gray-400">Duration</dt><dd className="mt-1 text-sm font-semibold text-gray-700">{programme.duration || 'Not specified'}</dd></div>
        <div><dt className="font-bold uppercase tracking-wider text-gray-400">Campus / Learning centre</dt><dd className="mt-1 text-sm font-semibold text-gray-700">{programme.campus || 'Not specified'}</dd></div>
        <div><dt className="font-bold uppercase tracking-wider text-gray-400">Study modes</dt><dd className="mt-1 text-sm font-semibold text-gray-700">{programme.studyModes.length ? programme.studyModes.join(', ') : 'Not specified'}</dd></div>
        <div><dt className="font-bold uppercase tracking-wider text-gray-400">Display priority</dt><dd className="mt-1 text-sm font-semibold text-gray-700">{programme.displayPriority}</dd></div>
      </dl>
      {programme.liveVersion && programme.liveVersion !== programme.version && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Version {programme.version} is in the staff workflow. The public catalogue safely remains on version {programme.liveVersion} until this revision is approved.
        </div>
      )}
      <div className="space-y-4">
        {programme.rejectionComment && (
          <section className="rounded-lg border border-red-200 bg-red-50 p-3">
            <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-700"><AlertTriangle size={14} /> Required corrections</h4>
            <p className="mt-1 whitespace-pre-line text-sm text-red-800">{programme.rejectionComment}</p>
          </section>
        )}
        {sections.map((s) => (
          <section key={s.key}>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">{s.label}</h4>
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {String(programme[s.key] ?? '') || '— not filled —'}
            </p>
          </section>
        ))}
        <section className="border-t border-gray-100 pt-4">
          <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500"><History size={14} /> Review history</h4>
          {programme.reviews.length === 0 ? <p className="text-sm text-gray-400">No review events have been recorded yet.</p> : (
            <ol className="space-y-3">
              {programme.reviews.map((review) => (
                <li key={review.id} className="relative border-l-2 border-blue-100 pl-4">
                  <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-kyu-blue" />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold capitalize text-gray-800">{review.action.replaceAll('-', ' ')}</p>
                    <span className="text-[10px] text-gray-400">Version {review.version} · {new Date(review.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-500">By {review.actor}</p>
                  {review.comment && <p className="mt-1 whitespace-pre-line rounded-md bg-gray-50 p-2 text-xs text-gray-700">{review.comment}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </KyModal>
  );
}
