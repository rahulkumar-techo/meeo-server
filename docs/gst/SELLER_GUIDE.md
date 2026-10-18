# Meeo GST Tax Engine — Seller Compliance & Tax Profile Guide

This guide details merchant onboarding, statutory GSTIN registration, product HSN classification submission, and invoice reconciliation for third-party sellers on the Meeo Marketplace platform.

---

## 1. Statutory Registration Requirements

Under Section 24 of the CGST Act, 2017, persons making supplies of goods through an electronic commerce operator (ECO) are required to take mandatory GST registration, irrespective of their annual aggregate turnover threshold:

1. **Mandatory GSTIN**: All third-party merchants selling physical goods on Meeo must possess a valid, active 15-digit GSTIN.
2. **Composition Scheme Limitation**: Composition dealers are generally prohibited from inter-state e-commerce supplies under Section 10(2) of the CGST Act. Sellers operating under composition scheme are restricted accordingly.
3. **State Code Concordance**: The first 2 digits of the seller's GSTIN must strictly match the state code of their primary registered dispatch warehouse.

---

## 2. Managing Your Seller Tax Profile

### Step 1: Submit Tax Registration
Sellers can view and submit their tax profile via:
```json
PUT /api/v1/tax/sellers/profile
{
  "legalBusinessName": "Apex Retail Enterprises LLP",
  "tradeName": "Apex Store",
  "gstin": "27AAACA1234F1Z8",
  "stateCode": "27",
  "stateName": "Maharashtra",
  "addressLine1": "Gala No 14, Industrial Estate",
  "city": "Pune",
  "postalCode": "411001",
  "registrationType": "REGULAR"
}
```

### Profile Statuses:
- **`ACTIVE`**: Verified and authorized to accept orders.
- **`PENDING_VERIFICATION`**: Submitted, awaiting Meeo compliance team review.
- **`SUSPENDED`**: GSTIN cancelled or non-compliant; orders blocked.

---

## 3. Product HSN Classification & Review

1. **Seller Product Listings**: When listing a product, sellers specify the applicable 4, 6, or 8-digit HSN code.
2. **Compliance Verification**:
   - Meeo internal compliance verifies whether the selected HSN matches official CBIC tariff definitions.
   - Unverified or flagged listings undergo administrative review before publication.
3. **No Arbitrary Tax Rates**: Sellers do **not** set arbitrary tax rates. Tax rates are resolved authoritatively by Meeo's central GST rule master based on the verified HSN code.

---

## 4. Invoicing & Marketplace Facilitation (Section 52 TCS)

- **Tax Invoice Issuance**: For seller-fulfilled orders, the official Rule 46 Tax Invoice reflects the seller's legal name, registered trade address, and GSTIN as the supplier.
- **Tax Collection at Source (TCS)**: Under Section 52 of the CGST Act, Meeo acts as an e-commerce operator and collects net TCS (0.5% CGST + 0.5% SGST or 1% IGST) on taxable supplies, remitting it to the government on behalf of the seller.
- **Monthly Reconciliation**: Monthly sales reports and TCS certificates are available via the seller dashboard for GSTR-8 / GSTR-1 filing reconciliation.
