import { describe, it, expect } from 'vitest';
import { parseDeliveryAddress } from '../deliveryUtils';

describe('parseDeliveryAddress', () => {
  it('detects pickup when starts with "Pick up: "', () => {
    const result = parseDeliveryAddress('Pick up: Crystal');
    expect(result.deliveryType).toBe('Pickup');
    expect(result.pickupLocation).toBe('Crystal');
  });

  it('detects pickup case-insensitively', () => {
    const result = parseDeliveryAddress('pick up: Legato Gelato - Goldfinch');
    expect(result.deliveryType).toBe('Pickup');
    expect(result.pickupLocation).toBe('Legato Gelato - Goldfinch');
  });

  it('treats multi-word input as delivery', () => {
    const result = parseDeliveryAddress('Citraland Mekarsari Cibubur');
    expect(result.deliveryType).toBe('Delivery');
    expect(result.pickupLocation).toBeUndefined();
  });

  it('treats Jl. address as delivery', () => {
    const result = parseDeliveryAddress('Jl. Sudirman No. 5, Jakarta');
    expect(result.deliveryType).toBe('Delivery');
    expect(result.pickupLocation).toBeUndefined();
  });

  it('treats single-word as delivery (suspicious)', () => {
    const result = parseDeliveryAddress('home');
    expect(result.deliveryType).toBe('Delivery');
    expect(result.pickupLocation).toBeUndefined();
    expect(result.suspicious).toBe(true);
  });

  it('treats empty string as delivery (suspicious)', () => {
    const result = parseDeliveryAddress('');
    expect(result.deliveryType).toBe('Delivery');
    expect(result.suspicious).toBe(true);
  });

  it('trims whitespace from pickup location', () => {
    const result = parseDeliveryAddress('Pick up:   Legato Gelato - Goldfinch  ');
    expect(result.pickupLocation).toBe('Legato Gelato - Goldfinch');
  });
});
