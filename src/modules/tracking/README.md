# User Behaviour Tracking & User 360 System

A production-ready, high-throughput user behaviour telemetry, session stitching, and customer 360 analytics engine built for Node.js, Fastify, PostgreSQL, and Prisma.

---

## 1. Architecture & Flow

```
[Web / Mobile Client]
         │
         ├── (Anonymous)  ──> Client-Side Ring Buffer (localStorage / IndexedDB) [0 Server Calls]
         │
         └── (On Login)   ──> POST /api/v1/tracking/identify (Stitch buffer to verified user)
         │
         └── (Auth User)  ──> POST /api/v1/tracking/events (Batched ingestion)
                                      │
                                      ▼
                             [user_events Table]
                                      │
                       ┌──────────────┴──────────────┐
                       ▼                             ▼
             [Background Batch Worker]      [Nightly Retention Cron]
          (Every 10s via node-cron)          (Daily 02:00 AM)
                       │                             │
       ┌───────────────┴───────────────┐             ▼
       ▼                               ▼      Purge raw events
[user_behavior_summary]        [user_interests]   older than 60-90 days
(Counters & Timestamps)     (Scored entity weights)
```

---

## 2. API Endpoints

### 1. Ingest Batched Events
* **Route**: `POST /api/v1/tracking/events`
* **Auth**: Optional (`optionalAuthenticate`). If JWT present, attributes to verified `userId`; otherwise stores as anonymous session.
* **Payload**:
  ```json
  {
    "events": [
      {
        "clientEventId": "evt_abc_123",
        "sessionId": "anon_session_xyz",
        "event": "PRODUCT_VIEWED",
        "entityType": "PRODUCT",
        "entityId": "prod-headphones-xm5",
        "metadata": { "category": "audio", "price": 2999 },
        "createdAt": "2026-10-03T11:15:00.000Z"
      }
    ]
  }
  ```
* **Response**: `202 Accepted` `{ "success": true, "ingestedCount": 1 }`

---

### 2. Stitch Anonymous Session Buffer on Login
* **Route**: `POST /api/v1/tracking/identify`
* **Auth**: Strictly required (`app.authenticate`).
* **Security**: `userId` is extracted **exclusively from the verified JWT**. Client input for `userId` is never accepted.
* **Payload**:
  ```json
  {
    "sessionId": "anon_session_xyz",
    "events": [ /* Client buffered events from IndexedDB */ ]
  }
  ```
* **Response**: `200 OK` `{ "success": true, "stitchedEvents": 4, "ingestedBufferedEvents": 3 }`

---

### 3. User 360 Profile (Pre-Aggregated)
* **Route**: `GET /api/v1/track-user/:userId/360`
* **Auth**: Strictly required (`app.authenticate`).
* **Security & Permissions**:
  * Users can view their **own** 360 profile (`OWN` scope).
  * Staff require `user_360:view`.
  * Field-level redaction:
    * `user_commerce:view` required to see `commerce` and order metrics.
    * `user_behavior:view` required to see `behavior` counters.
    * `user_insights:view` required to see `insights` (funnel rates & interests).
  * Staff access automatically records a non-blocking entry in `audit_logs` (`USER_360_VIEWED`).
* **Response**:
  ```json
  {
    "success": true,
    "data": {
      "profile": { "id": "uuid", "email": "user@example.com", "firstName": "John" },
      "commerce": {
        "totalSpend": 12450.00,
        "totalOrders": 8,
        "completedOrders": 7,
        "averageOrderValue": 1778.57,
        "firstOrderAt": "2026-01-18T10:14:00.000Z",
        "lastOrderAt": "2026-09-28T14:45:00.000Z"
      },
      "behavior": {
        "productViews": 142,
        "cartAdds": 19,
        "checkoutStarted": 9,
        "paymentSuccess": 7
      },
      "insights": {
        "funnel": {
          "viewToCartPercent": 13.38,
          "cartToCheckoutPercent": 47.36,
          "checkoutToPurchasePercent": 77.77,
          "cartAbandonmentPercent": 52.64
        },
        "topInterests": [
          { "type": "CATEGORY", "entityId": "audio", "score": 45.0 }
        ]
      },
      "recentOrders": [ ... ],
      "recentActivity": [ ... ]
    }
  }
  ```

