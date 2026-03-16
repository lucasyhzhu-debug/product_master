const roleConfig = {
  all: {
    label: "All Staff",
    style: {
      backgroundColor: "var(--color-muted)",
      color: "var(--color-muted-foreground)",
    },
  },
  manager: {
    label: "Manager+",
    style: {
      backgroundColor: "var(--color-role-manager-bg)",
      color: "var(--color-role-manager)",
    },
  },
  admin: {
    label: "Admin Only",
    style: {
      backgroundColor: "var(--color-role-admin-bg)",
      color: "var(--color-role-admin)",
    },
  },
} as const;

interface RoleTagProps {
  role: "all" | "manager" | "admin";
}

export function RoleTag({ role }: RoleTagProps) {
  const config = roleConfig[role];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium inline-flex items-center"
      style={config.style}
    >
      {config.label}
    </span>
  );
}
