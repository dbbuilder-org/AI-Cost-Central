/**
 * Drizzle ORM schema for AICostCentral SaaS
 * All tables include org_id for multi-tenant isolation.
 * Every query MUST filter by org_id from Clerk auth().
 */

import {
  pgTable,
  text,
  uuid,
  boolean,
  integer,
  bigint,
  numeric,
  timestamp,
  jsonb,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Organizations ─────────────────────────────────────────────────────────────
// PK is the Clerk org ID string — eliminates join on every auth check.

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),                         // Clerk org ID (org_xxxx)
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  plan: text("plan").notNull().default("free"),        // free|growth|business|enterprise
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  subscriptionStatus: text("subscription_status").default("inactive"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  encryptedDek: text("encrypted_dek").notNull(),       // AES-256-GCM(DEK, MASTER_KEY)
  settings: jsonb("settings").default({}),
  onboarded: boolean("onboarded").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("organizations_slug_idx").on(t.slug),
]);

// ── Org Members ───────────────────────────────────────────────────────────────

export const orgMembers = pgTable("org_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").notNull(),        // user_xxxx from Clerk
  email: text("email").notNull(),
  fullName: text("full_name"),
  role: text("role").notNull().default("viewer"),      // owner|admin|viewer
  status: text("status").notNull().default("active"),  // active|deactivated
  invitedBy: uuid("invited_by"),                       // References orgMembers.id
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("org_members_org_user_idx").on(t.orgId, t.clerkUserId),
]);

// ── Divisions ─────────────────────────────────────────────────────────────────

export const divisions = pgTable("divisions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  parentId: uuid("parent_id"),                         // Self-ref for nested teams
  budgetUsd: numeric("budget_usd", { precision: 12, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── API Keys ──────────────────────────────────────────────────────────────────

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  divisionId: uuid("division_id").references(() => divisions.id),
  provider: text("provider").notNull(),                // openai|anthropic|google
  keyType: text("key_type").notNull().default("admin"),// admin|project
  displayName: text("display_name").notNull(),
  encryptedValue: text("encrypted_value").notNull(),   // AES-256-GCM(plaintext, DEK)
  hint: text("hint"),                                  // Last 4 chars for identification
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  tags: text("tags").array().default(sql`'{}'`),
  budgetUsd: numeric("budget_usd", { precision: 12, scale: 4 }),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  lastTestOk: boolean("last_test_ok"),
  createdBy: uuid("created_by"),                       // References orgMembers.id
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("api_keys_org_idx").on(t.orgId),
  index("api_keys_org_provider_idx").on(t.orgId, t.provider),
]);

// ── Projects ──────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  divisionId: uuid("division_id").references(() => divisions.id),
  name: text("name").notNull(),
  description: text("description"),
  tags: text("tags").array().default(sql`'{}'`),
  budgetUsd: numeric("budget_usd", { precision: 12, scale: 4 }),
  color: text("color"),                                // Hex color for UI
  // SmartRouter per-project routing rules (qualityTier, allowedProviders, taskOverrides, budgets)
  routingConfig: jsonb("routing_config").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("projects_org_idx").on(t.orgId),
]);

// ── API Key ↔ Project (many-to-many) ─────────────────────────────────────────

export const apiKeyProjects = pgTable("api_key_projects", {
  apiKeyId: uuid("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
}, (t) => [
  uniqueIndex("api_key_projects_pk").on(t.apiKeyId, t.projectId),
]);

// ── Usage Rows ────────────────────────────────────────────────────────────────
// Persistent usage cache replacing Vercel KV.
// UNIQUE on (org_id, provider, provider_key_id, model, date) → idempotent upserts.

export const usageRows = pgTable("usage_rows", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  providerKeyId: text("provider_key_id").notNull(),    // Provider's own key ID string
  model: text("model").notNull(),
  date: date("date").notNull(),
  inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
  outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
  requests: integer("requests").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("usage_rows_unique_idx").on(t.orgId, t.provider, t.providerKeyId, t.model, t.date),
  index("usage_rows_org_date_idx").on(t.orgId, t.date),
  index("usage_rows_org_key_idx").on(t.orgId, t.apiKeyId),
]);

