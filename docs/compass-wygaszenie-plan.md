# Wygaszenie COMPASSA: inwentarz i plan (13.11.2026)

Ten dokument jest tylko planem: niczego nie wyłączono i nie zmieniono env, cronów ani danych.
Każdy krok z sekcji 7 wymaga osobnej decyzji Artura.

Decyzje, z których wynika plan:
- 16.10.2026: moduły HR (kartoteka, urlopy, czas, płace, wejście i odejście, opieka, sprawy) przechodzą do NEXUSA;
- 13.11.2026: szkolenia budujemy w NEXUSIE, a Compass ma zostać wygaszony w całości, razem z Akademią.

Dowody pochodzą z odczytów z 13.11.2026:
- SELECT-y na `compass-prod` (`shduiynzemftkqqefscd`);
- `gh run list` / `gh run view --log`;
- publiczne `/api/health` trzech aplikacji;
- kod Compassa (`origin/main` 53e94f5), NEXUSA (`origin/main` cdceaa33c) i ATLASA (`origin/main` c07b018).

Lokalne checkouty NEXUSA (24.07) i ATLASA (28.09) są nieaktualne, więc nie należy z nich czytać.

---

## 1. Stan w skrócie

| Co | Wartość | Źródło |
|---|---|---|
| Produkcja | healthy, `53e94f5`, wdrożona 10.11 | `/api/health` |
| Hosting | Coolify v4 na własnym serwerze Hetzner CAX21 (`compass-prod`), domena `compass.dynaminds.pl` za Cloudflare | `CLAUDE.md`, `dig NS dynaminds.pl` |
| Konta | 48 w `auth.users`, wszystkie w `@b2bnetwork.pl` | SELECT |
| Logowania | 4 osoby w ostatnich 30 dniach, 0 w ostatnich 7 dniach, ostatnie 02.11 | `auth.users.last_sign_in_at` |
| Ostatnie zapisy treści HR | urlop 15.10, wpis timesheetu 16.10, premia 15.10, sprawa 15.10 | `max(created_at)` |
| `HR_MOVED_TO_NEXUS` w bazie | `people,leave,time,payroll,cases` | `system_settings['hr_moved_to_nexus']` |
| `HR_MOVED_TO_NEXUS` w env | co najmniej `leave,time,payroll`: te crony piszą `skipped: przeniesione do NEXUSA`. `care` i `lifecycle` **nie są** przeniesione, bo ich crony pracują | heartbeaty `audit_logs` z 10 dni |
| `HR_EXPORTS_OFF` | `care` nie jest wyłączony, bo ATLAS dostaje dziś pełny feed. Wartość dla pozostałych modułów jest niepotwierdzona | sonda ATLASA `compass_signals: healthy` |
| Akademia | rollout `closed`, 5 kursów (4 `draft`, 1 `pending_review`), 0 opublikowanych, 0 plików w buckecie materiałów | `academy_rollout_settings`, `courses`, `storage.objects` |
| Baza | 164 MB, z czego `audit_logs` to 124 MB (296 246 wierszy, od 10.05.2026) | `pg_database_size`, `pg_total_relation_size` |
| Storage | tylko `avatars`: 20 plików, 2,8 MB. Załączniki urlopów i premii, dokumenty umów oraz materiały Akademii: 0 plików | `storage.objects` |

Wniosek: z Compassa nikt już realnie nie korzysta. Nadal jednak działają crony, które wysyłają powiadomienia, i ATLAS pobiera z niego sygnały sprzedażowe.

### Pilne, niezależnie od wygaszenia: rejestracja była otwarta (zamknięta 13.11, D1)

- `GET /auth/v1/settings` zwraca `disable_signup: false`, a dostawcy to `email` i `azure`.
- Polityka `"Public profiles are viewable by everyone."` na `profiles` ma `roles={authenticated}` i `qual=true`.
- Migracja z bramką rejestracji `20261109120000_auth_signup_gate_profiles_rls.sql` **nie jest zastosowana**: nie ma tabeli `academy_learner_accounts`, na `auth.users` jest tylko wyzwalacz `on_auth_user_created`.

Skutek: każdy może założyć konto e-mailem, potwierdzić je i kluczem publicznym przeczytać wszystkie 48 profili kadrowych. To samo opisuje `docs/academy/PRZEKAZANIE.md:34` (odczyt z 09.11). Na razie nie ma kont spoza domeny (0).

