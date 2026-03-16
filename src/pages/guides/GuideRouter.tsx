import { useParams, Link } from "react-router-dom";
import { FileQuestion } from "lucide-react";
import { HELP_GUIDES } from "@/lib/helpGuides";

export function GuideRouter() {
  const { guideId } = useParams<{ guideId: string }>();

  const guide = HELP_GUIDES.find((g) => g.id === guideId);

  // Render guide component if found, live, and has a component
  if (guide && guide.status === "live" && guide.component) {
    const GuideComponent = guide.component;
    return (
      <GuideComponent
        title={guide.title}
        description={guide.description}
        sections={guide.sections}
        readTimeMinutes={guide.readTimeMinutes}
      />
    );
  }

  // Guide not found / coming-soon / no component
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4">
      <FileQuestion className="h-16 w-16 text-muted-foreground/40 mb-4" />
      <h1 className="text-xl font-semibold mb-2">Guide not found</h1>
      <p className="text-sm text-muted-foreground mb-6">
        The guide you&apos;re looking for doesn&apos;t exist or isn&apos;t
        available yet.
      </p>
      <Link to="/help" className="text-sm text-primary hover:underline">
        Back to Help Center
      </Link>
    </div>
  );
}
