import type { FastifyRequest, FastifyReply } from "fastify";
import { jobOverviewService } from "../services/jobOverview.service.js";
import { jobListService } from "../services/jobList.service.js";
import { jobOperationsService } from "../services/jobOperations.service.js";
import { workerNodeService } from "../services/workerNode.service.js";
import {
    QueryJobsSchema,
    BulkJobActionSchema,
} from "../validations/job.validation.js";

export class JobController {
    /**
     * Retrieves overall metrics, queue throughput, active in flight, latencies, and DLQ depth.
     */
    async getOverview(_req: FastifyRequest, reply: FastifyReply) {
        const result = await jobOverviewService.getOverview();
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Lists worker node telemetry (pod name, CPU/RAM utilization, concurrency, uptime).
     */
    async getWorkerNodes(_req: FastifyRequest, reply: FastifyReply) {
        const result = await workerNodeService.getWorkerNodes();
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Lists paginated jobs formatted with table columns, categories, runtime, attempt counters.
     */
    async listJobs(req: FastifyRequest, reply: FastifyReply) {
        const query = QueryJobsSchema.parse(req.query);
        const result = await jobListService.listJobs(query);
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Inspects specific job details, JSON payload, and consumer execution history.
     */
    async getJobDetails(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await jobOperationsService.getJobDetails(id);
        return reply.status(200).send({
            status: "success",
            data: result,
        });
    }

    /**
     * Retries a failed or dead-lettered job.
     */
    async retryJob(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await jobOperationsService.retryJob(id);
        return reply.status(200).send({
            status: "success",
            message: result.message,
            data: result,
        });
    }

    /**
     * Cancels an active or waiting job.
     */
    async cancelJob(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await jobOperationsService.cancelJob(id);
        return reply.status(200).send({
            status: "success",
            message: result.message,
            data: result,
        });
    }

    /**
     * Executes bulk actions (e.g. retry all failed, purge dead letters, pause queues).
     */
    async executeBulkAction(req: FastifyRequest, reply: FastifyReply) {
        const input = BulkJobActionSchema.parse(req.body);
        const result = await jobOperationsService.executeBulkAction(input);
        return reply.status(200).send({
            status: "success",
            message: result.message,
            data: result,
        });
    }
}

export const jobController = new JobController();
