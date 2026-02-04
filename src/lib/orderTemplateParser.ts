/**
 * WhatsApp Order Template Parser
 *
 * Parses filled-in WhatsApp order templates into structured data.
 * Supports both standard bracket format and informal ordering patterns.
 *
 * This parser is DYNAMIC - it extracts product names from the template
 * and returns them as-is. The consumer is responsible for matching
 * names against the actual product list.
 */

// ============================================
// Type Definitions
// ============================================

export interface ParsedItem {
  productName: string;      // Raw extracted product name
  quantity: number;
}

export interface ParsedCustomer {
  phone: string;
  name: string;
  address: string;
}

export interface ParseResult {
  items: ParsedItem[];
  customer: ParsedCustomer | null;
  parseWarnings: string[];
  parseSuccess: boolean;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Check if a line is a separator or should be ignored.
 */
function isSeparatorOrEmpty(line: string): boolean {
  const trimmed = line.trim();

  // Empty line
  if (trimmed === '') return true;

  // Separator patterns
  if (/^[-=_*]+$/.test(trimmed)) return true;
  if (/^[─━┄┅┈┉]+$/.test(trimmed)) return true;

  // Common header/footer patterns to skip
  const skipPatterns = [
    /^halo!/i,
    /^mau pesan/i,
    /^mau makan/i,
    /^untuk customer/i,
    /^isi jumlah/i,
    /^transfer ke:/i,
    /^silakan transfer/i,
    /^bca\s+\d+/i,
    /^pt malo/i,
    /^\d{10,}$/,  // Bank account numbers
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}

/**
 * Parse customer information from text.
 * Handles both same-line values (Alamat: Jl. Sudirman) and
 * next-line values (Alamat:\nJl. Sudirman).
 */
function parseCustomerInfo(text: string): ParsedCustomer | null {
  const lines = text.split('\n');

  let phone = '';
  let name = '';
  let address = '';

  // Track pending labels that might have their value on the next line
  let pendingLabel: 'phone' | 'name' | 'address' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip empty lines
    if (trimmed === '') {
      pendingLabel = null;
      continue;
    }

    // Check if this line is a continuation of a pending label
    if (pendingLabel && !isLabelLine(trimmed)) {
      // This line is the value for the previous label
      switch (pendingLabel) {
        case 'phone':
          phone = trimmed.replace(/[^\d+\-\s()]/g, '').trim();
          break;
        case 'name':
          name = trimmed;
          break;
        case 'address':
          address = trimmed;
          break;
      }
      pendingLabel = null;
      continue;
    }

    // Phone patterns: No. WA:, WA:, Phone:, HP:
    const phoneMatch = trimmed.match(/^(?:no\.?\s*wa|wa|phone|hp)\s*:\s*(.*)$/i);
    if (phoneMatch) {
      const value = phoneMatch[1].trim();
      if (value) {
        // Value on same line
        phone = value.replace(/[^\d+\-\s()]/g, '').trim();
        pendingLabel = null;
      } else {
        // Value might be on next line
        pendingLabel = 'phone';
      }
      continue;
    }

    // Name patterns: Nama:, Name:
    const nameMatch = trimmed.match(/^(?:nama|name)\s*:\s*(.*)$/i);
    if (nameMatch) {
      const value = nameMatch[1].trim();
      if (value) {
        name = value;
        pendingLabel = null;
      } else {
        pendingLabel = 'name';
      }
      continue;
    }

    // Address patterns: Alamat:, Address:
    const addressMatch = trimmed.match(/^(?:alamat|address)\s*:\s*(.*)$/i);
    if (addressMatch) {
      const value = addressMatch[1].trim();
      if (value) {
        address = value;
        pendingLabel = null;
      } else {
        pendingLabel = 'address';
      }
      continue;
    }

    // Line doesn't match any pattern, reset pending
    pendingLabel = null;
  }

  // Only return customer if at least one field is populated
  if (phone || name || address) {
    return { phone, name, address };
  }

  return null;
}

/**
 * Check if a line is a label line (No. WA:, Nama:, Alamat:, etc.)
 */
function isLabelLine(line: string): boolean {
  return /^(?:no\.?\s*wa|wa|phone|hp|nama|name|alamat|address)\s*:/i.test(line);
}

/**
 * Parse bracket format: "1. Original (80g) - Rp 50.000 [2]"
 * Returns null if not bracket format or quantity is 0/empty.
 *
 * Now returns raw product name without code mapping.
 */
function parseBracketFormat(line: string): ParsedItem | null {
  // Pattern: optional number/dot, product name, optional details in (), optional price, [quantity]
  const bracketMatch = line.match(/^\d*\.?\s*(.+?)\s*(?:\([^)]*\))?\s*(?:-\s*Rp\s*[\d.,]+)?\s*\[\s*(\d*)\s*\]$/i);

  if (!bracketMatch) return null;

  const productName = bracketMatch[1].trim();
  const quantityStr = bracketMatch[2].trim();

  // Skip empty or zero quantities
  if (!quantityStr || quantityStr === '0') return null;

