# Meeo GST Tax Engine & Compliance Architecture

Welcome to the statutory Goods & Services Tax (GST) calculation and rule-governance engine for the **Meeo E-Commerce Platform**.

This system provides a production-grade, legally compliant Indian GST engine adhering to the Central Goods and Services Tax Act, 2017 (CGST Act), Integrated Goods and Services Tax Act, 2017 (IGST Act), and Rule 46 of the CGST Rules (Tax Invoices).

---

## 1. Core Architecture Principles

1. **Statutory Source of Truth**: Central Board of Indirect Taxes and Customs (CBIC) notifications and official tariff schedules dictate rates. Rates and classifications are never guessed or hardcoded.
2. **Deterministic Place of Supply (POS)**: Automatically calculates intra-state (CGST + SGST/UTGST) vs. inter-state (IGST) supplies across all 36 Indian states and union territories.
3. **Decimal-Safe Financial Arithmetic**: Proportional order discount apportioning with integer-penny remainder reconciliation on the largest line item to guarantee that line totals reconcile exactly with order totals.
4. **Immutable Snapshots**: Order completion records complete, immutable tax snapshots (`OrderTaxSnapshot` and `OrderItemTaxSnapshot`) preserving historical audit integrity regardless of future tax amendments.
5. **Separation of Concerns**: Pure domain calculation engine (`GstEngineService`) decoupled from Fastify HTTP transport and database persistence.
6. **Administrative Governance**: Multi-stage lifecycle (`DRAFT` → `APPROVED` → `ACTIVE` / `SCHEDULED` → `RETIRED`) with mandatory reason recording, actor logging, and conflict prevention.

---

## 2. Directory Structure & Module Map

```
server/
├── prisma/
│   ├── migrations/
│   │   └── 20261016180000_add_gst_engine_models/
│   └── schema/
│       ├── enum.prisma                     # Tax enums (Treatment, Status, Registration)
│       ├── Tax/
│       │   ├── taxClassification.prisma    # HSN/SAC classification master
│       │   ├── gstRule.prisma              # Versioned statutory tax rules
│       │   ├── gstRuleAudit.prisma         # Immutable audit history of rule changes
│       │   ├── sellerTaxProfile.prisma     # Seller GSTIN & tax configurations
│       │   └── orderTaxSnapshot.prisma     # Immutable order & item tax snapshots
│       └── Orders/
│           ├── orders.prisma               # Relational hook to OrderTaxSnapshot
│           └── ordersItems.prisma          # Relational hook to OrderItemTaxSnapshot
│
├── src/
│   ├── modules/
│   │   ├── tax/
│   │   │   ├── constants/
│   │   │   │   └── indianStates.ts         # 36 GST state codes, GSTIN regex & normalizer
│   │   │   ├── services/
│   │   │   │   ├── gstEngine.service.ts    # Pure tax calculation & discount allocation
│   │   │   │   ├── taxRule.service.ts      # Rule resolution, lifecycle & CBIC seeds
│   │   │   │   ├── sellerTax.service.ts    # Seller profiles & platform defaults
│   │   │   │   └── invoice.service.ts      # Rule 46 Tax Invoice generator & Indian words
│   │   │   ├── validations/
│   │   │   │   └── tax.validation.ts       # Zod schemas for quotes, rules & sellers
│   │   │   ├── controller/
│   │   │   │   └── tax.controller.ts       # Fastify HTTP request handlers
│   │   │   └── routes/
│   │   │       └── tax.route.ts            # Route registrations & permission guards
│   │   └── orders/services/
│   │       ├── orderValidation.service.ts  # Pre-order tax resolution & validation
│   │       └── orderCreation.service.ts    # Order creation with immutable snapshots
│
└── docs/gst/
    ├── README.md                           # This architecture overview
    ├── DATABASE_AUDIT.md                   # Legacy database findings & risk audit
    ├── DATABASE_DESIGN.md                  # Schema ER diagram & architectural decisions
    ├── API_REFERENCE.md                    # REST API endpoints, schemas & error codes
    ├── CALCULATION_RULES.md                # Mathematical formulas, rounding & POS rules
    ├── ADMIN_GUIDE.md                      # Rule lifecycle, approvals & CBIC verification
    ├── SELLER_GUIDE.md                     # Seller GSTIN registration & catalog review
    ├── CUSTOMER_GUIDE.md                   # Price display, tax invoices & B2B ITC
    ├── MIGRATION_GUIDE.md                  # Deployment steps, migrations & rollback
    ├── TESTING.md                          # Test suite fixtures, edge cases & coverage
    └── CHANGELOG.md                        # Versioned audit record of changes
```

---

## 3. Getting Started & Verification

### Running Automated Test Suites
```bash
# Execute domain calculation tests
npx vitest run src/__tests__/gstEngine.unit.test.ts

# Execute statutory rule lifecycle & audit tests
npx vitest run src/__tests__/taxRule.unit.test.ts

# Execute checkout & order integration tests
npx vitest run src/__tests__/orders.unit.test.ts

# Run TypeScript compile validation
npm run typecheck
```

### Seeding Standard CBIC Tax Rules
When setting up a new environment, standard CBIC tax rates (Apparel 5% / 12%, Electronics 18%, Books 0%, Courier Freight 18%) can be seeded via:
```typescript
import { taxRuleService } from "@/modules/tax/services/taxRule.service.js";
await taxRuleService.seedStandardTaxClassificationsAndRules();
```

---

## 4. Documentation Index

- [Database Audit & Findings](DATABASE_AUDIT.md)
- [Database Schema Design & ERD](DATABASE_DESIGN.md)
- [API Reference & OpenAPI Contracts](API_REFERENCE.md)
- [Statutory Calculation Rules & Formulas](CALCULATION_RULES.md)
- [Administrator Operational Guide](ADMIN_GUIDE.md)
- [Seller Compliance Guide](SELLER_GUIDE.md)
- [Customer & B2B Buyer Guide](CUSTOMER_GUIDE.md)
- [Production Migration & Backfill Strategy](MIGRATION_GUIDE.md)
- [Testing & Quality Assurance Guide](TESTING.md)
- [Changelog](CHANGELOG.md)
