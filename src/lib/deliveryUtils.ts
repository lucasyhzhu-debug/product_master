export interface DeliveryParseResult {
  deliveryType: 'Pickup' | 'Delivery';
  pickupLocation?: string;
  /** True when the address is empty or single-word — UI should show confirm modal */
  suspicious?: boolean;
}

const PICKUP_PREFIX = /^pick up:\s*/i;

export function parseDeliveryAddress(address: string): DeliveryParseResult {
  const trimmed = address.trim();

  // Pickup: starts with "Pick up: " (case-insensitive)
  if (PICKUP_PREFIX.test(trimmed)) {
    const location = trimmed.replace(PICKUP_PREFIX, '').trim();
    return { deliveryType: 'Pickup', pickupLocation: location || undefined };
  }

  // Suspicious: empty or single word
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 1) {
    return { deliveryType: 'Delivery', suspicious: true };
  }

  // Everything else: delivery
  return { deliveryType: 'Delivery' };
}
