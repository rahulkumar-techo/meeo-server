# Meeo GST Tax Engine — API Reference

This document provides exhaustive API documentation for customer-facing checkout quotes, tax invoice downloads, administrative rule governance, and seller GST profile configuration.

All endpoints are registered under `/api/v1/tax`.

---

## 1. Authentication & Permissions Matrix

| Endpoint | Method | Permission Required | Audience | Description |
|---|---|---|---|---|
| `/api/v1/tax/quote` | `POST` | Public / Optional Auth | Customer / Checkout | Calculates detailed real-time tax breakdown |
| `/api/v1/tax/orders/:orderId/invoice` | `GET` | Authenticated (Buyer / Admin) | Customer / Admin | Generates Rule 46 compliant Tax Invoice |
| `/api/v1/tax/classifications` | `GET` | `TAX_READ` | Admin | Lists HSN/SAC classifications |
| `/api/v1/tax/classifications` | `POST` | `TAX_MANAGE` | Admin | Creates a new HSN/SAC master entry |
| `/api/v1/tax/classifications/:id/status` | `PATCH` | `TAX_APPROVE` | Admin | Verifies or flags an HSN classification |
| `/api/v1/tax/rules` | `GET` | `TAX_READ` | Admin | Lists tax rules with status/HSN filter |
| `/api/v1/tax/rules` | `POST` | `TAX_MANAGE` | Admin | Creates a draft tax rule |
| `/api/v1/tax/rules/:id/approve` | `PATCH` | `TAX_APPROVE` | Admin | Approves a draft tax rule |
| `/api/v1/tax/rules/:id/publish` | `PATCH` | `TAX_MANAGE` | Admin | Activates or schedules an approved rule |
| `/api/v1/tax/rules/:id/retire` | `PATCH` | `TAX_MANAGE` | Admin | Deactivates an active or scheduled rule |
| `/api/v1/tax/rules/:id/audits` | `GET` | `TAX_READ` | Admin | Retrieves immutable audit trail of rule |
| `/api/v1/tax/sellers/profile` | `GET` | Authenticated | Seller / Admin | Retrieves seller tax profile |
| `/api/v1/tax/sellers/profile` | `PUT` | Authenticated | Seller / Admin | Registers or updates seller GSTIN |

---

## 2. Customer & Checkout Endpoints

### 2.1 Calculate Tax Quote
- **Path**: `POST /api/v1/tax/quote`
- **Purpose**: Computes statutory GST breakdown for a cart before checkout completion.
- **Request Body**:
```json
{
  "customerState": "Karnataka",
  "customerGstin": "29AAACM1234F1Z5",
  "items": [
    {
      "productId": "49b4c05b-8015-46aa-b2b9-e48348d42d3c",
      "quantity": 2,
      "unitPrice": 1500.00,
      "isInclusive": false
    }
  ],
  "shippingFee": 100.00,
  "orderLevelDiscount": 200.00
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "placeOfSupply": {
      "sellerStateCode": "27",
      "sellerStateName": "Maharashtra",
      "customerStateCode": "29",
      "customerStateName": "Karnataka",
      "isInterState": true
    },
    "items": [
      {
        "id": "item_0",
        "productId": "49b4c05b-8015-46aa-b2b9-e48348d42d3c",
        "productName": "Wireless Ergonomic Mouse",
        "hsnCode": "84716060",
        "quantity": 2,
        "unitPrice": 1500.00,
        "grossLineTotal": 3000.00,
        "allocatedDiscount": 200.00,
        "netTaxableAmount": 2800.00,
        "taxTreatment": "TAXABLE",
        "cgstRate": 0.00,
        "sgstRate": 0.00,
        "igstRate": 18.00,
        "cessRate": 0.00,
        "cgstAmount": 0.00,
        "sgstAmount": 0.00,
        "igstAmount": 504.00,
        "cessAmount": 0.00,
        "totalTaxAmount": 504.00,
        "finalLineTotal": 3304.00,
        "isInclusive": false
      }
    ],
    "shipping": {
      "shippingFee": 100.00,
      "taxableAmount": 100.00,
      "sacCode": "9968",
      "gstRate": 18.00,
      "cgstRate": 0.00,
      "sgstRate": 0.00,
      "igstRate": 18.00,
      "cgstAmount": 0.00,
      "sgstAmount": 0.00,
      "igstAmount": 18.00,
      "totalTaxAmount": 18.00,
      "finalShippingTotal": 118.00
    },
    "totals": {
      "grossSubtotal": 3000.00,
      "totalDiscount": 200.00,
      "totalTaxableAmount": 2900.00,
      "totalCgstAmount": 0.00,
      "totalSgstAmount": 0.00,
      "totalIgstAmount": 522.00,
      "totalCessAmount": 0.00,
      "totalTaxAmount": 522.00,
      "shippingTotal": 118.00,
      "grandTotal": 3422.00
    },
    "calculationVersion": "v1.0",
    "calculatedAt": "2026-10-16T18:45:00.000Z"
  }
}
```

---

