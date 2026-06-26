/**
 * ContactLinks — renders clickable contact links for a customer record.
 *
 * Maps customer contact fields to anchors via the pure builders in
 * src/lib/contactLinks.ts. Fields that resolve to null are skipped
 * entirely — no empty anchors rendered.
 *
 * CRM design principle A1: every reference renders as a link.
 */

import { Phone, Mail, MessageCircle, Instagram, Link as LinkIcon } from "lucide-react";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
  buildWaMeUrl,
  buildMailto,
  buildInstagramUrl,
  buildSocialUrl,
} from "../../lib/contactLinks";

interface ContactLinksProps {
  customer: Doc<"customers">;
}

interface ContactItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function ContactLinks({ customer }: ContactLinksProps) {
  const items: ContactItem[] = [];

  const phoneHref = buildWaMeUrl(customer.phone);
  if (phoneHref) {
    items.push({ href: phoneHref, label: "Phone (WhatsApp)", icon: <Phone className="h-3.5 w-3.5" aria-hidden="true" /> });
  }

  const altPhoneHref = buildWaMeUrl(customer.altPhone);
  if (altPhoneHref) {
    items.push({ href: altPhoneHref, label: "Alt phone (WhatsApp)", icon: <Phone className="h-3.5 w-3.5" aria-hidden="true" /> });
  }

  const waHref = buildWaMeUrl(customer.whatsapp);
  if (waHref) {
    items.push({ href: waHref, label: "WhatsApp", icon: <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> });
  }

  const emailHref = buildMailto(customer.email);
  if (emailHref) {
    items.push({ href: emailHref, label: "Email", icon: <Mail className="h-3.5 w-3.5" aria-hidden="true" /> });
  }

  const igHref = buildInstagramUrl(customer.instagram);
  if (igHref) {
    items.push({ href: igHref, label: "Instagram", icon: <Instagram className="h-3.5 w-3.5" aria-hidden="true" /> });
  }

  for (const social of customer.otherSocials ?? []) {
    const socialHref = buildSocialUrl(social);
    if (socialHref) {
      items.push({
        href: socialHref,
        label: social.platform,
        icon: <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />,
      });
    }
  }

  // Dedupe by href: phone + whatsapp commonly resolve to the SAME wa.me URL,
  // which would (a) render the same contact twice and (b) collide React keys
  // ("two children with the same key"). Keep the first occurrence (phone label).
  const seen = new Set<string>();
  const uniqueItems = items.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });

  if (uniqueItems.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {uniqueItems.map((item) => (
        <a
          key={item.href}
          href={item.href}
          aria-label={item.label}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {item.icon}
          <span>{item.label}</span>
        </a>
      ))}
    </div>
  );
}
