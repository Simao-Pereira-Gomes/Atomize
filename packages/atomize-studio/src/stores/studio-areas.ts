export type StudioAreaId = "templates" | "generate" | "catalog";

export const STUDIO_AREAS: { id: StudioAreaId; icon: string; label: string; description: string }[] = [
  { id: "templates", icon: "📄", label: "Templates", description: "Author and manage Atomize task templates." },
  { id: "generate", icon: "⚡", label: "Generate", description: "Run a template against a live Azure DevOps work item." },
  { id: "catalog", icon: "📚", label: "Catalog", description: "Browse and clone templates shared by your team." },
];
