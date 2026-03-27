/**
 * 客戶端 PDF 生成工具，負責產出單頁 A4 電子訂單憑證。
 */

/**
 * 使用 UMD 版本 jsPDF，避免對可選依賴 canvg 的打包解析需求。
 */
// @ts-ignore 使用 UMD bundle 無類型資訊
import jsPDF from "jspdf/dist/jspdf.umd.min.js"

/**
 * 訂單紀錄資料結構，供 PDF 生成與確認畫面共用。
 */
export interface OrderRecord {
  /** 訂單號，格式：TT-YYYYMMDD-XXXX */
  orderId: string
  /** 品牌名稱 */
  brand: string
  /** 型號名稱 */
  model: string
  /** 尺寸資訊，例如 255/40R19 100Y */
  size: string
  /** 數量，固定為 4 條 */
  qty: number
  /** 單價（以 HK$ 為單位，不含貨幣符號） */
  unitPrice: number
  /** 總價（qty * unitPrice） */
  totalPrice: number
  /** 已支付金額（定金或全額） */
  depositPaid: number
  /** 尚未支付尾款 */
  remaining: number
  /** 安裝日期，格式：YYYY-MM-DD */
  installDate: string
  /** 安裝地區，例如 九龍 / 新界 / 港島 */
  installRegion: string
  /** 已遮罩的電話（只保留末 4 位） */
  phone: string
  /** 訂單建立時間（ISO 格式） */
  createdAt: string
}

/**
 * 根據給定的訂單資料，在瀏覽器端生成單頁 A4 PDF 並觸發下載。
 *
 * @param order - 完整訂單紀錄
 */
export function generateOrderPDF(order: OrderRecord): void {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let cursorY = 10

  // ─── Header Bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42) // 深藍 / 深石板色
  doc.rect(0, 0, pageWidth, 18, "F")

  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text("呔直達 · 電子訂單憑證", 10, 11)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("此憑證具有法律效力，請妥善保存", 10, 16)

  // 恢復文字顏色
  doc.setTextColor(15, 23, 42)
  cursorY = 26

  // ─── 訂單號與時間 ────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text(`訂單號：${order.orderId}`, 10, cursorY)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  const createdAt = new Date(order.createdAt)
  const createdAtStr = `${createdAt.getFullYear()}-${String(
    createdAt.getMonth() + 1,
  ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")} ${String(
    createdAt.getHours(),
  ).padStart(2, "0")}:${String(createdAt.getMinutes()).padStart(2, "0")}`
  doc.text(`生成時間：${createdAtStr}`, 10, cursorY + 7)

  // 分隔線
  cursorY += 14
  doc.setDrawColor(148, 163, 184) // #94a3b8
  doc.line(10, cursorY, pageWidth - 10, cursorY)
  cursorY += 6

  // ─── 產品規格表格 ────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("產品規格", 10, cursorY)
  cursorY += 6

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)

  const specRows: Array<{ label: string; value: string }> = [
    { label: "品牌 Brand", value: order.brand },
    { label: "型號 Model", value: order.model },
    { label: "尺寸 Size", value: order.size },
    { label: "數量 Qty", value: `${order.qty} 條` },
    {
      label: "安裝日期 Install Date",
      value: order.installDate,
    },
    {
      label: "安裝地區 Region",
      value: order.installRegion,
    },
    {
      label: "聯絡電話 Phone",
      value: order.phone,
    },
  ]

  specRows.forEach((row) => {
    doc.setFont("helvetica", "bold")
    doc.text(row.label, 10, cursorY)
    doc.setFont("helvetica", "normal")
    doc.text(row.value, pageWidth / 2, cursorY)
    cursorY += 6
  })

  // 分隔線
  cursorY += 2
  doc.line(10, cursorY, pageWidth - 10, cursorY)
  cursorY += 6

  // ─── 付款詳情表格 ────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("付款詳情 Payment Details", 10, cursorY)
  cursorY += 6

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)

  const formatMoney = (value: number): string =>
    `HK$ ${value.toLocaleString("en-US")}`

  const paymentRows: Array<{ label: string; value: string }> = [
    {
      label: "單價 Unit Price",
      value: formatMoney(order.unitPrice),
    },
    {
      label: "總價 Total",
      value: formatMoney(order.totalPrice),
    },
    {
      label: "已付金額 Paid",
      value: formatMoney(order.depositPaid),
    },
    {
      label: "尾款 Remaining",
      value: formatMoney(order.remaining),
    },
  ]

  paymentRows.forEach((row) => {
    doc.setFont("helvetica", "bold")
    doc.text(row.label, 10, cursorY)
    doc.setFont("helvetica", "normal")
    doc.text(row.value, pageWidth / 2, cursorY)
    cursorY += 6
  })

  // 分隔線
  cursorY += 2
  doc.line(10, cursorY, pageWidth - 10, cursorY)
  cursorY += 6

  // ─── 契約條款摘要 ────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("雙向信任契約摘要", 10, cursorY)
  cursorY += 6

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  const terms = [
    "服務商承諾：訂金將托管於獨立帳戶，如 48 小時內未能確認備貨，訂金全額退回。",
    "客戶承諾：訂單確認後如單方面取消，訂金（總額 30%）將作為備貨成本補償，不予退還。",
    "品質保障：安裝完成前須輸入 6 位驗收碼確認收貨，如規格不符，訂金全退並補償 HK$200。",
  ]

  terms.forEach((text) => {
    const split = doc.splitTextToSize(text, pageWidth - 20)
    doc.text(split, 10, cursorY)
    cursorY += split.length * 5
  })

  // ─── Footer ──────────────────────────────────────────────────────────────────
  const footerY = 285
  doc.setDrawColor(148, 163, 184)
  doc.line(10, footerY - 5, pageWidth - 10, footerY - 5)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(
    "香港消費者委員會投訴熱線：2929 2222 · 若對條款或服務有任何疑問，請先聯絡呔直達客服。",
    10,
    footerY,
  )
  doc.text(
    "WhatsApp 客服：+852 XXXXXXXX（請於訊息中附上訂單號）。",
    10,
    footerY + 4,
  )

  // 觸發下載
  const filename = `TT-${order.orderId}.pdf`
  doc.save(filename)
}
