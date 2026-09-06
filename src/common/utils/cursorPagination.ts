/**
 * High-Performance Cursor-Based Pagination Utility
 * Uses Base64URL-encoded compound cursors for constant-time O(1) pagination at massive scale.
 */

export interface CursorPayload {
    id: string;
    [key: string]: any;
}

export interface PageInfo {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
    count: number;
}

export interface CursorPaginationResult<T> {
    items: T[];
    pageInfo: PageInfo;
}

/**
 * Encodes cursor data object to a base64url string.
 */
export function encodeCursor(payload: CursorPayload): string {
    const jsonStr = JSON.stringify(payload);
    return Buffer.from(jsonStr, "utf-8").toString("base64url");
}

/**
 * Decodes a base64url cursor string back into an object.
 */
export function decodeCursor(cursor?: string | null): CursorPayload | null {
    if (!cursor || typeof cursor !== "string") return null;
    try {
        const jsonStr = Buffer.from(cursor, "base64url").toString("utf-8");
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === "object" && typeof parsed.id === "string") {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Executes a cursor-paginated Prisma query safely.
 */
export async function paginateWithCursor<T extends { id: string }>(
    queryFn: (args: { take: number; skip?: number; cursor?: { id: string } }) => Promise<T[]>,
    limit: number = 20,
    rawCursor?: string | null,
): Promise<CursorPaginationResult<T>> {
    const decoded = decodeCursor(rawCursor);
    const take = limit + 1; // Fetch 1 extra to determine hasNextPage

    const items = await queryFn({
        take,
        ...(decoded?.id ? { cursor: { id: decoded.id }, skip: 1 } : {}),
    });

    const hasNextPage = items.length > limit;
    const paginatedItems = hasNextPage ? items.slice(0, limit) : items;

    const startCursor = paginatedItems.length > 0 ? encodeCursor({ id: paginatedItems[0]!.id }) : null;
    const endCursor =
        paginatedItems.length > 0 ? encodeCursor({ id: paginatedItems[paginatedItems.length - 1]!.id }) : null;

    return {
        items: paginatedItems,
        pageInfo: {
            hasNextPage,
            hasPreviousPage: Boolean(decoded?.id),
            startCursor,
            endCursor,
            count: paginatedItems.length,
        },
    };
}
