import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { productVariantService } from "../services/productVariant.service.js";
import {
    createProductVariantSchema,
    updateProductVariantSchema,
    batchCreateVariantsSchema,
    productVariantQuerySchema,
} from "../validations/productVariant.validation.js";

type ProductIdParam = { productId: string };
type VariantIdParam = { id: string };
type SkuParam = { sku: string };

export class ProductVariantController {
    /**
     * Creates a new variant for a product.
     */
    async createVariant(request: FastifyRequest, reply: FastifyReply) {
        const { productId } = request.params as ProductIdParam;
        const body = createProductVariantSchema.parse(request.body);
        const result = await productVariantService.createVariant(productId, body, request.user);

        return sendCreated({
            reply,
            message: "Product variant created successfully",
            data: result,
        });
    }

    /**
     * Lists variants belonging to a specific product with filtering and pagination.
     */
    async listVariants(request: FastifyRequest, reply: FastifyReply) {
        const { productId } = request.params as ProductIdParam;
        const query = productVariantQuerySchema.parse(request.query);
        const result = await productVariantService.getVariantsByProductId(productId, query);

        return sendOk({
            reply,
            message: "Product variants retrieved successfully",
            data: result,
        });
    }

    /**
     * Retrieves a single variant by UUID.
     */
    async getVariantById(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as VariantIdParam;
        const result = await productVariantService.getVariantById(id);

        return sendOk({
            reply,
            message: "Product variant retrieved successfully",
            data: result,
        });
    }

    /**
     * Retrieves a single variant by its unique SKU.
     */
    async getVariantBySku(request: FastifyRequest, reply: FastifyReply) {
        const { sku } = request.params as SkuParam;
        const result = await productVariantService.getVariantBySku(sku);

        return sendOk({
            reply,
            message: "Product variant retrieved successfully",
            data: result,
        });
    }

    /**
     * Updates an existing variant's pricing, SKU, barcode, status, or attribute associations.
     */
    async updateVariant(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as VariantIdParam;
        const body = updateProductVariantSchema.parse(request.body);
        const result = await productVariantService.updateVariant(id, body, request.user);

        return sendOk({
            reply,
            message: "Product variant updated successfully",
            data: result,
        });
    }

    /**
     * Deletes a variant from the product catalog.
     */
    async deleteVariant(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as VariantIdParam;
        const result = await productVariantService.deleteVariant(id, request.user);

        return sendOk({
            reply,
            message: "Product variant deleted successfully",
            data: result,
        });
    }

    /**
     * Batch creates multiple variants for a product in a single transaction.
     */
    async batchCreateVariants(request: FastifyRequest, reply: FastifyReply) {
        const { productId } = request.params as ProductIdParam;
        const body = batchCreateVariantsSchema.parse(request.body);
        const result = await productVariantService.batchCreateVariants(productId, body, request.user);

        return sendCreated({
            reply,
            message: "Product variants created successfully in batch",
            data: result,
        });
    }
}

export const productVariantController = new ProductVariantController();