  const quantity = parseInt(quantityStr, 10);
  if (isNaN(quantity) || quantity <= 0) return null;

  // Skip if product name is empty
  if (!productName) return null;

  return {
    productName,
    quantity,
  };
}

/**
 * Parse informal format patterns:
 * - "2x Original" or "2 x Original"
 * - "Original x 2" or "Original x2"
 * - "Original: 2"
 *
 * Now returns raw product name without code mapping.
 */
function parseInformalFormat(line: string): ParsedItem | null {
  const trimmed = line.trim();

  // Pattern 1: "2x Original" or "2 x Original"
  const prefixMatch = trimmed.match(/^(\d+)\s*x\s+(.+)$/i);
  if (prefixMatch) {
    const quantity = parseInt(prefixMatch[1], 10);
    const productName = prefixMatch[2].trim();

    if (productName && quantity > 0) {
      return { productName, quantity };
    }
  }

  // Pattern 2: "Original x 2" or "Original x2"
  const suffixMatch = trimmed.match(/^(.+?)\s*x\s*(\d+)$/i);
  if (suffixMatch) {
    const productName = suffixMatch[1].trim();
    const quantity = parseInt(suffixMatch[2], 10);

    if (productName && quantity > 0) {
      return { productName, quantity };
    }
  }

  // Pattern 3: "Original: 2"
  const colonMatch = trimmed.match(/^(.+?):\s*(\d+)$/);
  if (colonMatch) {
    const productName = colonMatch[1].trim();
    const quantity = parseInt(colonMatch[2], 10);

    if (productName && quantity > 0) {
      return { productName, quantity };
    }
  }

  return null;
}

/**
 * Check if a line looks like it might be a product line but failed to parse.
 * Uses format-based detection (not hardcoded product keywords).
 */
function looksLikeProductLine(line: string): boolean {
  const trimmed = line.trim();

  // Check if contains bracket notation with empty or no quantity
  if (/\[\s*\]/.test(trimmed)) return true;

  // Check if starts with a number followed by period (numbered list)
  if (/^\d+\.\s+\S/.test(trimmed)) return true;

  // Check for informal patterns with "x" multiplier
  if (/^\d+\s*x\s+/i.test(trimmed) || /\s+x\s*\d+$/i.test(trimmed)) return true;

  return false;
}

// ============================================
// Main Parser Function
// ============================================

/**
 * Parse a filled WhatsApp order template into structured data.
 *
 * @param text - The raw text from WhatsApp message
 * @returns ParseResult with items, customer info, warnings, and success status
 */
export function parseOrderTemplate(text: string): ParseResult {
  const items: ParsedItem[] = [];
  const parseWarnings: string[] = [];
  const lines = text.split('\n');

  // Parse customer info from the full text
  const customer = parseCustomerInfo(text);

  // Process each line for products
  for (const line of lines) {
    // Skip separators and empty lines
    if (isSeparatorOrEmpty(line)) continue;

    // Skip customer info lines (already parsed)
    const trimmed = line.trim();
    if (/^(?:no\.?\s*wa|wa|phone|hp|nama|name|alamat|address)\s*:/i.test(trimmed)) {
      continue;
    }

    // Try bracket format first (primary method)
    const bracketItem = parseBracketFormat(line);
    if (bracketItem) {
      items.push(bracketItem);
      continue;
    }

    // Try informal format (fallback method)
    const informalItem = parseInformalFormat(line);
    if (informalItem) {
      items.push(informalItem);
      continue;
    }

    // Check if this looks like a product line that we couldn't parse
    if (looksLikeProductLine(line)) {
      parseWarnings.push(`Could not parse line: "${trimmed.substring(0, 50)}${trimmed.length > 50 ? '...' : ''}"`);
    }
  }

  // Generate warnings for missing data
  if (items.length === 0) {
    parseWarnings.push('No products found in the order');
  }

  if (customer) {
    if (!customer.phone) {
      parseWarnings.push('Customer phone number not found');
    }
    if (!customer.name) {
      parseWarnings.push('Customer name not found');
    }
    if (!customer.address) {
      parseWarnings.push('Customer address not found');
    }
  }

  // Determine success: at least 1 product with qty > 0
  const parseSuccess = items.length > 0;

  return {
    items,
    customer,
    parseWarnings,
    parseSuccess,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Validate and summarize parse results for user feedback.
 */
export function summarizeParseResult(result: ParseResult): string {
  if (!result.parseSuccess) {
    return 'Failed to parse order: ' + (result.parseWarnings[0] || 'Unknown error');
  }

  const itemSummary = result.items
    .map(item => `${item.quantity}x ${item.productName}`)
    .join(', ');

  const customerSummary = result.customer
    ? ` for ${result.customer.name || 'Unknown Customer'}`
    : '';

  let summary = `Parsed: ${itemSummary}${customerSummary}`;

  if (result.parseWarnings.length > 0) {
    summary += ` (${result.parseWarnings.length} warning${result.parseWarnings.length > 1 ? 's' : ''})`;
  }

  return summary;
}
