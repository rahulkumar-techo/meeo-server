import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { AppError } from "@/common/errors/app-error.js";
import { productVariantService } from "../services/productVariant.service.js";
import {
    createProductVariantSchema,
    updateProductVariantSchema,
    batchCreateVariantsSchema,
    productVariantQuerySchema,
} from "../validations/productVariant.validation.js";
import {
    addProductImageSchema,
    uploadProductImagePayloadSchema,
    reorderProductImagesSchema,
} from "../validations/product.validation.js";

type ProductIdParam = { productId: string };
type VariantIdParam = { id: string };
type SkuParam = { sku: string };
type VariantImageParam = { id: string; imageId: string };

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

    /**
     * Uploads an image file or base64/URL payload to ImageKit and attaches to the product variant.
     */
    async uploadVariantImage(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as VariantIdParam;

        if (request.isMultipart()) {
            const data = await request.file();
            if (!data) {
                throw new AppError("No file provided in multipart request", 400);
            }

            const buffer = await data.toBuffer();
            const altTextValue = (data.fields?.altText as any)?.value;
            const sortOrderValue = (data.fields?.sortOrder as any)?.value;
            const sortOrder = sortOrderValue !== undefined && sortOrderValue !== "" ? Number(sortOrderValue) : undefined;

            const result = await productVariantService.uploadVariantImage(
                id,
                buffer,
                data.filename || `variant-${id}-${Date.now()}`,
                altTextValue || null,
                sortOrder,
                data.mimetype,
                request.user,
            );

            return sendCreated({
                reply,
                message: "Variant image uploaded successfully to ImageKit",
                data: result,
            });
        }

        const body = uploadProductImagePayloadSchema.parse(request.body);
        const result = await productVariantService.uploadVariantImage(
            id,
            body.file,
            body.fileName || `variant-${id}-${Date.now()}`,
            body.altText,
            body.sortOrder,
            undefined,
            request.user,
        );

        return sendCreated({
            reply,
            message: "Variant image uploaded successfully to ImageKit",
            data: result,
        });
    }

    /**
     * Adds an existing image URL to a variant.
     */
    async addVariantImage(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as VariantIdParam;
        const body = addProductImageSchema.parse(request.body);
        const result = await productVariantService.addVariantImage(id, body, request.user);
        return sendCreated({
            reply,
            message: "Variant image added successfully",
            data: result,
        });
    }

    /**
     * Deletes an image from a variant.
     */
    async deleteVariantImage(request: FastifyRequest, reply: FastifyReply) {
        const { id, imageId } = request.params as VariantImageParam;
        const result = await productVariantService.deleteVariantImage(id, imageId, request.user);
        return sendOk({
            reply,
            message: "Variant image deleted successfully",
            data: result,
        });
    }

    /**
     * Reorders images for a variant.
     */
    async reorderVariantImages(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as VariantIdParam;
        const body = reorderProductImagesSchema.parse(request.body);
        const result = await productVariantService.reorderVariantImages(id, body, request.user);
        return sendOk({
            reply,
            message: "Variant images reordered successfully",
            data: result,
        });
    }
}

export const productVariantController = new ProductVariantController();

