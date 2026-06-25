/**
 * T10 — TDD tests for Breadcrumbs + LinkableObject.
 *
 * Both components live in src/components/crm/. They require a React Router
 * context for <Link>; all tests wrap in <MemoryRouter>.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Breadcrumbs } from "../Breadcrumbs";
import { LinkableObject } from "../LinkableObject";

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

describe("Breadcrumbs", () => {
  it("renders 2 links and 1 plain-text current for a 3-item trail", () => {
    render(
      <MemoryRouter>
        <Breadcrumbs
          trail={[
            { label: "Home", to: "/" },
            { label: "Customers", to: "/crm/customers" },
            { label: "PT Indah" },
          ]}
        />
      </MemoryRouter>,
    );

    // First two segments are links
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Customers" })).toBeInTheDocument();

    // Last segment is plain text (no anchor)
    expect(screen.queryByRole("link", { name: "PT Indah" })).not.toBeInTheDocument();
    expect(screen.getByText("PT Indah")).toBeInTheDocument();
  });

  it("renders a single-item trail as plain text only (no links)", () => {
    render(
      <MemoryRouter>
        <Breadcrumbs trail={[{ label: "PT Indah" }]} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("PT Indah")).toBeInTheDocument();
  });

  it("renders chevron separators between segments", () => {
    const { container } = render(
      <MemoryRouter>
        <Breadcrumbs
          trail={[
            { label: "Home", to: "/" },
            { label: "Page" },
          ]}
        />
      </MemoryRouter>,
    );

    // lucide-react ChevronRight renders an svg
    const svgs = container.querySelectorAll("svg");
    // 2 items → 1 separator
    expect(svgs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// LinkableObject
// ---------------------------------------------------------------------------

describe("LinkableObject", () => {
  it("renders a link when to is set", () => {
    render(
      <MemoryRouter>
        <LinkableObject to="/crm/customers/123">PT Indah</LinkableObject>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "PT Indah" })).toBeInTheDocument();
  });

  it("renders a muted 'coming in {comingIn}' pill when to=null + comingIn set (no anchor)", () => {
    render(
      <MemoryRouter>
        <LinkableObject to={null} comingIn="D2">
          Invoices
        </LinkableObject>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/coming in D2/i)).toBeInTheDocument();
  });

  it("renders plain text when to=null and comingIn is not set", () => {
    render(
      <MemoryRouter>
        <LinkableObject to={null}>PT Indah</LinkableObject>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("PT Indah")).toBeInTheDocument();
  });
});
