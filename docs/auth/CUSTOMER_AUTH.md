# Customer Mobile Authentication Guide (`CUSTOMER_AUTH.md`)
### React Native (Expo & Bare Workflow) Integration Reference

> **API Base URL**: `<API_HOST>/api/v1/auth` (e.g. `https://api.yourdomain.com/api/v1/auth`)  
> **Server Implementation**: [`src/modules/auth/auth.route.ts`](file:///e:/e-com/server/src/modules/auth/auth.route.ts)  
> **Main Auth Architecture**: [`AUTH.md`](file:///e:/e-com/server/src/modules/auth/AUTH.md)  
> **Target Audience**: React Native / Expo Mobile App Developers (`meeo` customer app).

---

## Table of Contents

1. [Web vs. React Native Mobile Auth Architecture](#1-web-vs-react-native-mobile-auth-architecture)
2. [Secure Local Token Storage](#2-secure-local-token-storage)
3. [Authentication Flows & Endpoints](#3-authentication-flows--endpoints)
   - [3.1 Registration (Email + Password)](#31-registration-email--password)
   - [3.2 Email OTP Verification](#32-email-otp-verification)
   - [3.3 Resend OTP](#33-resend-otp)
   - [3.4 Customer Login](#34-customer-login)
   - [3.5 Google Sign-In (Native OAuth)](#35-google-sign-in-native-oauth)
   - [3.6 Forgot & Reset Password Flow](#36-forgot--reset-password-flow)
   - [3.7 Fetch Current User Profile (`/me`)](#37-fetch-current-user-profile-me)
   - [3.8 Token Refresh (Silent Rotation)](#38-token-refresh-silent-rotation)
   - [3.9 Logout & Session Revocation](#39-logout--session-revocation)
   - [3.10 Account Security & Multi-Provider Linking](#310-account-security--multi-provider-linking)
4. [Production-Ready Axios Client with Silent Auto-Refresh](#4-production-ready-axios-client-with-silent-auto-refresh)
5. [Google Sign-In Implementation in React Native](#5-google-sign-in-implementation-in-react-native)
6. [API Error Handling & Response Standards](#6-api-error-handling--response-standards)

---

## 1. Web vs. React Native Mobile Auth Architecture

| Attribute | Web (Next.js / Browser) | Mobile (React Native / Expo) |
| :--- | :--- | :--- |
| **Token Delivery** | `HttpOnly`, `SameSite=Lax` Cookies | JSON Response payload (`data.accessToken`, `data.refreshToken`) |
| **Client Storage** | Secure browser cookies | `expo-secure-store` or `react-native-keychain` (Encrypted Keystore/Keychain) |
| **Request Authorization** | Automatic Cookie header via `credentials: 'include'` | HTTP Header: `Authorization: Bearer <accessToken>` |
| **Token Refresh** | Cookie automatically sent on `/refresh` | Request Body `{ refreshToken: "<token>" }` or Header `x-refresh-token: <token>` |
| **Google Sign-In** | Browser redirect / Google One Tap popup | Native SDK (`@react-native-google-signin/google-signin`), returns `idToken` |

> ⚠️ **CRITICAL RULE FOR MOBILE**:  
> Never store `accessToken` or `refreshToken` in unencrypted storage like `@react-native-async-storage/async-storage`. Always use hardware-backed encrypted storage.

---

## 2. Secure Local Token Storage

Create a dedicated storage helper (e.g. `src/utils/authStorage.ts`):

```typescript
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'meeo_access_token';
const REFRESH_TOKEN_KEY = 'meeo_refresh_token';
const USER_KEY = 'meeo_user_profile';

export const authStorage = {
  async getTokens() {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);
    return { accessToken, refreshToken };
  },

  async setTokens(accessToken: string, refreshToken: string) {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);
  },

  async clearTokens() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
  },

  async saveUser(user: any) {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },

  async getUser() {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
};
```

---

## 3. Authentication Flows & Endpoints

### 3.1 Registration (Email + Password)
Registers a new customer. Upon success, an email containing a 4-digit verification code is queued and sent.

- **Method**: `POST`
- **Path**: `/api/v1/auth/register`
- **Request Body**:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "customer@example.com",
  "password": "Password123"
}
```

- **Validation Rules**:
  - `firstName`: string, min 1 character.
  - `lastName`: string, min 1 character.
  - `email`: valid email string, normalized to lowercase.
  - `password`: min 5, max 100 characters.

- **Response (`201 Created`)**:
```json
{
  "status": "success",
  "message": "User registered successfully",
  "data": {
    "id": "c6a7...-uuid",
    "email": "customer@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "emailVerified": false
  }
}
```
👉 **Mobile Action**: Navigate customer to the **OTP Verification Screen**, passing the `email` as a route parameter.

---

### 3.2 Email OTP Verification
Verifies the 4-digit code sent during registration.

- **Method**: `POST`
- **Path**: `/api/v1/auth/verify-otp`
- **Request Body**:
```json
{
  "email": "customer@example.com",
  "otp": "4821"
}
```

- **Response (`200 OK`)**:
```json
{
  "status": "success",
  "message": "Email verified successfully",
  "data": {
    "email": "customer@example.com",
    "verified": true
  }
}
```
👉 **Mobile Action**: Show a success message and direct the customer to the **Login Screen**.

---

### 3.3 Resend OTP
Resends a new 4-digit verification code with a cool-down period.

- **Method**: `POST`
- **Path**: `/api/v1/auth/resend-otp`
- **Request Body**:
```json
{
  "email": "customer@example.com"
}
```

- **Response (`200 OK`)**:
```json
{
  "status": "success",
  "message": "A new verification code has been sent to your email"
}
```

---

### 3.4 Customer Login
Authenticates customer with email and password, creates an active database session (`user_sessions`), and issues JWTs.

- **Method**: `POST`
- **Path**: `/api/v1/auth/login`
- **Request Body**:
```json
{
  "email": "customer@example.com",
  "password": "Password123",
  "deviceName": "iPhone 15 Pro",
  "deviceId": "unique-device-hardware-uuid"
}
```
*(Note: `deviceName` and `deviceId` are optional, but recommended for mobile session tracking)*

- **Response (`200 OK`)**:
```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "user": {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "name": "John Doe",
      "firstName": "John",
      "lastName": "Doe",
      "email": "customer@example.com",
      "phone": null
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

👉 **Mobile Action**:
1. Store `accessToken` and `refreshToken` in `authStorage`.
2. Store `user` object in your local auth state (e.g., Zustand, Redux, or React Context).
3. Set default headers for subsequent API calls.
4. Navigate user to the Home / Main app screen.

---

### 3.5 Google Sign-In (Native OAuth)
Handles customer sign-in via native Google Play Services (Android) or Google SDK (iOS).

- **Method**: `POST`
- **Path**: `/api/v1/auth/google`
- **Request Body**:
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
  "deviceName": "Samsung Galaxy S24",
  "deviceId": "android-device-id"
}
```

- **Server-Side Behavior**:
  1. Verifies `idToken` cryptographically with Google's public JWKS certificates.
  2. If user exists with matching verified email:
     - Automatically links Google OAuth to the existing user profile (`auth_accounts`).
     - Marks `emailVerified: true`.
  3. If user does not exist:
     - Creates new `User` record with Google profile data (`firstName`, `lastName`, `avatarUrl`).
     - Creates `AuthAccount` with `provider: "GOOGLE"`.
  4. Generates session & returns tokens.

- **Response (`200 OK`)**:
```json
{
  "status": "success",
  "message": "Google authentication successful",
  "data": {
    "user": {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "name": "John Doe",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@gmail.com",
      "phone": null
    },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

---

### 3.6 Forgot & Reset Password Flow

The password reset flow consists of 3 potential steps:

```
[Customer enters email]
       │
       ▼
POST /auth/forgot-password  ─────────► Server sends 4-digit reset OTP to email
       │
       ▼
[Customer enters 4-digit OTP]
       │
       ▼ (Optional Pre-Check)
POST /auth/verify-reset-otp ─────────► Validates OTP before user fills new password
       │
       ▼
[Customer enters new password]
       │
       ▼
POST /auth/reset-password   ─────────► Validates OTP & updates Argon2id password hash
```

#### Step 1: Request Password Reset OTP
- **Path**: `POST /api/v1/auth/forgot-password`
- **Payload**:
```json
{
  "email": "customer@example.com"
}
```
- **Response**: `200 OK` (`"Password reset code sent successfully"`)

#### Step 2: (Optional Pre-validation) Verify Reset OTP
Used when you want to validate the code before letting the user type a new password:
- **Path**: `POST /api/v1/auth/verify-reset-otp`
- **Payload**:
```json
{
  "email": "customer@example.com",
  "otp": "8392"
}
```
- **Response**: `200 OK` (`"Reset code verified successfully"`)

#### Step 3: Complete Password Reset
- **Path**: `POST /api/v1/auth/reset-password`
- **Payload**:
```json
{
  "email": "customer@example.com",
  "otp": "8392",
  "password": "NewSecurePassword123"
}
```
- **Response**: `200 OK` (`"Password reset successfully"`)  
👉 **Mobile Action**: Navigate to Login screen.

---

### 3.7 Fetch Current User Profile (`/me`)
Retrieves the logged-in user profile, role, verification status, and active session id.

- **Method**: `GET`
- **Path**: `/api/v1/auth/me`
- **Headers**:
  ```http
  Authorization: Bearer <accessToken>
  ```
- **Response (`200 OK`)**:
```json
{
  "status": "success",
  "message": "Current user fetched successfully",
  "data": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "email": "customer@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "avatarUrl": null,
    "phone": null,
    "emailVerified": true,
    "status": "ACTIVE",
    "lastLoginAt": "2026-10-05T07:15:00.000Z",
    "activeSessionId": "sess-uuid"
  }
}
```

---

### 3.8 Token Refresh (Silent Rotation)
When an `accessToken` expires (15 minutes lifespan), use the rotating `refreshToken` (7 days lifespan) to issue a new pair without logging the user out.

- **Method**: `POST`
- **Path**: `/api/v1/auth/refresh`
- **Request Body (Mobile Preferred)**:
```json
{
  "refreshToken": "<current_refresh_token>"
}
```
*(Alternatively, pass `x-refresh-token: <current_refresh_token>` header)*

- **Response (`200 OK`)**:
```json
{
  "status": "success",
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "<new_access_token>",
    "refreshToken": "<new_rotating_refresh_token>"
  }
}
```

> ⚠️ **IMPORTANT (Token Reuse Detection)**:  
> Each refresh token is strictly single-use. When refreshed, the server rotates it and invalidates the previous token hash. If an already-used refresh token is presented, the server revokes the entire session for security. The mobile client **MUST** save the new `refreshToken` returned in `data.refreshToken`.

---

### 3.9 Logout & Session Revocation

#### Single Device Logout (Current Device)
- **Method**: `POST`
- **Path**: `/api/v1/auth/logout`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**: `200 OK`
- **Mobile Action**: Call `authStorage.clearTokens()` and reset app state to unauthenticated.

#### Logout From All Devices
- **Method**: `POST`
- **Path**: `/api/v1/auth/logout-all`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**: `200 OK`

#### Manage Active Sessions List
- **Get Active Sessions**: `GET /api/v1/auth/sessions`
- **Revoke Specific Device Session**: `DELETE /api/v1/auth/sessions/:sessionId`

---

### 3.10 Account Security & Multi-Provider Linking

For the "Account Security" screen in customer mobile app:

#### List Connected Sign-In Methods
- **Method**: `GET`
- **Path**: `/api/v1/auth/accounts`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Response**:
```json
{
  "status": "success",
  "data": [
    { "provider": "PASSWORD", "linkedAt": "2026-10-01T10:00:00.000Z" },
    { "provider": "GOOGLE", "linkedAt": "2026-10-05T08:30:00.000Z" }
  ]
}
```

#### Change Password (For Password Users)
- **Method**: `POST`
- **Path**: `/api/v1/auth/password/change`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Body**: `{ "currentPassword": "OldPass123", "newPassword": "NewPass456" }`

#### Set Initial Password (For Google-only Users)
If the customer originally signed in with Google, they have no password set. They can create one:
- **Method**: `POST`
- **Path**: `/api/v1/auth/password/set`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Body**: `{ "password": "NewSecurePassword123" }`

#### Link Google to Existing Account
- **Method**: `POST`
- **Path**: `/api/v1/auth/accounts/google/link`
- **Headers**: `Authorization: Bearer <accessToken>`
- **Body**: `{ "idToken": "<google_id_token>" }`

#### Unlink Provider
- **Method**: `DELETE`
- **Path**: `/api/v1/auth/accounts/:provider` (`:provider` is `PASSWORD` or `GOOGLE`)
- **Headers**: `Authorization: Bearer <accessToken>`
*(Note: Server rejects unlinking if it is the user's only login method to prevent account lockout).*

---

## 4. Production-Ready Axios Client with Silent Auto-Refresh

Here is a ready-to-use Axios configuration (`src/apis/apiClient.ts`) for your React Native application. It automatically:
1. Attaches `Authorization: Bearer <token>` to all protected calls.
2. Intercepts `401 Unauthorized`.
3. Calls `/auth/refresh` once, queuing concurrent failing requests.
4. Updates tokens in `SecureStore` and retries failed calls.
5. Clears tokens and redirects to Login if the session is invalid.

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { authStorage } from '../utils/authStorage';

// Replace with your server URL
const BASE_URL = 'https://api.yourdomain.com/api/v1';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Mutex / Queue state for token refreshing
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// 1. Request Interceptor: Attach Access Token
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const { accessToken } = await authStorage.getTokens();
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

// 2. Response Interceptor: Handle 401 & Silent Refresh
apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // If error is not 401 or request was already retried, throw
    if (error.response?.status !== 401 || originalRequest?._retry) {
      return Promise.reject(error);
    }

    // Do not attempt refresh on auth endpoints themselves
    if (
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest.url?.includes('/auth/register')
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // If refresh is already in progress, wait in queue
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then(token => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        })
        .catch(err => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { refreshToken } = await authStorage.getTokens();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      // Call refresh endpoint
      const refreshResponse = await axios.post(`${BASE_URL}/auth/refresh`, {
        refreshToken,
      });

      const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
        refreshResponse.data.data;

      // Save new rotated tokens
      await authStorage.setTokens(newAccessToken, newRefreshToken);

      // Notify queued requests
      processQueue(null, newAccessToken);

      // Retry original request
      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      }
      return apiClient(originalRequest);
    } catch (refreshErr) {
      processQueue(refreshErr as AxiosError, null);
      await authStorage.clearTokens();
      
      // Dispatch global logout event / navigation redirect
      // e.g. EventEmitter.emit('FORCE_LOGOUT');
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);
```

---

## 5. Google Sign-In Implementation in React Native

Using [`@react-native-google-signin/google-signin`](https://github.com/react-native-google-signin/google-signin):

```bash
npm install @react-native-google-signin/google-signin
```

### Configuration (App Launch)
```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: 'YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com', // MUST be the Web Client ID
  offlineAccess: false,
});
```

### Sign-In Handler
```typescript
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { apiClient } from '../apis/apiClient';
import { authStorage } from '../utils/authStorage';
import * as Device from 'expo-device';

export const handleGoogleSignIn = async () => {
  try {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    
    // Obtain Google idToken
    const idToken = userInfo.data?.idToken;
    if (!idToken) {
      throw new Error('Failed to obtain Google ID Token');
    }

    // Send idToken to your Node.js API
    const response = await apiClient.post('/auth/google', {
      idToken,
      deviceName: Device.modelName || 'Mobile Device',
      deviceId: Device.osBuildId || undefined,
    });

    const { user, accessToken, refreshToken } = response.data.data;

    // Persist session
    await authStorage.setTokens(accessToken, refreshToken);
    await authStorage.saveUser(user);

    return user;
  } catch (error: any) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) {
      console.log('User cancelled Google sign in');
    } else if (error.code === statusCodes.IN_PROGRESS) {
      console.log('Sign in already in progress');
    } else {
      console.error('Google Sign In Error:', error);
      throw error;
    }
  }
};
```

---

## 6. API Error Handling & Response Standards

All endpoints adhere to the following unified JSON response schema:

### Success Response (`200 OK`, `201 Created`)
```json
{
  "status": "success",
  "message": "Operation description",
  "data": { ... }
}
```

### Error Response (`400`, `401`, `403`, `404`, `429`, `500`)
```json
{
  "status": "fail", // or "error"
  "message": "Human-readable error explanation",
  "code": "ERROR_CODE",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email address"
    }
  ]
}
```

### Handling Specific Status Codes in React Native:
- **`400 Bad Request`**: Show inline form validation errors matching `errors[i].field`.
- **`401 Unauthorized`**: Bad credentials or invalid session. Display error banner or trigger re-login.
- **`403 Forbidden`**:
  - If message mentions *"verify your email"*: Navigate user to OTP Verification screen.
  - If message mentions *"Account is suspended/blocked"*: Show contact support screen.
- **`429 Too Many Requests`**: Rate limited (e.g. OTP spam, login brute-force). Prompt user to wait 60 seconds.
