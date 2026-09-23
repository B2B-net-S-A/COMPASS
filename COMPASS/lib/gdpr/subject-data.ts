/**
 * Audyt 2026-08 (C5) — mapa danych osobowych: co eksportujemy (art. 15 RODO),
 * co zacieramy (art. 17), a czego NIE wolno ruszyć i dlaczego.
 *
 * Moduł jest celowo czysty (żadnego I/O, żadnego 'use server'): to deklaracja,
 * którą da się przetestować i przeczytać jak dokument, a wykonanie siedzi
 * w `lib/actions/gdpr.ts`. Wcześniej takiej deklaracji nie było w ogóle —
 * aplikacja obiecywała w `data-retention` „usunięcie w 30 dni" i nie miała
 * żadnego mechanizmu, którym dałoby się to zrobić.
 *
 * ══ DLACZEGO ZACIERANIE, A NIE KASOWANIE WIERSZY ══
 *
 * Dane kadrowe mają własne, niezależne od RODO terminy przechowywania (ewidencja
 * czasu pracy, faktury, umowy). Skasowanie wiersza `timesheets` czy `invoices`
 * zamieniłoby jeden obowiązek na złamanie drugiego. Zamiast tego robimy to samo,
 * co exit interview zgłoszony anonimowo (Faza 22, `is_anonymous`): rozrywamy
 * powiązanie z TOŻSAMOŚCIĄ, zostawiając rekord jako pseudonimowy. Po zabiegu
 * `timesheets.user_id` wskazuje na profil, w którym nie ma już ani nazwiska,
 * ani adresu, ani telefonu.
 *
 * Wprost KASUJEMY tylko to, co nie ma terminu przechowywania, a którego
 * przetrwanie samo w sobie byłoby naruszeniem — aktywne kanały wysyłki
 * i mapowania „nazwisko → konto".
 */

import type { Database } from '@/lib/supabase/database.types'

// The generated Database type predates the additive Academy migrations. Keep
// those names explicit until the next full type regeneration.
type AcademyTableName = 'course_completions' | 'course_run_registrations' | 'course_materials'
    | 'academy_user_capabilities' | 'course_staff' | 'course_run_staff'
    | 'academy_organizers' | 'academy_m365_identities' | 'academy_notification_receipts'
    | 'session_attendance'
export type TableName = keyof Database['public']['Tables'] | AcademyTableName

/** Osoba z kontem w aplikacji (`profiles`) albo kontraktor u klienta (`contractors`). */
export type GdprSubjectType = 'employee' | 'contractor'

/** Jedno miejsce, w którym leżą dane osoby — do eksportu z art. 15. */
export interface SubjectSource {
    table: TableName
    /** Kolumna wskazująca na PODMIOT danych (nie na autora wpisu). */
    column: string
    /** Nagłówek sekcji w pliku wręczanym osobie — po polsku. */
    label: string
    /** Restrict columns when the row also names an administrator or another actor. */
    select?: string
}

/**
 * Rekordy, w których osoba jest PODMIOTEM danych.
 *
 * Świadomie pomijamy kolumny sprawstwa (`created_by`, `reviewed_by`,
 * `imported_by`, `approved_by`): tam ta sama osoba występuje jako pracownik
 * wykonujący czynność na CUDZYCH danych. Wciągnięcie ich do eksportu wysypałoby
 * do pliku cudze timesheety i cudze wnioski urlopowe, czyli zamieniło realizację
 * jednego prawa w wyciek danych kilkudziesięciu innych osób.
 */
