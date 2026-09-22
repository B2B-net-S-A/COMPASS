import Link from 'next/link'
import { academyCourseHref } from '@/lib/academy/navigation'
import type { AcademyLearnerRunProgress, AcademySessionDTO } from '@/lib/types/academy-sessions'

interface Props {
    progress: AcademyLearnerRunProgress
    sessions: AcademySessionDTO[]
    courseSlug: string
    enrollmentId: string
}

const STATUS_LABEL = {
    unconfirmed: 'Brak potwierdzenia',
    needs_review: 'Do weryfikacji',
    insufficient: 'Niewystarczająca obecność',
    present: 'Obecność potwierdzona',
}

function duration(seconds: number): string {
    const minutes = Math.floor(seconds / 60)
    const remainder = seconds % 60
    return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`
}

function missingAttendanceReason(session: AcademySessionDTO | undefined, status: keyof typeof STATUS_LABEL): string {
    if (session?.status === 'cancelled') return 'Oczekujemy na spotkanie zastępcze; odwołanie nie zalicza obecności.'
    if (!session?.attendanceWindowConfirmed) return 'Prowadzący musi potwierdzić rzeczywisty czas zakończonych zajęć i obecność.'
    if (status === 'insufficient') return 'Potwierdzony czas obecności jest niewystarczający.'
    if (status === 'needs_review') return 'Twoja obecność wymaga weryfikacji przez prowadzącego.'
    if (status === 'present') return 'Wymagane jest zakończenie potwierdzonego czasu zajęć.'
    return 'Brakuje potwierdzenia Twojej obecności przez prowadzącego.'
}

/** The RPC supplies only the authenticated learner's enrollment, without teaching notes. */
export function AcademyLearnerProgress({ progress, sessions, courseSlug, enrollmentId }: Props) {
    const sessionById = new Map(sessions.map(session => [session.id, session]))
    const missingAttendance = progress.attendance.filter(item => item.requiredForCompletion && !item.requirementMet)
    const pending = progress.completionState === 'pending'

    return <section aria-labelledby="learner-progress-title" className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="space-y-2">
            <h2 id="learner-progress-title" className="text-lg font-semibold">Twoje wymagania ukończenia</h2>
            <p className="text-sm text-muted-foreground">Wynik dotyczy Twojego zapisu i przypisanej wersji programu. Brak danych o czasie nie oznacza nieobecności ani zaliczenia.</p>
        </div>
        {progress.completionState === 'completed' && <p className="text-sm text-success">Szkolenie ukończone — potwierdzenie ukończenia jest zapisane.</p>}
        {progress.completionState === 'revoked' && <p className="text-sm text-destructive">Unieważnione ukończenie wymaga wyjaśnienia z administratorem. Spełnienie widocznych warunków nie przywróci certyfikatu.</p>}
        {pending && (progress.readyToComplete
            ? <p className="text-sm text-success">Wszystkie wymagania są spełnione. Wybierz „Sprawdź ukończenie”, aby zapisać ukończenie i otrzymać certyfikat.</p>
            : <div className="space-y-2"><h3 className="font-medium">Co pozostaje do ukończenia</h3><ul className="list-disc space-y-2 pl-5 text-sm">
                {progress.missingLessons.map(lesson => <li key={lesson.id}>Ukończ lekcję: <Link className="text-primary underline underline-offset-2" href={academyCourseHref(courseSlug, enrollmentId, `/lekcja/${lesson.id}`)}>{lesson.title}</Link>.</li>)}
                {progress.quizRequired && !progress.quizPassed && <li><Link className="text-primary underline underline-offset-2" href={academyCourseHref(courseSlug, enrollmentId, '/quiz')}>Zdaj quiz końcowy</Link> — wymagany wynik: {progress.quizPassPercent}%.</li>}
                {missingAttendance.map(item => <li key={item.sessionId}><a className="text-primary underline underline-offset-2" href={`#session-${item.sessionId}`}>{sessionById.get(item.sessionId)?.title ?? 'Wymagane spotkanie'}</a>: {missingAttendanceReason(sessionById.get(item.sessionId), item.status)}</li>)}
                {!progress.attendanceSatisfied && missingAttendance.length === 0 && <li>Wymagania obecności oczekują na potwierdzenie przez prowadzącego.</li>}
            </ul></div>)}
        <div className="space-y-3"><h3 className="font-medium">Twoja obecność na spotkaniach</h3>
            <ul className="space-y-3">{progress.attendance.map(item => {
                const session = sessionById.get(item.sessionId)
                return <li key={item.sessionId} className="space-y-2 rounded-xl border border-border p-4">
                    <p className="font-medium"><a className="underline underline-offset-2" href={`#session-${item.sessionId}`}>{session?.title ?? 'Spotkanie'}</a></p>
                    <p className="text-sm">{STATUS_LABEL[item.status]} · {item.attendedSeconds === null ? 'Czas obecności niepotwierdzony' : `Potwierdzony czas: ${duration(item.attendedSeconds)}`}</p>
                    <p className="text-sm text-muted-foreground">{item.requiredForCompletion
                        ? `${item.requirementMet ? 'Wymóg obecności spełniony.' : 'Wymóg obecności niespełniony.'} Próg: ${item.thresholdPercent}%${item.requiredSeconds === null ? ' — czas wymagany będzie znany po potwierdzeniu czasu zajęć.' : `, co najmniej ${duration(item.requiredSeconds)}.`}`
                        : session?.replacementSessionId ? 'Spotkanie zastąpione — liczy się obecność na spotkaniu zastępczym.' : 'Spotkanie opcjonalne — nie blokuje ukończenia.'}</p>
                </li>
            })}</ul>
        </div>
    </section>
}
