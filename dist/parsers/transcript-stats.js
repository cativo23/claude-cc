import { promises as fs, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { realpathSafe, isUnderAllowedRoot, LUMIRA_ALLOWED_ROOTS } from '../utils/path.js';
import { MAX_LINES } from './transcript.js';
function emptyStats() {
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
function safeNumber(v) {
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
export async function aggregateStats(transcriptPath) {
    // Canonicalise via realpathSafe before the allow-list check so that
    // symlinks outside LUMIRA_ALLOWED_ROOTS can't be smuggled in via a path
    // that *looks* safe at the string level.
    const resolved = realpathSafe(transcriptPath);
    if (!isUnderAllowedRoot(resolved, LUMIRA_ALLOWED_ROOTS)) {
        throw new Error(`Path outside allowed roots: ${transcriptPath}`);
    }
    try {
        await fs.stat(resolved);
    }
    catch {
        throw new Error(`Transcript file not found: ${transcriptPath}`);
    }
    const stats = emptyStats();
    // Dedup guard: Claude Code streams one JSONL entry per content block for
    // the same logical message (thinking → text → tool_use all share one
    // message.id). Each entry carries the full usage block for that turn, so
    // naively accumulating every entry inflates tokens/cost by the number of
    // content blocks. Track seen message IDs and skip usage+cost on repeats.
    // Content extraction (tool_use, tool_result) is NOT gated — each block
    // appears exactly once in its own entry and must still be counted.
    const seenMessageIds = new Set();
    let fileStream = null;
    try {
        fileStream = createReadStream(resolved);
        const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
        let lineCount = 0;
        for await (const line of rl) {
            if (!line.trim())
                continue;
            if (++lineCount > MAX_LINES)
                break;
            let entry;
            try {
                entry = JSON.parse(line);
            }
            catch {
                continue;
            }
            // Timestamp tracking — first valid ISO → sessionStart, last → sessionEnd.
            const ts = entry.timestamp;
            if (typeof ts === 'string') {
                const ms = Date.parse(ts);
                if (Number.isFinite(ms)) {
                    if (stats.sessionStart === null)
                        stats.sessionStart = ms;
                    stats.sessionEnd = ms;
                }
            }
            const message = (entry.message ?? null);
            // Determine whether this is the first time we're seeing this message.id.
            // Entries without a message.id (e.g. user turns, summary lines) are
            // always treated as first-occurrence so they're never suppressed.
            const messageId = message !== null && typeof message.id === 'string' ? message.id : null;
            const isFirstOccurrence = messageId === null || !seenMessageIds.has(messageId);
            if (messageId !== null)
                seenMessageIds.add(messageId);
            // Usage block (assistant turns only). The mere presence of a usage
            // payload flips hasCostData=true even if all counts are zero — see
            // the "zero-cost-with-usage" test for why this matters.
            //
            // Gated on isFirstOccurrence: duplicate entries for the same message.id
            // carry identical usage blocks; accumulating them inflates counts 2-3×.
            if (isFirstOccurrence && entry.type === 'assistant' && message && typeof message === 'object') {
                const usage = message.usage;
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
            //
            // Precedence: top is authoritative, message is fallback ONLY when top
            // is absent. We branch on field presence (`entry.total_cost_usd !==
            // undefined`), not truthiness — Anthropic emits `total_cost_usd: 0` for
            // fully-cached turns, and a `topCost || msgCost` short-circuit would
            // incorrectly fall through to the message field in that case.
            //
            // Also gated on isFirstOccurrence for the same dedup reason as usage above.
            if (isFirstOccurrence) {
                const topCost = safeNumber(entry.total_cost_usd);
                const msgCost = message ? safeNumber(message.total_cost_usd) : 0;
                const costContribution = entry.total_cost_usd !== undefined ? topCost : msgCost;
                stats.costUsd += costContribution;
            }
            // Tool / agent / error extraction from the message.content array.
            const content = message?.content;
            if (!Array.isArray(content))
                continue;
            for (const block of content) {
                if (!block || typeof block !== 'object')
                    continue;
                const b = block;
                if (b.type === 'tool_use' && typeof b.name === 'string') {
                    const name = b.name;
                    stats.toolFrequency[name] = (stats.toolFrequency[name] ?? 0) + 1;
                    if (name === 'Agent' || name === 'Task')
                        stats.agentCount += 1;
                }
                if (entry.type === 'user'
                    && b.type === 'tool_result'
                    && b.is_error === true) {
                    stats.errorCount += 1;
                }
            }
        }
    }
    finally {
        fileStream?.destroy();
    }
    if (stats.sessionStart !== null && stats.sessionEnd !== null) {
        stats.durationMs = Math.max(0, stats.sessionEnd - stats.sessionStart);
    }
    return stats;
}
//# sourceMappingURL=transcript-stats.js.map