---

### 4. Paginated User Activity Log
* **Route**: `GET /api/v1/track-user/:userId/360/activity?cursor=...&limit=20`
* **Auth**: Strictly required (`user_activity:view` or `user_360:view` or self).
* **Response**: Cursor-paginated raw events for deep audit trails.

---

## 3. Troubleshooting & Problem Identification Guide

Agar system me koi problem aaye, toh use turant diagnose karne ke steps:

### Problem 1: Events user_events me aa rahe hain lekin user_behavior_summary update nahi ho raha
* **Cause**: Background aggregation worker stop ho gaya hai ya watermark stuck hai.
* **Diagnosis**:
  1. Check worker logs in terminal / Loki:
     ```
     [Cron: User Behaviour] Processed ...
     ```
  2. Check Redis watermark key:
     ```bash
     redis-cli GET "tracking:worker:watermark"
     ```
  3. Agar watermark future date par set ho gaya hai, delete kar dein:
     ```bash
     redis-cli DEL "tracking:worker:watermark"
     ```
     Worker starting se ya last valid events se wapas process karna shuru kar dega.

---

### Problem 2: POST /tracking/identify par 401 Unauthorized
* **Cause**: Client auth token expire ho chuka hai ya `Authorization: Bearer <token>` header miss ho raha hai.
* **Fix**: Ensure client calls `/tracking/identify` **after** login token is saved in memory/storage.

---

### Problem 3: POST /tracking/events par 400 Bad Request
* **Cause**:
  1. Payload me invalid event name bheja gaya hai. Allowed enums: `src/generated/prisma/enums.ts` (`PRODUCT_VIEWED`, `CART_ADDED`, etc.).
  2. `metadata` object ka size 4KB se bada ho gaya hai (oversized payload guard triggered).
* **Fix**: Check request body against `singleEventSchema` in `src/modules/tracking/validations/tracking.validation.ts`.

---

### Problem 4: Duplicate events create ho rahe hain
* **Cause**: Client network retry kar raha hai bina `clientEventId` ke.
* **Fix**: Mobile app / web client ko har event ke saath unique UUID `clientEventId` bhejna chahiye. Server Redis me `tracking:idemp:<clientEventId>` 24 ghante ke liye cache karta hai aur duplicate drops karta hai.

---

### Problem 5: Database disk space fast grow ho rahi hai
* **Cause**: Raw `user_events` retain ho rahe hain aur retention job fail ho rahi hai.
* **Diagnosis**:
  1. SQL query se count check karein:
     ```sql
     SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM user_events;
     ```
  2. Manual purge run karein:
     ```typescript
     import { userBehaviourAggregationService } from "@/modules/tracking/services/userBehaviourAggregation.service.js";
     await userBehaviourAggregationService.purgeOldEvents(60); // 60 days
     ```

---

## 4. Useful Diagnostic SQL Queries

```sql
-- 1. Check total raw events vs aggregated summaries
SELECT 'raw_events' as table_name, COUNT(*) FROM user_events
UNION ALL
SELECT 'summaries' as table_name, COUNT(*) FROM user_behavior_summary
UNION ALL
SELECT 'interests' as table_name, COUNT(*) FROM user_interests;

-- 2. Check top 10 most active users by product views
SELECT user_id, product_views, cart_adds, payment_success, last_active_at
FROM user_behavior_summary
ORDER BY product_views DESC
LIMIT 10;

-- 3. Check most popular categories by user interest scores
SELECT entity_id, SUM(score) as total_score, SUM(view_count) as total_views, SUM(cart_count) as total_carts
FROM user_interests
WHERE type = 'CATEGORY'
GROUP BY entity_id
ORDER BY total_score DESC
LIMIT 10;
```
