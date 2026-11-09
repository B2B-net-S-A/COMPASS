-- Cofnięcie B4.3. Usuwa zapisane pozycje oglądania; ukończone lekcje zostają w course_enrollments.
DROP FUNCTION IF EXISTS public.academy_save_video_progress(uuid, uuid, uuid, numeric, numeric, jsonb);
DROP FUNCTION IF EXISTS academy_private.merge_video_ranges(jsonb, jsonb);
DROP FUNCTION IF EXISTS academy_private.video_ranges_seconds(jsonb);
DROP TABLE IF EXISTS public.academy_video_progress;
