// Prometheus metric response normalizer.
// Transforms raw Prometheus matrix/vector outputs into chart-friendly formats with statistical summaries.

import type {
    NormalizedInstantMetric,
    NormalizedMetricPoint,
    NormalizedMetricSeries,
    PrometheusMetricResult,
    PrometheusRawData,
} from "../types/observability.types.js";

export class PrometheusNormalizer {
    /**
     * Normalizes a Prometheus matrix response (used by range queries for time-series charts).
     */
    static normalizeMatrix(
        rawData: PrometheusRawData<PrometheusMetricResult<[number, string][]>>,
    ): NormalizedMetricSeries[] {
        if (!rawData || !Array.isArray(rawData.result)) {
            return [];
        }

        return rawData.result.map((series, index) => {
            const labels = series.metric ?? {};
            const metricName = labels.__name__ || "unnamed_metric";
            const seriesName = this.formatSeriesName(metricName, labels);
            const seriesId = this.buildSeriesId(metricName, labels, index);

            const rawPoints = Array.isArray(series.values) ? series.values : [];
            const points: NormalizedMetricPoint[] = [];

            let min = Number.POSITIVE_INFINITY;
            let max = Number.NEGATIVE_INFINITY;
            let sum = 0;

            for (const [timestampSec, valueStr] of rawPoints) {
                const numericVal = Number.parseFloat(valueStr);
                const safeVal = Number.isFinite(numericVal) ? Number(numericVal.toFixed(4)) : 0;
                const timestampMs = Math.round(timestampSec * 1000);

                points.push({
                    timestamp: timestampMs,
                    timeIso: new Date(timestampMs).toISOString(),
                    value: safeVal,
                });

                if (safeVal < min) min = safeVal;
                if (safeVal > max) max = safeVal;
                sum += safeVal;
            }

            const count = points.length;
            const avg = count > 0 ? Number((sum / count).toFixed(4)) : 0;
            const latest = count > 0 ? points[count - 1]!.value : 0;

            return {
                id: seriesId,
                name: seriesName,
                metricName,
                labels,
                points,
                summary: {
                    min: count > 0 ? min : 0,
                    max: count > 0 ? max : 0,
                    avg,
                    latest,
                    count,
                },
            };
        });
    }

    /**
     * Normalizes a Prometheus vector response (used by instant queries).
     */
    static normalizeVector(
        rawData: PrometheusRawData<PrometheusMetricResult<[number, string]>>,
    ): NormalizedInstantMetric[] {
        if (!rawData || !Array.isArray(rawData.result)) {
            return [];
        }

        return rawData.result.map((item, index) => {
            const labels = item.metric ?? {};
            const metricName = labels.__name__ || "unnamed_metric";
            const seriesName = this.formatSeriesName(metricName, labels);
            const seriesId = this.buildSeriesId(metricName, labels, index);

            const [timestampSec, valueStr] = item.value ?? [Math.floor(Date.now() / 1000), "0"];
            const numericVal = Number.parseFloat(valueStr);
            const safeVal = Number.isFinite(numericVal) ? Number(numericVal.toFixed(4)) : 0;
            const timestampMs = Math.round(timestampSec * 1000);

            return {
                id: seriesId,
                name: seriesName,
                metricName,
                labels,
                timestamp: timestampMs,
                timeIso: new Date(timestampMs).toISOString(),
                value: safeVal,
            };
        });
    }

    /**
     * Formats a descriptive, human-readable name for chart legends and tooltips.
     */
    private static formatSeriesName(metricName: string, labels: Record<string, string>): string {
        const parts: string[] = [];

        // HTTP request metrics: method + route/path/handler + status
        if (labels.method && (labels.route || labels.handler || labels.path)) {
            const route = labels.route || labels.handler || labels.path;
            const status = labels.status ? ` [${labels.status}]` : "";
            return `${labels.method} ${route}${status}`;
        }

        // Status code only
        if (labels.status) {
            parts.push(`status=${labels.status}`);
        }

        // Container or job
        if (labels.container) {
            parts.push(labels.container);
        } else if (labels.job) {
            parts.push(labels.job);
        }

        // Le (percentile bucket)
        if (labels.le) {
            parts.push(`le=${labels.le}`);
        }

        if (parts.length > 0) {
            return `${metricName} (${parts.join(", ")})`;
        }

        return metricName;
    }

    /**
     * Generates a unique, deterministic ID for identifying series across re-renders.
     */
    private static buildSeriesId(
        metricName: string,
        labels: Record<string, string>,
        index: number,
    ): string {
        const labelPairs = Object.entries(labels)
            .filter(([k]) => k !== "__name__")
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(",");

        return labelPairs ? `${metricName}{${labelPairs}}` : `${metricName}#${index}`;
    }
}
