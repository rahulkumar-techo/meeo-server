// Prometheus HTTP API Client.
// Queries Prometheus endpoints: /api/v1/query, /api/v1/query_range, /api/v1/labels, /api/v1/label/:name/values.

import { AppError } from "@/common/errors/app-error.js";
import { getPrometheusConfig } from "../config/observability.config.js";
import type {
    PrometheusMetricResult,
    PrometheusRawData,
    PrometheusRawResponse,
} from "../types/observability.types.js";

export class PrometheusClient {
    /**
     * Executes a Prometheus range query over a specified time window with step interval.
     */
    async queryRange(
        query: string,
        startSec: number,
        endSec: number,
        step: string = "15s",
    ): Promise<PrometheusRawData<PrometheusMetricResult<[number, string][]>>> {
        const config = getPrometheusConfig();
        const url = new URL(`${config.baseUrl}/api/v1/query_range`);
        url.searchParams.set("query", query);
        url.searchParams.set("start", startSec.toString());
        url.searchParams.set("end", endSec.toString());
        url.searchParams.set("step", step);

        return this.fetchFromPrometheus<PrometheusMetricResult<[number, string][]>>(url.toString(), config);
    }

    /**
     * Executes a Prometheus instant query evaluated at a single point in time.
     */
    async queryInstant(
        query: string,
        timeSec?: number,
    ): Promise<PrometheusRawData<PrometheusMetricResult<[number, string]>>> {
        const config = getPrometheusConfig();
        const url = new URL(`${config.baseUrl}/api/v1/query`);
        url.searchParams.set("query", query);
        if (timeSec) {
            url.searchParams.set("time", timeSec.toString());
        }

        return this.fetchFromPrometheus<PrometheusMetricResult<[number, string]>>(url.toString(), config);
    }

    /**
     * Retrieves all active metric label names from Prometheus.
     */
    async getLabels(): Promise<string[]> {
        const config = getPrometheusConfig();
        const url = `${config.baseUrl}/api/v1/labels`;
        const res = await this.fetchJson<{ status: string; data: string[] }>(url, config);
        return res.data ?? [];
    }

    /**
     * Retrieves all unique values for a specific label name.
     */
    async getLabelValues(labelName: string): Promise<string[]> {
        const config = getPrometheusConfig();
        const url = `${config.baseUrl}/api/v1/label/${encodeURIComponent(labelName)}/values`;
        const res = await this.fetchJson<{ status: string; data: string[] }>(url, config);
        return res.data ?? [];
    }

    /**
     * Internal fetch helper for typed Prometheus query responses.
     */
    private async fetchFromPrometheus<TResult>(
        url: string,
        config: ReturnType<typeof getPrometheusConfig>,
    ): Promise<PrometheusRawData<TResult>> {
        const json = await this.fetchJson<PrometheusRawResponse<TResult>>(url, config);

        if (json.status !== "success") {
            throw new AppError(
                `Prometheus query failed: ${json.error || json.errorType || "Unknown error"}`,
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
        config: ReturnType<typeof getPrometheusConfig>,
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
                    `Prometheus server responded with HTTP ${res.status}: ${errorText || res.statusText}`,
                    res.status === 404 ? 404 : 502,
                );
            }

            return (await res.json()) as T;
        } catch (err: unknown) {
            if (err instanceof AppError) throw err;
            if ((err as Error)?.name === "AbortError") {
                throw new AppError("Prometheus request timed out", 504);
            }
            throw new AppError(
                `Failed to connect to Prometheus at ${config.baseUrl}: ${(err as Error)?.message || "Connection refused"}`,
                503,
            );
        } finally {
            clearTimeout(timeout);
        }
    }
}

export const prometheusClient = new PrometheusClient();
