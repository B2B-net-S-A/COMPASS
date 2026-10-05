export const editionSurveyLabels = {
    overall: 'Jak oceniasz szkolenie?', trainer: 'Jak oceniasz prowadzącego?',
    materials: 'Jak oceniasz otrzymane materiały?', difficulty: 'Jak oceniasz poziom trudności?',
    futureTopics: 'Jakie tematy chcesz rozwijać w przyszłości?', willingToTeach: 'Czy chcesz poprowadzić własne szkolenie?',
}
export type EditionSurveyLabels = typeof editionSurveyLabels
export interface EditionSurveyState {
    eligible: boolean
    submitted: boolean
    settings: { introduction: string; labels: Partial<EditionSurveyLabels> }
}
export interface EditionSurveyAnswers {
    overall: number; trainer: number; materials: number | null
    difficulty: 'too_easy' | 'appropriate' | 'too_hard'
    futureTopics?: string; willingToTeach: boolean; proposedTopic?: string
    contactPreference: 'none' | 'compass' | 'contract_email'; nps: number | null
}
export interface EditionSurveyReport {
    responseCount: number; overall: number | null; trainer: number | null; materials: number | null
    materialsResponseCount: number; nps: number | null
    difficulty: { too_easy: number; appropriate: number; too_hard: number }
    futureTopics: string[]
    teachingInterests?: Array<{ userId: string; fullName: string | null; proposedTopic: string | null; contactPreference: string }>
}
