/**
 * GrabFood Partner API Configuration (v1.1.3)
 *
 * Staging environment for POC testing.
 * Credentials stored in platformCredentials table:
 *   email    → GRAB_CLIENT_ID
 *   password → GRAB_CLIENT_SECRET
 *
 * Switch to prdBaseUrl when ready for production.
 */

export const GRABFOOD_CONFIG = {
  platformId: "grabfood" as const,

  auth: {
    tokenUrl: "https://api.grab.com/grabid/v1/oauth2/token",
    scope: "food.partner_api",
    grantType: "client_credentials",
  },

  api: {
    // Use staging for POC. Switch to prdBaseUrl for production.
    baseUrl: "https://partner-api.grab.com/grabfood-sandbox",
    prdBaseUrl: "https://partner-api.grab.com/grabfood",
  },

  endpoints: {
    orderPrepare:   "/partner/v1/order/prepare",
    orderCancel:    "/partner/v1/order/cancel",
    orderMark:      "/partner/v1/orders/mark",
    orderCancelable:"/partner/v1/order/cancelable",
    orderReadyTime: "/partner/v1/order/readytime",
    ordersList:     "/partner/v1/orders",
    menuUpdate:     "/partner/v1/menu",
    menuBatch:      "/partner/v1/batch/menu",
    menuNotify:     "/partner/v1/merchant/menu/notification",
    menuTrace:      "/partner/v1/merchant/menu/trace",
    storeStatus:    "/partner/v1/merchants/{merchantID}/store/status",
    storePause:     "/partner/v1/merchant/pause",
  },

  // Token expires_in is 3600s (1h). Refresh 5 min before expiry.
  tokenRefreshBufferMs: 5 * 60 * 1000,
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GrabOauthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface GrabOrderItem {
  id: string;
  grabItemID: string;
  quantity: number;
  price: number;
  tax?: number;
  specifications?: string;
  modifiers?: GrabOrderItemModifier[];
}

export interface GrabOrderItemModifier {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface GrabOrderPrice {
  subtotal: number;
  tax?: number;
  merchantChargeFee?: number;
  grabFundPromo?: number;
  merchantFundPromo?: number;
  basketPromo?: number;
  deliveryFee?: number;
  eaterPayment?: number;
}

export interface GrabIncomingOrder {
  orderID: string;
  shortOrderNumber: string;
  merchantID: string;
  partnerMerchantID?: string;
  paymentType: string;
  cutlery: boolean;
  orderTime: string;
  scheduledTime?: string;
  orderState?: string;
  currency: { code: string; symbol: string; exponent: number };
  items: GrabOrderItem[];
  price: GrabOrderPrice;
  dineIn?: { tableID?: string; eaterCount?: number };
  receiver?: {
    name?: string;
    phones?: string;
    address?: {
      address?: string;
      coordinates?: { latitude: number; longitude: number };
      deliveryInstruction?: string;
      postcode?: string;
    };
  };
}

export interface GrabApiError {
  message?: string;
  reason?: string;
  target?: string;
}
