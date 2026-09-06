import { catalogTags } from "./catalog.js";
import { inventoryTags } from "./inventory.js";
import { cartTags } from "./cartDocs.js";

/**
 * Cleanly aggregated Swagger tags for all API domains.
 */
export const swaggerTags = [
    {
        name: "Auth",
        description: "🔐 Authentication, OTP Verification, Password Reset, and Multi-Device Session Management",
    },
    {
        name: "User",
        description: "👤 Authenticated User Profile, Saved Addresses, and Phone Verification",
    },
    {
        name: "Authorization",
        description: "👑 Admin RBAC: Roles, Permissions, User Role Assignments, and Session Revocation",
    },
    ...catalogTags,
    ...inventoryTags,
    ...cartTags,
];

/**
 * Comprehensive developer documentation rendered in Swagger UI.
 */
export const apiDescription = `
# 🛒 Complete E-Commerce Enterprise REST API Documentation

> 📖 **Full Interactive Manual**: Visit the dedicated **[Interactive Documentation Page](/docs/description)** for complete route breakdowns, usage guides, and search.

Welcome to the central developer documentation for the **E-Commerce Enterprise REST API**. This API powers a high-performance e-commerce ecosystem including customer authentication, user profile management, granular RBAC authorization, recursive catalog management, multi-variant products, ImageKit CDN asset management, concurrency-safe inventory reservations with overselling protection, and automated checkout test simulations.

---

## 🏛️ System Architecture & Domain Overview

The backend is built with **Fastify**, **TypeScript**, **Prisma ORM (v7)**, and **PostgreSQL** adhering to a clean layered architecture:

\`\`\`text
Client Request ──► Fastify Routes ──► Auth / RBAC Guards ──► Zod Validation ──► Domain Service ──► Prisma ORM ──► PostgreSQL
\`\`\`

### Key Capabilities
- **🔐 Auth & Identity**: Password hashing, email & phone OTP verification, JWT access tokens, HttpOnly refresh cookies, and multi-device session revocation.
- **👑 Granular RBAC**: Role and permission management with dynamic creator ownership verification.
- **📁 Recursive Catalog**: Infinite parent/child category hierarchies, brand entities, and complete tree builders.
- **📦 Multi-Variant Products**: Dynamic attribute matrix (Color, Size, Material), multi-tier pricing (Retail, Compare-at, Cost), barcode tracking, and SEO metadata.
- **🖼️ ImageKit CDN**: Time-limited client authentication token generation, direct binary uploads, and gallery sequence reordering.
- **📊 Concurrency-Safe Inventory**: Stock tracking, physical adjustments, 15-minute TTL checkout reservations, overselling prevention, and immutable audit ledgers.
- **🧪 Checkout Simulation**: Test full checkout flows without requiring external payment gateway credentials.

---

## 🔐 Access Control & Authorization Model

Every endpoint in this API is classified by an **Access Badge** in its summary:

| Access Badge | Target Audience | Permissions & Ownership Rules |
|---|---|---|
| **🌐 \`[Public]\`** | Unauthenticated Visitors | Open to all clients (Storefront browsing, Category tree, Register, Login). |
| **🍪 \`[Public / Cookie]\`** | Token Refresh Clients | Requires valid \`refreshToken\` stored in an HttpOnly secure cookie. |
| **👤 \`[Authenticated User]\`** | Logged-in Customers | Requires \`Authorization: Bearer <accessToken>\`. Manages personal profile, addresses, sessions, and reservations. |
| **🛡️ \`[Creator OR Admin: <perm>]\`** | Resource Creator OR Staff | Permitted if \`createdById === user.id\` **OR** caller holds the listed permission (e.g. \`product:update\`, \`category:delete\`). |
| **👑 \`[Admin: <perm>]\`** | Staff / System Administrators | Requires explicit granular RBAC capability (e.g. \`role:create\`, \`user:update\`, \`inventory:update\`). |
| **⚡ \`[Super Admin]\`** | Root Administrators | Users possessing the \`system:manage\` permission or \`SUPER_ADMIN\` role automatically bypass all restrictions. |

---

## 🔑 Authentication & Session Flow

1. **Register**: \`POST /api/auth/register\` creates account and sends a 4-digit verification code.
2. **Verify OTP**: \`POST /api/auth/verify-otp\` verifies registration OTP and activates the account.
3. **Login**: \`POST /api/auth/login\` validates credentials, stores a trackable database session, returns short-lived JWT \`accessToken\`, and sets an HttpOnly \`refreshToken\` cookie.
4. **Bearer Token**: Send header \`Authorization: Bearer <accessToken>\` on all protected endpoints.
5. **Token Refresh**: \`POST /api/auth/refresh\` exchanges valid refresh cookie for a fresh access token.
6. **Session Control**: Users can list (\`GET /api/auth/sessions\`) and revoke specific devices or log out everywhere (\`POST /api/auth/logout-all\`).

---

## 📦 Catalog & Multi-Variant Lifecycle

- **Hierarchical Categories**: Recursive parent/child tree (\`GET /api/v1/categories/tree\`) with automatic parent reassignment upon deletion.
- **Brands**: Manufacturer entities with product count analytics.
- **Product Lifecycle**: Controlled status transitions (\`DRAFT\` -> \`ACTIVE\` -> \`ARCHIVED\`) with SEO metadata.
- **Product Variants**: Multi-variant SKUs with Barcode, Price, Compare-At Price, Cost Price, dynamic attribute matrix (e.g., Size & Color), and automatic initial inventory initialization.
- **Image CDN**: ImageKit authentication (\`GET /api/v1/products/images/auth\`), direct uploads, URL attachment, and display order resequencing.

---

## 📊 Inventory & Checkout State Machine

\`\`\`text
[Available Stock]
       │
       ▼  (Customer Checkout: POST /api/inventory/reservations/reserve)
[ACTIVE Reservation]  <-- 15-Minute TTL Hold Window
   │            │
   │ Success    │ Failed / Cancelled / TTL Elapsed
   ▼            ▼
[CONFIRMED]   [RELEASED / EXPIRED]
(Committed)   (Stock Restored to Available Pool)
\`\`\`

- **Zero Overselling**: Stock reservations and removals execute in atomic Prisma transactions; requests exceeding available stock are rejected immediately.
- **Immutable Ledger**: Every stock change creates an \`InventoryTransaction\` entry with type (\`STOCK_ADDED\`, \`STOCK_REMOVED\`, \`ORDER_RESERVED\`, \`ORDER_CONFIRMED\`, \`ORDER_CANCELLED\`, \`MANUAL_ADJUSTMENT\`).
- **Checkout Simulation**: Run end-to-end checkout & payment test simulations via \`POST /api/inventory/checkout/simulate\`.

---

## 📨 Standard API Response & Error Formats

### Standard Success Response
\`\`\`json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... }
}
\`\`\`

### Standard Error Response
\`\`\`json
{
  "success": false,
  "message": "Descriptive error message",
  "statusCode": 400
}
\`\`\`

---

## 🧪 How to Authorize in Swagger UI

1. Click the **Authorize 🔓** button at the top-right of this page.
2. In the **bearerAuth** field, paste your JWT access token formatted as: \`<accessToken>\` (without the \`Bearer\` prefix).
3. Click **Authorize** and close the modal. All protected requests will now include your authentication header automatically.
`.trim();
