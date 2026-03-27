# Tire Direct Backend — Design Spec
Date: 2026-03-27
Status: Approved

---

## 1. Project Scope

Add a production-ready backend to the existing **呔直達 (Tire Direct)** Hong Kong tyre sales & installation booking website.

The frontend is already deployed on Cloudflare Pages. This spec covers the **new, independent backend Worker** only. The frontend is not rewritten; it will call the API over HTTP.

---

## 2. Architecture Decision

### Deployment model: Independent Cloudflare Worker

```
[Cloudflare Pages]                [Cloudflare Worker]
tire-direct.pages.dev   ──CORS──► tire-direct-api.workers.dev
     (frontend)                         (backend)
                                             │
                                       [D1 Database]
                                    tire_direct_db
                                             │
                               ┌─────────────────────────┐
                               │  PaymentProvider (interface)  │
                               ├─────────────────────────┤
                               │  StripeProvider          │
                               │  MockProvider            │
                               └─────────────────────────┘
```

**Rationale:**
- Frontend and backend deploy independently via separate `wrangler.toml` files
- No custom domain required for development; uses `*.pages.dev` + `*.workers.dev`
- CORS is handled explicitly in the Worker, allowing the Pages origin
- Frontend sets `API_BASE_URL` as a Cloudflare Pages environment variable pointing to the Worker URL
- When a custom domain is added later, only `API_BASE_URL` changes — no code changes

### Custom domain migration path (future)
```
api.tiredirect.hk → tire-direct-api.workers.dev (Worker Route)
```

---

## 3. Source Layout

```
tire_direct_api/            ← new repo / subfolder, separate from frontend
├── src/
│   ├── index.ts            ← Worker entry point, Hono app bootstrap
│   ├── catalog.ts          ← Static SKU price catalog (v1 price source of truth)
│   ├── routes/
│   │   ├── orders.ts       ← Order CRUD routes
│   │   ├── payments.ts     ← Payment checkout + query routes
│   │   └── webhooks.ts     ← Stripe + Mock webhook handlers
│   ├── services/
│   │   ├── OrderService.ts
│   │   └── PaymentService.ts
│   ├── providers/
│   │   ├── PaymentProvider.ts   ← interface + factory
│   │   ├── StripeProvider.ts
│   │   └── MockProvider.ts
│   ├── db/
│   │   ├── schema.ts       ← TypeScript types mirroring DB tables
│   │   └── queries.ts      ← All D1 query functions
│   ├── validators/
│   │   ├── orders.ts       ← Zod schemas for order endpoints
│   │   └── payments.ts     ← Zod schemas for payment endpoints
│   └── utils/
│       ├── response.ts     ← Unified success/error response helpers
│       ├── orderNo.ts      ← Order number generation (backend-owned)
│       └── crypto.ts       ← Workers-compatible HMAC helpers
├── schema.sql
├── wrangler.toml
├── package.json
├── tsconfig.json
├── .dev.vars.example
└── README.md
```

---

## 4. Database Schema

### Design Principles
- All monetary amounts stored as **integer cents** (HKD × 100). HK$1,280.00 → `128000`
- All timestamps stored as ISO-8601 strings (D1 has no native DATETIME type with timezone)
- `order_no` is generated **by the backend** using format `TT-YYYYMMDD-XXXXXX` (6-digit random)
- Foreign keys declared but D1 does not enforce them at runtime; application layer enforces integrity
- `webhook_event_id` on `payments` is a **denormalized fast-lookup field** only; full audit trail is in `payment_events`

### Table: `customers`
```sql
CREATE TABLE customers (
  id               TEXT PRIMARY KEY,          -- UUID v4
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL,             -- HK 8-digit, validated
  email            TEXT,
  whatsapp         TEXT,
  vehicle_plate    TEXT,
  vehicle_make     TEXT,
  vehicle_model    TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_customers_phone ON customers(phone);
```