export const EMPLOYEE_SOURCES: readonly SubjectSource[] = [
    { table: 'profiles', column: 'id', label: 'Profil' },
    { table: 'um_user_consents', column: 'user_id', label: 'Zgody (regulamin, RODO, AI)' },
    { table: 'audit_logs', column: 'user_id', label: 'Dziennik czynności w systemie' },
    { table: 'attendance_records', column: 'user_id', label: 'Obecność' },
    { table: 'leave_requests', column: 'user_id', label: 'Wnioski urlopowe' },
    { table: 'timesheets', column: 'user_id', label: 'Karty pracy (nagłówki)' },
    { table: 'timesheet_user_templates', column: 'user_id', label: 'Szablony opisów pracy' },
    { table: 'timesheet_timers', column: 'user_id', label: 'Stopery czasu pracy' },
    { table: 'timesheet_reminder_log', column: 'user_id', label: 'Przypomnienia o karcie pracy' },
    { table: 'invoices', column: 'user_id', label: 'Faktury' },
    { table: 'bonuses', column: 'recipient_user_id', label: 'Premie' },
    { table: 'user_rates', column: 'user_id', label: 'Stawki' },
    { table: 'user_contract_documents', column: 'user_id', label: 'Dokumenty umowne' },
    { table: 'contracts', column: 'consultant_id', label: 'Umowy' },
    { table: 'work_clock_sessions', column: 'user_id', label: 'Sesje zegara pracy' },
    { table: 'work_clock_consents', column: 'user_id', label: 'Zgoda na zegar pracy' },
    { table: 'notifications', column: 'user_id', label: 'Powiadomienia w aplikacji' },
    { table: 'push_subscriptions', column: 'user_id', label: 'Subskrypcje powiadomień push' },
    { table: 'onboarding_progress', column: 'user_id', label: 'Onboarding' },
    { table: 'offboarding_tasks', column: 'user_id', label: 'Zadania offboardingu' },
    { table: 'exit_interviews', column: 'user_id', label: 'Wywiad wyjściowy' },
    { table: 'lifecycle_notes', column: 'user_id', label: 'Notatki HR' },
    { table: 'lifecycle_events', column: 'user_id', label: 'Zdarzenia cyklu życia' },
    { table: 'course_enrollments', column: 'user_id', label: 'Zapisy na szkolenia' },
    { table: 'course_run_registrations', column: 'user_id', label: 'Rejestracje na edycje szkoleń' },
    { table: 'course_completions', column: 'user_id', label: 'Ukończenia i dane certyfikatów', select: 'id,enrollment_id,user_id,course_id,version_id,completed_at,revoked_at,legacy,certificate_snapshot' },
    { table: 'academy_user_capabilities', column: 'user_id', label: 'Uprawnienia prowadzącego', select: 'user_id,can_train,granted_at,revoked_at' },
    { table: 'course_staff', column: 'user_id', label: 'Funkcje przy szkoleniach', select: 'course_id,user_id,role,granted_at,revoked_at' },
    { table: 'course_run_staff', column: 'user_id', label: 'Funkcje przy edycjach szkoleń', select: 'run_id,user_id,granted_at,revoked_at' },
    { table: 'academy_organizers', column: 'profile_id', label: 'Konto organizatora Teams', select: 'id,profile_id,tenant_id,object_id,enabled,updated_at' },
    { table: 'academy_m365_identities', column: 'user_id', label: 'Zweryfikowane tożsamości Microsoft', select: 'id,user_id,tenant_id,object_id,verified_email,verified_at,invitation_target' },
    { table: 'course_materials', column: 'uploaded_by', label: 'Przesłane materiały Akademii', select: 'id,course_id,version_id,lesson_id,run_id,uploaded_by,filename,storage_path,mime_type,size_bytes,status,review_status,created_at,scanned_at,purged_at' },
    { table: 'academy_notification_receipts', column: 'user_id', label: 'Potwierdzenia powiadomień Akademii' },
    { table: 'course_quiz_attempts', column: 'user_id', label: 'Podejścia do quizów' },
    { table: 'course_ratings', column: 'user_id', label: 'Oceny szkoleń' },
    { table: 'course_survey_responses', column: 'user_id', label: 'Ankiety po szkoleniach' },
    { table: 'course_questions', column: 'user_id', label: 'Pytania do szkoleń' },
    { table: 'course_answers', column: 'user_id', label: 'Odpowiedzi w szkoleniach' },
    { table: 'learning_path_enrollments', column: 'user_id', label: 'Ścieżki rozwoju' },
    { table: 'support_tickets', column: 'user_id', label: 'Zgłoszenia' },
    { table: 'support_ticket_comments', column: 'author_id', label: 'Komentarze do zgłoszeń' },
    { table: 'compass_assist_tickets', column: 'user_id', label: 'Zgłoszenia do asystenta' },
    { table: 'incubator_applications', column: 'applicant_id', label: 'Zgłoszenia do inkubatora' },
    { table: 'loyalty_transactions', column: 'user_id', label: 'Punkty lojalnościowe' },
    { table: 'news_post_reads', column: 'user_id', label: 'Odczyty aktualności' },
    { table: 'news_reactions', column: 'user_id', label: 'Reakcje na aktualności' },
    { table: 'favorite_projects', column: 'user_id', label: 'Ulubione projekty' },
    { table: 'task_assignments', column: 'user_id', label: 'Przypisania zadań' },
    { table: 'task_activity', column: 'user_id', label: 'Aktywność w zadaniach' },
    { table: 'app_documents', column: 'owner_id', label: 'Dokumenty użytkownika' },
    { table: 'placement_person_aliases', column: 'profile_id', label: 'Warianty zapisu nazwiska' },
] as const

