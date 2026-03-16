import { useMemo, useRef, useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useActiveSection } from "@/hooks/useActiveSection";

interface GuideLayoutProps {
  title: string;
  description?: string;
  sections: { id: string; title: string }[];
  readTimeMinutes?: number;
  children: ReactNode;
}

export function GuideLayout({
  title,
  description,
  sections,
  readTimeMinutes,
  children,
}: GuideLayoutProps) {
  const sectionIds = useMemo(
    () => sections.map((s) => s.id),
    [sections]
  );
  const activeSection = useActiveSection(sectionIds);

  return (
    <div>
      {/* Back link */}
      <Link
        to="/help"
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Help Center
      </Link>

      {/* Title area */}
      <h1 className="text-2xl font-bold">{title}</h1>
      {description && (
        <p className="text-muted-foreground mt-1">{description}</p>
      )}
      <p className="text-sm text-muted-foreground mt-2">
        {sections.length} sections
        {readTimeMinutes != null && ` \u2014 ${readTimeMinutes} min read`}
      </p>

      {/* Mobile tabs */}
      <MobileTabs
        sections={sections}
        activeSection={activeSection}
      />

      {/* Two-column layout on desktop */}
      <div className="flex gap-8 mt-8">
        {/* Sidebar TOC (desktop only) */}
        <SidebarToc
          sections={sections}
          activeSection={activeSection}
        />

        {/* Content area */}
        <main className="flex-1 min-w-0 max-w-3xl space-y-12">
          {children}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar TOC (desktop)
// ---------------------------------------------------------------------------

function SidebarToc({
  sections,
  activeSection,
}: {
  sections: { id: string; title: string }[];
  activeSection: string | null;
}) {
  return (
    <div className="hidden lg:block w-56 shrink-0">
      <nav className="sticky top-20 space-y-1">
        {sections.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(section.id)
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`block border-l-2 pl-3 text-sm transition-colors duration-200 ${
                isActive
                  ? "font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              style={
                isActive
                  ? { borderColor: "var(--color-primary)" }
                  : undefined
              }
            >
              {section.title}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile tabs (horizontal scroll)
// ---------------------------------------------------------------------------

function MobileTabs({
  sections,
  activeSection,
}: {
  sections: { id: string; title: string }[];
  activeSection: string | null;
}) {
  const tabRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());

  // Auto-scroll active tab into view
  useEffect(() => {
    if (activeSection) {
      const tabEl = tabRefs.current.get(activeSection);
      if (tabEl) {
        tabEl.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }
    }
  }, [activeSection]);

  return (
    <div className="lg:hidden overflow-x-auto whitespace-nowrap flex gap-2 pb-2 mb-6 mt-6 -mx-4 px-4 border-b">
      {sections.map((section) => {
        const isActive = activeSection === section.id;
        return (
          <a
            key={section.id}
            ref={(el) => {
              if (el) {
                tabRefs.current.set(section.id, el);
              } else {
                tabRefs.current.delete(section.id);
              }
            }}
            href={`#${section.id}`}
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById(section.id)
                ?.scrollIntoView({ behavior: "smooth" });
            }}
            className={`px-3 py-1.5 rounded-full text-sm shrink-0 ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {section.title}
          </a>
        );
      })}
    </div>
  );
}
