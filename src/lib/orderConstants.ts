/**
 * Order Constants
 *
 * Shared constants for order-related UI components.
 * Centralizes status colors, category groupings, and helper functions.
 */

import type { OrderStatus, PaymentStatus } from './types';

// ============================================
// Status Colors (Individual)
// ============================================

export const STATUS_COLORS: Record<OrderStatus, string> = {
  Draft: 'bg-gray-500',
  AwaitingPayment: 'bg-amber-500',
  Confirmed: 'bg-blue-500',
  InProduction: 'bg-purple-500',
  Boxed: 'bg-amber-500', // NEW: Boxed and ready for stickers
  Labeled: 'bg-blue-500', // NEW: Stickers applied, ready to ship
  ProductionComplete: 'bg-purple-500', // DEPRECATED
  Packaging: 'bg-indigo-500', // DEPRECATED
  WaitingShipment: 'bg-yellow-500',
  CompleteShipped: 'bg-green-500',
  WaitingPickup: 'bg-orange-500',
  PickedUp: 'bg-green-500',
  Cancelled: 'bg-red-500',
};

export const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  Unpaid: 'bg-orange-500',
  Partial: 'bg-yellow-500',
  Paid: 'bg-green-500',
};

// ============================================
// Status Category Groupings
// ============================================

export const STATUS_CATEGORIES = {
  awaiting: ['Draft', 'AwaitingPayment'] as OrderStatus[],
  paidReady: ['Confirmed'] as OrderStatus[],
  kitchen: ['InProduction', 'Boxed', 'Labeled', 'Packaging'] as OrderStatus[],
  ready: ['WaitingShipment', 'WaitingPickup'] as OrderStatus[],
  completed: ['CompleteShipped', 'PickedUp'] as OrderStatus[],
  cancelled: ['Cancelled'] as OrderStatus[],
} as const;

export type StatusCategory = keyof typeof STATUS_CATEGORIES;

// ============================================
// Category Colors & Labels
// ============================================

export const CATEGORY_INFO: Record<
  StatusCategory,
  {
    label: string;
    shortLabel: string;
    color: string; // Tailwind class for button/badge
    dotColor: string; // Hex for status indicator dot
    emoji: string;
    description: string;
  }
> = {
  awaiting: {
    label: 'Awaiting Payment',
    shortLabel: 'Awaiting',
    color: 'bg-amber-500',
    dotColor: '#F59E0B',
    emoji: '🟡',
    description: 'Orders waiting for customer payment',
  },
  paidReady: {
    label: 'Paid & Ready',
    shortLabel: 'Paid',
    color: 'bg-blue-500',
    dotColor: '#3B82F6',
    emoji: '🔵',
    description: 'Paid orders waiting to start production',
  },
  kitchen: {
    label: 'In Kitchen',
    shortLabel: 'Kitchen',
    color: 'bg-purple-500',
    dotColor: '#8B5CF6',
    emoji: '🟣',
    description: 'Orders being made in production',
  },
  ready: {
    label: 'Ready to Ship/Pickup',
    shortLabel: 'Ready',
    color: 'bg-green-500',
    dotColor: '#10B981',
    emoji: '🟢',
    description: 'Need shipping details or customer notification',
  },
  completed: {
    label: 'Completed',
    shortLabel: 'Done',
    color: 'bg-green-500',
    dotColor: '#10B981',
    emoji: '\u2705',
    description: 'Successfully shipped or picked up orders',
  },
  cancelled: {
    label: 'Cancelled',
    shortLabel: 'Cancelled',
    color: 'bg-red-500',
    dotColor: '#EF4444',
    emoji: '\u274C',
    description: 'Cancelled orders',
  },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Get the category for a given order status
 */
export function getStatusCategory(status: OrderStatus): StatusCategory {
  for (const [category, statuses] of Object.entries(STATUS_CATEGORIES)) {
    if (statuses.includes(status)) {
      return category as StatusCategory;
    }
  }
  return 'completed'; // Default fallback
}

/**
 * Get category color (for buttons/badges)
 */
export function getCategoryColor(category: StatusCategory): string {
  return CATEGORY_INFO[category].color;
}

/**
 * Get category dot color (for status indicators)
 */
export function getCategoryDotColor(category: StatusCategory): string {
  return CATEGORY_INFO[category].dotColor;
}

/**
 * Get status dot color from order status
 */
export function getStatusDotColor(status: OrderStatus): string {
  const category = getStatusCategory(status);
  return getCategoryDotColor(category);
}

/**
 * Format waiting time (e.g., "2h", "3d 5h")
 */
export function getWaitingTimeInfo(awaitingSince: string | null): {
  text: string;
  color: string;
} | null {
  if (!awaitingSince) return null;

  const start = new Date(awaitingSince);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  let text: string;
  let color: string;

  if (diffHours < 1) {
    text = `${Math.floor(diffMs / (1000 * 60))}m`;
    color = 'bg-green-100 text-green-700';
  } else if (diffHours < 24) {
    text = `${Math.floor(diffHours)}h`;
    color = 'bg-green-100 text-green-700';
  } else if (diffDays < 2) {
    text = `${Math.floor(diffDays)}d ${Math.floor(diffHours % 24)}h`;
    color = 'bg-yellow-100 text-yellow-700';
  } else {
    text = `${Math.floor(diffDays)}d`;
    color = 'bg-red-100 text-red-700';
  }

  return { text: `⏱ ${text}`, color };
}

/**
 * Format date for order cards (e.g., "Fri 7 Feb")
 */
export function formatOrderDate(dateString: string | null): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
