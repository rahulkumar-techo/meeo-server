import { logger } from "./logger.js";
import { maskSensitiveData } from "@/common/security/masking.js";

export interface ErrorReport {
    id: string;
    timestamp: string;
    name: string;
    message: string;
    stack?: string | undefined;
    context?: Record<string, unknown> | undefined;
    level: "warn" | "error" | "fatal";
}

export interface Breadcrumb {
    timestamp: string;
    category: string;
    message: string;
    level?: string | undefined;
    data?: Record<string, unknown> | undefined;
}

export class ErrorTracker {
    private recentErrors: ErrorReport[] = [];
    private breadcrumbs: Breadcrumb[] = [];
    private maxRecentErrors = 50;
    private maxBreadcrumbs = 100;

    /**
     * Adds an execution breadcrumb for tracking the trail leading up to an error.
     */
    addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp">) {
        this.breadcrumbs.push({
            ...breadcrumb,
            timestamp: new Date().toISOString(),
            data: breadcrumb.data ? maskSensitiveData(breadcrumb.data) : undefined,
        });

        if (this.breadcrumbs.length > this.maxBreadcrumbs) {
            this.breadcrumbs.shift();
        }
    }

    /**
     * Captures and tracks an exception with optional request/actor context.
     */
    captureException(
        error: unknown,
        context: Record<string, unknown> = {},
        level: "warn" | "error" | "fatal" = "error",
    ): ErrorReport {
        const err = error instanceof Error ? error : new Error(String(error));
        const reportId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const maskedContext = maskSensitiveData(context) ?? {};

        const report: ErrorReport = {
            id: reportId,
            timestamp: new Date().toISOString(),
            name: err.name || "Error",
            message: err.message,
            stack: err.stack,
            context: {
                ...maskedContext,
                recentBreadcrumbs: this.breadcrumbs.slice(-10),
            },
            level,
        };

        // Store in circular buffer for admin diagnostics
        this.recentErrors.unshift(report);
        if (this.recentErrors.length > this.maxRecentErrors) {
            this.recentErrors.pop();
        }

        // Log structured error
        logger[level]({
            errorReportId: report.id,
            err: {
                name: err.name,
                message: err.message,
                stack: err.stack,
            },
            context: maskedContext,
        }, `[ErrorTracker] ${level.toUpperCase()}: ${err.message}`);

        return report;
    }

    /**
     * Captures a custom error/warning message.
     */
    captureMessage(message: string, level: "warn" | "error" | "fatal" = "warn", context: Record<string, unknown> = {}) {
        return this.captureException(new Error(message), context, level);
    }

    /**
     * Retrieves recent captured error reports (for health/diagnostic APIs).
     */
    getRecentErrors(limit = 20): ErrorReport[] {
        return this.recentErrors.slice(0, limit);
    }

    /**
     * Clears error buffer (useful in tests).
     */
    clear() {
        this.recentErrors = [];
        this.breadcrumbs = [];
    }
}

export const errorTracker = new ErrorTracker();
