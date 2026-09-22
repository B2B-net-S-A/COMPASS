WITH scope AS (
 SELECT c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relowner
 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
 AND c.relname=ANY(ARRAY['courses','course_lessons','course_quiz_questions','course_quiz_options','course_enrollments','course_quiz_attempts','course_ratings','course_questions','course_answers','course_survey_responses','learning_paths','learning_path_courses','learning_path_enrollments','profiles','loyalty_rules','loyalty_transactions','notifications','audit_logs'])
), function_scope AS (
 SELECT p.* FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND
 (p.oid IN (SELECT tgfoid FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM scope))
 OR p.proname=ANY(ARRAY['is_admin','award_course_points','award_first_publish_bonus','get_quiz_for_attempt','submit_quiz_attempt','is_internal_or_admin','create_notification']))
)
SELECT jsonb_build_object(
 'serverVersion',current_setting('server_version'),
 'tables',(SELECT jsonb_agg(jsonb_build_object(
  'name',s.relname,'rowSecurity',s.relrowsecurity,'forceRowSecurity',s.relforcerowsecurity,'owner',pg_get_userbyid(s.relowner),
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=s.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',co.conname,'type',co.contype,'definition',pg_get_constraintdef(co.oid,true),'validated',co.convalidated) ORDER BY co.conname) FROM pg_constraint co WHERE co.conrelid=s.oid),'[]'::jsonb),
  'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',ic.relname,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY ic.relname) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=s.oid AND NOT EXISTS(SELECT 1 FROM pg_constraint co WHERE co.conindid=i.indexrelid)),'[]'::jsonb),
  'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=s.oid AND NOT t.tgisinternal),'[]'::jsonb),
  'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.policyname,'permissive',p.permissive,'roles',p.roles,'command',p.cmd,'using',p.qual,'check',p.with_check) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=s.relname),'[]'::jsonb),
  'grants',COALESCE((SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type) FROM aclexplode(COALESCE((SELECT relacl FROM pg_class WHERE oid=s.oid),acldefault('r',s.relowner))) a),'[]'::jsonb),
  'columnGrants',COALESCE((SELECT jsonb_agg(jsonb_build_object('column',att.attname,'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY att.attnum,a.grantee,a.privilege_type) FROM pg_attribute att CROSS JOIN LATERAL aclexplode(att.attacl) a WHERE att.attrelid=s.oid AND att.attnum>0 AND NOT att.attisdropped),'[]'::jsonb)
 ) ORDER BY s.relname) FROM scope s),
 'enums',(SELECT jsonb_agg(jsonb_build_object('name',t.typname,'labels',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid)) ORDER BY t.typname) FROM pg_type t WHERE t.typtype='e' AND t.oid IN (SELECT a.atttypid FROM pg_attribute a WHERE a.attrelid IN(SELECT oid FROM scope))),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'grants',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type) FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY p.oid::regprocedure::text) FROM function_scope p),
 'incomingForeignKeys',(SELECT COALESCE(jsonb_agg(jsonb_build_object('table',co.conrelid::regclass::text,'name',co.conname,'definition',pg_get_constraintdef(co.oid,true)) ORDER BY co.conrelid::regclass::text,co.conname),'[]'::jsonb) FROM pg_constraint co WHERE co.contype='f' AND co.confrelid IN(SELECT oid FROM scope) AND co.conrelid NOT IN(SELECT oid FROM scope)),
 'eventTriggers',(SELECT jsonb_agg(jsonb_build_object('name',e.evtname,'event',e.evtevent,'enabled',e.evtenabled,'function',e.evtfoid::regprocedure::text,'definition',pg_get_functiondef(e.evtfoid)) ORDER BY e.evtname) FROM pg_event_trigger e),
 'defaultPrivileges',(SELECT jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'objectType',d.defaclobjtype,'grants',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type) FROM aclexplode(d.defaclacl) a)) ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype) FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE d.defaclnamespace IN(0,'public'::regnamespace))
) AS contract;