### Table: `orders`
```sql
CREATE TABLE orders (
  id               TEXT PRIMARY KEY,          -- UUID v4
  order_no         TEXT NOT NULL UNIQUE,      -- TT-YYYYMMDD-XXXXXX, backend-generated
  customer_id      TEXT NOT NULL REFERENCES customers(id),
  currency         TEXT NOT NULL DEFAULT 'HKD',
  subtotal_amount  INTEGER NOT NULL,          -- sum of line_totals (cents)
  deposit_amount   INTEGER NOT NULL,          -- floor(total × DEPOSIT_RATE_BPS / 10000), cents
  balance_amount   INTEGER NOT NULL,          -- total - deposit (cents)
  total_amount     INTEGER NOT NULL,          -- = subtotal in v1 (no tax/surcharge)
  order_status     TEXT NOT NULL DEFAULT 'pending_payment',
  payment_status   TEXT NOT NULL DEFAULT 'unpaid',
  install_date     TEXT NOT NULL,             -- YYYY-MM-DD
  install_time_slot TEXT NOT NULL,            -- e.g. '10:00-12:00'
  install_location TEXT NOT NULL,             -- district/address
  customer_note    TEXT,
  internal_note    TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_orders_customer    ON orders(customer_id);
CREATE INDEX idx_orders_status      ON orders(order_status);
CREATE INDEX idx_orders_created_at  ON orders(created_at);
```

**order_status values and semantics:**
| Value | Meaning |
|---|---|
| `pending_payment` | Order created, awaiting deposit payment |
| `confirmed` | Deposit (or full payment) webhook confirmed; awaiting staff to confirm installation slot |
| `booked` | Staff has explicitly confirmed the installation date/time slot |
| `completed` | Installation done, order closed |
| `cancelled` | Order cancelled (by customer or staff) |

> `confirmed` and `booked` are **separate transitions**. A successful payment moves the order to `confirmed`. Only a staff action (authenticated `PATCH /api/orders/:id/status`) moves it to `booked`.

**payment_status values:**
| Value | Meaning |
|---|---|
| `unpaid` | No successful payment yet |
| `partial` | Deposit paid, balance outstanding |
| `paid` | Full amount received (deposit + balance, or single full payment) |
| `refunded` | Payment refunded |
| `failed` | Last payment attempt failed (order may still be recoverable) |

### Table: `order_items`
```sql
CREATE TABLE order_items (
  id               TEXT PRIMARY KEY,          -- UUID v4
  order_id         TEXT NOT NULL REFERENCES orders(id),
  sku              TEXT NOT NULL,             -- must match a key in server-side SKU catalog
  product_name     TEXT NOT NULL,
  brand            TEXT NOT NULL,             -- e.g. Continental, Michelin
  model            TEXT NOT NULL,             -- e.g. PILOT SPORT 5
  specification    TEXT NOT NULL,             -- e.g. 255/40R19 100Y
  unit_price       INTEGER NOT NULL,          -- cents, resolved from SKU catalog at creation time
  quantity         INTEGER NOT NULL DEFAULT 1,
  line_total       INTEGER NOT NULL,          -- unit_price × quantity
  created_at       TEXT NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
```

### Table: `payments`
```sql
CREATE TABLE payments (
  id                   TEXT PRIMARY KEY,       -- UUID v4
  order_id             TEXT NOT NULL REFERENCES orders(id),
  customer_id          TEXT NOT NULL REFERENCES customers(id),
  provider             TEXT NOT NULL,          -- 'stripe' | 'mock'
  method               TEXT,                   -- 'card' | 'alipay_hk' | 'fps' | null (not yet known)
  payment_type         TEXT NOT NULL,          -- 'deposit' | 'balance' | 'full'
  currency             TEXT NOT NULL DEFAULT 'HKD',
  amount               INTEGER NOT NULL,       -- cents
  status               TEXT NOT NULL DEFAULT 'pending',
  provider_payment_id  TEXT,                   -- Stripe PaymentIntent id / mock id
  provider_session_id  TEXT,                   -- Stripe Checkout Session id / mock session id
  checkout_url         TEXT,                   -- redirect URL sent to frontend
  webhook_event_id     TEXT,                   -- last processed event id (denormalized for quick lookup)
  failure_reason       TEXT,
  raw_payload          TEXT,                   -- last webhook raw JSON (quick debug, not audit trail)
  paid_at              TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX idx_payments_order      ON payments(order_id);
CREATE INDEX idx_payments_session    ON payments(provider_session_id);
CREATE INDEX idx_payments_status     ON payments(status);
```

