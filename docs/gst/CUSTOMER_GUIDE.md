# Meeo GST Tax Engine — Customer & B2B Buyer Guide

This guide explains how taxes are displayed to buyers across the Meeo shopping experience, including inclusive catalog pricing, checkout tax breakdowns, delivery fees, B2B Input Tax Credit (ITC) invoicing, and refund adjustments.

---

## 1. Transparent Pricing & Display

1. **Catalog Prices**:
   - For retail consumers (B2C), consumer protection laws mandate that catalog and product display prices include applicable statutory taxes (`Inclusive of all taxes`).
   - The price you see on the product page is the maximum retail price you pay for the merchandise.
2. **Checkout Breakdown**:
   - During checkout, the cart drawer and order summary display a full, transparent breakdown:
     - **Item Subtotal (Taxable Value)**
     - **Applied Discounts (Coupon / Promotions)**
     - **Delivery & Courier Fees**
     - **Applicable GST** (Itemized as CGST + SGST or IGST depending on your delivery address)
     - **Final Payable Amount**

---

## 2. Intra-State vs. Inter-State Delivery

GST calculation depends on where the product is shipped from and where you receive delivery:
- **Same State (e.g. Maharashtra to Maharashtra)**: The tax is split equally into **Central GST (CGST)** and **State GST (SGST)**.
- **Different State (e.g. Maharashtra to Karnataka)**: The tax is charged as **Integrated GST (IGST)**.
- The total percentage rate is identical in both scenarios (e.g. 9% CGST + 9% SGST = 18% IGST).

---

## 3. Business Purchases & Input Tax Credit (B2B ITC)

Registered businesses purchasing on Meeo can claim Input Tax Credit under Section 16 of the CGST Act:

1. **Entering Business GSTIN**:
   - At checkout, select the **"Use GSTIN for Business Purchase"** checkbox.
   - Enter your company's registered 15-character GSTIN and legal entity name.
2. **Validation**:
   - Meeo validates the structure and state code of your GSTIN in real time.
3. **Statutory Tax Invoice (Rule 46)**:
   - Upon order confirmation and dispatch, download the official Tax Invoice from your Order Details page.
   - The invoice features:
     - Your company name, billing address, and GSTIN.
     - Supplier legal name and GSTIN.
     - Itemized HSN codes, taxable values, and CGST/SGST/IGST breakdown.
     - Total payable amount written in formal Indian currency words.
   - The transaction details will be reported in Meeo's GSTR-1, allowing the invoice to appear in your **GSTR-2B** for automatic ITC reconciliation.

---

## 4. Cancellations, Returns & Refunds

- **Full Order Cancellation**: If you cancel an order before dispatch or return an item, you receive a full refund including the exact statutory GST charged.
- **Partial Returns**: When returning one item from a multi-item order, your refund is computed based on the item's immutable snapshot price less the proportionally allocated coupon discount.
- **Credit Note Issuance**: Under Section 34 of the CGST Act, Meeo generates a statutory Credit Note linked to the original Tax Invoice for accounting records.
