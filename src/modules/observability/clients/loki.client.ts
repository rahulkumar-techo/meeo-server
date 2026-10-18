// Loki HTTP and WebSocket Client.
// Queries Loki REST endpoints (/loki/api/v1/query_range, /loki/api/v1/query, /loki/api/v1/labels)
// and connects to Loki's live tailing WebSocket (/loki/api/v1/tail).

import WebSocket from "ws";
import { AppError } from "@/common/errors/app-error.js";
import { getLokiConfig } from "../config/observability.config.js";
import { LokiNormalizer } from "../normalizers/loki.normalizer.js";
import type {
    LokiRawData,
    LokiRawResponse,
    LokiRawStream,
    NormalizedLogEntry,
} from "../types/observability.types.js";

export class LokiClient {
    /**
     * Queries historical logs using LogQL over a specified time window.
     */
    async queryRange(
        query: string,
        startNs?: string | number,
        endNs?: string | number,
        limit: number = 100,
        direction: "backward" | "forward" = "backward",
    ): Promise<LokiRawData> {
        const config = getLokiConfig();
        const url = new URL(`${config.baseUrl}/loki/api/v1/query_range`);
        url.searchParams.set("query", query);
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("direction", direction);

        if (startNs) url.searchParams.set("start", String(startNs));
        if (endNs) url.searchParams.set("end", String(endNs));

        return this.fetchFromLoki(url.toString(), config);
    }

    /**
     * Evaluates a LogQL instant query at a single point in time.
     */
    async queryInstant(
        query: string,
        timeNs?: string | number,
        limit: number = 100,
    ): Promise<LokiRawData> {
        const config = getLokiConfig();
        const url = new URL(`${config.baseUrl}/loki/api/v1/query`);
        url.searchParams.set("query", query);
        url.searchParams.set("limit", String(limit));

        if (timeNs) url.searchParams.set("time", String(timeNs));

        return this.fetchFromLoki(url.toString(), config);
    }

    /**
     * Retrieves all active label names currently indexed in Loki.
     */
    async getLabels(): Promise<string[]> {
        const config = getLokiConfig();
        const url = `${config.baseUrl}/loki/api/v1/labels`;
        const res = await this.fetchJson<{ status: string; data: string[] }>(url, config);
        return res.data ?? [];
    }

    /**
     * Retrieves all recorded values for a specific label name.
     */
    async getLabelValues(labelName: string): Promise<string[]> {
        const config = getLokiConfig();
        const url = `${config.baseUrl}/loki/api/v1/label/${encodeURIComponent(labelName)}/values`;
        const res = await this.fetchJson<{ status: string; data: string[] }>(url, config);
        return res.data ?? [];
    }

    /**
     * Connects to Loki's live tail WebSocket endpoint (/loki/api/v1/tail).
     * Normalizes received log stream chunks in real-time and forwards them to the listener.
     */
    connectTailWebSocket(
        query: string,
        callbacks: {
            onLog: (entries: NormalizedLogEntry[]) => void;
            onError?: ((err: Error) => void) | undefined;
            onClose?: (() => void) | undefined;
        },
        limit: number = 50,
    ): { close: () => void } {
        const config = getLokiConfig();
        const wsUrl = new URL(`${config.wsUrl}/loki/api/v1/tail`);
        wsUrl.searchParams.set("query", query);
        wsUrl.searchParams.set("delay_for", "0");
        wsUrl.searchParams.set("limit", String(limit));

        const ws = new WebSocket(wsUrl.toString(), {
            headers: config.headers,
            handshakeTimeout: 10000,
        });

        let isClosed = false;

        ws.on("open", () => {
            // Live tail session established with Loki
        });

        ws.on("message", (raw: WebSocket.RawData) => {
            try {
                const messageText = raw.toString();
                const payload = JSON.parse(messageText) as { streams?: LokiRawStream[] };

                if (payload.streams && Array.isArray(payload.streams)) {
                    const normalized = LokiNormalizer.normalizeLiveChunk(payload);
                    if (normalized.length > 0) {
                        callbacks.onLog(normalized);
                    }
                }
            } catch (err) {
                callbacks.onError?.(err as Error);
            }
        });

        ws.on("error", (err: Error) => {
            if (!isClosed) {
                callbacks.onError?.(err);
            }
        });

        ws.on("close", () => {
            if (!isClosed) {
                isClosed = true;
                callbacks.onClose?.();
            }
        });

        return {
            close: () => {
                isClosed = true;
                try {
                    ws.terminate();
                } catch {
                    // Ignore termination errors
                }
            },
        };
    }

    /**
     * Internal fetch helper for typed Loki queries.
     */
    private async fetchFromLoki(
        url: string,
        config: ReturnType<typeof getLokiConfig>,
    ): Promise<LokiRawData> {
        const json = await this.fetchJson<LokiRawResponse>(url, config);

        if (json.status !== "success") {
            throw new AppError(
                `Loki query failed: ${json.error || json.errorType || "Unknown error"}`,
                502,
            );
        }

        return json.data;
    }

    /**
     * Performs HTTP GET with timeout and error wrapping.
     */
    private async fetchJson<T>(
        url: string,
        config: ReturnType<typeof getLokiConfig>,
    ): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

        try {
            const res = await fetch(url, {
                method: "GET",
                headers: config.headers,
                signal: controller.signal,
            });

            if (!res.ok) {
                const errorText = await res.text().catch(() => "");
                throw new AppError(
                    `Loki server responded with HTTP ${res.status}: ${errorText || res.statusText}`,
                    res.status === 404 ? 404 : 502,
                );
            }

            return (await res.json()) as T;
        } catch (err: unknown) {
            if (err instanceof AppError) throw err;
            if ((err as Error)?.name === "AbortError") {
                throw new AppError("Loki request timed out", 504);
            }
            throw new AppError(
                `Failed to connect to Loki at ${config.baseUrl}: ${(err as Error)?.message || "Connection refused"}`,
                503,
            );
        } finally {
            clearTimeout(timeout);
        }
    }
}

export const lokiClient = new LokiClient();
