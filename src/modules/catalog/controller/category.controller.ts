import type { FastifyReply, FastifyRequest } from "fastify";
import { sendCreated, sendOk } from "@/common/utils/response.js";
import { categoryService } from "../services/category.service.js";
import {
    createCategorySchema,
    updateCategorySchema,
    categoryQuerySchema,
} from "../validations/category.validation.js";
import type { ProductStatus } from "@/generated/prisma/client.js";

type IdParam = { id: string };
type SlugParam = { slug: string };

export class CategoryController {
    /**
     * Creates a new category.
     */
    async createCategory(request: FastifyRequest, reply: FastifyReply) {
        const body = createCategorySchema.parse(request.body);
        const creatorId = request.user?.id;
        const result = await categoryService.createCategory(body, creatorId);
        return sendCreated({
            reply,
            message: "Category created successfully",
            data: result,
        });
    }

    /**
     * Lists categories with optional search and filters.
     */
    async listCategories(request: FastifyRequest, reply: FastifyReply) {
        const query = categoryQuerySchema.parse(request.query);
        const result = await categoryService.listCategories(query);
        return sendOk({
            reply,
            message: "Categories retrieved successfully",
            data: result,
        });
    }

    /**
     * Returns a complete hierarchical tree of categories.
     */
    async getCategoryTree(request: FastifyRequest, reply: FastifyReply) {
        const status = (request.query as { status?: ProductStatus }).status;
        const result = await categoryService.getCategoryTree(status);
        return sendOk({
            reply,
            message: "Category tree retrieved successfully",
            data: result,
        });
    }

    /**
     * Retrieves a single category by ID.
     */
    async getCategory(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const result = await categoryService.getCategoryById(id);
        return sendOk({
            reply,
            message: "Category retrieved successfully",
            data: result,
        });
    }

    /**
     * Retrieves a single category by slug.
     */
    async getCategoryBySlug(request: FastifyRequest, reply: FastifyReply) {
        const { slug } = request.params as SlugParam;
        const result = await categoryService.getCategoryBySlug(slug);
        return sendOk({
            reply,
            message: "Category retrieved successfully",
            data: result,
        });
    }

    /**
     * Updates an existing category.
     */
    async updateCategory(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const body = updateCategorySchema.parse(request.body);
        const result = await categoryService.updateCategory(id, body, request.user);
        return sendOk({
            reply,
            message: "Category updated successfully",
            data: result,
        });
    }

    /**
     * Deletes a category.
     */
    async deleteCategory(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as IdParam;
        const result = await categoryService.deleteCategory(id, request.user);
        return sendOk({
            reply,
            message: "Category deleted successfully",
            data: result,
        });
    }
}

export const categoryController = new CategoryController();
