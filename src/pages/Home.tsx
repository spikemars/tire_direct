/**
 * Home 頁面：工程級輪胎選配系統主介面。
 * 包含產品矩陣、篩選器、右側即時報價面板與落單流程覆層入口。
 */

import { useEffect, useRef, useState } from "react";
import OrderFlow from "../components/OrderFlow";
import OrderConfirmation from "../components/OrderConfirmation";
import type { OrderRecord } from "../lib/generateOrderPDF";

/**
 * 單一輪胎產品資料結構。
 */
interface TyreProduct {
  id: number;
  badge: string;
  badgeTone: "ev" | "performance";
  brand: string;
  name: string;
  size: string;
  originLabel: string;
  location: string;
  year: string;
  tags: string[];
  oldPrice: string;
  price: string;
  euGrades: { dry: string; wet: string; noise: string };
}

/**
 * 模擬後端返回的產品清單。
 */
const PRODUCTS: TyreProduct[] = [
  {
    id: 1,
    badge: "EV 專用",
    badgeTone: "ev",
    brand: "Continental",
    name: "ULTRACONTACT UC7 EV",
    size: "255/40R19 100Y",
    originLabel: "歐盟認證 · 低滾動阻力",
    location: "中國",
    year: "2025",
    tags: ["EV 平台認證", "低噪音", "長里程"],
    oldPrice: "HK$ 1,480",
    price: "HK$ 1,280",
    euGrades: { dry: "A", wet: "A", noise: "68dB" },
  },
  {
    id: 2,
    badge: "高性能",
    badgeTone: "performance",
    brand: "Michelin",
    name: "PILOT SPORT 5",
    size: "235/35R19 91Y",
    originLabel: "歐盟認證 · 高性能街道",
    location: "西班牙",
    year: "2024",
    tags: ["高抓地", "濕地強化", "靈敏轉向"],
    oldPrice: "HK$ 1,980",
    price: "HK$ 1,690",
    euGrades: { dry: "A", wet: "B", noise: "71dB" },
  },
  {
    id: 3,
    badge: "EV 專用",
    badgeTone: "ev",
    brand: "Prinx",
    name: "XLAB ECO-EV",
    size: "225/45R18 95W",
    originLabel: "2025 新胎 · 高性價比",
    location: "中國",
    year: "2025",
    tags: ["EV 專用", "靜音強化", "節能配方"],
    oldPrice: "HK$ 980",
    price: "HK$ 820",
    euGrades: { dry: "B", wet: "A", noise: "69dB" },
  },
];

/**
 * 規格格子：顯示單一 label / value。
 */
function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
        {label}
      </span>
      <span className="text-[13px] font-medium text-slate-900">
        {value}
      </span>
    </div>
  );
}

/**
 * 單一產品卡片（全新結構版本）。
 * 結構：
 * - 上端 3px 色條
 * - Header：名稱 + EU Rating Badge
 * - Divider
 * - 規格 2 欄 Grid
 * - Divider
 * - 價格區（最強視覺）
 * - Divider
 * - 動作列
 */
