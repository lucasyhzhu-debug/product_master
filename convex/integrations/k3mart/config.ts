/**
 * K3 Mart API Configuration
 *
 * Consignment outlet stock & sales tracking via REST API.
 * Base URL: https://consapi.k3mart.id/api/v1
 * Auth: JWT token stored in K3MART_API_TOKEN env var
 *
 * Stock sync uses /vendor-stock/detail/{productId} which returns
 * ALL outlets for a given product in a single call (2 calls total).
 */

export const K3MART_CONFIG = {
  baseUrl: "https://consapi.k3mart.id/api/v1",
  endpoints: {
    login: "/vendor/login",
    productDetail: "/vendor-stock/detail",
    sales: "/vendor-sales/get-all",
  },
  headers: {
    Origin: "https://umkm.k3mart.id",
    Referer: "https://umkm.k3mart.id/",
  },
  products: {
    /** K3Mart product IDs for our consignment items */
    ids: [
      47068,  // Dubai Chewy Cookie Big / Churi Cookie Jumbo (F03131-P00001, Rp 80.000)
      47069,  // Dubai Chewy Cookie (F03131-P00002, Rp 45.000)
    ],
  },
  sales: {
    defaultStartDate: "2026-01-01",
    overlapDays: 1,
  },
} as const;

/** Shape of an entry from the /vendor-stock/detail/{productId} API */
export interface K3MartProductDetailEntry {
  price: number;
  quantity: number;
  outlet_name: string;
  product_name: string;
  product_code: string;
  capital: number;
}

export interface K3MartProductDetailResponse {
  success: boolean;
  meta: { success: boolean };
  data: K3MartProductDetailEntry[];
}

/** Shape of a sales transaction from K3 Mart sales API */
export interface K3MartSalesTransaction {
  transDate: string;    // "07 Feb 2026, 09:45"
  outletName: string;
  productCode: string;
  productName: string;
  qty: number;          // Negative for returns
  total: number;        // Gross in IDR, negative for returns
  commission: number;   // K3Mart 35% commission
  profit: number;       // Net to vendor
  type: string;         // "sales" or "return"
}

export interface K3MartSalesResponse {
  success: boolean;
  data: K3MartSalesTransaction[];
}

/** Known K3Mart outlet ID -> name mapping (discovered 2026-02-08) */
export const K3MART_OUTLET_NAMES: Record<number, string> = {
  44: "JKT-SCBD",
  45: "JKT-GADING SERPONG",
  47: "JKT-BINTARO",
  48: "JKT-KOTA KASABLANKA",
  57: "JKT-LIPPO PURI",
  78: "JKT-LM NUSANTARA",
  81: "JKT-TAMTEM",
};

/** Reverse mapping: outlet name -> numeric ID string */
export const K3MART_OUTLET_NAME_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(K3MART_OUTLET_NAMES).map(([id, name]) => [name, id])
);
