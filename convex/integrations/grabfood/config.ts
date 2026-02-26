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
    scope: "grabfood.partner_api",
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

// ─── Types (aligned with GrabFood OpenAPI v1.1.3 SDK models) ────────────────

export interface GrabOauthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// ─── Order Types ─────────────────────────────────────────────────────────────

export interface GrabOrderItem {
  id: string;
  grabItemID: string;
  quantity: number;
  /** Price in minor unit (IDR = whole rupiah, no decimals) */
  price: number;
  tax?: number;
  specifications?: string;
  outOfStockInstruction?: GrabOutOfStockInstruction;
  modifiers?: GrabOrderItemModifier[];
}

export interface GrabOutOfStockInstruction {
  title: string;
  instructionType: "CONTACT" | "SPECIFIC_ITEM" | "CANCEL_ITEM" | "REFUND";
  replacementItemID?: string;
  replacementGrabItemID?: string;
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
  smallOrderFee?: number;
  eaterPayment?: number;
}

export interface GrabOrderCampaign {
  id: string;
  name: string;
  campaignNameForMex?: string;
  level?: string;
  type?: string;
  usageCount?: number;
  mexFundedRatio?: number;
  deductedAmount?: number;
  deductedPart?: string;
  appliedItemIDs?: string[];
}

export interface GrabOrderPromo {
  code: string;
  description?: string;
  name?: string;
  promoAmount?: number;
  mexFundedRatio?: number;
  mexFundedAmount?: number;
  targetedPrice?: number;
  promoAmountInMin?: number;
}

export interface GrabCurrency {
  code: string;
  symbol: string;
  exponent: number;
}

export interface GrabIncomingOrder {
  orderID: string;
  shortOrderNumber: string;
  merchantID: string;
  partnerMerchantID?: string;
  paymentType: "CASH" | "CASHLESS";
  cutlery: boolean;
  orderTime: string;
  submitTime?: string;
  completeTime?: string;
  scheduledTime?: string;
  orderState?: string;
  currency: GrabCurrency;
  featureFlags?: { orderAcceptedType?: string; orderType?: string; isMexEditOrder?: boolean };
  items: GrabOrderItem[];
  campaigns?: GrabOrderCampaign[];
  promos?: GrabOrderPromo[];
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
  orderReadyEstimation?: { readyTime?: string };
  membershipID?: string;
}

export interface GrabListOrdersResponse {
  orders: GrabIncomingOrder[];
  more: boolean;
}

// ─── Store Types ─────────────────────────────────────────────────────────────

export type GrabCloseReason =
  | "mex_paused" | "ops_paused" | "out_of_special_opening_hours"
  | "out_of_opening_hours" | "inactive" | "ops_paused_without_comm"
  | "restricted" | "suspended" | "";

export interface GrabStoreStatusResponse {
  closeReason: GrabCloseReason;
  isInSpecialOpeningHourRange: boolean;
  isOpen: boolean;
}

// ─── Menu Types ──────────────────────────────────────────────────────────────

export interface GrabMenuItem {
  id: string;
  name: string;
  nameTranslation?: Record<string, string>;
  availableStatus: "AVAILABLE" | "UNAVAILABLE";
  description?: string;
  price: number;
  photos?: string[];
  taxable?: boolean;
  maxStock?: number;
  sequence?: number;
  modifierGroups?: GrabModifierGroup[];
}

export interface GrabModifierGroup {
  id: string;
  name: string;
  availableStatus: "AVAILABLE" | "UNAVAILABLE";
  selectionRangeMin?: number;
  selectionRangeMax: number;
  modifiers?: GrabMenuModifier[];
}

export interface GrabMenuModifier {
  id: string;
  name: string;
  availableStatus: "AVAILABLE" | "UNAVAILABLE";
  price?: number;
}

export interface GrabMenuCategory {
  id: string;
  name: string;
  availableStatus: "AVAILABLE" | "UNAVAILABLE";
  sellingTimeID: string;
  items: GrabMenuItem[];
}

export interface GrabBatchMenuUpdateRequest {
  merchantID: string;
  field: "PRICE" | "AVAILABILITY" | "STOCK" | "MODIFIER";
  menuEntities: Array<{
    id: string;
    availableStatus?: "AVAILABLE" | "UNAVAILABLE";
    maxStock?: number;
    price?: number;
  }>;
}

// ─── Error Types ─────────────────────────────────────────────────────────────

export interface GrabApiError {
  message?: string;
  reason?: string;
  target?: string;
}
