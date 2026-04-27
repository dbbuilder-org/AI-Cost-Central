CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"platform" text,
	"phone" text,
	"notify_on_critical" boolean DEFAULT true NOT NULL,
	"notify_on_warning" boolean DEFAULT true NOT NULL,
	"notify_on_info" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_key_id" text NOT NULL,
	"provider" text NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"detail" text NOT NULL,
	"investigate_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"value" numeric(12, 6),
	"baseline" numeric(12, 6),
	"change_pct" numeric(8, 2),
	"models" text[],
	"detected_at" date NOT NULL,
	"ai_enriched" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"provider_key_id" text NOT NULL,
	"provider" text NOT NULL,
	"display_name" text,
	"purpose" text,
	"github_repos" text[] DEFAULT '{}' NOT NULL,
	"code_scan_json" jsonb,
	"code_scan_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"provider_key_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"uploaded_by" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" text NOT NULL,
	"provider" text NOT NULL,
	"display_name" text,
	"input_per_1m" numeric(12, 6) NOT NULL,
	"output_per_1m" numeric(12, 6) NOT NULL,
	"cache_read_per_1m" numeric(12, 6),
	"context_window" integer,
	"max_output_tokens" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"events" text[] DEFAULT '{}' NOT NULL,
	"secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_delivered_at" timestamp with time zone,
	"last_status_code" integer,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" text NOT NULL,
	"name" text NOT NULL,
	"service_type" text NOT NULL,
	"repo_owner" text,
	"repo_name" text,
	"branch" text,
	"url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_known" boolean DEFAULT false NOT NULL,
	"suspicious_reason" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"control_model" text NOT NULL,
	"treatment_model" text NOT NULL,
	"split_pct" integer DEFAULT 50 NOT NULL,
	"task_types" text[] DEFAULT '{}',
	"status" text DEFAULT 'active' NOT NULL,
	"winner_variant" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"concluded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "routing_config" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "callsite" text;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "cache_read_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "fallback_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "experiment_id" text;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "experiment_variant" text;--> statement-breakpoint
ALTER TABLE "key_contexts" ADD CONSTRAINT "key_contexts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_documents" ADD CONSTRAINT "key_documents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_webhooks" ADD CONSTRAINT "org_webhooks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_token_idx" ON "device_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "key_alerts_dedup_idx" ON "key_alerts" USING btree ("provider_key_id","alert_type","detected_at");--> statement-breakpoint
CREATE INDEX "key_alerts_date_idx" ON "key_alerts" USING btree ("detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "key_contexts_org_key_uniq" ON "key_contexts" USING btree ("org_id","provider_key_id");--> statement-breakpoint
CREATE INDEX "key_contexts_org_idx" ON "key_contexts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "key_documents_key_idx" ON "key_documents" USING btree ("org_id","provider_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_pricing_model_id_idx" ON "model_pricing" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "model_pricing_provider_idx" ON "model_pricing" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "org_webhooks_org_idx" ON "org_webhooks" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "render_services_service_id_idx" ON "render_services" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "render_services_known_idx" ON "render_services" USING btree ("is_known");--> statement-breakpoint
CREATE INDEX "routing_experiments_org_idx" ON "routing_experiments" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "routing_experiments_project_idx" ON "routing_experiments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "request_logs_callsite_idx" ON "request_logs" USING btree ("org_id","callsite");--> statement-breakpoint
CREATE INDEX "request_logs_experiment_idx" ON "request_logs" USING btree ("org_id","experiment_id");