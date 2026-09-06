import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = `${process.env.DATABASE_URL}`;

const poolMax = parseInt(process.env.DB_POOL_MAX ?? "20", 10);
const poolIdleTimeout = parseInt(process.env.DB_POOL_IDLE_TIMEOUT ?? "30000", 10);
const poolConnectionTimeout = parseInt(process.env.DB_POOL_CONN_TIMEOUT ?? "5000", 10);

const adapter = new PrismaPg({
    connectionString,
    max: poolMax,
    idleTimeoutMillis: poolIdleTimeout,
    connectionTimeoutMillis: poolConnectionTimeout,
});

const prisma = new PrismaClient({ adapter });

export { prisma };