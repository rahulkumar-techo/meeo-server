# Meeo GST Tax Engine — Migration & Deployment Guide

This document defines the staging and production deployment runbook, preflight safety verifications, database migration procedures, data backfill protocols, and rollback contingencies for the Meeo GST Tax Engine.

---

## 1. Preflight Safety & Backup Protocol

Before applying migrations or deploying code:

1. **Verify Database Connectivity**:
   ```bash
   npx prisma db execute --stdin <<EOF
   SELECT current_database(), current_user, version();
   EOF
   ```
2. **Execute Full PostgreSQL Database Snapshot**:
   ```bash
   pg_dump -h <DB_HOST> -U <DB_USER> -d <DB_NAME> -F c -b -v -f "backup_meeo_pre_gst_$(date +%Y%m%d_%H%M%S).dump"
   ```
3. **Verify Existing Unit Test Integrity**:
   ```bash
   npm run typecheck
   npx vitest run src/__tests__/orders.unit.test.ts
   ```

---

## 2. Migration Execution

The GST engine introduces 5 normalized tables in `prisma/schema/Tax/` along with relational foreign keys. All schema additions are strictly non-destructive and backward compatible with legacy fields (`product.taxRate`, `orders.taxTotal`).

### Step 1: Apply Schema Migrations
```bash
# In production environment using Prisma Migrate:
npx prisma migrate deploy

# In local / staging development:
npx prisma db push
```

### Step 2: Regenerate Prisma Client
```bash
npm run prisma:generate
```

### Step 3: Seed Standard CBIC Rules & Platform Seller Profile
Execute the automated idempotent seed script:
```bash
npx tsx -e '
  import { taxRuleService } from "./src/modules/tax/services/taxRule.service.js";
  import { sellerTaxService } from "./src/modules/tax/services/sellerTax.service.js";
  async function seed() {
    console.log("Seeding platform seller profile...");
    await sellerTaxService.getDefaultSellerProfile();
    console.log("Seeding CBIC tax rules...");
    await taxRuleService.seedStandardTaxClassificationsAndRules();
    console.log("Seed complete.");
  }
  seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
'
```

---

## 3. Safe Backfill Strategy for Existing Records

### 3.1 Catalog Products
- Existing products contain legacy `hsnCode` (string) and `taxRate` (decimal) columns.
- **Rule**: Link existing products to matching `TaxClassification` entries where HSN matches.
- **Defensive Fallback**: The engine dynamically reads `product.hsnCode` and `product.taxRate` if `product.taxClassification` is null, guaranteeing 100% backward compatibility with unlinked catalog items.

### 3.2 Historical Orders & Completed Invoices
- **Golden Statutory Rule**: **NEVER GUESS HISTORICAL TAX RATES**.
- Existing completed orders possess persisted financial snapshots (`subtotal`, `taxTotal`, `total`) and `order_addresses`.
- Historical orders without `order_tax_snapshots` continue to be rendered using their immutable legacy invoice format.
- New orders placed after the GST engine migration automatically write immutable `order_tax_snapshots` and `order_item_tax_snapshots`.

---

## 4. Rollback Strategy & Limitations

### 4.1 Application Rollback
If an unexpected runtime regression occurs, redeploy the previous container image:
- The newly added GST tables and foreign keys are nullable on legacy records; existing code ignores new tables without runtime failure.
- Legacy `taxTotal` and `subtotal` columns continue to be populated by `orderCreation.service.ts`.

### 4.2 Database Rollback Limitations
- **Warning**: Do not execute destructive `DROP TABLE` on `order_tax_snapshots` once production orders have been placed, as doing so destroys legally binding statutory tax audit records required under Section 36 of the CGST Act (mandatory 72-month retention).
- If table rollback is strictly required during a maintenance window with 0 new orders:
  ```sql
  DROP TABLE IF EXISTS "order_item_tax_snapshots" CASCADE;
  DROP TABLE IF EXISTS "order_tax_snapshots" CASCADE;
  DROP TABLE IF EXISTS "gst_rule_audits" CASCADE;
  DROP TABLE IF EXISTS "gst_rules" CASCADE;
  DROP TABLE IF EXISTS "tax_classifications" CASCADE;
  DROP TABLE IF EXISTS "seller_tax_profiles" CASCADE;
  ```

---

## 5. Production Smoke Verification Checklist

After deployment, verify the following checklist in production:
1. [ ] Check health endpoint: `GET /api/v1/health` returns `200 OK`.
2. [ ] Verify tax quote API: `POST /api/v1/tax/quote` returns expected intra/inter-state tax breakdown.
3. [ ] Verify active rules: `GET /api/v1/tax/rules` returns active CBIC rules.
4. [ ] Place a test order on staging and verify `order_tax_snapshots` row is created.
5. [ ] Download tax invoice via `GET /api/v1/tax/orders/:orderId/invoice` and verify Indian words amount and Rule 46 fields.