**payments.status values:**
| Value | Meaning |
|---|---|
| `pending` | Checkout session created, awaiting payment |
| `requires_action` | 3DS or additional authentication required |
| `paid` | Confirmed by webhook |
| `failed` | Payment failed (terminal) |
| `cancelled` | Session expired or user cancelled |
| `refunded` | Refunded |

### Table: `payment_events` (webhook audit + idempotency)
```sql
CREATE TABLE payment_events (
  id               TEXT PRIMARY KEY,           -- UUID v4
  payment_id       TEXT REFERENCES payments(id),   -- null if payment lookup fails
  order_id         TEXT REFERENCES orders(id),     -- null if order lookup fails
  provider         TEXT NOT NULL,
  event_id         TEXT NOT NULL,              -- provider's unique event id (e.g. Stripe evt_xxx)
  event_type       TEXT NOT NULL,              -- e.g. 'checkout.session.completed'
  raw_payload      TEXT NOT NULL,
  processed_at     TEXT,                       -- null = received but not yet processed
  error            TEXT,                       -- non-null if processing threw an error
  created_at       TEXT NOT NULL
);
-- Primary idempotency constraint: reject duplicate provider events
CREATE UNIQUE INDEX idx_payment_events_provider_event
  ON payment_events(provider, event_id);
CREATE INDEX idx_payment_events_payment  ON payment_events(payment_id);
CREATE INDEX idx_payment_events_order    ON payment_events(order_id);
```

---

## 5. Business Logic

### 5.1 Price & Amount Calculation (backend-owned)

**Price source for v1: static SKU catalog in `src/catalog.ts`.**

This is the single source of truth. No products table, no env-var JSON. The catalog is a TypeScript `Map<sku, CatalogEntry>` compiled into the Worker bundle. To update prices: edit `catalog.ts` and redeploy.

The frontend sends `items[]` with `sku` and `quantity`. The backend:
1. Looks up `unit_price` from `CATALOG` map by `sku`; rejects unknown SKUs with `400 UNKNOWN_SKU`
2. Computes `line_total = unit_price × quantity` per item
3. Computes `subtotal_amount = Σ line_totals`
4. Computes `total_amount = subtotal_amount` (no tax in v1)
5. Computes `deposit_amount = Math.floor(total_amount * DEPOSIT_RATE_BPS / 10000)`
6. Computes `balance_amount = total_amount - deposit_amount`

**The frontend's price strings are never read.** All amount fields sent by the client are ignored.

### 5.2 Deposit Rate: basis points (no floats)

```
DEPOSIT_RATE_BPS=3000   → 3000 / 10000 = 30.00%
```

Using integer basis points avoids floating-point rounding in the deposit calculation. `Math.floor` is applied so the deposit always rounds down (favoring the customer on fractional cents).

### 5.3 Order Number Generation (backend-owned)

```
TT-YYYYMMDD-XXXXXX   (6 random digits, collision-retried up to 3 times via UNIQUE constraint)
```

Generated at order creation, stored in `orders.order_no` with a UNIQUE constraint. On constraint violation the service retries with a new random suffix, up to 3 attempts before returning a 500.

### 5.4 D1 Transaction Strategy for Order Creation

D1 does not support multi-statement transactions via the Workers binding in the same way as SQLite. The `db.batch()` API executes a list of statements atomically within a single HTTP round-trip to D1, providing **all-or-nothing execution** for the batch.

**Strategy:** Use `db.batch([...])` to atomically insert `customers` (or upsert), `orders`, and all `order_items` in a single batch call.