Najszybsze zamknięcie: Supabase → Authentication → Sign In / Providers → wyłączyć „Allow new users to sign up”.
- Wszystkie 48 kont już istnieje, więc logowanie przez SSO nadal działa.
- Wycofanie: włączyć z powrotem.

---

## 2. Co Compass robi dziś: crony

„Pomija” oznacza, że trasa pisze tylko heartbeat `skipped`. Scheduler to Coolify (`scheduled_tasks`) albo GitHub Actions (GH).
Ostatni odczyt listy zadań Coolify pochodzi z 24.08 (`Coolify Ops` → `cron-list`, bieg 32749313126). Nowszego nie ma, dlatego ta kolumna jest częściowo niepotwierdzona.

| Trasa | Co robi dziś | Moduł / pomija? | Wychodzi do ludzi? | Scheduler | Ostatnie biegi |
|---|---|---|---|---|---|
| `oof-reconcile` | nic | leave, **pomija** | nie | Coolify 06:00 | 10/10 `skipped` |
| `timesheet-reminder` | nic | time, **pomija** | nie | GH `0 8 1-5 * *` + Coolify | 1–5.11 `skipped` |
| `placement-status-tick`, `placement-hours-reminder` | nic | payroll, **pomija** | nie | Coolify | `skipped` |
| `contractor-followup-reminder` | powiadomienie i web push do opiekunów o zaległych rozmowach | care, **działa** | **tak** (8 powiadomień w 7 dni) | Coolify 08:00 | 13.11 `due:5, notified:1` |
| `tech-map-project-end` | alert o końcu projektu (mail, push, powiadomienie) | care, działa | tak, przy trafieniu | Coolify 06:00 | `scanned:168, alerted:0` |
| `nexus-contractors-sync` | pobiera kontraktorów z NEXUSA i przepisuje werdykty na `contractors` | care, działa | nie (sam zapis) | GH `0 6 * * *` | 9, 12 i 13.11 ten sam wynik: `written:723, linked:0` |
| `consultant-success-plan` | planer opieki w trybie shadow | care, działa | nie (shadow) | Coolify 04:10 | `shadowMode:true, programEnrolled:30, deliveriesInserted:0` |
| `consultant-success-dispatch` | wysyłka ankiet pulse | care | nie (0 dostaw) | Coolify co 5 min (zrzut 24.08) | brak wiersza `job_state` |
| `tc-sync` | arkusz wejść i zejść z SharePointa | care | nie | Coolify 05:00 | `skipped: TC_SYNC_ENABLED != true` |
| `lifecycle-checkins`, `lifecycle-reminders` | maile onboardingowe i o exit interview | lifecycle, **działa** | tak, przy trafieniu (dziś 0) | Coolify 09:00/10:00 | `scanned:0` |
| `m365-profile-resync` | czyta profile z Graph i aktualizuje `profiles` | bez bramki | nie | Coolify niedz. 04:00 | 08.11 `synced:28, failed:2` |
| `legal-monitor-alerts` | monitoring prawny: digest i alerty | nie HR, **jedyna funkcja bez odpowiednika w NEXUSIE** (`git grep legal.?monitor` w NEXUSIE pusty) | **tak** (mail, push), digest skonfigurowany, 6 pozycji w 30 dni | GH `23 8 * * *` | 12.11 zera, ostatni digest 09.11 |
| `audit-log-retention` | kasuje `audit_logs` starsze niż 12 miesięcy | nie | nie | GH `41 3 * * *` | `deleted:0` |
| `academy-sync`, `academy-materials` | worker outboxu i Teams oraz skaner ClamAV; wszystko wyłączone przełącznikami | Akademia | nie | **systemd timer na hoście co 1 min** | razem ok. 27,5 tys. biegów w 10 dni, 5 656 wierszy `audit_logs` na dobę |
| `academy-certificate-expiry`, `academy-retrieval`, `course-inactivity` | przypomnienia do outboxu jako `held` | Akademia | nie | GH oraz (course-inactivity) niepotwierdzone | `held:0` / `switch_off` |
| `nexus-roster-sync`, `secret-expiry-check`, `academy-learners-sync`, `academy-material-cleanup` | — | — | — | brak | ani jednego heartbeatu, nigdy nie ruszyły |

