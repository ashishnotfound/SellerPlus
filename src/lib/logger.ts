/**
 * SellerPlus OS — Isomorphic Redacted Logger
 * 
 * Supports hierarchical log levels (TRACE, DEBUG, INFO, WARN, ERROR, FATAL),
 * request correlation IDs, pluggable regex redactors, local dev formatting,
 * production JSON formatting, and database storage audits.
 */

import { getAdminClient } from "@/lib/auth-middleware";

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5
}

const LogLevelNames: Record<LogLevel, string> = {
  [LogLevel.TRACE]: "TRACE",
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.FATAL]: "FATAL"
};

// ─── Pluggable Redaction System ──────────────────────────────────────

export interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

// Registry of sensitive patterns
export const REDACTION_REGISTRY: RedactionRule[] = [
  { name: "Bearer Token", pattern: /Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*/g, replacement: "Bearer [REDACTED]" },
  { name: "API Key (sk-)", pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: "[REDACTED_OPENAI_KEY]" },
  { name: "Google API Key", pattern: /AIzaSy[A-Za-z0-9_-]{33,40}/g, replacement: "[REDACTED_GOOGLE_KEY]" },
  { name: "Postgres Connection String", pattern: /postgres(ql)?:\/\/[^:]+:[^@]+@[a-zA-Z0-9.-]+(:\d+)?(\/[a-zA-Z0-9_.-]+)?/g, replacement: "postgres://[REDACTED_CREDENTIALS]@[REDACTED_HOST]" },
  { name: "Email Address", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: "[EMAIL_REDACTED]" },
];

/**
 * Registers a new pluggable redaction rule.
 */
export function registerRedactionRule(name: string, pattern: RegExp, replacement = "[REDACTED]"): void {
  REDACTION_REGISTRY.push({ name, pattern, replacement });
}

/**
 * Scrubs sensitive patterns from messages and metadata recursively.
 */
export function redactSensitiveData(data: any): any {
  if (typeof data === "string") {
    let scrubbed = data;
    for (const rule of REDACTION_REGISTRY) {
      scrubbed = scrubbed.replace(rule.pattern, rule.replacement);
    }
    return scrubbed;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item));
  }
  
  if (data !== null && typeof data === "object") {
    const cleaned: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      // Do not log raw prompt text or prompt bodies
      if (["prompt", "text", "body", "message"].includes(key.toLowerCase()) && typeof data[key] === "string") {
        cleaned[key] = "[CONTENT_REDACTED_FOR_SECURITY]";
      } else {
        cleaned[key] = redactSensitiveData(data[key]);
      }
    }
    return cleaned;
  }

  return data;
}

// ─── Logger Implementation ───────────────────────────────────────────

export class Logger {
  private minLevel: LogLevel = LogLevel.INFO;

  constructor() {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel) {
      const match = Object.entries(LogLevelNames).find(([_, name]) => name === envLevel);
      if (match) {
        this.minLevel = Number(match[0]) as LogLevel;
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private formatMessage(level: LogLevel, message: string, correlationId?: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const levelName = LogLevelNames[level];
    
    // Redact sensitive patterns in both message and metadata
    const scrubbedMessage = redactSensitiveData(message);
    const scrubbedMeta = meta ? redactSensitiveData(meta) : {};

    const payload = {
      timestamp,
      level: levelName,
      message: scrubbedMessage,
      correlationId: correlationId || null,
      metadata: scrubbedMeta
    };

    if (process.env.NODE_ENV === "production") {
      return JSON.stringify(payload);
    }

    // Friendly local development console output
    const metaStr = Object.keys(scrubbedMeta).length ? ` | Meta: ${JSON.stringify(scrubbedMeta)}` : "";
    const corrStr = correlationId ? ` [CorrId: ${correlationId}]` : "";
    return `[${timestamp}] [${levelName}]${corrStr} ${scrubbedMessage}${metaStr}`;
  }

  private async persistToDatabase(
    level: LogLevel,
    message: string,
    correlationId?: string,
    meta?: any
  ): Promise<void> {
    // Only write operationally significant logs (WARN, ERROR, FATAL) to database to avoid unbounded table writes
    if (level < LogLevel.WARN || typeof window !== "undefined") {
      return;
    }

    try {
      const adminClient = getAdminClient();
      const levelName = LogLevelNames[level];
      const scrubbedMessage = redactSensitiveData(message);
      const scrubbedMeta = meta ? redactSensitiveData(meta) : {};

      await adminClient
        .from("system_logs")
        .insert({
          level: levelName,
          message: scrubbedMessage,
          correlation_id: correlationId || null,
          metadata: scrubbedMeta,
          created_at: new Date().toISOString()
        });
    } catch (err) {
      // Avoid infinite loop in logger - print directly to stdout
      console.warn("[Logger] Failed to write system logs to database:", err);
    }
  }

  private log(level: LogLevel, message: string, correlationId?: string, meta?: any) {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, message, correlationId, meta);
    
    // Output directly to correct console handles
    if (level >= LogLevel.ERROR) {
      console.error(formatted);
    } else if (level === LogLevel.WARN) {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    // Persist to database in background asynchronously
    this.persistToDatabase(level, message, correlationId, meta).catch(() => {});
  }

  trace(message: string, correlationId?: string, meta?: any) {
    this.log(LogLevel.TRACE, message, correlationId, meta);
  }

  debug(message: string, correlationId?: string, meta?: any) {
    this.log(LogLevel.DEBUG, message, correlationId, meta);
  }

  info(message: string, correlationId?: string, meta?: any) {
    this.log(LogLevel.INFO, message, correlationId, meta);
  }

  warn(message: string, correlationId?: string, meta?: any) {
    this.log(LogLevel.WARN, message, correlationId, meta);
  }

  error(message: string, correlationId?: string, meta?: any) {
    this.log(LogLevel.ERROR, message, correlationId, meta);
  }

  fatal(message: string, correlationId?: string, meta?: any) {
    this.log(LogLevel.FATAL, message, correlationId, meta);
  }
}

export const log = new Logger();
export default log;
