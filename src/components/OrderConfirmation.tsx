/**
 * OrderConfirmation 覆層組件：顯示付款成功與訂單確認資訊。
 * 採用深色終端風格，提供 PDF 下載與 WhatsApp 聯絡入口。
 */

import { useEffect } from "react"
import { generateOrderPDF, type OrderRecord } from "../lib/generateOrderPDF"

/**
 * OrderConfirmation 組件屬性介面。
 */
interface OrderConfirmationProps {
  /** 已完成的訂單紀錄 */
  order: OrderRecord
  /** 關閉確認覆層時觸發 */
  onClose: () => void
}

/**
 * 付款成功確認畫面，顯示訂單號、摘要與後續操作。
 *
 * @param props - 組件屬性
 */
export default function OrderConfirmation({
  order,
  onClose,
}: OrderConfirmationProps) {
  const [isDownloading, setIsDownloading] = React.useState(false)

  /**
   * 處理 ESC 關閉。
   */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  /**
   * 觸發 PDF 下載，包含簡單 loading 狀態。
   */
  function handleDownloadPDF() {
    if (isDownloading) return
    setIsDownloading(true)
    setTimeout(() => {
      generateOrderPDF(order)
      setIsDownloading(false)
    }, 1000)
  }

  const waUrl = `https://wa.me/852XXXXXXXX?text=${encodeURIComponent(
    `訂單號：${order.orderId}`,
  )}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 text-white backdrop-blur-sm">
      <div className="w-full max-w-xl border border-slate-800 bg-slate-950 px-6 py-5">
        {/* Header */}
        <div className="flex flex-col items-center border-b border-slate-800 pb-4">
          <div className="mb-2 flex h-10 w-10 items-center justify-center border border-emerald-500 bg-slate-950 text-emerald-400">
            <svg
              className="h-5 w-5"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M3 8.5 6.5 12 13 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
            Order Confirmed
          </div>
          <div className="mt-1 font-mono text-[13px] text-slate-100">
            訂單號：{order.orderId}
          </div>
        </div>

        {/* Order Detail Card */}
        <div className="mt-4 border border-slate-800 bg-slate-900 px-4 py-3">
          <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">
            訂單詳情
          </div>
          <div className="text-[12px] font-semibold text-white">
            {order.brand} · {order.model}
          </div>
          <div className="text-[11px] text-slate-400">
            尺寸：{order.size} · 數量：{order.qty} 條
          </div>

          <div className="mt-2 border-t border-slate-800 pt-2 text-[10px] text-slate-400">
            安裝日期：{" "}
            <span className="font-mono text-slate-200">
              {order.installDate}
            </span>
          </div>
          <div className="text-[10px] text-slate-400">
            安裝地區：{" "}
            <span className="font-mono text-slate-200">
              {order.installRegion}
            </span>
          </div>

          <div className="mt-2 border-t border-slate-800 pt-2 text-[10px] text-slate-400">
            已付金額：{" "}
            <span className="font-mono text-slate-100">
              HK$ {order.depositPaid.toLocaleString("en-US")}
            </span>
          </div>
          <div className="text-[10px] text-slate-400">
            尾款金額：{" "}
            <span className="font-mono text-slate-100">
              HK$ {order.remaining.toLocaleString("en-US")}
            </span>
          </div>

          <div className="mt-3 border-t border-slate-800 pt-2 text-[10px] text-slate-400">
            驗收碼說明：
            <span className="block text-[10px] text-slate-300">
              「安裝完成時，師傅會要求您輸入驗收碼以確認收貨，
              尾款將於此時自動結算。若輪胎規格與訂單不符，訂金全退並補償
              HK$200。」
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-col gap-2 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="flex-1 border border-blue-600 bg-blue-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white hover:bg-blue-500 disabled:opacity-40"
              disabled={isDownloading}
            >
              {isDownloading ? "生成中…" : "下載訂單 PDF"}
            </button>
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 border border-slate-700 bg-slate-900 px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 hover:border-slate-500"
            >
              WhatsApp 客服
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 border border-slate-700 bg-slate-900 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200 hover:border-slate-500 sm:mt-0 sm:flex-none"
          >
            返回主頁
          </button>
        </div>
      </div>
    </div>
  )
}