```
db.batch([
  INSERT INTO customers ...
  INSERT INTO orders ...
  INSERT INTO order_items (item 1) ...
  INSERT INTO order_items (item 2) ...
  ...
])
```

If any statement in the batch fails, D1 rolls back all statements in that batch. No partial order is possible.

**Compensation strategy for non-batch operations** (e.g. post-creation webhook processing): Each step is idempotent and can be safely retried. If a payment record insert succeeds but the order status update fails, the reconcile endpoint (`POST /api/payments/:id/reconcile`) re-derives order state from payment records and corrects it.

### 5.5 Order Status Transitions

```
[created] → pending_payment
                 │
      webhook: deposit paid ──────────────────┐
                 │                             │ (full payment)
                 ▼                             ▼
            confirmed                      confirmed
        payment_status: partial         payment_status: paid
                 │
      staff PATCH /orders/:id/status
                 ▼
              booked
                 │
      staff PATCH /orders/:id/status
      + balance payment webhook
                 ▼
            completed
          payment_status: paid

Any non-completed state → cancelled (staff action)
```

**Permitted staff status transitions:**
| From | To (allowed) |
|---|---|
| `pending_payment` | `cancelled` |
| `confirmed` | `booked`, `cancelled` |
| `booked` | `completed`, `cancelled` |

Attempting an out-of-sequence transition returns `400 INVALID_STATUS_TRANSITION`.

### 5.6 Payment Type Logic

| payment_type | Amount | Resulting order payment_status |
|---|---|---|
| `deposit` | `deposit_amount` (30%) | `partial` |
| `full` | `total_amount` (100%) | `paid` |
| `balance` | `balance_amount` (70%) | `paid` (only valid when already `partial`) |

### 5.7 Stripe Async Payment Events

The webhook handler processes the following Stripe event types:

| Event | Action |
|---|---|
| `checkout.session.completed` | Primary success path. Mark payment `paid`, update order. |
| `checkout.session.async_payment_succeeded` | For async methods (e.g. bank transfer). Same action as above. |
| `checkout.session.async_payment_failed` | Mark payment `failed`, update `orders.payment_status = failed`. |
| `checkout.session.expired` | Mark payment `cancelled`. Order stays `pending_payment` (retriable). |

All four are routed through the same `handleStripeEvent(event, db)` dispatcher. Unknown event types are logged to `payment_events` with `processed_at = null` and return HTTP 200 (Stripe requires 200 for unhandled events to avoid retries).

---

## 6. Payment Provider Abstraction

### Interface
```typescript
interface PaymentProvider {
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>
  retrieveSession(sessionId: string): Promise<SessionStatus>
  constructEvent(rawBody: string, signature: string): Promise<ProviderEvent>
}
```

### StripeProvider
- Uses `fetch` directly to `https://api.stripe.com/v1/checkout/sessions` — no `stripe` npm package
- Request body encoded as `application/x-www-form-urlencoded` (Stripe REST API requirement)
- Webhook verification: reads raw request body as `ArrayBuffer`, derives HMAC-SHA256 using `crypto.subtle`, compares against `Stripe-Signature` header — fully Workers-compatible, no Node built-ins
- Supports `payment_method_types: ['card', 'alipay']` (Alipay HK on eligible HK Stripe accounts)
- FPS: not natively in Stripe; deferred to v2

### MockProvider
- Returns deterministic `mock_sess_<uuid>` session IDs
- `checkout_url` = `${WORKER_BASE_URL}/api/payments/mock-checkout/${sessionId}`
- Mock checkout page (HTML served by the Worker) has two buttons: "✓ Pay Now" and "✗ Fail Payment"
- Both post to `POST /api/payments/webhook/mock` with a signed payload
- Full round-trip (create order → checkout → webhook → status update) works with zero external dependencies

### Provider Selection
```
PAYMENT_PROVIDER=mock    → MockProvider
PAYMENT_PROVIDER=stripe  → StripeProvider
```

---

## 7. API Design

