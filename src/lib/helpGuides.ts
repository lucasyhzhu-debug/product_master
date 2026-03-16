import { type ComponentType } from "react";
import {
  CreditCard,
  ChefHat,
  Package,
  Warehouse,
  UtensilsCrossed,
  BarChart3,
} from "lucide-react";
import { ExpenseGuide } from "@/pages/guides/ExpenseGuide";

// ---------------------------------------------------------------------------
// Guide section definition
// ---------------------------------------------------------------------------

export interface GuideSection {
  id: string;
  title: string;
  role?: "all" | "manager" | "admin";
}

// ---------------------------------------------------------------------------
// Guide configuration
// ---------------------------------------------------------------------------

export interface GuideConfig {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  accentColor: string; // Tailwind color name (e.g., "orange")
  sections: GuideSection[];
  readTimeMinutes: number;
  status: "live" | "coming-soon";
  isNew?: boolean;
  component?: ComponentType; // eagerly imported, undefined for coming-soon
}

// ---------------------------------------------------------------------------
// Help guides registry
// ---------------------------------------------------------------------------

export const HELP_GUIDES: GuideConfig[] = [
  {
    id: "expenses",
    title: "Expenses & Reimbursement",
    description:
      "Submit expenses, approve reimbursements, understand payroll integration and P&L impact.",
    icon: CreditCard,
    accentColor: "orange",
    sections: [
      { id: "overview", title: "Overview" },
      { id: "submitting", title: "Submitting Expenses", role: "all" },
      { id: "approving", title: "Approving Expenses", role: "manager" },
      { id: "reimbursement", title: "Reimbursement Workflow", role: "admin" },
      { id: "payroll", title: "Payroll Integration", role: "admin" },
      { id: "analytics", title: "Expense Analytics", role: "manager" },
      { id: "pnl", title: "P&L Impact", role: "admin" },
      { id: "faq", title: "FAQ" },
    ],
    readTimeMinutes: 15,
    status: "live",
    isNew: true,
    component: ExpenseGuide,
  },
  {
    id: "kitchen",
    title: "Kitchen Operations",
    description: "Production workflow, ball tracking, and order fulfillment.",
    icon: ChefHat,
    accentColor: "green",
    sections: [],
    readTimeMinutes: 0,
    status: "coming-soon",
  },
  {
    id: "orders",
    title: "Order Management",
    description:
      "Create orders, manage status workflow, and handle payments.",
    icon: Package,
    accentColor: "blue",
    sections: [],
    readTimeMinutes: 0,
    status: "coming-soon",
  },
  {
    id: "inventory",
    title: "Inventory & Stock",
    description:
      "FIFO batch tracking, stock reservations, and storage locations.",
    icon: Warehouse,
    accentColor: "purple",
    sections: [],
    readTimeMinutes: 0,
    status: "coming-soon",
  },
  {
    id: "recipes",
    title: "Recipes & Packaging",
    description:
      "Manage food recipes, packaging recipes, and version control.",
    icon: UtensilsCrossed,
    accentColor: "rose",
    sections: [],
    readTimeMinutes: 0,
    status: "coming-soon",
  },
  {
    id: "analytics",
    title: "Sales & Analytics",
    description:
      "Revenue dashboards, channel analytics, and financial statements.",
    icon: BarChart3,
    accentColor: "amber",
    sections: [],
    readTimeMinutes: 0,
    status: "coming-soon",
  },
];

// ---------------------------------------------------------------------------
// Popular questions (used on landing page and in search)
// ---------------------------------------------------------------------------

export const POPULAR_QUESTIONS: {
  question: string;
  guideId: string;
  anchor: string;
}[] = [
  {
    question: "How do I submit an expense?",
    guideId: "expenses",
    anchor: "submitting",
  },
  {
    question: "Who can approve expenses?",
    guideId: "expenses",
    anchor: "approving",
  },
  {
    question: "How does payroll work?",
    guideId: "expenses",
    anchor: "payroll",
  },
  {
    question: "Understanding the P&L",
    guideId: "expenses",
    anchor: "pnl",
  },
];

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  guideId: string;
  guideTitle: string;
  type: "guide" | "section" | "faq";
  label: string;
  anchor?: string;
}

/**
 * Search across guide titles, section titles, and popular FAQ questions.
 * Case-insensitive `String.includes` matching.
 * Returns empty array for empty / whitespace-only queries.
 */
export function searchGuides(query: string): SearchResult[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return [];

  const results: SearchResult[] = [];

  for (const guide of HELP_GUIDES) {
    // Match guide title
    if (guide.title.toLowerCase().includes(trimmed)) {
      results.push({
        guideId: guide.id,
        guideTitle: guide.title,
        type: "guide",
        label: guide.title,
      });
    }

    // Match section titles within the guide
    for (const section of guide.sections) {
      if (section.title.toLowerCase().includes(trimmed)) {
        results.push({
          guideId: guide.id,
          guideTitle: guide.title,
          type: "section",
          label: section.title,
          anchor: section.id,
        });
      }
    }
  }

  // Match popular FAQ questions
  for (const faq of POPULAR_QUESTIONS) {
    if (faq.question.toLowerCase().includes(trimmed)) {
      const guide = HELP_GUIDES.find((g) => g.id === faq.guideId);
      results.push({
        guideId: faq.guideId,
        guideTitle: guide?.title ?? faq.guideId,
        type: "faq",
        label: faq.question,
        anchor: faq.anchor,
      });
    }
  }

  return results;
}
