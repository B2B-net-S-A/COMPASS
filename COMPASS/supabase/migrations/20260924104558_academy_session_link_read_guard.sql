-- The run-list and calendar RPCs decide when a learner may receive a Teams
-- join link. A row policy alone cannot hide external_join_url on cancelled
-- sessions, so keep raw Data API reads to non-secret lookup columns.
begin;
revoke select on public.course_sessions from authenticated;
grant select (id, run_id, status, meeting_mode) on public.course_sessions to authenticated;
commit;
