/**
 * Tire Direct API client
 * Base URL: the deployed Cloudflare Worker
 */

const API_BASE = 'https://tire-direct-api.paxjustice.workers.dev'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CustomerInput {
  name: string
  phone: string
  email?: string
  whatsapp?: string
  vehicle_plate?: string
  vehicle_make?: string
  vehicle_model?: string
  notes?: string
}

export interface OrderItemInput {
  sku: string
  quantity: number
}

export interface CreateOrderInput {
  customer: CustomerInput
  items: OrderItemInput[]
  install_date: string
  install_time_slot: string
  install_location: string
  customer_note?: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
}

export interface OrderResponse {
  order: {
    id: string
    order_no: string
    customer_id: string
    currency: string
    subtotal_amount: number
    deposit_amount: number
    balance_amount: number
    total_amount: number
    order_status: string
    payment_status: string
    install_date: string
    install_time_slot: string
    install_location: string
    customer_note?: string
    created_at: string
  }
  items: Array<{
    id: string
    sku: string
    product_name: string
    brand: string
    model: string
    specification: string
    unit_price: number
    quantity: number
    line_total: number
  }>
}

export interface CreateCheckoutInput {
  order_no: string
  phone: string
  payment_type: 'deposit' | 'full'
}

export interface CheckoutResponse {
  checkout_url: string
  session_id: string
}

// ─── Fetch wrapper ────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  const json: ApiResponse<T> = await res.json()
  if (!json.success) {
    throw new Error(json.error?.message ?? `API error ${res.status}`)
  }
  return json.data as T
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function createOrder(input: CreateOrderInput): Promise<OrderResponse> {
  return apiFetch<OrderResponse>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function createCheckout(input: CreateCheckoutInput): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>('/api/payments/checkout', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ─── SKU catalog (must match backend catalog.ts) ────────────────────────────────
// Maps from brand+sizepart → API SKU
// Key format: "BRAND-WIDTH/PROFILERIM" e.g. "Continental-255/40R19"

export const SKU_CATALOG: Record<string, string> = {
  // Continental
  'Continental-255/40R19': 'CONTINENTAL-255-40R19',
  // Michelin
  'Michelin-235/35R19': 'MICHELIN-235-35R19',
  // Prinx
  'Prinx-225/45R18': 'PRINX-225-45R18',
}

/**
 * Map a product's brand + size (without load/speed rating) → API SKU.
 * Input size like "255/40R19 100Y" → strips "100Y" → "255/40R19"
 * Falls back to the base key if not found.
 */
export function toSku(brand: string, size: string): string {
  // Strip speed rating (e.g. "100Y", "91W") and whitespace
  const sizeBase = size.replace(/\s+(?:[0-9]{2,3}[A-Z]|[0-9]{3,4}][A-Z])$/i, '').trim()
  // e.g. "255/40R19 100Y" → "255/40R19"
  const key = `${brand}-${sizeBase}` // e.g. "Continental-255/40R19"
  return SKU_CATALOG[key] ?? key
}

/**
 * Convert cent prices to display strings.
 */
export function centsToDisplay(cents: number): string {
  return `HK$ ${(cents / 100).toLocaleString('en-US')}`
}
