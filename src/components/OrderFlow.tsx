/**
 * OrderFlow 覆層組件：負責 3 步驟的落單流程（確認訂單 → 條款 → 付款）。
 * 從 Pricing Panel CTA 觸發，覆蓋全畫面，採用深色工業風樣式。
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import type { OrderRecord } from "../lib/generateOrderPDF"

/**
 * 付款模式型別，與 Home.tsx 的狀態保持一致。
 */
type PayMode = "deposit" | "full"

/**
 * 落單流程所需的產品摘要資料。
 */
interface OrderProduct {
  /** 品牌名稱 */
  brand: string
  /** 型號名稱 */
  name: string
  /** 尺寸資訊 */
  size: string
  /** 價格字串，例如：HK$ 1,280 */
  price: string
}

/**
 * OrderFlow 組件的屬性介面。
 */
interface OrderFlowProps {
  /** 從選中產品傳入的基本資料 */
  product: OrderProduct
  /** 當前在 Pricing Panel 選擇的付款模式 */
  payMode: PayMode
  /** 關閉覆層時觸發 */
  onClose: () => void
  /** 完成付款模擬時回傳訂單紀錄 */
  onComplete: (record: OrderRecord) => void
}

/**
 * 將價格字串轉為數字（移除 HK$ 與逗號）。
 *
 * @param priceString - 例如：HK$ 1,280
 */
function parseUnitPrice(priceString: string): number {
  const numeric = parseInt(priceString.replace(/[^0-9]/g, ""), 10)
  return Number.isNaN(numeric) ? 0 : numeric
}

/**
 * 回傳「今日 + 3 天」的日期（YYYY-MM-DD），限制最早安裝日期。
 */
function getEarliestInstallDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * 產生訂單號：TT-YYYYMMDD-XXXX（XXXX 為 4 位隨機數字）。
 */
function generateOrderId(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const random = Math.floor(1000 + Math.random() * 9000)
  return `TT-${year}${month}${day}-${random}`
}

/**
 * 將完整電話轉為遮罩格式，只保留末 4 位。
 *
 * @param phone - 8 位香港手機號碼
 */
function maskPhone(phone: string): string {
  if (!phone) return ""
  const last4 = phone.slice(-4)
  return `****${last4}`
}

/**
 * OrderFlow 主組件：展示 3 步驟的落單流程。
 *
 * @param props - 組件屬性
 */
