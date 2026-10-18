# 👤 Customer Profile & Phone Verification

This guide covers viewing and updating the customer's personal profile, and verifying their phone number via SMS OTP for order notifications and two-factor safety.

---

## 📋 Endpoints Overview

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `PATCH` | `/api/v1/user/profile` | Authenticated | Update user first name, last name, and profile details |
| `POST` | `/api/v1/user/phone/request-otp` | Authenticated | Request SMS OTP verification code |
| `PUT` | `/api/v1/user/phone` | Authenticated | Verify OTP and attach phone number to account |

---

## 1. Update Profile Details

Update the customer's basic personal profile information.

### Request
```http
PATCH /api/v1/user/profile HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "firstName": "Sarah",
  "lastName": "Connor",
  "avatarUrl": "https://assets.example.com/avatars/sarah.jpg"
}
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "usr_01J8R9XYZ8877",
    "email": "customer@example.com",
    "firstName": "Sarah",
    "lastName": "Connor",
    "avatarUrl": "https://assets.example.com/avatars/sarah.jpg",
    "phone": "+14155552671",
    "phoneVerified": true,
    "updatedAt": "2026-09-12T07:22:00.000Z"
  }
}
```

---

## 2. Request Phone Verification OTP

Sends a 6-digit SMS verification code to the customer's mobile device.

### Request
```http
POST /api/v1/user/phone/request-otp HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "phoneNumber": "+14155552671"
}
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Verification OTP sent successfully to +14155552671",
  "data": {
    "expiresInSeconds": 300,
    "resendAvailableInSeconds": 60
  }
}
```

---

## 3. Verify Phone OTP

Submits the OTP code to mark the customer's phone number as verified in the database.

### Request
```http
PUT /api/v1/user/phone HTTP/1.1
Host: api.example.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "phoneNumber": "+14155552671",
  "otp": "492810"
}
```

### Response `200 OK`
```json
{
  "success": true,
  "message": "Phone number successfully verified",
  "data": {
    "phone": "+14155552671",
    "phoneVerified": true,
    "verifiedAt": "2026-09-12T07:25:10.000Z"
  }
}
```

### Error Responses
- `400 Bad Request`: OTP expired or invalid code.
- `429 Too Many Requests`: Exceeded max retry attempts (cool-down timer active).
