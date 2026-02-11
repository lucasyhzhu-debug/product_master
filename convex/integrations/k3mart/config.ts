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
    outletProfile: "/vendor-profile/get-outlet",
    dashboard: "/vendor-stock/get-dashboard",
    stockFlowList: "/vendor-stock-flow/get-list",
    stockFlowDetail: "/vendor-stock-flow/get-list-by-id",
    stockFlowAdd: "/vendor-stock-flow/add",
    stockFlowCancel: "/vendor-stock-flow/cancel",
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
  productMap: {
    47068: { code: "F03131-P00001", name: "Churi Cookie Jumbo", price: 80000 },
    47069: { code: "F03131-P00002", name: "Dubai Chewy Cookie", price: 45000 },
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

/** Product info with stock & price from /vendor-stock/get-dashboard */
export interface K3MartDashboardProduct {
  productId: number;
  productCode: string;
  productName: string;
  price: number;
  quantity: number;
  capital: number;
}

export interface K3MartDashboardResponse {
  success: boolean;
  meta: { success: boolean };
  data: K3MartDashboardProduct[];
}

/** Stock flow request payload for POST /vendor-stock-flow/add */
export interface K3MartStockFlowAddPayload {
  outletId: number;
  header: {
    requestType: number; // 1 = stock-in, 0 = stock-out
    note?: string;
  };
  detail: Array<{
    productId: number;
    productName: string;
    productCode: string;
    qty: number;
    price: number;
    currentStock: number;
    currentPrice: number;
    edit: boolean;
  }>;
}

export interface K3MartStockFlowAddResponse {
  success: boolean;
  meta: { success: boolean };
  data: boolean;
}

/** Stock flow list entry from GET /vendor-stock-flow/get-list */
export interface K3MartStockFlowEntry {
  id: number;
  request_type: number; // 0 = stock-out, 1 = stock-in
  status: string; // "pending" | "approved" | "canceled" | "rejected"
  note: string;
  handledby_pos: string;
  created_at: string;
  updated_at: string;
}

export interface K3MartStockFlowListResponse {
  success: boolean;
  meta: { success: boolean };
  data: K3MartStockFlowEntry[];
}

/** Stock flow detail from GET /vendor-stock-flow/get-list-by-id */
export interface K3MartStockFlowDetailEntry {
  productId: number;
  productCode: string;
  productName: string;
  qty: number;
  price: number;
}

export interface K3MartStockFlowDetailResponse {
  success: boolean;
  meta: { success: boolean };
  data: K3MartStockFlowDetailEntry[];
}

/** Cancel response from PUT /vendor-stock-flow/cancel/{id} */
export interface K3MartCancelResponse {
  success: boolean;
  data: number[];
}

/** Outlet profile entry from GET /vendor-profile/get-outlet */
export interface K3MartOutletProfileEntry {
  id: number;
  name: string;
  address?: string;
  consignmentPeriod?: string;
}

export interface K3MartOutletProfileResponse {
  success: boolean;
  meta: { success: boolean };
  data: K3MartOutletProfileEntry[];
}

/** Known K3Mart outlet ID -> name mapping (discovered 2026-02-08) */
export const K3MART_OUTLET_NAMES: Record<number, string> = {
  44: "JKT-SCBD",
  45: "JKT-GADING SERPONG",
  47: "JKT-BINTARO",
  48: "JKT-KOTA KASABLANKA",
  53: "JKT-OLD SHANGHAI",
  57: "JKT-LIPPO PURI",
  78: "JKT-LM NUSANTARA",
  81: "JKT-TAMTEM",
};

/** Reverse mapping: outlet name -> numeric ID string */
export const K3MART_OUTLET_NAME_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(K3MART_OUTLET_NAMES).map(([id, name]) => [name, id])
);
