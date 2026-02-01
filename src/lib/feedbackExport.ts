/**
 * Feedback Export Utility
 * Generates markdown reports from visual feedback items for PRD documentation
 */

export interface FeedbackExportItem {
  _id: string;
  pageUrl: string;
  pageTitle: string;
  description: string;
  elementSelector?: string;
  priority: "low" | "medium" | "high";
  tags: string[];
  comments?: Array<{
    content: string;
    createdBy?: string;
    createdAt: number;
  }>;
  _creationTime: number;
}

/**
 * Format a timestamp into a human-readable date string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date string like "Jan 15, 2025 at 3:45 PM"
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const formattedDate = dateFormatter.format(date);
  const formattedTime = timeFormatter.format(date);

  return `${formattedDate} at ${formattedTime}`;
}

/**
 * Get priority emoji for visual indication
 * @param priority - Priority level
 * @returns Emoji representing the priority
 */
export function getPriorityEmoji(priority: "low" | "medium" | "high"): string {
  switch (priority) {
    case "low":
      return "\u{1F7E2}"; // Green circle
    case "medium":
      return "\u{1F7E1}"; // Yellow circle
    case "high":
      return "\u{1F534}"; // Red circle
    default:
      return "\u{26AA}"; // White circle (fallback)
  }
}

/**
 * Group feedback items by their page URL
 * @param items - Array of feedback items
 * @returns Map of page URL to feedback items
 */
function groupByPage(items: FeedbackExportItem[]): Map<string, FeedbackExportItem[]> {
  const grouped = new Map<string, FeedbackExportItem[]>();

  for (const item of items) {
    const existing = grouped.get(item.pageUrl) ?? [];
    existing.push(item);
    grouped.set(item.pageUrl, existing);
  }

  return grouped;
}

/**
 * Format a single feedback item as markdown
 * @param item - Feedback item to format
 * @param index - Index for numbering
 * @returns Markdown string for the item
 */
function formatFeedbackItem(item: FeedbackExportItem, index: number): string {
  const lines: string[] = [];

  // Item header with priority
  const priorityEmoji = getPriorityEmoji(item.priority);
  lines.push(`### ${index}. ${priorityEmoji} ${item.priority.charAt(0).toUpperCase() + item.priority.slice(1)} Priority`);
  lines.push("");

  // Description as blockquote
  lines.push("> " + item.description.split("\n").join("\n> "));
  lines.push("");

  // Element selector if present
  if (item.elementSelector) {
    lines.push(`**Element:** \`${item.elementSelector}\``);
    lines.push("");
  }

  // Tags
  if (item.tags.length > 0) {
    const tagList = item.tags.map(tag => `\`${tag}\``).join(" ");
    lines.push(`**Tags:** ${tagList}`);
    lines.push("");
  }

  // Created timestamp
  lines.push(`**Created:** ${formatTimestamp(item._creationTime)}`);
  lines.push("");

  // Comments section
  if (item.comments && item.comments.length > 0) {
    lines.push("**Comments:**");
    lines.push("");

    for (const comment of item.comments) {
      const author = comment.createdBy ?? "Anonymous";
      const timestamp = formatTimestamp(comment.createdAt);
      lines.push(`- **${author}** (${timestamp}):`);
      lines.push(`  ${comment.content}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate a PRD-style markdown report from feedback items
 * @param feedbackItems - Array of feedback items to export
 * @returns Formatted markdown string
 */
export function generatePrdMarkdown(feedbackItems: FeedbackExportItem[]): string {
  const lines: string[] = [];

  // Title
  lines.push("# Visual Feedback Report");
  lines.push("");

  // Generation timestamp
  lines.push(`*Generated on ${formatTimestamp(Date.now())}*`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`**Total items:** ${feedbackItems.length}`);
  lines.push("");

  // Priority breakdown
  const highCount = feedbackItems.filter(item => item.priority === "high").length;
  const mediumCount = feedbackItems.filter(item => item.priority === "medium").length;
  const lowCount = feedbackItems.filter(item => item.priority === "low").length;

  lines.push("| Priority | Count |");
  lines.push("|----------|-------|");
  lines.push(`| ${getPriorityEmoji("high")} High | ${highCount} |`);
  lines.push(`| ${getPriorityEmoji("medium")} Medium | ${mediumCount} |`);
  lines.push(`| ${getPriorityEmoji("low")} Low | ${lowCount} |`);
  lines.push("");

  // Handle empty case
  if (feedbackItems.length === 0) {
    lines.push("*No feedback items to display.*");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("---");
  lines.push("");

  // Group by page
  const groupedItems = groupByPage(feedbackItems);

  // Sort pages by number of feedback items (descending)
  const sortedPages = Array.from(groupedItems.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  // Generate sections for each page
  for (const [pageUrl, items] of sortedPages) {
    // Use the first item's page title for the section heading
    const pageTitle = items[0].pageTitle || "Untitled Page";

    lines.push(`## ${pageTitle}`);
    lines.push("");
    lines.push(`**URL:** [${pageUrl}](${pageUrl})`);
    lines.push("");
    lines.push(`*${items.length} feedback item${items.length !== 1 ? "s" : ""} on this page*`);
    lines.push("");

    // Sort items within page by priority (high first) then by creation time (newest first)
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sortedItems = [...items].sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b._creationTime - a._creationTime;
    });

    // Format each item
    let itemIndex = 1;
    for (const item of sortedItems) {
      lines.push(formatFeedbackItem(item, itemIndex));
      itemIndex++;
    }
  }

  // Footer
  lines.push("---");
  lines.push("");
  lines.push("*End of Visual Feedback Report*");
  lines.push("");

  return lines.join("\n");
}

/**
 * Copy content to the system clipboard
 * @param content - Text content to copy
 * @throws Error if clipboard API is unavailable
 */
export async function copyToClipboard(content: string): Promise<void> {
  if (!navigator.clipboard) {
    throw new Error("Clipboard API is not available in this browser");
  }

  try {
    await navigator.clipboard.writeText(content);
  } catch (error) {
    throw new Error(
      `Failed to copy to clipboard: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
