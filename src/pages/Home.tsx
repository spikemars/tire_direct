import { useEffect, useRef, useState } from "react";
import OrderFlow from "../components/OrderFlow";
import OrderConfirmation from "../components/OrderConfirmation";
import type { OrderRecord } from "../lib/generateOrderPDF";

/**
 * Cloudflare Worker API base。
 * Home 頁面直接從後端商品目錄讀取資料，避免前端自行拼接 SKU。
 */
const API_BASE = "https://tire-direct-api.paxjustice.workers.dev";

/**
 * 後端 /api/products 返回的單一商品結構。
 */
interface CatalogApiProduct {
  sku: string;
  brand: string;
  model: string;
  specification: string;
  unitPrice: number; // cents HKD
}

interface ProductsApiResponse {
  success: boolean;
  data?: {
    products: CatalogApiProduct[];
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 前端頁面使用的輪胎產品資料結構。
 * 注意：sku 必須直接來自後端，不能由前端推導。
 */
interface TyreProduct {
  sku: string;
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

function centsToDisplay(cents: number): string {
  return `HK$ ${(cents / 100).toLocaleString("en-US")}`;
}

function buildOldPrice(cents: number): string {
  return centsToDisplay(Math.round(cents * 1.15));
}

function inferBadgeTone(product: CatalogApiProduct): "ev" | "performance" {
  const text = `${product.model} ${product.specification}`.toUpperCase();
  return text.includes("EV") ? "ev" : "performance";
}

function inferBadge(product: CatalogApiProduct): string {
  return inferBadgeTone(product) === "ev" ? "EV 專用" : "高性能";
}

function inferTags(product: CatalogApiProduct): string[] {
  return inferBadgeTone(product) === "ev"
    ? ["EV 平台認證", "低噪音", "長里程"]
    : ["高抓地", "濕地表現", "即時同步"];
}

function inferEuGrades(product: CatalogApiProduct): {
  dry: string;
  wet: string;
  noise: string;
} {
  const tone = inferBadgeTone(product);
  return tone === "ev"
    ? { dry: "B", wet: "A", noise: "69dB" }
    : { dry: "A", wet: "B", noise: "71dB" };
}

function toTyreProduct(product: CatalogApiProduct): TyreProduct {
  return {
    sku: product.sku,
    badge: inferBadge(product),
    badgeTone: inferBadgeTone(product),
    brand: product.brand,
    name: product.model,
    size: product.specification,
    originLabel: "後端目錄同步",
    location: "Catalog",
    year: "最新",
    tags: inferTags(product),
    oldPrice: buildOldPrice(product.unitPrice),
    price: centsToDisplay(product.unitPrice),
    euGrades: inferEuGrades(product),
  };
}

async function fetchProducts(): Promise<TyreProduct[]> {
  const res = await fetch(`${API_BASE}/api/products`);
  const json = (await res.json()) as ProductsApiResponse;

  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error?.message ?? `載入商品失敗 (${res.status})`);
  }

  return json.data.products.map(toTyreProduct);
}

/**
 * 規格格子：顯示單一 label / value。
 */
function SpecCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
        {label}
      </span>
      <span className="text-[13px] font-medium text-slate-900">{value}</span>
    </div>
  );
}

