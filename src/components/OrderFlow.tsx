/**
 * OrderFlow — 3-step order overlay connected to real API.
 * Step 1: submit order → API
 * Step 2: terms
 * Step 3: initiate checkout → redirect to mock/payment page
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { createOrder, createCheckout, toSku, centsToDisplay, type OrderResponse } from "../lib/api"
import type { OrderRecord } from "../lib/generateOrderPDF"

/** Supported payment types */
type PayMode = "deposit" | "full"

/** Product summary passed in from HomePage */
interface OrderProduct {
  brand: string
  name: string
  size: string
  price: string
  /** Number of tyres — always 4 for now */
  qty?: number
}

interface OrderFlowProps {
  product: OrderProduct
  payMode: PayMode
  onClose: () => void
  /** Called with full order record after payment succeeds */
  onComplete: (record: OrderRecord) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseUnitPrice(priceString: string): number {
  const n = parseInt(priceString.replace(/[^0-9]/g, ""), 10)
  return Number.isNaN(n) ? 0 : n
}

function getEarliestInstallDate(): string {
  const d = new Date(); d.setDate(d.getDate() + 3)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}

function maskPhone(phone: string): string {
  if (!phone) return ""
  return `****${phone.slice(-4)}`
}

function validatePhone(value: string): string | null {
  const t = value.trim()
  if (!t) return "請輸入有效香港手機號碼"
  if (!/^[456789]\d{7}$/.test(t)) return "請輸入有效香港手機號碼"
  return null
}

/** Build OrderRecord from API response + form state */
function buildOrderRecord(resp: OrderResponse, phone: string, installDate: string, installRegion: string): OrderRecord {
  const depositPaid = resp.order.deposit_amount
  const totalPrice  = resp.order.total_amount
  const remaining   = resp.order.balance_amount
  return {
    orderId:   resp.order.order_no,
    brand:     resp.items[0]?.brand ?? resp.order.order_no,
    model:     resp.items[0]?.model ?? '',
    size:      resp.items[0]?.specification ?? '',
    qty:       resp.items.reduce((s, i) => s + i.quantity, 0),
    unitPrice: resp.items[0]?.unit_price ?? 0,
    totalPrice,
    depositPaid,
    remaining,
    installDate: installDate || getEarliestInstallDate(),
    installRegion: installRegion || "九龍",
    phone: maskPhone(phone),
    createdAt: resp.order.created_at,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrderFlow({ product, payMode, onClose, onComplete }: OrderFlowProps) {
  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [installDate, setInstallDate] = useState("")
  const [installRegion, setInstallRegion] = useState("")
  const [phone, setPhone]         = useState("")
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Terms checkboxes
  const [servicePromise, setServicePromise] = useState(false)
  const [clientPromise, setClientPromise]   = useState(false)
  const [qualityPromise, setQualityPromise] = useState(false)
  const [allAgree, setAllAgree]             = useState(false)

  // Payment method selector (Step 3)
  const [paymentMethod, setPaymentMethod] = useState<"fps"|"payme"|"card">("card")

  // API response state (carried from step1 → step3)
  const [orderResponse, setOrderResponse] = useState<OrderResponse | null>(null)

  const qty = product.qty ?? 4
  const unitPrice  = useMemo(() => parseUnitPrice(product.price), [product])
  const totalPrice = unitPrice * qty
  const depositAmount  = Math.round(totalPrice * 0.3)
  const mainPayAmount  = payMode === "deposit" ? depositAmount : totalPrice
  const remainingAmount = totalPrice - mainPayAmount

  const allTermsChecked = servicePromise && clientPromise && qualityPromise && allAgree
  const earliestDate    = useMemo(getEarliestInstallDate, [])

  // ─── ESC / backdrop close ─────────────────────────────────────────────────

  const requestClose = useCallback(() => {
    if (step >= 2 && !window.confirm("確定放棄訂單？")) return
    onClose()
  }, [step, onClose])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [requestClose])

  // ─── Step 1 → Submit order to API ───────────────────────────────────────

  async function handleStep1Next() {
    setSubmitError(null)
    const err = validatePhone(phone)
    if (err) { setPhoneError(err); return }
    if (!installDate)  { setSubmitError("請選擇安裝日期"); return }
    if (!installRegion) { setSubmitError("請選擇安裝地區"); return }
    setPhoneError(null)

    setIsSubmitting(true)
    try {
      // Build SKU from product brand+size
      const sku = toSku(product.brand, product.size)

      const resp = await createOrder({
        customer: {
          name:           "客戶",   // captured separately in real app
          phone,
          vehicle_plate:  installRegion,
          vehicle_make:   product.brand,
          vehicle_model:  product.name,
        },
        items: [{ sku, quantity: qty }],
        install_date:     installDate,
        install_time_slot: "10:00-12:00",
        install_location: installRegion === "九龍" ? "九龍灣旗艦店"
                        : installRegion === "新界" ? "沙田形象店"
                        : "中環形象店",
      })

      setOrderResponse(resp)
      setStep(2)
    } catch (e) {
      setSubmitError((e as Error).message ?? "下單失敗，請重試")
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Step 2 → Terms accepted ─────────────────────────────────────────────

  function handleStep2Next() {
    if (!allTermsChecked) return
    setStep(3)
  }

  // ─── Step 3 → Create checkout → redirect ─────────────────────────────────

  async function handleConfirmPayment() {
    if (!orderResponse || isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const checkout = await createCheckout({
        order_no:   orderResponse.order.order_no,
        phone,
        payment_type: payMode === "deposit" ? "deposit" : "full",
      })
      // Redirect to the mock checkout page (or Stripe redirect)
      window.location.href = checkout.checkout_url
    } catch (e) {
      setSubmitError((e as Error).message ?? "發起付款失敗，請重試")
      setIsSubmitting(false)
    }
  }

  // ─── After return from checkout → show confirmation ──────────────────────
  // Handled via query param on the home page.
  // When the user lands back on the home page with ?order_no=X&phone=Y,
  // HomePage shows OrderConfirmation.
  // We call onComplete immediately so HomePage can show the overlay.

  // Intercept return from checkout: check if we came back with ?paid=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("paid") === "1" && orderResponse) {
      onComplete(buildOrderRecord(orderResponse, phone, installDate, installRegion))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderResponse])

  // ─── Render ───────────────────────────────────────────────────────────────

  function buildPreviewRecord(): OrderRecord | null {
    if (!orderResponse) return null
    return buildOrderRecord(orderResponse, phone, installDate, installRegion)
  }

  const stepItems = [
    { id: 1 as const, label: "確認" },
    { id: 2 as const, label: "條款" },
    { id: 3 as const, label: "付款" },
  ]

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-center bg-slate-950/95 text-white backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) requestClose() }}
    >
      <div className="flex w-full max-w-5xl flex-col border-l border-r border-slate-800 bg-slate-950">

        {/* ── Header / Stepper ── */}
        <header className="border-b border-slate-800 bg-slate-950 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Order Console</span>
              <span className="h-px w-8 bg-slate-700" />
              <span className="font-mono text-[11px] text-slate-400">{product.brand} · {product.name} · {product.size}</span>
            </div>
            <button type="button" onClick={requestClose}
              className="border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-medium text-slate-300 hover:border-red-700 hover:text-red-400">
              ESC · 關閉
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            {stepItems.map((item) => {
              const isActive    = step === item.id
              const isCompleted = step > item.id
              const canClick    = item.id < step
              const base = "flex-1 border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em]"
              const cls  = isActive ? "border-blue-600 bg-blue-600 text-white"
                       : isCompleted ? "border-slate-700 bg-slate-800 text-slate-300"
                       : "border-slate-800 bg-slate-900 text-slate-500"
              return (
                <button key={item.id} type="button"
                  className={`${base} ${cls} ${canClick ? "hover:border-blue-500" : ""}`}
                  onClick={() => canClick && setStep(item.id)}>
                  <span className="font-mono">{item.id}. {item.label}</span>
                </button>
              )
            })}
          </div>
        </header>

        {/* ── Body ── */}
        <main className="flex-1 overflow-y-auto border-t border-slate-800 bg-slate-950 px-6 py-5">

          {/* STEP 1 ── */}
          {step === 1 && (
            <section className="flex flex-col gap-4">
              {/* Order summary card */}
              <div className="border border-slate-700 bg-slate-900 px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-slate-500">Step 1 · 確認訂單細節</span>
                  <span className="font-mono text-[10px] text-slate-400">單位：HK$</span>
                </div>
                <div className="text-[13px] font-semibold text-white">{product.brand} · {product.name}</div>
                <div className="text-[11px] text-slate-400">尺寸：{product.size} · 數量：{qty} 條</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">估算總價</span>
                  <span className="font-mono text-[18px] font-bold text-white">HK$ {totalPrice.toLocaleString("en-US")}</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {payMode === "deposit"
                    ? `定金方案 · 預付 30%（HK$ ${depositAmount.toLocaleString("en-US")}），尾款 HK$ ${remainingAmount.toLocaleString("en-US")}`
                    : "全額一次付清 · 上門安裝前全額結算"}
                </div>
                {/* Live API price if order placed */}
                {orderResponse && (
                  <div className="mt-2 border-t border-slate-700 pt-2">
                    <div className="text-[10px] text-emerald-400">
                      ✅ 已確認價格：總價 {centsToDisplay(orderResponse.order.total_amount)}
                      {payMode === "deposit" ? ` · 定金 ${centsToDisplay(orderResponse.order.deposit_amount)}` : ""}
                    </div>
                  </div>
                )}
              </div>

              {/* Installation details */}
              <div className="border border-slate-700 bg-slate-900 px-4 py-3">
                <div className="mb-3 text-[9px] uppercase tracking-[0.2em] text-slate-500">安裝資訊 · Installation Details</div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-slate-500">安裝日期</label>
                    <input type="date" min={earliestDate} value={installDate}
                      onChange={(e) => setInstallDate(e.target.value)}
                      className="border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-blue-500" />
                    <p className="text-[9px] text-slate-500">最早：{earliestDate}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-slate-500">安裝地區</label>
                    <select value={installRegion} onChange={(e) => setInstallRegion(e.target.value)}
                      className="border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-blue-500">
                      <option value="">請選擇</option>
                      <option value="九龍">九龍</option>
                      <option value="新界">新界</option>
                      <option value="港島">港島</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-slate-500">聯絡電話（香港）</label>
                    <input type="tel" maxLength={8} value={phone}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9]/g, "")
                        setPhone(v)
                        setPhoneError(validatePhone(v))
                      }}
                      className={`border bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-blue-500 ${phoneError ? "border-red-500" : "border-slate-700"}`} />
                    {phoneError ? <p className="text-[9px] text-red-400">{phoneError}</p>
                               : <p className="text-[9px] text-slate-500">8 位香港手機號碼</p>}
                  </div>
                </div>
                {submitError && <div className="mt-3 text-[10px] text-red-400">{submitError}</div>}
              </div>
            </section>
          )}

          {/* STEP 2 ── */}
          {step === 2 && (
            <section className="flex flex-col gap-4">
              <div className="border border-slate-700 bg-slate-900 px-4 py-3">
                <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">Step 2 · 雙向信任契約條款</div>
                <div className="space-y-3">
                  {[
                    { v: servicePromise, s: setServicePromise, title: "服務商承諾", body: "「呔直達承諾：您的訂金將托管於獨立帳戶，若服務商未能於 48 小時內確認備貨，訂金全額退回，無需任何理由。」" },
                    { v: clientPromise,  s: setClientPromise,  title: "客戶承諾",    body: "「訂單確認後，如客戶單方面取消，訂金（總額 30%）將作為服務商備貨成本補償，不予退還。此條款已符合香港消委會消費者合約指引。」" },
                    { v: qualityPromise, s: setQualityPromise, title: "品質保障",    body: "「安裝完成前，您將收到 6 位驗收碼。尾款僅在您輸入驗收碼確認驗收後方可放行。若輪胎規格與訂單不符，訂金全退並補償 HK$200。」" },
                    { v: allAgree,      s: setAllAgree,      title: "總體確認",    body: "「我已閱讀並同意以上所有條款。」" },
                  ].map(({ v, s, title, body }) => (
                    <label key={title} className="flex cursor-pointer items-start gap-2 border border-slate-800 bg-slate-950 px-3 py-2">
                      <input type="checkbox" className="mt-[2px] h-3 w-3 accent-blue-600"
                        checked={v} onChange={(e) => s(e.target.checked)} />
                      <div className="text-[11px] leading-relaxed text-slate-300">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
                        <p>{body}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="mt-4 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
                  香港消費者委員會投訴熱線：2929 2222
                </div>
              </div>
            </section>
          )}

          {/* STEP 3 ── */}
          {step === 3 && (
            <section className="flex flex-col gap-4">
              <div className="border border-slate-700 bg-slate-900 px-4 py-3">
                <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">Step 3 · 付款</div>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Left: order summary from API */}
                  <div className="border border-slate-800 bg-slate-950 px-3 py-3">
                    <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">訂單摘要</div>
                    {orderResponse ? (
                      <>
                        <div className="text-[12px] font-semibold text-white">
                          {product.brand} · {product.name}
                        </div>
                        <div className="text-[11px] text-slate-400">尺寸：{product.size} · 數量：{qty} 條</div>
                        <div className="mt-2 border-t border-slate-800 pt-2 text-[10px] text-slate-400">
                          訂單號：<span className="font-mono text-slate-200">{orderResponse.order.order_no}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">安裝日期：<span className="font-mono text-slate-200">{installDate || earliestDate}</span></div>
                        <div className="text-[10px] text-slate-400">安裝地區：<span className="font-mono text-slate-200">{installRegion}</span></div>
                        <div className="mt-2 font-mono text-[11px] text-emerald-400">
                          {centsToDisplay(mainPayAmount)}（{payMode === "deposit" ? `定金 30% · 尾款 ${centsToDisplay(remainingAmount)}` : "全額"}）
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-500">載入中…</div>
                    )}
                  </div>

                  {/* Right: payment method */}
                  <div className="border border-slate-800 bg-slate-950 px-3 py-3">
                    <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">付款方式</div>
                    <div className="flex flex-col gap-2">
                      {[
                        { key: "card" as const, label: "信用卡（Stripe / Mock）", desc: "安全快捷，支援 Visa / Mastercard" },
                        { key: "fps"  as const, label: "FPS 轉數快（稍後開通）",   desc: "QR Code 掃碼，支援所有香港銀行" },
                        { key: "payme" as const, label: "PayMe（稍後開通）",       desc: "用 PayMe App 掃碼付款" },
                      ].map((m) => (
                        <button key={m.key} type="button" onClick={() => setPaymentMethod(m.key)}
                          disabled={m.key !== "card"}
                          className={`flex flex-col border px-3 py-2 text-left text-[11px] transition-colors ${
                            paymentMethod === m.key
                              ? "border-blue-500 bg-slate-800"
                              : m.key !== "card"
                              ? "border-slate-700 bg-slate-900 opacity-40 cursor-not-allowed"
                              : "border-slate-700 bg-slate-900 hover:border-slate-500"
                          }`}>
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-100">{m.label}</span>
                            {paymentMethod === m.key && (
                              <span className="flex items-center gap-1 text-[9px] text-emerald-400">
                                <span className="h-1.5 w-1.5 bg-emerald-400" />ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">{m.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {submitError && <div className="mt-3 text-[10px] text-red-400">{submitError}</div>}
              </div>
            </section>
          )}
        </main>

        {/* ── Footer ── */}
        <footer className="border-t border-slate-800 bg-slate-950 px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => step === 1 ? requestClose() : setStep(p => p === 1 ? 1 : (p - 1) as 1|2|3)}
              className="border border-slate-700 bg-slate-900 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300 hover:border-slate-500">
              {step === 1 ? "取消" : "返回"}
            </button>

            {step === 1 && (
              <button type="button" onClick={handleStep1Next} disabled={isSubmitting}
                className="border border-blue-600 bg-blue-600 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white hover:bg-blue-500 disabled:opacity-40">
                {isSubmitting ? "處理中…" : "下一步 →"}
              </button>
            )}
            {step === 2 && (
              <button type="button" onClick={handleStep2Next} disabled={!allTermsChecked}
                className={`border px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                  allTermsChecked ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-500"
                                  : "border-slate-700 bg-slate-900 text-slate-500 opacity-30 cursor-not-allowed"
                }`}>
                確認條款，前往付款 →
              </button>
            )}
            {step === 3 && (
              <button type="button" onClick={handleConfirmPayment} disabled={isSubmitting || !orderResponse}
                className="border border-blue-600 bg-blue-600 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white hover:bg-blue-500 disabled:opacity-40">
                {isSubmitting ? "轉向付款頁…" : "確認付款 →"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
