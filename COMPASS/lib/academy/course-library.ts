// B4.7: wspólne reguły pola „temat” dla akcji i edytora. Zgodne z CHECK na `courses.topic`
// i z RPC `academy_set_course_library_fields` (1–100 znaków po przycięciu albo brak).

export const COURSE_TOPIC_MAX_LENGTH = 100
export const COURSE_TOPIC_TOO_LONG_PL = `Temat może mieć najwyżej ${COURSE_TOPIC_MAX_LENGTH} znaków.`

/** Pusty albo z samych spacji temat to brak tematu: RPC odrzuca pusty napis. */
export function normalizeCourseTopic(value: string | null | undefined): string | null {
    return value?.trim() || null
}

export interface LibraryFieldsDraft {
    topic: string | null
    programmeId: string | null
    changed: boolean
    error: string | null
}

/** Stan formularza → dane do zapisu. Pusta opcja programu to „bez programu”. */
export function libraryFieldsDraft(initial: { topic: string | null; programmeId: string | null }, topicInput: string, programmeInput: string): LibraryFieldsDraft {
    const topic = normalizeCourseTopic(topicInput)
    const programmeId = programmeInput || null
    return {
        topic,
        programmeId,
        changed: topic !== normalizeCourseTopic(initial.topic) || programmeId !== initial.programmeId,
        error: topic && topic.length > COURSE_TOPIC_MAX_LENGTH ? COURSE_TOPIC_TOO_LONG_PL : null,
    }
}
