# Meeo E-Commerce GST Engine: Architecture & Database Audit

> **Document Version**: 1.0.0  
> **Date**: October 2026  
> **Author**: Senior Backend Architect & Database Engineer  
> **Status**: Completed Discovery Phase  

---

## 1. Executive Summary

This audit assesses the existing Meeo e-commerce backend architecture, database schema, checkout data flow, and financial calculation mechanics to establish a production-grade Indian Goods and Services Tax (GST) calculation and tax-rule management system.

The existing implementation uses hardcoded tax rates (such as a default `8.00%` or `18.00%` fallback in settings/validation), applies taxes on pre-discount subtotals without proportional discount allocation across order lines, performs floating-point JavaScript arithmetic (`(lineTotal * itemTaxRate) / 100`), lacks CGST/SGST/IGST separation, ignores Place of Supply (POS) rules, lacks HSN verification workflows, and does not persist immutable tax snapshots.

This document details the audit findings, root causes, required schema additions, and migration roadmap.

---

## 2. Current Architecture & File Manifest

| Domain Area | Key Files & File Paths | Current Responsibility |
|---|---|---|
| **ORM & Schema** | `prisma/schema/Catalog/product.prisma`<br>`prisma/schema/Orders/orders.prisma`<br>`prisma/schema/Orders/ordersItems.prisma`<br>`prisma/schema/Orders/orderAddress.prisma`<br>`prisma/schema/Payments/payment.prisma` | Defines database models using multi-file Prisma schema, with decimal numeric types for financial amounts. |
| **Settings & Defaults** | `src/modules/settings/services/setting.service.ts`<br>`src/modules/settings/validations/setting.validation.ts` | In-memory cached platform configuration with fallback `defaultTaxRate: 8.00` and `standardShippingFee: 10.0`. |
| **Cart & Pricing** | `src/modules/cart/services/cartItem.service.ts` | Manages customer cart items and quantities. Does not compute taxes. |
| **Checkout Validation** | `src/modules/orders/services/orderValidation.service.ts` | Validates live inventory and prices. Calculates estimated shipping and tax using `fallbackTaxRate` or `Product.taxRate`. |
| **Order Creation** | `src/modules/orders/services/orderCreation.service.ts` | Atomically creates `Order`, `OrderItem`, and `OrderAddress`. Saves `taxTotal` but sets `discountTotal: 0` on line items and lacks CGST/SGST/IGST breakdown. |
| **Payments & Refunds** | `src/modules/payments/services/paymentRefund.service.ts` | Manages partial and full refunds via Razorpay provider and records `Refund` entities. Does not adjust tax components or issue GST credit notes. |
| **Catalog & Products** | `src/modules/catalog/services/product.service.ts`<br>`src/modules/catalog/validations/product.validation.ts` | Stores `taxRate: Decimal @default(18.0)` and optional `hsnCode: String?` directly on `Product`. Unverified and unversioned. |
| **Role Authorization** | `src/modules/authorization/permission.constants.ts`<br>`src/modules/authorization/authorization.service.ts` | RBAC with `SUPER_ADMIN` and fine-grained permissions. Missing dedicated tax-rule administrative permissions. |

---

## 3. Existing Schema & Data Flow Findings

### 3.1 Product & Catalog Tax Definitions
- **Current Model**: `Product` has `taxRate Decimal @default(18.0) @db.Decimal(5, 2)` and `hsnCode String?`.
- **Finding**:
  1. HSN code is an unvalidated, free-text string without character length enforcement to standard 4/6/8-digit HSN formats.
  2. Tax rate is hardcoded per product rather than linked to a central statutory rule master.
  3. No historical effective dates (`effectiveFrom`, `effectiveTo`). If an administrator edits `taxRate`, historical reporting or re-queries risk using modified rates.
  4. No distinction between GST tax treatments (`TAXABLE`, `NIL_RATED`, `EXEMPT`, `ZERO_RATED`, `NON_TAXABLE`).

