import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HELP_GUIDES,
  searchGuides,
  POPULAR_QUESTIONS,
  type SearchResult,
} from "@/lib/helpGuides";

// ---------------------------------------------------------------------------
// Accent color mappings
// ---------------------------------------------------------------------------

const ACCENT_BG: Record<string, string> = {
  orange: "bg-orange-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
};

const ACCENT_TEXT: Record<string, string> = {
  orange: "text-orange-500",
  green: "text-green-500",
  blue: "text-blue-500",
  purple: "text-purple-500",
  rose: "text-rose-500",
  amber: "text-amber-500",
};

// ---------------------------------------------------------------------------
// Framer Motion variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// ---------------------------------------------------------------------------
// Search result type badge
// ---------------------------------------------------------------------------

const TYPE_BADGE: Record<string, string> = {
  guide: "Guide",
  section: "Section",
  faq: "FAQ",
};

// ---------------------------------------------------------------------------
// HelpCenter
// ---------------------------------------------------------------------------

export function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K focus handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Search handler
  const onSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);
      const results = searchGuides(value);
      setSearchResults(results);
      setShowResults(value.trim().length > 0 && results.length > 0);
    },
    []
  );

  // Hide dropdown on blur with delay to allow click registration
  const onSearchBlur = useCallback(() => {
    setTimeout(() => setShowResults(false), 200);
  }, []);

  return (
    <div className="py-8 px-4 max-w-5xl mx-auto">
      {/* Hero section */}
      <div className="text-center py-12 px-4">
        <h1 className="text-3xl font-bold">How can we help you?</h1>
        <p className="text-muted-foreground mt-2">
          Step-by-step guides, visual walkthroughs, and answers to common
          questions
        </p>

        {/* Search bar */}
        <div className="relative max-w-lg mx-auto mt-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={onSearchChange}
            onBlur={onSearchBlur}
            onFocus={() => {
              if (searchQuery.trim().length > 0 && searchResults.length > 0) {
                setShowResults(true);
              }
            }}
            placeholder="Search guides and FAQs..."
            className="pl-10 pr-16 rounded-lg border bg-background shadow-sm focus:ring-2 focus:ring-primary/20 h-11 w-full text-sm outline-none"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded pointer-events-none">
            Ctrl K
          </span>

          {/* Search results dropdown */}
          {showResults && (
            <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-popover border rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {searchResults.map((result, i) => (
                <Link
                  key={`${result.guideId}-${result.type}-${result.anchor ?? i}`}
                  to={
                    "/help/" +
                    result.guideId +
                    (result.anchor ? "#" + result.anchor : "")
                  }
                  onClick={() => {
                    setShowResults(false);
                    setSearchQuery("");
                  }}
                  className="flex items-center gap-2 py-2 px-3 hover:bg-accent transition-colors text-sm"
                >
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                    {TYPE_BADGE[result.type] ?? result.type}
                  </span>
                  <span className="truncate">{result.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground truncate shrink-0">
                    {result.guideTitle}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Guide cards grid */}
      <div className="mt-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Workflow Guides
        </h2>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {HELP_GUIDES.map((guide) => {
            const isComingSoon = guide.status === "coming-soon";
            const card = (
              <motion.div key={guide.id} variants={cardVariants}>
                <div
                  className={cn(
                    "rounded-lg overflow-hidden",
                    isComingSoon
                      ? "opacity-50 cursor-default select-none"
                      : "group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                  )}
                >
                  {/* Accent bar */}
                  <div
                    className={cn(
                      "h-1 rounded-t-lg",
                      ACCENT_BG[guide.accentColor]
                    )}
                  />

                  {/* Card body */}
                  <div className="bg-card border border-t-0 rounded-b-lg p-5">
                    <div className="flex items-start justify-between gap-3">
                      <guide.icon
                        className={cn(
                          "h-8 w-8 shrink-0",
                          ACCENT_TEXT[guide.accentColor]
                        )}
                      />
                      <div className="flex gap-1.5">
                        {guide.isNew && (
                          <span className="text-[10px] font-bold uppercase bg-green-100 text-green-700 rounded px-1.5 py-0.5">
                            NEW
                          </span>
                        )}
                        {isComingSoon && (
                          <span className="text-[10px] font-bold uppercase bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                            COMING SOON
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-semibold mt-3">{guide.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {guide.description}
                    </p>

                    {guide.sections.length > 0 &&
                      guide.readTimeMinutes > 0 && (
                        <p className="text-xs text-muted-foreground mt-3">
                          {guide.sections.length} sections &middot;{" "}
                          {guide.readTimeMinutes} min read
                        </p>
                      )}
                  </div>
                </div>
              </motion.div>
            );

            if (isComingSoon) {
              return card;
            }

            return (
              <motion.div key={guide.id} variants={cardVariants}>
                <Link
                  to={"/help/" + guide.id}
                  className="group block rounded-lg overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  {/* Accent bar */}
                  <div
                    className={cn(
                      "h-1 rounded-t-lg",
                      ACCENT_BG[guide.accentColor]
                    )}
                  />

                  {/* Card body */}
                  <div className="bg-card border border-t-0 rounded-b-lg p-5">
                    <div className="flex items-start justify-between gap-3">
                      <guide.icon
                        className={cn(
                          "h-8 w-8 shrink-0",
                          ACCENT_TEXT[guide.accentColor]
                        )}
                      />
                      <div className="flex gap-1.5">
                        {guide.isNew && (
                          <span className="text-[10px] font-bold uppercase bg-green-100 text-green-700 rounded px-1.5 py-0.5">
                            NEW
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="font-semibold mt-3">{guide.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {guide.description}
                    </p>

                    {guide.sections.length > 0 &&
                      guide.readTimeMinutes > 0 && (
                        <p className="text-xs text-muted-foreground mt-3">
                          {guide.sections.length} sections &middot;{" "}
                          {guide.readTimeMinutes} min read
                        </p>
                      )}
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Popular Questions section */}
      <div className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Popular Questions
        </h2>
        <div className="space-y-2">
          {POPULAR_QUESTIONS.map((q) => (
            <Link
              key={q.anchor}
              to={"/help/" + q.guideId + "#" + q.anchor}
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors group"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              {q.question}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
