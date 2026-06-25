/**
 * T11 — TDD tests for ContactLinks.
 *
 * Renders contact links for a customer Doc. Each non-null field produces
 * an anchor with the correct href; empty/absent fields are skipped.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContactLinks } from "../ContactLinks";
import type { Doc } from "../../../../convex/_generated/dataModel";

// Minimal customer fixture — only fields ContactLinks reads.
function makeCustomer(
  overrides: Partial<Doc<"customers">>,
): Doc<"customers"> {
  return {
    _id: "k1" as Doc<"customers">["_id"],
    _creationTime: 0,
    name: "Test Customer",
    ...overrides,
  } as Doc<"customers">;
}

describe("ContactLinks", () => {
  it("renders wa.me anchor for whatsapp and mailto anchor for email — 2 anchors total", () => {
    render(
      <ContactLinks
        customer={makeCustomer({
          whatsapp: "+62 812-3456-7890",
          email: "test@example.com",
        })}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);

    const waLink = screen.getByRole("link", { name: /whatsapp/i });
    expect(waLink).toHaveAttribute("href", "https://wa.me/6281234567890");

    const mailLink = screen.getByRole("link", { name: /email/i });
    expect(mailLink).toHaveAttribute("href", "mailto:test@example.com");
  });

  it("skips empty instagram — renders no anchor for it", () => {
    render(
      <ContactLinks
        customer={makeCustomer({
          whatsapp: "081234567890",
          instagram: undefined,
        })}
      />,
    );

    const links = screen.getAllByRole("link");
    // Only the WhatsApp anchor — no Instagram
    expect(links).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /instagram/i })).not.toBeInTheDocument();
  });

  it("renders instagram anchor when handle is set", () => {
    render(
      <ContactLinks customer={makeCustomer({ instagram: "@frollie.id" })} />,
    );

    const igLink = screen.getByRole("link", { name: /instagram/i });
    expect(igLink).toHaveAttribute("href", "https://instagram.com/frollie.id");
  });

  it("renders phone anchor (wa.me) for phone field", () => {
    render(
      <ContactLinks customer={makeCustomer({ phone: "08111000111" })} />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://wa.me/08111000111");
  });

  it("renders altPhone anchor (wa.me) for altPhone field", () => {
    render(
      <ContactLinks customer={makeCustomer({ altPhone: "08222000222" })} />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://wa.me/08222000222");
  });

  it("renders otherSocials using url when present", () => {
    render(
      <ContactLinks
        customer={makeCustomer({
          otherSocials: [{ platform: "tiktok", handle: "@frollie", url: "https://tiktok.com/@frollie" }],
        })}
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://tiktok.com/@frollie");
  });

  it("renders nothing when all contact fields are absent", () => {
    render(<ContactLinks customer={makeCustomer({})} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
