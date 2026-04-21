'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================================
// Referral Program Settings — regulamin + zasady nagród
// Dane przechowywane w system_settings (klucze: referral_*)
// ============================================================

export interface ReferralRewardTier {
    id: string
    level: string           // np. "Junior", "Mid", "Senior", "Expert"
    description: string     // np. "0–2 lata doświadczenia"
    bonusAmount: number     // PLN netto
    loyaltyPoints: number   // punkty lojalnościowe
}

export interface ReferralRewardAction {
    id: string
    action: string          // np. "Zgłoszenie kandydata", "Rozpoczęcie projektu"
    description: string
    points: string          // np. "0 pkt", "25-100 pkt"
    order: number
}

export interface ReferralSettings {
    rules: string                       // HTML/Markdown regulaminu
    rulesEffectiveDate: string          // data wejścia w życie
    rulesContactEmail: string           // email kontaktowy
    rewardTiers: ReferralRewardTier[]   // tabela bonusów
    rewardActions: ReferralRewardAction[] // kroki zasad i nagród
}

const DEFAULT_REWARD_TIERS: ReferralRewardTier[] = [
    { id: '1', level: 'Junior', description: '0–2 lata doświadczenia', bonusAmount: 2000, loyaltyPoints: 25 },
    { id: '2', level: 'Mid', description: '2–5 lat doświadczenia', bonusAmount: 3000, loyaltyPoints: 50 },
    { id: '3', level: 'Senior', description: '5–10 lat doświadczenia', bonusAmount: 4000, loyaltyPoints: 75 },
    { id: '4', level: 'Expert / Lead', description: '10+ lat doświadczenia', bonusAmount: 5000, loyaltyPoints: 100 },
]

const DEFAULT_REWARD_ACTIONS: ReferralRewardAction[] = [
    { id: '1', action: 'Zgłoszenie kandydata', description: 'Wypełnij formularz. Sprawdzimy czy kandydata nie ma już w bazie.', points: '0 pkt', order: 1 },
    { id: '2', action: 'Rozpoczęcie projektu', description: 'Gdy Twój kandydat zacznie pracę, otrzymasz punkty lojalnościowe.', points: '25–100 pkt', order: 2 },
    { id: '3', action: 'Bonus Finansowy', description: 'Po 3 miesiącach nienagannej pracy wypłacamy bonus na fakturę B2B.', points: '2000–5000 PLN', order: 3 },
]

const DEFAULT_RULES = `§1 Postanowienia ogólne
1. Program Rekomendacji B2B.net (dalej „Program") jest systemem motywacyjnym skierowanym do wszystkich aktywnych współpracowników B2B.net S.A. (dalej „Rekomendujący").
2. Celem Programu jest pozyskiwanie wykwalifikowanych specjalistów IT do realizacji projektów klientów B2B.net S.A.
3. Program działa w trybie ciągłym — rekomendacje można składać w dowolnym momencie.
4. Administratorem Programu jest Dział Rekrutacji (rekrutacja@b2bnetwork.pl).

§2 Kto może rekomendować
1. Rekomendującym może być każda osoba posiadająca aktywną umowę współpracy z B2B.net S.A. (umowa B2B, umowa zlecenie).
2. Pracownicy etatowi Działu Rekrutacji nie mogą uczestniczyć w Programie.
3. Rekomendujący nie może polecać samego siebie ani osób, z którymi łączy go stosunek zależności służbowej w ramach tego samego projektu.

§3 Proces rekomendacji
1. Zgłoszenie kandydata — Rekomendujący wypełnia formularz w systemie ComPass (Service Hub → Rekomendacje → „Rekomenduj"). Wymagane dane: imię i nazwisko, adres e-mail, specjalizacja, opcjonalnie CV.
2. Weryfikacja duplikatu — System automatycznie sprawdza, czy kandydat nie znajduje się już w bazie B2B.net.
3. Proces rekrutacyjny — Dział Rekrutacji kontaktuje się z kandydatem w ciągu 5 dni roboczych.
4. Rozpoczęcie projektu — Kandydat podpisuje umowę z B2B.net S.A. i rozpoczyna pracę na projekcie klienta.
5. Wypłata bonusu — Po przepracowaniu przez kandydata 3 miesięcy na projekcie, Rekomendujący otrzymuje bonus finansowy na podstawie faktury VAT.

§4 Wysokość bonusu
1. Poziom doświadczenia kandydata określa Dział Rekrutacji na podstawie weryfikacji kompetencji.
2. Bonus wypłacany jest na podstawie faktury VAT wystawionej przez Rekomendującego w terminie do 14 dni od zakończenia okresu kwalifikacyjnego.
3. Punkty lojalnościowe naliczane są automatycznie w systemie ComPass w momencie rozpoczęcia projektu przez kandydata.

§5 Wyłączenia i ograniczenia
1. Bonus nie przysługuje, jeżeli kandydat był już w bazie B2B.net (kontaktowany w ciągu ostatnich 12 miesięcy).
2. Bonus nie przysługuje, jeżeli kandydat aplikował samodzielnie przed datą rekomendacji.
3. W przypadku rozwiązania umowy z kandydatem w okresie kwalifikacyjnym (3 miesiące) z przyczyn leżących po stronie kandydata — bonus nie jest wypłacany.
4. Rekomendujący może zgłosić maksymalnie 10 kandydatów w jednym miesiącu kalendarzowym.
5. Jedna osoba nie może być rekomendowana przez więcej niż jednego Rekomendującego. Decyduje data i godzina zgłoszenia w systemie.

§6 Ochrona danych osobowych
1. Rekomendujący oświadcza, że uzyskał zgodę kandydata na przekazanie jego danych osobowych do B2B.net S.A.
2. Dane kandydatów przetwarzane są zgodnie z Polityką Prywatności B2B.net S.A. oraz RODO.
3. Kandydat zostaje poinformowany o źródle rekomendacji i ma prawo wycofać zgodę na przetwarzanie danych.

§7 Postanowienia końcowe
1. B2B.net S.A. zastrzega sobie prawo do zmiany warunków Programu z 30-dniowym wyprzedzeniem.
2. Wszelkie spory rozstrzyga Zarząd B2B.net S.A.
3. Regulamin wchodzi w życie z dniem 1 stycznia 2026 r.`