Workflowy bez trasy:
- `academy-health.yml` co 10 min łączy się przez SSH z hostem. 13.11 zgłosił `degraded: scanner_signatures_aging`.
- Zadania Coolify `clock-*` były 24.08 włączone, choć ich tras nie ma, więc prawdopodobnie zwracają 404. Stan dzisiejszy jest niepotwierdzony.

---

## 3. Integracje: kto woła Compassa i co się stanie, gdy zniknie

| Trasa Compassa | Konsument | Stan przełączenia | Gdy trasa zniknie |
|---|---|---|---|
| `GET /api/internal/sales-signals` + `POST …/status` (`care`) | **ATLAS**: `src/integrations/compass_client.py:34-35`, scheduler co 15 min `services/scheduler.py:814-822` | **aktywny, nieprzełączony**. ATLAS nie ma innego źródła. NEXUS ma `GET /api/care/atlas/sales-signals` (`backend/app/api/care_atlas.py:27-55`), ale ATLAS go nie użyje bez zmian w kodzie: inny nagłówek (`X-API-Key` zamiast `Bearer`), `id` typu int zamiast str (`compass_client.py:146`) i inne `client_id`. Według decyzji z 22.10 popyt od konsultantów idzie do Delivery Leada, nie do ATLASA | 4xx/5xx daje `fetch_failed` i **nic nie zostaje wycofane** (`compass_signal_ingest.py:557-568`). Pojawia się jednak szum: sonda `degraded`, czerwony `synthetic.yml`, zgłoszenie do Sentry co bieg |
| `GET /api/internal/availability` (`leave`) | NEXUS `services/workforce_availability.py:519-539`, przydziały rekrutacji | źródło `app_settings['hr_availability_source']`: `compass` albo `local`. Stan **niepotwierdzony** (K11 runbooka NEXUSA) | przy `compass`: po 300 s stają automatyczne przydziały (`docs/ops/recruitment-allocation-compass.md:20-22`) |
| `GET /api/internal/roster` (`lifecycle`) | NEXUS `services/compass_lifecycle.py:405-417` | sonda `compass_lifecycle: healthy`. Czy moduł `lifecycle` w NEXUSIE jest włączony (wtedy `superseded_by_hr_lifecycle`), jest **niepotwierdzone** | przy wyłączonym module: konta osób, które odeszły, zostają w NEXUSIE aktywne bez alarmu (sonda tylko informacyjna, `main.py:3041`) |
| `GET /api/internal/workdays` (`leave`) | NEXUS `tasks/compass_workdays_sync.py` | **odłączony** (`compass_workdays: unconfigured`, K12) | brak skutku |
| `GET /api/internal/payroll-export` (`CRON_SECRET`) | w żadnym repo nie znaleziono wywołującego | — | prawdopodobnie brak skutku; sprawdzić `scheduled_tasks` i logi Traefika |
| `GET /api/admin/snapshot` | narzędzia Artura (`snapshot-3-apps.sh`, agent `dynaminds-ops`, skill `ops-snapshot`) | — | narzędzia pokażą błąd dla Compassa |
| **Compass → NEXUS:** `nexus-contractors-sync` (`contractors:read`), `nexus-roster-sync` (`people_roster:read`) | konta serwisowe w NEXUSIE | — | po wygaszeniu klucze do unieważnienia w NEXUSIE |

Poza NEXUSEM i ATLASEM nikt nie woła Compassa. Przeszukano repo w `/Users/arturtwardowski`: ELEVATE, JARVIS, InfraReporter, B2BNETWORK-WWW, DYNA i inne.

---

## 4. Archiwum danych

Paczka eksportu do NEXUSA istnieje: `COMPASS/scripts/export-nexus-bundle.mjs` i spec `COMPASS/docs/nexus-bundle-v1.md`. Próba generalna importu z 18.10 w NEXUSIE dała zgodne liczby (`NEXUS docs/claude/ludzie/runbook-przelaczenia-z-compassa.md`).

