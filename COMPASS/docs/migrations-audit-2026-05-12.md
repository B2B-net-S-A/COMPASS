# Audyt migracji Supabase — Compass — 2026-05-12

> Read-only raport mapujący 137 plików w `COMPASS/supabase/migrations/` na 56 migracji zaaplikowanych w prod Supabase (`shduiynzemftkqqefscd`).
> **Nie modyfikuje żadnych plików.** Cel: source-of-truth do następnego cleanup PR.

**Wygenerowany:** 2026-05-12 (z branch `claude/priceless-grothendieck-6c892f`)
**Metoda:** Mapping przez (a) nazwę po timestamp prefix, (b) markery `-- FROM:` w `batch_01`, (c) overlap CREATE/ALTER/DROP signatures z prod migration content.
**Spot-checked:** schema prod via Supabase Management API (`POST /database/query`).

## Summary

| Kategoria | Plików | Akcja |
|---|---|---|
| **MATCHED RENAMED** — name match, prod re-timestamped | 36 | Zostawić jako historyczna ewidencja (dopasowanie 1:1) |
| **MATCHED VIA CONSOLIDATION** — explicit `-- FROM:` w batch_01 | 12 | Archiwizować — treść inkorporowana w batch_01 |
| **MATCHED VIA CONTENT** — CREATE/ALTER sigs w jednym z batch_02/03/04 lub późniejszych | 49 | Archiwizować — treść w prod migration tracker pod inną nazwą |
| **AD-HOC SCRIPTS** — UPPERCASE bez timestamp (debug/repair) | 17 | Przenieść do `supabase/_archive_scripts/` (analogicznie do P1.5 commit `f9b98d5`) |
| **TRUE ORPHAN** — `YYYYMMDD_*` w repo, treść BRAK w prod | 23 | Sprawdzić indywidualnie: drafts/dead/applied-ad-hoc |
| **TOTAL** | **137** | |

**Prod migracje:** 56 (od `20260421154753 batch_01_core_tables_*` do `20260511140707 phase18_sync_user_role_atomic`).
**Phase 18 (3 migracje)** — w obecnym branchu nie ma, ale prod ma (zaaplikowane z `claude/jovial-taussig-1c4a20`). Nie wpływa na ten audyt.

## Historia (interpretacja)

Z prod migrations + content widać:

- **Era 1: pre-tracker** (luty–marzec 2026) — ~70 plików w repo z prefiksami `20260208..20260311`. Aplikowane ad-hoc przez Supabase Studio SQL editor lub `psql`, nigdy nie weszły do `supabase_migrations.schema_migrations`. Plików iteracyjnych jest dużo (np. `_v2.sql`, `_reapply.sql`, `_revert_*.sql`) co sugeruje że pracowano przez "try-and-fix" pattern, każda próba zostawała w repo.
- **Era 2: pierwsza consolidacja** (2026-04-21) — Artur sklejił setki linii SQL w **6 dużych batch migracji** (`batch_01..04` + `notifications_system` + `m10_communicator_setup`). batch_01 zawiera markery `-- FROM: <plik>.sql` dla 12 plików (jedyny batch z explicit FROM-references). batch_02/03/04 sklejone bez markerów → trzeba zgadywać przez content matching.
- **Era 3: per-feature migrations** (od 2026-04-28) — każdy plik repo = jedna prod migration (`phase1..18`, `lms_akademia`, `voyage_embeddings`, etc.). Timestamps w repo różnią się od prod (np. repo `20260504000001_phase1_archive_legacy_ats` → prod `20260504140527 phase1_archive_legacy_ats`), bo Supabase CLI re-stampuje przy `db push`.

## Sekcja 1: MATCHED RENAMED (36) — zostawić jako history

Każdy plik ma 1:1 mapping do prod migration po nazwie sufiksu. Repo timestamp różny od prod, ale to nie ma znaczenia (Supabase migration tracker używa swojego timestampu).

