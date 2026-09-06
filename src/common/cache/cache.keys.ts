/**
 * Standardized Cache Key Generators and TTL Configurations
 */

export const CACHE_TTL = {
    ONE_MINUTE: 60,
    FIVE_MINUTES: 300,
    TEN_MINUTES: 600,
    FIFTEEN_MINUTES: 900,
    ONE_HOUR: 3600,
    ONE_DAY: 86400,
    // Semantic TTL aliases
    PRODUCT_DETAIL: 600,       // 10 minutes
    PRODUCT_LIST: 180,         // 3 minutes
    CATEGORY_TREE: 3600,       // 1 hour
    CATEGORY_DETAIL: 1800,     // 30 minutes
    DISCOVERY_FEEDS: 300,      // 5 minutes
    SEARCH_SUGGESTIONS: 600,   // 10 minutes
} as const;

export const CACHE_KEYS = {
    // Products
    PRODUCT: {
        BY_ID: (id: string) => `cache:product:id:${id}`,
        BY_SLUG: (slug: string) => `cache:product:slug:${slug}`,
        LIST: (hash: string) => `cache:product:list:${hash}`,
        PATTERN: () => "cache:product:*",
    },
    productById: (id: string) => `cache:product:id:${id}`,
    productBySlug: (slug: string) => `cache:product:slug:${slug}`,
    productList: (hash: string) => `cache:product:list:${hash}`,
    productPattern: () => "cache:product:*",
    productDetailPattern: (id: string, slug?: string) => [
        `cache:product:id:${id}`,
        ...(slug ? [`cache:product:slug:${slug}`] : []),
        "cache:product:list:*",
    ],

    // Categories
    CATEGORY: {
        TREE: (status?: string) => `cache:category:tree:${status ?? "ALL"}`,
        BY_ID: (id: string) => `cache:category:id:${id}`,
        BY_SLUG: (slug: string) => `cache:category:slug:${slug}`,
        LIST: (hash: string) => `cache:category:list:${hash}`,
        PATTERN: () => "cache:category:*",
    },
    categoryTree: (status?: string) => `cache:category:tree:${status ?? "ALL"}`,
    categoryById: (id: string) => `cache:category:id:${id}`,
    categoryBySlug: (slug: string) => `cache:category:slug:${slug}`,
    categoryList: (hash: string) => `cache:category:list:${hash}`,
    categoryPattern: () => "cache:category:*",

    // Discovery Feeds & Recommendations
    DISCOVERY: {
        FEATURED: (limit: number = 12, categoryId?: string) =>
            `cache:discovery:featured:${categoryId ?? "ALL"}:${limit}`,
        TRENDING: (limit: number = 12) => `cache:discovery:trending:${limit}`,
        NEW_ARRIVALS: (limit: number = 12, categoryId?: string) =>
            `cache:discovery:new_arrivals:${categoryId ?? "ALL"}:${limit}`,
        RELATED: (productId: string, limit: number = 8) =>
            `cache:discovery:related:${productId}:${limit}`,
        PATTERN: () => "cache:discovery:*",
    },
    discoveryFeatured: (categoryId?: string) => `cache:discovery:featured:${categoryId ?? "ALL"}`,
    discoveryTrending: () => "cache:discovery:trending",
    discoveryNewArrivals: () => "cache:discovery:new_arrivals",
    discoveryRelated: (productId: string) => `cache:discovery:related:${productId}`,
    discoveryPattern: () => "cache:discovery:*",

    // Search
    SEARCH: {
        FACETS: (hash: string) => `cache:search:facets:${hash}`,
        SUGGESTIONS: (query: string) => `cache:search:suggestions:${query.toLowerCase().trim()}`,
        PATTERN: () => "cache:search:*",
    },
    searchFacets: (hash: string) => `cache:search:facets:${hash}`,
    searchSuggestions: (query: string) => `cache:search:suggestions:${query.toLowerCase().trim()}`,
    searchPattern: () => "cache:search:*",
};