| Obszar (tabele) | Wiersze dziś | W NEXUSIE? | Uwagi |
|---|---|---|---|
| Kartoteka `profiles` | 48 (37 active, 7 offboarding, 2 pending, 2 exited) | tak: 45 kartotek. Kartotekę od 18.10 prowadzi NEXUS, import `profiles` jest zakazany | 2 konsultantów „zostaje w Akademii”, co po decyzji z 13.11 przestaje obowiązywać |
| Urlopy `leave_requests` | 212 | tak, K4/K5 (18.10), drugi przebieg 0 zmian | załączniki: 0 plików w Storage |
| Czas `timesheets` / `timesheet_entries` / `attendance_records` | 242 / 3 661 (**29 018,75 h**) / 1 137 | import `time` 18.10: 28 676,75 h | **różnica 342 h** do wyjaśnienia (domknięcie października po 18.10?), zanim uznamy archiwum za kompletne |
| Płace `user_rates` / `bonuses` | 104 / 246 | w próbie zgodne (104 / 246). Import na produkcji **niepotwierdzony** | |
| Sprawy administracja@ (`inbox_%`) | 611 spraw, 69 komentarzy | w próbie 611. Produkcja niepotwierdzona | |
| Wejście i odejście (`exit_interviews`, `offboarding_tasks`, `onboarding_*`) | 9 / 40 / 2+20 | w paczce (moduł `lifecycle`). Import niepotwierdzony | moduł w Compassie nadal żywy |
| Opieka i mapa technologii (`contractors`, `tech_interview_cards`, `contractor_conversations`, `contractor_success_settings`) | 723 / 168 / 147 / 697 | w paczce (moduł `care`). W próbie 166 kart bez powiązania z kontraktem i 135 technologii spoza słownika | `care` w Compassie nadal żywy, `contractors.nexus_candidate_id` powiązane: 0 |
| Rozmowy kontraktorów `contractor_%` | 147 spraw | **nie ma w paczce** („nie eksportujemy”, `nexus-bundle-v1.md:114`) | trzeba zdecydować: dołożyć do eksportu do NEXUSA albo tylko do zrzutu archiwalnego |
| Wejścia i zejścia, placementy, ławka (`client_entries`, `client_departures`, `placements`, `contractor_bench`) | 347 / 365 / 117 / 73 | **nie ma w paczce** | NEXUS ma te dane u siebie z kontraktów (niepotwierdzone), więc to raczej archiwum |
| Monitoring prawny `legal_monitor_items` / `_runs` | 96 / (szac. ok. 100) | **brak modułu w NEXUSIE** | decyzja: przenieść albo porzucić |
| `audit_logs` | 296 246 (od 10.05) | nie | ok. 95% to heartbeaty cronów. Ślad dostępu do danych kadrowych trzeba zostawić w zrzucie |
| Zgody `um_*`, `user_contract_documents`, `invoices`, `work_clock_*` | 0 wierszy | — | nie ma czego przenosić |
| Akademia (`courses`, `course_versions`, `academy_*`) | 5 / 5, reszta pusta | nie | 5 szkiców: do przejrzenia, czy treść ma wartość jako materiał w NEXUSIE |

Proponowana forma archiwum (decyzja w sekcji 8):
1. **Pełny zrzut** `pg_dump --format=custom` schematów `public`, `academy_private`, `storage` (metadane) oraz pliki z bucketu `avatars`. Zrzut szyfrowany (age/GPG), SHA-256 w raporcie. Odtworzenie sprawdzone lokalnie na `postgres:17` (liczby z tabeli wyżej).
2. **CSV per tabela** dla obszarów, których nie ma w NEXUSIE (rozmowy kontraktorów, wejścia i zejścia, placementy, monitoring prawny), czytelne bez Postgresa.
3. Oba trafiają do biblioteki SharePoint z dostępem tylko dla Kadr i Artura. Okres przechowania ustalają Kadry albo prawnik; ten dokument go nie ustala.

---

## 5. Akademia: co bierzemy jako wzór, co porzucamy

Szczegółowa lista z plik:linia jest w raporcie sesji. Najważniejsze:

| Element | Pliki (źródło / testy) | Jak przenieść do NEXUSA |
|---|---|---|
| **Import obecności i zapisów CSV z Teams** | `COMPASS/lib/academy/webinar-import.ts` (240), `lib/academy/attendance.ts` (140); testy `lib/academy/__tests__/webinar-import.test.ts`, `attendance.test.ts`; spec `docs/academy/webinar-import.md` | **kod 1:1 na Pythona** (`csv`, `zoneinfo`) razem z przypadkami testowymi. Zasady: autodetekcja separatora i BOM, nagłówki PL/EN, odrzucanie niejednoznacznej godziny przy zmianie czasu, unia przedziałów przycięta do okna zajęć, dopasowanie wyłącznie po tożsamości M365 albo zweryfikowanym e-mailu (bez nazwiska), brak w raporcie = `needs_review` |
| **Player z postępem oglądania** | `lib/academy/video-progress.ts` (67, czysty: próg 90%, zapis co 15 s, przerwa ≤ 3 s, restart 10 s przed końcem), `components/learning/LessonPlayer.tsx`, RPC w `supabase/migrations/20261109213000_academy_video_progress.sql` (scalanie zakresów, limit tempa: nowe sekundy ≤ 2× czas od zapisu + 30 s) | `WatchTracker` jako logika frontu NEXUSA. Scalanie zakresów i limit tempa jako czysta funkcja w Pythonie i endpoint FastAPI |
| **Skan ClamAV z kwarantanną** | `lib/academy/clamav.ts` (42, INSTREAM, tylko `stream: OK\0` = czysto), `material-scanner.ts`, `mp4-validation.ts`; stany `uploading → quarantined → scanning → ready|rejected` (`20260922141927_academy_materials.sql:14`); runbook `docs/academy/clamav-operations.md`; bramka CI `academy-malware.yml` (EICAR) | protokół jako ok. 30 linii Pythona. Maszyna stanów, `clamd.conf` i obraz `clamav/clamav:1.4.6` jako specyfikacja. Kontroler hosta Coolify do porzucenia. W produkcji ClamAV dziś nigdzie nie działa |
| Certyfikat = obecność + test | `certificate-validity.ts` (36), `document-verify.ts` (69), `20261109200600_academy_participation_documents.sql` | reguła wydania i weryfikacji jako specyfikacja, `certificate-validity` jako kod. PDF od nowa (np. WeasyPrint) |
| Zabezpieczenia synchronizacji uczestników | `lib/academy/learner-sync.ts` (113): pusta migawka = odmowa, ponad 5 wygaśnięć = potwierdzenie, bez dopasowań po nazwisku | specyfikacja. W NEXUSIE źródło (umowy) jest lokalne |
| Scenariusze uploadu wznawianego | `ops/academy/storage/gate.test.mjs`, `scripts/test-academy-storage.mjs` | lista scenariuszy testowych (przerwany chunk, cofnięcie uprawnień w trakcie, SHA-256) |

**Porzucamy:**
- UI `app/(protected)/learning/`, `app/(protected)/admin/learning/`, `components/academy/`, `components/learning/`;
- akcje `lib/actions/academy-*` (29);
- 7 tras cron `academy-*`, 9 workflowów `academy-*` i `cron-academy-*`;
- `ops/academy/` (watchdogi Coolify, kontroler clamd);
- 63 skrypty `scripts/test-academy-*-db.mjs`;
- 84 migracje `*academy*`;
- 46 tabel `academy_*` i `course_*`.

Kod zostaje w historii gita, nic z tego nie trzeba kasować przed wyłączeniem aplikacji.

---

## 6. Koszty, dostęp, sekrety

Kwot nie potwierdzono: nie było odczytu faktur Hetznera ani planu organizacji Supabase. Do sprawdzenia przy kroku 6.