/**
 * Kontraktor u klienta — osoba BEZ konta w aplikacji. Wszystkie tabele modułu
 * Talent Community są kluczowane po `contractor_id`, więc komplet danych zbiera
 * się jednym identyfikatorem.
 */
export const CONTRACTOR_SOURCES: readonly SubjectSource[] = [
    { table: 'contractors', column: 'id', label: 'Kartoteka kontraktora' },
    { table: 'contractor_conversations', column: 'contractor_id', label: 'Log rozmów' },
    { table: 'contractor_check_ins', column: 'contractor_id', label: 'Check-iny' },
    { table: 'contractor_client_feedback', column: 'contractor_id', label: 'Informacje zwrotne od klienta' },
    { table: 'contractor_onboarding_interviews', column: 'contractor_id', label: 'Wywiad wdrożeniowy' },
    { table: 'contractor_exit_interviews', column: 'contractor_id', label: 'Wywiad wyjściowy' },
    { table: 'contractor_bench', column: 'contractor_id', label: 'Bench' },
    { table: 'contractor_tasks', column: 'contractor_id', label: 'Zadania' },
    { table: 'contractor_success_settings', column: 'contractor_id', label: 'Ustawienia opieki' },
    { table: 'contractor_health_status_history', column: 'contractor_id', label: 'Historia statusu współpracy' },
    { table: 'client_entries', column: 'contractor_id', label: 'Wejścia do klientów' },
    { table: 'client_departures', column: 'contractor_id', label: 'Zejścia od klientów' },
    { table: 'placements', column: 'contractor_id', label: 'Umieszczenia u klientów' },
    { table: 'tech_interview_cards', column: 'contractor_id', label: 'Karty rozmów technologicznych' },
    { table: 'support_inbox_meta', column: 'contractor_id', label: 'Zgłoszenia w skrzynce' },
] as const

/** Krok zacierania. `delete` wyłącznie tam, gdzie brak terminu przechowywania. */
export interface ScrubStep {
    table: TableName
    column: string
    operation: 'update' | 'delete'
    /** Wypełnione dla `update`; puste dla `delete`. */
    patch: Record<string, string | null>
    label: string
}

/**
 * Etykieta zastępcza. Zawiera skrót identyfikatora, żeby dwa zatarte rekordy dało
 * się od siebie odróżnić w raportach — bez odtworzenia tożsamości.
 */
