CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"origin" text DEFAULT 'organic' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "users_status_check" CHECK ("users"."status" IN ('active', 'suspended', 'deleted')),
	CONSTRAINT "users_origin_check" CHECK ("users"."origin" IN ('organic', 'development', 'test')),
	CONSTRAINT "users_deleted_at_check" CHECK ((("users"."status" = 'deleted') = ("users"."deleted_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_id" text NOT NULL,
	"name_override" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_definition_id_check" CHECK ("teams"."definition_id" ~ '^team\.[a-z0-9_.]+$'),
	CONSTRAINT "teams_name_override_check" CHECK ("teams"."name_override" IS NULL OR char_length("teams"."name_override") BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "player_appearance" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"body_preset_id" text NOT NULL,
	"face_preset_id" text NOT NULL,
	"skin_tone_id" text NOT NULL,
	"hair_style_id" text NOT NULL,
	"hair_color_id" text NOT NULL,
	"beard_style_id" text,
	"height_scale" numeric(4, 3) DEFAULT '1.000' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_appearance_height_scale_check" CHECK ("player_appearance"."height_scale" BETWEEN 0.850 AND 1.150),
	CONSTRAINT "player_appearance_body_preset_id_check" CHECK ("player_appearance"."body_preset_id" ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
	CONSTRAINT "player_appearance_face_preset_id_check" CHECK ("player_appearance"."face_preset_id" ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
	CONSTRAINT "player_appearance_skin_tone_id_check" CHECK ("player_appearance"."skin_tone_id" ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
	CONSTRAINT "player_appearance_hair_style_id_check" CHECK ("player_appearance"."hair_style_id" ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
	CONSTRAINT "player_appearance_hair_color_id_check" CHECK ("player_appearance"."hair_color_id" ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
	CONSTRAINT "player_appearance_beard_style_id_check" CHECK ("player_appearance"."beard_style_id" IS NULL OR "player_appearance"."beard_style_id" ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$')
);
--> statement-breakpoint
CREATE TABLE "player_attributes" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"batting_timing" smallint NOT NULL,
	"batting_power" smallint NOT NULL,
	"batting_placement" smallint NOT NULL,
	"batting_defence" smallint NOT NULL,
	"batting_footwork" smallint NOT NULL,
	"batting_shot_selection" smallint NOT NULL,
	"batting_technique" smallint NOT NULL,
	"batting_consistency" smallint NOT NULL,
	"bowling_pace" smallint NOT NULL,
	"bowling_accuracy" smallint NOT NULL,
	"bowling_swing" smallint NOT NULL,
	"bowling_seam" smallint NOT NULL,
	"bowling_spin" smallint NOT NULL,
	"bowling_control" smallint NOT NULL,
	"bowling_variation" smallint NOT NULL,
	"bowling_consistency" smallint NOT NULL,
	"physical_strength" smallint NOT NULL,
	"physical_stamina" smallint NOT NULL,
	"physical_fitness" smallint NOT NULL,
	"physical_reflex" smallint NOT NULL,
	"physical_agility" smallint NOT NULL,
	"physical_recovery" smallint NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_attributes_batting_timing_range" CHECK ("player_attributes"."batting_timing" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_batting_power_range" CHECK ("player_attributes"."batting_power" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_batting_placement_range" CHECK ("player_attributes"."batting_placement" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_batting_defence_range" CHECK ("player_attributes"."batting_defence" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_batting_footwork_range" CHECK ("player_attributes"."batting_footwork" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_batting_shot_selection_range" CHECK ("player_attributes"."batting_shot_selection" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_batting_technique_range" CHECK ("player_attributes"."batting_technique" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_batting_consistency_range" CHECK ("player_attributes"."batting_consistency" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_bowling_pace_range" CHECK ("player_attributes"."bowling_pace" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_bowling_accuracy_range" CHECK ("player_attributes"."bowling_accuracy" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_bowling_swing_range" CHECK ("player_attributes"."bowling_swing" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_bowling_seam_range" CHECK ("player_attributes"."bowling_seam" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_bowling_spin_range" CHECK ("player_attributes"."bowling_spin" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_bowling_control_range" CHECK ("player_attributes"."bowling_control" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_bowling_variation_range" CHECK ("player_attributes"."bowling_variation" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_bowling_consistency_range" CHECK ("player_attributes"."bowling_consistency" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_physical_strength_range" CHECK ("player_attributes"."physical_strength" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_physical_stamina_range" CHECK ("player_attributes"."physical_stamina" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_physical_fitness_range" CHECK ("player_attributes"."physical_fitness" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_physical_reflex_range" CHECK ("player_attributes"."physical_reflex" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_physical_agility_range" CHECK ("player_attributes"."physical_agility" BETWEEN 1 AND 100),
	CONSTRAINT "player_attributes_physical_recovery_range" CHECK ("player_attributes"."physical_recovery" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "player_personality" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"confidence" smallint NOT NULL,
	"discipline" smallint NOT NULL,
	"leadership" smallint NOT NULL,
	"professionalism" smallint NOT NULL,
	"risk_appetite" smallint NOT NULL,
	"team_mindset" smallint NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_personality_confidence_range" CHECK ("player_personality"."confidence" BETWEEN 1 AND 100),
	CONSTRAINT "player_personality_discipline_range" CHECK ("player_personality"."discipline" BETWEEN 1 AND 100),
	CONSTRAINT "player_personality_leadership_range" CHECK ("player_personality"."leadership" BETWEEN 1 AND 100),
	CONSTRAINT "player_personality_professionalism_range" CHECK ("player_personality"."professionalism" BETWEEN 1 AND 100),
	CONSTRAINT "player_personality_risk_appetite_range" CHECK ("player_personality"."risk_appetite" BETWEEN 1 AND 100),
	CONSTRAINT "player_personality_team_mindset_range" CHECK ("player_personality"."team_mindset" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "player_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"country_code" text NOT NULL,
	"jersey_number" smallint NOT NULL,
	"batting_hand" text NOT NULL,
	"primary_role" text NOT NULL,
	"secondary_roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"bowling_style" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_profiles_display_name_check" CHECK ("player_profiles"."display_name" = btrim("player_profiles"."display_name") AND char_length("player_profiles"."display_name") BETWEEN 3 AND 24),
	CONSTRAINT "player_profiles_country_code_check" CHECK ("player_profiles"."country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "player_profiles_jersey_number_check" CHECK ("player_profiles"."jersey_number" BETWEEN 0 AND 99),
	CONSTRAINT "player_profiles_batting_hand_check" CHECK ("player_profiles"."batting_hand" IN ('right', 'left')),
	CONSTRAINT "player_profiles_primary_role_check" CHECK ("player_profiles"."primary_role" IN ('opening_batter', 'top_order_batter', 'middle_order_batter', 'finisher', 'wicketkeeper_batter', 'batting_all_rounder', 'bowling_all_rounder', 'fast_bowler', 'swing_bowler', 'spin_bowler')),
	CONSTRAINT "player_profiles_secondary_roles_check" CHECK ("player_profiles"."secondary_roles" <@ ARRAY['opening_batter', 'top_order_batter', 'middle_order_batter', 'finisher', 'wicketkeeper_batter', 'batting_all_rounder', 'bowling_all_rounder', 'fast_bowler', 'swing_bowler', 'spin_bowler']::text[]),
	CONSTRAINT "player_profiles_bowling_style_check" CHECK ("player_profiles"."bowling_style" IS NULL OR "player_profiles"."bowling_style" IN ('right_arm_fast', 'left_arm_fast', 'right_arm_medium', 'left_arm_medium', 'off_spin', 'leg_spin', 'left_arm_orthodox', 'left_arm_wrist_spin'))
);
--> statement-breakpoint
CREATE TABLE "player_skill_progress" (
	"player_id" uuid NOT NULL,
	"stat_key" text NOT NULL,
	"skill_xp" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_skill_progress_pk" PRIMARY KEY("player_id","stat_key"),
	CONSTRAINT "player_skill_progress_stat_key_check" CHECK ("player_skill_progress"."stat_key" IN ('batting.timing', 'batting.power', 'batting.placement', 'batting.defence', 'batting.footwork', 'batting.shotSelection', 'batting.technique', 'batting.consistency', 'bowling.pace', 'bowling.accuracy', 'bowling.swing', 'bowling.seam', 'bowling.spin', 'bowling.control', 'bowling.variation', 'bowling.consistency', 'physical.strength', 'physical.stamina', 'physical.fitness', 'physical.reflex', 'physical.agility', 'physical.recovery')),
	CONSTRAINT "player_skill_progress_skill_xp_check" CHECK ("player_skill_progress"."skill_xp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "player_state" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"current_xp" bigint DEFAULT 0 NOT NULL,
	"lifetime_xp" bigint DEFAULT 0 NOT NULL,
	"form" smallint DEFAULT 50 NOT NULL,
	"form_updated_at" timestamp (3) with time zone,
	"fatigue" smallint DEFAULT 0 NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_state_level_check" CHECK ("player_state"."level" BETWEEN 1 AND 50),
	CONSTRAINT "player_state_current_xp_check" CHECK ("player_state"."current_xp" >= 0),
	CONSTRAINT "player_state_lifetime_xp_check" CHECK ("player_state"."lifetime_xp" >= 0),
	CONSTRAINT "player_state_lifetime_ge_current_check" CHECK ("player_state"."lifetime_xp" >= "player_state"."current_xp"),
	CONSTRAINT "player_state_form_check" CHECK ("player_state"."form" BETWEEN 0 AND 100),
	CONSTRAINT "player_state_fatigue_check" CHECK ("player_state"."fatigue" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"player_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text DEFAULT 'all' NOT NULL,
	"matches" integer DEFAULT 0 NOT NULL,
	"matches_won" integer DEFAULT 0 NOT NULL,
	"innings_batted" integer DEFAULT 0 NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"balls_faced" integer DEFAULT 0 NOT NULL,
	"fours" integer DEFAULT 0 NOT NULL,
	"sixes" integer DEFAULT 0 NOT NULL,
	"fifties" integer DEFAULT 0 NOT NULL,
	"hundreds" integer DEFAULT 0 NOT NULL,
	"highest_score" integer DEFAULT 0 NOT NULL,
	"not_outs" integer DEFAULT 0 NOT NULL,
	"balls_bowled" integer DEFAULT 0 NOT NULL,
	"runs_conceded" integer DEFAULT 0 NOT NULL,
	"wickets" integer DEFAULT 0 NOT NULL,
	"maidens" integer DEFAULT 0 NOT NULL,
	"best_bowling_wickets" integer DEFAULT 0 NOT NULL,
	"best_bowling_runs" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_stats_pk" PRIMARY KEY("player_id","scope_type","scope_id"),
	CONSTRAINT "player_stats_scope_type_check" CHECK ("player_stats"."scope_type" IN ('career', 'season', 'competition', 'format')),
	CONSTRAINT "player_stats_scope_id_check" CHECK (char_length("player_stats"."scope_id") BETWEEN 1 AND 80),
	CONSTRAINT "player_stats_matches_check" CHECK ("player_stats"."matches" >= 0),
	CONSTRAINT "player_stats_matches_won_check" CHECK ("player_stats"."matches_won" >= 0),
	CONSTRAINT "player_stats_innings_batted_check" CHECK ("player_stats"."innings_batted" >= 0),
	CONSTRAINT "player_stats_runs_check" CHECK ("player_stats"."runs" >= 0),
	CONSTRAINT "player_stats_balls_faced_check" CHECK ("player_stats"."balls_faced" >= 0),
	CONSTRAINT "player_stats_fours_check" CHECK ("player_stats"."fours" >= 0),
	CONSTRAINT "player_stats_sixes_check" CHECK ("player_stats"."sixes" >= 0),
	CONSTRAINT "player_stats_fifties_check" CHECK ("player_stats"."fifties" >= 0),
	CONSTRAINT "player_stats_hundreds_check" CHECK ("player_stats"."hundreds" >= 0),
	CONSTRAINT "player_stats_highest_score_check" CHECK ("player_stats"."highest_score" >= 0),
	CONSTRAINT "player_stats_not_outs_check" CHECK ("player_stats"."not_outs" >= 0),
	CONSTRAINT "player_stats_balls_bowled_check" CHECK ("player_stats"."balls_bowled" >= 0),
	CONSTRAINT "player_stats_runs_conceded_check" CHECK ("player_stats"."runs_conceded" >= 0),
	CONSTRAINT "player_stats_wickets_check" CHECK ("player_stats"."wickets" >= 0),
	CONSTRAINT "player_stats_maidens_check" CHECK ("player_stats"."maidens" >= 0),
	CONSTRAINT "player_stats_best_bowling_wickets_check" CHECK ("player_stats"."best_bowling_wickets" >= 0),
	CONSTRAINT "player_stats_best_bowling_runs_check" CHECK ("player_stats"."best_bowling_runs" >= 0),
	CONSTRAINT "player_stats_won_le_matches_check" CHECK ("player_stats"."matches_won" <= "player_stats"."matches"),
	CONSTRAINT "player_stats_not_outs_le_innings_check" CHECK ("player_stats"."not_outs" <= "player_stats"."innings_batted"),
	CONSTRAINT "player_stats_highest_le_runs_check" CHECK ("player_stats"."highest_score" <= "player_stats"."runs")
);
--> statement-breakpoint
CREATE TABLE "career_event_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"career_id" uuid NOT NULL,
	"event_definition_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"selected_choice_id" text,
	"career_matches_at_trigger" integer DEFAULT 0 NOT NULL,
	"triggered_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp (3) with time zone,
	"effects_snapshot" jsonb,
	"game_balance_version" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_event_instances_status_check" CHECK ("career_event_instances"."status" IN ('pending', 'resolved', 'expired', 'dismissed')),
	CONSTRAINT "career_event_instances_definition_check" CHECK ("career_event_instances"."event_definition_id" ~ '^career_event\.[a-z0-9_.]+$'),
	CONSTRAINT "career_event_instances_resolution_check" CHECK (("career_event_instances"."status" = 'resolved') = ("career_event_instances"."resolved_at" IS NOT NULL AND "career_event_instances"."selected_choice_id" IS NOT NULL)),
	CONSTRAINT "career_event_instances_matches_check" CHECK ("career_event_instances"."career_matches_at_trigger" >= 0)
);
--> statement-breakpoint
CREATE TABLE "career_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"career_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"reference_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "career_history_event_type_check" CHECK ("career_history"."event_type" IN ('career_started', 'team_joined', 'team_left', 'tier_promoted', 'tier_demoted', 'contract_signed', 'contract_ended', 'sponsorship_signed', 'captaincy_awarded', 'international_selected', 'season_started', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "careers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"current_tier" text DEFAULT 'academy' NOT NULL,
	"current_team_id" uuid,
	"season_number" integer DEFAULT 1 NOT NULL,
	"career_status" text DEFAULT 'active' NOT NULL,
	"reputation" integer DEFAULT 0 NOT NULL,
	"selector_interest" integer DEFAULT 0 NOT NULL,
	"fans" bigint DEFAULT 0 NOT NULL,
	"row_version" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "careers_current_tier_check" CHECK ("careers"."current_tier" IN ('academy', 'club', 'district', 'domestic', 'franchise', 'international')),
	CONSTRAINT "careers_career_status_check" CHECK ("careers"."career_status" IN ('active', 'retired', 'abandoned')),
	CONSTRAINT "careers_season_number_check" CHECK ("careers"."season_number" > 0),
	CONSTRAINT "careers_reputation_check" CHECK ("careers"."reputation" BETWEEN 0 AND 1000),
	CONSTRAINT "careers_selector_interest_check" CHECK ("careers"."selector_interest" BETWEEN 0 AND 100),
	CONSTRAINT "careers_fans_check" CHECK ("careers"."fans" >= 0),
	CONSTRAINT "careers_retired_at_check" CHECK ((("careers"."career_status" = 'retired') = ("careers"."retired_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"career_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"contract_definition_id" text,
	"status" text DEFAULT 'offered' NOT NULL,
	"expected_role" text NOT NULL,
	"salary_coins" bigint NOT NULL,
	"match_fee_coins" bigint NOT NULL,
	"performance_bonus_coins" bigint NOT NULL,
	"minimum_performance_rating" numeric(3, 1) DEFAULT '0.0' NOT NULL,
	"duration_matches" integer NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"terms_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"game_balance_version" text NOT NULL,
	"offered_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"signed_at" timestamp (3) with time zone,
	"starts_at" timestamp (3) with time zone,
	"ends_at" timestamp (3) with time zone,
	"terminated_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_status_check" CHECK ("contracts"."status" IN ('offered', 'accepted', 'active', 'completed', 'terminated', 'expired', 'rejected')),
	CONSTRAINT "contracts_expected_role_check" CHECK ("contracts"."expected_role" IN ('opening_batter', 'top_order_batter', 'middle_order_batter', 'finisher', 'wicketkeeper_batter', 'batting_all_rounder', 'bowling_all_rounder', 'fast_bowler', 'swing_bowler', 'spin_bowler')),
	CONSTRAINT "contracts_salary_coins_check" CHECK ("contracts"."salary_coins" >= 0),
	CONSTRAINT "contracts_match_fee_coins_check" CHECK ("contracts"."match_fee_coins" >= 0),
	CONSTRAINT "contracts_performance_bonus_coins_check" CHECK ("contracts"."performance_bonus_coins" >= 0),
	CONSTRAINT "contracts_min_rating_check" CHECK ("contracts"."minimum_performance_rating" BETWEEN 0 AND 10),
	CONSTRAINT "contracts_duration_matches_check" CHECK ("contracts"."duration_matches" > 0),
	CONSTRAINT "contracts_matches_played_check" CHECK ("contracts"."matches_played" >= 0 AND "contracts"."matches_played" <= "contracts"."duration_matches"),
	CONSTRAINT "contracts_definition_check" CHECK ("contracts"."contract_definition_id" IS NULL OR "contracts"."contract_definition_id" ~ '^contract\.[a-z0-9_.]+$'),
	CONSTRAINT "contracts_signed_at_check" CHECK ("contracts"."status" NOT IN ('accepted', 'active', 'completed') OR "contracts"."signed_at" IS NOT NULL),
	CONSTRAINT "contracts_terminated_at_check" CHECK ((("contracts"."status" = 'terminated') = ("contracts"."terminated_at" IS NOT NULL))),
	CONSTRAINT "contracts_period_check" CHECK ("contracts"."starts_at" IS NULL OR "contracts"."ends_at" IS NULL OR "contracts"."ends_at" >= "contracts"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "sponsorships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"career_id" uuid NOT NULL,
	"sponsor_definition_id" text NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"payout_currency" text NOT NULL,
	"payout_amount" bigint NOT NULL,
	"reward_config_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"objective_progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"game_balance_version" text NOT NULL,
	"offered_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp (3) with time zone,
	"starts_at" timestamp (3) with time zone,
	"ends_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsorships_status_check" CHECK ("sponsorships"."status" IN ('offered', 'active', 'completed', 'terminated', 'expired', 'rejected')),
	CONSTRAINT "sponsorships_currency_check" CHECK ("sponsorships"."payout_currency" IN ('coins', 'gems')),
	CONSTRAINT "sponsorships_payout_amount_check" CHECK ("sponsorships"."payout_amount" >= 0),
	CONSTRAINT "sponsorships_definition_check" CHECK ("sponsorships"."sponsor_definition_id" ~ '^sponsor\.[a-z0-9_.]+$'),
	CONSTRAINT "sponsorships_accepted_at_check" CHECK ("sponsorships"."status" NOT IN ('active', 'completed') OR "sponsorships"."accepted_at" IS NOT NULL),
	CONSTRAINT "sponsorships_period_check" CHECK ("sponsorships"."starts_at" IS NULL OR "sponsorships"."ends_at" IS NULL OR "sponsorships"."ends_at" >= "sponsorships"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"career_id" uuid,
	"competition_definition_id" text NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"match_format_id" text NOT NULL,
	"scheduled_at" timestamp (3) with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"season_number" integer DEFAULT 1 NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixtures_status_check" CHECK ("fixtures"."status" IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'postponed')),
	CONSTRAINT "fixtures_teams_differ_check" CHECK ("fixtures"."home_team_id" <> "fixtures"."away_team_id"),
	CONSTRAINT "fixtures_format_check" CHECK ("fixtures"."match_format_id" ~ '^format\.[a-z0-9_.]+$'),
	CONSTRAINT "fixtures_competition_check" CHECK ("fixtures"."competition_definition_id" ~ '^competition\.[a-z0-9_.]+$'),
	CONSTRAINT "fixtures_season_number_check" CHECK ("fixtures"."season_number" > 0),
	CONSTRAINT "fixtures_round_check" CHECK ("fixtures"."round" > 0)
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"shirt_number" smallint,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_memberships_role_check" CHECK ("team_memberships"."role" IN ('player', 'captain', 'vice_captain')),
	CONSTRAINT "team_memberships_status_check" CHECK ("team_memberships"."status" IN ('active', 'ended')),
	CONSTRAINT "team_memberships_shirt_number_check" CHECK ("team_memberships"."shirt_number" IS NULL OR "team_memberships"."shirt_number" BETWEEN 0 AND 99),
	CONSTRAINT "team_memberships_left_at_check" CHECK ((("team_memberships"."status" = 'ended') = ("team_memberships"."left_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "currency_balances" (
	"player_id" uuid NOT NULL,
	"currency_type" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currency_balances_pk" PRIMARY KEY("player_id","currency_type"),
	CONSTRAINT "currency_balances_currency_check" CHECK ("currency_balances"."currency_type" IN ('coins', 'gems')),
	CONSTRAINT "currency_balances_non_negative_check" CHECK ("currency_balances"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reward_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"reward_definition_id" text,
	"status" text DEFAULT 'granted' NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_snapshot" jsonb NOT NULL,
	"game_balance_version" text NOT NULL,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_grants_source_type_check" CHECK ("reward_grants"."source_type" IN ('match', 'achievement', 'career_event', 'contract', 'sponsorship', 'training', 'starter', 'admin')),
	CONSTRAINT "reward_grants_status_check" CHECK ("reward_grants"."status" IN ('granted', 'reversed')),
	CONSTRAINT "reward_grants_source_id_check" CHECK (char_length("reward_grants"."source_id") BETWEEN 1 AND 100),
	CONSTRAINT "reward_grants_idempotency_key_check" CHECK (char_length("reward_grants"."idempotency_key") BETWEEN 8 AND 128)
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"currency_type" text NOT NULL,
	"amount" bigint NOT NULL,
	"balance_before" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"transaction_type" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "wallet_transactions_type_check" CHECK ("wallet_transactions"."transaction_type" IN ('starter_grant', 'match_reward', 'training_cost', 'item_purchase', 'item_sale', 'item_upgrade', 'achievement_reward', 'career_event_reward', 'contract_payment', 'sponsor_payout', 'admin_adjustment')),
	CONSTRAINT "wallet_transactions_amount_check" CHECK ("wallet_transactions"."amount" <> 0),
	CONSTRAINT "wallet_transactions_before_check" CHECK ("wallet_transactions"."balance_before" >= 0),
	CONSTRAINT "wallet_transactions_after_check" CHECK ("wallet_transactions"."balance_after" >= 0),
	CONSTRAINT "wallet_transactions_arithmetic_check" CHECK ("wallet_transactions"."balance_after" = "wallet_transactions"."balance_before" + "wallet_transactions"."amount"),
	CONSTRAINT "wallet_transactions_sign_check" CHECK (("wallet_transactions"."transaction_type" NOT IN ('training_cost', 'item_purchase', 'item_upgrade') OR "wallet_transactions"."amount" < 0) AND ("wallet_transactions"."transaction_type" NOT IN ('starter_grant', 'match_reward', 'achievement_reward', 'item_sale', 'contract_payment', 'sponsor_payout') OR "wallet_transactions"."amount" > 0)),
	CONSTRAINT "wallet_transactions_reference_check" CHECK (char_length("wallet_transactions"."reference_type") BETWEEN 1 AND 40 AND char_length("wallet_transactions"."reference_id") BETWEEN 1 AND 100),
	CONSTRAINT "wallet_transactions_idempotency_key_check" CHECK (char_length("wallet_transactions"."idempotency_key") BETWEEN 8 AND 128)
);
--> statement-breakpoint
CREATE TABLE "equipped_items" (
	"player_id" uuid NOT NULL,
	"equipment_slot" text NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"equipped_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipped_items_pk" PRIMARY KEY("player_id","equipment_slot"),
	CONSTRAINT "equipped_items_inventory_item_uniq" UNIQUE("inventory_item_id"),
	CONSTRAINT "equipped_items_slot_check" CHECK ("equipped_items"."equipment_slot" IN ('bat', 'helmet', 'gloves', 'pads', 'shoes', 'jersey', 'pants', 'wristband', 'arm_guard', 'glasses', 'chain', 'bat_grip', 'bat_sticker'))
);
--> statement-breakpoint
CREATE TABLE "player_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"item_definition_id" text NOT NULL,
	"upgrade_level" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"acquisition_source" text NOT NULL,
	"idempotency_key" text,
	"metadata" jsonb,
	"acquired_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_inventory_id_player_uniq" UNIQUE("id","player_id"),
	CONSTRAINT "player_inventory_item_definition_check" CHECK ("player_inventory"."item_definition_id" ~ '^item\.[a-z0-9_.]+$'),
	CONSTRAINT "player_inventory_upgrade_level_check" CHECK ("player_inventory"."upgrade_level" >= 0),
	CONSTRAINT "player_inventory_quantity_check" CHECK ("player_inventory"."quantity" > 0),
	CONSTRAINT "player_inventory_status_check" CHECK ("player_inventory"."status" IN ('active', 'sold', 'consumed', 'removed')),
	CONSTRAINT "player_inventory_source_check" CHECK ("player_inventory"."acquisition_source" IN ('starter', 'shop', 'reward', 'achievement', 'contract', 'sponsor', 'premium_purchase', 'admin_grant', 'promotion')),
	CONSTRAINT "player_inventory_idempotency_key_check" CHECK ("player_inventory"."idempotency_key" IS NULL OR char_length("player_inventory"."idempotency_key") BETWEEN 8 AND 128)
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"training_definition_id" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"cost_currency" text NOT NULL,
	"cost_amount" bigint NOT NULL,
	"xp_awarded" integer DEFAULT 0 NOT NULL,
	"fatigue_added" integer DEFAULT 0 NOT NULL,
	"outcome" jsonb,
	"wallet_transaction_id" uuid,
	"idempotency_key" text,
	"game_balance_version" text NOT NULL,
	"started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_sessions_status_check" CHECK ("training_sessions"."status" IN ('started', 'completed', 'cancelled')),
	CONSTRAINT "training_sessions_definition_check" CHECK ("training_sessions"."training_definition_id" ~ '^training\.[a-z0-9_.]+$'),
	CONSTRAINT "training_sessions_cost_currency_check" CHECK ("training_sessions"."cost_currency" IN ('coins', 'gems')),
	CONSTRAINT "training_sessions_cost_check" CHECK ("training_sessions"."cost_amount" >= 0),
	CONSTRAINT "training_sessions_xp_check" CHECK ("training_sessions"."xp_awarded" >= 0),
	CONSTRAINT "training_sessions_fatigue_check" CHECK ("training_sessions"."fatigue_added" BETWEEN 0 AND 100),
	CONSTRAINT "training_sessions_completed_at_check" CHECK (("training_sessions"."status" = 'completed') = ("training_sessions"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "match_balls" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "match_balls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"match_id" uuid NOT NULL,
	"innings_id" uuid NOT NULL,
	"over_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"over_number" smallint NOT NULL,
	"ball_in_over" smallint NOT NULL,
	"striker_participant_id" uuid NOT NULL,
	"non_striker_participant_id" uuid NOT NULL,
	"bowler_participant_id" uuid NOT NULL,
	"delivery_definition_id" text NOT NULL,
	"shot_definition_id" text,
	"line" text NOT NULL,
	"length" text NOT NULL,
	"runs_off_bat" smallint DEFAULT 0 NOT NULL,
	"extras" smallint DEFAULT 0 NOT NULL,
	"extra_type" text,
	"wicket" boolean DEFAULT false NOT NULL,
	"wicket_type" text,
	"dismissed_participant_id" uuid,
	"legal_delivery" boolean DEFAULT true NOT NULL,
	"contact_quality" text,
	"ball_speed" numeric(5, 2),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_balls_match_innings_seq_uniq" UNIQUE("match_id","innings_id","sequence_number"),
	CONSTRAINT "match_balls_over_ball_uniq" UNIQUE("over_id","ball_in_over"),
	CONSTRAINT "match_balls_sequence_check" CHECK ("match_balls"."sequence_number" > 0),
	CONSTRAINT "match_balls_over_number_check" CHECK ("match_balls"."over_number" > 0),
	CONSTRAINT "match_balls_ball_in_over_check" CHECK ("match_balls"."ball_in_over" BETWEEN 1 AND 30),
	CONSTRAINT "match_balls_runs_off_bat_check" CHECK ("match_balls"."runs_off_bat" BETWEEN 0 AND 8),
	CONSTRAINT "match_balls_extras_check" CHECK ("match_balls"."extras" BETWEEN 0 AND 10),
	CONSTRAINT "match_balls_batters_differ_check" CHECK ("match_balls"."striker_participant_id" <> "match_balls"."non_striker_participant_id"),
	CONSTRAINT "match_balls_extra_type_check" CHECK (("match_balls"."extra_type" IS NULL) = ("match_balls"."extras" = 0) AND ("match_balls"."extra_type" IS NULL OR "match_balls"."extra_type" IN ('wide', 'no_ball', 'bye', 'leg_bye'))),
	CONSTRAINT "match_balls_legal_delivery_check" CHECK ("match_balls"."legal_delivery" = ("match_balls"."extra_type" IS NULL OR "match_balls"."extra_type" NOT IN ('wide', 'no_ball'))),
	CONSTRAINT "match_balls_wicket_check" CHECK ("match_balls"."wicket" = ("match_balls"."wicket_type" IS NOT NULL) AND "match_balls"."wicket" = ("match_balls"."dismissed_participant_id" IS NOT NULL)),
	CONSTRAINT "match_balls_wicket_type_valid_check" CHECK ("match_balls"."wicket_type" IS NULL OR "match_balls"."wicket_type" IN ('bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket')),
	CONSTRAINT "match_balls_contact_quality_check" CHECK ("match_balls"."contact_quality" IS NULL OR "match_balls"."contact_quality" IN ('perfect', 'good', 'okay', 'poor', 'edge', 'miss')),
	CONSTRAINT "match_balls_line_check" CHECK ("match_balls"."line" IN ('wide_off', 'outside_off', 'off_stump', 'middle', 'leg', 'wide_leg')),
	CONSTRAINT "match_balls_length_check" CHECK ("match_balls"."length" IN ('yorker', 'full', 'good', 'short', 'bouncer')),
	CONSTRAINT "match_balls_ball_speed_check" CHECK ("match_balls"."ball_speed" IS NULL OR "match_balls"."ball_speed" BETWEEN 0 AND 200),
	CONSTRAINT "match_balls_delivery_id_check" CHECK ("match_balls"."delivery_definition_id" ~ '^delivery\.[a-z0-9_.]+$'),
	CONSTRAINT "match_balls_shot_id_check" CHECK ("match_balls"."shot_definition_id" IS NULL OR "match_balls"."shot_definition_id" ~ '^shot\.[a-z0-9_.]+$')
);
--> statement-breakpoint
CREATE TABLE "match_innings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"innings_number" smallint NOT NULL,
	"batting_team_id" uuid NOT NULL,
	"bowling_team_id" uuid NOT NULL,
	"is_super_over" boolean DEFAULT false NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"wickets" smallint DEFAULT 0 NOT NULL,
	"legal_balls" integer DEFAULT 0 NOT NULL,
	"extras" integer DEFAULT 0 NOT NULL,
	"target" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_innings_match_number_uniq" UNIQUE("match_id","innings_number"),
	CONSTRAINT "match_innings_id_match_uniq" UNIQUE("id","match_id"),
	CONSTRAINT "match_innings_status_check" CHECK ("match_innings"."status" IN ('pending', 'in_progress', 'completed')),
	CONSTRAINT "match_innings_number_check" CHECK ("match_innings"."innings_number" > 0),
	CONSTRAINT "match_innings_teams_differ_check" CHECK ("match_innings"."batting_team_id" <> "match_innings"."bowling_team_id"),
	CONSTRAINT "match_innings_runs_check" CHECK ("match_innings"."runs" >= 0),
	CONSTRAINT "match_innings_wickets_check" CHECK ("match_innings"."wickets" BETWEEN 0 AND 10),
	CONSTRAINT "match_innings_legal_balls_check" CHECK ("match_innings"."legal_balls" >= 0),
	CONSTRAINT "match_innings_extras_check" CHECK ("match_innings"."extras" >= 0 AND "match_innings"."extras" <= "match_innings"."runs"),
	CONSTRAINT "match_innings_target_check" CHECK ("match_innings"."target" IS NULL OR "match_innings"."target" > 0),
	CONSTRAINT "match_innings_started_at_check" CHECK ("match_innings"."status" = 'pending' OR "match_innings"."started_at" IS NOT NULL),
	CONSTRAINT "match_innings_completed_at_check" CHECK (("match_innings"."status" = 'completed') = ("match_innings"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "match_overs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"innings_id" uuid NOT NULL,
	"over_number" smallint NOT NULL,
	"bowler_participant_id" uuid NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"wickets" smallint DEFAULT 0 NOT NULL,
	"legal_balls" smallint DEFAULT 0 NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_overs_innings_number_uniq" UNIQUE("innings_id","over_number"),
	CONSTRAINT "match_overs_id_innings_uniq" UNIQUE("id","innings_id"),
	CONSTRAINT "match_overs_number_check" CHECK ("match_overs"."over_number" > 0),
	CONSTRAINT "match_overs_runs_check" CHECK ("match_overs"."runs" >= 0),
	CONSTRAINT "match_overs_wickets_check" CHECK ("match_overs"."wickets" BETWEEN 0 AND 10),
	CONSTRAINT "match_overs_legal_balls_check" CHECK ("match_overs"."legal_balls" BETWEEN 0 AND 12)
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"player_id" uuid,
	"participant_type" text NOT NULL,
	"batting_position" smallint,
	"selected_role" text,
	"display_name_snapshot" text NOT NULL,
	"overall_snapshot" smallint,
	"performance_rating" numeric(3, 1),
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_participants_match_id_id_uniq" UNIQUE("match_id","id"),
	CONSTRAINT "match_participants_type_check" CHECK ("match_participants"."participant_type" IN ('human', 'ai')),
	CONSTRAINT "match_participants_human_has_profile_check" CHECK (("match_participants"."participant_type" = 'human') = ("match_participants"."player_id" IS NOT NULL)),
	CONSTRAINT "match_participants_batting_position_check" CHECK ("match_participants"."batting_position" IS NULL OR "match_participants"."batting_position" BETWEEN 1 AND 11),
	CONSTRAINT "match_participants_overall_check" CHECK ("match_participants"."overall_snapshot" IS NULL OR "match_participants"."overall_snapshot" BETWEEN 0 AND 100),
	CONSTRAINT "match_participants_rating_check" CHECK ("match_participants"."performance_rating" IS NULL OR "match_participants"."performance_rating" BETWEEN 0 AND 10),
	CONSTRAINT "match_participants_display_name_check" CHECK (char_length("match_participants"."display_name_snapshot") BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_id" uuid,
	"match_mode" text DEFAULT 'career' NOT NULL,
	"match_format_id" text NOT NULL,
	"pitch_definition_id" text NOT NULL,
	"match_engine_version" text NOT NULL,
	"game_balance_version" text NOT NULL,
	"data_schema_version" integer NOT NULL,
	"rng_seed" text,
	"rng_algorithm_version" text,
	"status" text DEFAULT 'created' NOT NULL,
	"home_team_id" uuid NOT NULL,
	"away_team_id" uuid NOT NULL,
	"winner_team_id" uuid,
	"result_type" text,
	"result_summary" text,
	"started_at" timestamp (3) with time zone,
	"completed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_status_check" CHECK ("matches"."status" IN ('created', 'ready', 'in_progress', 'completed', 'abandoned', 'cancelled')),
	CONSTRAINT "matches_mode_check" CHECK ("matches"."match_mode" IN ('career', 'friendly', 'ranked', 'tournament')),
	CONSTRAINT "matches_result_type_check" CHECK ("matches"."result_type" IS NULL OR "matches"."result_type" IN ('win', 'tie', 'no_result', 'abandoned')),
	CONSTRAINT "matches_teams_differ_check" CHECK ("matches"."home_team_id" <> "matches"."away_team_id"),
	CONSTRAINT "matches_winner_is_participant_check" CHECK ("matches"."winner_team_id" IS NULL OR "matches"."winner_team_id" IN ("matches"."home_team_id", "matches"."away_team_id")),
	CONSTRAINT "matches_format_check" CHECK ("matches"."match_format_id" ~ '^format\.[a-z0-9_.]+$'),
	CONSTRAINT "matches_pitch_check" CHECK ("matches"."pitch_definition_id" ~ '^pitch\.[a-z0-9_.]+$'),
	CONSTRAINT "matches_data_schema_version_check" CHECK ("matches"."data_schema_version" > 0),
	CONSTRAINT "matches_result_summary_check" CHECK ("matches"."result_summary" IS NULL OR char_length("matches"."result_summary") <= 200),
	CONSTRAINT "matches_started_at_check" CHECK ("matches"."status" NOT IN ('in_progress', 'completed') OR "matches"."started_at" IS NOT NULL),
	CONSTRAINT "matches_completion_check" CHECK (("matches"."status" = 'completed') = ("matches"."completed_at" IS NOT NULL AND "matches"."result_type" IS NOT NULL AND "matches"."result_type" <> 'abandoned')),
	CONSTRAINT "matches_winner_result_check" CHECK (("matches"."winner_team_id" IS NOT NULL) = COALESCE("matches"."result_type" = 'win', false))
);
--> statement-breakpoint
CREATE TABLE "player_achievements" (
	"player_id" uuid NOT NULL,
	"achievement_definition_id" text NOT NULL,
	"progress" bigint DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"reward_claimed" boolean DEFAULT false NOT NULL,
	"reward_claimed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_achievements_pk" PRIMARY KEY("player_id","achievement_definition_id"),
	CONSTRAINT "player_achievements_definition_check" CHECK ("player_achievements"."achievement_definition_id" ~ '^achievement\.[a-z0-9_.]+$'),
	CONSTRAINT "player_achievements_progress_check" CHECK ("player_achievements"."progress" >= 0),
	CONSTRAINT "player_achievements_completed_at_check" CHECK ((("player_achievements"."completed") = ("player_achievements"."completed_at" IS NOT NULL))),
	CONSTRAINT "player_achievements_claimed_check" CHECK ((("player_achievements"."reward_claimed") = ("player_achievements"."reward_claimed_at" IS NOT NULL))),
	CONSTRAINT "player_achievements_claim_requires_completion_check" CHECK (NOT "player_achievements"."reward_claimed" OR "player_achievements"."completed")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_actor_type_check" CHECK ("audit_logs"."actor_type" IN ('system', 'admin', 'service')),
	CONSTRAINT "audit_logs_admin_actor_check" CHECK ("audit_logs"."actor_type" <> 'admin' OR "audit_logs"."actor_id" IS NOT NULL),
	CONSTRAINT "audit_logs_action_check" CHECK (char_length("audit_logs"."action") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "game_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_balance_version" text NOT NULL,
	"match_engine_version" text NOT NULL,
	"data_schema_version" integer NOT NULL,
	"activated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_versions_schema_version_check" CHECK ("game_versions"."data_schema_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "player_appearance" ADD CONSTRAINT "player_appearance_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_attributes" ADD CONSTRAINT "player_attributes_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_personality" ADD CONSTRAINT "player_personality_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_skill_progress" ADD CONSTRAINT "player_skill_progress_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_state" ADD CONSTRAINT "player_state_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_event_instances" ADD CONSTRAINT "career_event_instances_career_id_careers_id_fk" FOREIGN KEY ("career_id") REFERENCES "public"."careers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "career_history" ADD CONSTRAINT "career_history_career_id_careers_id_fk" FOREIGN KEY ("career_id") REFERENCES "public"."careers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "careers" ADD CONSTRAINT "careers_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "careers" ADD CONSTRAINT "careers_current_team_id_teams_id_fk" FOREIGN KEY ("current_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_career_id_careers_id_fk" FOREIGN KEY ("career_id") REFERENCES "public"."careers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_career_id_careers_id_fk" FOREIGN KEY ("career_id") REFERENCES "public"."careers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_career_id_careers_id_fk" FOREIGN KEY ("career_id") REFERENCES "public"."careers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_balances" ADD CONSTRAINT "currency_balances_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_balance_fk" FOREIGN KEY ("player_id","currency_type") REFERENCES "public"."currency_balances"("player_id","currency_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipped_items" ADD CONSTRAINT "equipped_items_inventory_owner_fk" FOREIGN KEY ("inventory_item_id","player_id") REFERENCES "public"."player_inventory"("id","player_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_inventory" ADD CONSTRAINT "player_inventory_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_wallet_tx_fk" FOREIGN KEY ("wallet_transaction_id") REFERENCES "public"."wallet_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_balls" ADD CONSTRAINT "match_balls_innings_match_fk" FOREIGN KEY ("innings_id","match_id") REFERENCES "public"."match_innings"("id","match_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_balls" ADD CONSTRAINT "match_balls_over_innings_fk" FOREIGN KEY ("over_id","innings_id") REFERENCES "public"."match_overs"("id","innings_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_balls" ADD CONSTRAINT "match_balls_striker_fk" FOREIGN KEY ("match_id","striker_participant_id") REFERENCES "public"."match_participants"("match_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_balls" ADD CONSTRAINT "match_balls_non_striker_fk" FOREIGN KEY ("match_id","non_striker_participant_id") REFERENCES "public"."match_participants"("match_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_balls" ADD CONSTRAINT "match_balls_bowler_fk" FOREIGN KEY ("match_id","bowler_participant_id") REFERENCES "public"."match_participants"("match_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_balls" ADD CONSTRAINT "match_balls_dismissed_fk" FOREIGN KEY ("match_id","dismissed_participant_id") REFERENCES "public"."match_participants"("match_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_innings" ADD CONSTRAINT "match_innings_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_innings" ADD CONSTRAINT "match_innings_batting_team_id_teams_id_fk" FOREIGN KEY ("batting_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_innings" ADD CONSTRAINT "match_innings_bowling_team_id_teams_id_fk" FOREIGN KEY ("bowling_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_overs" ADD CONSTRAINT "match_overs_innings_match_fk" FOREIGN KEY ("innings_id","match_id") REFERENCES "public"."match_innings"("id","match_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_overs" ADD CONSTRAINT "match_overs_bowler_participant_fk" FOREIGN KEY ("match_id","bowler_participant_id") REFERENCES "public"."match_participants"("match_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_definition_id_uniq" ON "teams" USING btree ("definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_profiles_user_id_uniq" ON "player_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "career_event_instances_career_status_idx" ON "career_event_instances" USING btree ("career_id","status");--> statement-breakpoint
CREATE INDEX "career_event_instances_career_def_idx" ON "career_event_instances" USING btree ("career_id","event_definition_id","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "career_event_instances_one_pending_uniq" ON "career_event_instances" USING btree ("career_id","event_definition_id") WHERE "career_event_instances"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "career_history_career_occurred_idx" ON "career_history" USING btree ("career_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "careers_player_id_idx" ON "careers" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "careers_one_active_per_player_uniq" ON "careers" USING btree ("player_id") WHERE "careers"."career_status" = 'active';--> statement-breakpoint
CREATE INDEX "careers_current_team_id_idx" ON "careers" USING btree ("current_team_id");--> statement-breakpoint
CREATE INDEX "contracts_career_status_idx" ON "contracts" USING btree ("career_id","status");--> statement-breakpoint
CREATE INDEX "contracts_team_id_idx" ON "contracts" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_one_active_per_career_uniq" ON "contracts" USING btree ("career_id") WHERE "contracts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "sponsorships_career_status_idx" ON "sponsorships" USING btree ("career_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsorships_one_live_per_sponsor_uniq" ON "sponsorships" USING btree ("career_id","sponsor_definition_id") WHERE "sponsorships"."status" IN ('offered', 'active');--> statement-breakpoint
CREATE INDEX "fixtures_scheduled_status_idx" ON "fixtures" USING btree ("scheduled_at","status");--> statement-breakpoint
CREATE INDEX "fixtures_career_scheduled_idx" ON "fixtures" USING btree ("career_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "fixtures_home_team_id_idx" ON "fixtures" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "fixtures_away_team_id_idx" ON "fixtures" USING btree ("away_team_id");--> statement-breakpoint
CREATE INDEX "team_memberships_player_status_idx" ON "team_memberships" USING btree ("player_id","status");--> statement-breakpoint
CREATE INDEX "team_memberships_team_status_idx" ON "team_memberships" USING btree ("team_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "team_memberships_one_active_per_team_uniq" ON "team_memberships" USING btree ("player_id","team_id") WHERE "team_memberships"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "reward_grants_source_uniq" ON "reward_grants" USING btree ("player_id","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_grants_idempotency_uniq" ON "reward_grants" USING btree ("player_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "reward_grants_player_granted_idx" ON "reward_grants" USING btree ("player_id","granted_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_transactions_idempotency_uniq" ON "wallet_transactions" USING btree ("player_id","currency_type","idempotency_key");--> statement-breakpoint
CREATE INDEX "wallet_transactions_player_created_idx" ON "wallet_transactions" USING btree ("player_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "wallet_transactions_reference_idx" ON "wallet_transactions" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "player_inventory_player_status_idx" ON "player_inventory" USING btree ("player_id","status");--> statement-breakpoint
CREATE INDEX "player_inventory_player_item_idx" ON "player_inventory" USING btree ("player_id","item_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_inventory_idempotency_uniq" ON "player_inventory" USING btree ("player_id","idempotency_key") WHERE "player_inventory"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "training_sessions_player_started_idx" ON "training_sessions" USING btree ("player_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "training_sessions_idempotency_uniq" ON "training_sessions" USING btree ("player_id","idempotency_key") WHERE "training_sessions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "match_participants_match_player_uniq" ON "match_participants" USING btree ("match_id","player_id") WHERE "match_participants"."player_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "match_participants_match_team_position_uniq" ON "match_participants" USING btree ("match_id","team_id","batting_position") WHERE "match_participants"."batting_position" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "match_participants_player_history_idx" ON "match_participants" USING btree ("player_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "match_participants"."player_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "match_participants_team_id_idx" ON "match_participants" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "matches_status_started_idx" ON "matches" USING btree ("status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_fixture_id_uniq" ON "matches" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "matches_home_team_id_idx" ON "matches" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX "matches_away_team_id_idx" ON "matches" USING btree ("away_team_id");--> statement-breakpoint
CREATE INDEX "player_achievements_player_idx" ON "player_achievements" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "game_versions_combo_uniq" ON "game_versions" USING btree ("game_balance_version","match_engine_version","data_schema_version");--> statement-breakpoint
CREATE INDEX "game_versions_activated_idx" ON "game_versions" USING btree ("activated_at" DESC NULLS LAST);