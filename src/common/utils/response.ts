import type { FastifyReply } from "fastify";


interface SuccessResponseOptions<T> {
    reply: FastifyReply;
    statusCode?: number;
    message?: string;
    data?: T | undefined;
}

interface ErrorResponseOptions {
    reply: FastifyReply;
    message?: string;
    errors?: unknown;
}

/**
 * Generic success response
 */
export const sendSuccess = <T>({
    reply,
    statusCode = 200,
    message = 'Success',
    data,
}: SuccessResponseOptions<T>) => {
    return reply.status(statusCode).send({
        success: true,
        message,
        data,
    });
};

/**
 * 200 OK
 */
export const sendOk = <T>({
    reply,
    message = 'Success',
    data,
}: Omit<SuccessResponseOptions<T>, 'statusCode'>) => {
    return sendSuccess({ reply, statusCode: 200, message, data });
};

/**
 * 201 Created
 */
export const sendCreated = <T>({
    reply,
    message = 'Resource created successfully',
    data,
}: Omit<SuccessResponseOptions<T>, 'statusCode'>) => {
    return sendSuccess({ reply, statusCode: 201, message, data });
};

/**
 * Generic error response
 */
export const sendError = ({
    reply,
    statusCode,
    message,
    errors,
}: ErrorResponseOptions & { statusCode: number }) => {
    return reply.status(statusCode).send({
        success: false,
        message,
        ...(errors !== undefined && { errors }),
    });
};

/**
 * 400 Bad Request
 */
export const sendBadRequest = ({
    reply,
    message = 'Bad request',
    errors,
}: ErrorResponseOptions) => {
    return sendError({ reply, statusCode: 400, message, errors });
};

/**
 * 401 Unauthorized
 */
export const sendUnauthorized = ({
    reply,
    message = 'Unauthorized',
}: ErrorResponseOptions) => {
    return sendError({ reply, statusCode: 401, message });
};

/**
 * 403 Forbidden
 */
export const sendForbidden = ({
    reply,
    message = 'Forbidden',
}: ErrorResponseOptions) => {
    return sendError({ reply, statusCode: 403, message });
};

/**
 * 404 Not Found
 */
export const sendNotFound = ({
    reply,
    message = 'Resource not found',
}: ErrorResponseOptions) => {
    return sendError({ reply, statusCode: 404, message });
};

/**
 * 409 Conflict
 */
export const sendConflict = ({
    reply,
    message = 'Resource already exists',
}: ErrorResponseOptions) => {
    return sendError({ reply, statusCode: 409, message });
};

/**
 * 422 Unprocessable Entity
 */
export const sendUnprocessableEntity = ({
    reply,
    message = 'Validation failed',
    errors,
}: ErrorResponseOptions) => {
    return sendError({ reply, statusCode: 422, message, errors });
};

/**
 * 429 Too Many Requests
 */
export const sendTooManyRequests = ({
    reply,
    message = 'Too many requests. Please try again later.',
}: ErrorResponseOptions) => {
    return sendError({ reply, statusCode: 429, message });
};

/**
 * 500 Internal Server Error
 */
export const sendInternalServerError = ({
    reply,
    message = 'Internal server error',
}: ErrorResponseOptions) => {
    return sendError({ reply, statusCode: 500, message });
};

/**
 * 503 Service Unavailable
 */
export const sendServiceUnavailable = ({
    reply,
    message = 'Service temporarily unavailable',
}: ErrorResponseOptions) => {
    return sendError({ reply, statusCode: 503, message });
};