import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import type { AuthorizationContext } from "@/plugins/auth.plugin.js";
import { verifyCatalogOwnershipOrPermission } from "../catalog-auth.helper.js";
import { slugify } from "../utils/slug.util.js";
import { categoryHierarchyService, type CategoryTreeNode } from "./categoryHierarchy.service.js";
import type { CreateCategoryInput, UpdateCategoryInput, CategoryQueryInput } from "../validations/category.validation.js";
import type { Prisma, ProductStatus } from "@/generated/prisma/client.js";
import { cacheService } from "@/common/cache/cache.service.js";
import { CACHE_KEYS, CACHE_TTL } from "@/common/cache/cache.keys.js";

export { categoryHierarchyService, type CategoryTreeNode } from "./categoryHierarchy.service.js";

export class CategoryService {
    /**
     * Creates a new category.
     */
    async createCategory(input: CreateCategoryInput, creatorId?: string) {
        const slug = input.slug || slugify(input.name);

        if (!slug) {
            throw new AppError("Category name must contain valid alphanumeric characters for slug generation", 400);
        }

        const existingWithSlug = await prisma.category.findUnique({
            where: { slug },
        });

        if (existingWithSlug) {
            throw new AppError(`A category with slug '${slug}' already exists`, 409);
        }

        if (input.parentId) {
            const parent = await prisma.category.findUnique({
                where: { id: input.parentId },
            });
            if (!parent) {
                throw new AppError("Parent category not found", 404);
            }
        }

        const data: Prisma.CategoryUncheckedCreateInput = {
            name: input.name,
            slug,
            description: input.description ?? null,
            imageUrl: input.imageUrl ?? null,
            status: input.status,
            sortOrder: input.sortOrder,
            parentId: input.parentId ?? null,
            createdById: creatorId ?? null,
        };

        const result = await prisma.category.create({
            data,
            include: {
                parent: { select: { id: true, name: true, slug: true } },
            },
        });

        await categoryHierarchyService.invalidateCategoryCache();
        return result;
    }

    /**
     * Updates an existing category.
     */
    async updateCategory(id: string, input: UpdateCategoryInput, user?: AuthorizationContext) {
        const existing = await prisma.category.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new AppError("Category not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            existing.createdById,
            user,
            [PERMISSIONS.CATEGORY_UPDATE, PERMISSIONS.PRODUCT_UPDATE],
        );

        let slug = existing.slug;
        if (input.slug || (input.name && input.name !== existing.name && !input.slug)) {
            const candidateSlug = input.slug || slugify(input.name!);
            if (candidateSlug !== existing.slug) {
                const existingWithSlug = await prisma.category.findUnique({
                    where: { slug: candidateSlug },
                });
                if (existingWithSlug && existingWithSlug.id !== id) {
                    throw new AppError(`A category with slug '${candidateSlug}' already exists`, 409);
                }
                slug = candidateSlug;
            }
        }

        if (input.parentId !== undefined && input.parentId !== existing.parentId) {
            if (input.parentId === id) {
                throw new AppError("A category cannot be its own parent", 400);
            }

            if (input.parentId !== null) {
                const parent = await prisma.category.findUnique({
                    where: { id: input.parentId },
                });
                if (!parent) {
                    throw new AppError("Parent category not found", 404);
                }

                const isDescendant = await categoryHierarchyService.isDescendantOf(input.parentId, id);
                if (isDescendant) {
                    throw new AppError("Cannot set a descendant category as the parent (circular hierarchy detected)", 400);
                }
            }
        }

        const data: Prisma.CategoryUncheckedUpdateInput = {
            slug,
            ...(input.name !== undefined && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
            ...(input.status !== undefined && { status: input.status }),
            ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
            ...(input.parentId !== undefined && { parentId: input.parentId }),
        };

        const updated = await prisma.category.update({
            where: { id },
            data,
            include: {
                parent: { select: { id: true, name: true, slug: true } },
                children: { select: { id: true, name: true, slug: true, status: true, sortOrder: true } },
            },
        });

        await categoryHierarchyService.invalidateCategoryCache(id, existing.slug, updated.slug);
        return updated;
    }

    /**
     * Deletes a category and reassigns children to parent.
     */
    async deleteCategory(id: string, user?: AuthorizationContext) {
        const existing = await prisma.category.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { products: true, children: true },
                },
            },
        });

        if (!existing) {
            throw new AppError("Category not found", 404);
        }

        verifyCatalogOwnershipOrPermission(
            existing.createdById,
            user,
            [PERMISSIONS.CATEGORY_DELETE, PERMISSIONS.PRODUCT_DELETE],
        );

        if (existing._count.products > 0) {
            throw new AppError(
                `Cannot delete category with ${existing._count.products} associated product(s). Please reassign or delete the products first.`,
                400,
            );
        }

        const result = await prisma.$transaction(async (tx) => {
            if (existing._count.children > 0) {
                await tx.category.updateMany({
                    where: { parentId: id },
                    data: { parentId: existing.parentId },
                });
            }

            await tx.category.delete({
                where: { id },
            });

            return { id, name: existing.name, deleted: true };
        });

        await categoryHierarchyService.invalidateCategoryCache(id, existing.slug);
        return result;
    }

    /**
     * Retrieves a single category by ID with its parent and immediate children.
     */
    async getCategoryById(id: string) {
        return cacheService.getOrSet(
            CACHE_KEYS.CATEGORY.BY_ID(id),
            async () => {
                const category = await prisma.category.findUnique({
                    where: { id },
                    include: {
                        parent: true,
                        children: { orderBy: { sortOrder: "asc" } },
                        _count: { select: { products: true } },
                    },
                });

                if (!category) {
                    throw new AppError("Category not found", 404);
                }

                return category;
            },
            CACHE_TTL.CATEGORY_DETAIL,
        );
    }

    /**
     * Retrieves a single category by slug.
     */
    async getCategoryBySlug(slug: string) {
        return cacheService.getOrSet(
            CACHE_KEYS.CATEGORY.BY_SLUG(slug),
            async () => {
                const category = await prisma.category.findUnique({
                    where: { slug },
                    include: {
                        parent: true,
                        children: { orderBy: { sortOrder: "asc" } },
                        _count: { select: { products: true } },
                    },
                });

                if (!category) {
                    throw new AppError("Category not found", 404);
                }

                return category;
            },
            CACHE_TTL.CATEGORY_DETAIL,
        );
    }

    /**
     * Lists categories as a flat, paginated list with optional filters and search.
     */
    async listCategories(query: CategoryQueryInput) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: Prisma.CategoryWhereInput = {};

        if (query.status) {
            where.status = query.status;
        }

        if (query.parentId !== undefined) {
            if (query.parentId === "null" || query.parentId === "root") {
                where.parentId = null;
            } else {
                where.parentId = query.parentId;
            }
        }

        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: "insensitive" } },
                { description: { contains: query.search, mode: "insensitive" } },
                { slug: { contains: query.search, mode: "insensitive" } },
            ];
        }

        const [total, categories] = await Promise.all([
            prisma.category.count({ where }),
            prisma.category.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [query.sortBy ?? "sortOrder"]: query.sortOrder ?? "asc" },
                include: {
                    parent: { select: { id: true, name: true, slug: true } },
                    _count: { select: { products: true, children: true } },
                },
            }),
        ]);

        return {
            items: categories,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    getCategoryTree(statusFilter?: ProductStatus) {
        return categoryHierarchyService.getCategoryTree(statusFilter);
    }
}

export const categoryService = new CategoryService();