All responses use unified envelope:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "ORDER_NOT_FOUND", "message": "..." } }
```

### Public routes (called by frontend)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/orders` | None | Create customer + order + items atomically via D1 batch |
| `GET` | `/api/orders/:id` | order_no + phone | Order detail with items + payments |
| `POST` | `/api/payments/checkout` | order_no + phone | Create payment record + checkout session |
| `GET` | `/api/payments/:id` | order_no + phone | Payment detail |
| `GET` | `/api/payments/mock-checkout/:sessionId` | None (served to browser) | Mock checkout UI |
| `POST` | `/api/payments/webhook/stripe` | Stripe-Signature | Stripe webhook handler |
| `POST` | `/api/payments/webhook/mock` | X-Mock-Signature | Mock webhook handler |

### Staff-only routes (protected by Admin Token)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/orders` | Admin Token | List orders (filter: status, date, phone) |
| `PATCH` | `/api/orders/:id/status` | Admin Token | Update order_status |
| `POST` | `/api/payments/:id/reconcile` | Admin Token | Force-sync payment status from provider |

---

## 8. Authentication & Authorization

### 8.1 Public routes — order_no + phone ownership check

No user login system exists. Public-facing endpoints that expose order data use a lightweight ownership challenge:

- Request must supply both `order_no` (from URL or body) and `phone` in query params or request body
- Backend looks up the order, retrieves `customer_id`, then checks `customers.phone == submitted_phone`
- On mismatch: return `403 FORBIDDEN` (do not reveal whether order_no exists)
- This protects against order enumeration while remaining usable without a login system

Example: `GET /api/orders/:id?order_no=TT-20260327-123456&phone=91234567`

### 8.2 Staff routes — Admin Token

All staff-only routes require:
```
Authorization: Bearer <ADMIN_SECRET>
```

- `ADMIN_SECRET` is a Cloudflare Worker secret (set via `wrangler secret put ADMIN_SECRET`)
- Worker middleware checks this header before any staff route handler runs
- If absent or wrong: `401 UNAUTHORIZED`

**Upgrade path:** Replace token check with Cloudflare Access (zero-trust SSO) by routing `*.workers.dev/api/admin/*` through an Access policy. No code changes needed — just add the Access header verification or let Access handle it at the edge.

### 8.3 Webhook routes — signature verification only

Webhook endpoints are public URLs (Stripe/mock needs to reach them). They are protected exclusively by HMAC signature verification. No other auth is applied.

---

## 9. Abuse Prevention

### 9.1 Idempotency

| Scenario | Mechanism |
|---|---|
| Duplicate webhook delivery | `UNIQUE (provider, event_id)` on `payment_events`; INSERT OR IGNORE, then check if `processed_at` is set |
| Duplicate `POST /api/orders` | Frontend prevents double-submit via UI state; no extra server-side idempotency key table in v1 |
| Duplicate checkout for same order | `PaymentService.createCheckout` queries for existing `pending` payment on same order+type; returns existing session URL if found |
| Duplicate payment confirmation | Guard: `if (payment.status === 'paid') return` before writing any state update |

### 9.2 Webhook Signature Verification

| Provider | Method |
|---|---|
| Stripe | Parse `Stripe-Signature` header (t=timestamp,v1=sig), reconstruct signed payload as `${t}.${rawBody}`, verify HMAC-SHA256 against `STRIPE_WEBHOOK_SECRET` using `crypto.subtle` |
| Mock | Verify `X-Mock-Signature: sha256=<hex>` against `MOCK_WEBHOOK_SECRET` using `crypto.subtle` |

Both implementations in `src/utils/crypto.ts` use only `globalThis.crypto.subtle` — no Node built-ins.

### 9.3 Rate Limiting

- v1: Rely on Cloudflare WAF Rate Limiting rules (configured in Cloudflare dashboard, no code needed)
- Recommended rule: max 10 `POST /api/orders` per IP per minute
- v2 upgrade path: Cloudflare Rate Limiting API via Workers or Durable Objects counter

