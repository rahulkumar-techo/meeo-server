import { describe, it, expect } from "vitest";
import { fuzzySearchItems, tokenizeSearchQuery } from "@/common/utils/fuzzySearch.js";

describe("fuzzySearch utility", () => {
    const sampleProducts = [
        {
            id: "1",
            name: "NovaTech AirBuds Pro ANC",
            brandName: "NovaTech",
            categoryName: "Electronics",
            skus: "SKU-MEEO-001",
            description: "Active noise cancelling wireless earbuds",
        },
        {
            id: "2",
            name: "UrbanThread Essential Crew Tee",
            brandName: "UrbanThread",
            categoryName: "Fashion",
            skus: "SKU-MEEO-003",
            description: "Organic cotton t-shirt",
        },
        {
            id: "3",
            name: "PulseFit Pro Yoga Mat 6mm",
            brandName: "PulseFit",
            categoryName: "Sports & Fitness",
            skus: "SKU-MEEO-006",
            description: "Non-slip TPE exercise mat",
        },
    ];

    it("tokenizes queries cleanly", () => {
        expect(tokenizeSearchQuery("  NovaTech, AirBuds | Pro  ")).toEqual(["novatech", "airbuds", "pro"]);
    });

    it("matches typos with fuzzy tolerance", () => {
        const results = fuzzySearchItems(sampleProducts, "erbuds", {
            keys: [{ name: "name", weight: 3 }, { name: "description", weight: 1 }],
        });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0]!.id).toBe("1");
    });

    it("matches tokens spread across brand, category, and title", () => {
        const results = fuzzySearchItems(sampleProducts, "novatek electroncs", {
            keys: [
                { name: "name", weight: 3 },
                { name: "brandName", weight: 2.5 },
                { name: "categoryName", weight: 2 },
                { name: "skus", weight: 2 },
            ],
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.id).toBe("1");
    });

    it("matches SKU tokens directly", () => {
        const results = fuzzySearchItems(sampleProducts, "MEEO-006", {
            keys: [
                { name: "name", weight: 3 },
                { name: "skus", weight: 2.5 },
            ],
        });
        expect(results.length).toBeGreaterThan(0);
        expect(results[0]!.id).toBe("3");
    });
});
