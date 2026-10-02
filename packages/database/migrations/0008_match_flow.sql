CREATE TABLE "match_career_results" (
	"match_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"summary" jsonb NOT NULL,
	"game_balance_version" text NOT NULL,
	"processed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_career_results_pk" UNIQUE("match_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "match_engine_sessions" ADD COLUMN "flow" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "match_career_results" ADD CONSTRAINT "match_career_results_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_career_results" ADD CONSTRAINT "match_career_results_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_career_results_player_idx" ON "match_career_results" USING btree ("player_id","processed_at");