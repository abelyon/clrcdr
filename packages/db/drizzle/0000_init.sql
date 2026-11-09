CREATE TYPE "public"."language" AS ENUM('en', 'hu');--> statement-breakpoint
CREATE TYPE "public"."match_mode" AS ENUM('SOLO', '1V1', 'TOURNAMENT');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('ACTIVE', 'COMPLETED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('dark', 'light');--> statement-breakpoint
CREATE TYPE "public"."tournament_match_status" AS ENUM('PENDING', 'READY', 'IN_PROGRESS', 'BYE', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('REGISTRATION', 'IN_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('PLAYER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "match_mode" NOT NULL,
	"secret_code" jsonb NOT NULL,
	"player1_id" uuid,
	"player2_id" uuid,
	"winner_id" uuid,
	"player1_guesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"player2_guesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"player1_score" integer DEFAULT 0 NOT NULL,
	"player2_score" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"status" "match_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tournament_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"match_order" integer NOT NULL,
	"player1_id" uuid,
	"player2_id" uuid,
	"winner_id" uuid,
	"match_id" uuid,
	"next_match_id" uuid,
	"next_match_slot" smallint,
	"status" "tournament_match_status" DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "tournament_matches_position_unique" UNIQUE("tournament_id","round","match_order")
);
--> statement-breakpoint
CREATE TABLE "tournament_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seed" integer,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_participants_unique" UNIQUE("tournament_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"status" "tournament_status" DEFAULT 'REGISTRATION' NOT NULL,
	"max_players" integer NOT NULL,
	"created_by_id" uuid,
	"start_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	"colorblind_mode" boolean DEFAULT false NOT NULL,
	"high_contrast" boolean DEFAULT false NOT NULL,
	"theme" "theme" DEFAULT 'dark' NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(32) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'PLAYER' NOT NULL,
	"rating" integer DEFAULT 1000 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"games_won" integer DEFAULT 0 NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"best_time_ms" integer,
	"total_win_attempts" integer DEFAULT 0 NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player1_id_users_id_fk" FOREIGN KEY ("player1_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player2_id_users_id_fk" FOREIGN KEY ("player2_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_player1_id_users_id_fk" FOREIGN KEY ("player1_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_player2_id_users_id_fk" FOREIGN KEY ("player2_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_next_match_id_tournament_matches_id_fk" FOREIGN KEY ("next_match_id") REFERENCES "public"."tournament_matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_player1_idx" ON "matches" USING btree ("player1_id");--> statement-breakpoint
CREATE INDEX "matches_player2_idx" ON "matches" USING btree ("player2_id");--> statement-breakpoint
CREATE INDEX "matches_status_completed_idx" ON "matches" USING btree ("status","completed_at");--> statement-breakpoint
CREATE INDEX "tournament_matches_tournament_idx" ON "tournament_matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_participants_tournament_idx" ON "tournament_participants" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "users_total_score_idx" ON "users" USING btree ("total_score");--> statement-breakpoint
CREATE INDEX "users_rating_idx" ON "users" USING btree ("rating");