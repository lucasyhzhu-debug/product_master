/**
 * Shared WhatsApp template variable substitution.
 *
 * Extracted here so both orders/whatsapp.ts and subscription credit
 * draft generation can import a single implementation.
 */

/**
 * Replace template variables with actual values.
 * Variable keys must include delimiters, e.g. "{customer_name}".
 */
export function renderTemplate(
  templateString: string,
  variables: Record<string, string>
): string {
  let result = templateString;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
  }
  return result;
}