| Zasób | Co zrobić przy wygaszeniu |
|---|---|
| Supabase `compass-prod` (`shduiynzemftkqqefscd`, eu-central-1, org `bodalpxvvhrarnadkiar`) | zrzut, potem pauza albo zamrożenie, a po karencji usunięcie projektu |
| Serwer Hetzner CAX21 `compass-prod` (178.104.220.48) z własnym Coolify (`coolify-compass.dynaminds.pl`), host ClamAV i systemd timery Akademii | zatrzymać timery i aplikację, po karencji usunąć serwer (snapshot przed usunięciem) |
| DNS Cloudflare: `compass.dynaminds.pl`, `coolify-compass.dynaminds.pl`, reguła dla `dynaminds-smoke-test` | `compass.` przekierować na NEXUS (reguła Cloudflare), potem usunąć rekordy |
| Repo GitHub `B2B-net-S-A/COMPASS` | wyłączyć workflowy, a na końcu **zarchiwizować**, nie kasować |
| Sentry projekt `compass`, Grafana Loki (Alloy) | wyłączyć alerty, po karencji usunąć projekt |
| Azure: aplikacja Compassa (SSO + Graph `Mail.Send`, przypisania ról RAOP w Exchange; sekret wygasa 2028-05-06) | usunąć przypisania ról Exchange (`Remove-ManagementRoleAssignment`), potem rejestrację aplikacji. Robi admin Azure |
| Sekrety w vaulcie Coolify Compassa | `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `AZURE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `VAPID_PRIVATE_KEY`, `TEAMS_WEBHOOK_URL`, `TC_SYNC_FILE_URL`, `SENTRY_DSN`, `GRAFANA_LOKI_*`, `SNAPSHOT_TOKEN`, `ACADEMY_*`, `NEXUS_CONTRACTORS_API_KEY`, `NEXUS_ROSTER_API_KEY`, `ROSTER_/WORKDAYS_/AVAILABILITY_/SALES_SIGNALS_EXPORT_SECRET`, `SALES_SIGNALS_STATUS_SECRET`. Klucze, które mają też inne aplikacje (Anthropic, Voyage), **unieważnić tylko te wydane dla Compassa** (niepotwierdzone, które to są) |
| Sekrety repo GitHub (13) | `CLAUDE_CODE_OAUTH_TOKEN`, `COOLIFY_APP_UUID`, `COOLIFY_TOKEN`, `COOLIFY_URL`, `CRON_SECRET`, `HETZNER_HOST`, `HETZNER_SSH_KEY`, `HETZNER_USER`, `NEXT_PUBLIC_APP_URL`, `NEXUS_CONTRACTORS_API_KEY`, `ROSTER_EXPORT_SECRET`, `SALES_SIGNALS_EXPORT_SECRET`, `WORKDAYS_EXPORT_SECRET`. Usunąć po wyłączeniu workflowów, a token Coolify unieważnić w panelu |
| Sekrety po drugiej stronie | NEXUS: `COMPASS_LIFECYCLE_*`, `COMPASS_WORKDAYS_*`, `COMPASS_AVAILABILITY_*` oraz konta serwisowe `contractors:read` i `people_roster:read`. ATLAS: `COMPASS_*` z `src/config.py:131-155` |
| Konta użytkowników | 48 kont Auth znika z projektem. Według próby z 18.10 wszyscy poza dwoma konsultantami („zostają w Akademii”) mają kartotekę w NEXUSIE (45). Przed krokiem 5 trzeba sprawdzić, czy tych dwóch potrzebuje konta w NEXUSIE do szkoleń |

---

## 7. Plan krok po kroku

Kolejność: **najpierw konsumenci przestają wołać Compassa, potem Compass przestaje pisać, potem eksport, potem wyłączenie i karencja, na końcu usunięcie.**
Zmiany env NEXUSA idą przez „Coolify set env” i wdrożenie w oknie 18:00–08:00 (w weekend o każdej porze). Compass po zmianie env restartuje się sam.

### Krok 0: odczyty (bez zmian, kilka minut)

| # | Co | Po co |
|---|---|---|
| 0.1 | `Coolify Ops` → `cron-list` dla Compassa | aktualna lista zadań (ostatni odczyt 24.08), m.in. `clock-*`, `payroll-export`, `course-inactivity` |
| 0.2 | NEXUS: `app_settings['hr_modules']` (czy `lifecycle` i `care` są włączone) i `hr_availability_source` | czy roster i dostępność da się odłączyć bez skutków |
| 0.3 | ATLAS: `COMPASS_SIGNALS_MODULE_ENABLED`, `compass_status_push_enabled` | stan wyjściowy dla kroku 1.3 |
| 0.4 | Traefik/Loki Compassa: żądania do `/api/internal/*` z 7 dni | nieznani wywołujący |
| 0.5 | NEXUS produkcja: liczby `leave` / `time` (h) / `payroll` / `cases` z importu vs sekcja 4 | potwierdzić, że archiwum jest w NEXUSIE. Wyjaśnić różnicę 342 h |

### Krok 1: konsumenci przestają wołać Compassa