/**
 * 單一產品卡片。
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
        <path d="M3 8.5 6.5 12 13 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  ) : null;

  const specItems: Array<{ label: string; value: string }> = [
    { label: "SKU", value: product.sku },
    { label: "SIZE", value: product.size },
    { label: "TYPE", value: product.badge },
    { label: "SOURCE", value: product.originLabel },
  ];

  return (
    <div
      className={`relative flex cursor-pointer flex-col select-none transition-colors ${borderClasses}`}
      onClick={onSelect}
    >
      <div className={`h-[3px] w-full ${isEV ? "bg-blue-500" : "bg-orange-500"}`} />

      {checkIcon}

      <div className="flex flex-col gap-3 p-4">
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
              Dry {product.euGrades.dry} · Wet {product.euGrades.wet} · {product.euGrades.noise}
            </span>
          </div>
        </div>

        <div className="border-t border-gray-200" />

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {specItems.map((item) => (
            <SpecCell key={item.label} label={item.label} value={item.value} />
          ))}
        </div>

        <div className="border-t border-gray-200" />

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
            已含基本安裝與標準動平衡 · 原價 <span className="line-through">{product.oldPrice}</span>
          </div>
        </div>

        <div className="border-t border-gray-200" />

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-gray-400">
              Selection
            </span>
            <span className="text-[11px] text-gray-600">右側即時計算 4 條總價與定金 / 全額方案</span>
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
                <div key={i} className={`mb-2 h-2.5 bg-slate-600 last:mb-0 ${w}`} />
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
            <div className="border-l-[3px] border-blue-500 bg-slate-800 px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">
                Selected Unit
              </div>
              <div className="mt-0.5 text-[12px] font-bold text-white">{product.brand}</div>
              <div className="text-[10px] text-slate-400">{product.name}</div>
              <div className="mt-1 text-[9px] text-slate-500">{product.size} · ×4 條</div>
              <div className="mt-1 text-[9px] text-slate-500">SKU · {product.sku}</div>
            </div>

            <div className="my-3 border-t border-slate-700" />

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
                  <span className={`font-bold ${payMode === key ? "text-blue-300" : "text-slate-300"}`}>
                    {label}
                  </span>
                  <span className="text-[9px] text-slate-500">{sub}</span>
                </button>
              ))}
            </div>

            <div className="my-3 border-t border-slate-700" />

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
                  <span className="text-[11px] font-semibold text-slate-200">{value}</span>
                </div>
              ))}
            </div>

            <div className="my-3 border-t border-slate-600" />

            {payMode === "full" ? (
              <div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Total</div>
                <div className="mt-1 text-[32px] font-black leading-none text-white">
                  HK$ {totalFull.toLocaleString()}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">全額一次付清 · 含安裝</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">定金 (30%)</div>
                  <div className="mt-1 text-[32px] font-black leading-none text-blue-400">
                    HK$ {deposit.toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center justify-between border border-dashed border-slate-700 bg-slate-950 px-2 py-2">
                  <span className="text-[10px] text-slate-500">安裝當日尾款</span>
                  <span className="text-[12px] font-bold text-slate-300">
                    HK$ {remaining.toLocaleString()}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">總計 HK$ {totalFull.toLocaleString()}</div>
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
              <span className="text-[9px] text-gray-400">{b === "Prinx" ? "Value" : "Premium"}</span>
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

function Hero({ onSearch }: { onSearch: () => void }) {
  return (
    <header className="border border-gray-300 bg-white">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-slate-900 px-4 py-1.5">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 bg-emerald-400" />
          <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-gray-400">
            System Online
          </span>
        </span>
        <span className="ml-auto font-mono text-[9px] text-gray-600">Console v1.3 · HK</span>
      </div>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1fr_auto]">
        <div className="border-r border-gray-200 p-5">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.3em] text-gray-400">
            Industrial Tyre Selection System
          </div>
          <h1 className="text-[28px] font-black leading-tight tracking-tight text-slate-950 md:text-[34px]">
            呔直達
            <span className="ml-2 text-blue-600">·</span>
            <br />
            <span className="text-[22px] font-bold text-slate-700">工程級輪胎選配系統</span>
          </h1>
          <p className="mt-2 max-w-lg text-[11px] leading-relaxed text-gray-500">
            根據車呔尺寸、自選性能優先級及生產年份，輸出經工程師審核的輪胎方案矩陣。
            所有數據按後端商品目錄同步，落單時直接使用真實 SKU。
          </p>

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

        <div className="grid grid-cols-3 lg:w-44 lg:grid-cols-1">
          {[
            { label: "Delivery", value: "3 Days", sub: "最快上門安裝" },
            { label: "In Stock", value: "Live", sub: "後端目錄同步" },
            { label: "Coverage", value: "全港", sub: "免費上門服務" },
          ].map(({ label, value, sub }, i) => (
            <div
              key={label}
              className={`flex flex-col justify-center px-4 py-4 ${i < 2 ? "border-b border-gray-200" : ""}`}
            >
              <div className="text-[9px] uppercase tracking-[0.2em] text-gray-400">{label}</div>
              <div className="mt-1 text-[22px] font-black leading-none text-slate-950">{value}</div>
              <div className="mt-0.5 text-[9px] text-gray-500">{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  const [products, setProducts] = useState<TyreProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [payMode, setPayMode] = useState<"deposit" | "full">("deposit");
  const [activePreset, setActivePreset] = useState("EV 優先");
  const [showOrderFlow, setShowOrderFlow] = useState(false);
  const [orderRecord, setOrderRecord] = useState<OrderRecord | null>(null);
  const listingRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    let mounted = true;

    async function loadProducts() {
      try {
        setLoadingProducts(true);
        setProductsError(null);
        const data = await fetchProducts();
        if (!mounted) return;
        setProducts(data);
      } catch (err) {
        if (!mounted) return;
        setProducts([]);
        setProductsError(err instanceof Error ? err.message : "載入商品失敗");
      } finally {
        if (mounted) setLoadingProducts(false);
      }
    }

    loadProducts();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedSku && !products.some((p) => p.sku === selectedSku)) {
      setSelectedSku(null);
    }
  }, [products, selectedSku]);

  const selectedProduct = products.find((p) => p.sku === selectedSku) ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 antialiased">
      <div className="mx-auto max-w-7xl px-3 py-4 lg:px-4">
        <Hero onSearch={() => listingRef.current?.scrollIntoView({ behavior: "smooth" })} />

        <div
          ref={listingRef}
          className="mt-3 grid gap-3 lg:grid-cols-[200px_1fr_220px]"
          style={{ gap: "12px" }}
        >
          <FiltersPanel activePreset={activePreset} setActivePreset={setActivePreset} />

          <section className="flex flex-col border border-gray-300 bg-white">
            <div className="flex items-center justify-between border-b border-gray-300 bg-gray-50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-gray-500">
                  Result Matrix
                </span>
                <span className="h-px w-8 bg-gray-300" />
                <span className="text-[11px] font-semibold text-slate-800">
                  {loadingProducts ? "載入中..." : `${products.length} 套方案`}
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

            {loadingProducts ? (
              <div className="grid flex-1 grid-cols-1 gap-0 p-0 md:grid-cols-3" style={{ gap: "1px", background: "#1e293b" }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="border border-gray-300 bg-white p-4">
                    <div className="mb-3 h-1 w-full bg-gray-200" />
                    <div className="mb-2 h-3 w-1/3 bg-gray-200" />
                    <div className="mb-4 h-5 w-2/3 bg-gray-300" />
                    <div className="mb-4 grid grid-cols-2 gap-3">
                      <div className="h-10 bg-gray-100" />
                      <div className="h-10 bg-gray-100" />
                      <div className="h-10 bg-gray-100" />
                      <div className="h-10 bg-gray-100" />
                    </div>
                    <div className="mb-3 h-8 w-1/2 bg-gray-300" />
                    <div className="h-8 w-1/3 bg-gray-200" />
                  </div>
                ))}
              </div>
            ) : productsError ? (
              <div className="flex flex-1 items-center justify-center p-8">
                <div className="w-full max-w-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-500">
                    Product Load Error
                  </div>
                  <div className="mt-2 font-semibold">無法從後端載入商品目錄</div>
                  <div className="mt-1 break-all text-[12px]">{productsError}</div>
                  <div className="mt-3 text-[12px] text-red-600">
                    先確認 Cloudflare Worker 已部署，並且 /api/products 可正常返回商品列表。
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid flex-1 grid-cols-1 gap-0 p-0 md:grid-cols-3" style={{ gap: "1px", background: "#1e293b" }}>
                {products.map((p) => (
                  <ProductCard
                    key={p.sku}
                    product={p}
                    isSelected={p.sku === selectedSku}
                    onSelect={() => setSelectedSku(p.sku === selectedSku ? null : p.sku)}
                  />
                ))}
              </div>
            )}

            <div className="border-t border-gray-200 px-4 py-2 text-[9px] text-gray-400">
              所有報價已含基本安裝及動平衡 · 商品資料由後端目錄同步 · 落單使用真實 SKU
            </div>
          </section>

          <PricingPanel
            product={selectedProduct}
            payMode={payMode}
            setPayMode={setPayMode}
            onOrderClick={() => {
              if (selectedProduct) setShowOrderFlow(true);
            }}
          />
        </div>

        {showOrderFlow && selectedProduct && (
          <OrderFlow
            product={{
              sku: selectedProduct.sku,
              brand: selectedProduct.brand,
              name: selectedProduct.name,
              size: selectedProduct.size,
              price: selectedProduct.price,
              qty: 4,
            }}
            payMode={payMode}
            onClose={() => setShowOrderFlow(false)}
            onComplete={(record) => {
              setOrderRecord(record);
              setShowOrderFlow(false);
            }}
          />
        )}

        {orderRecord && <OrderConfirmation order={orderRecord} onClose={() => setOrderRecord(null)} />}
      </div>
    </div>
  );
}
