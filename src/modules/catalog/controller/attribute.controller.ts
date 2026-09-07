import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { attributeService } from "../services/attribute.service.js";
import {
    createAttributeSchema,
    updateAttributeSchema,
    attributeQuerySchema,
} from "../validations/attribute.validation.js";

type IdParam = { id: string };

export class AttributeController {
    /**
     * Lists attributes with pagination, search, and sorting.
     */
    async listAttributes(request: FastifyRequest, reply: FastifyReply) {
        const query = attributeQuerySchema.parse(request.query);
        const result = await attributeService.listAttributes(query);

        return sendOk({
            reply,
            message: "Attributes retrieved successfully",
            data: result,
        });
    }

    /**
     * Retrieves a single attribute by ID with all its values.
     */
    async getAttribute(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const result = await attributeService.getAttributeById(id);

        return sendOk({
            reply,
            message: "Attribute retrieved successfully",
            data: result,
        });
    }

    /**
     * Creates a new attribute with optional initial values.
     */
    async createAttribute(request: FastifyRequest, reply: FastifyReply) {
        const body = createAttributeSchema.parse(request.body);
        const result = await attributeService.createAttribute(body);

        return sendCreated({
            reply,
            message: "Attribute created successfully",
            data: result,
        });
    }

    /**
     * Updates an attribute's name and/or values.
     */
    async updateAttribute(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const body = updateAttributeSchema.parse(request.body);
        const result = await attributeService.updateAttribute(id, body);

        return sendOk({
            reply,
            message: "Attribute updated successfully",
            data: result,
        });
    }

    /**
     * Deletes an attribute and cascades to its values.
     */
    async deleteAttribute(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const result = await attributeService.deleteAttribute(id);

        return sendOk({
            reply,
            message: "Attribute deleted successfully",
            data: result,
        });
    }
}

export const attributeController = new AttributeController();
