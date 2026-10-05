/** Public, fixed messages only; never return scanner/server diagnostics. */
export function materialRejectionMessage(code: unknown): string {
    if (code === 'invalid_m4a') return 'Wyeksportuj pojedynczy plik M4A z jedną ścieżką AAC-LC, bez obrazu, szyfrowania i segmentów.'
    if (typeof code === 'string' && ['invalid_mp3', 'incomplete_mp3', 'mp3_metadata_limit'].includes(code)) return 'Plik MP3 jest niekompletny lub ma nieobsługiwaną strukturę. Wyeksportuj ponownie MPEG Layer III bez dodatkowych danych na końcu pliku.'
    if (code === 'fragmented_mp4_unsupported') return 'Segmentowane nagrania MP4 nie są obsługiwane. Wyeksportuj pojedynczy plik MP4 z obrazem H.264 i dźwiękiem AAC-LC.'
    if (code === 'unsupported_mp4_codec' || code === 'unsupported_mp4_tracks') return 'Nagranie wymaga H.264 (8-bit, Baseline/Main/High), jednej ścieżki obrazu i najwyżej jednej ścieżki AAC-LC. Napisy dodaj osobno jako VTT.'
    if (code === 'mp4_metadata_limit') return 'Nagranie ma zbyt rozbudowaną strukturę. Podziel je na krótsze pliki MP4 z obrazem H.264 i dźwiękiem AAC-LC.'
    if (typeof code === 'string' && ['invalid_mp4_structure', 'incomplete_mp4', 'incomplete_mp4_samples', 'overlapping_mp4_samples', 'external_mp4_reference', 'unsupported_mp4_structure', 'mp4_requires_full_validation'].includes(code)) return 'Plik MP4 jest niekompletny albo ma nieobsługiwaną strukturę. Wyeksportuj go ponownie z obrazem H.264 i dźwiękiem AAC-LC.'
    return 'Plik nie przeszedł weryfikacji bezpieczeństwa lub formatu.'
}
