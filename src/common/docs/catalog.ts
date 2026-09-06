/**
 * OpenAPI / Swagger schemas for Catalog Management (Categories, Brands, Products, Images).
 */

export const catalogTags = [
    { name: "Catalog - Categories", description: "Category management, hierarchy, and recursive tree" },
    { name: "Catalog - Brands", description: "Brand / Manufacturer management" },
    { name: "Catalog - Products", description: "Product catalog, status lifecycle (Draft, Publish, Archive), and SEO" },
    { name: "Catalog - Images", description: "Product image uploads, ordering, and deletion" },
];

export const catalogSchemas = {
    // ----------------------------------------------------
    // Category Schemas
    // ----------------------------------------------------
    createCategory: {
        type: "object",
        required: ["name"],
        properties: {
            name: { type: "string" },
            slug: { type: "string" },
            parentId: { type: ["string", "null"], format: "uuid" },
            description: { type: ["string", "null"] },
            imageUrl: { type: ["string", "null"], format: "uri" },
            status: { type: "string", enum: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"], default: "ACTIVE" },
            sortOrder: { type: "integer", default: 0 },
        },
    },

    updateCategory: {
        type: "object",
        properties: {
            name: { type: "string" },
            slug: { type: "string" },
            parentId: { type: ["string", "null"], format: "uuid" },
            description: { type: ["string", "null"] },
            imageUrl: { type: ["string", "null"], format: "uri" },
            status: { type: "string", enum: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] },
            sortOrder: { type: "integer" },
        },
    },

    categoryParams: {
        type: "object",
        required: ["id"],
        properties: {
            id: { type: "string", format: "uuid" },
        },
    },

    categorySlugParams: {
        type: "object",
        required: ["slug"],
        properties: {
            slug: { type: "string" },
        },
    },

    // ----------------------------------------------------
    // Brand Schemas
    // ----------------------------------------------------
    createBrand: {
        type: "object",
        required: ["name"],
        properties: {
            name: { type: "string" },
            slug: { type: "string" },
            logoUrl: { type: ["string", "null"], format: "uri" },
            description: { type: ["string", "null"] },
            status: { type: "string", enum: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"], default: "ACTIVE" },
        },
    },

    updateBrand: {
        type: "object",
        properties: {
            name: { type: "string" },
            slug: { type: "string" },
            logoUrl: { type: ["string", "null"], format: "uri" },
            description: { type: ["string", "null"] },
            status: { type: "string", enum: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] },
        },
    },

    brandParams: {
        type: "object",
        required: ["id"],
        properties: {
            id: { type: "string", format: "uuid" },
        },
    },

    brandSlugParams: {
        type: "object",
        required: ["slug"],
        properties: {
            slug: { type: "string" },
        },
    },

    // ----------------------------------------------------
    // Product Schemas
    // ----------------------------------------------------
    createProduct: {
        type: "object",
        required: ["name"],
        properties: {
            name: { type: "string" },
            slug: { type: "string" },
            description: { type: ["string", "null"] },
            categoryId: { type: ["string", "null"], format: "uuid" },
            brandId: { type: ["string", "null"], format: "uuid" },
            status: { type: "string", enum: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"], default: "DRAFT" },
            isFeatured: { type: "boolean", default: false },
            seoTitle: { type: ["string", "null"] },
            seoDescription: { type: ["string", "null"] },
            images: {
                type: "array",
                items: {
                    type: "object",
                    required: ["url"],
                    properties: {
                        url: { type: "string", format: "uri" },
                        altText: { type: ["string", "null"] },
                        sortOrder: { type: "integer", default: 0 },
                    },
                },
            },
        },
    },

    updateProduct: {
        type: "object",
        properties: {
            name: { type: "string" },
            slug: { type: "string" },
            description: { type: ["string", "null"] },
            categoryId: { type: ["string", "null"], format: "uuid" },
            brandId: { type: ["string", "null"], format: "uuid" },
            status: { type: "string", enum: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] },
            isFeatured: { type: "boolean" },
            seoTitle: { type: ["string", "null"] },
            seoDescription: { type: ["string", "null"] },
        },
    },

    productParams: {
        type: "object",
        required: ["id"],
        properties: {
            id: { type: "string", format: "uuid" },
        },
    },

    productSlugParams: {
        type: "object",
        required: ["slug"],
        properties: {
            slug: { type: "string" },
        },
    },

    productImageParams: {
        type: "object",
        required: ["id", "imageId"],
        properties: {
            id: { type: "string", format: "uuid" },
            imageId: { type: "string", format: "uuid" },
        },
    },

    uploadImage: {
        type: "object",
        description: "Upload an image payload (base64 data URI, image URL, or multipart/form-data with file)",
        properties: {
            file: { type: "string", description: "Base64 data URI, remote image URL, or binary via multipart/form-data" },
            fileName: { type: "string", description: "Optional custom filename for ImageKit" },
            altText: { type: ["string", "null"], description: "Accessibility alt text" },
            sortOrder: { type: "integer", description: "Display sort order index" },
        },
    },

    addImage: {
        type: "object",
        required: ["url"],
        properties: {
            fileId: { type: ["string", "null"], description: "ImageKit file ID" },
            url: { type: "string", format: "uri" },
            altText: { type: ["string", "null"] },
            sortOrder: { type: "integer" },
        },
    },

    reorderImages: {
        type: "object",
        required: ["images"],
        properties: {
            images: {
                type: "array",
                items: {
                    type: "object",
                    required: ["id", "sortOrder"],
                    properties: {
                        id: { type: "string", format: "uuid" },
                        sortOrder: { type: "integer" },
                    },
                },
            },
        },
    },
};

