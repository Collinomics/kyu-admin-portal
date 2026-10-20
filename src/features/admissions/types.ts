// Calls for application — lifecycle and live status logic

export type CallStatus = 'draft' | 'open' | 'closed';
export type EffectiveCallStatus = 'draft' | 'scheduled' | 'open' | 'closing-soon' | 'closed';
export interface CallPermissions { create: boolean; monitor: boolean; close: boolean; }
export interface CallAssignment { officerId: string; officer: string; permissions: CallPermissions; }

export interface ApplicationCall {
  id: string;
  programmeId: string;
  programme: string;
  intake: string;
  openingDate: string;
  deadline: string;
  requirements: string;
  status: CallStatus;
  closedReason?: string;
  createdBy: string;
  effectiveStatus: EffectiveCallStatus;
  permissions: CallPermissions;
  canEdit: boolean;
  assignments: CallAssignment[];
}

export interface ApplicationCallInput {
  programmeId: string;
  intake: string;
  openingDate: string;
  deadline: string;
  requirements: string;
}

export const daysLeft = (deadline: string) =>
  Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);

// The public-facing status: draft / open / closing-soon / closed
export function effectiveStatus(c: ApplicationCall): EffectiveCallStatus {
  return c.effectiveStatus;
}

export const callStatusMeta: Record<
  EffectiveCallStatus,
  { label: string; tone: 'gray' | 'green' | 'orange' | 'red' | 'blue' }
> = {
  draft: { label: 'Draft — not published', tone: 'gray' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
  open: { label: 'Applications Open', tone: 'green' },
  'closing-soon': { label: 'Closing Soon', tone: 'orange' },
  closed: { label: 'Closed', tone: 'red' },
};
