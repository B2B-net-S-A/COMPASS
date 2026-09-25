// Konto w Entra bez skrzynki Exchange Online (np. bez licencji z pocztą).
//
// Graph odpowiada wtedy 404 `MailboxNotEnabledForRESTAPI`. Crony skanujące skrzynki
// (oof-reconcile, forward-reconcile) liczyły to jako „nie odczytano" i codziennie
// zgłaszały ten sam fałszywy błąd dla zbigniew.twardowski@ (od 2026-08-03).
// Brak skrzynki to stan, a nie awaria: nie ma w niej ani OOF, ani reguł COMPASS,
// bo zakładamy je na ten sam adres.
//
// Celowo wąsko: inne 404 (np. adres spoza tenanta — literówka w profilu) dalej
// są błędem, bo tam skrzynka może istnieć pod innym adresem.

const NO_MAILBOX_CODE = 'MailboxNotEnabledForRESTAPI'
const NO_MAILBOX_MESSAGE = 'mailbox is either inactive, soft-deleted, or is hosted on-premise'

/** Pure function — exported for unit testing. */
export function isNoExchangeMailboxError(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false
    const e = err as { statusCode?: unknown; code?: unknown; message?: unknown }
    if (e.statusCode !== 404) return false
    if (e.code === NO_MAILBOX_CODE) return true
    return typeof e.message === 'string' && e.message.includes(NO_MAILBOX_MESSAGE)
}
