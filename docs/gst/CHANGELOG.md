# Meeo GST Tax Engine — Changelog

All notable changes to the Meeo GST Tax Engine, database schema, calculation services, and administrative APIs are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and adheres to Semantic Versioning.

---

## [1.0.0] - 2026-10-16

### Added
- **Database Schema**:
  - Enums added in `prisma/schema/enum.prisma`: `TaxVerificationStatus`, `GstTaxTreatment`, `GstRuleStatus`, `SellerGstRegistrationType`, and `SellerTaxStatus`.
  - Normalized models in `prisma/schema/Tax/`:
    - `TaxClassification`: HSN/SAC code catalog with review verification status and metadata.
    - `GstRule`: Versioned statutory tax rules with CGST, SGST, IGST, CESS rates, and effective date intervals.
    - `GstRuleAudit`: Immutable change audit log tracking actors, timestamps, reasons, and previous/new states.
    - `SellerTaxProfile`: Multi-seller GSTIN registration profiles, state codes, and platform defaults.
    - `OrderTaxSnapshot` & `OrderItemTaxSnapshot`: Immutable order-level and line-level financial snapshots capturing place of supply, rates, taxable amounts, and allocated discounts at order placement.
  - Relational connections added to `Product`, `Order`, `OrderItem`, and `User`.
  - Migration file generated: `prisma/migrations/20261016180000_add_gst_engine_models/migration.sql`.
- **Domain Services**:
  - `src/modules/tax/constants/indianStates.ts`: Complete mapping of all 36 Indian states and union territories with 2-digit GST state codes, case-insensitive state normalizer, 15-character GSTIN regex validator, and state code extractor.
  - `src/modules/tax/services/gstEngine.service.ts`: Pure domain GST calculation service supporting Place of Supply (POS), inclusive and exclusive price deduction, proportional discount allocation with penny discrepancy reconciliation on the largest line item, and 18% shipping freight GST under SAC 9968.
  - `src/modules/tax/services/taxRule.service.ts`: Central statutory tax rule resolution engine with hierarchical HSN lookup (8-digit tariff item -> 6-digit subheading -> 4-digit heading -> 2-digit chapter), DRAFT → APPROVED → ACTIVE/SCHEDULED → RETIRED lifecycle management, audit trail recording, and default CBIC seed data.
  - `src/modules/tax/services/sellerTax.service.ts`: Seller tax profile management with automated fallback to the authoritative platform seller store profile.
  - `src/modules/tax/services/invoice.service.ts`: Rule 46 CGST Rules compliant Tax Invoice generation with Indian currency words conversion (Rupees, Lakhs, Crores, Paise).
- **APIs & Routing**:
  - Registered `/api/v1/tax` in `src/app.ts`.
  - Customer endpoints: `POST /api/v1/tax/quote`, `GET /api/v1/tax/orders/:orderId/invoice`.
  - Administrative endpoints: `GET/POST /classifications`, `PATCH /classifications/:id/status`, `GET/POST /rules`, `PATCH /rules/:id/approve`, `PATCH /rules/:id/publish`, `PATCH /rules/:id/retire`, `GET /rules/:id/audits`.
  - Seller endpoints: `GET/PUT /sellers/profile`.
  - Granular RBAC permissions: `TAX_READ`, `TAX_MANAGE`, `TAX_APPROVE` in `src/modules/rbac/constants/permission.constants.ts`.
- **Checkout & Order Integration**:
  - `orderValidation.service.ts`: Integrated server-side tax resolution for cart items.
  - `orderCreation.service.ts`: Atomic creation of `OrderTaxSnapshot` and `OrderItemTaxSnapshot` inside Prisma checkout transaction.
- **Automated Tests**:
  - `src/__tests__/gstEngine.unit.test.ts`: 11 unit tests covering POS, inclusive/exclusive arithmetic, discount allocation, shipping, and Indian words formatter.
  - `src/__tests__/taxRule.unit.test.ts`: 3 unit tests covering rule lifecycle, CBIC seeds, and audit trails.
  - `src/__tests__/orders.unit.test.ts`: 25 unit tests verifying end-to-end checkout orchestration with snapshots.
- **Documentation**:
  - `docs/gst/README.md`
  - `docs/gst/DATABASE_AUDIT.md`
  - `docs/gst/DATABASE_DESIGN.md`
  - `docs/gst/API_REFERENCE.md`
  - `docs/gst/CALCULATION_RULES.md`
  - `docs/gst/ADMIN_GUIDE.md`
  - `docs/gst/SELLER_GUIDE.md`
  - `docs/gst/CUSTOMER_GUIDE.md`
  - `docs/gst/MIGRATION_GUIDE.md`
  - `docs/gst/TESTING.md`
  - `docs/gst/CHANGELOG.md`
