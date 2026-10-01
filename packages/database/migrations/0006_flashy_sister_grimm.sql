CREATE TABLE "match_engine_sessions" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"replay" jsonb NOT NULL,
	"state" jsonb NOT NULL,
	"participant_map" jsonb NOT NULL,
	CONSTRAINT "match_engine_sessions_revision_check" CHECK ("match_engine_sessions"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "match_engine_sessions" ADD CONSTRAINT "match_engine_sessions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;