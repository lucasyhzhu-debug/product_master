/**
 * LinkableObject — wraps a child in a link, a "coming in Dx" pill, or plain text.
 *
 * - `to` set → renders as a React Router Link (CRM principle A1: canonical links).
 * - `to=null` + `comingIn` set → muted pill "coming in {comingIn}" (D12 empty state).
 * - `to=null`, no `comingIn` → plain span.
 */
import { Link } from "react-router-dom";

interface LinkableObjectProps {
  /** Route to link to. Pass null when the target page is not yet implemented. */
  to: string | null;
  /** Phase label shown in the "coming in …" placeholder pill (e.g. "D2"). */
  comingIn?: string;
  children: React.ReactNode;
}

export function LinkableObject({ to, comingIn, children }: LinkableObjectProps) {
  if (to !== null) {
    return (
      <Link to={to} className="hover:underline underline-offset-2">
        {children}
      </Link>
    );
  }

  if (comingIn !== undefined) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span>{children}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          coming in {comingIn}
        </span>
      </span>
    );
  }

  return <span>{children}</span>;
}
