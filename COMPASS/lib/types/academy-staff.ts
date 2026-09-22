export type AcademyStaffRole = 'editor' | 'facilitator'
export interface AcademyStaffPerson { userId: string; fullName: string | null; email: string }
export interface AcademyStaffState {
    members: Array<AcademyStaffPerson & { role: AcademyStaffRole; eligible: boolean }>
    candidates: AcademyStaffPerson[]
}
