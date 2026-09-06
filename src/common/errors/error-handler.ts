import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "./app-error.js";
import { Prisma } from "@/generated/prisma/client.js";
import { sendError } from "../utils/response.js";
import { ZodError } from "zod";

type ValidationError = NonNullable<FastifyError["validation"]>[number];

export const errorHandler = (
    error: FastifyError | AppError | Prisma.PrismaClientKnownRequestError | ZodError | Error,
    request: FastifyRequest,
    reply: FastifyReply,
) => {
    request.log.error(error);

    // Zod validation errors
    if (error instanceof ZodError || (error && typeof error === "object" && "name" in error && error.name === "ZodError")) {
        const zodError = error as ZodError;
        return reply.status(400).send({
            success: false,
            message: "Validation failed",
            errors: zodError.issues?.map((err) => ({
                field: err.path.join("."),
                message: err.message,
            })) ?? [],
        });
    }

    // Custom application errors
    if (error instanceof AppError) {
        return sendError({
            reply,
            statusCode: error.statusCode,
            message: error.message,
        });
    }

    // Prisma unique constraint error
    if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
    ) {
        return reply.status(409).send({
            success: false,
            message: "A record with this value already exists",
        });
    }

    // Prisma record not found
    if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
    ) {
        return reply.status(404).send({
            success: false,
            message: "Record not found",
        });
    }

    // Fastify validation errors
    if ("validation" in error && error.validation) {
        return reply.status(400).send({
            success: false,
            message: "Validation failed",
            errors: error.validation.map((item: ValidationError) => ({
                field: item.instancePath,
                message: item.message,
            })),
        });
    }

    // Payload too large (413)
    if ("statusCode" in error && error.statusCode === 413) {
        return reply.status(413).send({
            success: false,
            message: "Request payload too large. Maximum allowed size exceeded.",
        });
    }

    // Rate limit exceeded (429)
    if ("statusCode" in error && error.statusCode === 429) {
        return reply.status(429).send({
            success: false,
            message: error.message || "Rate limit exceeded. Please try again later.",
        });
    }

    // Unknown server errors
    return reply.status(500).send({
        success: false,
        message: "Internal server error",
    });
};