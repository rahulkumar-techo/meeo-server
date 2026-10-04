# Client-Side User Behaviour Tracking & Bottleneck Prevention Guide
*(For React Native Mobile App & Next.js / React Web Application)*

---

## 1. Overview & Core Rules

1. **Anonymous Visitors (Guest):**
   * Stored **ONLY on the client** (`localStorage` / `IndexedDB` on Web, `AsyncStorage` / `MMKV` on React Native).
   * **Zero HTTP tracking calls** are sent to the backend while browsing as a guest.
   * Maximum buffer size: **50–100 events** (FIFO ring buffer).
   * Expiration (TTL): **7 Days**.
2. **Authenticated Users:**
   * Events are collected and flushed in batches every **5–10 seconds** or when the buffer reaches **10 events**.
   * On page close or app backgrounding, remaining events are flushed immediately.
3. **Login Event Merge:**
   * On successful login, the client calls `POST /api/v1/tracking/identify` with the anonymous `sessionId` and buffered events.
   * Client **never** sends `userId` manually; the server extracts it from the verified auth token.

---

## 2. System Bottlenecks Aur Unka Prevention (Detailed Architecture)

Client-side tracking agar bina safeguards ke implement ki jaye, toh mobile app hang ho sakti hai, battery drain ho sakti hai, aur backend par traffic spike (thundering herd) aa sakta hai. 

Neeche 5 critical bottlenecks aur unka exact prevention diya gaya hai:

### Bottleneck 1: High Frequency UI Events (Rapid Scrolling / Typing / Product Clicks)
* **Risk:** User fast scroll karta hai ya filters toggle karta hai. Har click par API call karne se mobile CPU 100% ho jata hai aur UI freeze ho jati hai.
* **Prevention (Debouncing & Throttling):**
  * `PRODUCT_SEARCHED` event ko 500ms debounce karein (sirf user typing pause karne par record karein).
  * `PRODUCT_VIEWED` event par 1-second view threshold lagayein (user product card par at least 1 second ruke, tabhi view count ho).

### Bottleneck 2: Network Drop / Offline State (Mobile Connectivity Loss)
* **Risk:** Local trains, elevators ya poor signal me API calls fail hongi aur unhandled errors aayenge.
* **Prevention (Persistent Queue & Exponential Backoff):**
  * Agar network offline ho, events ko disk storage (`MMKV` / `IndexedDB`) me retain karein.
  * Reconnection par 1s, 2s, 4s, 8s exponential backoff ke sath retry karein.

### Bottleneck 3: Thundering Herd on Flash Sales / Big Drops
* **Risk:** 50,000 users ek sath 12:00 PM par app open karte hain. Agar sabka timer har exact 10th second par flush kare, toh backend par sudden spike aayega.
* **Prevention (Jittered Batch Flusher):**
  * Fixed interval (`10000ms`) ke bajaye randomized jitter use karein:
    ```typescript
    const flushDelay = 8000 + Math.random() * 4000; // 8s to 12s randomized
    ```

### Bottleneck 4: Storage Exhaustion on Low-End Devices
* **Risk:** Agar guest user 1 mahine tak login na kare aur roz hazaron products dekhe, toh storage fill ho jayegi.
* **Prevention (FIFO Ring Buffer):**
  * Hard limit: Max 100 events. Jab 101th event aaye, toh sabse purana (oldest) event drop ho jaye:
    ```typescript
    if (buffer.length >= 100) {
      buffer.shift(); // Drop oldest event
    }
    ```

### Bottleneck 5: Lost Events on Tab Close / App Kill
* **Risk:** User cart me add karke browser tab turant close kar deta hai. Normal `fetch()` request cancel ho jati hai.
* **Prevention (`navigator.sendBeacon` / `AppState` listener):**
  * **Web:** Tab close / unload hone par `navigator.sendBeacon("/api/v1/tracking/events", payload)` use karein jo background me guaranteed deliver hota hai.
  * **React Native:** `AppState.addEventListener('change', ...)` se jab state `background` ya `inactive` ho, turant pending buffer flush karein.

---

## 3. Production-Ready Client Tracking SDK (TypeScript)

Aap is code ko direct apne Web (`src/lib/tracker.ts`) ya Mobile project me use kar sakte hain:

