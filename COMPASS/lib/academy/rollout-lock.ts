// Tryby dostępu do Akademii, które da się ustawić (B0.4). Trybu otwartego nie ma celowo:
// blokuje go też baza (20261109023000_academy_rollout_open_lock.sql), także adminowi.
// Zdjęcie blokady to osobna migracja stosowana przez właściciela na bramce startu.

export const ACADEMY_ROLLOUT_MODES = ['closed', 'pilot'] as const
export type AcademyRolloutMode = (typeof ACADEMY_ROLLOUT_MODES)[number]

export const ACADEMY_PILOT_LIMIT = 20
