CREATE TYPE "public"."group_type" AS ENUM('trip', 'home', 'couple', 'other', 'direct');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('expense', 'settlement', 'opening_balance');--> statement-breakpoint
CREATE TYPE "public"."entry_source" AS ENUM('app', 'splitwise_import', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."revision_reason" AS ENUM('edit', 'delete', 'restore', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."settlement_method" AS ENUM('cash', 'upi', 'bank', 'other');--> statement-breakpoint
CREATE TYPE "public"."split_type" AS ENUM('equal', 'exact', 'percentage', 'shares', 'adjustment', 'itemized', 'imported_net');--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" text,
	"display_name" varchar(40) NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"claim_token_hash" text,
	"claim_token_expires_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"type" "group_type" DEFAULT 'other' NOT NULL,
	"default_currency" char(3) DEFAULT 'INR' NOT NULL,
	"simplify_debts" boolean DEFAULT true NOT NULL,
	"invite_code" text NOT NULL,
	"invite_expires_at" timestamp with time zone,
	"direct_key" text,
	"created_by_user_id" text,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_currency_ck" CHECK ("groups"."default_currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"kind" "entry_kind" NOT NULL,
	"description" varchar(120) NOT NULL,
	"category" varchar(32),
	"amount" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"original_amount" bigint,
	"original_currency" char(3),
	"fx_rate" numeric(20, 10),
	"fx_date" date,
	"fx_source" text,
	"date" date NOT NULL,
	"notes" varchar(1000),
	"split_type" "split_type" NOT NULL,
	"split_input" jsonb NOT NULL,
	"settlement_method" "settlement_method",
	"created_by_member_id" uuid NOT NULL,
	"updated_by_member_id" uuid,
	"source" "entry_source" DEFAULT 'app' NOT NULL,
	"import_id" uuid,
	"import_row_hash" text,
	"recurring_rule_id" uuid,
	"recurring_period" text,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_amount_ck" CHECK ("entries"."amount" >= 0),
	CONSTRAINT "entries_currency_ck" CHECK ("entries"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "entries_settlement_method_ck" CHECK (("entries"."kind" = 'settlement') OR ("entries"."settlement_method" IS NULL)),
	CONSTRAINT "entries_version_ck" CHECK ("entries"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "entry_payers" (
	"entry_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "entry_payers_entry_id_member_id_pk" PRIMARY KEY("entry_id","member_id"),
	CONSTRAINT "entry_payers_amount_ck" CHECK ("entry_payers"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "entry_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"entry_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" "revision_reason" NOT NULL,
	"actor_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_shares" (
	"entry_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "entry_shares_entry_id_member_id_pk" PRIMARY KEY("entry_id","member_id"),
	CONSTRAINT "entry_shares_amount_ck" CHECK ("entry_shares"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"actor_member_id" uuid,
	"kind" varchar(32) NOT NULL,
	"entry_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"author_member_id" uuid NOT NULL,
	"body" varchar(1000) NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_created_by_member_id_group_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_updated_by_member_id_group_members_id_fk" FOREIGN KEY ("updated_by_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_deleted_by_member_id_group_members_id_fk" FOREIGN KEY ("deleted_by_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_payers" ADD CONSTRAINT "entry_payers_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_payers" ADD CONSTRAINT "entry_payers_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD CONSTRAINT "entry_revisions_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD CONSTRAINT "entry_revisions_actor_member_id_group_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_shares" ADD CONSTRAINT "entry_shares_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_shares" ADD CONSTRAINT "entry_shares_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_member_id_group_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_member_id_group_members_id_fk" FOREIGN KEY ("author_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_members_group_idx" ON "group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_members_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_active_user_uq" ON "group_members" USING btree ("group_id","user_id") WHERE "group_members"."user_id" IS NOT NULL AND "group_members"."removed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_claim_token_uq" ON "group_members" USING btree ("claim_token_hash") WHERE "group_members"."claim_token_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "groups_invite_code_uq" ON "groups" USING btree ("invite_code");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_direct_key_uq" ON "groups" USING btree ("direct_key") WHERE "groups"."direct_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entries_group_live_date_idx" ON "entries" USING btree ("group_id","deleted_at","date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entries_group_creator_idx" ON "entries" USING btree ("group_id","created_by_member_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "entries_import_row_uq" ON "entries" USING btree ("group_id","import_row_hash") WHERE "entries"."import_row_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "entries_recurring_period_uq" ON "entries" USING btree ("recurring_rule_id","recurring_period") WHERE "entries"."recurring_rule_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entry_payers_member_idx" ON "entry_payers" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_revisions_entry_version_uq" ON "entry_revisions" USING btree ("entry_id","version");--> statement-breakpoint
CREATE INDEX "entry_shares_member_idx" ON "entry_shares" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "activity_group_idx" ON "activity" USING btree ("group_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_entry_idx" ON "comments" USING btree ("entry_id","created_at");