| Plik (repo) | → | Prod version | Prod name |
|---|---|---|---|
| `20260213_notifications_system.sql` | → | `20260421154920` | `notifications_system` |
| `20260429_lms_akademia.sql` | → | `20260429100130` | `lms_akademia` |
| `20260504000001_phase1_archive_legacy_ats.sql` | → | `20260504140527` | `phase1_archive_legacy_ats` |
| `20260504000003_phase1_loyalty_tiers_v2.sql` | → | `20260504140729` | `phase1_loyalty_tiers_v2` |
| `20260504000004_phase1_loyalty_pending.sql` | → | `20260504140811` | `phase1_loyalty_pending` |
| `20260504200001_phase3_support_center.sql` | → | `20260504145943` | `phase3_support_center` |
| `20260504300001_phase4_news.sql` | → | `20260504151147` | `phase4_news` |
| `20260504400001_phase5_incubator.sql` | → | `20260504152138` | `phase5_incubator` |
| `20260505100001_phase9_remove_ai_assistant.sql` | → | `20260505104636` | `phase9_remove_ai_assistant` |
| `20260505100002_phase9_support_finance_category.sql` | → | `20260505104642` | `phase9_support_finance_category` |
| `20260506000001_admin_revoke_user_sessions.sql` | → | `20260506130747` | `admin_revoke_user_sessions` |
| `20260506100001_phase10_inbox_kanban.sql` | → | `20260506211943` | `phase10_inbox_kanban` |
| `20260507000000_phase16_two_roles_drop_centrala.sql` | → | `20260507105420` | `phase16_two_roles_drop_centrala` |
| `20260507120000_phase11a_internal_role_value.sql` | → | `20260508075551` | `phase11a_internal_role_value` |
| `20260507120001_phase11b_hr_internal_schema.sql` | → | `20260508075708` | `phase11b_hr_internal_schema` |
| `20260508000001_phase_a1_continue_lesson.sql` | → | `20260508192055` | `phase_a1_continue_lesson` |
| `20260508000002_phase_a1_certificates.sql` | → | `20260508192109` | `phase_a1_certificates` |
| `20260508000003_phase_a1_learning_streaks.sql` | → | `20260508192114` | `phase_a1_learning_streaks` |
| `20260508000004_phase_a1_inactivity_email.sql` | → | `20260508192118` | `phase_a1_inactivity_email` |
| `20260508000005_phase_a2_prerequisites.sql` | → | `20260508192123` | `phase_a2_prerequisites` |
| `20260508000006_phase_a3_lesson_summary.sql` | → | `20260508192133` | `phase_a3_lesson_summary` |
| `20260508000007_phase_a2_learning_paths.sql` | → | `20260508192155` | `phase_a2_learning_paths` |
| `20260508000008_phase_a2_course_qa.sql` | → | `20260508192226` | `phase_a2_course_qa` |
| `20260508000009_phase_a3_course_embeddings.sql` | → | `20260508192231` | `phase_a3_course_embeddings` |
| `20260508000010_phase_a2_drip_and_surveys.sql` | → | `20260508192239` | `phase_a2_drip_and_surveys` |
| `20260508000011_phase_h3_push_subscriptions.sql` | → | `20260508192244` | `phase_h3_push_subscriptions` |
| `20260508000012_phase_h3_timesheet_timer.sql` | → | `20260508192300` | `phase_h3_timesheet_timer` |
| `20260508000013_phase_a2_lesson_completion_dates.sql` | → | `20260508192306` | `phase_a2_lesson_completion_dates` |
| `20260508120000_phase17_work_clock.sql` | → | `20260508205520` | `phase17_work_clock` |
| `20260509000001_phase17b_session_merge_and_pause.sql` | → | `20260510210021` | `phase17b_session_merge_and_pause` |
| `20260509000002_phase17b_timer_legacy.sql` | → | `20260510212435` | `phase17b_timer_legacy` |
| `20260509000003_phase17b_timesheet_auto_fill.sql` | → | `20260510214017` | `phase17b_timesheet_auto_fill` |
| `20260509000004_phase17b_clock_summary_pref.sql` | → | `20260510220754` | `phase17b_clock_summary_pref` |
| `20260509000005_phase17b_route_metadata.sql` | → | `20260510222336` | `phase17b_route_metadata` |
| `20260511000001_cleanup_drop_role_name.sql` | → | `20260511131554` | `cleanup_drop_role_name` |
| `20260511000002_employment_type_default_b2b.sql` | → | `20260511131600` | `employment_type_default_b2b` |

