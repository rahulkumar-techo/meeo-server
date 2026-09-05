# 29. Concrete Database Design

## 29.1 Database Design Principles

The database uses PostgreSQL as the primary relational database.

The design follows these principles:

* Use UUID or ULID for externally exposed identifiers.
* Use PostgreSQL `JSONB` only for flexible or event payload data.
* Keep transactional data normalized.
* Store historical snapshots for orders and payments.
* Use foreign keys for critical relational integrity.
* Use indexes based on real query patterns.
* Use soft deletion selectively.
* Never rely on current product or user data for historical orders.
* Keep inventory transactions immutable.
* Keep order status history immutable.
* Keep event processing idempotent.

High-level relationship:

```text
User
 │
 ├── Addresses
 ├── Cart
 ├── Wishlist
 ├── Orders
 ├── Reviews
 └── Sessions

Product
 │
 ├── Category
 ├── Brand
 ├── Images
 ├── Variants
 ├── Attributes
 ├── Inventory
 └── Reviews

Order
 │
 ├── Order Items
 ├── Address Snapshot
 ├── Payment
 ├── Status History
 └── Coupon Usage

Database
 │
 └── Outbox Events
         │
         ▼
      Redis Queue
         │
         ▼
      Job Worker
```

---

# 29.2 Common Columns

Most main tables should contain:

```text
id
created_at
updated_at
```

Recommended naming convention:

```text
snake_case
```

Example:

```text
created_at
updated_at
user_id
order_id
product_id
```

---

# 30. Identity and Authentication

## 30.1 Users Table

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,

    email VARCHAR(255) UNIQUE,
    phone VARCHAR(30) UNIQUE,

    password_hash TEXT,

    first_name VARCHAR(100),
    last_name VARCHAR(100),

    avatar_url TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,

    last_login_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMP
);
```

### User Status

```text
ACTIVE
SUSPENDED
BLOCKED
PENDING_VERIFICATION
DELETED
```

Recommended indexes:

```sql
CREATE INDEX idx_users_status
ON users(status);

CREATE INDEX idx_users_created_at
ON users(created_at);
```

---

## 30.2 Roles Table

```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY,

    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Example:

```text
CUSTOMER
ADMIN
SUPER_ADMIN
SUPPORT
INVENTORY_MANAGER
ORDER_MANAGER
```

---

## 30.3 Permissions Table

```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY,

    name VARCHAR(150) UNIQUE NOT NULL,
    description TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Example:

```text
products.create
products.update
products.delete

orders.read
orders.update
orders.cancel

users.read
users.suspend
```

---

## 30.4 User Roles

```sql
CREATE TABLE user_roles (
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,

    PRIMARY KEY (user_id, role_id),

    FOREIGN KEY (user_id)
        REFERENCES users(id),

    FOREIGN KEY (role_id)
        REFERENCES roles(id)
);
```

---

## 30.5 Role Permissions

```sql
CREATE TABLE role_permissions (
    role_id UUID NOT NULL,
    permission_id UUID NOT NULL,

    PRIMARY KEY (role_id, permission_id),

    FOREIGN KEY (role_id)
        REFERENCES roles(id),

    FOREIGN KEY (permission_id)
        REFERENCES permissions(id)
);
```

Relationship:

```text
Users
  │
  ▼
User Roles
  │
  ▼
Roles
  │
  ▼
Role Permissions
  │
  ▼
Permissions
```

---

# 31. Authentication Sessions

## User Sessions

```sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,

    refresh_token_hash TEXT NOT NULL,

    device_name VARCHAR(255),
    device_id VARCHAR(255),

    ip_address INET,
    user_agent TEXT,

    expires_at TIMESTAMP NOT NULL,
    last_used_at TIMESTAMP,

    revoked_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);
```

Indexes:

```sql
CREATE INDEX idx_user_sessions_user_id
ON user_sessions(user_id);

