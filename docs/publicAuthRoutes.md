# Public Authentication Routes (`publicAuthRoutes`) - Architecture & Implementation Guide

> **Target Audience**: Backend Engineers, Tech Leads, and Security Reviewers  
> **Module Path**: [`src/modules/auth/`](file:///e:/e-com/server/src/modules/auth/)  
> **Route Registration**: [`src/modules/auth/auth.route.ts`](file:///e:/e-com/server/src/modules/auth/auth.route.ts)  
> **Controller**: [`src/modules/auth/auth.controller.ts`](file:///e:/e-com/server/src/modules/auth/auth.controller.ts)  
> **Services**: [`authRegistration.service.ts`](file:///e:/e-com/server/src/modules/auth/authRegistration.service.ts), [`authSession.service.ts`](file:///e:/e-com/server/src/modules/auth/authSession.service.ts), [`googleAuth.service.ts`](file:///e:/e-com/server/src/modules/auth/googleAuth.service.ts)

---

## 1. Architectural Overview

Public auth routes do **not** use the access-token JWT guard (`app.authenticate`). Instead, they serve as the gateway for public traffic to sign up, verify credentials, reset passwords, and negotiate sessions.

```
                    ┌─────────────────────────┐
                    │    HTTP Client (App)    │
                    └────────────┬────────────┘
                                 │
                   [Fastify Ajv Request Validation]
                                 │
                   [Zod Schema Controller Validation]
                                 │
             ┌───────────────────┴───────────────────┐
             ▼                                       ▼
 ┌──────────────────────┐                ┌──────────────────────┐
 │AuthRegistrationService│               │  AuthSessionService  │
 └──────────┬───────────┘                └──────────┬───────────┘
            │                                       │
     ┌──────┴──────┐                         ┌──────┴──────┐
     ▼             ▼                         ▼             ▼
  [Postgres]    [Redis]                   [Postgres]    [Cookies]
(User/Outbox)  (OTP TTL)                (UserSession) (HttpOnly)
```

### Layered Defense & Guarantees
1. **HTTP Border Validation**: Fastify Ajv schema (`authenticationSchemas`) rejects malformed bodies before reaching controllers.
2. **Controller Validation**: Strict Zod parsing ensures runtime type safety and sanitized payloads.
3. **Service Layer Invariants**: Business logic enforces uniqueness, credential hashing (Argon2id), session management, and TTL eviction.
4. **Outbox Pattern**: Critical emails (OTP, password alerts) are queued in `OutboxEvent` table transactionally, preventing HTTP request blocking and lost emails during external provider downtime.

---

## 2. Route-by-Route Specifications & Edge Cases

---

### Route 1: `POST /api/v1/auth/register`

* **Purpose**: Registers a new customer account or handles re-registration for unverified accounts.
* **Payload**: `{ firstName: string, lastName: string, email: string, password: string }`
* **Status Code**: `201 Created`
* **Success Data**: `{ user: { id, firstName, lastName, email, createdAt, updatedAt }, tempOtp?: string }`

#### Implementation Flow
1. Validate inputs (names trimmed, valid email format, password min 5 / max 12 chars).
2. Hash password with **Argon2id**.
3. Lookup user by email:
   - **Case A (Verified User Exists)**: `existingUser.emailVerified === true`  
     -> **Reject immediately**: `throw new AppError("Email already registered", 400)`.
   - **Case B (Unverified User Exists)**: `existingUser.emailVerified === false`  
     -> User previously abandoned signup or lost their OTP. **Update** their `firstName`, `lastName`, and `passwordHash` in Postgres, issue a **fresh OTP**, and stage a new outbox event.
   - **Case C (Brand New User)**:  
     -> Create user record in Postgres with default `CUSTOMER` role, issue a fresh OTP, and stage outbox event.
4. Set OTP in Redis (`USER_OTP(email)`) with `EX: 300` (5-minute TTL).
5. Stage `USER_REGISTERED` outbox event for background email dispatch.
6. Return `201 Created` with sanitized user object.

#### Edge Cases & Senior Developer Instructions
* **Email Enumeration Mitigation**: For already verified emails, return a clear 400 error. For security-hardened environments requiring zero enumeration, return a 200/201 with generic messaging, but in typical e-commerce UX, prompt users to log in or reset password.
* **Database Race Conditions**: In high-concurrency environments (e.g. user double-clicks submit), Postgres unique constraint (`User_email_key`) can throw error code `P2002`. Ensure this is caught or wrapped in `AppError`.
* **Credential Updates for Unverified Users**: If a user previously typed a wrong password during their first attempt, updating `passwordHash` on re-registration ensures they can log in seamlessly after verifying the new OTP.

---

### Route 2: `POST /api/v1/auth/verify-otp`

* **Purpose**: Verifies new account email activation OTP.
* **Payload**: `{ email: string, otp: string }` (4 digits)
* **Status Code**: `200 OK`
* **Success Data**: `{ verified: true }`

#### Implementation Flow
1. Fetch OTP from Redis key `Keys.USER_OTP(email)`.
2. If absent or does not match payload: `throw new AppError("OTP is invalid or expired", 400)`.
3. Update database: `prisma.user.update({ where: { email }, data: { emailVerified: true } })`.
4. Delete Redis key: `redis.del(Keys.USER_OTP(email))`.
5. Return `{ verified: true }`.

#### Edge Cases & Senior Developer Instructions
* **Atomic Deletion (Replay Prevention)**: Redis key **must be deleted** immediately after successful verification so the 4-digit code cannot be re-used.
* **Brute-Force Protection**: 4-digit numeric OTPs have only 10,000 possibilities. Implement a rate-limiter or failed-attempt counter in Redis (e.g. maximum 5 failed attempts before key is invalidated or locked for 15 minutes).
* **Idempotency**: If the user's email is already verified and the Redis key has expired, returning 400 `"OTP is invalid or expired"` is expected, prompting them to log in.

---

### Route 3: `POST /api/v1/auth/resend-otp`

* **Purpose**: Generates and sends a new registration activation OTP.
* **Payload**: `{ email: string }`
* **Status Code**: `200 OK`
* **Success Data**: `{ tempOtp?: string }` (in dev) or `{}`

#### Implementation Flow
1. Find user by email:
   - If user does not exist: `throw new AppError("No account found with this email", 404)`.
   - If `user.emailVerified === true`: `throw new AppError("Email is already verified. Please log in.", 400)`.
2. Generate fresh 4-digit OTP.
3. Save to Redis `Keys.USER_OTP(email)` with 5-minute TTL (overwriting any previous OTP).
4. Stage `USER_OTP_REQUESTED` outbox event.
5. Return `sendOk({ message: "A new verification code has been sent to your email", data: { tempOtp } })`.

#### Edge Cases & Senior Developer Instructions
* **Email Bombing / Spamming**: Attackers could spam this endpoint to flood a victim's inbox or deplete mail quota. Enforce a minimum 60-second cooldown per email in Redis (`resend_cooldown:<email>`).
* **Clear User Feedback**: Rejecting non-existent emails with 404 and already-verified emails with 400 prevents confusing client states where users wait for emails that will never arrive.

---

### Route 4: `POST /api/v1/auth/forgot-password`

* **Purpose**: Initiates password recovery by sending a 4-digit reset code.
* **Payload**: `{ email: string }`
* **Status Code**: `200 OK`
* **Success Data**: `{ tempOtp?: string }` (in dev) or `{}`

#### Implementation Flow
1. Look up user by email.
2. If user does not exist: `throw new AppError("No account found with this email", 404)`.
3. Generate fresh 4-digit OTP.
4. Save to Redis key `Keys.PASSWORD_RESET_OTP(email)` with 5-minute TTL.
5. Stage `USER_OTP_REQUESTED` outbox event.
6. Return `sendOk({ message: "Password reset code sent successfully", data: { tempOtp } })`.

#### Edge Cases & Senior Developer Instructions
* **Redis Key Isolation**: **Never** mix `USER_OTP` (account activation) and `PASSWORD_RESET_OTP` (password recovery). They have distinct security implications. An activation OTP must never allow resetting a password.
* **Account Existence Validation**: Explicitly validates that the email exists in the database and throws 404 if absent so clients can alert the user immediately instead of creating false expectations.
* **OAuth-Only Accounts**: If a user signed up via Google (`passwordHash` is empty or generated random hash), password reset still allows them to set a direct password, linking local credentials to their email.

---

### Route 5: `POST /api/v1/auth/verify-reset-otp`

* **Purpose**: Validates the password reset OTP in multi-step UI wizards before prompting the user for their new password.
* **Payload**: `{ email: string, otp: string }`
* **Status Code**: `200 OK`
* **Success Data**: `{ verified: true }`

#### Implementation Flow
1. Verify OTP against `Keys.PASSWORD_RESET_OTP(email)`.
2. If invalid or expired, `throw new AppError("OTP is invalid or expired", 400)`.
3. **DO NOT delete the Redis key**.
4. Return `{ verified: true }`.

#### Edge Cases & Senior Developer Instructions
* **Non-Destructive Read**: Crucial requirement. If the key is deleted here, Step 2 (`POST /reset-password`) will fail with `"OTP is invalid or expired"`.
* **Expiration Race Window**: If the user stays on the "Enter New Password" screen until the 5-minute TTL expires, `POST /reset-password` will reject. UI clients must handle this gracefully by prompting for a new OTP if expired.

---

### Route 6: `POST /api/v1/auth/reset-password`

* **Purpose**: Finalizes password reset with verified OTP and updates credentials.
* **Payload**: `{ email: string, otp: string, password: string }`
* **Status Code**: `200 OK`
* **Success Data**: `{ reset: true }`

#### Implementation Flow
1. Validate OTP against `Keys.PASSWORD_RESET_OTP(email)`.
2. Hash new password with Argon2id.
3. Fetch user by email. If missing: `throw new AppError("Unable to reset password", 400)`.
4. Update `passwordHash` in database.
5. **Revoke all active sessions**:
   ```typescript
   await prisma.userSession.deleteMany({ where: { userId: user.id } });
   ```
6. **Delete Redis key**: `await redis.del(Keys.PASSWORD_RESET_OTP(email))`.
7. Dispatch security alert (`ACCOUNT_PASSWORD_CHANGED`) via push/email.
8. Return `{ reset: true }`.

#### Edge Cases & Senior Developer Instructions
* **Global Session Revocation**: When credentials change, all existing JWT refresh sessions and active cookies on every device must be deleted immediately.
* **Atomic Cleanup**: Ensure `redis.del` executes so the same OTP cannot be reused.
* **Notification Error Isolation**: Email/push delivery failure must not abort the transaction or roll back the successful password reset; catch errors with logging.

---

### Route 7: `POST /api/v1/auth/login`

* **Purpose**: Authenticates credentials, creates a tracking session, and issues JWT tokens.
* **Payload**: `{ email: string, password: string, deviceName?: string, deviceId?: string }`
* **Status Code**: `200 OK`
* **Headers**: Sets `Set-Cookie` for `accessToken` and `refreshToken` (HttpOnly, Secure, SameSite).
* **Success Data**: `{ user: { id, name, firstName, lastName, email, phone }, accessToken, refreshToken }`

#### Implementation Flow
1. Find user by email.
2. Verify password with Argon2. If mismatch or user missing: `throw new AppError("Invalid email or password", 401)`.
3. Verify account state:
   - `!user.emailVerified` -> `throw new AppError("Please verify your email before logging in", 403)`.
   - `user.status !== "ACTIVE"` -> `throw new AppError("Account is <status>", 403)`.
4. Create `UserSession` record in Postgres with hashed refresh token, device metadata, and IP address.
5. Generate signed JWT `accessToken` (short-lived, e.g. 15m) and `refreshToken` (long-lived, e.g. 7d).
6. Set secure HTTP-only cookies on Fastify reply.
7. Return user details and token strings.

#### Edge Cases & Senior Developer Instructions
* **Constant-Time Verification**: Argon2 verification prevents timing attacks. Avoid returning distinct messages for "user not found" vs "incorrect password".
* **Cookie vs Header Flexibility**: Support both Web (HttpOnly cookies) and Mobile (JSON payload tokens) simultaneously.
* **Inactive / Suspended Users**: Block suspended or deactivated accounts from acquiring fresh sessions immediately.

---

### Route 8: `POST /api/v1/auth/google`

* **Purpose**: Google OAuth2 authentication (Sign in with Google).
* **Payload**: `{ idToken: string, deviceName?: string, deviceId?: string }`
* **Status Code**: `200 OK`
* **Success Data**: Same structure as `POST /login`.

#### Implementation Flow
1. Verify Google ID Token via Google Auth Library:
   ```typescript
   const payload = await verifyGoogleIdToken(idToken);
   ```
2. Validate payload (`email_verified === true`, audience matches client ID).
3. Find or Create user:
   - If user exists by email: connect Google account, ensure `emailVerified: true`.
   - If brand new user: create account with `CUSTOMER` role, `emailVerified: true`, and Google avatar URL.
4. Check user status (`ACTIVE`).
5. Issue `UserSession` and JWT tokens, set cookies, and return response.

#### Edge Cases & Senior Developer Instructions
* **Email Verified Check**: Only accept Google profiles where `payload.email_verified === true`. Reject unverified third-party emails to prevent account takeover.
* **Account Linking**: If a user previously registered with email/password and now clicks "Sign in with Google", cleanly link the session without duplicate key violations.

---

### Route 9: `POST /api/v1/auth/refresh`

* **Purpose**: Token rotation. Exchanges a valid refresh token for a fresh token pair.
* **Payload**: Optional `{ refreshToken?: string }` (falls back to `request.cookies.refreshToken`).
* **Status Code**: `200 OK`
* **Success Data**: `{ accessToken, refreshToken }`

#### Implementation Flow
1. Extract refresh token from cookie or body. If missing: `throw new AppError("Refresh token missing", 401)`.
2. Verify token signature and expiration (`verifyRefreshToken`).
3. Hash the provided refresh token and locate the session in `UserSession`:
   ```typescript
   const session = await prisma.userSession.findFirst({
       where: { id: sessionId, refreshTokenHash },
   });
   ```
4. If session not found: **Potential token reuse / breach detected!** Invalidate all sessions for `userId` if warranted, or reject 401.
5. Invalidate old session / update session with new refresh token hash.
6. Issue new `accessToken` and `refreshToken` (Token Rotation).
7. Update cookies and return new tokens.

#### Edge Cases & Senior Developer Instructions
* **Refresh Token Rotation (RTR)**: Every refresh request **must issue a new refresh token** and invalidate the previous one.
* **Race Conditions on Concurrent Requests**: If a client fires two API requests simultaneously with expired access tokens, both might attempt to use the same refresh token. Implement a short grace period (e.g. 10-15 seconds in Redis) or client-side request deduplication/mutex.

---

## 3. Security Checklist for Production

| Requirement | Implementation Detail | Status |
| :--- | :--- | :--- |
| **Password Hashing** | Argon2id (`argon2.hash(password)`) | Verified |
| **Brute Force Protection** | Fastify rate limiter on `/login`, `/register`, `/verify-otp` | Required |
| **Session Tracking** | Unique `sessionId` recorded in Postgres `UserSession` | Verified |
| **Token Invalidation** | Password change purges all sessions via `userSession.deleteMany` | Verified |
| **Cookie Security** | `httpOnly: true`, `secure: true` (prod), `sameSite: "lax"/"strict"` | Verified |
| **Replay Prevention** | OTP deletion on `/verify-otp` & `/reset-password` | Verified |
| **Email Bombing Protection** | 60s cooldown key in Redis for `/resend-otp` | Recommended |
| **Transactional Reliability** | Outbox pattern (`OutboxEvent`) for asynchronous mail delivery | Verified |

---

## 4. Maintenance & Testing Reference

When modifying public auth routes, run the automated test suite to ensure zero regressions:

```bash
# Typecheck
npm run typecheck

# Run auth unit & integration tests
npx vitest run src/__tests__/auth.test.ts src/__tests__/auth.validation.test.ts src/__tests__/routes.integration.test.ts

# Run entire test suite
npx vitest run
```