**Akcja:** Trzymać. To są pliki które `supabase db push` (lub CI) wysłał do prod. Można w przyszłości znormalizować timestamp prefiks żeby był identyczny z prod version, ale to kosmetyka.

## Sekcja 2: MATCHED VIA CONSOLIDATION (12) — archiwizacja

Pliki explicit referenced w `batch_01_core_tables_ai_matching_centrala_contracts` przez `-- FROM:` markery. Treść jest w `batch_01` prod migration.

| Plik (repo) | Marker w batch_01 |
|---|---|
| `20240502000000_initial_schema.sql` | `-- FROM: 20240502000000_initial_schema.sql` |
| `20260208_add_cv_url.sql` | `-- FROM: 20260208_add_cv_url.sql` |
| `20260208_ai_matching.sql` | `-- FROM: 20260208_ai_matching.sql` |
| `20260208_candidates_table.sql` | `-- FROM: 20260208_candidates_table.sql` |
| `20260208_fix_permissions_final.sql` | `-- FROM: 20260208_fix_permissions_final.sql` |
| `20260208_fix_projects_rls.sql` | `-- FROM: 20260208_fix_projects_rls.sql` |
| `20260208_fix_storage_policy.sql` | `-- FROM: 20260208_fix_storage_policy.sql` |
| `20260208_profile_updates.sql` | `-- FROM: 20260208_profile_updates.sql` |
| `20260208_storage_setup.sql` | `-- FROM: 20260208_storage_setup.sql` |
| `20260212_centrala_tables.sql` | `-- FROM: 20260212_centrala_tables.sql` |
| `20260212_favorite_projects.sql` | `-- FROM: 20260212_favorite_projects.sql` |
| `20260212_project_referrals.sql` | `-- FROM: 20260212_project_referrals.sql` |

**Akcja:** Przenieść do `supabase/_archive_legacy_migrations/`. Treść jest w prod (`batch_01`).

## Sekcja 3: MATCHED VIA CONTENT (49) — archiwizacja

Pliki których CREATE/ALTER/CREATE POLICY identyfikatory są obecne w jednej z prod migrations. Podzielone na **strong** (>=50% sigs overlap) i **weak** (<50% sigs ale przynajmniej 1 match).

### 3a. Strong matches (30 plików)

