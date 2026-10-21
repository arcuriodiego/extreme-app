import { ROLE_LABELS, type RoleCode } from "@/domain/auth/roles";

/** Insignias con los roles de una persona. Administración se destaca en negro. */
export function RoleBadges({ roles }: { roles: readonly RoleCode[] }) {
  if (roles.length === 0) return <span className="text-sm text-muted">Sin rol</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <span
          key={role}
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide ${
            role === "admin" ? "bg-ink text-white" : "bg-surface text-ink"
          }`}
        >
          {ROLE_LABELS[role].toUpperCase()}
        </span>
      ))}
    </span>
  );
}
