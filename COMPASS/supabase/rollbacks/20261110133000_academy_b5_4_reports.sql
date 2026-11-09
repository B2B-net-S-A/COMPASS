-- Cofnięcie 20261110133000_academy_b5_4_reports.sql. Bez utraty danych.
BEGIN;
DROP FUNCTION public.academy_manager_team_report();
DROP FUNCTION public.academy_competence_report();
DROP FUNCTION academy_private.competence_rows();
DROP FUNCTION academy_private.report_excludes(uuid,public.courses);
NOTIFY pgrst,'reload schema';
COMMIT;
