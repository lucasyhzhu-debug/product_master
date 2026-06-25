export function buildWaMeUrl(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export function buildMailto(email?: string | null): string | null {
  return email ? `mailto:${email}` : null;
}

export function buildInstagramUrl(handle?: string | null): string | null {
  if (!handle) return null;
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

export function buildSocialUrl(s?: { platform: string; handle: string; url?: string } | null): string | null {
  if (!s) return null;
  if (s.url) return s.url;
  return s.handle ? s.handle : null;
}
