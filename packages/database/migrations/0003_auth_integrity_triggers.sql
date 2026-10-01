-- Custom migration: database-level guards for authentication data. No cricket rules here.
-- 1) auth_identities.updated_at stays truthful (same trigger as the Module 2 tables).
CREATE TRIGGER auth_identities_touch_updated_at
BEFORE UPDATE ON "auth_identities"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
-- 2) A registered account never reverts to guest, and a login identity never moves between
-- users. Guest -> registered keeps users.id, which is what preserves every game foreign key.
CREATE FUNCTION auth_guard_account_type() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.account_type = 'registered' AND NEW.account_type <> 'registered' THEN
    RAISE EXCEPTION 'A registered account cannot become a guest account'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_guard_account_type
BEFORE UPDATE OF account_type ON "users"
FOR EACH ROW EXECUTE FUNCTION auth_guard_account_type();
--> statement-breakpoint
CREATE FUNCTION auth_guard_identity_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id OR NEW.provider <> OLD.provider THEN
    RAISE EXCEPTION 'An authentication identity cannot be reassigned'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER auth_identities_guard_owner
BEFORE UPDATE ON "auth_identities"
FOR EACH ROW EXECUTE FUNCTION auth_guard_identity_owner();
