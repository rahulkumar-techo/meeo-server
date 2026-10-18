# Master Product Attributes API

> **Base Route**: `/api/v1/attributes`  
> **Route File**: [`src/modules/catalog/routes/attribute.route.ts`](file:///e:/e-com/server/src/modules/catalog/routes/attribute.route.ts)  
> **Controller**: [`src/modules/catalog/controller/attribute.controller.ts`](file:///e:/e-com/server/src/modules/catalog/controller/attribute.controller.ts)  
> **Service**: [`src/modules/catalog/services/attribute.service.ts`](file:///e:/e-com/server/src/modules/catalog/services/attribute.service.ts)  
> **Validation**: [`src/modules/catalog/validations/attribute.validation.ts`](file:///e:/e-com/server/src/modules/catalog/validations/attribute.validation.ts)  

---

## 📌 Overview

A clean, minimal API to manage master product options/attributes (e.g. `Color`, `Size`, `Material`, `Storage`) and their values (`Red`, `Blue`, `XL`, `128GB`).

---

## 📋 Endpoints Summary

| Method | Endpoint | Access | Permission | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/attributes` | Public | None | List all attributes with their values & pagination |
| `GET` | `/api/v1/attributes/:id` | Public | None | Get a single attribute with all its values |
| `POST` | `/api/v1/attributes` | Authenticated | `attribute:create` / `product:create` | Create new attribute with initial values |
| `PATCH` | `/api/v1/attributes/:id` | Authenticated | `attribute:update` / `product:update` | Update attribute name and/or add new values |
| `DELETE` | `/api/v1/attributes/:id` | Authenticated | `attribute:delete` / `product:delete` | Delete attribute (cascades automatically) |

---

## 🛠️ Usage Examples

### 1. Create Attribute (with initial values)
`POST /api/v1/attributes`
```json
{
  "name": "Color",
  "values": ["Red", "Blue", "Black"]
}
```

#### Response (`201 Created`)
```json
{
  "success": true,
  "message": "Attribute created successfully",
  "data": {
    "id": "attr-uuid-001",
    "name": "Color",
    "values": [
      { "id": "val-uuid-01", "attributeId": "attr-uuid-001", "value": "Black" },
      { "id": "val-uuid-02", "attributeId": "attr-uuid-001", "value": "Blue" },
      { "id": "val-uuid-03", "attributeId": "attr-uuid-001", "value": "Red" }
    ],
    "_count": { "values": 3 }
  }
}
```

---

### 2. List Attributes
`GET /api/v1/attributes?page=1&limit=20`

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Attributes retrieved successfully",
  "data": {
    "items": [
      {
        "id": "attr-uuid-001",
        "name": "Color",
        "values": [
          { "id": "val-uuid-01", "value": "Black" },
          { "id": "val-uuid-02", "value": "Blue" },
          { "id": "val-uuid-03", "value": "Red" }
        ],
        "_count": { "values": 3 }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

### 3. Update Attribute (Rename, Add New Values, or Both)
`PATCH /api/v1/attributes/:id`

#### Scenario A: Rename only
```json
{
  "name": "Primary Color"
}
```

#### Scenario B: Append new values
```json
{
  "values": ["Midnight Purple", "Rose Gold"]
}
```

#### Scenario C: Rename and append values together
```json
{
  "name": "Primary Color",
  "values": ["Midnight Purple", "Rose Gold"]
}
```

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Attribute updated successfully",
  "data": {
    "id": "attr-uuid-001",
    "name": "Primary Color",
    "values": [
      { "id": "val-uuid-01", "value": "Black" },
      { "id": "val-uuid-02", "value": "Blue" },
      { "id": "val-uuid-04", "value": "Midnight Purple" },
      { "id": "val-uuid-03", "value": "Red" },
      { "id": "val-uuid-05", "value": "Rose Gold" }
    ],
    "_count": { "values": 5 }
  }
}
```

---

### 4. Delete Attribute
`DELETE /api/v1/attributes/:id`

#### Response (`200 OK`)
```json
{
  "success": true,
  "message": "Attribute deleted successfully",
  "data": {
    "id": "attr-uuid-001"
  }
}
```
