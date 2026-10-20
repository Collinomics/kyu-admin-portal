// Course Profiling — shared types and the approval-pipeline statuses

export const categories = ['Diploma', 'Undergraduate', 'Postgraduate', 'Vocational'] as const;
export type ProgrammeCategory = (typeof categories)[number];

// The pipeline: draft → submitted → hod-reviewed → published / rejected
export type ProgrammeStatus = 'draft' | 'submitted' | 'hod-reviewed' | 'published' | 'rejected';

export const statusMeta: Record<ProgrammeStatus, { label: string; tone: 'gray' | 'blue' | 'orange' | 'green' | 'red' }> = {
  draft: { label: 'Draft', tone: 'gray' },
  submitted: { label: 'Submitted · HOD review', tone: 'blue' },
  'hod-reviewed': { label: 'HOD reviewed · awaiting Dean', tone: 'orange' },
  published: { label: 'Published', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
};

export interface ProgrammeProfile {
  id: string;
  name: string;
  code: string;
  category: ProgrammeCategory;
  faculty: string;
  facultyId?: string;
  department: string;
  departmentId?: string;
  duration: string;
  campus: string;
  studyModes: string[];
  isFeatured: boolean;
  displayPriority: number;
  status: ProgrammeStatus;
  coordinator: string;
  updatedAt: string;
  rejectionComment?: string;
  // The six standard metadata sections
  overview: string;
  objectiveImpact: string;
  philosophyOriginality: string;
  careerProspects: string;
  admissionRequirements: string;
  structureContent: string;
  version?: number;
  liveVersion?: number;
  reviews: ProgrammeReview[];
}

export interface ProgrammeReview {
  id: string;
  version: number;
  action: string;
  comment?: string;
  actor: string;
  createdAt: string;
}

export function emptyProfile(coordinator: string): ProgrammeProfile {
  return {
    id: '',
    name: '', code: '', category: 'Undergraduate', faculty: '', department: '',
    duration: '', campus: '', studyModes: [], isFeatured: false, displayPriority: 0,
    status: 'draft', coordinator, updatedAt: new Date().toISOString().slice(0, 10),
    overview: '', objectiveImpact: '', philosophyOriginality: '',
    careerProspects: '', admissionRequirements: '', structureContent: '',
    reviews: [],
  };
}