// ── Annotations ───────────────────────────────────────────────────────────────

export const annotations = pgTable("annotations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),           // api_key|project|division|usage_date
  entityId: text("entity_id").notNull(),               // UUID or date string
  authorId: uuid("author_id"),                         // References orgMembers.id
  content: text("content").notNull(),
  tags: text("tags").array().default(sql`'{}'`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("annotations_entity_idx").on(t.orgId, t.entityType, t.entityId),
]);

// ── Key Contexts ──────────────────────────────────────────────────────────────
// Annotation layer for API keys discovered in usage data.
// Keyed by provider key ID (e.g. key_CW8AeuAYr8nLSmK3) so it works whether
// or not the encrypted key is stored in apiKeys table.

export const keyContexts = pgTable("key_contexts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  providerKeyId: text("provider_key_id").notNull(),     // provider's own key ID
  provider: text("provider").notNull(),                  // openai|anthropic|google
  displayName: text("display_name"),                     // human alias (overrides provider name)
  purpose: text("purpose"),                              // what is this key used for?
  githubRepos: text("github_repos").array().default(sql`'{}'`).notNull(),
  codeScanJson: jsonb("code_scan_json"),                 // cached CodeScanSummary (from lib/codeScanning)
  codeScanAt: timestamp("code_scan_at", { withTimezone: true }), // when last scan ran
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("key_contexts_org_key_uniq").on(t.orgId, t.providerKeyId),
  index("key_contexts_org_idx").on(t.orgId),
]);

export const keyDocuments = pgTable("key_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  providerKeyId: text("provider_key_id").notNull(),
  blobUrl: text("blob_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  uploadedBy: text("uploaded_by"),                       // Clerk user ID
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("key_documents_key_idx").on(t.orgId, t.providerKeyId),
]);

// ── Key Alerts (persisted enriched anomaly results) ───────────────────────────
// One row per (providerKeyId, alertType, detectedAt) — unique index prevents
// duplicate analysis on re-runs. The cron checks this table first; if today's
// alerts already exist it skips the expensive GitHub scan + Claude enrichment.

export const keyAlerts = pgTable("key_alerts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  providerKeyId: text("provider_key_id").notNull(),
  provider: text("provider").notNull(),
  alertType: text("alert_type").notNull(),               // cost_spike|cost_drop|volume_spike|key_model_shift|new_key
  severity: text("severity").notNull(),                  // critical|warning|info
  subject: text("subject").notNull(),                    // key display name used in alert
  message: text("message").notNull(),                    // raw detection message
  detail: text("detail").notNull(),                      // AI-enriched explanation
  investigateSteps: jsonb("investigate_steps").notNull().default(sql`'[]'::jsonb`),
  value: numeric("value", { precision: 12, scale: 6 }),
  baseline: numeric("baseline", { precision: 12, scale: 6 }),
  changePct: numeric("change_pct", { precision: 8, scale: 2 }),
  models: text("models").array(),
  detectedAt: date("detected_at").notNull(),
  aiEnriched: boolean("ai_enriched").notNull().default(false),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("key_alerts_dedup_idx").on(t.providerKeyId, t.alertType, t.detectedAt),
  index("key_alerts_date_idx").on(t.detectedAt),
]);

// ── Device Tokens (Expo push + SMS) ──────────────────────────────────────────
// One row per registered mobile device. No FK to orgs — single-tenant app.

export const deviceTokens = pgTable("device_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull(),           // Expo push token (ExponentPushToken[...])
  platform: text("platform"),              // ios|android
  phone: text("phone"),                    // optional E.164, for Twilio SMS
  notifyOnCritical: boolean("notify_on_critical").notNull().default(true),
  notifyOnWarning: boolean("notify_on_warning").notNull().default(true),
  notifyOnInfo: boolean("notify_on_info").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("device_tokens_token_idx").on(t.token),
]);

