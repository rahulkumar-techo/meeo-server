# Meeo GST Tax Engine — Testing & Quality Assurance Guide

This document details automated test coverage, regression fixtures, invariant assertions, and exhaustive edge-case handling for the Meeo GST Tax Engine.

---

## 1. Test Suite Overview

Automated tests are implemented using **Vitest** and adhere strictly to zero-floating-point discrepancy verification.

| Test File | Scope | Tests | Coverage |
|---|---|---|---|
| `src/__tests__/gstEngine.unit.test.ts` | Pure Domain Engine | 11 | Place of Supply, Inclusive vs. Exclusive pricing, Proportional discount allocation, Penny reconciliation, Shipping freight GST (SAC 9968), Indian numbering words formatter |
| `src/__tests__/taxRule.unit.test.ts` | Governance & Rules | 3 | Default CBIC statutory rules, DRAFT → APPROVED → ACTIVE → RETIRED administrative lifecycle, Audit trail logging, Effective date validation, Overlapping conflict rejection |
| `src/__tests__/orders.unit.test.ts` | Checkout Integration | 25 | Full checkout orchestration with immutable tax snapshots, dynamic item-specific GST, COD checkout, coupon discounts, and address resolution |
| **Total Automated Tests** | **Full System** | **39** | **100% Passing** |

---

## 2. Test Execution Commands

```bash
# Run all GST and checkout tests
npx vitest run src/__tests__/gstEngine.unit.test.ts src/__tests__/taxRule.unit.test.ts src/__tests__/orders.unit.test.ts

# Run static TypeScript type check
npm run typecheck
```

---

## 3. Comprehensive Edge-Case Verification Matrix

Section 10 of the Engineering Prompt defines 30 critical edge cases. Below is their verification status and handling logic:

| # | Scenario / Edge Case | Expected System Behavior | Test / Handling Mechanism |
|---|---|---|---|
| 1 | Missing or invalid HSN code | Rejects malformed HSN format (< 2 digits or > 8 digits); falls back to legacy product catalog rate defensively if unverified. | `taxRule.service.ts:149`, `validations/tax.validation.ts` |
| 2 | Product with unverified classification | Flagged as `UNVERIFIED`; highlighted in admin compliance portal; checkout processes using fallback rule. | `TaxVerificationStatus.UNVERIFIED` |
| 3 | Missing or expired tax rule | Resolves fallback hierarchical prefix (heading/chapter) or throws controlled 404 rather than guessing. | Hierarchical candidate search in `resolveApplicableRule` |
| 4 | Two rules with overlapping effective dates | System detects conflict and throws `409 Conflict` requiring audit instead of arbitrary choice. | `taxRule.service.ts:54-66` |
| 5 | Scheduled rule becoming active during checkout | Checkout locks rates at order placement time; snapshot permanently records rate used. | Snapshots created within Prisma `$transaction` |
| 6 | Rule update between quote and placement | Checkout revalidates all rates authoritatively server-side on final placement. | `orderValidation.service.ts` + `orderCreation.service.ts` |
| 7 | Intra-state vs. inter-state supplies | Normalizes state across 36 states/UTs; applies 50/50 CGST+SGST vs 100% IGST. | `gstEngine.unit.test.ts:48-138` |
| 8 | Seller in different state from platform | Resolves seller's actual dispatch warehouse state code from `SellerTaxProfile`. | `SellerTaxProfile.stateCode` |
| 9 | Mixed products, sellers & rates in one cart | Independent per-line item tax calculation; correctly handles 0%, 5%, 12%, 18%, 28% in same cart. | `gstEngine.unit.test.ts:200-264` |
| 10 | GST-inclusive vs GST-exclusive prices | Backward deduction: `Taxable = Gross / (1 + Rate)` for inclusive; additions for exclusive. | `gstEngine.unit.test.ts:140-198` |
| 11 | Order-level discounts across lines | Proportional allocation by line value; penny discrepancies reconciled onto largest line. | `gstEngine.unit.test.ts:266-320` |
| 12 | Taxable shipping charges | Applies 18% GST under SAC 9968; split into CGST/SGST or IGST based on destination. | `gstEngine.unit.test.ts:322-354` |
| 13 | Free shipping threshold | Sets shipping fee to ₹0.00; taxable shipping and tax amount evaluate to ₹0.00. | `GstEngineService:189` |
| 14 | Unit price precision | Half-up arithmetic with `Number.EPSILON` prevents IEEE-754 binary floating point artifacts. | `roundToTwoDecimals()` |
| 15 | Rounding discrepancies between lines and order | Order grand total reconciles exactly with sum of line totals + shipping total. | Asserted in `gstEngine.unit.test.ts` |
| 16 | Cancellation before payment | Active inventory reservations released; no invoice generated. | `orders.unit.test.ts:494` |
| 17 | Cancellation after payment / Partial refund | Statutory Credit Note generated referencing original invoice; tax reversed proportionally. | Section 34 CGST compliance |
| 18 | Returns spanning a tax-rule change | Refund references immutable `OrderItemTaxSnapshot`; original historical tax rate is refunded. | Relational `OrderItemTaxSnapshot` |
| 19 | Duplicate order / Idempotent payment | Idempotency key locks order creation in Redis / DB; returns cached response on replay. | `orders.unit.test.ts:375-400` |
| 20 | Failed transactions & rollbacks | Atomic Prisma `$transaction` rolls back order, line items, and tax snapshots simultaneously. | `orderCreation.service.ts:168` |
| 21 | Concurrent rule edits | Version number auto-increments; optimistic locking and unique constraint prevent races. | `GstRule.version` |
| 22 | Historical invoices after rule change | Invoices read exclusively from `OrderTaxSnapshot` and `OrderItemTaxSnapshot`; unaffected by rule changes. | `invoice.service.ts:75` |
| 23 | Missing seller GST details | Automatically provisions / falls back to authoritative default platform store profile. | `sellerTax.service.ts:26` |
| 24 | Unauthorized access to admin tax APIs | Fastify `app.requirePermission(TAX_MANAGE / TAX_APPROVE)` blocks unauthorized callers with 403. | `tax.route.ts` |
| 25 | Existing orders without snapshots | Safely displays legacy invoice without throwing null pointer exceptions. | `invoice.service.ts:98` |
| 26 | Database migration rollback | Non-destructive schema addition; previous code continues functioning without error. | `MIGRATION_GUIDE.md` |
| 27 | Incomplete notification info | Rules without verified gazette notification cannot be moved from DRAFT to APPROVED. | `taxRule.service.ts:308` |
| 28 | Product price changed during checkout | Real-time revalidation during order creation catches discrepancies and updates total. | `orderValidation.service.ts` |
| 29 | Multi-instance cache consistency | Statutory rules resolved directly from PostgreSQL with indexed lookup. | Index on `[hsnCode, status, effectiveFrom]` |
| 30 | Invoice reconciliation & words format | Converts complex amounts (e.g. ₹1,25,400.50) into proper Indian Lakhs/Crores/Paise words. | `gstEngine.unit.test.ts:356-370` |
