import Fuse, { type FuseOptionKey, type IFuseOptions } from "fuse.js";

export interface FuzzySearchOptions<T> {
    keys: FuseOptionKey<T>[];
    threshold?: number;
    limit?: number;
    /** Require all query tokens to match when multiple tokens are provided (falls back to any-token match if none match all). */
    preferAllTokens?: boolean;
}

/**
 * Splits a raw user query into normalized lowercase search tokens.
 */
export function tokenizeSearchQuery(query: string): string[] {
    return Array.from(
        new Set(
            query
                .trim()
                .toLowerCase()
                .split(/[\s,;|/]+/)
                .map((token) => token.trim())
                .filter((token) => token.length > 0),
        ),
    );
}

/**
 * Builds a Prisma OR filter across multiple fields for tokenized SQL candidate pre-filtering.
 */
export function buildTokenizedWhereOr(
    tokens: string[],
    buildFieldFilters: (token: string) => Record<string, unknown>[],
): Record<string, unknown>[] {
    if (tokens.length === 0) return [];
    return tokens.flatMap((token) => buildFieldFilters(token));
}

/**
 * Runs tokenized, multi-field fuzzy search using Fuse.js and returns items ranked by relevance.
 * Handles typos, partial words, and tokens spread across different fields (e.g. brand + category + title).
 */
export function fuzzySearchItems<T>(
    items: T[],
    rawQuery: string,
    options: FuzzySearchOptions<T>,
): T[] {
    const trimmed = rawQuery.trim();
    if (!trimmed || items.length === 0) return items;

    const tokens = tokenizeSearchQuery(trimmed);
    if (tokens.length === 0) return items;

    const fuseOptions: IFuseOptions<T> = {
        keys: options.keys,
        includeScore: true,
        ignoreLocation: true,
        threshold: options.threshold ?? 0.42,
        minMatchCharLength: tokens.some((t) => t.length === 1) ? 1 : 2,
        shouldSort: true,
    };

    const fuse = new Fuse(items, fuseOptions);

    // Track per-item matched token count and accumulated relevance score
    const scoreMap = new Map<number, { item: T; matchedTokens: number; score: number }>();

    const addMatch = (refIndex: number, item: T, fuseScore: number, isTokenMatch: boolean) => {
        const relevance = Math.max(0, 1 - fuseScore);
        const existing = scoreMap.get(refIndex);
        if (existing) {
            if (isTokenMatch) existing.matchedTokens += 1;
            existing.score += relevance;
        } else {
            scoreMap.set(refIndex, {
                item,
                matchedTokens: isTokenMatch ? 1 : 0,
                score: relevance,
            });
        }
    };

    for (const token of tokens) {
        const tokenResults = fuse.search(token);
        for (const res of tokenResults) {
            addMatch(res.refIndex, res.item, res.score ?? 0.5, true);
        }
    }

    // Add full-query phrase bonus when multi-token queries match closely
    if (tokens.length > 1) {
        const phraseResults = fuse.search(trimmed);
        for (const res of phraseResults) {
            const existing = scoreMap.get(res.refIndex);
            if (existing) {
                existing.score += Math.max(0, 1 - (res.score ?? 0.5)) * 1.5;
            }
        }
    }

    let ranked = Array.from(scoreMap.values());

    if (options.preferAllTokens !== false && tokens.length > 1) {
        const allMatched = ranked.filter((entry) => entry.matchedTokens >= tokens.length);
        if (allMatched.length > 0) {
            ranked = allMatched;
        }
    }

    ranked.sort((a, b) => {
        if (b.matchedTokens !== a.matchedTokens) {
            return b.matchedTokens - a.matchedTokens;
        }
        return b.score - a.score;
    });

    const result = ranked.map((entry) => entry.item);
    return options.limit ? result.slice(0, options.limit) : result;
}