// ── Invitations ───────────────────────────────────────────────────────────────

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("viewer"),
  invitedBy: uuid("invited_by"),                       // References orgMembers.id
  clerkInvitationId: text("clerk_invitation_id"),
  status: text("status").notNull().default("pending"), // pending|accepted|expired
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
    .default(sql`NOW() + INTERVAL '7 days'`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("invitations_org_email_idx").on(t.orgId, t.email),
]);

// ── Audit Log ─────────────────────────────────────────────────────────────────

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull(),
  actorId: uuid("actor_id"),                           // References orgMembers.id
  action: text("action").notNull(),                    // key.created|member.invited|etc.
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  metadata: jsonb("metadata").default({}),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_log_org_created_idx").on(t.orgId, t.createdAt),
]);

// ── SmartRouter Request Logs ──────────────────────────────────────────────────
// One row per proxied request. Tracks actual model used, tokens, cost, savings.
// Fire-and-forget insert from the SmartRouter proxy — never blocks the response.
// Retention policy: keep 90 days (enforced by a periodic cron, not DB trigger).

export const requestLogs = pgTable("request_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull(),                       // Clerk org ID (no FK — avoids join cost on hot path)
  projectId: text("project_id").notNull(),               // SmartRouter project ID
  modelRequested: text("model_requested").notNull(),      // Model the caller asked for
  modelUsed: text("model_used").notNull(),                // Model actually forwarded to
  providerUsed: text("provider_used").notNull(),          // openai|anthropic|google|groq|mistral
  taskType: text("task_type").notNull(),                  // chat|coding|reasoning|extraction|…
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 8 }).notNull().default("0"),
  savingsUsd: numeric("savings_usd", { precision: 12, scale: 8 }).notNull().default("0"),
  latencyMs: integer("latency_ms").notNull().default(0),
  success: boolean("success").notNull().default(true),
  errorCode: text("error_code"),
  // Optional: file:line from X-Source-File header sent by the app (Phase 3 attribution)
  callsite: text("callsite"),
  // Phase 5: prompt caching + fallback tracking
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0), // Anthropic cache_read_input_tokens
  fallbackCount: integer("fallback_count").notNull().default(0),      // how many providers were tried before success
  // Phase 5: A/B experiment reference
  experimentId: text("experiment_id"),        // null if not part of an experiment
  experimentVariant: text("experiment_variant"), // "control" | "treatment"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("request_logs_org_created_idx").on(t.orgId, t.createdAt),
  index("request_logs_org_model_idx").on(t.orgId, t.modelUsed),
  index("request_logs_callsite_idx").on(t.orgId, t.callsite),
  index("request_logs_experiment_idx").on(t.orgId, t.experimentId),
]);

// ── Routing Experiments (A/B testing) ─────────────────────────────────────────
// Per-project A/B experiments: split traffic between two model configs.

export const routingExperiments = pgTable("routing_experiments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  // Control = current routing config; Treatment = alternate model/tier
  controlModel: text("control_model").notNull(),           // modelId or tier alias
  treatmentModel: text("treatment_model").notNull(),
  splitPct: integer("split_pct").notNull().default(50),    // % traffic → treatment (0–100)
  taskTypes: text("task_types").array().default(sql`'{}'`), // empty = all task types
  status: text("status").notNull().default("active"),      // active|paused|concluded
  winnerVariant: text("winner_variant"),                   // null until concluded
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  concludedAt: timestamp("concluded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("routing_experiments_org_idx").on(t.orgId, t.status),
  index("routing_experiments_project_idx").on(t.projectId),
]);

// ── Typed jsonb shapes ────────────────────────────────────────────────────────

