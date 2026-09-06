import { describe, expect, it } from "vitest";
import {
    encodeCursor,
    decodeCursor,
    paginateWithCursor,
} from "../common/utils/cursorPagination.js";

describe("Cursor Pagination Unit Tests", () => {
    describe("encodeCursor & decodeCursor", () => {
        it("encodes and decodes simple cursor payload", () => {
            const payload = { id: "prod_12345" };
            const encoded = encodeCursor(payload);

            expect(typeof encoded).toBe("string");
            expect(encoded).not.toContain("="); // Base64URL without padding

            const decoded = decodeCursor(encoded);
            expect(decoded).toEqual(payload);
        });

        it("encodes and decodes compound cursor payload", () => {
            const payload = { id: "prod_999", createdAt: "2026-09-06T12:00:00.000Z", score: 4.5 };
            const encoded = encodeCursor(payload);
            const decoded = decodeCursor(encoded);

            expect(decoded).toEqual(payload);
        });

        it("returns null for invalid or corrupted cursor string", () => {
            expect(decodeCursor("invalid-not-base64!!")).toBeNull();
            expect(decodeCursor("")).toBeNull();
            expect(decodeCursor("   ")).toBeNull();
        });

        it("returns null if payload is not a valid JSON object", () => {
            // Base64 of string "hello"
            const nonJsonBase64 = Buffer.from('"hello"').toString("base64url");
            expect(decodeCursor(nonJsonBase64)).toBeNull();
        });
    });

    describe("paginateWithCursor", () => {
        const sampleItems = [
            { id: "item-1", name: "Alpha" },
            { id: "item-2", name: "Beta" },
            { id: "item-3", name: "Gamma" },
            { id: "item-4", name: "Delta" },
            { id: "item-5", name: "Epsilon" },
        ];

        it("slices items when limit is exceeded and produces next/end cursor", async () => {
            // Simulating query with take = limit + 1
            const queryFn = async (args: { take: number; skip?: number; cursor?: { id: string } }) => {
                let list = [...sampleItems];
                if (args.cursor) {
                    const idx = list.findIndex((x) => x.id === args.cursor?.id);
                    if (idx !== -1) {
                        list = list.slice(idx + (args.skip ?? 0));
                    }
                }
                return list.slice(0, args.take);
            };

            const result = await paginateWithCursor(queryFn, 3);

            expect(result.items.length).toBe(3);
            expect(result.items[0]!.id).toBe("item-1");
            expect(result.items[2]!.id).toBe("item-3");
            expect(result.pageInfo.hasNextPage).toBe(true);
            expect(result.pageInfo.hasPreviousPage).toBe(false);
            expect(result.pageInfo.startCursor).not.toBeNull();
            expect(result.pageInfo.endCursor).not.toBeNull();

            const decodedEnd = decodeCursor(result.pageInfo.endCursor!);
            expect(decodedEnd).toEqual({ id: "item-3" });
        });

        it("returns hasNextPage = false when results do not exceed limit", async () => {
            const queryFn = async (args: { take: number }) => sampleItems.slice(0, 2);
            const result = await paginateWithCursor(queryFn, 3);

            expect(result.items.length).toBe(2);
            expect(result.pageInfo.hasNextPage).toBe(false);
            expect(result.pageInfo.count).toBe(2);
        });

        it("handles empty items array gracefully", async () => {
            const queryFn = async () => [];
            const result = await paginateWithCursor(queryFn, 10);

            expect(result.items).toEqual([]);
            expect(result.pageInfo.hasNextPage).toBe(false);
            expect(result.pageInfo.startCursor).toBeNull();
            expect(result.pageInfo.endCursor).toBeNull();
        });
    });
});
