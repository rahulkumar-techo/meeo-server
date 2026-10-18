# 🛍️ Display & List Products (Storefront Catalog)

This documentation explains how customer storefront applications fetch paginated product listings, apply multi-attribute filters, sort by prices/dates, and browse categories and brands.

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/products` | Public | List active products with pagination, category/brand filters & sorting |
| `GET` | `/api/v1/categories` | Public | List all categories with parent/child tree hierarchy |
| `GET` | `/api/v1/brands` | Public | List active brands with logos and product counts |

---

## 1. List Products

Public shoppers only receive products in `ACTIVE` status.

### Request
```http
GET /api/v1/products?page=1&limit=20&categoryId=cat_01J8R9QW&brandId=brd_01J8R9XYZ&minPrice=50&maxPrice=500&sortBy=price&sortOrder=asc HTTP/1.1
Host: api.example.com
```

### Supported Query Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `page` | `integer` | `1` | Page number for pagination |
| `limit` | `integer` | `20` | Items per page (max 100) |
| `categoryId` | `string` (UUID) | - | Filter by category UUID |
| `categorySlug` | `string` | - | Filter by category URL slug |
| `brandId` | `string` (UUID) | - | Filter by brand UUID |
| `brandSlug` | `string` | - | Filter by brand URL slug |
| `minPrice` | `number` | - | Minimum base price threshold |
| `maxPrice` | `number` | - | Maximum base price threshold |
| `inStock` | `boolean` | - | Filter only items with available inventory > 0 |
| `sortBy` | `string` | `createdAt` | Sort field: `price`, `title`, `createdAt`, `popularity` |
| `sortOrder` | `string` | `desc` | Sort direction: `asc` or `desc` |

### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "prod_01J8R9QWE1001",
      "title": "Ultra-light Performance Running Shoes",
      "slug": "ultra-light-performance-running-shoes",
      "description": "Engineered for marathon endurance with responsive foam cushioning.",
      "basePrice": 129.99,
      "salePrice": 99.99,
      "currency": "USD",
      "status": "ACTIVE",
      "rating": 4.8,
      "reviewCount": 124,
      "category": {
        "id": "cat_01J8R9QW",
        "name": "Footwear",
        "slug": "footwear"
      },
      "brand": {
        "id": "brd_01J8R9XYZ",
        "name": "AeroAthletics",
        "slug": "aero-athletics",
        "logoUrl": "https://assets.example.com/brands/aero.png"
      },
      "thumbnailUrl": "https://assets.example.com/products/running-shoes-thumb.jpg",
      "images": [
        {
          "id": "img_01J8R9XYZ",
          "url": "https://assets.example.com/products/running-shoes-1.jpg",
          "altText": "Side view of running shoe",
          "isPrimary": true
        }
      ],
      "variantsSummary": {
        "totalVariants": 6,
        "availableColors": ["Black/Cyan", "White/Red", "Navy"],
        "availableSizes": ["8", "9", "10", "11", "12"],
        "minPrice": 99.99,
        "maxPrice": 129.99,
        "inStock": true
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 85,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## 2. Category Hierarchy Listing

Retrieve category trees for storefront navigation mega-menus.

### Request
```http
GET /api/v1/categories?tree=true HTTP/1.1
Host: api.example.com
```

### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "cat_root_apparel",
      "name": "Apparel",
      "slug": "apparel",
      "description": "Men & Women fashion collections",
      "imageUrl": "https://assets.example.com/categories/apparel.jpg",
      "children": [
        {
          "id": "cat_sub_shoes",
          "name": "Footwear",
          "slug": "footwear",
          "productCount": 42
        },
        {
          "id": "cat_sub_jackets",
          "name": "Outerwear & Jackets",
          "slug": "outerwear-jackets",
          "productCount": 18
        }
      ]
    }
  ]
}
```

---

## 💻 Frontend React Component Example

```tsx
import React, { useEffect, useState } from "react";

interface Product {
  id: string;
  title: string;
  slug: string;
  basePrice: number;
  salePrice?: number;
  thumbnailUrl: string;
}

export const ProductGrid: React.FC<{ categorySlug?: string }> = ({ categorySlug }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      const params = new URLSearchParams({
        limit: "20",
        ...(categorySlug ? { categorySlug } : {}),
      });
      const res = await fetch(`http://localhost:5000/api/v1/products?${params}`);
      const json = await res.json();
      if (json.success) setProducts(json.data);
      setLoading(false);
    }
    loadProducts();
  }, [categorySlug]);

  if (loading) return <div>Loading products...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {products.map((p) => (
        <div key={p.id} className="border rounded-lg p-4 shadow hover:shadow-lg transition">
          <img src={p.thumbnailUrl} alt={p.title} className="w-full h-48 object-cover rounded" />
          <h3 className="font-semibold text-lg mt-2">{p.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl font-bold text-green-600">${p.salePrice ?? p.basePrice}</span>
            {p.salePrice && <span className="text-sm line-through text-gray-400">${p.basePrice}</span>}
          </div>
        </div>
      ))}
    </div>
  );
};
```
