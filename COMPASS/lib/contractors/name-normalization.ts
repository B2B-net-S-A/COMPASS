// Kanonizacja nazw klientów i osób z arkuszy TCM.
//
// Arkusze są uzupełniane ręcznie przez kilka osób przez kilka lat, więc ta sama firma
// bywa zapisana na kilka sposobów („Nordea"/„NORDEA", „Xperi"/„XPERI"/„Xperii",
// „BNP"/„BNP Paribas"). Do momentu wprowadzenia tego modułu każdy wariant liczył się
// w statystykach osobno — Nordea wyglądała na 181 zejść zamiast 281.
//
// Kanonizujemy przy imporcie (w parserach, więc obejmuje też `external_key`
// i `contractors.current_client`). Nazwy spoza słownika zostają nietknięte poza
// przycięciem białych znaków — nie zgadujemy pisowni, bo akronimy (BIK, NBP, EY, PKO BP)
// rozjechałby dowolny automatyczny title-case.
//
// Dopisanie nowego wariantu = jedna linijka tutaj + deploy. Przy większej zmianie warto
// pamiętać o backfillu historii (wzorzec: migracja phase42a_normalize_names).

/** Wspólna forma porównawcza: bez skrajnych spacji, pojedyncze odstępy, lowercase. */
function lookupKey(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Warianty → nazwa kanoniczna. Klucze w formie `lookupKey`.
 *
 * Pisownia kanoniczna celowo zgadza się z tabelą `clients` (Phase 27d — lista dla
 * dropdownów premii), żeby moduł premii i analityka TC pokazywały te same nazwy.
 * Stąd wersaliki w ATOS/BOSCH/ERGO/NORI/ORLEN/XPERI i małe „e-zdrowie".
 *
 * Świadomie NIE scalane (osobne byty biznesowe, mimo podobieństwa):
 *   • „BNP Paribas Cardif" ≠ „BNP Paribas" — spółka ubezpieczeniowa grupy, nie bank
 *     (własne warianty „Cardif" / „BNP Cardif" scalamy w pełną nazwę),
 *   • „Centrum e-Zdrowia" — instytucja (CeZ), obok projektowego „e-zdrowie",
 *   • „BOSCH/Nordea", „Frontex / Atos" — kontrakty dzielone między dwóch klientów.
 */
export const CLIENT_ALIASES: Readonly<Record<string, string>> = {
    // Warianty wyłącznie wielkości liter
    'nordea': 'Nordea',
    'atos': 'ATOS',
    'bosch': 'BOSCH',
    'orlen': 'ORLEN',
    'ergo': 'ERGO',
    'nori': 'NORI',
    'santander': 'Santander',
    'polkomtel': 'Polkomtel',
    // Literówka
    'xperi': 'XPERI',
    'xperii': 'XPERI',
    // Skróty i formy pełne
    'alior': 'Alior',
    'alior bank': 'Alior',
    'bnp': 'BNP Paribas',
    'bnp paribas': 'BNP Paribas',
    // Spółka ubezpieczeniowa grupy — osobny byt od banku, ale jej własne warianty scalamy.
    'cardif': 'BNP Paribas Cardif',
    'bnp cardif': 'BNP Paribas Cardif',
    'bnp paribas cardif': 'BNP Paribas Cardif',
    'metlife': 'MetLife',
    'pko': 'PKO BP',
    'pko bp': 'PKO BP',
    'nationale': 'Nationale Nederlanden',
    'nationale nederlanden': 'Nationale Nederlanden',
    'velo': 'VeloBank',
    'velobank': 'VeloBank',
    'mleasing': 'mLeasing',
    'm-leasing': 'mLeasing',
    // Zapis z myślnikiem i bez, w czterech wariantach wielkości liter
    'ezdrowie': 'e-zdrowie',
    'e-zdrowie': 'e-zdrowie',
}

/**
 * Warianty → nazwisko kanoniczne. Wspólne dla rekruterów, Delivery Leadów i TCM-ów —
 * to ta sama pula osób wewnętrznych, wpisywana w arkuszach ręcznie. Tylko przypadki
 * jednoznaczne: literówki w pełnym imieniu i nazwisku oraz imiona, które w całej bazie
 * mają dokładnie jednego właściciela.
 *
 * Świadomie NIE mapowane (nie da się rozstrzygnąć bez zgadywania):
 *   • „Klaudia" — Uliasz czy Grelak,
 *   • „Marcin" — Kraszewski czy Kurowski,
 *   • „Olaf", „Anastazja", „Paula" — brak odpowiednika z nazwiskiem,
 *   • „Dominik/Malwina" — wpis o dwóch osobach.
 */
export const STAFF_ALIASES: Readonly<Record<string, string>> = {
    // Literówki w nazwiskach
    'aleksandra borzecka': 'Aleksandra Borzęcka',
    'aleskandra borzęcka': 'Aleksandra Borzęcka',
    'anna makushenko': 'Anna Makushchenko',
    'diana sditianova': 'Diana Sditanova',
    'lza grabińska': 'Elza Grabińska',
    'michał lenczewsk': 'Michał Lenczewski',
    'michał walasek': 'Michał Walasek', // wariant „MIchał Walasek"
    'krystyna soiko': 'Krystyna Sojko',
    'kristsina soiko': 'Krystyna Sojko',
    // Zdrobnienie
    'ola królewicz': 'Aleksandra Królewicz',
    // Samo imię — jedyny właściciel w bazie
    'igor': 'Igor Twardowski',
    'igor twardowski / stara kadencja': 'Igor Twardowski',
    'błażej': 'Błażej Bęben',
}

/**
 * Wartości oznaczające „nikt" wpisywane w arkuszu zamiast pustej komórki. Jako tekst
 * tworzyłyby fałszywą osobę w statystykach („—" jako rekruter z 30 zejściami).
 */
const EMPTY_PERSON_MARKERS = new Set(['-', '--', '—', '–', 'brak', 'n/a', 'nd', 'nd.', 'x'])

/** Kanoniczna nazwa klienta. Nieznane nazwy wracają przycięte, z zachowaną pisownią. */
export function normalizeClientName(raw: string | null | undefined): string {
    const collapsed = (raw ?? '').trim().replace(/\s+/g, ' ')
    return CLIENT_ALIASES[lookupKey(collapsed)] ?? collapsed
}

/**
 * Kanoniczne nazwisko osoby wewnętrznej (rekruter / Delivery Lead / TCM).
 * Zwraca `null` dla pustej komórki i dla znaczników „brak".
 */
export function normalizeStaffName(raw: string | null | undefined): string | null {
    const collapsed = (raw ?? '').trim().replace(/\s+/g, ' ')
    if (collapsed === '') return null
    const key = lookupKey(collapsed)
    if (EMPTY_PERSON_MARKERS.has(key)) return null
    return STAFF_ALIASES[key] ?? collapsed
}
