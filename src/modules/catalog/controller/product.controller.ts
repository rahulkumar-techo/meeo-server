import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { AppError } from "@/common/errors/app-error.js";
import { productService } from "../services/product.service.js";
import {
    createProductSchema,
    updateProductSchema,
    productQuerySchema,
    addProductImageSchema,
    uploadProductImagePayloadSchema,
    reorderProductImagesSchema,
} from "../validations/product.validation.js";

type IdParam = { id: string };
type SlugParam = { slug: string };
type ImageParam = { id: string; imageId: string };

export class ProductController {
    /**
     * Creates a new product.
     */
    async createProduct(request: FastifyRequest, reply: FastifyReply) {
        const body = createProductSchema.parse(request.body);
        const creatorId = request.user?.id;
        const result = await productService.createProduct(body, creatorId);
        return sendCreated({
            reply,
            message: "Product created successfully",
            data: result,
        });
    }

    /**
     * Lists products with rich filtering, search, pagination, and sorting.
     */
    async listProducts(request: FastifyRequest, reply: FastifyReply) {
        const query = productQuerySchema.parse(request.query);
        const result = await productService.listProducts(query);
        return sendOk({
            reply,
            message: "Products retrieved successfully",
            data: result,
        });
    }

    /**
     * Retrieves a single product by ID.
     */
    async getProduct(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const result = await productService.getProductById(id);
        return sendOk({
            reply,
            message: "Product retrieved successfully",
            data: result,
        });
    }

    /**
     * Retrieves a single product by slug.
     */
    async getProductBySlug(request: FastifyRequest, reply: FastifyReply) {
        const { slug } = request.params as SlugParam;
        const result = await productService.getProductBySlug(slug);
        return sendOk({
            reply,
            message: "Product retrieved successfully",
            data: result,
        });
    }

    /**
     * Updates an existing product's details or SEO fields.
     */
    async updateProduct(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const body = updateProductSchema.parse(request.body);
        const result = await productService.updateProduct(id, body, request.user);
        return sendOk({
            reply,
            message: "Product updated successfully",
            data: result,
        });
    }

    /**
     * Publishes a product (transitions to ACTIVE).
     */
    async publishProduct(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const result = await productService.publishProduct(id, request.user);
        return sendOk({
            reply,
            message: "Product published successfully",
            data: result,
        });
    }

    /**
     * Moves a product back to DRAFT.
     */
    async draftProduct(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const result = await productService.draftProduct(id, request.user);
        return sendOk({
            reply,
            message: "Product moved to draft successfully",
            data: result,
        });
    }

    /**
     * Archives a product (transitions to ARCHIVED).
     */
    async archiveProduct(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const result = await productService.archiveProduct(id, request.user);
        return sendOk({
            reply,
            message: "Product archived successfully",
            data: result,
        });
    }

    /**
     * Deletes a product (soft-deletes unless permanent query flag is specified).
     */
    async deleteProduct(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const permanent = (request.query as { permanent?: string }).permanent === "true";
        const result = await productService.deleteProduct(id, request.user, permanent);
        return sendOk({
            reply,
            message: result.permanent ? "Product deleted permanently" : "Product archived / soft-deleted successfully",
            data: result,
        });
    }

    // ==========================================
    // Product Image Endpoints
    // ==========================================

    /**
     * Uploads an image file or base64/URL payload to ImageKit and attaches to the product.
     */
    async uploadImage(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;

        if (request.isMultipart()) {
            const data = await request.file();
            if (!data) {
                throw new AppError("No file provided in multipart request", 400);
            }

            const buffer = await data.toBuffer();
            const altTextValue = (data.fields?.altText as any)?.value;
            const sortOrderValue = (data.fields?.sortOrder as any)?.value;
            const sortOrder = sortOrderValue !== undefined && sortOrderValue !== "" ? Number(sortOrderValue) : undefined;

            const result = await productService.uploadImage(
                id,
                buffer,
                data.filename || `product-${id}-${Date.now()}`,
                altTextValue || null,
                sortOrder,
                data.mimetype,
                request.user,
            );

            return sendCreated({
                reply,
                message: "Product image uploaded successfully to ImageKit",
                data: result,
            });
        }

        // Handle JSON base64 / URL payload
        const body = uploadProductImagePayloadSchema.parse(request.body);
        const result = await productService.uploadImage(
            id,
            body.file,
            body.fileName || `product-${id}-${Date.now()}`,
            body.altText,
            body.sortOrder,
            undefined,
            request.user,
        );

        return sendCreated({
            reply,
            message: "Product image uploaded successfully to ImageKit",
            data: result,
        });
    }

    /**
     * Adds an existing image URL to a product.
     */
    async addImage(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const body = addProductImageSchema.parse(request.body);
        const result = await productService.addImage(id, body, request.user);
        return sendCreated({
            reply,
            message: "Product image added successfully",
            data: result,
        });
    }

    /**
     * Deletes an image from a product (and removes from ImageKit if tracked).
     */
    async deleteImage(request: FastifyRequest, reply: FastifyReply) {
        const { id, imageId } = request.params as ImageParam;
        const result = await productService.deleteImage(id, imageId, request.user);
        return sendOk({
            reply,
            message: "Product image deleted successfully",
            data: result,
        });
    }

    /**
     * Reorders product images.
     */
    async reorderImages(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const body = reorderProductImagesSchema.parse(request.body);
        const result = await productService.reorderImages(id, body, request.user);
        return sendOk({
            reply,
            message: "Product images reordered successfully",
            data: result,
        });
    }

    /**
     * Retrieves client-side authentication tokens for direct browser uploads.
     */
    async getImageKitAuth(request: FastifyRequest, reply: FastifyReply) {
        const result = productService.getImageKitAuth(request.user);
        return sendOk({
            reply,
            message: "ImageKit auth parameters generated successfully",
            data: result,
        });
    }
}

export const productController = new ProductController();

