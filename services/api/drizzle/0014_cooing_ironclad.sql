CREATE TABLE IF NOT EXISTS "age_engine_rules" (
	"age_group" varchar(10) PRIMARY KEY NOT NULL,
	"scene_count" integer NOT NULL,
	"word_range_min" integer NOT NULL,
	"word_range_max" integer NOT NULL,
	"max_sentence_length" integer NOT NULL,
	"vocabulary" varchar(20) NOT NULL,
	"dialog_ratio" numeric(3, 2) NOT NULL,
	"themes" text NOT NULL,
	"fear_level" integer NOT NULL,
	"allowed_conflicts" text NOT NULL,
	"additional_rules" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "age_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(10) NOT NULL,
	"name_key" varchar(100) NOT NULL,
	"min_months" integer NOT NULL,
	"max_months" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "age_groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"scene_id" uuid,
	"asset_type" varchar(20) NOT NULL,
	"storage_path" text NOT NULL,
	"storage_url" text,
	"signed_url" text,
	"signed_url_expires_at" timestamp,
	"mime_type" varchar(100) NOT NULL,
	"file_size_bytes" integer,
	"generation_params" jsonb,
	"generation_time_ms" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"voice_id" uuid,
	"voice_name" varchar(100) NOT NULL,
	"language" varchar(10) NOT NULL,
	"speed" numeric(3, 2) DEFAULT '1.0' NOT NULL,
	"pitch_shift" integer DEFAULT 0 NOT NULL,
	"night_mode" boolean DEFAULT false NOT NULL,
	"text_hash" varchar(64) NOT NULL,
	"asset_id" uuid NOT NULL,
	"duration_seconds" numeric(8, 2),
	"scene_group_index" integer,
	"is_final" boolean DEFAULT false NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"provider" varchar(50) DEFAULT 'elevenlabs' NOT NULL,
	"provider_request_id" varchar(255),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(50) NOT NULL,
	"reference_photos" jsonb,
	"appearance_traits" jsonb,
	"personality" jsonb,
	"description" text,
	"ai_generated_description" text,
	"clothing" jsonb,
	"distinctive_features" jsonb,
	"turnaround_sheet" jsonb,
	"description_en" text,
	"description_language" varchar(10),
	"is_hidden" boolean DEFAULT false NOT NULL,
	"description_embedding" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "child_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"birth_date" date NOT NULL,
	"gender" varchar(20),
	"languages" jsonb NOT NULL,
	"reference_photos" jsonb,
	"appearance_traits" jsonb,
	"personality" jsonb,
	"interests" jsonb,
	"sensitivities" jsonb,
	"family_cast" jsonb,
	"ai_generated_description" text,
	"description_en" text,
	"description_language" varchar(10),
	"clothing" jsonb,
	"distinctive_features" jsonb,
	"turnaround_sheet" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_policy_rules" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"category" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"prohibited_elements" text NOT NULL,
	"examples" text NOT NULL,
	"prompt_guidance" text NOT NULL,
	"severity" varchar(20) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"feature_type" varchar(20) NOT NULL,
	"default_value" jsonb NOT NULL,
	"category" varchar(50) NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "features_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generated_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid,
	"character_id" uuid,
	"child_profile_id" uuid,
	"character_name" varchar(255),
	"asset_id" uuid,
	"character_description" text NOT NULL,
	"generation_params" jsonb,
	"reference_type" varchar(50) NOT NULL,
	"source" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"provider_email" varchar(255),
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"raw_user_info" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"feature_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"price_monthly" integer DEFAULT 0 NOT NULL,
	"pricing_currency" varchar(3) DEFAULT 'UAH' NOT NULL,
	"billing_period" varchar(20) DEFAULT 'monthly' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scenario_cards" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name_key" varchar(100) NOT NULL,
	"description_key" varchar(100) NOT NULL,
	"icon" varchar(50),
	"prompt_guidance" text NOT NULL,
	"suggested_goals" text NOT NULL,
	"age_groups" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scenario_plot_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scenario_card_id" varchar(100) NOT NULL,
	"setting" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"scene_id" integer NOT NULL,
	"text" text NOT NULL,
	"visual_prompt" text NOT NULL,
	"characters_present" jsonb,
	"is_reference_image" boolean DEFAULT false,
	"image_url" text,
	"generation_params" jsonb,
	"generation_time_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"device_name" varchar(255),
	"device_type" varchar(50),
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"child_profile_id" uuid,
	"story_request_id" uuid,
	"title" varchar(255) NOT NULL,
	"language" varchar(5) NOT NULL,
	"age_group" varchar(10) NOT NULL,
	"moral_theme" varchar(50),
	"tone" varchar(50),
	"outline" jsonb,
	"scenes" jsonb NOT NULL,
	"full_text" text NOT NULL,
	"word_count" integer,
	"estimated_read_minutes" integer,
	"model_version" varchar(50),
	"generation_time_ms" integer,
	"policy_checks" jsonb,
	"metadata" jsonb,
	"audio_metadata" jsonb,
	"series_id" uuid,
	"part_number" integer,
	"is_published" boolean DEFAULT true,
	"is_favorite" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"role" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_goals" (
	"slug" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"prompt_guidance" text NOT NULL,
	"min_age" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"child_profile_id" uuid,
	"ui_locale" varchar(5) NOT NULL,
	"story_language" varchar(5) NOT NULL,
	"goal" varchar(50),
	"tone" varchar(50),
	"scenario_card_id" varchar(100),
	"image_style" varchar(50),
	"user_notes" text,
	"selected_characters" jsonb,
	"selected_children" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0,
	"progress_data" jsonb,
	"intermediate_data" jsonb,
	"story_id" uuid,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"child_profile_id" uuid,
	"base_title" varchar(255) NOT NULL,
	"language" varchar(5) NOT NULL,
	"age_group" varchar(10) NOT NULL,
	"image_style" varchar(50) NOT NULL,
	"tone" varchar(50),
	"total_parts" integer DEFAULT 1 NOT NULL,
	"story_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"continuation_context" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_tones" (
	"slug" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"prompt_guidance" text NOT NULL,
	"writing_style" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" varchar(100) NOT NULL,
	"locale" varchar(5) NOT NULL,
	"field_name" varchar(50) NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tts_voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_voice_id" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"language" varchar(10) NOT NULL,
	"gender" varchar(20),
	"age_category" varchar(20),
	"description" text,
	"role_type" varchar(20),
	"voice_tags" varchar[],
	"tags" jsonb,
	"accent" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"default_speed" numeric(3, 2) DEFAULT '1.0' NOT NULL,
	"sample_audio_url" text,
	"provider_preview_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"child_profile_id" uuid,
	"event_type" varchar(50) NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"trial_ends_at" timestamp,
	"stories_used" integer DEFAULT 0 NOT NULL,
	"audio_minutes_used" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"avatar_url" text,
	"preferred_locale" varchar(5) DEFAULT 'uk' NOT NULL,
	"mode" varchar(20) DEFAULT 'instant' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "voice_age_groups" (
	"voice_id" uuid NOT NULL,
	"age_group_id" uuid NOT NULL,
	CONSTRAINT "voice_age_groups_voice_id_age_group_id_pk" PRIMARY KEY("voice_id","age_group_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "age_groups_slug_idx" ON "age_groups" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "age_groups_sort_order_idx" ON "age_groups" ("sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_story_id_idx" ON "assets" ("story_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_scene_id_idx" ON "assets" ("scene_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_status_idx" ON "assets" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_type_idx" ON "assets" ("asset_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audio_assets_story_idx" ON "audio_assets" ("story_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audio_assets_status_idx" ON "audio_assets" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audio_assets_cache_idx" ON "audio_assets" ("text_hash","voice_id","speed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audio_assets_created_idx" ON "audio_assets" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audio_assets_scene_group_idx" ON "audio_assets" ("story_id","scene_group_index","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "characters_user_id_idx" ON "characters" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "characters_type_idx" ON "characters" ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "characters_is_active_idx" ON "characters" ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "child_profiles_user_id_idx" ON "child_profiles" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "child_profiles_birth_date_idx" ON "child_profiles" ("birth_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "child_profiles_is_active_idx" ON "child_profiles" ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "features_slug_idx" ON "features" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "features_category_idx" ON "features" ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generated_refs_story_idx" ON "generated_references" ("story_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generated_refs_character_idx" ON "generated_references" ("character_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generated_refs_char_name_idx" ON "generated_references" ("story_id","character_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_identities_provider_user_idx" ON "oauth_identities" ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_identities_user_id_idx" ON "oauth_identities" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_features_plan_id_idx" ON "plan_features" ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_features_feature_id_idx" ON "plan_features" ("feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_features_unique_idx" ON "plan_features" ("plan_id","feature_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_slug_idx" ON "plans" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plans_is_active_idx" ON "plans" ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenes_story_id_idx" ON "scenes" ("story_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenes_story_scene_idx" ON "scenes" ("story_id","scene_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scenes_unique_idx" ON "scenes" ("story_id","scene_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_idx" ON "sessions" ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stories_user_id_idx" ON "stories" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stories_child_profile_id_idx" ON "stories" ("child_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stories_language_idx" ON "stories" ("language");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stories_age_group_idx" ON "stories" ("age_group");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stories_created_at_idx" ON "stories" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stories_series_id_idx" ON "stories" ("series_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_characters_story_id_idx" ON "story_characters" ("story_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_characters_character_id_idx" ON "story_characters" ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "story_characters_unique_idx" ON "story_characters" ("story_id","character_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_requests_user_id_idx" ON "story_requests" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_requests_status_idx" ON "story_requests" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_requests_created_at_idx" ON "story_requests" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_series_user_id_idx" ON "story_series" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "story_series_created_at_idx" ON "story_series" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "translations_unique" ON "translations" ("entity_type","entity_id","locale","field_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_translations_lookup" ON "translations" ("entity_type","entity_id","locale");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_translations_entity" ON "translations" ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_translations_locale" ON "translations" ("locale");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tts_voices_provider_voice_idx" ON "tts_voices" ("provider","provider_voice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tts_voices_language_idx" ON "tts_voices" ("language");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tts_voices_active_idx" ON "tts_voices" ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_user_id_idx" ON "usage_events" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_created_at_idx" ON "usage_events" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_type_idx" ON "usage_events" ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_subscriptions_user_id_idx" ON "user_subscriptions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_subscriptions_plan_id_idx" ON "user_subscriptions" ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_subscriptions_status_idx" ON "user_subscriptions" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_subscriptions_reset_at_idx" ON "user_subscriptions" ("reset_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_age_groups_voice_id_idx" ON "voice_age_groups" ("voice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_age_groups_age_group_id_idx" ON "voice_age_groups" ("age_group_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assets" ADD CONSTRAINT "assets_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_voice_id_tts_voices_id_fk" FOREIGN KEY ("voice_id") REFERENCES "tts_voices"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "child_profiles" ADD CONSTRAINT "child_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_references" ADD CONSTRAINT "generated_references_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_references" ADD CONSTRAINT "generated_references_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_references" ADD CONSTRAINT "generated_references_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "child_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_references" ADD CONSTRAINT "generated_references_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_id_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scenario_plot_examples" ADD CONSTRAINT "scenario_plot_examples_scenario_card_id_scenario_cards_id_fk" FOREIGN KEY ("scenario_card_id") REFERENCES "scenario_cards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scenes" ADD CONSTRAINT "scenes_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stories" ADD CONSTRAINT "stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stories" ADD CONSTRAINT "stories_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "child_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stories" ADD CONSTRAINT "stories_story_request_id_story_requests_id_fk" FOREIGN KEY ("story_request_id") REFERENCES "story_requests"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stories" ADD CONSTRAINT "stories_moral_theme_story_goals_slug_fk" FOREIGN KEY ("moral_theme") REFERENCES "story_goals"("slug") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stories" ADD CONSTRAINT "stories_tone_story_tones_slug_fk" FOREIGN KEY ("tone") REFERENCES "story_tones"("slug") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stories" ADD CONSTRAINT "stories_series_id_story_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "story_series"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_characters" ADD CONSTRAINT "story_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_requests" ADD CONSTRAINT "story_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_requests" ADD CONSTRAINT "story_requests_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "child_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_requests" ADD CONSTRAINT "story_requests_goal_story_goals_slug_fk" FOREIGN KEY ("goal") REFERENCES "story_goals"("slug") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_requests" ADD CONSTRAINT "story_requests_tone_story_tones_slug_fk" FOREIGN KEY ("tone") REFERENCES "story_tones"("slug") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_requests" ADD CONSTRAINT "story_requests_scenario_card_id_scenario_cards_id_fk" FOREIGN KEY ("scenario_card_id") REFERENCES "scenario_cards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_series" ADD CONSTRAINT "story_series_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "story_series" ADD CONSTRAINT "story_series_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "child_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_child_profile_id_child_profiles_id_fk" FOREIGN KEY ("child_profile_id") REFERENCES "child_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "voice_age_groups" ADD CONSTRAINT "voice_age_groups_voice_id_tts_voices_id_fk" FOREIGN KEY ("voice_id") REFERENCES "tts_voices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "voice_age_groups" ADD CONSTRAINT "voice_age_groups_age_group_id_age_groups_id_fk" FOREIGN KEY ("age_group_id") REFERENCES "age_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
