# Authentication & Identity Architecture (`AUTH.md`)

> **Base Route**: `/api/v1/auth` (or `/api/auth`)  
> **Route File**: [`src/modules/auth/auth.route.ts`](file:///e:/e-com/server/src/modules/auth/auth.route.ts)  
> **Controller**: [`src/modules/auth/auth.controller.ts`](file:///e:/e-com/server/src/modules/auth/auth.controller.ts)  
> **Services**:  
> - [`src/modules/auth/auth.service.ts`](file:///e:/e-com/server/src/modules/auth/auth.service.ts) (Unified Orchestrator)  
> - [`src/modules/auth/authSession.service.ts`](file:///e:/e-com/server/src/modules/auth/authSession.service.ts) (Login, Google OAuth, Session Lifecycle, Account Linking)  
> - [`src/modules/auth/authRegistration.service.ts`](file:///e:/e-com/server/src/modules/auth/authRegistration.service.ts) (Registration, OTP Verification, Password Resets)  
> - [`src/modules/auth/googleAuth.service.ts`](file:///e:/e-com/server/src/modules/auth/googleAuth.service.ts) (Google JWKS Token Verification)  
> **Validations**: [`src/modules/auth/auth.validation.ts`](file:///e:/e-com/server/src/modules/auth/auth.validation.ts)  
> **Prisma Models**: [`auth_accounts`](file:///e:/e-com/server/prisma/schema/Identity/authAccount.prisma), [`users`](file:///e:/e-com/server/prisma/schema/Identity/user.prisma), [`user_sessions`](file:///e:/e-com/server/prisma/schema/Identity/session.prisma)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database & ER Model](#2-database--er-model)
3. [Identity & Account Linking Policy](#3-identity--account-linking-policy)
4. [Sensitive Data & OTP Security Rules](#4-sensitive-data--otp-security-rules)
5. [Session & Token Management](#5-session--token-management)
6. [API Endpoint Catalog](#6-api-endpoint-catalog)
   - [Public Endpoints](#public-endpoints)
   - [Authenticated Endpoints](#authenticated-endpoints)
7. [Security Threat Mitigations](#7-security-threat-mitigations)

---

## 1. Architecture Overview

This authentication system follows the **Decoupled Identity & Authentication Provider Model**. The human identity (`users`) is separated from the credentials used to verify that identity (`auth_accounts`).

### Golden Rule:
> **One real user has ONE application account**, even if they authenticate via multiple methods (Password, Google OAuth, etc.).

```
                          ┌─────────────────────────────┐
                          │      Next.js Frontend       │
                          │ (@react-oauth/google / Web) │
                          └──────────────┬──────────────┘
                                         │ HTTPS Credentials
                                         ▼
                          ┌─────────────────────────────┐
                          │     Node.js Render API      │
                          │   (Auth Controller/Router)  │
                          └──────────────┬──────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
                 ▼                                               ▼
      ┌──────────────────────┐                       ┌──────────────────────┐
      │  Argon2id Hashing    │                       │  Google Auth Library │
      │  (Password Provider) │                       │  (JWKS Verification) │
      └──────────┬───────────┘                       └──────────┬───────────┘
                 │                                               │
                 └───────────────────────┬───────────────────────┘
                                         │ Atomic $transaction
                                         ▼
                          ┌─────────────────────────────┐
                          │   PostgreSQL Database       │
                          │  ┌───────────────────────┐  │
                          │  │        users          │  │
                          │  └───────────┬───────────┘  │
                          │              │ 1:N          │
                          │  ┌───────────▼───────────┐  │
                          │  │     auth_accounts     │  │
                          │  └───────────────────────┘  │
                          └──────────────┬──────────────┘
                                         │
                                         ▼
                          ┌─────────────────────────────┐
                          │       Session Engine        │
                          │ - user_sessions (Postgres)  │
                          │ - Rotating HttpOnly Refresh │
                          │ - Short-lived Access JWT    │
                          └─────────────────────────────┘
```

---

## 2. Database & ER Model

```
+-----------------------------------------------------------------------------------+
|                                      users                                        |
+-----------------------------------------------------------------------------------+
| id                      UUID           PK      NOT NULL   default(gen_random_uuid())|
| email                   VARCHAR(255)   UNIQUE  NULL       normalized (lower + trim)|
| phone                   VARCHAR(32)    UNIQUE  NULL                                |
| firstName               VARCHAR(100)           NULL                                |
| lastName                VARCHAR(100)           NULL                                |
| avatarUrl               VARCHAR(512)           NULL                                |
| emailVerified           BOOLEAN                NOT NULL   default(false)           |
| phoneVerified           BOOLEAN                NOT NULL   default(false)           |
| status                  UserStatus             NOT NULL   default(ACTIVE)          |
| lastLoginAt             TIMESTAMPTZ            NULL                                |
| createdAt               TIMESTAMPTZ            NOT NULL   default(now())           |
| updatedAt               TIMESTAMPTZ            NOT NULL   updatedAt                |
| deletedAt               TIMESTAMPTZ            NULL                                |
+-----------------------------------------------------------------------------------+
                                         │ 1
                                         │
                                         │ 0..N (onDelete: Cascade)
                                         ▼
+-----------------------------------------------------------------------------------+
|                                  auth_accounts                                    |
+-----------------------------------------------------------------------------------+
| id                      UUID           PK      NOT NULL   default(gen_random_uuid())|
| userId                  UUID           FK      NOT NULL   REFERENCES users(id)     |
| provider                AuthProvider   NOT NULL           (PASSWORD | GOOGLE)      |
| providerAccountId       VARCHAR(255)   NOT NULL           (Google `sub` or email)  |
| passwordHash            VARCHAR(255)           NULL       (Argon2id, PASSWORD only)|
| lastUsedAt              TIMESTAMPTZ            NULL                                |
| createdAt               TIMESTAMPTZ            NOT NULL   default(now())           |
| updatedAt               TIMESTAMPTZ            NOT NULL   updatedAt                |
+-----------------------------------------------------------------------------------+
| UNIQUE(provider, providerAccountId)  <- Prevents account hijacking across accounts |
| UNIQUE(userId, provider)             <- One method per provider type per user      |
| INDEX(userId)                                                                     |
+-----------------------------------------------------------------------------------+
```

---

## 3. Identity & Account Linking Policy

### Decision Logic for `POST /auth/google`

1. **Verify Token Server-Side**: The frontend sends only `idToken`. The backend validates signature, issuer (`accounts.google.com`), audience (`GOOGLE_CLIENT_ID`), expiration, and `email_verified` via Google's public JWKS.
2. **Lookup by Provider Account ID**:
   - Query `auth_accounts` where `provider = GOOGLE` and `providerAccountId = token.sub`.
   - **Found**: Authenticate user directly. Check `status === ACTIVE` and `deletedAt === null`.
3. **Lookup by Verified Email**:
   - Query `users` where `email = token.email`.
   - **Found**:
     - Auto-link `AuthAccount(GOOGLE, token.sub)` in `$transaction`.
     - Update `emailVerified = true` and `avatarUrl` (if empty).
     - Both Password and Google now authenticate this single user identity.
4. **No Match (New User)**:
   - Create `User` (`emailVerified = true`, `status = ACTIVE`) and `AuthAccount(GOOGLE, token.sub)` atomically inside a `$transaction`.

### Safe Management Operations

| Operation | Endpoint | Business & Security Rules |
| :--- | :--- | :--- |
| **Add Password** | `POST /auth/password/set` | Allowed only if user does **not** already have a `PASSWORD` account. Uses Argon2id. |
| **Change Password** | `POST /auth/password/change` | Validates `currentPassword` first. Updates hash and revokes all other concurrent sessions. |
| **Link Google** | `POST /auth/accounts/google/link` | Verifies Google token. Checks that `token.sub` is not already bound to another user. If collision, returns `409 Conflict`. |
| **Unlink Provider** | `DELETE /auth/accounts/:provider` | **Strict Safety Rule**: A user can **NEVER** unlink their only authentication method (`count(methods) > 1`). Returns `400 Bad Request` if attempted. |

---

## 4. Sensitive Data & OTP Security Rules

1. **No OTP in Push Notifications**:
   - OTP codes are **strictly forbidden** in push notification payloads (`pushTitle`, `pushBody`).
   - Push notifications render on device lock screens, smartwatches, and OS notification centers without requiring device unlock.
   - OTPs are transmitted **only** to the verified channel destination (Email via SMTP, Phone via SMS).
2. **Credential Redaction**:
   - `passwordHash`, `providerAccountId`, refresh tokens, and internal secrets are never included in API responses or logs.

---

## 5. Session & Token Management

1. **Refresh Token Cookie**:
   - Issued in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie (`Path=/api/auth`).
   - Rotated upon every refresh.
   - Stored in database as a SHA-256 hash in `user_sessions`.
2. **Access Token**:
   - Short-lived JWT (15 minutes).
   - Signed using `JWT_ACCESS_SECRET`.
   - Sent via `Authorization: Bearer <accessToken>` or `accessToken` cookie.
3. **Revocation**:
   - `POST /auth/logout`: Invalidates the current session in `user_sessions` and clears cookies.
   - `POST /auth/sessions/revoke-all` / `POST /auth/logout-all`: Revokes all active sessions for the user and purges Redis auth cache.

---

## 6. API Endpoint Catalog

### Public Endpoints

#### `POST /auth/register`
Creates a new account and sends an email verification OTP.
- **Body**: `{ "email": "user@example.com", "password": "...", "firstName": "John", "lastName": "Doe" }`
- **Response**: `201 Created`

#### `POST /auth/login`
Authenticates via email & password. Sets `refreshToken` and `accessToken` cookies.
- **Body**: `{ "email": "user@example.com", "password": "...", "deviceName"?: "Chrome" }`
- **Response**: `200 OK` with user profile and tokens.

#### `POST /auth/google`
Authenticates or registers via Google ID token.
- **Body**: `{ "idToken": "eyJhbGciOi...", "deviceName"?: "Chrome" }`
- **Response**: `200 OK` with user profile and tokens.

#### `POST /auth/verify-otp`
Verifies user registration email.
- **Body**: `{ "email": "user@example.com", "otp": "1234" }`

#### `POST /auth/resend-otp`
Resends registration email verification code.
- **Body**: `{ "email": "user@example.com" }`

#### `POST /auth/forgot-password`
Sends password reset OTP to email.
- **Body**: `{ "email": "user@example.com" }`

#### `POST /auth/verify-reset-otp`
Validates password reset OTP without clearing it.
- **Body**: `{ "email": "user@example.com", "otp": "1234" }`

#### `POST /auth/reset-password`
Validates reset OTP, updates password with Argon2id, and invalidates all existing sessions.
- **Body**: `{ "email": "user@example.com", "otp": "1234", "password": "NewPassword123!" }`

#### `POST /auth/refresh`
Rotates refresh token and issues a new access token.
- **Headers / Cookies**: `refreshToken` cookie.
- **Response**: `200 OK`

---

### Authenticated Endpoints

#### `GET /auth/me`
Retrieves currently logged-in user profile, permissions, and roles.
- **Headers**: `Authorization: Bearer <accessToken>`

#### `GET /auth/accounts`
Lists all linked authentication providers for the current user.
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "accounts": [
        { "provider": "PASSWORD", "createdAt": "...", "lastUsedAt": "..." },
        { "provider": "GOOGLE", "createdAt": "...", "lastUsedAt": "..." }
      ]
    }
  }
  ```

#### `POST /auth/password/set`
Adds password login for users who originally registered via Google OAuth.
- **Body**: `{ "password": "StrongPassword123!" }`

#### `POST /auth/password/change`
Changes existing password and terminates other sessions.
- **Body**: `{ "currentPassword": "...", "newPassword": "..." }`

#### `POST /auth/accounts/google/link`
Links a Google account to the logged-in profile.
- **Body**: `{ "idToken": "google-id-token" }`

#### `DELETE /auth/accounts/:provider`
Removes an authentication provider (`PASSWORD` or `GOOGLE`).
- **Param**: `:provider` (`PASSWORD` or `GOOGLE`)
- **Safety**: Fails with `400 Bad Request` if it is the user's only sign-in method.

#### `POST /auth/logout`
Logs out from the current device.

#### `POST /auth/logout-all` (or `POST /auth/sessions/revoke-all`)
Revokes all active sessions across all devices.

#### `GET /auth/sessions`
Lists all active device sessions for the user.

#### `DELETE /auth/sessions/:sessionId`
Revokes a specific session.

---

## 7. Security Threat Mitigations

| Threat | Mitigation |
| :--- | :--- |
| **Account Pre-Hijacking** | Verified-email auto-linking only. Unverified accounts require verification or explicit re-authentication. |
| **Forged Google Claims** | Server verifies Google JWKS signature, audience, and expiration using `google-auth-library`. |
| **Cross-Account ID Collision** | Unique database constraint `UNIQUE(provider, providerAccountId)`. |
| **Brute Force / Credential Stuffing** | Argon2id slow hashing + IP & email rate limiting. |
| **XSS Token Theft** | Refresh tokens stored exclusively in `HttpOnly` cookies. |
| **Token Replay / Fixation** | Refresh token rotation on every call; reuse detection invalidates session family. |
| **Lockout via Unlinking** | Hard check: `effectiveAccounts.length > 1` before allowing method deletion. |
