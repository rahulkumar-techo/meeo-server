import { prisma } from "@/lib/prisma.js";
import { AppError } from "@/common/errors/app-error.js";
import { PERMISSIONS } from "@/modules/authorization/permission.constants.js";
import type { AuthorizationContext } from "@/plugins/auth.plugin.js";
import { verifyCatalogOwnershipOrPermission } from "../catalog-auth.helper.js";
import { slugify } from "../utils/slug.util.js";
import type { CreateBrandInput, UpdateBrandInput, BrandQueryInput } from "../validations/brand.validation.js";
import type { Prisma } from "@/generated/prisma/client.js";

export class BrandService {
    /**
     * Creates a new brand.
     * Automatically generates a slug if not provided, and verifies slug uniqueness.
     */
    async createBrand(input: CreateBrandInput, creatorId?: string) {
        const slug = input.slug || slugify(input.name);

        if (!slug) {
            throw new AppError("Brand name must contain valid alphanumeric characters for slug generation", 400);
        }

        const existingWithSlug = await prisma.brand.findUnique({
            where: { slug },
        });

        if (existingWithSlug) {
            throw new AppError(`A brand with slug '${slug}' already exists`, 409);
        }

        const data: Prisma.BrandUncheckedCreateInput = {
            name: input.name,
            slug,
            logoUrl: input.logoUrl ?? null,
            description: input.description ?? null,
            status: input.status,
            createdById: creatorId ?? null,
        };

        return prisma.brand.create({
            data,
        });
    }

    /**
     * Updates an existing brand.
     * Enforces ownership or RBAC permission, and validates slug uniqueness.
     */
    async updateBrand(id: string, input: UpdateBrandInput, user?: AuthorizationContext) {
        const existing = await prisma.brand.findUnique({
            where: { id },
        });

        if (!existing) {
            throw new AppError("Brand not found", 404);
        }

        // Check ownership or RBAC permission
        verifyCatalogOwnershipOrPermission(
            existing.createdById,
            user,
            [PERMISSIONS.BRAND_UPDATE, PERMISSIONS.PRODUCT_UPDATE],
        );

        let slug = existing.slug;
        if (input.slug || (input.name && input.name !== existing.name && !input.slug)) {
            const candidateSlug = input.slug || slugify(input.name!);
            if (candidateSlug !== existing.slug) {
                const existingWithSlug = await prisma.brand.findUnique({
                    where: { slug: candidateSlug },
                });
                if (existingWithSlug && existingWithSlug.id !== id) {
                    throw new AppError(`A brand with slug '${candidateSlug}' already exists`, 409);
                }
                slug = candidateSlug;
            }
        }

        const data: Prisma.BrandUncheckedUpdateInput = {
            slug,
            ...(input.name !== undefined && { name: input.name }),
            ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.status !== undefined && { status: input.status }),
        };

        return prisma.brand.update({
            where: { id },
            data,
        });
    }

    /**
     * Deletes a brand.
     * Enforces authorization and prevents deleting brands that still have assigned products.
     */
    async deleteBrand(id: string, user?: AuthorizationContext) {
        const existing = await prisma.brand.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { products: true },
                },
            },
        });

        if (!existing) {
            throw new AppError("Brand not found", 404);
        }

        // Check ownership or RBAC permission
        verifyCatalogOwnershipOrPermission(
            existing.createdById,
            user,
            [PERMISSIONS.BRAND_DELETE, PERMISSIONS.PRODUCT_DELETE],
        );

        if (existing._count.products > 0) {
            throw new AppError(
                `Cannot delete brand with ${existing._count.products} associated product(s). Reassign or delete products first.`,
                400,
            );
        }

        await prisma.brand.delete({
            where: { id },
        });

        return { id, name: existing.name, deleted: true };
    }

    /**
     * Retrieves a brand by ID.
     */
    async getBrandById(id: string) {
        const brand = await prisma.brand.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { products: true },
                },
            },
        });

        if (!brand) {
            throw new AppError("Brand not found", 404);
        }

        return brand;
    }

    /**
     * Retrieves a brand by slug.
     */
    async getBrandBySlug(slug: string) {
        const brand = await prisma.brand.findUnique({
            where: { slug },
            include: {
                _count: {
                    select: { products: true },
                },
            },
        });

        if (!brand) {
            throw new AppError("Brand not found", 404);
        }

        return brand;
    }

    /**
     * Lists brands with pagination, search, and status filtering.
     */
    async listBrands(query: BrandQueryInput) {
        const page = query.page;
        const limit = query.limit;
        const skip = (page - 1) * limit;

        const where: Prisma.BrandWhereInput = {};

        if (query.status) {
            where.status = query.status;
        }

        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: "insensitive" } },
                { description: { contains: query.search, mode: "insensitive" } },
                { slug: { contains: query.search, mode: "insensitive" } },
            ];
        }

        const [total, brands] = await Promise.all([
            prisma.brand.count({ where }),
            prisma.brand.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [query.sortBy]: query.sortOrder },
                include: {
                    _count: { select: { products: true } },
                },
            }),
        ]);

        return {
            items: brands,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
}

export const brandService = new BrandService();