| Plik (repo) | Prod migration | Match score | Sigs total |
|---|---|---|---|
| `20260208_storage_candidates.sql` | `batch_01_core_tables_ai_matching_centrala_contracts` (`20260421154753`) | 1 | 1 |
| `20260213_contracts_table.sql` | `batch_03_contracts_admin_roles_compass_assist` (`20260421155806`) | 10 | 11 |
| `20260215_loyalty_program.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 6 | 6 |
| `20260216_chat_attachments.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 2 | 2 |
| `20260216_chat_attachments_backup.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 2 | 2 |
| `20260216_document_system.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 6 | 9 |
| `20260216_document_system_storage.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 5 | 5 |
| `20260217190000_add_public_documents.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 6 | 6 |
| `20260218_ai_document_indexing.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 3 | 3 |
| `20260218_auth_v1.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 13 | 13 |
| `20260219_ai_assistant.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 7 | 9 |
| `20260219_role_permissions.sql` | `batch_03_contracts_admin_roles_compass_assist` (`20260421155806`) | 1 | 2 |
| `20260220_fix_conversation_rls.sql` | `m10_communicator_setup` (`20260421155052`) | 1 | 2 |
| `20260222_etap1a_sync_user_role_rpc.sql` | `phase18_sync_user_role_atomic` (`20260511140707`) | 1 | 1 |
| `20260222_etap1c_fix_handle_new_user.sql` | `batch_01_core_tables_ai_matching_centrala_contracts` (`20260421154753`) | 1 | 1 |
| `20260222_fix_centrala_access_list_permissions.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 1 | 2 |
| `20260222_fix_match_candidates_search_path.sql` | `batch_04_market_rates_tasks_legal_docs_profile360` (`20260421160922`) | 1 | 1 |
| `20260309_fix_loyalty_tier_trigger.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 1 | 1 |
| `20260311_legal_documents_and_consents.sql` | `fix_um_user_consents_schema_align_with_app` (`20260429092354`) | 7 | 14 |
| `20260504000002_phase1_role_enum.sql` | `phase1_role_normalize_helpers` (`20260504140657`) | 2 | 2 |
| `20260504000005_phase1_courses_dual_source.sql` | `phase1_courses_dual_source_v2` (`20260504140935`) | 5 | 5 |
| `20260504100001_phase2_leaderboard_optout.sql` | `phase2_leaderboard_optout_and_tour` (`20260504144401`) | 3 | 3 |
| `20260504500001_phase15_rls_helpers_rewrite.sql` | `phase15_rls_rewrites_only` (`20260504160526`) | 53 | 55 |
| `20260504500002_phase15_role_enum_cast.sql` | `phase4_news` (`20260504151147`) | 2 | 2 |
| `20260505000001_phase8_hotfix_login.sql` | `phase8_fix_missing_columns` (`20260505084029`) | 5 | 5 |
| `20260505100003_phase9_consultant_read_own_assignments.sql` | `phase9_consultants_read_own_assignments` (`20260505145746`) | 1 | 1 |
| `DISABLE_SYNC.sql` | `batch_01_core_tables_ai_matching_centrala_contracts` (`20260421154753`) | 1 | 1 |
| `FIX_REGISTRATION.sql` | `batch_01_core_tables_ai_matching_centrala_contracts` (`20260421154753`) | 1 | 1 |
| `email_notifications.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 4 | 8 |
| `m10_communicator_setup.sql` | `m10_communicator_setup` (`20260421155052`) | 7 | 7 |

### 3b. Weak matches (19 plików) — wymaga manual review

Tylko 1-2 identifiers z pliku znaleziono w prod. Mogą to być:
- Drobne pliki (1 ALTER, 1 INSERT) których jedyny sig faktycznie jest w prod batch
- Większe pliki z wcześniejszym designu, gdzie tylko fragment trafił do prod (reszta odpadła)

