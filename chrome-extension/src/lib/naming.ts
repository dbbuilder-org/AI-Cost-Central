export interface ValidationResult {
  valid: boolean;
  score: number; // 0-100
  violations: string[];
  suggestion: string;
  matchedTokens: string[];
}

const VALID_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "claude",
  "gpt",
  "gemini",
  "ai",
];
const VALID_ENVS = [
  "prod",
  "production",
  "staging",
  "dev",
  "development",
  "test",
  "qa",
];
const GENERIC_WORDS = ["key", "api", "secret", "temp", "token", "sk"];

/**
 * Parse a naming template into an ordered list of token names.
 * E.g. "{project}-{provider}-{YYYY-MM}" → ["project", "provider", "YYYY-MM"]
 */
export function parseTemplate(template: string): string[] {
  const matches = template.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

/**
 * Split a key name into segments using common separators (-, _, /, .).
 */
function splitSegments(name: string): string[] {
  return name.split(/[-_/.]+/).filter((s) => s.length > 0);
}

/**
 * Validate a token value against its token type.
 * Returns true if valid.
 */
function validateToken(tokenName: string, value: string): boolean {
  const lower = value.toLowerCase();
  switch (tokenName) {
    case "project":
      return /^[a-zA-Z0-9-]{2,}$/.test(value);
    case "provider":
      return VALID_PROVIDERS.includes(lower);
    case "YYYY": {
      const year = parseInt(value, 10);
      return /^\d{4}$/.test(value) && year >= 2024 && year <= 2030;
    }
    case "MM": {
      const month = parseInt(value, 10);
      return /^\d{2}$/.test(value) && month >= 1 && month <= 12;
    }
    case "YYYY-MM":
      // This token may consume two segments separated by a dash
      return /^\d{4}-\d{2}$/.test(value) ||
        /^\d{4}$/.test(value) // will be combined with next segment
        ? false
        : false; // handled specially
    case "env":
      return VALID_ENVS.includes(lower);
    case "team":
      return /^[a-zA-Z0-9-]{1,}$/.test(value);
    default:
      return value.length > 0;
  }
}

/**
 * Human-readable description for a token.
 */
function tokenDescription(tokenName: string): string {
  switch (tokenName) {
    case "project":
      return "project name (min 2 chars, alphanumeric/hyphens)";
    case "provider":
      return `provider (one of: ${VALID_PROVIDERS.join(", ")})`;
    case "YYYY":
      return "4-digit year (2024-2030)";
    case "MM":
      return "2-digit month (01-12)";
    case "YYYY-MM":
      return "year-month like 2026-04";
    case "env":
      return `environment (one of: ${VALID_ENVS.join(", ")})`;
    case "team":
      return "team name (alphanumeric/hyphens)";
    default:
      return tokenName;
  }
}

/**
 * Validate a key name against a naming template.
 */
export function validateKeyName(
  keyName: string,
  template: string
): ValidationResult {
  const violations: string[] = [];
  const matchedTokens: string[] = [];

  if (!keyName || keyName.trim().length === 0) {
    return {
      valid: false,
      score: 0,
      violations: ["Key name cannot be empty"],
      suggestion: generateSuggestion(template),
      matchedTokens: [],
    };
  }

  const tokens = parseTemplate(template);

  if (tokens.length === 0) {
    // No tokens in template — any non-empty name passes
    return {
      valid: true,
      score: 100,
      violations: [],
      suggestion: keyName,
      matchedTokens: [],
    };
  }

  // Special handling: detect YYYY-MM token and handle it as a compound token
  // Strategy: expand template to individual segments by splitting on separators,
  // then try to match key name segments to token slots.

  // Build an expanded token list where YYYY-MM becomes ["YYYY", "MM"] internally
  // but we track the original token for reporting.
  interface TokenSlot {
    original: string; // original token name e.g. "YYYY-MM"
    pattern: string; // what to match against e.g. "YYYY-MM" full or partial
    compound?: boolean;
  }

  const tokenSlots: TokenSlot[] = [];
  for (const t of tokens) {
    tokenSlots.push({ original: t, pattern: t });
  }

  // Split the key name on all separators
  const segments = splitSegments(keyName);

  // Now try to match segments to token slots.
  // YYYY-MM is special: it matches "2026-04" as a single dash-joined segment pair,
  // but since we split on dashes, it may come in as two segments: "2026" and "04".
  // We need to handle both cases.

  let segIdx = 0;
  let matched = 0;

  for (let tIdx = 0; tIdx < tokenSlots.length; tIdx++) {
    const slot = tokenSlots[tIdx];

    if (slot.original === "YYYY-MM") {
      // Try to match two consecutive segments as YYYY and MM
      const seg1 = segments[segIdx];
      const seg2 = segments[segIdx + 1];

      if (seg1 !== undefined && seg2 !== undefined) {
        const combined = `${seg1}-${seg2}`;
        if (/^\d{4}-\d{2}$/.test(combined)) {
          const year = parseInt(seg1, 10);
          const month = parseInt(seg2, 10);
          if (year >= 2024 && year <= 2030 && month >= 1 && month <= 12) {
            matchedTokens.push(slot.original);
            matched++;
            segIdx += 2;
            continue;
          }
        }
      }
      // Try single segment
      if (seg1 !== undefined && /^\d{4}-\d{2}$/.test(seg1)) {
        const [y, m] = seg1.split("-").map(Number);
        if (y >= 2024 && y <= 2030 && m >= 1 && m <= 12) {
          matchedTokens.push(slot.original);
          matched++;
          segIdx += 1;
          continue;
        }
      }
      violations.push(
        `Missing or invalid ${tokenDescription(slot.original)}`
      );
      segIdx++;
      continue;
    }

    const seg = segments[segIdx];
    if (seg === undefined) {
      violations.push(`Missing ${tokenDescription(slot.original)}`);
      continue;
    }

    if (validateToken(slot.original, seg)) {
      matchedTokens.push(slot.original);
      matched++;
      segIdx++;
    } else {
      violations.push(
        `"${seg}" is not a valid ${tokenDescription(slot.original)}`
      );
      segIdx++;
    }
  }

  const score = tokens.length > 0 ? Math.round((matched / tokens.length) * 100) : 100;
  const valid = violations.length === 0;

  return {
    valid,
    score,
    violations,
    suggestion: generateSuggestion(template),
    matchedTokens,
  };
}

/**
 * Generate an example key name from a template.
 */
function generateSuggestion(template: string): string {
  return template
    .replace(/\{project\}/g, "myproject")
    .replace(/\{provider\}/g, "anthropic")
    .replace(/\{YYYY-MM\}/g, "2026-04")
    .replace(/\{YYYY\}/g, "2026")
    .replace(/\{MM\}/g, "04")
    .replace(/\{env\}/g, "prod")
    .replace(/\{team\}/g, "myteam");
}

/**
 * Score a key name without a template, based on good naming practices.
 */
export function scoreKeyName(keyName: string): number {
  if (!keyName || keyName.trim().length === 0) return 0;

  let score = 0;

  // Has date-like pattern (YYYY-MM or YYYY) → +30
  if (/\d{4}-\d{2}/.test(keyName) || /\b\d{4}\b/.test(keyName)) {
    score += 30;
  }

  // Lowercase → +10
  if (keyName === keyName.toLowerCase()) {
    score += 10;
  }

  // Uses hyphens as separator → +15
  if (/-/.test(keyName)) {
    score += 15;
  }

  // No generic words → +15
  const lower = keyName.toLowerCase();
  const hasGeneric = GENERIC_WORDS.some((w) =>
    lower.split(/[-_/.]/).includes(w)
  );
  if (!hasGeneric) {
    score += 15;
  }

  // Length 10-50 chars → +10
  if (keyName.length >= 10 && keyName.length <= 50) {
    score += 10;
  }

  // Has a project-like prefix (2+ word segments, first is alpha) → +20
  const segments = splitSegments(keyName);
  if (
    segments.length >= 2 &&
    /^[a-zA-Z][a-zA-Z0-9]{1,}$/.test(segments[0])
  ) {
    score += 20;
  }

  return Math.min(score, 100);
}
