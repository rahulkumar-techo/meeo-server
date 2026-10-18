// Loki log stream normalizer.
// Transforms raw Loki streams, nanosecond timestamps, and structured JSON logs (Pino/Fastify) into unified log records.

import type {
    LogLevel,
    LokiRawData,
    LokiRawStream,
    NormalizedLogEntry,
} from "../types/observability.types.js";

export class LokiNormalizer {
    /**
     * Normalizes a raw Loki query_range or query response containing multiple streams.
     */
    static normalizeStreams(rawData: LokiRawData): NormalizedLogEntry[] {
        if (!rawData || !Array.isArray(rawData.result)) {
            return [];
        }

        const entries: NormalizedLogEntry[] = [];

        for (const streamObj of rawData.result) {
            const streamLabels = streamObj.stream ?? {};
            const values = Array.isArray(streamObj.values) ? streamObj.values : [];

            for (let i = 0; i < values.length; i++) {
                const [nsString, rawLine] = values[i]!;
                entries.push(this.normalizeSingleEntry(nsString, rawLine, streamLabels, i));
            }
        }

        // Sort chronologically ascending by nanosecond timestamp
        return entries.sort((a, b) => {
            if (a.timestampNs === b.timestampNs) return 0;
            return a.timestampNs < b.timestampNs ? -1 : 1;
        });
    }

    /**
     * Normalizes a live WebSocket chunk received from Loki's /loki/api/v1/tail endpoint.
     */
    static normalizeLiveChunk(payload: { streams?: LokiRawStream[] }): NormalizedLogEntry[] {
        if (!payload || !Array.isArray(payload.streams)) {
            return [];
        }

        const entries: NormalizedLogEntry[] = [];

        for (const streamObj of payload.streams) {
            const streamLabels = streamObj.stream ?? {};
            const values = Array.isArray(streamObj.values) ? streamObj.values : [];

            for (let i = 0; i < values.length; i++) {
                const [nsString, rawLine] = values[i]!;
                entries.push(this.normalizeSingleEntry(nsString, rawLine, streamLabels, i));
            }
        }

        return entries;
    }

    /**
     * Normalizes a single log line with its timestamp and labels.
     */
    static normalizeSingleEntry(
        nsString: string,
        rawLine: string,
        labels: Record<string, string>,
        index: number,
    ): NormalizedLogEntry {
        const timeIso = this.parseNanosecondsToIso(nsString);
        const { message, level, structured } = this.parseLogContent(rawLine, labels);
        const id = `${nsString}-${index}`;

        return {
            id,
            timestamp: timeIso,
            timestampNs: nsString,
            level,
            message,
            labels,
            structured,
            raw: rawLine,
        };
    }

    /**
     * Converts a Loki 19-digit nanosecond string to an ISO-8601 UTC date string.
     */
    private static parseNanosecondsToIso(nsString: string): string {
        try {
            if (!nsString) return new Date().toISOString();
            // Loki timestamps are nanoseconds: convert to milliseconds for JS Date
            const nanos = BigInt(nsString);
            const millis = Number(nanos / 1_000_000n);
            return new Date(millis).toISOString();
        } catch {
            return new Date().toISOString();
        }
    }

    /**
     * Parses structured JSON logs (Pino/Fastify) or extracts level and message from plain text.
     */
    private static parseLogContent(
        rawLine: string,
        streamLabels: Record<string, string>,
    ): {
        message: string;
        level: LogLevel;
        structured?: Record<string, unknown>;
    } {
        const trimmed = rawLine.trim();

        // 1. Try parsing structured JSON (e.g. Pino, Winston, Bunyan)
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
                const parsed = JSON.parse(trimmed) as Record<string, unknown>;

                const level = this.mapLevel(parsed.level ?? streamLabels.level);
                const message =
                    (typeof parsed.msg === "string" && parsed.msg) ||
                    (typeof parsed.message === "string" && parsed.message) ||
                    (typeof parsed.error === "string" && parsed.error) ||
                    trimmed;

                return {
                    message,
                    level,
                    structured: parsed,
                };
            } catch {
                // Fall back to plain text parsing
            }
        }

        // 2. Plain text log parsing
        const level = this.inferPlainTextLevel(trimmed, streamLabels.level);

        return {
            message: trimmed,
            level,
        };
    }

    /**
     * Maps numeric (Pino) or string log levels to canonical LogLevel.
     */
    private static mapLevel(levelValue: unknown): LogLevel {
        if (typeof levelValue === "number") {
            // Pino standard numeric levels
            if (levelValue >= 60) return "error"; // fatal
            if (levelValue >= 50) return "error"; // error
            if (levelValue >= 40) return "warn"; // warn
            if (levelValue >= 30) return "info"; // info
            if (levelValue >= 20) return "debug"; // debug
            return "trace";
        }

        if (typeof levelValue === "string") {
            const lower = levelValue.toLowerCase();
            if (lower === "error" || lower === "fatal" || lower === "err") return "error";
            if (lower === "warn" || lower === "warning") return "warn";
            if (lower === "info") return "info";
            if (lower === "debug") return "debug";
            if (lower === "trace") return "trace";
        }

        return "unknown";
    }

    /**
     * Infers log level from text keywords when logs are unformatted.
     */
    private static inferPlainTextLevel(line: string, labelLevel?: string): LogLevel {
        if (labelLevel) {
            const mapped = this.mapLevel(labelLevel);
            if (mapped !== "unknown") return mapped;
        }

        const upper = line.toUpperCase();
        if (upper.includes("ERROR") || upper.includes("FATAL") || upper.includes("EXCEPTION")) {
            return "error";
        }
        if (upper.includes("WARN")) {
            return "warn";
        }
        if (upper.includes("INFO")) {
            return "info";
        }
        if (upper.includes("DEBUG")) {
            return "debug";
        }
        if (upper.includes("TRACE")) {
            return "trace";
        }

        return "info";
    }
}