CREATE INDEX idx_user_sessions_expires_at
ON user_sessions(expires_at);
```

---

# 32. Addresses

```sql
CREATE TABLE addresses (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,

    label VARCHAR(100),

    recipient_name VARCHAR(255) NOT NULL,
    phone VARCHAR(30),

    address_line_1 VARCHAR(255) NOT NULL,
    address_line_2 VARCHAR(255),

    city VARCHAR(100),
    state VARCHAR(100),

    postal_code VARCHAR(30),
    country VARCHAR(100) NOT NULL,

    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),

    is_default BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);
```

Relationship:

```text
User
 │
 ├── Home Address
 ├── Work Address
 └── Other Address
```

---

# 33. Categories

Categories support hierarchical relationships.

```sql
CREATE TABLE categories (
    id UUID PRIMARY KEY,

    parent_id UUID,

    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,

    description TEXT,

    image_url TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (parent_id)
        REFERENCES categories(id)
);
```

Example:

```text
Electronics
│
├── Phones
│   ├── Android
│   └── iOS
│
└── Laptops
```

Index:

```sql
CREATE INDEX idx_categories_parent_id
ON categories(parent_id);
```

---

# 34. Brands

```sql
CREATE TABLE brands (
    id UUID PRIMARY KEY,

    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,

    logo_url TEXT,

    description TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

# 35. Products

The product table contains the primary product information.

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY,

    category_id UUID,
    brand_id UUID,

    name VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,

    description TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',

    is_featured BOOLEAN NOT NULL DEFAULT FALSE,

    seo_title VARCHAR(255),
    seo_description TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMP,

    FOREIGN KEY (category_id)
        REFERENCES categories(id),

    FOREIGN KEY (brand_id)
        REFERENCES brands(id)
);
```

Product status:

```text
DRAFT
ACTIVE
INACTIVE
ARCHIVED
```

Indexes:

```sql
CREATE INDEX idx_products_category_id
ON products(category_id);

CREATE INDEX idx_products_brand_id
ON products(brand_id);

CREATE INDEX idx_products_status
ON products(status);

CREATE INDEX idx_products_featured
ON products(is_featured)
WHERE is_featured = TRUE;
```

---

# 36. Product Images

```sql
CREATE TABLE product_images (
    id UUID PRIMARY KEY,

    product_id UUID NOT NULL,

    url TEXT NOT NULL,

    alt_text VARCHAR(255),

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (product_id)
        REFERENCES products(id)
        ON DELETE CASCADE
);
```

---

# 37. Product Variants

Variants represent purchasable product configurations.

Example:

```text
T-Shirt

Variant 1
Red + Small

Variant 2
Red + Medium

