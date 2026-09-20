import { prisma } from "@/lib/prisma.js";
import type { ProductStatus } from "@/generated/prisma/client.js";
import { cacheService } from "@/common/cache/cache.service.js";
import { CACHE_KEYS, CACHE_TTL } from "@/common/cache/cache.keys.js";

export interface CategoryTreeNode {
    id: string;
    parentId: string | null;
    createdById: string | null;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    status: ProductStatus;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    children: CategoryTreeNode[];
}

export class CategoryHierarchyService {
    /**
     * Builds and returns a complete hierarchical category tree.
     */
    async getCategoryTree(statusFilter?: ProductStatus): Promise<CategoryTreeNode[]> {
        return cacheService.getOrSet(
            CACHE_KEYS.CATEGORY.TREE(statusFilter),
            async () => {
                const where = statusFilter ? { status: statusFilter } : {};
                const categories = await prisma.category.findMany({
                    where,
                    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                });

                const categoryMap = new Map<string, CategoryTreeNode>();
                const rootNodes: CategoryTreeNode[] = [];

                for (const cat of categories) {
                    categoryMap.set(cat.id, {
                        ...cat,
                        children: [],
                    });
                }

                for (const cat of categories) {
                    const node = categoryMap.get(cat.id)!;
                    if (cat.parentId && categoryMap.has(cat.parentId)) {
                        categoryMap.get(cat.parentId)!.children.push(node);
                    } else {
                        rootNodes.push(node);
                    }
                }

                return rootNodes;
            },
            CACHE_TTL.CATEGORY_TREE,
        );
    }

    /**
     * Helper to detect if potentialDescendantId is currently a descendant of potentialAncestorId.
     */
    async isDescendantOf(potentialDescendantId: string, potentialAncestorId: string): Promise<boolean> {
        let currentId: string | null = potentialDescendantId;
        const visited = new Set<string>();

        while (currentId) {
            if (currentId === potentialAncestorId) {
                return true;
            }
            if (visited.has(currentId)) {
                break;
            }
            visited.add(currentId);

            const cat: { parentId: string | null } | null = await prisma.category.findUnique({
                where: { id: currentId },
                select: { parentId: true },
            });

            currentId = cat?.parentId ?? null;
        }

        return false;
    }

    /**
     * Invalidates category caches and discovery feeds.
     */
    async invalidateCategoryCache(id?: string, ...slugs: (string | undefined)[]) {
        const promises: Promise<any>[] = [
            cacheService.invalidatePattern("cache:category:*"),
            cacheService.invalidatePattern("cache:discovery:*"),
        ];

        if (id) {
            promises.push(cacheService.del(CACHE_KEYS.CATEGORY.BY_ID(id)));
        }
        for (const slug of slugs) {
            if (slug) {
                promises.push(cacheService.del(CACHE_KEYS.CATEGORY.BY_SLUG(slug)));
            }
        }

        await Promise.allSettled(promises);
    }
}

export const categoryHierarchyService = new CategoryHierarchyService();
