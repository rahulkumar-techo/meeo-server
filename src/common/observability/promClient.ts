import client from "prom-client";

// Collect default runtime and process metrics if not already registered
if (!client.register.getSingleMetric("process_cpu_user_seconds_total")) {
    client.collectDefaultMetrics();
}

export { client };
