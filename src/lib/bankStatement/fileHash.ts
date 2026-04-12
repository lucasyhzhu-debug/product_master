/**
 * SHA-256 hash helper for uploaded bank statement files.
 * Produces the same hex output as the `computeSha256` helper in
 * src/components/expenses/ReceiptUpload.tsx so hashes are comparable
 * across the expense and bank-statement upload paths.
 */

export async function computeSha256(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
