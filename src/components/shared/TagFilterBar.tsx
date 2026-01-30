import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagFilterBarProps {
  tags: { id: number; name: string }[];
  selectedTagIds: number[];
  onToggleTag: (tagId: number) => void;
}

export function TagFilterBar({ tags, selectedTagIds, onToggleTag }: TagFilterBarProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-medium text-gray-700">Filter by Tags:</h3>
        {selectedTagIds.length > 0 && (
          <button
            onClick={() => selectedTagIds.forEach(id => onToggleTag(id))}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear all
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id);
          return (
            <Badge
              key={tag.id}
              variant={isSelected ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-all duration-200 select-none",
                isSelected
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600"
                  : "bg-white hover:bg-gray-100 text-gray-700 border-gray-300"
              )}
              onClick={() => onToggleTag(tag.id)}
            >
              {tag.name}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