### 3.2 Cart & Checkout Calculation
- **Current Flow**:
  1. `orderValidationService.validateCartAndItems` calculates `itemTaxTotal = Number(((lineTotal * itemTaxRate) / 100).toFixed(2))`.
  2. `orderValidationService.calculateFees` computes `taxTotal` by summing line-level tax totals or falling back to `(subtotal * fallbackTaxRate) / 100`.
  3. `orderCreationService.validateCheckout` calculates `grandTotal = Number((subtotal - totalDiscount + shippingTotal + taxTotal).toFixed(2))`.
- **Finding**:
  1. **Taxes are computed before discount**: Under Section 15(3) of the CGST Act 2017, discounts recorded on the invoice before or at the time of supply reduce the taxable value. Computing tax on the pre-discount line total overcharges GST.
  2. **Order-level discounts are not apportioned**: When a coupon or promotion applies at the order level, it is not distributed to order items. `OrderItem.discountTotal` is saved as `0.00`.
  3. **Shipping charge tax is omitted**: Shipping charges are currently treated as tax-free, whereas under Indian GST composite supply rules (Section 8 of CGST Act), delivery charges for taxable goods generally attract GST at the principal supply's rate or the applicable courier service rate (18%).

### 3.3 Place of Supply (POS) & Tax Split
- **Current Flow**: No determination of intra-state vs inter-state supply.
- **Finding**:
  1. No seller entity exists in the schema; Meeo currently operates as a direct first-party retailer without recorded supplier GSTIN, State Code, or legal jurisdiction.
  2. Customer shipping address contains `state` (free text), but does not normalize Indian State/UT codes (e.g., `27` for Maharashtra, `29` for Karnataka, `07` for Delhi).
  3. No split into CGST + SGST (for intra-state supplies) or IGST (for inter-state supplies).

### 3.4 Invoices & Historical Snapshots
- **Current Flow**: `Order` records `subtotal`, `discountTotal`, `taxTotal`, `shippingTotal`, `grandTotal`. `OrderItem` records `unitPrice`, `quantity`, `discountTotal: 0`, `taxTotal`, `total: lineTotal`.
- **Finding**:
  1. No immutable snapshot of the applied GST rate, HSN code, CGST amount, SGST amount, IGST amount, supplier GSTIN, or customer GSTIN.
  2. If an order invoice is rendered or regenerated later, the system cannot prove what rate or rule applied at the time of supply.

---

## 4. Identified Risks & Inconsistencies

1. **Legal & Compliance Risk**: Inability to generate a compliant Tax Invoice under Rule 46 of the CGST Rules 2017 (which mandates HSN, rate of tax, tax amount split into CGST/SGST/IGST, place of supply, and GSTINs).
2. **Financial Precision Risk**: JavaScript floating-point arithmetic (`Number(amount.toFixed(2))`) introduces rounding anomalies during multi-line allocation and aggregate reconciliation.
3. **Overcharging Tax on Discounted Products**: Customers are taxed on the gross subtotal while paying a net discounted total, causing legal violation under Section 15 of CGST Act.
4. **Uncontrolled Rate Changes**: Changing `Product.taxRate` immediately alters checkout quotes without an approval, scheduling, or auditing trail.
5. **No B2B Support**: Inability for registered business buyers to provide their GSTIN for Input Tax Credit (ITC) claiming.

---

## 5. Required Architectural & Schema Changes

