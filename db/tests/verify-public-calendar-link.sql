
BEGIN;

DO $$
DECLARE
  test_user_id UUID;
  second_user_id UUID;
  test_active BOOLEAN;
  test_created_at TIMESTAMPTZ;
  test_updated_at TIMESTAMPTZ;
  rows_count INTEGER;
  is_blocked BOOLEAN;
  rls_enabled BOOLEAN;
  policy_count INTEGER;
  fk_delete_rule "char";
  fk_update_rule "char";
BEGIN
  INSERT INTO public."user" (
    handle_name, name, first_surname, email
  )
  VALUES (
    'cal39-' || substr(md5(random()::text), 1, 12),
    'Test',
    'Calendar',
    'cal39-' || substr(md5(random()::text), 1, 12) || '@example.com'
  )
  RETURNING id INTO test_user_id;

  INSERT INTO public."user" (
    handle_name, name, first_surname, email
  )
  VALUES (
    'cal39-' || substr(md5(random()::text), 1, 12),
    'Test',
    'Calendar',
    'cal39-' || substr(md5(random()::text), 1, 12) || '@example.com'
  )
  RETURNING id INTO second_user_id;

  INSERT INTO public.public_calendar_link (user_id)
  VALUES (test_user_id)
  RETURNING active, created_at, updated_at
  INTO test_active, test_created_at, test_updated_at;

  IF test_active IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'FAIL: active debe ser FALSE por defecto';
  END IF;

  IF test_created_at IS NULL OR test_updated_at IS NULL THEN
    RAISE EXCEPTION 'FAIL: faltan timestamps por defecto';
  END IF;

  RAISE NOTICE 'OK: active=false y timestamps correctos';

  is_blocked := FALSE;

  BEGIN
    INSERT INTO public.public_calendar_link (user_id, active)
    VALUES (test_user_id, TRUE);
  EXCEPTION WHEN unique_violation THEN
    is_blocked := TRUE;
  END;

  IF NOT is_blocked THEN
    RAISE EXCEPTION 'FAIL: se permiten configuraciones duplicadas';
  END IF;

  RAISE NOTICE 'OK: clave primaria y unicidad';

  is_blocked := FALSE;

  BEGIN
    INSERT INTO public.public_calendar_link (user_id)
    VALUES (gen_random_uuid());
  EXCEPTION WHEN foreign_key_violation THEN
    is_blocked := TRUE;
  END;

  IF NOT is_blocked THEN
    RAISE EXCEPTION 'FAIL: se aceptan usuarios inexistentes';
  END IF;

  RAISE NOTICE 'OK: clave foranea a user';

  UPDATE public.public_calendar_link
  SET active = TRUE, updated_at = NOW()
  WHERE user_id = test_user_id;

  SELECT active INTO test_active
  FROM public.public_calendar_link
  WHERE user_id = test_user_id;

  IF test_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FAIL: no se pudo activar el calendario';
  END IF;

  UPDATE public.public_calendar_link
  SET active = FALSE, updated_at = NOW()
  WHERE user_id = test_user_id;

  SELECT active INTO test_active
  FROM public.public_calendar_link
  WHERE user_id = test_user_id;

  IF test_active IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'FAIL: no se pudo desactivar el calendario';
  END IF;

  RAISE NOTICE 'OK: activacion y desactivacion';

  SELECT c.confdeltype, c.confupdtype
  INTO fk_delete_rule, fk_update_rule
  FROM pg_constraint c
  WHERE c.conrelid = 'public.public_calendar_link'::regclass
    AND c.contype = 'f'
    AND c.confrelid = 'public."user"'::regclass;

  IF fk_delete_rule IS DISTINCT FROM 'c'
     OR fk_update_rule IS DISTINCT FROM 'c' THEN
    RAISE EXCEPTION 'FAIL: FK sin ON DELETE/UPDATE CASCADE';
  END IF;

  RAISE NOTICE 'OK: ON DELETE y ON UPDATE CASCADE';

  INSERT INTO public.public_calendar_link (user_id)
  VALUES (second_user_id);

  DELETE FROM public."user"
  WHERE id = second_user_id;

  SELECT COUNT(*) INTO rows_count
  FROM public.public_calendar_link
  WHERE user_id = second_user_id;

  IF rows_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: ON DELETE CASCADE no funciona';
  END IF;

  RAISE NOTICE 'OK: eliminacion fisica en cascada';

  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class
  WHERE oid = 'public.public_calendar_link'::regclass;

  IF rls_enabled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FAIL: RLS no esta habilitado';
  END IF;

  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'public_calendar_link';

  IF policy_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: existen politicas RLS inesperadas';
  END IF;

  IF has_table_privilege(
    'public', 'public.public_calendar_link', 'SELECT'
  ) THEN
    RAISE EXCEPTION 'FAIL: acceso SELECT concedido a PUBLIC';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    IF has_table_privilege('anon', 'public.public_calendar_link', 'SELECT') THEN
      RAISE EXCEPTION 'FAIL: anon tiene permiso SELECT';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    IF has_table_privilege('authenticated', 'public.public_calendar_link', 'SELECT') THEN
      RAISE EXCEPTION 'FAIL: authenticated tiene permiso SELECT';
    END IF;
  END IF;

  RAISE NOTICE 'OK: RLS habilitado y sin acceso directo';
  RAISE NOTICE 'ISSUE #39: todas las comprobaciones pasaron';
END
$$;

ROLLBACK;
