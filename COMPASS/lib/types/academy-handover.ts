export const HANDOVER_CATEGORIES = {
    presentation: 'Prezentacja', participant_materials: 'Materiały dla uczestników', exercises: 'Ćwiczenia',
    modular_video: 'Samodzielne nagrania modułowe', audio: 'Osobne pliki audio',
} as const
export type HandoverCategory = keyof typeof HANDOVER_CATEGORIES
export interface AcademyHandover {
    id: string; version_id: string; run_id: string | null; material_ids: Partial<Record<HandoverCategory, string[]>>;
    source_url: string | null; rights_url: string | null; rights_signed_on: string | null;
    status: 'draft' | 'submitted' | 'rejected' | 'accepted'; contributors: string[];
    submitted_at: string | null; reviewed_at: string | null; review_note: string | null;
}
export interface AcademyHandoverState {
    handover: AcademyHandover | null; canReview: boolean;
    files: { id: string; filename: string; mime_type: string }[];
}
