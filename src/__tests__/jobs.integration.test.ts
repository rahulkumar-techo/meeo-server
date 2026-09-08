import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "jobs-test-jwt-secret";

const { jobOverviewServiceMock, jobListServiceMock, jobOperationsServiceMock, workerNodeServiceMock, authPrismaMock } = vi.hoisted(() => ({
    jobOverviewServiceMock: {
        getOverview: vi.fn(),
    },
    jobListServiceMock: {
        listJobs: vi.fn(),
    },
    jobOperationsServiceMock: {
        getJobDetails: vi.fn(),
        retryJob: vi.fn(),
        cancelJob: vi.fn(),
        executeBulkAction: vi.fn(),
    },
    workerNodeServiceMock: {
        getWorkerNodes: vi.fn(),
    },
    authPrismaMock: {
        user: { findUnique: vi.fn() },
        userSession: { findUnique: vi.fn() },
    },
}));

vi.mock("../modules/jobs/services/jobOverview.service.js", () => ({
    jobOverviewService: jobOverviewServiceMock,
}));
vi.mock("../modules/jobs/services/jobList.service.js", () => ({
    jobListService: jobListServiceMock,
}));
vi.mock("../modules/jobs/services/jobOperations.service.js", () => ({
    jobOperationsService: jobOperationsServiceMock,
}));
vi.mock("../modules/jobs/services/workerNode.service.js", () => ({
    workerNodeService: workerNodeServiceMock,
}));
vi.mock("../lib/prisma.js", () => ({ prisma: authPrismaMock }));

import authPlugin from "../plugins/auth.plugin.js";
import jobRouter from "../modules/jobs/routes/job.route.js";
import { generateAccessToken } from "../common/utils/token.js";
import { errorHandler } from "../common/errors/error-handler.js";
import { PERMISSIONS } from "../modules/authorization/permission.constants.js";

describe("Background Jobs HTTP Routes Integration Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createTestApp = async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(cookie);
        await app.register(authPlugin);
        await app.register(jobRouter, { prefix: "/api/v1/jobs" });
        return app;
    };

    const mockAdminUser = () => {
        const userId = "admin-user-uuid-1111-2222-333344445555";
        const sessionId = "session-uuid-1111-2222-333344445555";
        authPrismaMock.user.findUnique.mockResolvedValue({
            id: userId,
            email: "admin@store.com",
            status: "ACTIVE",
            roles: [
                {
                    role: {
                        name: "SUPER_ADMIN",
                        permissions: [{ permission: { name: PERMISSIONS.SYSTEM_MANAGE } }],
                    },
                },
            ],
        });
        authPrismaMock.userSession.findUnique.mockResolvedValue({
            id: sessionId,
            userId,
            isValid: true,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        });

        const token = generateAccessToken({
            userId,
            email: "admin@store.com",
            sessionId,
        });
        return { token, userId };
    };

    it("GET /api/v1/jobs/overview returns throughput and latency KPIs", async () => {
        const { token } = mockAdminUser();
        const app = await createTestApp();

        jobOverviewServiceMock.getOverview.mockResolvedValue({
            summary: {
                activeJobsInFlight: 14,
                throttledJobs: 2,
                jobsProcessedTotal: 18450,
                jobsSucceeded: 18442,
                jobsFailed: 8,
                successRatePercent: 99.96,
                averageExecutionLatencyMs: 42.5,
                p95ExecutionLatencyMs: 128.0,
                deadLetterQueueDepth: 3,
                deadLetterTriggered: true,
            },
            workerNodes: { totalNodes: 1, healthyNodes: 1, degradedNodes: 0, totalActiveConcurrency: 10 },
            queues: [],
            timestamp: new Date().toISOString(),
        });

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/jobs/overview",
            headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.status).toBe("success");
        expect(json.data.summary.activeJobsInFlight).toBe(14);
        expect(json.data.summary.deadLetterTriggered).toBe(true);
    });

    it("GET /api/v1/jobs/workers returns pod health and CPU/RAM utilization", async () => {
        const { token } = mockAdminUser();
        const app = await createTestApp();

        workerNodeServiceMock.getWorkerNodes.mockResolvedValue([
            {
                nodeId: "node-1",
                podName: "worker-pod-az1-21840",
                hostname: "worker-prod-az1-01",
                status: "HEALTHY",
                cpuUtilizationPercent: 18,
                memoryUtilization: { rssMb: 142.5, percentUsed: 50.0 },
                concurrency: { limit: 10, activeWorkers: 1, activeJobs: 2 },
                uptimeSeconds: 86400,
                uptimeHuman: "1d 0h 0m 0s",
                lastHeartbeat: new Date().toISOString(),
            },
        ]);

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/jobs/workers",
            headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.status).toBe("success");
        expect(json.data).toHaveLength(1);
        expect(json.data[0].podName).toBe("worker-pod-az1-21840");
    });

    it("GET /api/v1/jobs queries table view with queue filters", async () => {
        const { token } = mockAdminUser();
        const app = await createTestApp();

        jobListServiceMock.listJobs.mockResolvedValue({
            items: [
                {
                    id: "job-1",
                    jobId: "job-1",
                    status: "ACTIVE",
                    handler: "orderEventsConsumer",
                    queue: "domain-events",
                    category: "CRITICAL_CHECKOUTS",
                    worker: "worker-pod-az1-21840",
                    runtime: "32 ms",
                    attempt: "1/10",
                    actions: ["INSPECT"],
                },
            ],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        });

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/jobs?filter=CRITICAL_CHECKOUTS&status=ACTIVE&page=1&limit=20",
            headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.status).toBe("success");
        expect(json.data.items[0].category).toBe("CRITICAL_CHECKOUTS");
    });

    it("POST /api/v1/jobs/:id/retry triggers job retry", async () => {
        const { token } = mockAdminUser();
        const app = await createTestApp();

        jobOperationsServiceMock.retryJob.mockResolvedValue({
            jobId: "00000000-0000-0000-0000-000000000001",
            status: "WAITING",
            message: "Job reset and enqueued for immediate execution",
        });

        const res = await app.inject({
            method: "POST",
            url: "/api/v1/jobs/00000000-0000-0000-0000-000000000001/retry",
            headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.status).toBe("success");
        expect(json.data.status).toBe("WAITING");
    });

    it("POST /api/v1/jobs/bulk-action executes bulk actions", async () => {
        const { token } = mockAdminUser();
        const app = await createTestApp();

        jobOperationsServiceMock.executeBulkAction.mockResolvedValue({
            action: "RETRY_ALL_FAILED",
            affectedCount: 5,
            message: "Successfully re-queued 5 failed jobs",
        });

        const res = await app.inject({
            method: "POST",
            url: "/api/v1/jobs/bulk-action",
            headers: { authorization: `Bearer ${token}` },
            payload: { action: "RETRY_ALL_FAILED" },
        });

        expect(res.statusCode).toBe(200);
        const json = res.json();
        expect(json.status).toBe("success");
        expect(json.data.affectedCount).toBe(5);
    });

    it("rejects unauthenticated requests with 401 Unauthorized", async () => {
        const app = await createTestApp();

        const res = await app.inject({
            method: "GET",
            url: "/api/v1/jobs/overview",
        });

        expect(res.statusCode).toBe(401);
    });
});
