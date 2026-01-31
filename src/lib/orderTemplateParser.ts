/**
 * WhatsApp Order Template Parser
 *
 * Parses filled-in WhatsApp order templates into structured data.
 * Supports both standard bracket format and informal ordering patterns.
 */

// ============================================
// Type Definitions
// ============================================

export interface ParsedItem {
  productCode: string;      // ORIGINAL, BITE_SINGLE, etc.
  productName: string;      // Full product name
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
// Product Code Mapping
// ============================================

const productCodeMap: Record<string, string> = {
  'original': 'ORIGINAL',
  'bite sized single': 'BITE_SINGLE',
  'bite single': 'BITE_SINGLE',
  'single': 'BITE_SINGLE',
  'bite sized double': 'BITE_DOUBLE',
  'bite double': 'BITE_DOUBLE',
  'double': 'BITE_DOUBLE',
  'bite sized triple': 'BITE_TRIPLE',
  'bite triple': 'BITE_TRIPLE',
  'triple': 'BITE_TRIPLE',
};

// ============================================
// Helper Functions
// ============================================

/**
 * Normalize product name to product code.
 * Returns null if no matching code found.
 */
function getProductCode(productName: string): string | null {
  const normalized = productName.toLowerCase().trim();

  // Try direct match first
  if (productCodeMap[normalized]) {
    return productCodeMap[normalized];
  }

  // Try partial matches (longest match first for accuracy)
  const sortedKeys = Object.keys(productCodeMap).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (normalized.includes(key)) {
      return productCodeMap[key];
    }
  }

  return null;
}

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
 */
function parseCustomerInfo(text: string): ParsedCustomer | null {
  const lines = text.split('\n');

  let phone = '';
  let name = '';
  let address = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Phone patterns: No. WA:, WA:, Phone:, HP:
    const phoneMatch = trimmed.match(/^(?:no\.?\s*wa|wa|phone|hp)\s*:\s*(.+)$/i);
    if (phoneMatch) {
      // Extract digits and common phone characters
      phone = phoneMatch[1].trim().replace(/[^\d+\-\s()]/g, '').trim();
      continue;
    }

    // Name patterns: Nama:, Name:
    const nameMatch = trimmed.match(/^(?:nama|name)\s*:\s*(.+)$/i);
    if (nameMatch) {
      name = nameMatch[1].trim();
      continue;
    }

    // Address patterns: Alamat:, Address:
    const addressMatch = trimmed.match(/^(?:alamat|address)\s*:\s*(.+)$/i);
    if (addressMatch) {
      address = addressMatch[1].trim();
      continue;
    }
  }

  // Only return customer if at least one field is populated
  if (phone || name || address) {
    return { phone, name, address };
  }

  return null;
}

/**
 * Parse bracket format: "1. Original (80g) - Rp 50.000 [2]"
 * Returns null if not bracket format or quantity is 0/empty.
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

  const productCode = getProductCode(productName);
  if (!productCode) return null;

  return {
    productCode,
    productName,
    quantity,
  };
}

/**
 * Parse informal format patterns:
 * - "2x Original" or "2 x Original"
 * - "Original x 2" or "Original x2"
 * - "Original: 2"
 */
function parseInformalFormat(line: string): ParsedItem | null {
  const trimmed = line.trim();

  // Pattern 1: "2x Original" or "2 x Original"
  const prefixMatch = trimmed.match(/^(\d+)\s*x\s+(.+)$/i);
  if (prefixMatch) {
    const quantity = parseInt(prefixMatch[1], 10);
    const productName = prefixMatch[2].trim();
    const productCode = getProductCode(productName);

    if (productCode && quantity > 0) {
      return { productCode, productName, quantity };
    }
  }

  // Pattern 2: "Original x 2" or "Original x2"
  const suffixMatch = trimmed.match(/^(.+?)\s*x\s*(\d+)$/i);
  if (suffixMatch) {
    const productName = suffixMatch[1].trim();
    const quantity = parseInt(suffixMatch[2], 10);
    const productCode = getProductCode(productName);

    if (productCode && quantity > 0) {
      return { productCode, productName, quantity };
    }
  }

  // Pattern 3: "Original: 2"
  const colonMatch = trimmed.match(/^(.+?):\s*(\d+)$/);
  if (colonMatch) {
    const productName = colonMatch[1].trim();
    const quantity = parseInt(colonMatch[2], 10);
    const productCode = getProductCode(productName);

    if (productCode && quantity > 0) {
      return { productCode, productName, quantity };
    }
  }

  return null;
}

/**
 * Check if a line looks like it might be a product line but failed to parse.
 */
function looksLikeProductLine(line: string): boolean {
  const trimmed = line.trim().toLowerCase();

  // Check if contains product-related keywords
  const productKeywords = ['original', 'bite', 'single', 'double', 'triple', 'sized'];
  for (const keyword of productKeywords) {
    if (trimmed.includes(keyword)) return true;
  }

  // Check if contains bracket notation
  if (/\[\s*\d*\s*\]/.test(trimmed)) return true;

  // Check if starts with a number (like "1.")
  if (/^\d+\./.test(trimmed)) return true;

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
 * Get human-readable product name from code.
 */
export function getProductNameFromCode(code: string): string {
  const codeToName: Record<string, string> = {
    'ORIGINAL': 'Original',
    'BITE_SINGLE': 'Bite Sized Single',
    'BITE_DOUBLE': 'Bite Sized Double',
    'BITE_TRIPLE': 'Bite Sized Triple',
  };
  return codeToName[code] || code;
}

/**
 * Validate and summarize parse results for user feedback.
 */
export function summarizeParseResult(result: ParseResult): string {
  if (!result.parseSuccess) {
    return 'Failed to parse order: ' + (result.parseWarnings[0] || 'Unknown error');
  }

  const itemSummary = result.items
    .map(item => `${item.quantity}x ${getProductNameFromCode(item.productCode)}`)
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
