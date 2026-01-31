import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, formatNumber, formatPercent, getErrorMessage } from '../utils';

describe('cn (class name utility)', () => {
  it('merges multiple class strings', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('handles conditional classes correctly', () => {
    expect(cn('base', true && 'active', false && 'inactive')).toBe('base active');
  });

  it('handles Tailwind class overrides correctly', () => {
    // Later class should override earlier conflicting class
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles undefined and null values', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });

  it('handles arrays of classes', () => {
    expect(cn(['class1', 'class2'], 'class3')).toBe('class1 class2 class3');
  });
});

describe('formatCurrency', () => {
  it('formats positive amounts in IDR currency', () => {
    const result = formatCurrency(50000);
    expect(result).toContain('50');
    expect(result).toContain('000');
    // IDR formatting should include Rp or IDR
    expect(result).toMatch(/Rp|IDR/);
  });

  it('formats zero correctly', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
    expect(result).toMatch(/Rp|IDR/);
  });

  it('formats small amounts correctly', () => {
    const result = formatCurrency(100);
    expect(result).toContain('100');
    expect(result).toMatch(/Rp|IDR/);
  });

  it('returns "-" for null values', () => {
    expect(formatCurrency(null)).toBe('-');
  });

  it('returns "-" for undefined values', () => {
    expect(formatCurrency(undefined)).toBe('-');
  });

  it('formats large amounts correctly', () => {
    const result = formatCurrency(1000000);
    // Should contain proper thousands separator for Indonesian locale
    expect(result).toMatch(/1[.,]000[.,]000/);
    expect(result).toMatch(/Rp|IDR/);
  });
});

describe('formatNumber', () => {
  it('formats numbers with default 2 decimal places', () => {
    const result = formatNumber(1234.567);
    // Indonesian locale uses comma as decimal separator
    expect(result).toMatch(/1[.,]234[.,]57/);
  });

  it('formats numbers with custom decimal places', () => {
    const result = formatNumber(1234.5678, 3);
    expect(result).toMatch(/1[.,]234[.,]568/);
  });

  it('returns "-" for null values', () => {
    expect(formatNumber(null)).toBe('-');
  });

  it('formats zero correctly', () => {
    const result = formatNumber(0);
    expect(result).toMatch(/0[.,]00/);
  });
});

describe('formatPercent', () => {
  it('formats basic percentages with one decimal place', () => {
    expect(formatPercent(25.5)).toBe('25.5%');
    expect(formatPercent(33.333)).toBe('33.3%');
  });

  it('returns "-" for null values', () => {
    expect(formatPercent(null)).toBe('-');
  });

  it('formats 100% correctly', () => {
    expect(formatPercent(100)).toBe('100.0%');
  });

  it('formats 0% correctly', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('formats negative percentages correctly', () => {
    expect(formatPercent(-15.5)).toBe('-15.5%');
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error object', () => {
    const error = new Error('Something went wrong');
    expect(getErrorMessage(error, 'Default')).toBe('Something went wrong');
  });

  it('returns string error as-is', () => {
    expect(getErrorMessage('String error', 'Default')).toBe('String error');
  });

  it('returns fallback for unknown error types (object)', () => {
    expect(getErrorMessage({ code: 500 }, 'Default message')).toBe('Default message');
  });

  it('returns fallback for null error', () => {
    expect(getErrorMessage(null, 'Fallback')).toBe('Fallback');
  });

  it('returns fallback for undefined error', () => {
    expect(getErrorMessage(undefined, 'Fallback')).toBe('Fallback');
  });
});
