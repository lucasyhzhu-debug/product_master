/**
 * K3 Mart API Configuration
 *
 * Consignment outlet stock tracking via REST API.
 * Base URL: https://consapi.k3mart.id/api/v1
 * Auth: JWT token stored in K3MART_API_TOKEN env var
 */

export const K3MART_CONFIG = {
  baseUrl: "https://consapi.k3mart.id/api/v1",
  endpoints: {
    dashboard: "/vendor-stock/get-dashboard",
  },
  headers: {
    Origin: "https://umkm.k3mart.id",
    Referer: "https://umkm.k3mart.id/",
  },
  pagination: {
    pageSize: 50,
    order: "asc",
  },
  rateLimit: {
    betweenPagesMs: 500,
    betweenOutletsMs: 2000,
  },
} as const;

/** Shape of a product from the K3 Mart dashboard API */
export interface K3MartProduct {
  id: number;
  product_id: number;
  product: {
    product_code: string;
    product_name: string;
    capital: number;
  };
  quantity: number;
  price: number;
  price_grabfood_gofood: number;
  price_grabmart: number;
  price_shopee: number;
  updated_at: string;
}

export interface K3MartDashboardResponse {
  data: {
    data: K3MartProduct[];
    meta: {
      totalPages: number;
      currentPage: number;
      pageSize: number;
      totalCount: number;
    };
  };
}
