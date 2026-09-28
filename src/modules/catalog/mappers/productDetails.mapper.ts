/**
 * Maps a raw product DB record (from getProductDetails query) into
 * the clean Product Details response DTO sent to the client.
 *
 * Rules:
 * - No object spread — every field is explicitly listed.
 * - All optional relations are always present (null / [] fallback).
 * - No internal fields (costPrice, createdById, barcode, etc.) exposed.
 */

type ProductDetailsRaw = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    status: string;
    isFeatured: boolean;
    bannerImage: unknown;
    specifications: unknown;
    category: {
        id: string;
        name: string;
        slug: string;
        imageUrl: string | null;
    } | null;
    brand: {
        id: string;
        name: string;
        slug: string;
        logoUrl: string | null;
    } | null;
    images: {
        url: string;
        thumbnailUrl: string | null;
        altText: string | null;
    }[];
    variants: {
        id: string;
        sku: string;
        price: { toString(): string } | number;
        compareAtPrice: { toString(): string } | number | null;
        status: string;
        attributeValues: {
            attributeValue: {
                value: string;
                attribute: { name: string };
            };
        }[];
        inventory: { availableQuantity: number } | null;
        images: {
            url: string;
            thumbnailUrl: string | null;
            altText: string | null;
        }[];
    }[];
};

type BannerImageJson = {
    url?: string;
    altText?: string;
    thumbnailUrl?: string;
};

function parseBannerImage(raw: unknown): { url: string; altText: string | null; thumbnailUrl: string | null } | null {
    if (!raw || typeof raw !== "object") return null;
    const b = raw as BannerImageJson;
    if (!b.url) return null;
    return {
        url: b.url,
        altText: b.altText ?? null,
        thumbnailUrl: b.thumbnailUrl ?? null,
    };
}

export function mapProductDetails(product: ProductDetailsRaw) {
    return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description ?? null,
        status: product.status,
        isFeatured: product.isFeatured,

        bannerImage: parseBannerImage(product.bannerImage),

        specifications: product.specifications ?? null,

        category: product.category
            ? {
                  id: product.category.id,
                  name: product.category.name,
                  slug: product.category.slug,
                  imageUrl: product.category.imageUrl ?? null,
              }
            : null,

        brand: product.brand
            ? {
                  id: product.brand.id,
                  name: product.brand.name,
                  slug: product.brand.slug,
                  logoUrl: product.brand.logoUrl ?? null,
              }
            : null,

        images: product.images.map((img) => ({
            url: img.url,
            thumbnailUrl: img.thumbnailUrl ?? null,
            altText: img.altText ?? null,
        })),

        variants: product.variants.map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            price: Number(variant.price),
            compareAtPrice: variant.compareAtPrice !== null && variant.compareAtPrice !== undefined
                ? Number(variant.compareAtPrice)
                : null,
            status: variant.status,

            attributes: Object.fromEntries(
                variant.attributeValues.map((item) => [
                    item.attributeValue.attribute.name,
                    item.attributeValue.value,
                ]),
            ),

            inventory: {
                availableQuantity: variant.inventory?.availableQuantity ?? 0,
            },

            images: variant.images.map((img) => ({
                url: img.url,
                thumbnailUrl: img.thumbnailUrl ?? null,
                altText: img.altText ?? null,
            })),
        })),
    };
}
