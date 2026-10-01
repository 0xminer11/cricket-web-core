CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"email" text,
	"email_normalized" text,
	"email_verified_at" timestamp (3) with time zone,
	"password_hash" text,
	"password_changed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_provider_check" CHECK ("auth_identities"."provider" IN ('email_password', 'google', 'apple')),
	CONSTRAINT "auth_identities_email_password_check" CHECK ("auth_identities"."provider" <> 'email_password' OR ("auth_identities"."email_normalized" IS NOT NULL AND "auth_identities"."email" IS NOT NULL AND "auth_identities"."password_hash" IS NOT NULL AND "auth_identities"."provider_subject" = "auth_identities"."email_normalized")),
	CONSTRAINT "auth_identities_password_provider_check" CHECK ("auth_identities"."provider" = 'email_password' OR "auth_identities"."password_hash" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"absolute_expires_at" timestamp (3) with time zone NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"revoked_reason" text,
	"user_agent_summary" text,
	CONSTRAINT "auth_sessions_token_hash_check" CHECK ("auth_sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_sessions_expiry_check" CHECK ("auth_sessions"."expires_at" <= "auth_sessions"."absolute_expires_at"),
	CONSTRAINT "auth_sessions_revoked_check" CHECK (("auth_sessions"."revoked_at" IS NULL) = ("auth_sessions"."revoked_reason" IS NULL)),
	CONSTRAINT "auth_sessions_revoked_reason_check" CHECK ("auth_sessions"."revoked_reason" IS NULL OR "auth_sessions"."revoked_reason" IN ('logout', 'logout_all', 'rotated', 'upgraded', 'password_changed', 'password_reset', 'suspended', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"email_normalized" text,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"consumed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_purpose_check" CHECK ("auth_tokens"."purpose" IN ('email_verification', 'password_reset')),
	CONSTRAINT "auth_tokens_token_hash_check" CHECK ("auth_tokens"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_type_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_type" text DEFAULT 'guest' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "registered_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_subject_uniq" ON "auth_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_user_provider_uniq" ON "auth_identities" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "auth_identities_email_normalized_idx" ON "auth_identities" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_uniq" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_revoked_idx" ON "auth_sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_token_hash_uniq" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_purpose_idx" ON "auth_tokens" USING btree ("user_id","purpose","consumed_at");--> statement-breakpoint
CREATE INDEX "auth_tokens_expires_idx" ON "auth_tokens" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_type_check" CHECK ("users"."account_type" IN ('guest', 'registered'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_registered_at_check" CHECK ((("users"."account_type" = 'registered') = ("users"."registered_at" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_type_check" CHECK ("audit_logs"."actor_type" IN ('system', 'admin', 'service', 'user'));