export function anonymizedLabel(subjectId: string): string {
    return `Dane usunięte (RODO) · ${subjectId.slice(0, 8)}`
}

/**
 * `profiles.email` ma UNIQUE, więc nie da się go po prostu wyzerować dla drugiej
 * osoby z rzędu. `.invalid` to TLD zarezerwowany przez RFC 2606 — adres nigdy
 * nie zostanie dostarczony, nawet gdyby jakiś kanał wysyłki go przeoczył.
 */
export function anonymizedEmail(subjectId: string): string {
    return `usuniety.${subjectId}@rodo.invalid`
}

/**
 * Zacieranie profilu pracownika.
 *
 * `employment_status: 'exited'` NIE jest kosmetyką — od Fazy 43 ten status odcina
 * logowanie w trzech warstwach (callback, middleware, `withAuth`). Bez niego
 * zostałoby żywe konto z pustym nazwiskiem.
 */
export function employeeScrubSteps(userId: string): ScrubStep[] {
    return [
        {
            table: 'profiles',
            column: 'id',
            operation: 'update',
            label: 'Profil — tożsamość, kontakt, dane zawodowe',
            patch: {
                full_name: anonymizedLabel(userId),
                email: anonymizedEmail(userId),
                phone: null,
                avatar_url: null,
                cv_url: null,
                bio: null,
                linkedin_url: null,
                github_url: null,
                portfolio_url: null,
                location: null,
                default_location: null,
                manager_email: null,
                department: null,
                job_title: null,
                external_notes: null,
                skills: null,
                languages: null,
                previous_clients: null,
                certifications: null,
                education: null,
                work_history: null,
                // Wektor liczony z CV i bio — odtwarza treść dokumentów, więc
                // jest daną osobową tak samo jak one.
                embedding: null,
                employment_status: 'exited',
            },
        },
        {
            table: 'placement_person_aliases',
            column: 'profile_id',
            operation: 'delete',
            patch: {},
            label: 'Warianty zapisu nazwiska (mapowanie import → konto)',
        },
        {
            table: 'push_subscriptions',
            column: 'user_id',
            operation: 'delete',
            patch: {},
            label: 'Subskrypcje push (aktywny kanał wysyłki, brak terminu przechowywania)',
        },
        {
            table: 'verification_codes',
            column: 'user_id',
            operation: 'delete',
            patch: {},
            label: 'Kody jednorazowe',
        },
    ]
}

/**
 * Zacieranie kontraktora.
 *
 * Nazwisko jest tu zdenormalizowane do sześciu tabel (importy z Excela zapisują
 * je jako tekst obok `contractor_id`), więc zatarcie samej kartoteki zostawiłoby
 * pełne imię i nazwisko w Wejściach, Zejściach i na benchu.
 */
export function contractorScrubSteps(contractorId: string): ScrubStep[] {
    const label = anonymizedLabel(contractorId)
    return [
        {
            table: 'contractors',
            column: 'id',
            operation: 'update',
            label: 'Kartoteka kontraktora',
            patch: {
                full_name: label,
                email: null,
                phone: null,
                notes: null,
            },
        },
        {
            table: 'placements',
            column: 'contractor_id',
            operation: 'update',
            label: 'Umieszczenia u klientów',
            patch: { consultant_name: label },
        },
        {
            table: 'client_entries',
            column: 'contractor_id',
            operation: 'update',
            label: 'Wejścia do klientów',
            patch: { consultant_name: label },
        },
        {
            table: 'client_departures',
            column: 'contractor_id',
            operation: 'update',
            label: 'Zejścia od klientów',
            patch: { consultant_name: label },
        },
        {
            table: 'contractor_bench',
            column: 'contractor_id',
            operation: 'update',
            label: 'Bench',
            patch: { consultant_name: label },
        },
        {
            table: 'support_inbox_meta',
            column: 'contractor_id',
            operation: 'update',
            label: 'Zgłoszenia w skrzynce',
            patch: { consultant_name: label, consultant_phone: null, email_from: null },
        },
    ]
}