import type { QualityTier, TaskType, ProviderName } from "@/types/router";

export interface ProjectRoutingConfig {
  qualityTier?: QualityTier;                             // default: "balanced"
  autoRoute?: boolean;                                   // default: true
  allowedProviders?: ProviderName[];                     // empty = all
  taskOverrides?: Partial<Record<TaskType, string>>;     // taskType → modelId
  dailyBudgetUsd?: number | null;                        // null = no limit
  monthlyBudgetUsd?: number | null;
  budgetAction?: "block" | "downgrade";                  // default: "downgrade"
  // Phase 5: advanced routing
  fallbackProviders?: ProviderName[];                    // ordered fallback chain on 429/5xx
  promptCaching?: boolean;                               // inject cache_control for Anthropic (default: true)
  latencyWeight?: number;                                // 0–1; how much to weight latency vs cost (default: 0)
  abExperimentId?: string | null;                        // active A/B experiment for this project
  // Phase 6: custom / private endpoints
  customEndpointUrl?: string;                            // self-hosted Ollama/vLLM/Azure endpoint
  customEndpointApiKey?: string;                         // bearer key for custom endpoint (stored encrypted)
  openrouterReferer?: string;                            // HTTP-Referer passed to OpenRouter-compat endpoints
}

// ── Model Pricing (live, updated by cron every 6h) ───────────────────────────
// Seeded from LiteLLM OSS pricing JSON + provider APIs.
// Routing engine prefers DB pricing over hardcoded catalog.

export const modelPricing = pgTable("model_pricing", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  modelId: text("model_id").notNull(),                   // e.g. "gpt-4o", "claude-sonnet-4-6"
  provider: text("provider").notNull(),                  // openai|anthropic|google|groq|mistral
  displayName: text("display_name"),
  inputPer1M: numeric("input_per_1m", { precision: 12, scale: 6 }).notNull(),
  outputPer1M: numeric("output_per_1m", { precision: 12, scale: 6 }).notNull(),
  cacheReadPer1M: numeric("cache_read_per_1m", { precision: 12, scale: 6 }),
  contextWindow: integer("context_window"),
  maxOutputTokens: integer("max_output_tokens"),
  source: text("source").notNull().default("manual"),   // manual|litellm|provider_api
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("model_pricing_model_id_idx").on(t.modelId),
  index("model_pricing_provider_idx").on(t.provider),
]);

// ── Org Webhooks ──────────────────────────────────────────────────────────────
// Per-org HTTP endpoints that receive event payloads.
// Supported events: alert.fired, budget.exceeded, model.price_changed

export const orgWebhooks = pgTable("org_webhooks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  description: text("description"),
  events: text("events").array().notNull().default(sql`'{}'`), // ["alert.fired","budget.exceeded"]
  secret: text("secret"),                              // HMAC-SHA256 signing secret
  isActive: boolean("is_active").notNull().default(true),
  lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
  lastStatusCode: integer("last_status_code"),
  failureCount: integer("failure_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("org_webhooks_org_idx").on(t.orgId),
]);

// ── Type exports ──────────────────────────────────────────────────────────────

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrgMember = typeof orgMembers.$inferSelect;
export type NewOrgMember = typeof orgMembers.$inferInsert;
export type Division = typeof divisions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type UsageRow = typeof usageRows.$inferSelect;
export type Annotation = typeof annotations.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type RequestLog = typeof requestLogs.$inferSelect;
export type NewRequestLog = typeof requestLogs.$inferInsert;
export type ModelPricing = typeof modelPricing.$inferSelect;
export type OrgWebhook = typeof orgWebhooks.$inferSelect;
export type RoutingExperiment = typeof routingExperiments.$inferSelect;
export type NewRoutingExperiment = typeof routingExperiments.$inferInsert;
export type DeviceToken = typeof deviceTokens.$inferSelect;
export type NewDeviceToken = typeof deviceTokens.$inferInsert;