export default function OrderFlow({
  product,
  payMode,
  onClose,
  onComplete,
}: OrderFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [installDate, setInstallDate] = useState("")
  const [installRegion, setInstallRegion] = useState("")
  const [phone, setPhone] = useState("")
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [servicePromise, setServicePromise] = useState(false)
  const [clientPromise, setClientPromise] = useState(false)
  const [qualityPromise, setQualityPromise] = useState(false)
  const [allAgree, setAllAgree] = useState(false)

  const [paymentMethod, setPaymentMethod] = useState<"fps" | "payme" | "card">(
    "fps",
  )

  const earliestDate = useMemo(getEarliestInstallDate, [])
  const unitPrice = useMemo(() => parseUnitPrice(product.price), [product])
  const totalPrice = unitPrice * 4
  const depositAmount = Math.round(totalPrice * 0.3)
  const mainPayAmount = payMode === "deposit" ? depositAmount : totalPrice
  const remainingAmount = totalPrice - mainPayAmount

  const allTermsChecked =
    servicePromise && clientPromise && qualityPromise && allAgree

  /**
   * 嘗試關閉覆層：若已經進入步驟 2 或 3，會詢問確認。
   */
  const requestClose = useCallback(() => {
    if (step >= 2) {
      const confirmed = window.confirm("確定放棄訂單？")
      if (!confirmed) return
    }
    onClose()
  }, [onClose, step])

  // ESC 關閉支援
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [requestClose])

  /**
   * 驗證香港手機格式：^[456789]\d{7}$。
   *
   * @param value - 使用者輸入的手機字串
   */
  function validatePhone(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed) return "請輸入有效香港手機號碼"
    const regex = /^[456789]\d{7}$/
    if (!regex.test(trimmed)) {
      return "請輸入有效香港手機號碼"
    }
    return null
  }

  /**
   * 從目前流程狀態組合出 OrderRecord。
   */
  function buildOrderRecord(): OrderRecord {
    const orderId = generateOrderId()
    const createdAt = new Date().toISOString()
    return {
      orderId,
      brand: product.brand,
      model: product.name,
      size: product.size,
      qty: 4,
      unitPrice,
      totalPrice,
      depositPaid: mainPayAmount,
      remaining: remainingAmount,
      installDate: installDate || earliestDate,
      installRegion: installRegion || "九龍",
      phone: maskPhone(phone),
      createdAt,
    }
  }

  /**
   * 處理步驟 1 的「下一步」邏輯：驗證手機、日期與地區。
   */
  function handleStep1Next() {
    setSubmitError(null)
    const phoneErr = validatePhone(phone)
    if (phoneErr) {
      setPhoneError(phoneErr)
    } else {
      setPhoneError(null)
    }

    if (!installDate) {
      setSubmitError("請選擇安裝日期")
      return
    }
    if (!installRegion) {
      setSubmitError("請選擇安裝地區")
      return
    }
    if (phoneErr) {
      return
    }
    setStep(2)
  }

  /**
   * 處理步驟 2 的「前往付款」邏輯：需所有 checkbox 勾選。
   */
  function handleStep2Next() {
    if (!allTermsChecked) return
    setStep(3)
  }

  /**
   * 處理步驟 3 的「確認付款」邏輯：模擬支付成功並回傳訂單。
   */
  function handleConfirmPayment() {
    if (isSubmitting) return
    setIsSubmitting(true)
    const record = buildOrderRecord()
    // 模擬處理延時，增加系統感
    setTimeout(() => {
      onComplete(record)
      setIsSubmitting(false)
    }, 800)
  }

  /**
   * 處理背景點擊：只在點擊最外層容器時觸發關閉。
   */
  function handleBackdropClick(
    event: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) {
    if (event.target === event.currentTarget) {
      requestClose()
    }
  }

  const stepItems = [
    { id: 1 as const, label: "確認" },
    { id: 2 as const, label: "條款" },
    { id: 3 as const, label: "付款" },
  ]

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-center bg-slate-950/95 text-white backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="flex w-full max-w-5xl flex-col border-l border-r border-slate-800 bg-slate-950">
        {/* Header / Stepper */}
        <header className="border-b border-slate-800 bg-slate-950 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Order Console
              </span>
              <span className="h-px w-8 bg-slate-700" />
              <span className="font-mono text-[11px] text-slate-400">
                {product.brand} · {product.name} · {product.size}
              </span>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-medium text-slate-300 hover:border-red-700 hover:text-red-400"
            >
              ESC · 關閉
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            {stepItems.map((item) => {
              const isActive = step === item.id
              const isCompleted = step > item.id
              const canClick = item.id < step
              const baseClasses =
                "flex-1 border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em]"
              let stateClasses =
                "border-slate-800 bg-slate-900 text-slate-500"
              if (isActive) {
                stateClasses = "border-blue-600 bg-blue-600 text-white"
              } else if (isCompleted) {
                stateClasses = "border-slate-700 bg-slate-800 text-slate-300"
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`${baseClasses} ${stateClasses} ${
                    canClick ? "hover:border-blue-500" : ""
                  }`}
                  onClick={() => {
                    if (canClick) setStep(item.id)
                  }}
                >
                  <span className="font-mono">
                    {item.id}. {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        </header>

        {/* Body */}
        <main className="flex-1 overflow-y-auto border-t border-slate-800 bg-slate-950 px-6 py-5">
          {step === 1 && (
            <section className="flex flex-col gap-4">
              {/* 產品確認卡 */}
              <div className="border border-slate-700 bg-slate-900 px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
                    Step 1 · 確認訂單細節
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    單位：HK$
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-[13px] font-semibold text-white">
                    {product.brand} · {product.name}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    尺寸：{product.size} · 數量：4 條
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      估算總價
                    </span>
                    <span className="font-mono text-[18px] font-bold text-white">
                      HK$ {totalPrice.toLocaleString("en-US")}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    目前選擇：
                    {payMode === "deposit"
                      ? `定金方案 · 預付 30%（HK$ ${depositAmount.toLocaleString(
                          "en-US",
                        )}），尾款 HK$ ${remainingAmount.toLocaleString(
                          "en-US",
                        )}`
                      : "全額一次付清 · 上門安裝前全額結算"}
                  </div>
                </div>
              </div>

              {/* 安裝日期 / 地區 / 電話 */}
              <div className="border border-slate-700 bg-slate-900 px-4 py-3">
                <div className="mb-3 text-[9px] uppercase tracking-[0.2em] text-slate-500">
                  安裝資訊 · Installation Details
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {/* 日期 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
                      安裝日期
                    </label>
                    <input
                      type="date"
                      min={earliestDate}
                      value={installDate}
                      onChange={(e) => setInstallDate(e.target.value)}
                      className="border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-blue-500"
                    />
                    <p className="text-[9px] text-slate-500">
                      最早可選：{earliestDate}
                    </p>
                  </div>
                  {/* 地區 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
                      安裝地區
                    </label>
                    <select
                      value={installRegion}
                      onChange={(e) => setInstallRegion(e.target.value)}
                      className="border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="">請選擇</option>
                      <option value="九龍">九龍</option>
                      <option value="新界">新界</option>
                      <option value="港島">港島</option>
                    </select>
                  </div>
                  {/* 電話 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
                      聯絡電話（香港）
                    </label>
                    <input
                      type="tel"
                      maxLength={8}
                      value={phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "")
                        setPhone(val)
                        setPhoneError(validatePhone(val))
                      }}
                      className={`border bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-blue-500 ${
                        phoneError ? "border-red-500" : "border-slate-700"
                      }`}
                    />
                    {phoneError && (
                      <p className="text-[9px] text-red-400">{phoneError}</p>
                    )}
                    {!phoneError && (
                      <p className="text-[9px] text-slate-500">
                        只接受 8 位香港手機號碼
                      </p>
                    )}
                  </div>
                </div>
                {submitError && (
                  <div className="mt-3 text-[10px] text-red-400">
                    {submitError}
                  </div>
                )}
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="flex flex-col gap-4">
              <div className="border border-slate-700 bg-slate-900 px-4 py-3">
                <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">
                  Step 2 · 雙向信任契約條款
                </div>
                <div className="space-y-3">
                  <label className="flex cursor-pointer items-start gap-2 border border-slate-800 bg-slate-950 px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-[2px] h-3 w-3 accent-blue-600"
                      checked={servicePromise}
                      onChange={(e) => setServicePromise(e.target.checked)}
                    />
                    <div className="text-[11px] leading-relaxed text-slate-300">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        服務商承諾
                      </div>
                      <p>
                        「呔直達承諾：您的訂金將托管於獨立帳戶，
                        若服務商未能於 48 小時內確認備貨，
                        訂金全額退回，無需任何理由。」
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-start gap-2 border border-slate-800 bg-slate-950 px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-[2px] h-3 w-3 accent-blue-600"
                      checked={clientPromise}
                      onChange={(e) => setClientPromise(e.target.checked)}
                    />
                    <div className="text-[11px] leading-relaxed text-slate-300">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        客戶承諾
                      </div>
                      <p>
                        「訂單確認後，如客戶單方面取消，
                        訂金（總額 30%）將作為服務商備貨成本補償，
                        不予退還。此條款已符合香港消委會消費者合約指引。」
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-start gap-2 border border-slate-800 bg-slate-950 px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-[2px] h-3 w-3 accent-blue-600"
                      checked={qualityPromise}
                      onChange={(e) => setQualityPromise(e.target.checked)}
                    />
                    <div className="text-[11px] leading-relaxed text-slate-300">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        品質保障
                      </div>
                      <p>
                        「安裝完成前，您將收到 6 位驗收碼。
                        尾款僅在您輸入驗收碼確認驗收後方可放行。
                        若輪胎規格與訂單不符，訂金全退並補償 HK$200。」
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-start gap-2 border border-slate-800 bg-slate-950 px-3 py-2">
                    <input
                      type="checkbox"
                      className="mt-[2px] h-3 w-3 accent-blue-600"
                      checked={allAgree}
                      onChange={(e) => setAllAgree(e.target.checked)}
                    />
                    <div className="text-[11px] leading-relaxed text-slate-300">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        總體確認
                      </div>
                      <p>「我已閱讀並同意以上所有條款。」</p>
                    </div>
                  </label>
                </div>

                <div className="mt-4 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
                  香港消費者委員會投訴熱線：2929 2222
                </div>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="flex flex-col gap-4">
              <div className="border border-slate-700 bg-slate-900 px-4 py-3">
                <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">
                  Step 3 · 付款與訂金託管
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* 左欄：訂單摘要 */}
                  <div className="border border-slate-800 bg-slate-950 px-3 py-3">
                    <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">
                      訂單摘要
                    </div>
                    <div className="text-[12px] font-semibold text-white">
                      {product.brand} · {product.name}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      尺寸：{product.size} · 數量：4 條
                    </div>
                    <div className="mt-2 border-t border-slate-800 pt-2 text-[10px] text-slate-400">
                      安裝日期：{" "}
                      <span className="font-mono text-slate-200">
                        {installDate || earliestDate}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      安裝地區：{" "}
                      <span className="font-mono text-slate-200">
                        {installRegion || "九龍"}
                      </span>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400">
                      付款方式：
                    </div>
                    <div className="font-mono text-[11px] text-slate-200">
                      {payMode === "deposit"
                        ? `定金 HK$ ${mainPayAmount.toLocaleString(
                            "en-US",
                          )}（30%） · 尾款 HK$ ${remainingAmount.toLocaleString(
                            "en-US",
                          )}`
                        : `全額 HK$ ${mainPayAmount.toLocaleString(
                            "en-US",
                          )} · 無尾款`}
                    </div>
                  </div>

                  {/* 右欄：付款方式選擇 */}
                  <div className="border border-slate-800 bg-slate-950 px-3 py-3">
                    <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">
                      付款方式
                    </div>
                    <div className="flex flex-col gap-2">
                      {[
                        { key: "fps" as const, label: "FPS 轉數快" },
                        { key: "payme" as const, label: "PayMe" },
                        { key: "card" as const, label: "信用卡（Stripe）" },
                      ].map((method) => {
                        const selected = paymentMethod === method.key
                        return (
                          <button
                            key={method.key}
                            type="button"
                            onClick={() => setPaymentMethod(method.key)}
                            className={`flex flex-col border px-3 py-2 text-left text-[11px] transition-colors ${
                              selected
                                ? "border-blue-500 bg-slate-800"
                                : "border-slate-700 bg-slate-900 hover:border-slate-500"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-100">
                                {method.label}
                              </span>
                              {selected && (
                                <span className="flex items-center gap-1 text-[9px] text-emerald-400">
                                  <span className="h-1.5 w-1.5 bg-emerald-400" />
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="mt-2 h-20 border border-dashed border-slate-700 bg-slate-950 px-3 py-2 text-[10px] text-slate-500">
                              {method.key === "fps" &&
                                "此處顯示 FPS 轉數快收款 QR Code 與戶口號碼（示意）。"}
                              {method.key === "payme" &&
                                "此處顯示 PayMe 付款 QR Code（示意）。"}
                              {method.key === "card" &&
                                "此處可嵌入 Stripe Elements Card Element 以處理信用卡付款（示意）。"}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>

        {/* Footer / Controls */}
        <footer className="border-t border-slate-800 bg-slate-950 px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                if (step === 1) {
                  requestClose()
                } else {
                  setStep((prev) => (prev === 1 ? 1 : ((prev - 1) as 1 | 2 | 3)))
                }
              }}
              className="border border-slate-700 bg-slate-900 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300 hover:border-slate-500"
            >
              返回
            </button>

            {step === 1 && (
              <button
                type="button"
                onClick={handleStep1Next}
                className="border border-blue-600 bg-blue-600 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white hover:bg-blue-500"
              >
                下一步 →
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                onClick={handleStep2Next}
                className={`border px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                  allTermsChecked
                    ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-500"
                    : "border-slate-700 bg-slate-900 text-slate-500 opacity-30 pointer-events-none"
                }`}
              >
                確認條款，前往付款 →
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={isSubmitting}
                className="border border-blue-600 bg-blue-600 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {isSubmitting ? "處理中…" : "確認付款"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
