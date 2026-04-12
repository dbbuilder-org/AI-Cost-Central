# SmartRouter — Vision Document

## The Problem

Every app using LLMs today makes the same mistake: hard-coding a single model (usually a frontier model) for every call, regardless of whether the task needs it. The result is:

- A job-scoring call that needs structured extraction (`gpt-4.1-nano` = $0.10/1M) runs on `gpt-4o` ($2.50/1M) — 25× overspend
- A cover letter draft (justifiably frontier) shares the same model config as a keyword extraction call
- Nobody has visibility into which code files are responsible for which spend until the bill arrives
- Switching models requires code changes, deploys, and re-testing across every call site

**OpenRouter** and **LiteLLM** solve the multi-provider proxy problem but don't solve smart routing: they route by model name, not by task. They don't analyze what the prompt is actually doing and route accordingly.

## The Vision

**AICostCentral SmartRouter** is a drop-in replacement for the OpenAI SDK endpoint that:

1. **Accepts any OpenAI-compatible call** — no SDK changes required, just change the `base_url`
2. **Classifies the task** from the prompt (extraction, classification, generation, coding, reasoning, embedding)
3. **Selects the optimal model** based on task class + quality requirement + current pricing + project budget rules
4. **Routes to the cheapest provider** that meets the quality bar — across OpenAI, Anthropic, Google, Groq, Mistral
5. **Logs every decision** — what was requested, what was used, why, how much was saved
6. **Surfaces savings** in the dashboard with drill-down to the code file that made the call
7. **Lets admins set routing rules** at the project → API key → repo level

## Positioning

```
Your App / SDK
      ↓
  SmartRouter API  ← we are here
  (OpenAI-compatible)
      ↓              ↓              ↓              ↓
  OpenAI         Anthropic      Google         Groq / Mistral
```

vs. today:
```
Your App / SDK
      ↓
  OpenAI API  ← everyone is stuck here
```

vs. OpenRouter/LiteLLM:
```
Your App / SDK
      ↓
  OpenRouter / LiteLLM  ← routes by model name, not task
      ↓
  Multiple providers
```

## Core Differentiators

| Feature | OpenAI Direct | OpenRouter | LiteLLM | SmartRouter |
|---------|--------------|-----------|---------|------------|
| Drop-in OpenAI compatible | ✓ | ✓ | ✓ | ✓ |
| Multi-provider | ✗ | ✓ | ✓ | ✓ |
| Task-aware routing | ✗ | ✗ | partial | ✓ |
| Per-project routing rules | ✗ | ✗ | manual | ✓ |
| Live cost optimization | ✗ | pricing only | ✗ | ✓ |
| Code-level attribution | ✗ | ✗ | ✗ | ✓ |
| Dashboard + recommendations | ✗ | basic | ✗ | ✓ |
| BYOK (your provider keys) | n/a | ✓ | ✓ | ✓ |
| Quality guardrails | ✗ | ✗ | ✗ | ✓ |

## Business Model Options

1. **SaaS hosted** — we hold provider keys, charge markup (e.g. 5% of spend) + platform fee
2. **BYOK** — user brings their own provider keys, we charge per-request routing fee (~$0.0001/req)
3. **Self-hosted** — open-source router, monetize dashboard + support
4. **Hybrid** — BYOK for data privacy, hosted for convenience

Phase 1: BYOK only (no key custody risk, fastest to market)
