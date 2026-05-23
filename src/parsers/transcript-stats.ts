import { promises as fs, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { realpathSafe, isUnderAllowedRoot, LUMIRA_ALLOWED_ROOTS } from '../utils/path.js';
import { MAX_LINES } from './transcript.js';

/**
 * SessionStats — aggregate view of a Claude Code transcript for the stats CLI.
 *
 * `hasCostData` reflects whether *any* assistant turn carried a `usage` block
 * (i.e. the platform is emitting token accounting), not whether the dollar
 * total is non-zero. Qwen and other non-Anthropic backends never emit usage,
 * so `hasCostData=false` lets renderers suppress cost-related output without
 * surfacing a misleading "$0.00".
 */
export interface SessionStats {
  sessionStart: number | null;
  sessionEnd: number | null;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  hasCostData: boolean;
  toolFrequency: Record<string, number>;
  agentCount: number;
  errorCount: number;
}

function emptyStats(): SessionStats {
  return {
    sessionStart: null,
    sessionEnd: null,
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    hasCostData: false,
    toolFrequency: {},
    agentCount: 0,
    errorCount: 0,
  };
}

function safeNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Stream-aggregate a Claude Code transcript JSONL into a SessionStats summary.
 *
 * Single-pass design: tokens, cost, tool frequency, agent count, and error
 * count are all collected in one readline sweep. We deliberately do NOT call
 * `parseTranscript` — that parser returns derived TranscriptData (with zombie
 * detection, todo merging, subagents-dir override, etc.) but does not expose
 * the raw token totals we need here. Re-streaming once is cheaper than
 * parsing twice, and keeps the single-pass model clean.
 *
 * Hardening:
 *   - rejects if the path resolves outside LUMIRA_ALLOWED_ROOTS
 *   - rejects with a clear message if the file does not exist
 *   - caps reads at MAX_LINES (50_000) to bound runtime on runaway JSONL
 *   - skips malformed JSON lines silently; missing/non-numeric fields are
 *     treated as zero (no NaN propagation)
 */
export async function aggregateStats(transcriptPath: string): Promise<SessionStats> {
  // Canonicalise via realpathSafe before the allow-list check so that
  // symlinks outside LUMIRA_ALLOWED_ROOTS can't be smuggled in via a path
  // that *looks* safe at the string level.
  const resolved = realpathSafe(transcriptPath);
  if (!isUnderAllowedRoot(resolved, LUMIRA_ALLOWED_ROOTS)) {
    throw new Error(`Path outside allowed roots: ${transcriptPath}`);
  }

  try {
    await fs.stat(resolved);
  } catch {
    throw new Error(`Transcript file not found: ${transcriptPath}`);
  }

  const stats = emptyStats();

  let fileStream: ReturnType<typeof createReadStream> | null = null;
  try {
    fileStream = createReadStream(resolved);
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
    let lineCount = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      if (++lineCount > MAX_LINES) break;

      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      // Timestamp tracking — first valid ISO → sessionStart, last → sessionEnd.
      const ts = entry.timestamp;
      if (typeof ts === 'string') {
        const ms = Date.parse(ts);
        if (Number.isFinite(ms)) {
          if (stats.sessionStart === null) stats.sessionStart = ms;
          stats.sessionEnd = ms;
        }
      }

      const message = (entry.message ?? null) as Record<string, unknown> | null;

      // Usage block (assistant turns only). The mere presence of a usage
      // payload flips hasCostData=true even if all counts are zero — see
      // the "zero-cost-with-usage" test for why this matters.
      if (entry.type === 'assistant' && message && typeof message === 'object') {
        const usage = message.usage as Record<string, unknown> | undefined;
        if (usage && typeof usage === 'object') {
          stats.hasCostData = true;
          stats.inputTokens += safeNumber(usage.input_tokens);
          stats.outputTokens += safeNumber(usage.output_tokens);
          stats.cacheReadTokens += safeNumber(usage.cache_read_input_tokens);
          stats.cacheCreationTokens += safeNumber(usage.cache_creation_input_tokens);
        }
      }

      // Cost lives at the top level of the entry in real transcripts
      // (`entry.total_cost_usd`), but defensively accept it on `message`
      // too — older recorders or future renames shouldn't silently zero out
      // the dollar column.
      const topCost = safeNumber(entry.total_cost_usd);
      const msgCost = message ? safeNumber(message.total_cost_usd) : 0;
      stats.costUsd += topCost || msgCost;

      // Tool / agent / error extraction from the message.content array.
      const content = message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as Record<string, unknown>;

        if (b.type === 'tool_use' && typeof b.name === 'string') {
          const name = b.name;
          stats.toolFrequency[name] = (stats.toolFrequency[name] ?? 0) + 1;
          if (name === 'Agent' || name === 'Task') stats.agentCount += 1;
        }

        if (
          entry.type === 'user'
          && b.type === 'tool_result'
          && b.is_error === true
        ) {
          stats.errorCount += 1;
        }
      }
    }
  } finally {
    fileStream?.destroy();
  }

  if (stats.sessionStart !== null && stats.sessionEnd !== null) {
    stats.durationMs = Math.max(0, stats.sessionEnd - stats.sessionStart);
  }

  return stats;
}