/**
 * Get referral settings from system_settings
 */
export async function getReferralSettings(): Promise<ReferralSettings> {
    const supabase = await createClient()

    const keys = ['referral_rules', 'referral_rules_date', 'referral_contact_email', 'referral_reward_tiers', 'referral_reward_actions']
    const { data } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', keys)

    const settings = new Map(data?.map(s => [s.key, s.value]) || [])

    return {
        rules: settings.get('referral_rules') || DEFAULT_RULES,
        rulesEffectiveDate: settings.get('referral_rules_date') || '2026-01-01',
        rulesContactEmail: settings.get('referral_contact_email') || 'rekrutacja@b2bnetwork.pl',
        rewardTiers: tryParseJSON(settings.get('referral_reward_tiers'), DEFAULT_REWARD_TIERS),
        rewardActions: tryParseJSON(settings.get('referral_reward_actions'), DEFAULT_REWARD_ACTIONS),
    }
}

/**
 * Save referral rules (regulamin)
 */
export async function saveReferralRules(rules: string, effectiveDate: string, contactEmail: string) {
    await requireAdmin()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const updates = [
        { key: 'referral_rules', value: rules, updated_at: new Date().toISOString(), updated_by: user!.id },
        { key: 'referral_rules_date', value: effectiveDate, updated_at: new Date().toISOString(), updated_by: user!.id },
        { key: 'referral_contact_email', value: contactEmail, updated_at: new Date().toISOString(), updated_by: user!.id },
    ]

    for (const u of updates) {
        const { error } = await supabase.from('system_settings').upsert(u, { onConflict: 'key' })
        if (error) throw new Error(`Failed to save ${u.key}: ${error.message}`)
    }

    revalidatePath('/admin/settings/loyalty')
    revalidatePath('/admin/centrala')
    revalidatePath('/centrala')
    return { success: true }
}

/**
 * Save reward tiers (tabela bonusów)
 */
export async function saveReferralRewardTiers(tiers: ReferralRewardTier[]) {
    await requireAdmin()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('system_settings').upsert({
        key: 'referral_reward_tiers',
        value: JSON.stringify(tiers),
        updated_at: new Date().toISOString(),
        updated_by: user!.id,
    }, { onConflict: 'key' })

    if (error) throw new Error(`Failed to save reward tiers: ${error.message}`)

    revalidatePath('/admin/settings/loyalty')
    revalidatePath('/admin/centrala')
    revalidatePath('/centrala')
    return { success: true }
}

/**
 * Save reward actions (kroki zasad i nagród)
 */
export async function saveReferralRewardActions(actions: ReferralRewardAction[]) {
    await requireAdmin()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase.from('system_settings').upsert({
        key: 'referral_reward_actions',
        value: JSON.stringify(actions),
        updated_at: new Date().toISOString(),
        updated_by: user!.id,
    }, { onConflict: 'key' })

    if (error) throw new Error(`Failed to save reward actions: ${error.message}`)

    revalidatePath('/admin/settings/loyalty')
    revalidatePath('/admin/centrala')
    revalidatePath('/centrala')
    return { success: true }
}

// ---- Helpers ----

async function requireAdmin() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'administrator', 'centrala'].includes(profile?.role || '')) {
        throw new Error('Insufficient permissions')
    }
}

function tryParseJSON<T>(value: string | undefined, fallback: T): T {
    if (!value) return fallback
    try {
        return JSON.parse(value) as T
    } catch {
        return fallback
    }
}