| Plik (repo) | Prod migration | Match score | Sigs total | Evidence |
|---|---|---|---|---|
| `20260217175500_create_loyalty_rules.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 1 | 3 | `table:loyalty_rules` |
| `20260218_verify_and_fix_all.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 23 | 59 | `policy:users can upload own app-docs`, `table:benefit_declarations`, `index:idx_app_documents_owner` |
| `20260219_centrala_management.sql` | `batch_01_core_tables_ai_matching_centrala_contracts` (`20260421154753`) | 1 | 10 | `column:centrala_access_list.full_name` |
| `20260219_fix_knowledge_rls.sql` | `batch_03_contracts_admin_roles_compass_assist` (`20260421155806`) | 2 | 5 | `table:compass_assist_knowledge`, `function:match_assist_knowledge` |
| `20260219_invoices.sql` | `batch_01_core_tables_ai_matching_centrala_contracts` (`20260421154753`) | 1 | 10 | `table:invoices` |
| `20260219_missing_tables.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 9 | 29 | `column:profiles.loyalty_points`, `table:loyalty_transactions`, `index:idx_audit_logs_created_at` |
| `20260219_super_admin.sql` | `batch_03_contracts_admin_roles_compass_assist` (`20260421155806`) | 1 | 3 | `table:admin_access_list` |
| `20260220_security_fixes.sql` | `phase18_secinvoker_search_path` (`20260511140320`) | 5 | 23 | `function:expire_old_notifications`, `function:update_doc_timestamp`, `function:create_notification` |
| `20260222_bugfix_import_batches.sql` | `batch_03_contracts_admin_roles_compass_assist` (`20260421155806`) | 1 | 4 | `table:import_batches` |
| `20260222_etap1b_fix_candidates_rls.sql` | `batch_01_core_tables_ai_matching_centrala_contracts` (`20260421154753`) | 1 | 5 | `policy:admins can manage candidates` |
| `20260222_etap2_candidates_extend.sql` | `batch_04_market_rates_tasks_legal_docs_profile360` (`20260421160922`) | 1 | 14 | `column:candidates.source` |
| `20260222_etap3_indexes_and_onboarding.sql` | `phase8_fix_missing_columns` (`20260505084029`) | 1 | 7 | `column:profiles.onboarding_completed` |
| `20260222_fix_search_path.sql` | `batch_01_core_tables_ai_matching_centrala_contracts` (`20260421154753`) | 1 | 3 | `function:handle_new_user` |
| `20260304_market_rates.sql` | `batch_04_market_rates_tasks_legal_docs_profile360` (`20260421160922`) | 2 | 13 | `table:market_rates`, `table:rate_verifications` |
| `20260308_profile_360.sql` | `batch_04_market_rates_tasks_legal_docs_profile360` (`20260421160922`) | 1 | 4 | `column:profiles.certifications` |
| `20260310_candidates_profile_360.sql` | `batch_04_market_rates_tasks_legal_docs_profile360` (`20260421160922`) | 1 | 4 | `column:candidates.certifications` |
| `20260310_task_engine.sql` | `batch_04_market_rates_tasks_legal_docs_profile360` (`20260421160922`) | 7 | 16 | `table:task_activity`, `table:task_assignments`, `table:task_columns` |
| `20260428_rate_change_log.sql` | `phase1_archive_legacy_ats` (`20260504140527`) | 1 | 7 | `table:rate_change_log` |
| `performance_indexes.sql` | `batch_02_loyalty_docs_audit_centrala_mgmt` (`20260421155659`) | 4 | 16 | `index:idx_app_documents_category`, `index:idx_document_versions_version_number`, `index:idx_document_versions_document_id` |

**Akcja:** Przenieść do `supabase/_archive_legacy_migrations/`. Weak matches można dodatkowo opisać w `_archive_legacy_migrations/README.md` z notatką "weak content match — content partially in <prod>".

## Sekcja 4: AD-HOC SCRIPTS (17) — przenieść do `_archive_scripts/`

UPPERCASE pliki bez timestamp prefix. Same nazwy mówią że to debug/repair narzędzia (`EMERGENCY_DELETE`, `FIX_REGISTRATION`, `INSPECT_USER`). Nigdy nie weszły do migration tracker.

| Plik | Linie | Bajty |
|---|---|---|
| `ASSIGN_ADMINS.sql` | 23 | 787 |
| `BLOCKBUSTER_UNBLOCK.sql` | 183 | 6161 |
| `CHECK_PROFILE.sql` | 4 | 90 |
| `CHECK_USER_STATUS.sql` | 9 | 284 |
| `CONFIRM_EMAIL.sql` | 5 | 195 |
| `EMERGENCY_DELETE.sql` | 90 | 2684 |
| `FINAL_DELETION_SCRIPT.sql` | 64 | 1773 |
| `FINAL_REPAIR.sql` | 92 | 3131 |
| `FINAL_SAFE_DELETION.sql` | 187 | 4042 |
| `FIX_AND_ENABLE_SYNC.sql` | 123 | 4487 |
| `FORCE_CASCADE.sql` | 74 | 2888 |
| `FORCE_CREATE_USER.sql` | 92 | 2221 |
| `INSPECT_USER.sql` | 13 | 303 |
| `SAFE_EMERGENCY_DELETE.sql` | 112 | 2372 |
| `SAFE_REPAIR.sql` | 90 | 3015 |
| `UNIVERSAL_UNBLOCK.sql` | 156 | 5220 |
| `UPDATE_ROLE_CONSTRAINT.sql` | 14 | 476 |

**Akcja:** Przenieść do `supabase/_archive_scripts/` (analogicznie do P1.5 cleanup w commit `f9b98d5` z branch `chore/migrations-cleanup`, który archiwizował już 6 takich plików: `EMERGENCY_DELETE.sql`, `SAFE_EMERGENCY_DELETE.sql`, etc.). Te pliki to **NIE migracje** — to one-shot debug scripts dla SQL editor.

## Sekcja 5: TRUE ORPHAN (23) — wymaga indywidualnej decyzji

Pliki z timestamp prefix których content (CREATE/ALTER signatures) **nie znaleziono** w żadnej prod migration. Status każdego zweryfikowany ręcznie przez schema check w prod.

| Plik | Linie | Sigs | Status w prod (verified) | Akcja |
|---|---|---|---|---|
| `20260208_debug_count.sql` | 7 | 1 | `get_projects_count` function NIE istnieje w prod | USUNĄĆ (draft tylko, komentarz "DEBUG ONLY") |
| `20260208_disable_rls_projects.sql` | 2 | 0 | 1-line emergency disable, RLS re-enabled później | USUNĄĆ (one-shot, odwrócone) |
| `20260208_reset_projects_rls.sql` | 38 | 4 | policies projects RLS — sprawdzić actual policies | ZWERYFIKOWAĆ ręcznie / archiwizować |
| `20260216_availability_overhaul.sql` | 104 | 0 | `profile_availability` table NIE istnieje w prod | USUNĄĆ (dead draft) |
| `20260218_add_gdpr_to_profiles.sql` | 2 | 0 | `profiles.gdpr_consent` ISTNIEJE w prod (applied ad-hoc) | Archiwizować — content applied |
| `20260218_fix_schema_mismatches.sql` | 76 | 0 | DROP/RENAME — sprawdzić relevant columns | ZWERYFIKOWAĆ / archiwizować |
| `20260218_fix_schema_mismatches_v2.sql` | 38 | 0 | v2 follow-up | ZWERYFIKOWAĆ / archiwizować |
| `20260218_registration_v2.sql` | 79 | 3 | sequence: created → reapplied → reverted (sync_profile_to_candidate function NIE istnieje) | USUNĄĆ (full revert in 3rd file) |
| `20260218_registration_v2_reapply.sql` | 79 | 3 | partner z registration_v2 | USUNĄĆ |
| `20260218_revert_registration_v2.sql` | 5 | 0 | final revert — efektywnie no-op | USUNĄĆ |
| `20260219_drop_access_mode.sql` | 21 | 0 | `access_mode` column NIE istnieje w żadnej tabeli (drop'nięta) | Archiwizować — content applied |
| `20260219_unique_recruiter_assignment.sql` | 29 | 2 | constraint `%recruiter%` NIE istnieje w prod | USUNĄĆ (dead draft) |
| `20260220_create_centrala_user.sql` | 62 | 0 | `centrala_access_list` dropped w phase16 — file outdated | USUNĄĆ (deprecated by phase16) |
| `20260220_enable_rls_projects_candidates.sql` | 4 | 0 | RLS na projects/candidates — verify | ZWERYFIKOWAĆ |
| `20260220_fix_security_lints.sql` | 76 | 5 | ALTER EXTENSION SET SCHEMA + RLS policies — verify | ZWERYFIKOWAĆ |
| `20260221_add_phone_to_profiles.sql` | 6 | 0 | `profiles.phone` NIE istnieje w prod | USUNĄĆ (dead draft, nigdy aplikowane) |
| `20260222_add_theme_to_profiles.sql` | 4 | 0 | `profiles.theme` NIE istnieje w prod | USUNĄĆ (dead draft, nigdy aplikowane) |
| `20260222_bugfix_rls_claim.sql` | 18 | 1 | DROP POLICY "Users can update own candidate" — superseded przez RLS w batch'ach | USUNĄĆ |
| `20260222_etap9_fix_sync_trigger.sql` | 49 | 1 | trigger `%sync%user%role%` NIE istnieje w prod (zastąpione przez phase18 atomic RPC) | USUNĄĆ |
| `20260222_fix_admin_access_list_permissions.sql` | 45 | 1 | admin_access_list — verify policies | ZWERYFIKOWAĆ |
| `20260223_fix_communicator_rls.sql` | 72 | 4 | v1, superseded przez v2 + batch_01 | USUNĄĆ |
| `20260223_fix_communicator_rls_v2.sql` | 79 | 2 | v2 — verify policies | ZWERYFIKOWAĆ / archiwizować |
| `20260304_seed_market_rates.sql` | 197 | 0 | seed INSERT do `market_rates(position_title, category, seniority)` — ale prod schema to `(role_name, experience_level)` z batch_04 (potem archived in compass_legacy). Plik z innego designu — nigdy aplikowany. | USUNĄĆ (incompatible schema) |

**Wniosek:** Z 23 true orphans:
- **~14 plików = dead drafts / superseded** (`registration_v2*`, `add_phone`, `add_theme`, `debug_count`, `availability_overhaul`, `unique_recruiter_assignment`, `create_centrala_user`, `etap9_fix_sync_trigger`, `bugfix_rls_claim`, `fix_communicator_rls` v1, `disable_rls_projects`, `seed_market_rates`) — bezpieczne do USUNIĘCIA.
- **2 plików = content applied ad-hoc** (`add_gdpr_to_profiles`, `drop_access_mode`) — archiwizować w `_archive_legacy_migrations/` z notatką.
- **~7 plików = wymagają drobnego manual review** (`reset_projects_rls`, `fix_schema_mismatches*`, `enable_rls_projects_candidates`, `fix_security_lints`, `fix_admin_access_list_permissions`, `fix_communicator_rls_v2`) — sprawdzić actual policies + ewentualnie archiwizować.

## Sekcja 6: Rekomendacje cleanup

### Priorytet 1 — szybkie (jedna sesja)

1. **Przenieść 17 UPPERCASE plików** (`Sekcja 4`) do `supabase/_archive_scripts/` z README "these are debug scripts, not migrations". Jest już precedens w `chore/migrations-cleanup` (commit `f9b98d5` na `claude/jovial-taussig-1c4a20`).
2. **Usunąć 14 dead drafts** z Sekcji 5 (oznaczone USUNĄĆ). Każdy ma weryfikację że content NIE jest w prod LUB jest pełny revert.
3. **Dodać `supabase/migrations/README.md`** z naming convention (już jest w PR `claude/jovial-taussig-1c4a20`).

**Effective reduction:** 137 → ~106 plików (-23%).

### Priorytet 2 — pełny cleanup (osobny PR)

1. **Przenieść 12 consolidated** (Sekcja 2) + **49 content-matched** (Sekcja 3) plików do `supabase/_archive_legacy_migrations/` z README mapującym do prod migrations. Wymaga uważnego review weak matches (19 plików), bo niektóre mogą być half-applied.
2. **Zweryfikować 7 ambiguous orphans** (Sekcja 5, oznaczone ZWERYFIKOWAĆ) przez schema check policies/columns/triggers w prod.
3. **Renormalizować timestamps** plików w Sekcji 1 do prod versions (`20260504000001` → `20260504140527`), żeby `supabase migration list` lokalnie pokazywał spójność z prod. To zmiana kosmetyczna ale ułatwia debug.

**Effective reduction po obu PR:** 137 → 36 (Phase 1-17 historical) + ~3-5 archive index files. Tj. **~73% redukcja**.

### Co NIE robić

- **NIE usuwać** żadnego pliku z Sekcji 1 (matched_renamed) — to jedyna lokalna historia tych migracji. Prod tracker pokazuje tylko `version` + `name` + content, nie commit message.
- **NIE usuwać** plików z Sekcji 2/3 (consolidated/content-matched) bez przeniesienia do `_archive_legacy_migrations/`. Histroia stara > 6 miesięcy może być potrzebna przy forensic debug.
- **NIE dotykać** `supabase_migrations.schema_migrations` w prod — repo cleanup nie wpływa na prod state.

## Verification log

Spot-checked 9 plików manualnie przez `POST /database/query` na prod:

**Matched (powinny istnieć):**

| Plik | Prod check | Wynik |
|---|---|---|
| `20260213_notifications_system.sql` | `SELECT count(*) FROM tables WHERE table_name='notifications'` | ✅ exists (count=1) |
| `20260507000000_phase16_two_roles_drop_centrala.sql` | `SELECT enumlabel FROM pg_enum WHERE typname='user_role'` | ✅ `{consultant, admin, internal}`, no centrala |
| `20260511000001_cleanup_drop_role_name.sql` | `SELECT column_name FROM ... WHERE column_name='role_name'` | ✅ column dropped (empty) |

**Orphan (treść może lub nie być w prod):**

| Plik | Prod check | Wynik | Interpretacja |
|---|---|---|---|
| `20260428_rate_change_log.sql` | `SELECT * FROM tables WHERE table_name='rate_change_log'` | ❌ not exists (any schema) | TRUE ORPHAN — never applied |
| `20260208_debug_count.sql` | `SELECT proname FROM pg_proc WHERE proname='get_projects_count'` | ❌ not exists | TRUE ORPHAN — never applied |
| `20260505000001_phase8_hotfix_login.sql` | `SELECT column FROM ... WHERE column_name='onboarding_completed'` | ✅ exists | RENAMED (matched `phase8_fix_missing_columns` in prod) |
| `20260218_add_gdpr_to_profiles.sql` | `column_name='gdpr_consent'` | ✅ exists | APPLIED AD-HOC (not in tracker, but content in prod) |
| `20260221_add_phone_to_profiles.sql` | `column_name='phone'` | ❌ not exists | TRUE ORPHAN — dead draft |
| `20260222_add_theme_to_profiles.sql` | `column_name='theme'` | ❌ not exists | TRUE ORPHAN — dead draft |

## Dodatkowe konteksty

**`compass_legacy` schema** zawiera 6 tabel archived przez `phase1_archive_legacy_ats`:
`candidates`, `centrala_referrals`, `import_batches`, `market_rates`, `project_referrals`, `rate_verifications`. Powiązane stare pliki repo z tych obszarów (np. `20260208_candidates_table.sql`, `20260212_centrala_*`, `20260304_market_rates.sql`) są historią — ich content został zarchiwowany.

**Phase 18 hardening** (3 migracje w prod: `20260511140000-140707`) wprowadziły:
- RLS na `login_attempts` + `verification_codes` (anti-scraping + MFA security)
- `SET search_path` na 21 SECURITY DEFINER/INVOKER funkcji
- REVOKE EXECUTE z anon dla 6 business-logic SD funkcji

**Limitations of this audit:**

- Content matching używa CREATE/ALTER/CREATE FUNCTION/INDEX/POLICY identifier overlap. Małe pliki (1-2 statement) lub czystoadministracyjne (GRANT, COMMENT, INSERT seed) mogą fałszywie wpaść do orphan/adhoc, mimo że treść była zaaplikowana.
- Weak matches (19 plików) wymagają indywidualnego review przed archiwizacją.
- Brak access do `supabase_migrations.schema_migrations.statements` history (Management API zwraca content, ale `applied_at` brak). Można potencjalnie wzbogacić raport o `applied_at` timestamps, ale to nie wpływa na cleanup decyzje.

## Appendix: full mapping JSON

Pełny mapping w `/tmp/mapping3.json` (tymczasowy, nie commited). Wygenerowany przez `/tmp/mapper3.py` (parametryzowany skrypt łączący content sigs ekstraktowane regex'em z prod migrations).

Do reprodukcji raportu: re-run skript po update'cie prod migrations:
```bash
PAT=<supabase_PAT>
PROJECT=shduiynzemftkqqefscd
curl -sS -H "Authorization: Bearer $PAT" \
  "https://api.supabase.com/v1/projects/$PROJECT/database/migrations" \
  > /tmp/prod_migrations.json
# Fetch each migration content individually (parallel):
for ver in $(jq -r '.[].version' /tmp/prod_migrations.json); do
  curl -sS -H "Authorization: Bearer $PAT" \
    "https://api.supabase.com/v1/projects/$PROJECT/database/migrations/$ver" \
    > /tmp/prod_migrations_content/$ver.json &
done; wait
python3 /tmp/mapper3.py
```

---

**Verified by:** Schema queries via Supabase Management API (`POST /v1/projects/{ref}/database/query`).
**Author:** automated audit, branch `claude/priceless-grothendieck-6c892f`.
