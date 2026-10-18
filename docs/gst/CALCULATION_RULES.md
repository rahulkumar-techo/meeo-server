# Meeo GST Tax Engine — Calculation Rules & Statutory Formulas

This document outlines the mathematical rules, statutory legal principles, discount allocation algorithms, rounding methodologies, and worked numerical examples implemented by the Meeo GST Engine.

---

## 1. Place of Supply (POS) Determination

Under **Section 7 and Section 8 of the Integrated Goods and Services Tax (IGST) Act, 2017**:
- **Location of Supplier ($L_s$)**: State where the seller is registered and from which goods are dispatched.
- **Place of Supply ($P_s$)**: Destination state where delivery terminates (customer delivery address).

### Rule:
$$\text{If } L_s = P_s \implies \text{Intra-State Supply (CGST + SGST/UTGST)}$$
$$\text{If } L_s \neq P_s \implies \text{Inter-State Supply (IGST)}$$

- For Intra-State supplies:
  - $\text{CGST Rate} = \frac{\text{Statutory GST Rate}}{2}$
  - $\text{SGST/UTGST Rate} = \frac{\text{Statutory GST Rate}}{2}$
  - $\text{IGST Rate} = 0\%$
- For Inter-State supplies:
  - $\text{IGST Rate} = \text{Statutory GST Rate}$
  - $\text{CGST Rate} = 0\%$
  - $\text{SGST/UTGST Rate} = 0\%$

---

## 2. Price Handling & Taxable Value Calculations

### 2.1 GST-Exclusive Pricing
When a product catalog price is configured as net of tax:
$$\text{Gross Line Total} = \text{Unit Price} \times \text{Quantity}$$
$$\text{Net Taxable Amount} = \text{Gross Line Total} - \text{Allocated Discount}$$
$$\text{Tax Amount} = \text{Round}\left(\frac{\text{Net Taxable Amount} \times \text{Applicable Rate}}{100}\right)$$
$$\text{Final Line Total} = \text{Net Taxable Amount} + \text{Tax Amount}$$

### 2.2 GST-Inclusive Pricing
When a product catalog price is displayed inclusive of tax:
$$\text{Discounted Gross} = (\text{Unit Price} \times \text{Quantity}) - \text{Allocated Discount}$$
$$\text{Net Taxable Amount} = \text{Round}\left(\frac{\text{Discounted Gross}}{1 + \frac{\text{Applicable Rate}}{100}}\right)$$
$$\text{Tax Amount} = \text{Discounted Gross} - \text{Net Taxable Amount}$$
$$\text{Final Line Total} = \text{Discounted Gross}$$

*Notice: In inclusive pricing, customer payable is preserved exactly, avoiding unexpected penny increments.*

---

## 3. Proportional Discount Allocation & The Penny Problem

When an order-level promotional coupon or automatic promotion applies (e.g. ₹100 off on total cart), Indian GST law requires discount to be apportioned across line items prior to calculating GST:

### Proportional Share Formula:
$$\text{Line Ratio}_i = \frac{\text{Gross Total}_i}{\sum_{j=1}^{n} \text{Gross Total}_j}$$
$$\text{Tentative Discount}_i = \text{Round}\left(\text{Total Discount} \times \text{Line Ratio}_i\right)$$

### Penny Reconciliation:
Due to 2-decimal rounding, the sum of tentative line discounts $\sum \text{Tentative Discount}_i$ may differ from $\text{Total Discount}$ by $\pm 1$ or $\pm 2$ paise.
$$\Delta = \text{Total Discount} - \sum_{i=1}^n \text{Tentative Discount}_i$$
The difference $\Delta$ is applied directly to the line item with the **largest gross total**:
$$\text{Allocated Discount}_{\text{largest}} = \text{Tentative Discount}_{\text{largest}} + \Delta$$

This invariant guarantees:
$$\sum_{i=1}^n \text{Allocated Discount}_i \equiv \text{Total Discount}$$

---

## 4. Shipping Charges & Freight GST (SAC 9968)

Under CBIC Notification No. 11/2017-Central Tax (Rate), courier and freight services fall under Service Accounting Code (**SAC 9968**):
- Statutory GST rate: **18.00%**.
- If free shipping promotion applies, taxable shipping amount is ₹0.00.
- Otherwise:
  - $\text{Taxable Shipping Amount} = \text{Shipping Fee}$
  - Intra-state: 9% CGST + 9% SGST.
  - Inter-state: 18% IGST.

---

## 5. Rounding Policy

- All financial intermediate and line amounts use standard **Half-Up Rounding** to 2 decimal places:
  $$\text{Round}(x) = \frac{\lfloor 100x + 0.5 \rfloor}{100}$$
- JavaScript floating point precision issues are eliminated using `Number.EPSILON` guards before rounding.
- Order grand total reconciles:
  $$\text{Grand Total} = \sum \text{Final Line Totals} + \text{Final Shipping Total}$$

---

## 6. Worked Numerical Examples

### Example 1: Intra-State Supply with Mixed Tax Rates & Coupon Discount
- **Seller**: Mumbai, Maharashtra (Code 27).
- **Buyer**: Pune, Maharashtra (Code 27) $\implies$ **Intra-State (CGST + SGST)**.
- **Cart Items**:
  - Item A: Laptop, HSN 8471, Rate 18%, Price ₹50,000 (Exclusive).
  - Item B: Cotton T-Shirt, HSN 6109, Rate 5%, Price ₹1,000 (Exclusive).
- **Gross Subtotal**: ₹51,000.
- **Coupon Discount**: ₹1,000 off order.
- **Shipping**: ₹100.

#### Calculations:
1. **Discount Allocation**:
   - Total Gross = ₹51,000.
   - Item A share = $\frac{50000}{51000} \times 1000 = ₹980.39$.
   - Item B share = $\frac{1000}{51000} \times 1000 = ₹19.61$.
   - Sum = ₹980.39 + ₹19.61 = ₹1000.00 (Exact, $\Delta = 0$).

2. **Item A (18% GST)**:
   - Taxable = ₹50,000 - ₹980.39 = ₹49,019.61.
   - CGST (9%) = ₹4,411.76.
   - SGST (9%) = ₹4,411.76.
   - Tax Total = ₹8,823.52.
   - Line Total = ₹57,843.13.

3. **Item B (5% GST)**:
   - Taxable = ₹1,000 - ₹19.61 = ₹980.39.
   - CGST (2.5%) = ₹24.51.
   - SGST (2.5%) = ₹24.51.
   - Tax Total = ₹49.02.
   - Line Total = ₹1,029.41.

4. **Shipping (SAC 9968, 18% GST)**:
   - Taxable = ₹100.00.
   - CGST (9%) = ₹9.00.
   - SGST (9%) = ₹9.00.
   - Shipping Total = ₹118.00.

5. **Order Totals**:
   - Total Taxable Value = ₹49,019.61 + ₹980.39 + ₹100.00 = ₹50,100.00.
   - Total CGST = ₹4,411.76 + ₹24.51 + ₹9.00 = ₹4,445.27.
   - Total SGST = ₹4,411.76 + ₹24.51 + ₹9.00 = ₹4,445.27.
   - Total Tax = ₹8,890.54.
   - **Grand Payable Total** = ₹50,100.00 + ₹8,890.54 = **₹58,990.54**.
