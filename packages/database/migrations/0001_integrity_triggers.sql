-- Custom migration: database-level integrity guards. None of these encode cricket rules.
-- 1) updated_at is maintained by the database so raw SQL and atomic increments stay truthful.
CREATE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_touch_updated_at
BEFORE UPDATE ON "users"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER teams_touch_updated_at
BEFORE UPDATE ON "teams"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER player_profiles_touch_updated_at
BEFORE UPDATE ON "player_profiles"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER player_appearance_touch_updated_at
BEFORE UPDATE ON "player_appearance"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER player_attributes_touch_updated_at
BEFORE UPDATE ON "player_attributes"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER player_personality_touch_updated_at
BEFORE UPDATE ON "player_personality"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER player_state_touch_updated_at
BEFORE UPDATE ON "player_state"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER player_skill_progress_touch_updated_at
BEFORE UPDATE ON "player_skill_progress"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER player_stats_touch_updated_at
BEFORE UPDATE ON "player_stats"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER careers_touch_updated_at
BEFORE UPDATE ON "careers"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER career_event_instances_touch_updated_at
BEFORE UPDATE ON "career_event_instances"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER contracts_touch_updated_at
BEFORE UPDATE ON "contracts"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER sponsorships_touch_updated_at
BEFORE UPDATE ON "sponsorships"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER team_memberships_touch_updated_at
BEFORE UPDATE ON "team_memberships"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER fixtures_touch_updated_at
BEFORE UPDATE ON "fixtures"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER currency_balances_touch_updated_at
BEFORE UPDATE ON "currency_balances"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER player_inventory_touch_updated_at
BEFORE UPDATE ON "player_inventory"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER training_sessions_touch_updated_at
BEFORE UPDATE ON "training_sessions"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER matches_touch_updated_at
BEFORE UPDATE ON "matches"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER match_participants_touch_updated_at
BEFORE UPDATE ON "match_participants"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER match_innings_touch_updated_at
BEFORE UPDATE ON "match_innings"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER player_achievements_touch_updated_at
BEFORE UPDATE ON "player_achievements"
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION touch_updated_at();
--> statement-breakpoint
-- 2) Append-only tables: the ledger, audit trail and career history can never be edited or deleted
-- by application roles. (TRUNCATE is a separate privilege the application role must not hold.)
CREATE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER wallet_transactions_append_only
BEFORE UPDATE OR DELETE ON "wallet_transactions"
FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER career_history_append_only
BEFORE UPDATE OR DELETE ON "career_history"
FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
-- 3) Currency balances may only change inside a transaction that opted in via
-- set_config('app.wallet_write', 'on', true). WalletRepository is the only code that does so, and
-- it always writes the matching wallet_transactions row in the same transaction.
CREATE FUNCTION guard_balance_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.wallet_write', true) IS DISTINCT FROM 'on' THEN
    IF TG_OP = 'INSERT' AND NEW.balance = 0 THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.balance = OLD.balance THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'currency_balances may only change through the wallet ledger' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER currency_balances_guard_write
BEFORE INSERT OR UPDATE ON "currency_balances"
FOR EACH ROW EXECUTE FUNCTION guard_balance_write();
--> statement-breakpoint
-- 4) Lifetime XP is a monotonic total.
CREATE FUNCTION forbid_lifetime_xp_decrease() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lifetime_xp < OLD.lifetime_xp THEN
    RAISE EXCEPTION 'player_state.lifetime_xp cannot decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER player_state_lifetime_xp_monotonic
BEFORE UPDATE ON "player_state"
FOR EACH ROW EXECUTE FUNCTION forbid_lifetime_xp_decrease();
