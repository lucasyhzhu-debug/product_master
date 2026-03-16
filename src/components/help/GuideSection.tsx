import { type ReactNode } from "react";
import { RoleTag } from "./RoleTag";

interface GuideSectionProps {
  id: string;
  title: string;
  role?: "all" | "manager" | "admin";
  children: ReactNode;
}

export function GuideSection({ id, title, role, children }: GuideSectionProps) {
  return (
    <section id={id} style={{ scrollMarginTop: "80px" }}>
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        {role && <RoleTag role={role} />}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
