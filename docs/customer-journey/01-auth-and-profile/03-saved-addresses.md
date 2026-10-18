# 🏠 Customer Address Book & Delivery Locations

Customers can maintain multiple saved shipping and billing addresses for rapid checkout.

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/user/addresses` | Authenticated | Create a new delivery/billing address |
| `PATCH` | `/api/v1/user/addresses/:addressId` | Authenticated | Update an existing address |
| `DELETE` | `/api/v1/user/addresses/:addressId` | Authenticated | Delete a saved address |

---

## 1. Create a Saved Address

### Request
```http
POST /api/v1/user/addresses HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "recipientName": "Sarah Connor",
  "phone": "+14155552671",
  "addressLine1": "742 Evergreen Terrace",
  "addressLine2": "Apartment 4B",
  "city": "Springfield",
  "state": "Oregon",
  "postalCode": "97477",
  "country": "US",
  "isDefaultShipping": true,
  "isDefaultBilling": true,
  "addressType": "SHIPPING"
}
```

### Response `201 Created`
```json
{
  "success": true,
  "message": "Address created successfully",
  "data": {
    "id": "addr_01J8R9QWE9001",
    "userId": "usr_01J8R9XYZ8877",
    "recipientName": "Sarah Connor",
    "phone": "+14155552671",
    "addressLine1": "742 Evergreen Terrace",
    "addressLine2": "Apartment 4B",
    "city": "Springfield",
    "state": "Oregon",
    "postalCode": "97477",
    "country": "US",
    "isDefaultShipping": true,
    "isDefaultBilling": true,
    "addressType": "SHIPPING",
    "createdAt": "2026-09-12T07:23:00.000Z"
  }
}
```

---

## 2. Update an Existing Address

### Request
```http
PATCH /api/v1/user/addresses/addr_01J8R9QWE9001 HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "addressLine2": "Suite 100",
  "isDefaultShipping": true
}
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Address updated successfully",
  "data": {
    "id": "addr_01J8R9QWE9001",
    "addressLine1": "742 Evergreen Terrace",
    "addressLine2": "Suite 100",
    "city": "Springfield",
    "state": "Oregon",
    "postalCode": "97477",
    "country": "US",
    "isDefaultShipping": true,
    "isDefaultBilling": true,
    "updatedAt": "2026-09-12T07:26:00.000Z"
  }
}
```

---

## 3. Delete a Saved Address

### Request
```http
DELETE /api/v1/user/addresses/addr_01J8R9QWE9001 HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Address deleted successfully"
}
```
