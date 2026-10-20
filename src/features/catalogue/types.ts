export type ApplicationStatus = 'open' | 'closing-soon' | 'scheduled' | 'closed';

export interface PublicApplicationCall {
  id: string;
  intake: string;
  opening_date: string;
  deadline: string;
  requirements: string;
  status: ApplicationStatus;
}

export interface PublicProgramme {
  id: string;
  code: string;
  name: string;
  category: string;
  faculty?: string | null;
  faculty_id?: string | null;
  department?: string | null;
  duration: string;
  campus: string;
  study_modes: string[];
  is_featured: boolean;
  display_priority: number;
  overview: string;
  objective_impact: string;
  philosophy_originality: string;
  career_prospects: string;
  admission_requirements: string;
  structure_content: string;
  published_at?: string | null;
  application?: PublicApplicationCall | null;
}

export interface CatalogueResponse {
  programmes: PublicProgramme[];
  meta: { currentPage: number; lastPage: number; perPage: number; total: number; revision: string };
  summary: { publishedProgrammes: number; academicUnits: number; callsClosingSoon: number };
  filters: { faculties: Array<{ id: string; name: string }>; categories: string[] };
  configuration: PublicCatalogueSettings;
}
import type { PublicCatalogueSettings } from '../settings/settingsService';