function ProductCard({
  product,
  isSelected,
  onSelect,
}: {
  product: TyreProduct;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isEV = product.badgeTone === "ev";

  const borderClasses = isSelected
    ? "border-2 border-blue-600 bg-[#eff6ff]"
    : "border border-gray-300 bg-white hover:border-gray-400";

  const checkIcon = isSelected ? (
    <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center border border-blue-600 bg-blue-600 text-white">
      <svg
        className="h-3 w-3"
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
  ) : null;

  const specItems: Array<{ label: string; value: string }> = [
    { label: "SIZE", value: product.size },
    { label: "TYPE", value: product.badge },
    { label: "BATCH", value: `${product.location} · ${product.year}` },
    { label: "NOTE", value: product.originLabel },
  ];

  return (
    <div
      className={`relative flex cursor-pointer flex-col select-none transition-colors ${borderClasses}`}
      onClick={onSelect}
    >
      {/* TOP STRIP 3px */}
      <div
        className={`h-[3px] w-full ${
          isEV ? "bg-blue-500" : "bg-orange-500"
        }`}
      />

      {checkIcon}

      {/* CARD BODY (16px padding) */}
      <div className="flex flex-col gap-3 p-4">
        {/* HEADER ROW */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
              {product.brand}
            </span>
            <h3 className="text-[16px] font-bold leading-snug text-slate-900">
              {product.name}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] uppercase tracking-[0.18em] text-gray-400">
              EU Rating
            </span>
            <span className="inline-flex border border-gray-300 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              Dry {product.euGrades.dry} · Wet {product.euGrades.wet} ·{" "}
              {product.euGrades.noise}
            </span>
          </div>
        </div>

        {/* DIVIDER */}
        <div className="border-t border-gray-200" />

        {/* SPEC GRID 2 COLS */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {specItems.map((item) => (
            <SpecCell key={item.label} label={item.label} value={item.value} />
          ))}
        </div>

        {/* DIVIDER */}
        <div className="border-t border-gray-200" />

        {/* PRICE BLOCK */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.18em] text-gray-400">
            Price · Per Tyre
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-[22px] font-extrabold leading-none text-slate-950">
              {product.price}
            </span>
            <span className="text-[11px] text-gray-500">/ 條</span>
          </div>
          <div className="text-[11px] text-gray-500">
            已含基本安裝與標準動平衡 · 原價{" "}
            <span className="line-through">{product.oldPrice}</span>
          </div>
        </div>

        {/* DIVIDER */}
        <div className="border-t border-gray-200" />

        {/* ACTION ROW */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-gray-400">
              Selection
            </span>
            <span className="text-[11px] text-gray-600">
              右側即時計算 4 條總價與定金 / 全額方案
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] ${
              isSelected
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-500 bg-white text-slate-900 hover:border-slate-900 hover:bg-slate-900 hover:text-white"
            }`}
          >
            {isSelected ? "✓ 已選定" : "選擇此方案"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 左側篩選條中小型 toggle 按鈕。
 */
function FilterToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all
        ${
          active
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-gray-300 bg-white text-gray-600 hover:border-gray-500 hover:text-slate-900"
        }`}
    >
      {active && <span className="h-1.5 w-1.5 bg-white" />}
      {label}
    </button>
  );
}

/**
 * 右側報價面板：根據選中產品與付款模式實時計算金額。
 */
function PricingPanel({
  product,
  payMode,
  setPayMode,
  onOrderClick,
}: {
  product: TyreProduct | null;
  payMode: "deposit" | "full";
  setPayMode: (m: "deposit" | "full") => void;
  onOrderClick: () => void;
}) {
  const basePrice = product ? parseInt(product.price.replace(/[^0-9]/g, "")) : 0;
  const totalFull = basePrice * 4;
  const deposit = Math.round(totalFull * 0.3);
  const remaining = totalFull - deposit;
  const isLive = product !== null;

  return (
    <aside className="flex flex-col border border-slate-700 bg-slate-900">
      {/* PANEL HEADER */}
      <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-950 px-4 py-3">
        <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-blue-400">
          Pricing Output
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {isLive ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse bg-blue-500" />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-blue-400">
                LIVE
              </span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 bg-slate-600" />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                IDLE
              </span>
            </>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-0 p-4">
        {!product ? (
          // IDLE Skeleton
          <div className="flex flex-col gap-3">
            <div className="border border-slate-600 bg-slate-800 p-3">
              <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">
                Selected Unit
              </div>
              <div className="mb-1.5 h-3 w-3/4 bg-slate-600" />
              <div className="mb-1.5 h-2.5 w-1/2 bg-slate-600" />
              <div className="h-2 w-1/3 bg-slate-700" />
            </div>

            <div className="border border-slate-600 bg-slate-800 p-3">
              <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">
                Payment Mode
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-12 border border-slate-600 bg-slate-700" />
                <div className="h-12 border border-slate-600 bg-slate-700" />
              </div>
            </div>

            <div className="border border-slate-600 bg-slate-800 p-3">
              <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">
                Breakdown
              </div>
              {["w-full", "w-3/4", "w-2/3"].map((w, i) => (
                <div
                  key={i}
                  className={`mb-2 h-2.5 bg-slate-600 last:mb-0 ${w}`}
                />
              ))}
            </div>

            <div className="border border-dashed border-slate-500 bg-slate-800 p-3">
              <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-slate-500">
                Total
              </div>
              <div className="h-8 w-2/3 bg-slate-600" />
            </div>

            <div className="mt-1 text-center text-[9px] uppercase tracking-[0.2em] text-slate-600">
              — 請先選擇輪胎方案 —
            </div>
          </div>
        ) : (
          <>
            {/* SELECTED PRODUCT SUMMARY */}
            <div className="border-l-[3px] border-blue-500 bg-slate-800 px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">
                Selected Unit
              </div>
              <div className="mt-0.5 text-[12px] font-bold text-white">
                {product.brand}
              </div>
              <div className="text-[10px] text-slate-400">{product.name}</div>
              <div className="mt-1 text-[9px] text-slate-500">
                {product.size} · ×4 條
              </div>
            </div>

            <div className="my-3 border-t border-slate-700" />

            {/* PAYMENT MODE */}
            <div className="mb-2 text-[9px] uppercase tracking-[0.18em] text-slate-500">
              Payment Mode
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "deposit" as const, label: "定金方案", sub: "30% 預付" },
                { key: "full" as const, label: "全額方案", sub: "一次付清" },
              ].map(({ key, label, sub }) => (
                <button
                  key={key}
                  onClick={() => setPayMode(key)}
                  type="button"
                  className={`flex flex-col items-start border px-3 py-3 text-left text-[11px] transition-all
                    ${
                      payMode === key
                        ? "border-blue-500 bg-slate-800"
                        : "border-slate-700 bg-slate-950 hover:border-slate-500"
                    }`}
                >
                  {payMode === key && (
                    <span className="mb-1 text-[8px] font-bold uppercase tracking-wider text-blue-400">
                      ✓ ACTIVE
                    </span>
                  )}
                  <span
                    className={`font-bold ${
                      payMode === key ? "text-blue-300" : "text-slate-300"
                    }`}
                  >
                    {label}
                  </span>
                  <span className="text-[9px] text-slate-500">{sub}</span>
                </button>
              ))}
            </div>

            <div className="my-3 border-t border-slate-700" />

            {/* BREAKDOWN */}
            <div className="mb-2 text-[9px] uppercase tracking-[0.18em] text-slate-500">
              Breakdown
            </div>
            <div className="flex flex-col gap-2">
              {[
                { label: "單價", value: product.price },
                { label: "數量", value: "×4 條" },
                { label: "安裝費", value: "已包含" },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-slate-800 pb-2 last:border-b-0"
                >
                  <span className="text-[10px] text-slate-500">{label}</span>
                  <span className="text-[11px] font-semibold text-slate-200">
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div className="my-3 border-t border-slate-600" />

            {/* TOTAL */}
            {payMode === "full" ? (
              <div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">
                  Total
                </div>
                <div className="mt-1 text-[32px] font-black leading-none text-white">
                  HK$ {totalFull.toLocaleString()}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  全額一次付清 · 含安裝
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">
                    定金 (30%)
                  </div>
                  <div className="mt-1 text-[32px] font-black leading-none text-blue-400">
                    HK$ {deposit.toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center justify-between border border-dashed border-slate-700 bg-slate-950 px-2 py-2">
                  <span className="text-[10px] text-slate-500">
                    安裝當日尾款
                  </span>
                  <span className="text-[12px] font-bold text-slate-300">
                    HK$ {remaining.toLocaleString()}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">
                  總計 HK$ {totalFull.toLocaleString()}
                </div>
              </div>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={onOrderClick}
                className="w-full bg-blue-600 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-blue-500"
              >
                WhatsApp 確認落單 →
              </button>
              <div className="mt-1.5 text-center text-[9px] text-slate-600">
                即時回覆 · 3 個工作日上門安裝
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * 左側 Control Panel：示意優先級 / 品牌 / 尺寸篩選。
 */
function FiltersPanel({
  activePreset,
  setActivePreset,
}: {
  activePreset: string;
  setActivePreset: (p: string) => void;
}) {
  const presets = ["EV 優先", "靜音優先", "濕地 A 級", "價格優先"];
  const brands = ["Michelin", "Continental", "Prinx", "Pirelli"];
  const widths = ["225", "235", "245", "255", "265"];

  return (
    <aside className="flex flex-col gap-0 border border-gray-300 bg-white text-[11px]">
      <div className="flex items-center gap-2 border-b border-gray-300 bg-gray-50 px-3 py-2.5">
        <span className="h-1.5 w-1.5 bg-blue-600" />
        <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">
          Control Panel
        </span>
      </div>

      <div className="border-b border-gray-200 p-3">
        <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-gray-400">
          Priority Preset
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {presets.map((p) => (
            <FilterToggle
              key={p}
              label={p}
              active={activePreset === p}
              onClick={() => setActivePreset(p)}
            />
          ))}
        </div>
      </div>

      <div className="border-b border-gray-200 p-3">
        <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-gray-400">
          Brand Filter
        </div>
        <div className="flex flex-col gap-1">
          {brands.map((b) => (
            <label
              key={b}
              className="flex cursor-pointer items-center justify-between border border-transparent px-1 py-1 hover:border-gray-200 hover:bg-gray-50"
            >
              <span className="flex items-center gap-2">
                <input type="checkbox" className="h-3 w-3 accent-blue-600" />
                <span className="text-[11px] text-slate-800">{b}</span>
              </span>
              <span className="text-[9px] text-gray-400">
                {b === "Prinx" ? "Value" : "Premium"}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="p-3">
        <div className="mb-2 text-[9px] uppercase tracking-[0.2em] text-gray-400">
          Width (mm)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {widths.map((w) => (
            <button
              key={w}
              type="button"
              className="border border-gray-300 px-2.5 py-1 text-[10px] font-medium text-gray-600 transition-colors hover:border-blue-600 hover:bg-blue-50 hover:text-blue-700"
            >
              {w}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

/**
 * 頁面頂部 Hero：尺寸輸入 + 系統狀態 + 基本 KPI。
 */
function Hero({ onSearch }: { onSearch: () => void }) {
  return (
    <header className="border border-gray-300 bg-white">
      {/* TOP STATUS BAR */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-slate-900 px-4 py-1.5">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 bg-emerald-400" />
          <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-gray-400">
            System Online
          </span>
        </span>
        <span className="ml-auto font-mono text-[9px] text-gray-600">
          Console v1.3 · HK
        </span>
      </div>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_auto]">
        {/* LEFT: TITLE & SEARCH */}
        <div className="border-r border-gray-200 p-5">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.3em] text-gray-400">
            Industrial Tyre Selection System
          </div>
          <h1 className="text-[28px] font-black leading-tight tracking-tight text-slate-950 md:text-[34px]">
            呔直達
            <span className="ml-2 text-blue-600">·</span>
            <br />
            <span className="text-[22px] font-bold text-slate-700">
              工程級輪胎選配系統
            </span>
          </h1>
          <p className="mt-2 max-w-lg text-[11px] leading-relaxed text-gray-500">
            根據車呔尺寸、自選性能優先級及生產年份，輸出經工程師審核的輪胎方案矩陣。
            所有數據按批次同步，優先顯示最新 EU 標籤與噪音數據。
          </p>

          {/* SEARCH BAR */}
          <div className="mt-4 flex items-stretch gap-0">
            <div className="flex items-center border border-r-0 border-gray-400 bg-gray-50 px-3">
              <span className="whitespace-nowrap text-[9px] uppercase tracking-[0.15em] text-gray-500">
                Tyre Size
              </span>
            </div>
            <input
              type="text"
              placeholder="255/40R19"
              className="flex-1 border border-gray-400 bg-white px-3 py-2 text-[13px] font-mono text-slate-900 outline-none placeholder-gray-400 focus:border-blue-600"
            />
            <button
              type="button"
              onClick={onSearch}
              className="bg-blue-600 px-5 py-2 text-[11px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-blue-700"
            >
              搜尋
            </button>
          </div>
        </div>

        {/* RIGHT: STATS */}
        <div className="grid grid-cols-3 lg:w-44 lg:grid-cols-1">
          {[
            { label: "Delivery", value: "3 Days", sub: "最快上門安裝" },
            { label: "In Stock", value: "24+", sub: "適配方案在庫" },
            { label: "Coverage", value: "全港", sub: "免費上門服務" },
          ].map(({ label, value, sub }, i) => (
            <div
              key={label}
              className={`flex flex-col justify-center px-4 py-4 ${
                i < 2 ? "border-b border-gray-200" : ""
              }`}
            >
              <div className="text-[9px] uppercase tracking-[0.2em] text-gray-400">
                {label}
              </div>
              <div className="mt-1 text-[22px] font-black leading-none text-slate-950">
                {value}
              </div>
              <div className="mt-0.5 text-[9px] text-gray-500">{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

/**
 * Home 主組件：組合 Hero、Filters、產品矩陣與 Pricing Panel，並掛載落單流程覆層。
 */
export default function Home() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [payMode, setPayMode] = useState<"deposit" | "full">("deposit");
  const [activePreset, setActivePreset] = useState("EV 優先");
  const [showOrderFlow, setShowOrderFlow] = useState(false);
  const [orderRecord, setOrderRecord] = useState<OrderRecord | null>(null);
  const listingRef = useRef<HTMLDivElement>(null);

  // 引入 Font Awesome（部分 snippet 可能使用）
  useEffect(() => {
    const existing = document.getElementById("fa-cdn");
    if (existing) return;
    const link = document.createElement("link");
    link.id = "fa-cdn";
    link.rel = "stylesheet";
    link.href =
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }, []);

  const selectedProduct = PRODUCTS.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 antialiased">
      <div className="mx-auto max-w-7xl px-3 py-4 lg:px-4">
        {/* HERO */}
        <Hero
          onSearch={() =>
            listingRef.current?.scrollIntoView({ behavior: "smooth" })
          }
        />

        {/* MAIN 3-COL GRID */}
        <div
          ref={listingRef}
          className="mt-3 grid gap-3 lg:grid-cols-[200px_1fr_220px]"
          style={{ gap: "12px" }}
        >
          {/* FILTERS */}
          <FiltersPanel
            activePreset={activePreset}
            setActivePreset={setActivePreset}
          />

          {/* PRODUCT LISTING */}
          <section className="flex flex-col border border-gray-300 bg-white">
            {/* LISTING HEADER */}
            <div className="flex items-center justify-between border-b border-gray-300 bg-gray-50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">
                  Result Matrix
                </span>
                <span className="h-px w-8 bg-gray-300" />
                <span className="text-[11px] font-semibold text-slate-800">
                  {PRODUCTS.length} 套方案
                </span>
              </div>
              <div className="flex items-center gap-1.5 border border-gray-300 bg-white px-2 py-1">
                <select className="bg-transparent text-[10px] text-slate-800 outline-none">
                  <option>綜合建議</option>
                  <option>價格 · 低→高</option>
                  <option>噪音 · 低→高</option>
                </select>
              </div>
            </div>

            {/* CARDS GRID */}
            <div
              className="grid flex-1 grid-cols-1 gap-0 p-0 md:grid-cols-3"
              style={{ gap: "1px", background: "#1e293b" }}
            >
              {PRODUCTS.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  isSelected={p.id === selectedId}
                  onSelect={() =>
                    setSelectedId(p.id === selectedId ? null : p.id)
                  }
                />
              ))}
            </div>

            {/* FOOTER NOTE */}
            <div className="border-t border-gray-200 px-4 py-2 text-[9px] text-gray-400">
              所有報價已含基本安裝及動平衡 · 數據按最新批次同步 · 如有疑問請
              WhatsApp 查詢
            </div>
          </section>

          {/* PRICING PANEL */}
          <PricingPanel
            product={selectedProduct}
            payMode={payMode}
            setPayMode={setPayMode}
            onOrderClick={() => setShowOrderFlow(true)}
          />
        </div>

        {/* ORDER FLOW OVERLAY */}
        {showOrderFlow && selectedProduct && (
          <OrderFlow
            product={{
              brand: selectedProduct.brand,
              name: selectedProduct.name,
              size: selectedProduct.size,
              price: selectedProduct.price,
            }}
            payMode={payMode}
            onClose={() => setShowOrderFlow(false)}
            onComplete={(record) => {
              setOrderRecord(record);
              setShowOrderFlow(false);
            }}
          />
        )}

        {/* ORDER CONFIRMATION OVERLAY */}
        {orderRecord && (
          <OrderConfirmation
            order={orderRecord}
            onClose={() => setOrderRecord(null)}
          />
        )}
      </div>
    </div>
  );
}
