# Akademia: kanały wyjścia

Spis wszystkiego, czym Akademia mogłaby dotrzeć do człowieka poza aplikacją (B0.3). Pilnuje go `COMPASS/lib/academy/__tests__/outbound-channels.test.ts` i `outbound-boundary.test.ts`. Nowy kanał oznacza nowy wiersz i nowy test, bo plan zakłada, że żaden merge nie może niczego wysłać.

| Kanał | Gdzie w kodzie | Stan przy domyślnych przełącznikach | Co go zamyka |
|---|---|---|---|
| Poczta Microsoft Graph | `lib/academy/outbound.ts`, jedyny wywołujący `sendEmail` w obszarze Akademii | Wiersz `held` w `academy_outbox`, zero wywołań Graph | Paczka zatwierdzona przez człowieka i `ACADEMY_MAIL_ENABLED=true`. Wysyłka testowa tylko na `ACADEMY_MAIL_TEST_RECIPIENTS`. Jedyny wyjątek: link ponownego wejścia (`academy.reentry`, termin 15 minut) wychodzi regułą automatyczną przy `ACADEMY_MAIL_ENABLED=true` i `ACADEMY_PASS_ENABLED=true` (`sendAcademyAutoMail`, decyzja właściciela 2026-11-09) |
| Cron `course-inactivity` | `app/api/cron/course-inactivity/route.ts` | Przez bramkę: wiersz `held`, `sent: 0`. Znacznik `last_inactivity_email_at` zostaje nietknięty, bo nic nie wyszło | Jak poczta |
| Wydarzenia Graph z uczestnikami | `lib/academy/teams.ts` (`createTeamsCalendarEvent`), woła wyłącznie `lib/academy/integration-worker.ts` | Worker nie pobiera zadań | `ACADEMY_TEAMS_ENABLED=true` (tylko dosłowna wartość `true`) oraz komplet danych Azure |
| Przypomnienia T-21, T-7, T-1, T-1 h | `lib/academy/run-reminders-worker.ts`, wołany z `app/api/cron/academy-sync` | Przez bramkę: wiersze `held` z terminem na początek spotkania | Jak poczta |
| Web push | `lib/push/dispatch.ts` | Obszar Akademii go nie woła | Brak wywołań; test czytający źródło |
| Webhook Teams | `lib/teams/webhook.ts` | Obszar Akademii go nie woła | Brak wywołań; test czytający źródło |
| Maile Supabase Auth | `lib/actions/user-admin.ts`, `app/forgot-password/page.tsx` | Obszar Akademii ich nie wyzwala. Zaproszenia do konta i reset hasła należą do reszty aplikacji | Brak wywołań w obszarze; test czytający źródło |
| Powiadomienia w dzwonku | `academy_private.notify`, wołane m.in. z `academy_dispatch_reminders` | Wiersz w `notifications`, tylko w aplikacji | Nie wychodzi poza aplikację |

## Odczyt z produkcji, 2026-11-09

Tylko agregaty, zapytanie do katalogu bazy.

- `public.notifications`: 0 wyzwalaczy, więc wiersz w dzwonku niczego dalej nie uruchamia.
- Rozszerzenia `pg_net` i `http`: brak. Webhooki bazodanowe (`supabase_functions`): 0. Baza nie ma czym wysłać żądania na zewnątrz.
- Opublikowane kursy: 0, więc cron `course-inactivity` nie ma dziś kogo przypominać.

## Uwagi na później

- Włączenie `ACADEMY_TEAMS_ENABLED` samo wysyła zaproszenia kalendarzowe do uczestników zatwierdzonych sesji i nie przechodzi przez `academy_outbox`. Do bramki startu przełącznik zostaje wyłączony.
- B1.3 (przepustka) doda `verifyOtp` i Admin API w obszarze Akademii. Ta zmiana musi świadomie zaktualizować test kanału Supabase Auth.
