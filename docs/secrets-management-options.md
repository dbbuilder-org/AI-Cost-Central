# Secrets Management — Options & Trade-offs

**Current choice: Doppler** (as of Apr 2026)  
**Decision owner:** Chris Therriault  
**Review trigger:** breach, compliance requirement, or >$200/mo Doppler cost

---

## Why we moved off Vercel-only env vars

Vercel stores encrypted env vars, but Vercel holds the encryption key. Any compromise of Vercel's infrastructure (or our account, which was exposed in the Apr 2026 Lumma Stealer incident) means all secrets are readable. Sensitive Vercel vars are write-only in the UI but not cryptographically isolated from Vercel's own systems.

We needed a layer where **we** control the key hierarchy, or at minimum where the secrets vault is a separate blast radius from our deployment platform.

---

## Current setup: Doppler

**Project:** `aicostcentral` | **Workspace:** DBBuilder  
**Dashboard:** https://dashboard.doppler.com/workplace/ccb88e1af6d037d1be9a/projects/aicostcentral

### How it works

```
Doppler (prd config)
    ↓  Vercel integration (sync on change)
Vercel env vars (populated by Doppler, not hand-entered)
    ↓  injected at build/runtime
Next.js on Vercel
```

Doppler syncs secrets into Vercel automatically whenever a secret changes. Vercel sees the values but Doppler is the authoritative source and audit trail.

### Strengths
- Vercel-native integration (one-click setup)
- Audit log: who changed what, when, from which IP
- Per-environment configs (dev/stg/prd) with inheritance
- Doppler CLI works locally: `doppler run -- next dev` injects all secrets
- Secret rotation: change in Doppler → Vercel redeployment triggers automatically
- Team access controls (who can read vs. write each config)

### Weaknesses
- Doppler is still a third-party SaaS — their breach = our secrets exposed
- No hardware-backed key storage (unlike HSM/Vault)
- Cannot restrict secret access by IP or device (only by user/token)
- $10–29/mo per team member after free tier
- Doppler still injects values into Vercel at build time — Vercel temporarily holds the value

### Configuration
```bash
# Local dev — run any command with secrets injected
doppler run -- npx tsx scripts/rotate-master-key.ts

# Check current prd secrets
doppler secrets --project aicostcentral --config prd --only-names

# Update a secret
doppler secrets set MY_SECRET="new-value" --project aicostcentral --config prd

# Pull to local .env (for debugging only — never commit)
doppler secrets download --project aicostcentral --config dev --format env --no-file > .env.local
```

### Vercel integration setup (one-time)
1. Go to https://dashboard.doppler.com/workplace/ccb88e1af6d037d1be9a/projects/aicostcentral/integrations
2. Add integration → Vercel → select `ai-cost-central` project → map `prd` → `Production`
3. Doppler will sync all secrets and trigger a redeploy

---

## Alternatives evaluated

### Option B: Infisical (recommended upgrade path)

**What it is:** Open-source Doppler alternative. Can be self-hosted.  
**Why it's better than Doppler for our threat model:**

- **End-to-end encrypted** — even Infisical's cloud servers cannot read your secrets (client-side encryption with zero-knowledge architecture)
- **Self-hostable** — run on a $6/mo Fly.io instance; no third-party trust required
- **Open-source** — you can audit every line of code that touches your secrets
- **Same UX as Doppler** — CLI, Vercel integration, per-environment configs

**When to switch:** If we ever need SOC 2 / HIPAA compliance (Infisical has audit certs), or if Doppler has a breach, or if the cost exceeds ~$50/mo.

```bash
# Self-host on Fly.io
fly launch --image infisical/infisical:latest
```

**Cost:** Free (self-hosted) or $6/user/mo cloud  
**Migration from Doppler:** `doppler secrets download --format json | infisical import` (one command)

---

### Option C: HashiCorp Vault

**What it is:** The gold standard for enterprise secrets management. Dynamic secrets, HSM support, PKI, SSH cert authority.  
**Key differentiator:** Secrets are *generated on demand* and expire. An OpenAI API key isn't stored — instead Vault generates a short-lived credential that expires after the lease TTL. Nothing to steal at rest.

**Why we'd use it:**  
- We're handling customer API keys (we become a secrets vault ourselves)
- We need secrets that rotate automatically without touching code
- Compliance requires secrets never stored outside HSM

**Why we're not using it now:**  
- Operational overhead is significant (HA cluster, unsealing, lease management)
- AICostCentral doesn't yet have the customer volume that justifies the ops cost
- For our own keys (not customer keys), Infisical provides 90% of the benefit at 5% of the ops cost

**Cost:** Free OSS / $0.03 per secret/mo HCP Vault  
**Setup time:** 1–2 days for a proper HA deployment

---

### Option D: AWS Secrets Manager

**What it is:** AWS-native, tightly integrated with IAM. Automatic rotation for RDS, Redshift, DocumentDB built-in.

**Why it fits:** If we move our database to RDS (Aurora Serverless), AWS Secrets Manager rotates the DB password automatically — zero config. Lambda/ECS natively pull secrets via IAM role — no API key needed to access the vault.

**Why it doesn't fit now:**  
- We're on Neon (PostgreSQL serverless), not RDS — the built-in rotation doesn't apply
- We're on Vercel, not AWS — the IAM role-based access doesn't apply at the compute layer
- Adds an AWS account dependency when we're otherwise GCP/Vercel

**Cost:** $0.40/secret/mo + $0.05 per 10K API calls  
**When to switch:** If we ever move compute to AWS (ECS/Lambda) or database to RDS

---

### Option E: 1Password Secrets Automation

**What it is:** Team password manager with a developer-facing secrets injection layer.

**Strengths:** Good for teams that already use 1Password for shared credentials. Audit trail. Works with Vercel.

**Weaknesses:** UI-first (not dev-native), more expensive ($8/user/mo), not as CI/CD-friendly as Doppler/Infisical. Secret references in code feel bolted-on.

**When to use:** Primarily for human-facing credentials (dashboard logins, shared accounts) rather than programmatic API keys. Fine as a complement to Doppler — use 1Password for team secrets, Doppler for app secrets.

---

## Migration path

```
Current state           →   6-month target           →   12-month target
─────────────────────       ──────────────────────       ──────────────────────
Vercel env vars             Doppler → Vercel sync        Infisical (self-hosted)
  (breach risk: high)         (breach risk: medium)        (breach risk: low)
                                                           + customer key vault
                                                             in DB stays as-is
                                                             (envelope encryption)
```

The envelope encryption we already have (MASTER_ENCRYPTION_KEY → per-org DEK → encrypted API key values) is correct for customer keys — nothing in this document changes that. These options are for *our own operational secrets* (database URL, admin API keys, Clerk keys, etc.).

---

## What to do right now

1. **Populate Doppler prd secrets** — replace all `CHANGEME` placeholders with real values from Vercel dashboard or credentials.md
2. **Connect Doppler → Vercel integration** — https://dashboard.doppler.com/workplace/ccb88e1af6d037d1be9a/projects/aicostcentral/integrations
3. **Remove sensitive secrets from Vercel** — once Doppler sync is live, delete the Vercel-native copies so Doppler is the single source
4. **Add `doppler run --` to local dev scripts** — so developers never need .env files