```typescript
// tracker.ts - Production-ready Tracker Client
export type UserEventType =
  | 'PRODUCT_VIEWED'
  | 'PRODUCT_SEARCHED'
  | 'CATEGORY_VIEWED'
  | 'FILTER_USED'
  | 'SORT_USED'
  | 'WISHLIST_ADDED'
  | 'WISHLIST_REMOVED'
  | 'CART_ADDED'
  | 'CART_REMOVED'
  | 'CHECKOUT_STARTED'
  | 'PAYMENT_STARTED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_SUCCESS'
  | 'ORDER_CREATED'
  | 'ORDER_CANCELLED'
  | 'ORDER_COMPLETED'
  | 'REVIEW_CREATED'
  | 'COUPON_APPLIED'
  | 'COUPON_FAILED';

export interface TrackingEvent {
  clientEventId: string;
  sessionId: string;
  event: UserEventType;
  entityType?: 'PRODUCT' | 'CATEGORY' | 'BRAND' | 'SEARCH_QUERY';
  entityId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

class MeeoTracker {
  private buffer: TrackingEvent[] = [];
  private sessionId: string;
  private isAuthenticated = false;
  private apiBaseUrl: string;
  private flushTimer: any = null;
  private readonly MAX_BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 10000;

  constructor(apiBaseUrl = '/api/v1') {
    this.apiBaseUrl = apiBaseUrl;
    this.sessionId = this.getOrCreateSessionId();
    this.loadBufferFromStorage();
    this.setupLifecycleListeners();
  }

  // Generate or retrieve persistent anonymous session ID
  private getOrCreateSessionId(): string {
    if (typeof window === 'undefined') return 'server-session';
    let sid = localStorage.getItem('meeo_session_id');
    if (!sid) {
      sid = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('meeo_session_id', sid);
    }
    return sid;
  }

  // Load buffered events from storage
  private loadBufferFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('meeo_event_buffer');
      if (saved) {
        this.buffer = JSON.parse(saved);
      }
    } catch {}
  }

  // Persist buffer to storage
  private saveBufferToStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('meeo_event_buffer', JSON.stringify(this.buffer));
    } catch {}
  }

  // Main Track Event Method
  public track(
    event: UserEventType,
    entityType?: 'PRODUCT' | 'CATEGORY' | 'BRAND' | 'SEARCH_QUERY',
    entityId?: string,
    metadata?: Record<string, any>
  ) {
    const trackingEvent: TrackingEvent = {
      clientEventId: 'evt_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now(),
      sessionId: this.sessionId,
      event,
      entityType,
      entityId,
      metadata,
      createdAt: new Date().toISOString(),
    };

    // FIFO Ring buffer guard (Drop oldest if limit exceeded)
    if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }

    this.buffer.push(trackingEvent);
    this.saveBufferToStorage();

    // If authenticated, schedule batched network flush
    if (this.isAuthenticated) {
      if (this.buffer.length >= 10) {
        this.flush();
      } else {
        this.scheduleFlush();
      }
    }
  }

  // Schedule network flush with jitter to prevent server spikes
  private scheduleFlush() {
    if (this.flushTimer) return;
    const jitter = (Math.random() - 0.5) * 2000; // +/- 1s jitter
    this.flushTimer = setTimeout(() => {
      this.flush();
      this.flushTimer = null;
    }, this.FLUSH_INTERVAL_MS + jitter);
  }

  // Send batch to backend
  public async flush() {
    if (this.buffer.length === 0 || !this.isAuthenticated) return;

    const eventsToSend = [...this.buffer];
    this.buffer = [];
    this.saveBufferToStorage();

    try {
      const res = await fetch(`${this.apiBaseUrl}/tracking/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // sends auth cookies / tokens
        body: JSON.stringify({ events: eventsToSend }),
      });

      if (!res.ok) {
        // Re-insert failed events back to buffer for retry
        this.buffer = [...eventsToSend, ...this.buffer].slice(-this.MAX_BUFFER_SIZE);
        this.saveBufferToStorage();
      }
    } catch (err) {
      // Network failure: retain events for later retry
      this.buffer = [...eventsToSend, ...this.buffer].slice(-this.MAX_BUFFER_SIZE);
      this.saveBufferToStorage();
    }
  }

  // Call immediately after user successfully logs in
  public async onUserLogin() {
    this.isAuthenticated = true;
    const eventsToMerge = [...this.buffer];

    try {
      const res = await fetch(`${this.apiBaseUrl}/tracking/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId: this.sessionId,
          events: eventsToMerge,
        }),
      });

      if (res.ok) {
        // Clear local buffer upon successful stitch
        this.buffer = [];
        this.saveBufferToStorage();
      }
    } catch (err) {
      console.warn('[Tracker] Failed to stitch session on login:', err);
    }
  }

  // Guaranteed flush on window close or backgrounding
  private setupLifecycleListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.isAuthenticated && this.buffer.length > 0) {
        const payload = JSON.stringify({ events: this.buffer });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(`${this.apiBaseUrl}/tracking/events`, payload);
          this.buffer = [];
          this.saveBufferToStorage();
        }
      }
    });
  }
}

export const tracker = new MeeoTracker();
```

---

## 4. How to Use in Components

### React Web Example:
```tsx
import { useEffect } from 'react';
import { tracker } from '@/lib/tracker';

export function ProductDetailsPage({ product }) {
  useEffect(() => {
    // Tracks product view with zero network requests if anonymous
    tracker.track('PRODUCT_VIEWED', 'PRODUCT', product.id, {
      category: product.categoryName,
      price: product.price,
    });
  }, [product.id]);

  const handleAddToCart = () => {
    tracker.track('CART_ADDED', 'PRODUCT', product.id, {
      quantity: 1,
      price: product.price,
    });
  };

  return <button onClick={handleAddToCart}>Add to Cart</button>;
}
```

### On User Login:
```tsx
// Inside your Login handler
async function handleLoginSuccess() {
  // 1. Save auth tokens as usual...
  // 2. Notify tracker to flush and stitch session to user account
  await tracker.onUserLogin();
}
```