Variant 3
Blue + Medium
```

```sql
CREATE TABLE product_variants (
    id UUID PRIMARY KEY,

    product_id UUID NOT NULL,

    sku VARCHAR(150) UNIQUE NOT NULL,

    barcode VARCHAR(150),

    price NUMERIC(12, 2) NOT NULL,

    compare_at_price NUMERIC(12, 2),

    cost_price NUMERIC(12, 2),

    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (product_id)
        REFERENCES products(id)
        ON DELETE CASCADE
);
```

Important:

> Inventory belongs primarily to a purchasable SKU or variant, not to the generic product.

---

# 38. Product Attributes

## Attribute Definitions

```sql
CREATE TABLE product_attributes (
    id UUID PRIMARY KEY,

    name VARCHAR(100) UNIQUE NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Examples:

```text
Color
Size
Storage
Material
```

---

## Attribute Values

```sql
CREATE TABLE product_attribute_values (
    id UUID PRIMARY KEY,

    attribute_id UUID NOT NULL,

    value VARCHAR(255) NOT NULL,

    FOREIGN KEY (attribute_id)
        REFERENCES product_attributes(id)
);
```

---

## Variant Attributes

```sql
CREATE TABLE variant_attribute_values (
    variant_id UUID NOT NULL,

    attribute_value_id UUID NOT NULL,

    PRIMARY KEY (
        variant_id,
        attribute_value_id
    ),

    FOREIGN KEY (variant_id)
        REFERENCES product_variants(id)
        ON DELETE CASCADE,

    FOREIGN KEY (attribute_value_id)
        REFERENCES product_attribute_values(id)
);
```

Relationship:

```text
Product
   │
   ▼
Variants
   │
   ├── Color = Red
   └── Size = Large
```

---

# 39. Inventory

## Current Inventory

```sql
CREATE TABLE inventory (
    id UUID PRIMARY KEY,

    variant_id UUID UNIQUE NOT NULL,

    available_quantity INTEGER NOT NULL DEFAULT 0,

    reserved_quantity INTEGER NOT NULL DEFAULT 0,

    reorder_level INTEGER,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (variant_id)
        REFERENCES product_variants(id)
);
```

Available inventory concept:

```text
Total Stock = 100

Reserved = 10

Available = 90
```

---

# 40. Inventory Transactions

Inventory history should be immutable.

```sql
CREATE TABLE inventory_transactions (
    id UUID PRIMARY KEY,

    variant_id UUID NOT NULL,

    type VARCHAR(50) NOT NULL,

    quantity INTEGER NOT NULL,

    reference_type VARCHAR(100),
    reference_id UUID,

    note TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (variant_id)
        REFERENCES product_variants(id)
);
```

Transaction types:

```text
STOCK_ADDED
STOCK_REMOVED
ORDER_RESERVED
ORDER_CONFIRMED
ORDER_CANCELLED
RETURNED
MANUAL_ADJUSTMENT
```

---

# 41. Inventory Reservations

```sql
CREATE TABLE inventory_reservations (
    id UUID PRIMARY KEY,

    variant_id UUID NOT NULL,

    order_id UUID,

    quantity INTEGER NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',

    expires_at TIMESTAMP NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (variant_id)
        REFERENCES product_variants(id)
);
```

Status:

```text
ACTIVE
CONFIRMED
RELEASED
EXPIRED
```

Flow:

```text
Checkout
   │
   ▼
Reserve Inventory
   │
   ├── Payment Success
   │       │
   │       ▼
   │    CONFIRMED
   │
   └── Payment Failure
           │
           ▼
        RELEASED
```

---

# 42. Shopping Cart

## Carts

```sql
CREATE TABLE carts (
    id UUID PRIMARY KEY,

    user_id UUID,

    session_id VARCHAR(255),

    expires_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);
```

A cart can belong to:

```text
Authenticated User
OR
Guest Session
```

---

## Cart Items

```sql
CREATE TABLE cart_items (
    id UUID PRIMARY KEY,

    cart_id UUID NOT NULL,

    variant_id UUID NOT NULL,

    quantity INTEGER NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    UNIQUE(cart_id, variant_id),

    FOREIGN KEY (cart_id)
        REFERENCES carts(id)
        ON DELETE CASCADE,

    FOREIGN KEY (variant_id)
        REFERENCES product_variants(id)
);
```

---

# 43. Wishlist

```sql
CREATE TABLE wishlists (
    id UUID PRIMARY KEY,

    user_id UUID UNIQUE NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);
```

```sql
CREATE TABLE wishlist_items (
    wishlist_id UUID NOT NULL,

    product_id UUID NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    PRIMARY KEY (
        wishlist_id,
        product_id
    ),

    FOREIGN KEY (wishlist_id)
        REFERENCES wishlists(id)
        ON DELETE CASCADE,

    FOREIGN KEY (product_id)
        REFERENCES products(id)
);
```

---

# 44. Orders

The order table is one of the most important tables.

```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY,

    order_number VARCHAR(100)
        UNIQUE NOT NULL,

    user_id UUID,

    status VARCHAR(50)
        NOT NULL DEFAULT 'PENDING',

    currency CHAR(3)
        NOT NULL DEFAULT 'USD',

    subtotal NUMERIC(12, 2)
        NOT NULL,

    discount_total NUMERIC(12, 2)
        NOT NULL DEFAULT 0,

    tax_total NUMERIC(12, 2)
        NOT NULL DEFAULT 0,

    shipping_total NUMERIC(12, 2)
        NOT NULL DEFAULT 0,

    grand_total NUMERIC(12, 2)
        NOT NULL,

    notes TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);
```

Important:

> Store final calculated values inside the order. Never recalculate historical orders from the current product price.

---

# 45. Order Items

Order items store product snapshots.

```sql
CREATE TABLE order_items (
    id UUID PRIMARY KEY,

    order_id UUID NOT NULL,

    product_id UUID,
    variant_id UUID,

    product_name VARCHAR(500) NOT NULL,

    sku VARCHAR(150),

    variant_snapshot JSONB,

    unit_price NUMERIC(12, 2) NOT NULL,

    quantity INTEGER NOT NULL,

    discount_total NUMERIC(12, 2)
        NOT NULL DEFAULT 0,

    tax_total NUMERIC(12, 2)
        NOT NULL DEFAULT 0,

    total NUMERIC(12, 2)
        NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE CASCADE
);
```

Example snapshot:

```json
{
  "color": "Red",
  "size": "Large"
}
```

This allows the product to change later without corrupting order history.

---

# 46. Order Address Snapshot

Do not directly reference a user's mutable address.

Store a snapshot.

```sql
CREATE TABLE order_addresses (
    id UUID PRIMARY KEY,

    order_id UUID UNIQUE NOT NULL,

    recipient_name VARCHAR(255) NOT NULL,

    phone VARCHAR(30),

    address_line_1 VARCHAR(255) NOT NULL,
    address_line_2 VARCHAR(255),

    city VARCHAR(100),
    state VARCHAR(100),

    postal_code VARCHAR(30),

    country VARCHAR(100) NOT NULL,

    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (order_id)
        REFERENCES orders(id)
        ON DELETE CASCADE
);
```

---

# 47. Order Status History

```sql
CREATE TABLE order_status_history (
    id UUID PRIMARY KEY,

    order_id UUID NOT NULL,

    previous_status VARCHAR(50),

    new_status VARCHAR(50) NOT NULL,

    changed_by UUID,

    reason TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (order_id)
        REFERENCES orders(id)
);
```

Example:

```text
PENDING
   │
PAYMENT_PENDING
   │
CONFIRMED
   │
PROCESSING
   │
SHIPPED
   │
DELIVERED
```

---

# 48. Payments

```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY,

    order_id UUID NOT NULL,

    provider VARCHAR(100) NOT NULL,

    provider_payment_id VARCHAR(255),

    amount NUMERIC(12, 2) NOT NULL,

    currency CHAR(3) NOT NULL,

    status VARCHAR(50)
        NOT NULL DEFAULT 'PENDING',

    metadata JSONB,

    paid_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (order_id)
        REFERENCES orders(id)
);
```

Payment status:

```text
PENDING
PROCESSING
SUCCESS
FAILED
REFUNDED
PARTIALLY_REFUNDED
```

Indexes:

```sql
CREATE INDEX idx_payments_order_id
ON payments(order_id);

CREATE INDEX idx_payments_provider_payment_id
ON payments(provider_payment_id);
```

---

# 49. Payment Transactions

```sql
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY,

    payment_id UUID NOT NULL,

    type VARCHAR(50) NOT NULL,

    amount NUMERIC(12, 2) NOT NULL,

    provider_transaction_id VARCHAR(255),

    status VARCHAR(50) NOT NULL,

    response JSONB,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (payment_id)
        REFERENCES payments(id)
);
```

Transaction types:

```text
AUTHORIZE
CAPTURE
REFUND
VOID
FAILED
```

---

# 50. Coupons

```sql
CREATE TABLE coupons (
    id UUID PRIMARY KEY,

    code VARCHAR(100)
        UNIQUE NOT NULL,

    type VARCHAR(30)
        NOT NULL,

    value NUMERIC(12, 2)
        NOT NULL,

    minimum_order_amount NUMERIC(12, 2),

    maximum_discount_amount NUMERIC(12, 2),

    usage_limit INTEGER,

    usage_limit_per_user INTEGER,

    starts_at TIMESTAMP,

    expires_at TIMESTAMP,

    status VARCHAR(30)
        NOT NULL DEFAULT 'ACTIVE',

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Types:

```text
PERCENTAGE
FIXED_AMOUNT
FREE_SHIPPING
```

---

# 51. Coupon Usage

```sql
CREATE TABLE coupon_usages (
    id UUID PRIMARY KEY,

    coupon_id UUID NOT NULL,

    user_id UUID,

    order_id UUID NOT NULL,

    discount_amount NUMERIC(12, 2)
        NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (coupon_id)
        REFERENCES coupons(id),

    FOREIGN KEY (user_id)
        REFERENCES users(id),

    FOREIGN KEY (order_id)
        REFERENCES orders(id)
);
```

---

# 52. Product Reviews

```sql
CREATE TABLE reviews (
    id UUID PRIMARY KEY,

    user_id UUID NOT NULL,

    product_id UUID NOT NULL,

    order_item_id UUID,

    rating INTEGER NOT NULL,

    title VARCHAR(255),

    content TEXT,

    status VARCHAR(30)
        NOT NULL DEFAULT 'PENDING',

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (user_id)
        REFERENCES users(id),

    FOREIGN KEY (product_id)
        REFERENCES products(id)
);
```

Rating constraint:

```text
1
2
3
4
5
```

Recommended database check:

```sql
CHECK (rating >= 1 AND rating <= 5)
```

---

# 53. Notifications

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY,

    user_id UUID,

    type VARCHAR(100) NOT NULL,

    title VARCHAR(255) NOT NULL,

    body TEXT,

    data JSONB,

    read_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
);
```

---

# 54. Transactional Outbox Table

This is the core table for reliable event publishing.

```sql
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,

    event_type VARCHAR(150)
        NOT NULL,

    aggregate_type VARCHAR(100)
        NOT NULL,

    aggregate_id UUID
        NOT NULL,

    payload JSONB
        NOT NULL,

    status VARCHAR(30)
        NOT NULL DEFAULT 'PENDING',

    attempts INTEGER
        NOT NULL DEFAULT 0,

    max_attempts INTEGER
        NOT NULL DEFAULT 10,

    locked_by VARCHAR(255),

    locked_at TIMESTAMP,

    next_retry_at TIMESTAMP,

    published_at TIMESTAMP,

    last_error TEXT,

    created_at TIMESTAMP
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMP
        NOT NULL DEFAULT NOW()
);
```

---

## Outbox Event Status

```text
PENDING
PROCESSING
PUBLISHED
FAILED
```

Lifecycle:

```text
PENDING
   │
   ▼
PROCESSING
   │
   ├──────── Success ────────► PUBLISHED
   │
   ├──────── Temporary Error ─► PENDING
   │
   └──────── Max Attempts ───► FAILED
```

---

## Important Outbox Indexes

```sql
CREATE INDEX idx_outbox_pending
ON outbox_events(status, next_retry_at, created_at)
WHERE status = 'PENDING';

CREATE INDEX idx_outbox_processing
ON outbox_events(status, locked_at)
WHERE status = 'PROCESSING';
```

These indexes are specifically optimized for the outbox publisher.

---

# 55. Worker Event Processing Table

For critical idempotent consumers:

```sql
CREATE TABLE processed_events (
    id UUID PRIMARY KEY,

    event_id UUID NOT NULL,

    consumer_name VARCHAR(150)
        NOT NULL,

    status VARCHAR(30)
        NOT NULL DEFAULT 'PROCESSING',

    attempts INTEGER
        NOT NULL DEFAULT 0,

    last_error TEXT,

    processed_at TIMESTAMP,

    created_at TIMESTAMP
        NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMP
        NOT NULL DEFAULT NOW(),

    UNIQUE(event_id, consumer_name)
);
```

Status:

```text
PROCESSING
COMPLETED
FAILED
```

The unique constraint is critical:

```text
UNIQUE(event_id, consumer_name)
```

This prevents the same consumer from processing the same event multiple times.

---

# 56. Audit Logs

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,

    actor_id UUID,

    action VARCHAR(150)
        NOT NULL,

    entity_type VARCHAR(100)
        NOT NULL,

    entity_id UUID,

    old_value JSONB,

    new_value JSONB,

    ip_address INET,

    user_agent TEXT,

    created_at TIMESTAMP
        NOT NULL DEFAULT NOW()
);
```

Examples:

```text
PRODUCT_CREATED
PRODUCT_UPDATED
ORDER_CANCELLED
PAYMENT_REFUNDED
USER_SUSPENDED
INVENTORY_ADJUSTED
```

---

# 57. Complete Database Relationship

```text
┌──────────────┐
│    USERS     │
└──────┬───────┘
       │
       ├─────────────── Addresses
       │
       ├─────────────── Sessions
       │
       ├─────────────── Carts
       │                    │
       │                    ▼
       │                 Cart Items
       │
       ├─────────────── Wishlists
       │                    │
       │                    ▼
       │                 Wishlist Items
       │
       └─────────────── Orders
                            │
                            ├──── Order Items
                            │
                            ├──── Order Addresses
                            │
                            ├──── Order Status History
                            │
                            ├──── Payments
                            │       │
                            │       ▼
                            │   Payment Transactions
                            │
                            └──── Coupon Usage


