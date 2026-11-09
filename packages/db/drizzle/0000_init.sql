CREATE TYPE "public"."game_mode" AS ENUM('SOLO', 'ONE_VS_ONE');--> statement-breakpoint
CREATE TYPE "public"."game_player_result" AS ENUM('WIN', 'LOSS', 'DRAW', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('IN_PROGRESS', 'COMPLETED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('en', 'hu');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('PENDING', 'READY', 'IN_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('DRAFT', 'REGISTRATION', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"language" "language" DEFAULT 'en' NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"audio_muted" boolean DEFAULT false NOT NULL,
	"master_volume" integer DEFAULT 80 NOT NULL,
	"music_volume" integer DEFAULT 50 NOT NULL,
	"sfx_volume" integer DEFAULT 80 NOT NULL,
	"colorblind_mode" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_master_volume_range" CHECK ("user_settings"."master_volume" between 0 and 100),
	CONSTRAINT "user_settings_music_volume_range" CHECK ("user_settings"."music_volume" between 0 and 100),
	CONSTRAINT "user_settings_sfx_volume_range" CHECK ("user_settings"."sfx_volume" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"username" varchar(32) NOT NULL,
	"display_name" varchar(64) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_players" (
	"game_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" varchar(64) NOT NULL,
	"result" "game_player_result",
	"score" integer DEFAULT 0 NOT NULL,
	"guesses_count" smallint DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"solved_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_players_game_id_user_id_pk" PRIMARY KEY("game_id","user_id"),
	CONSTRAINT "game_players_score_non_negative" CHECK ("game_players"."score" >= 0),
	CONSTRAINT "game_players_guesses_non_negative" CHECK ("game_players"."guesses_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "game_mode" NOT NULL,
	"status" "game_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"code_length" smallint DEFAULT 4 NOT NULL,
	"color_count" smallint DEFAULT 6 NOT NULL,
	"max_attempts" smallint DEFAULT 10 NOT NULL,
	"allow_duplicates" boolean DEFAULT true NOT NULL,
	"winner_id" uuid,
	"match_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_code_length_range" CHECK ("games"."code_length" between 2 and 8),
	CONSTRAINT "games_duration_non_negative" CHECK ("games"."duration_ms" is null or "games"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"position" integer NOT NULL,
	"next_match_id" uuid,
	"next_match_slot" smallint,
	"player1_id" uuid,
	"player2_id" uuid,
	"winner_id" uuid,
	"is_bye" boolean DEFAULT false NOT NULL,
	"status" "match_status" DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_tournament_round_position_unique" UNIQUE("tournament_id","round","position"),
	CONSTRAINT "matches_round_positive" CHECK ("matches"."round" >= 1),
	CONSTRAINT "matches_position_non_negative" CHECK ("matches"."position" >= 0),
	CONSTRAINT "matches_next_match_slot_valid" CHECK (("matches"."next_match_id" is null and "matches"."next_match_slot" is null) or ("matches"."next_match_id" is not null and "matches"."next_match_slot" in (1, 2))),
	CONSTRAINT "matches_no_self_advance" CHECK ("matches"."next_match_id" is null or "matches"."next_match_id" <> "matches"."id"),
	CONSTRAINT "matches_winner_is_player" CHECK ("matches"."winner_id" is null or "matches"."winner_id" = "matches"."player1_id" or "matches"."winner_id" = "matches"."player2_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_participants" (
	"tournament_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seed" integer NOT NULL,
	"eliminated_in_round" integer,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_participants_tournament_id_user_id_pk" PRIMARY KEY("tournament_id","user_id"),
	CONSTRAINT "tournament_participants_seed_unique" UNIQUE("tournament_id","seed"),
	CONSTRAINT "tournament_participants_seed_positive" CHECK ("tournament_participants"."seed" >= 1)
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"size" integer NOT NULL,
	"status" "tournament_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid NOT NULL,
	"winner_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournaments_size_min" CHECK ("tournaments"."size" >= 2)
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_next_match_id_matches_id_fk" FOREIGN KEY ("next_match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player1_id_users_id_fk" FOREIGN KEY ("player1_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_player2_id_users_id_fk" FOREIGN KEY ("player2_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_unique" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "game_players_user_created_idx" ON "game_players" USING btree ("user_id","joined_at");--> statement-breakpoint
CREATE INDEX "game_players_score_idx" ON "game_players" USING btree ("score");--> statement-breakpoint
CREATE INDEX "games_mode_status_idx" ON "games" USING btree ("mode","status");--> statement-breakpoint
CREATE INDEX "games_ended_at_idx" ON "games" USING btree ("ended_at");--> statement-breakpoint
CREATE INDEX "games_winner_idx" ON "games" USING btree ("winner_id");--> statement-breakpoint
CREATE INDEX "games_match_idx" ON "games" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "matches_tournament_round_idx" ON "matches" USING btree ("tournament_id","round");--> statement-breakpoint
CREATE INDEX "matches_next_match_idx" ON "matches" USING btree ("next_match_id");--> statement-breakpoint
CREATE INDEX "matches_player1_idx" ON "matches" USING btree ("player1_id");--> statement-breakpoint
CREATE INDEX "matches_player2_idx" ON "matches" USING btree ("player2_id");--> statement-breakpoint
CREATE INDEX "matches_winner_idx" ON "matches" USING btree ("winner_id");--> statement-breakpoint
CREATE INDEX "tournament_participants_user_idx" ON "tournament_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tournaments_status_idx" ON "tournaments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tournaments_created_by_idx" ON "tournaments" USING btree ("created_by");