| # | Co | Kontrola | Ryzyko | Cofnięcie |
|---|---|---|---|---|
| 1.1 | NEXUS: źródło dostępności `local` (K11, `PUT /api/hr/admin/availability-source`), potem `COMPASS_AVAILABILITY_ENABLED=false` → Deploy | przydziały działają, sonda `workforce_availability` zielona | przy złym źródle stają przydziały rekrutacji | `hr_availability_source=compass`, flaga `true` |
| 1.2 | NEXUS: moduł `lifecycle` włączony (§ 4 runbooka), potem `COMPASS_LIFECYCLE_ENABLED=false` | wynik pętli `superseded_by_hr_lifecycle` | konta osób, które odeszły, bez deaktywacji | flaga `true`, moduł wyłączony |
| 1.3 | ATLAS: `COMPASS_SIGNALS_MODULE_ENABLED=false` i `compass_status_push_enabled=false` (D2: ATLAS idzie do wygaszenia, bez przepinania na NEXUS) | sonda ATLASA bez `compass_signals: degraded`, `synthetic.yml` zielony | wyłączenie: handlowcy nie dostają nowych sygnałów z kart rozmów (dane w `compass_signals` zostają). Przepięcie: pierwszy feed z NEXUSA wycofa stare sygnały, jeśli nie dopasuje ich po `compass_id` | `COMPASS_SIGNALS_MODULE_ENABLED=true` |

### Krok 2: Compass przestaje pisać i oddawać dane

| # | Co | Kontrola | Ryzyko | Cofnięcie |
|---|---|---|---|---|
| 2.1 | Monitoring prawny (D3): z Compassa nic nie przenosimy. `cron-legal-monitor-alerts.yml` wyłączamy razem z resztą cronów w kroku 4. Pozycje `legal_monitor_items` zostają tylko w pełnym zrzucie (krok 3) | — | przerwa w alertach prawnych, jeśli moduł w NEXUSIE nie ruszy przed krokiem 4 | włączyć workflow w Compassie |
| 2.2 | Compass env: `HR_MOVED_TO_NEXUS=people,leave,time,payroll,lifecycle,care,cases` | crony `care`/`lifecycle` piszą `skipped`, brak powiadomień `contractor_followup` | opiekunowie przestają dostawać przypomnienia z Compassa (NEXUS ma kanban spraw z kartami opieki) | poprzednia wartość env |
| 2.3 | Compass env: `HR_EXPORTS_OFF=people,leave,time,payroll,lifecycle,care,cases` (po krokach 1.x) | 410 na `/api/internal/*`, konsumenci bez błędów | nieznany wywołujący (krok 0.4) | `HR_EXPORTS_OFF=` |
| 2.4 | Tydzień obserwacji: Sentry Compassa, sondy NEXUSA i ATLASA | brak nowych błędów | — | — |

### Krok 3: eksport archiwum (tylko odczyt bazy)

| # | Co | Kontrola | Ryzyko | Cofnięcie |
|---|---|---|---|---|
| 3.1 | Pełny `pg_dump` + `avatars` + CSV obszarów spoza NEXUSA (sekcja 4), szyfrowanie, SHA-256 | odtworzenie lokalne na `postgres:17`, liczby wierszy = sekcja 4 | plik z danymi kadrowymi poza bazą: tylko zaszyfrowany, katalog `chmod 700`, kasowany po wgraniu | skasować plik |
| 3.2 | Wgranie do SharePointa (dostęp Kadry + Artur), wpis w rejestrze, gdzie leży archiwum | link i SHA w raporcie | — | usunąć plik |

### Krok 4: wyłączenie cronów i workflowów

| # | Co | Kontrola | Cofnięcie |
|---|---|---|---|
| 4.1 | Coolify: `cron-disable-task` dla **każdego** zadania z kroku 0.1 (nigdy `cron-enable`, bo włącza wszystkie naraz) | `cron-list`: wszystkie `enabled=f` | `cron-enable-task` pojedynczo |
| 4.2 | Host: `systemctl disable --now compass-academy-sync.timer compass-academy-materials.timer` (+ clamd/freshclam, jeśli działa) | `systemctl list-timers` | `systemctl enable --now …` |
| 4.3 | GH: `gh workflow disable` dla `cron-*.yml`, `academy-health.yml`, `academy-*.yml` | `gh workflow list` | `gh workflow enable` |

### Krok 5: zamrożenie (odwracalne)

