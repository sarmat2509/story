CREATE TABLE IF NOT EXISTS "discount_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(32) NOT NULL,
  "kind" varchar(20) NOT NULL,
  "percent_off" integer NOT NULL,
  "duration_months" integer,
  "plan_id" uuid,
  "bundle_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "stripe_coupon_id" varchar(255),
  "stripe_coupon_fingerprint" varchar(128),
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "discount_codes_code_unique" UNIQUE("code"),
  CONSTRAINT "discount_codes_kind_check" CHECK ("kind" IN ('subscription', 'bundle')),
  CONSTRAINT "discount_codes_percent_check" CHECK ("percent_off" BETWEEN 1 AND 100),
  CONSTRAINT "discount_codes_duration_check" CHECK (
    ("kind" = 'subscription' AND ("duration_months" IS NULL OR "duration_months" > 0))
    OR ("kind" = 'bundle' AND "duration_months" IS NULL)
  ),
  CONSTRAINT "discount_codes_scope_check" CHECK (
    ("kind" = 'subscription' AND "bundle_id" IS NULL)
    OR ("kind" = 'bundle' AND "plan_id" IS NULL)
  )
);

DO $$ BEGIN
  ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_plan_id_plans_id_fk"
    FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_bundle_id_story_bundles_id_fk"
    FOREIGN KEY ("bundle_id") REFERENCES "public"."story_bundles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "discount_codes_code_uidx" ON "discount_codes" USING btree ("code");
CREATE INDEX IF NOT EXISTS "discount_codes_kind_active_idx" ON "discount_codes" USING btree ("kind", "is_active");
CREATE INDEX IF NOT EXISTS "discount_codes_plan_id_idx" ON "discount_codes" USING btree ("plan_id");
CREATE INDEX IF NOT EXISTS "discount_codes_bundle_id_idx" ON "discount_codes" USING btree ("bundle_id");

CREATE TABLE IF NOT EXISTS "discount_code_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "discount_code_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "notification_sent_at" timestamp with time zone,
  "notification_attempts" integer DEFAULT 0 NOT NULL,
  "last_notification_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "discount_code_assignments" ADD CONSTRAINT "discount_code_assignments_discount_code_id_fk"
    FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "discount_code_assignments" ADD CONSTRAINT "discount_code_assignments_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "discount_code_assignments_code_user_uidx"
  ON "discount_code_assignments" USING btree ("discount_code_id", "user_id");
CREATE INDEX IF NOT EXISTS "discount_code_assignments_user_id_idx"
  ON "discount_code_assignments" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "discount_code_assignments_notification_idx"
  ON "discount_code_assignments" USING btree ("notification_sent_at", "notification_attempts");

CREATE TABLE IF NOT EXISTS "discount_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "discount_code_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "kind" varchar(20) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "plan_id" uuid,
  "bundle_id" uuid,
  "checkout_session_id" varchar(255),
  "stripe_subscription_id" varchar(255),
  "percent_off_snapshot" integer NOT NULL,
  "duration_months_snapshot" integer,
  "original_amount_minor" integer NOT NULL,
  "discounted_amount_minor" integer NOT NULL,
  "pricing_currency" varchar(3) NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "discount_applications_checkout_session_unique" UNIQUE("checkout_session_id"),
  CONSTRAINT "discount_applications_kind_check" CHECK ("kind" IN ('subscription', 'bundle')),
  CONSTRAINT "discount_applications_status_check" CHECK ("status" IN ('pending', 'active', 'completed', 'expired', 'canceled')),
  CONSTRAINT "discount_applications_amounts_check" CHECK (
    "original_amount_minor" >= 0 AND "discounted_amount_minor" >= 0
    AND "discounted_amount_minor" <= "original_amount_minor"
  )
);

DO $$ BEGIN
  ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_discount_code_id_fk"
    FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_plan_id_fk"
    FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "discount_applications" ADD CONSTRAINT "discount_applications_bundle_id_fk"
    FOREIGN KEY ("bundle_id") REFERENCES "public"."story_bundles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "discount_applications_user_status_idx"
  ON "discount_applications" USING btree ("user_id", "kind", "status");
CREATE INDEX IF NOT EXISTS "discount_applications_subscription_idx"
  ON "discount_applications" USING btree ("stripe_subscription_id");
CREATE INDEX IF NOT EXISTS "discount_applications_ends_at_idx"
  ON "discount_applications" USING btree ("ends_at");

CREATE TABLE IF NOT EXISTS "billing_reminder_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "subscription_id" uuid NOT NULL,
  "kind" varchar(40) NOT NULL,
  "reference_at" timestamp with time zone NOT NULL,
  "status" varchar(20) DEFAULT 'sending' NOT NULL,
  "attempts" integer DEFAULT 1 NOT NULL,
  "last_error" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "billing_reminder_deliveries_status_check" CHECK ("status" IN ('sending', 'sent', 'failed'))
);

DO $$ BEGIN
  ALTER TABLE "billing_reminder_deliveries" ADD CONSTRAINT "billing_reminder_deliveries_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "billing_reminder_deliveries" ADD CONSTRAINT "billing_reminder_deliveries_subscription_id_fk"
    FOREIGN KEY ("subscription_id") REFERENCES "public"."user_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "billing_reminder_deliveries_event_uidx"
  ON "billing_reminder_deliveries" USING btree ("user_id", "kind", "reference_at");
CREATE INDEX IF NOT EXISTS "billing_reminder_deliveries_status_idx"
  ON "billing_reminder_deliveries" USING btree ("status", "reference_at");