### 2.2 Generate Statutory Tax Invoice
- **Path**: `GET /api/v1/tax/orders/:orderId/invoice`
- **Purpose**: Retrieves a complete, immutable Rule 46 CGST compliant Tax Invoice data structure for rendering or PDF generation.
- **Headers**: `Authorization: Bearer <token>`
- **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "invoiceNumber": "INV-20261016-0042",
    "invoiceDate": "2026-10-16T18:00:00.000Z",
    "orderNumber": "ORD-20261016-1001",
    "orderDate": "2026-10-16T17:58:00.000Z",
    "paymentMethod": "ONLINE",
    "paymentStatus": "COMPLETED",
    "supplier": {
      "legalName": "Meeo E-Commerce Private Limited",
      "tradeName": "Meeo Store",
      "gstin": "27AAACM1234F1Z5",
      "address": "Plot 42, Bandra Kurla Complex, Mumbai, Maharashtra - 400051",
      "stateCode": "27",
      "stateName": "Maharashtra"
    },
    "recipient": {
      "name": "Jane Doe Enterprises",
      "gstin": "29AAACM1234F1Z5",
      "shippingAddress": "12th Cross, Indiranagar, Bengaluru, Karnataka - 560038",
      "placeOfSupply": "Karnataka (Code: 29)",
      "isInterState": true
    },
    "lineItems": [
      {
        "serialNumber": 1,
        "description": "Mechanical Keyboard",
        "hsnSac": "84713010",
        "quantity": 1,
        "unitPrice": 1000.00,
        "grossValue": 1000.00,
        "discount": 0.00,
        "taxableValue": 1000.00,
        "cgstRate": 0,
        "cgstAmount": 0,
        "sgstRate": 0,
        "sgstAmount": 0,
        "igstRate": 18,
        "igstAmount": 180.00,
        "total": 1180.00
      }
    ],
    "shipping": {
      "description": "Courier & Express Freight (SAC 9968)",
      "sac": "9968",
      "taxableAmount": 0.00,
      "igstRate": 18,
      "igstAmount": 0.00,
      "total": 0.00
    },
    "totals": {
      "totalTaxableAmount": 1000.00,
      "totalCgstAmount": 0.00,
      "totalSgstAmount": 0.00,
      "totalIgstAmount": 180.00,
      "totalTaxAmount": 180.00,
      "grandTotal": 1180.00,
      "amountInWords": "Rupees One Thousand One Hundred and Eighty Only"
    },
    "statutoryNotes": [
      "Tax is payable on reverse charge: No",
      "Goods once sold are subject to standard Meeo Return & Replacement Policy.",
      "Computer generated invoice under Section 31 of the CGST Act, 2017."
    ]
  }
}
```

---

## 3. Administrative Governance Endpoints

### 3.1 Create Draft Tax Rule
- **Path**: `POST /api/v1/tax/rules`
- **Permission**: `TAX_MANAGE`
- **Request Body**:
```json
{
  "hsnCode": "84713010",
  "taxTreatment": "TAXABLE",
  "cgstRate": 9.00,
  "sgstRate": 9.00,
  "igstRate": 18.00,
  "cessRate": 0.00,
  "effectiveFrom": "2026-11-01T00:00:00.000Z",
  "effectiveTo": null,
  "notificationRef": "CBIC Notification No. 14/2026-Central Tax (Rate)",
  "jurisdiction": "IN"
}
```
- **Response `201 Created`**:
```json
{
  "success": true,
  "data": {
    "id": "a50c822e-bf73-4530-9b45-a7b3111005bc",
    "hsnCode": "84713010",
    "status": "DRAFT",
    "version": 1,
    "effectiveFrom": "2026-11-01T00:00:00.000Z",
    "createdById": "admin-user-uuid"
  }
}
```

### 3.2 Approve Tax Rule
- **Path**: `PATCH /api/v1/tax/rules/:id/approve`
- **Permission**: `TAX_APPROVE`
- **Request Body**:
```json
{
  "reason": "Verified against CBIC Gazette Notification published on 15 Oct 2026."
}
```

### 3.3 Publish / Schedule Tax Rule
- **Path**: `PATCH /api/v1/tax/rules/:id/publish`
- **Permission**: `TAX_MANAGE`
- **Behavior**: If `effectiveFrom <= now`, transitions rule to `ACTIVE` and supersedes overlapping active rules for the same HSN. If `effectiveFrom > now`, transitions rule to `SCHEDULED`.

### 3.4 Inspect Rule Audit History
- **Path**: `GET /api/v1/tax/rules/:id/audits`
- **Permission**: `TAX_READ`
- **Response**: Returns chronological records of `RULE_CREATED`, `RULE_APPROVED`, `RULE_PUBLISHED`, `RULE_SCHEDULED`, and `RULE_RETIRED` actions with actor IDs, previous states, and diffs.

---

## 4. Error Responses

Standard structured error format:
```json
{
  "success": false,
  "error": {
    "code": "TAX_CONFLICT",
    "message": "Conflicting active GST rules found for HSN \"8471\". Legal audit required.",
    "statusCode": 409
  }
}
```

| HTTP Status | Error Code | Description |
|---|---|---|
| `400 Bad Request` | `VALIDATION_ERROR` | Malformed GSTIN, invalid state code, or rate format |
| `404 Not Found` | `NOT_FOUND` | Tax rule or classification ID not found |
| `409 Conflict` | `TAX_CONFLICT` | Overlapping active rules or duplicate HSN registration |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `TAX_MANAGE` or `TAX_APPROVE` permissions |