/** Co zostaje po zabiegu i na jakiej podstawie — trafia wprost do raportu. */
export interface RetainedRecord {
    label: string
    reason: string
}

export const EMPLOYEE_RETAINED: readonly RetainedRecord[] = [
    { label: 'Karty pracy i wpisy godzin', reason: 'Ewidencja czasu pracy — własny okres przechowywania.' },
    { label: 'Faktury i premie', reason: 'Dokumentacja rozliczeniowa — obowiązek podatkowy i księgowy.' },
    { label: 'Umowy i dokumenty umowne', reason: 'Dokumentacja kontraktowa — własny okres przechowywania.' },
    { label: 'Wnioski urlopowe i obecność', reason: 'Ewidencja nieobecności — powiązana z ewidencją czasu pracy.' },
    { label: 'Dziennik czynności (audit_logs)', reason: 'Rozliczalność (art. 5 ust. 2 RODO); usuwany osobno po 12 miesiącach.' },
    { label: 'Anonimowe wywiady wyjściowe', reason: 'Nie mają już powiązania z osobą (user_id = NULL od momentu zgłoszenia).' },
] as const

export const CONTRACTOR_RETAINED: readonly RetainedRecord[] = [
    { label: 'Wejścia, zejścia i umieszczenia', reason: 'Dokumentacja współpracy z klientem — zostają jako pseudonimowe.' },
    { label: 'Log rozmów i wywiady', reason: 'Zapisy działań opiekuna — zostają bez danych identyfikujących.' },
    { label: 'Marże, stawki i numery zamówień', reason: 'Dane handlowe, nie osobowe.' },
] as const

/**
 * Czego kod NIE zrobi za człowieka. Zwracane w raporcie zamiast milczenia —
 * raport, który nie mówi o swoich granicach, wygląda na kompletny i właśnie
 * dlatego jest groźny.
 */
export const EMPLOYEE_MANUAL_FOLLOW_UPS: readonly string[] = [
    'Pliki w Storage (CV, faktury, dokumenty onboardingu/exitu) — odnośniki w bazie są zatarte, same obiekty trzeba usunąć w panelu Storage.',
    'Konto w auth.users — usunięcie/zablokowanie przez Admin API; zatarcie profilu odcina logowanie, ale nie kasuje tożsamości w warstwie auth.',
    'Skrzynka M365 i reguły przekierowania poczty — poza COMPASS-em.',
    'Kopie zapasowe bazy (PITR) — zatarcie nie sięga wstecz do snapshotów.',
] as const

export const CONTRACTOR_MANUAL_FOLLOW_UPS: readonly string[] = [
    'Arkusze źródłowe na SharePoint („Wejścia i zejścia od klientów") — cron tc-sync wgra nazwisko z powrotem przy najbliższym przebiegu, jeśli zostanie w pliku.',
    'Załączniki wywiadów w Storage (lifecycle-docs) — do usunięcia ręcznie.',
] as const

export function sourcesFor(subjectType: GdprSubjectType): readonly SubjectSource[] {
    return subjectType === 'employee' ? EMPLOYEE_SOURCES : CONTRACTOR_SOURCES
}

export function scrubStepsFor(subjectType: GdprSubjectType, subjectId: string): ScrubStep[] {
    return subjectType === 'employee' ? employeeScrubSteps(subjectId) : contractorScrubSteps(subjectId)
}

export function retainedFor(subjectType: GdprSubjectType): readonly RetainedRecord[] {
    return subjectType === 'employee' ? EMPLOYEE_RETAINED : CONTRACTOR_RETAINED
}

export function manualFollowUpsFor(subjectType: GdprSubjectType): readonly string[] {
    return subjectType === 'employee' ? EMPLOYEE_MANUAL_FOLLOW_UPS : CONTRACTOR_MANUAL_FOLLOW_UPS
}