### 9.4 Input Validation

- All request bodies validated with Zod before touching the database
- Phone validated as HK format: `/^[456789]\d{7}$/`
- Dates validated as `YYYY-MM-DD`, must be ≥ today + 3 days
- All amount/price fields from client are **rejected** (computed server-side only)
- SKU must exist in `CATALOG`; unknown SKUs return `400 UNKNOWN_SKU`

### 9.5 Turnstile (v2, noted only)

`POST /api/orders` may optionally accept a `cf-turnstile-response` token. Validation code is stubbed but gated behind `ENABLE_TURNSTILE=true`. Not active in v1.

---

## 10. CORS Policy

```typescript
const ALLOWED_ORIGINS = [
  'https://tire-direct.pages.dev',    // production Pages URL
  'http://localhost:5173',             // local frontend dev (Vite)
  'http://localhost:8788',             // local Pages dev (wrangler pages dev)
]
// FRONTEND_ORIGIN env var adds one additional allowed origin at runtime
```

Preflight (`OPTIONS`) handled before all route matching. CORS headers applied to every response including errors.

---

## 11. Workers Compatibility Constraints

| Requirement | Solution |
|---|---|
| No Node.js built-ins | Use Web Crypto API; `fetch` for all external HTTP |
| No `stripe` npm package | Direct REST calls to `api.stripe.com` with `Authorization: Bearer <key>` |
| Stripe webhook verification | Parse `Stripe-Signature`, compute HMAC-SHA256 via `crypto.subtle.importKey` + `crypto.subtle.sign` |
| UUID generation | `crypto.randomUUID()` (Workers global) |
| Timestamp | `new Date().toISOString()` |
| Stripe body encoding | `application/x-www-form-urlencoded` via `URLSearchParams` (Workers global) |
| D1 batch | `env.DB.batch([stmt1, stmt2, ...])` for atomic multi-table inserts |

---

## 12. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PAYMENT_PROVIDER` | Yes | `mock` or `stripe` |
| `STRIPE_SECRET_KEY` | Stripe only | `sk_test_...` or `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe only | `whsec_...` from Stripe dashboard |
| `MOCK_WEBHOOK_SECRET` | Mock only | Any shared secret string |
| `WORKER_BASE_URL` | Yes | Full URL of this Worker, e.g. `https://tire-direct-api.workers.dev` |
| `FRONTEND_ORIGIN` | Yes | Cloudflare Pages URL for CORS, e.g. `https://tire-direct.pages.dev` |
| `ADMIN_SECRET` | Yes | Bearer token for staff-only routes (set via `wrangler secret put`) |
| `DEPOSIT_RATE_BPS` | No | Default `3000` (= 30.00%); integer basis points |

---

## 13. Configuration Files Required

- `package.json`
- `tsconfig.json`
- `wrangler.toml`
- `.dev.vars.example`
- `schema.sql`
- `README.md`

---

## 14. Stripe-Specific Notes (README annotations)

The following may need adjustment against live Stripe API docs before go-live:
- `payment_method_types`: `alipay` maps to Stripe's Alipay product; confirm HK Stripe merchant account eligibility with Stripe support
- FPS: not available natively in Stripe; PayMe by HSBC or a third-party FPS gateway required for v2
- This implementation uses `checkout.session.completed` as the primary success event and additionally handles `checkout.session.async_payment_succeeded` / `async_payment_failed` for async payment methods
- Currency: Stripe REST API uses lowercase `hkd`; this project normalizes to uppercase `HKD` internally and lowercases only at API call time

---

## 15. Out of Scope (v1)

- Admin dashboard UI
- Product catalog management UI (prices in `catalog.ts`, change requires redeploy)
- SMS/WhatsApp notification after booking
- Balance payment flow (schema ready, endpoint placeholder present, not fully implemented)
- Refund initiation (webhook receipt for refunds handled; refund API call is v2)
- Turnstile bot protection (env-gated stub only)
- Durable Objects rate limiting
- Cloudflare Access integration (upgrade path documented)
