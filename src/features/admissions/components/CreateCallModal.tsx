import { useState } from 'react';
import KyModal from '../../../components/ui/KyModal';
import KyButton from '../../../components/ui/KyButton';
import { KyInput, KyTextarea } from '../../../components/ui/KyField';
import KySearchSelect from '../../../components/ui/KySearchSelect';
import type { ApplicationCall, ApplicationCallInput } from '../types';

interface Props {
  publishedProgrammes: Array<{ id: string; name: string; code: string }>;
  onClose: () => void;
  onCreate: (call: ApplicationCallInput, publish: boolean) => Promise<void>;
  initialCall?: ApplicationCall;
}

export default function CreateCallModal({ publishedProgrammes, onClose, onCreate, initialCall }: Props) {
  const editing = Boolean(initialCall);
  const [programme, setProgramme] = useState(initialCall?.programmeId ?? '');
  const [intake, setIntake] = useState(initialCall?.intake ?? '');
  const [openingDate, setOpeningDate] = useState(initialCall?.openingDate ?? '');
  const [deadline, setDeadline] = useState(initialCall?.deadline ?? '');
  const [requirements, setRequirements] = useState(initialCall?.requirements ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState<'draft' | 'publish' | 'edit' | null>(null);

  const validate = (): string => {
    if (!programme) return 'Choose the published programme this call is for.';
    if (!intake.trim()) return 'Give the intake a name, e.g. 2026/2027 Main Intake.';
    if (!openingDate || !deadline) return 'Set both the opening date and the deadline.';
    if (new Date(deadline) <= new Date(openingDate)) return 'The deadline must be after the opening date.';
    return '';
  };

  const submit = async (publish: boolean) => {
    if (submitting) return;
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSubmitting(editing ? 'edit' : publish ? 'publish' : 'draft');
    try {
      await onCreate(
        {
          programmeId: programme, intake: intake.trim(), openingDate, deadline,
          requirements: requirements.trim(),
        },
        publish
      );
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <KyModal
      open
      size="lg"
      title={editing ? 'Edit Call for Application' : 'New Call for Application'}
      subtitle={editing ? 'Changes are audited and available only before the call opens' : 'A call can only be attached to a published programme'}
      onClose={onClose}
      footer={
        <>
          {editing ? <KyButton loading={submitting === 'edit'} onClick={() => void submit(false)}>Save Changes</KyButton> : <>
            <KyButton variant="outline" loading={submitting === 'draft'} disabled={submitting !== null} onClick={() => void submit(false)}>Save as Draft</KyButton>
            <KyButton variant="accent" loading={submitting === 'publish'} disabled={submitting !== null} onClick={() => void submit(true)}>Publish Call</KyButton>
          </>}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <KySearchSelect
            label="Programme" help="Only published catalogue entries appear here."
            value={programme} onChange={(value) => { setProgramme(value); setError(''); }}
            placeholder="Select or type a programme…"
            options={publishedProgrammes.map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` }))}
          />
          <KyInput
            label="Intake name" help="e.g. 2026/2027 Main Intake."
            value={intake} onChange={(e) => { setIntake(e.target.value); setError(''); }}
          />
          <KyInput
            label="Opening date" type="date"
            value={openingDate} onChange={(e) => { setOpeningDate(e.target.value); setError(''); }}
          />
          <KyInput
            label="Deadline" type="date" help="The call auto-closes on this date."
            value={deadline} onChange={(e) => { setDeadline(e.target.value); setError(''); }}
          />
        </div>
        <KyTextarea
          label="Call-specific entry requirements" help="Anything that applies to this call only."
          rows={3} value={requirements} onChange={(e) => setRequirements(e.target.value)}
        />
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      </div>
    </KyModal>
  );
}