### 5.1 New Data Models
1. **`TaxClassification`**: Master table of verified HSN/SAC codes, descriptions, category groupings, verification status (`VERIFIED`, `UNVERIFIED`, `FLAGGED`), and review metadata.
2. **`GstRule`**: Central statutory tax rules specifying HSN code, tax treatment (`TAXABLE`, `EXEMPT`, `NIL_RATED`, `ZERO_RATED`, `NON_TAXABLE`), `cgstRate`, `sgstRate`, `igstRate`, `cessRate`, `effectiveFrom`, `effectiveTo`, official CBIC notification reference, version, and status (`DRAFT`, `APPROVED`, `SCHEDULED`, `ACTIVE`, `RETIRED`).
3. **`GstRuleAudit`**: Immutable audit log of all rule creations, modifications, approvals, publications, and retirements.
4. **`SellerTaxProfile`**: Supplier identity and tax registration profile with `legalBusinessName`, `tradeName`, `gstin`, `stateCode`, `stateName`, `address`, registration status (`ACTIVE`, `SUSPENDED`), and `isDefaultPlatformSeller`.
5. **`OrderTaxSnapshot` & `OrderItemTaxSnapshot`**: Immutable snapshot persisted alongside each placed order recording exact supplier/customer details, POS, taxable amounts, line-level discount allocations, CGST/SGST/IGST components, and calculation version.

### 5.2 Enhancements to Existing Models
- **`Product`**: Add optional foreign key `taxClassificationId` to link products to verified HSN classifications. Preserve existing `taxRate` and `hsnCode` as deprecated fallback fields for backward compatibility.
- **`Order`**: Add `supplierGstin`, `customerGstin`, `placeOfSupplyStateCode`, `isInterState`, `cgstTotal`, `sgstTotal`, `igstTotal`.
- **`OrderItem`**: Populate `discountTotal` accurately via proportional allocation, and record `hsnCode`, `taxableAmount`, `cgstAmount`, `sgstAmount`, `igstAmount`.

---

## 6. Migration and Rollout Strategy

1. **Phase 1: Safe Additive Schema Migration**
   - Create new tables (`tax_classifications`, `gst_rules`, `gst_rule_audits`, `seller_tax_profiles`, `order_tax_snapshots`, `order_item_tax_snapshots`).
   - Add nullable fields and relations to existing tables (`orders`, `order_items`, `products`).
   - Seed default statutory HSN codes, verified rates (0%, 5%, 12%, 18%, 28%), and default platform seller profile.
2. **Phase 2: Domain Engine Deployment**
   - Deploy `GstEngineService` with pure, deterministic, decimal-safe arithmetic.
   - Run in shadow/parallel mode or direct integration with backward-compatible fallbacks.
3. **Phase 3: Integration & Order Snapshots**
   - Integrate `orderValidationService` and `orderCreationService` to persist tax snapshots.
   - Expose compliant Tax Invoice data through existing and new invoice endpoints.
4. **Phase 4: Admin Management & RBAC**
   - Enable admin APIs for rule management, draft/approval workflows, and classification audits.
   - Enforce fine-grained permissions (`tax:read`, `tax:manage`, `tax:approve`).

---

## 7. Open Questions for Business & Tax Professional Confirmation

1. **Marketplace Facilitator vs First-Party Seller**:
   - *Current Observation*: The repository does not define a multi-vendor merchant model; all sales are currently fulfilled by the platform.
   - *Question*: Is Meeo acting solely as a direct first-party retailer (`Principal`), or is Meeo onboarding independent 3rd-party sellers requiring TCS (Tax Collected at Source under Section 52 of CGST Act)?
   - *Implementation Decision*: We will implement a `SellerTaxProfile` model with a default platform seller record, which satisfies first-party retail while allowing seamless transition to multi-seller marketplace facilitator mode.
2. **Shipping Fee Tax Classification**:
   - *Question*: Should shipping/delivery charges be taxed at standard courier SAC 9968 (18% GST), or as a composite supply where shipping takes the highest tax rate of the cart's principal goods?
   - *Implementation Decision*: Provide configurable shipping tax treatment defaulting to SAC 9968 at 18% standard GST, with intra/inter-state split based on delivery address.
3. **Price Inclusivity**:
   - *Current Observation*: Current checkout treats catalog prices as GST-exclusive (`grandTotal = subtotal + taxTotal`).
   - *Implementation Decision*: Maintain GST-exclusive pricing as current system default, while building the GST engine to natively support both exclusive and inclusive pricing modes.
