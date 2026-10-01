CREATE TABLE "player_onboarding" (
	"player_id" uuid NOT NULL,
	"step" text NOT NULL,
	"completed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_onboarding_pk" PRIMARY KEY("player_id","step"),
	CONSTRAINT "player_onboarding_step_check" CHECK ("player_onboarding"."step" ~ '^[a-z][a-z0-9_]{1,39}$')
);
--> statement-breakpoint
ALTER TABLE "player_onboarding" ADD CONSTRAINT "player_onboarding_player_id_player_profiles_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player_profiles"("id") ON DELETE cascade ON UPDATE no action;