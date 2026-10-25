BEGIN;
DO $$
DECLARE
  u1 UUID;
  u2 UUID;
  duplicate_blocked BOOLEAN;
  remaining INTEGER;
BEGIN
  INSERT INTO public."user" (handle_name, name, first_surname, email)
  VALUES ('t24-user-a-' || substr(md5(random()::text),1,10), 'Test', 'User', 't24-a-' || substr(md5(random()::text),1,10) || '@example.org')
  RETURNING id INTO u1;
  INSERT INTO public."user" (handle_name, name, first_surname, email)
  VALUES ('t24-user-b-' || substr(md5(random()::text),1,10), 'Test', 'User', 't24-b-' || substr(md5(random()::text),1,10) || '@example.org')
  RETURNING id INTO u2;

  INSERT INTO public.external_account (user_id, provider, provider_user_id, access_token)
  VALUES (u1,'google','google-example-t24','synthetic-encrypted-placeholder'),
         (u1,'github','github-example-t24','synthetic-encrypted-placeholder');

  duplicate_blocked := FALSE;
  BEGIN
    INSERT INTO public.external_account (user_id, provider, provider_user_id, access_token)
    VALUES (u1,'google','different-google-id','synthetic-encrypted-placeholder');
  EXCEPTION WHEN unique_violation THEN duplicate_blocked := TRUE;
  END;
  IF NOT duplicate_blocked THEN RAISE EXCEPTION 'Missing UNIQUE(user_id, provider)'; END IF;

  duplicate_blocked := FALSE;
  BEGIN
    INSERT INTO public.external_account (user_id, provider, provider_user_id, access_token)
    VALUES (u2,'google','google-example-t24','synthetic-encrypted-placeholder');
  EXCEPTION WHEN unique_violation THEN duplicate_blocked := TRUE;
  END;
  IF NOT duplicate_blocked THEN RAISE EXCEPTION 'Missing UNIQUE(provider, provider_user_id)'; END IF;

  DELETE FROM public."user" WHERE id=u1;
  SELECT count(*) INTO remaining FROM public.external_account WHERE user_id=u1;
  IF remaining <> 0 THEN RAISE EXCEPTION 'ON DELETE CASCADE failed'; END IF;
  RAISE NOTICE 'T-24 constraints and cascade OK';
END $$;

DO $$
DECLARE enabled BOOLEAN; policy_count INTEGER;
BEGIN
  SELECT relrowsecurity INTO enabled
  FROM pg_class WHERE oid = 'public.external_account'::regclass;
  SELECT count(*) INTO policy_count FROM pg_policies
  WHERE schemaname='public' AND tablename='external_account';
  IF NOT enabled THEN RAISE EXCEPTION 'RLS is disabled'; END IF;
  IF policy_count <> 0 THEN RAISE EXCEPTION 'Unexpected RLS policies'; END IF;
  RAISE NOTICE 'T-24 RLS enabled and no policies found';
END $$;
ROLLBACK;
