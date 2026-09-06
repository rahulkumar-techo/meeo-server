import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { brandService } from "../services/brand.service.js";
import {
    createBrandSchema,
    updateBrandSchema,
    brandQuerySchema,
} from "../validations/brand.validation.js";

type IdParam = { id: string };
type SlugParam = { slug: string };

export class BrandController {
    /**
     * Creates a new brand.
     */
    async createBrand(request: FastifyRequest, reply: FastifyReply) {
        const body = createBrandSchema.parse(request.body);
        const creatorId = request.user?.id;
        const result = await brandService.createBrand(body, creatorId);
        return sendCreated({
            reply,
            message: "Brand created successfully",
            data: result,
        });
    }

    /**
     * Lists brands with optional search and filters.
     */
    async listBrands(request: FastifyRequest, reply: FastifyReply) {
        const query = brandQuerySchema.parse(request.query);
        const result = await brandService.listBrands(query);
        return sendOk({
            reply,
            message: "Brands retrieved successfully",
            data: result,
        });
    }

    /**
     * Retrieves a single brand by ID.
     */
    async getBrand(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const result = await brandService.getBrandById(id);
        return sendOk({
            reply,
            message: "Brand retrieved successfully",
            data: result,
        });
    }

    /**
     * Retrieves a single brand by slug.
     */
    async getBrandBySlug(request: FastifyRequest, reply: FastifyReply) {
        const { slug } = request.params as SlugParam;
        const result = await brandService.getBrandBySlug(slug);
        return sendOk({
            reply,
            message: "Brand retrieved successfully",
            data: result,
        });
    }

    /**
     * Updates an existing brand.
     */
    async updateBrand(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const body = updateBrandSchema.parse(request.body);
        const result = await brandService.updateBrand(id, body, request.user);
        return sendOk({
            reply,
            message: "Brand updated successfully",
            data: result,
        });
    }

    /**
     * Deletes a brand.
     */
    async deleteBrand(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const result = await brandService.deleteBrand(id, request.user);
        return sendOk({
            reply,
            message: "Brand deleted successfully",
            data: result,
        });
    }
}

export const brandController = new BrandController();