| # | Co | Kontrola | Ryzyko | Cofnięcie |
|---|---|---|---|---|
| 5.1 | Ogłoszenie dla zespołu: „Compass wyłączony, wszystko w NEXUSIE, archiwum u Kadr” | — | — | — |
| 5.2 | Cloudflare: `compass.dynaminds.pl/*` → 302 na NEXUS | wejście na Compass trafia do NEXUSA | link do archiwum HR w Compassie przestaje działać, a archiwum jest w SharePoincie (krok 3) | usunąć regułę |
| 5.3 | Coolify: zatrzymać aplikację compass (Stop, nie Delete) | `/api/health` nie odpowiada | — | Start w panelu |
| 5.4 | Supabase: pauza projektu (jeśli plan na to pozwala, niepotwierdzone) albo zostawienie bez ruchu | — | — | Restore project |
| 5.5 | Karencja **90 dni** (propozycja) | — | — | — |

### Krok 6: usunięcie (nieodwracalne, po karencji i ponownym „tak” Artura)

| # | Co | Warunek |
|---|---|---|
| 6.1 | Unieważnić sekrety z sekcji 6 (vault Compassa, repo GH, druga strona w NEXUSIE i ATLASIE, konta serwisowe NEXUSA) | krok 4 zrobiony |
| 6.2 | Azure: usunąć przypisania ról Exchange (RAOP) i rejestrację aplikacji Compassa | admin Azure |
| 6.3 | Usunąć projekt Supabase `compass-prod` | archiwum z kroku 3 odtworzone i sprawdzone |
| 6.4 | Snapshot serwera Hetzner, potem usunięcie serwera, Coolify i rekordów DNS | — |
| 6.5 | Sentry: usunąć projekt `compass`. Zdjąć Compassa z narzędzi ops (`snapshot-3-apps.sh`, agent `dynaminds-ops`, skille `ops-*` Compassa, reguły w `~/.claude/rules/deployment.md`) | — |
| 6.6 | Zarchiwizować repo `B2B-net-S-A/COMPASS` na GitHubie (tylko do odczytu, kod zostaje jako wzór dla Akademii) | — |

---

## 8. Decyzje Artura

| # | Decyzja | Stan |
|---|---|---|
| D1 | Otwarta rejestracja i czytelne `profiles` (sekcja 1) | **Zrobione 13.11.2026:** w panelu Supabase wyłączono „Allow new users to sign up”, `/auth/v1/settings` zwraca `disable_signup: true`. Polityka `profiles` z `qual=true` zostaje do wyłączenia aplikacji, ale nowego konta nie da się już założyć. Wycofanie: włączyć przełącznik |
| D2 | Sygnały sprzedażowe dla ATLASA | **13.11.2026: ATLAS też jest wygaszany**, bo wszystko jest albo będzie w NEXUSIE. Przepięcia ATLASA na NEXUS nie robimy. Krok 1.3 = wyłączenie modułu sygnałów w ATLASIE w ramach osobnego planu wygaszenia ATLASA |
| D3 | Monitoring prawny (jedyna funkcja bez odpowiednika) | **13.11.2026: z Compassa nic nie przenosimy** (ani 96 pozycji, ani ekranu). Moduł w NEXUSIE powstaje od zera w osobnej sesji. Workflow w Compassie wyłączamy razem z wygaszeniem Compassa |
| D4 | Forma archiwum i okres karencji | otwarte. Rekomendacja: pełny zrzut + CSV w SharePoincie, karencja 90 dni |
| D5 | Rozmowy kontraktorów, wejścia i zejścia, placementy (poza paczką) | otwarte. Rekomendacja: tylko w archiwum, bez importu do NEXUSA |

## 9. Niepotwierdzone (gdzie szukano)

- Dokładna wartość env `HR_MOVED_TO_NEXUS` i `HR_EXPORTS_OFF`: vault Coolify nieczytany, wniosek z heartbeatów i sondy ATLASA.
- Aktualna lista zadań Coolify: ostatni `cron-list` z 24.08.
- Stan modułów `lifecycle`/`care` i źródła dostępności w NEXUSIE: publiczny health tego nie rozróżnia.
- Import `payroll`, `cases`, `lifecycle`, `care` na produkcji NEXUSA: znana tylko próba generalna z 18.10.
- Kto wywołuje `course-inactivity` o 08:00 i dodatkowy bieg `timesheet-reminder` 05.11 08:00 UTC.
- Koszty miesięczne (Hetzner, Supabase): nie było odczytu faktur.
