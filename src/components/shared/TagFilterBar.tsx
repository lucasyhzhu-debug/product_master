import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Support both number (legacy) and string (Convex) IDs
type TagId = number | string;

interface TagFilterBarProps {
  tags: { id?: TagId; _id?: string; name: string }[];
  selectedTagIds: TagId[];
  onToggleTag: (tagId: TagId) => void;
}

export function TagFilterBar({ tags, selectedTagIds, onToggleTag }: TagFilterBarProps) {
  if (tags.length === 0) {
    return null;
  }

  // Normalize tag ID (Convex uses _id, legacy uses id)
  const getTagId = (tag: { id?: TagId; _id?: string }): TagId => tag._id ?? tag.id ?? '';

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-medium text-foreground">Filter by Tags:</h3>
        {selectedTagIds.length > 0 && (
          <button
            onClick={() => selectedTagIds.forEach(id => onToggleTag(id))}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const tagId = getTagId(tag);
          const isSelected = selectedTagIds.includes(tagId);
          return (
            <Badge
              key={String(tagId)}
              variant={isSelected ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-all duration-200 select-none",
                isSelected
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 dark:bg-indigo-700 dark:hover:bg-indigo-600"
                  : "bg-card hover:bg-muted text-foreground border-border"
              )}
              onClick={() => onToggleTag(tagId)}
            >
              {tag.name}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
