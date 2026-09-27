import os from "node:os";
import { domainEventQueue, deadLetterQueue } from "@/lib/queue.js";

export interface WorkerNodeMetrics {
    nodeId: string;
    podName: string;
    hostname: string;
    status: "ONLINE" | "HEALTHY" | "DEGRADED" | "OFFLINE";
    cpuUtilizationPercent: number;
    memoryUtilization: {
        rssMb: number;
        heapUsedMb: number;
        heapTotalMb: number;
        systemTotalMb: number;
        systemFreeMb: number;
        percentUsed: number;
    };
    concurrency: {
        limit: number;
        activeWorkers: number;
        activeJobs: number;
    };
    uptimeSeconds: number;
    uptimeHuman: string;
    lastHeartbeat: string;
}

export class WorkerNodeService {
    /**
     * Formats seconds into human-readable uptime string.
     */
    private formatUptime(seconds: number): string {
        const days = Math.floor(seconds / (3600 * 24));
        const hours = Math.floor((seconds % (3600 * 24)) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        const parts: string[] = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        parts.push(`${secs}s`);
        return parts.join(" ");
    }

    /**
     * Collects live telemetry for worker node and pod instances.
     */
    async getWorkerNodes(): Promise<WorkerNodeMetrics[]> {
        const mem = process.memoryUsage();
        const systemTotalMem = os.totalmem() / (1024 * 1024);
        const systemFreeMem = os.freemem() / (1024 * 1024);
        const systemUsedMem = systemTotalMem - systemFreeMem;
        const memoryPercentUsed = Number(((systemUsedMem / systemTotalMem) * 100).toFixed(1));

        // Estimate CPU utilization across OS cores
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;
        cpus.forEach((cpu) => {
            for (const type in cpu.times) {
                totalTick += (cpu.times as any)[type];
            }
            totalIdle += cpu.times.idle;
        });
        const cpuUsage = Math.min(100, Math.max(5, Math.round(((totalTick - totalIdle) / totalTick) * 100)));

        const [domainWorkers, domainActiveCount] = await Promise.all([
            domainEventQueue.getWorkers().catch(() => []),
            domainEventQueue.getActiveCount().catch(() => 0),
        ]);

        const primaryNode: WorkerNodeMetrics = {
            nodeId: `node-${os.hostname().toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
            podName: `worker-pod-${os.hostname().slice(0, 6)}-${process.pid}`,
            hostname: os.hostname(),
            status: memoryPercentUsed > 90 ? "DEGRADED" : "HEALTHY",
            cpuUtilizationPercent: cpuUsage,
            memoryUtilization: {
                rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
                heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
                heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(2)),
                systemTotalMb: Number(systemTotalMem.toFixed(2)),
                systemFreeMb: Number(systemFreeMem.toFixed(2)),
                percentUsed: memoryPercentUsed,
            },
            concurrency: {
                limit: 10,
                activeWorkers: Math.max(1, domainWorkers.length),
                activeJobs: domainActiveCount,
            },
            uptimeSeconds: Math.floor(process.uptime()),
            uptimeHuman: this.formatUptime(process.uptime()),
            lastHeartbeat: new Date().toISOString(),
        };

        // If in cluster/multi-pod simulation or standalone, return node list
        return [primaryNode];
    }
}

export const workerNodeService = new WorkerNodeService();
