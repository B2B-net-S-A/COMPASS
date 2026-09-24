-- A late replay of academy_material_revoke_raw_read removes the caption grant
-- introduced by academy_run_caption_association. The invoker catalog needs
-- this column to be readable even when callers select only the catalog id.
grant select (caption_for_asset_id) on public.course_materials to authenticated;
