
export const SENSITIVE_CLIENTS = [
    'Nordea',
    'BNP',
    'Paribas',
    'BIK',
    'PKO',
    'Pekao',
    'Santander',
    'ING',
    'mBank',
    'Millennium',
    'Alior',
    'Citi',
    'Handlowy'
]

export function anonymizeProjectText(text: string | null | undefined): string {
    if (!text) return ''

    let anonymized = text

    // Simple case-insensitive replacement
    SENSITIVE_CLIENTS.forEach(client => {
        const regex = new RegExp(`\\b${client}\\b`, 'gi')
        anonymized = anonymized.replace(regex, 'Klient')
    })

    return anonymized
}

export function formatProjectValue(value: string | number | null | undefined, isAdmin: boolean): string {
    if (!value) {
        return isAdmin ? 'Brak' : 'N/A'
    }

    const strValue = String(value).trim()
    const lowerValue = strValue.toLowerCase()

    // check for common placeholder variations
    if (['brak', 'nie podano', 'tbd', 'nieznana', 'nan', 'null', 'undefined', '-'].includes(lowerValue)) {
        return isAdmin ? 'Brak' : 'N/A'
    }

    return strValue
}