┌──────────────┐
│  CATEGORIES  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   PRODUCTS   │◄──────── Brands
└──────┬───────┘
       │
       ├──── Product Images
       │
       ├──── Product Variants
       │          │
       │          ├──── Variant Attributes
       │          │
       │          └──── Inventory
       │                    │
       │                    ├──── Inventory Transactions
       │                    │
       │                    └──── Inventory Reservations
       │
       └──── Reviews


DATABASE EVENTS

Business Transaction
       │
       ├──── Business Data
       │
       └──── Outbox Event
                │
                ▼
             Redis
                │
                ▼
             Worker
                │
                ▼
         Processed Events
```

---

# 58. Recommended Database Boundaries

The application should maintain module ownership.

```text
Auth Module
    ├── users
    ├── roles
    ├── permissions
    └── user_sessions

Product Module
    ├── products
    ├── product_variants
    ├── product_images
    └── attributes

Inventory Module
    ├── inventory
    ├── inventory_transactions
    └── inventory_reservations

Cart Module
    ├── carts
    └── cart_items

Order Module
    ├── orders
    ├── order_items
    ├── order_addresses
    └── order_status_history

Payment Module
    ├── payments
    └── payment_transactions

Event Infrastructure
    ├── outbox_events
    └── processed_events
```

Important rule:

> A module should not directly modify another module's internal tables without going through the appropriate application/domain boundary.

---

# 59. Critical Index Strategy

At minimum, index:

```text
Foreign Keys
Frequently Filtered Status Fields
Frequently Sorted Timestamps
Unique Business Identifiers
Queue/Outbox Processing Fields
```

Examples:

```sql
orders(user_id, created_at);

orders(status, created_at);

order_items(order_id);

product_variants(product_id);

inventory(variant_id);

outbox_events(status, next_retry_at);

processed_events(event_id, consumer_name);
```

---

# 60. Final Database Architecture Recommendation

The production database should be structured around five major concerns:

```text
1. Identity
   Users, Roles, Sessions

2. Commerce Catalog
   Products, Categories, Brands, Variants

3. Commerce Transactions
   Cart, Orders, Payments, Coupons

4. Operational Data
   Inventory, Notifications, Reviews

5. Reliability Infrastructure
   Outbox Events, Processed Events, Audit Logs
```

Final architecture:

```text
                    PostgreSQL
                         │
     ┌───────────────────┼────────────────────┐
     │                   │                    │
     ▼                   ▼                    ▼
 Identity             Commerce            Operations
     │                   │                    │
 Users               Products             Inventory
 Sessions            Orders               Notifications
 Roles               Payments             Reviews
                     Coupons
                         │
                         ▼
                 Outbox Events
                         │
                         ▼
                      Redis
                         │
                         ▼
                    Job Workers
                         │
                         ▼
                  Processed Events
```

This database design supports an advanced e-commerce system while preserving clean module boundaries, transactional consistency, reliable event publishing, worker retries, and future scalability.
