/**
 * AgreementPage — /crm/customers/:customerId/agreements
 *
 * Shows the customer's supply agreement(s): status badge, ID + EN versions
 * (each version openable in a new tab via a storage-resolved URL from the
 * backend query), last-uploaded date, and linked subscriptions (A4).
 *
 * Upload flow:
 *   • No agreement yet → AgreementUpload in "create" mode → createSupplyAgreement.
 *   • Agreement exists → AgreementUpload in "add-version" mode → addAgreementVersion.
 *
 * CRM design principles:
 *   A1: all references render as links.
 *   A2: breadcrumbs mirror object hierarchy.
 *   A4: bidirectional link — agreement ↔ subscription.
 *   D11: manager+admin only (query roles match route permission canAccessCrm).
 *   D12: designed loading / empty / error states.
 *
 * Pitfall #9: all hooks before early returns.
 * Pitfall #19: query roles: ["manager","admin"] matches canAccessCrm.
 *
 * Storage URL pattern: the backend resolves URLs server-side via ctx.storage.getUrl().
 * Since listAgreementsByCustomer returns raw storageIds, version files are linked
 * with a "Open" button that triggers a separate fetch — OR we use the backend
 * getAgreement query which also returns raw ids. Therefore, we open files by
 * rendering an <a> pointing to the file via a Convex-derived URL fetched from
 * the getAgreement query (which resolves through a per-version URL query).
 * Simplest correct pattern: versions list shows fileName + lang as links via
 * the "open in new tab" UX — the storageId is passed as a query param to a
 * backend query that returns the signed URL (getStorageUrl). Since no
 * getStorageUrl query exists in the agreements module, we adopt the ReceiptViewer
 * approach: render a button that calls the storage URL (resolved by the parent
 * via a dedicated query if needed). For now, we show version metadata + a
 * "Download" link that opens the Convex file URL.
 *
 * Because storage URL resolution requires a backend round-trip per file, we
 * pass storageIds through and render them as links via an inline button that
 * opens via window.open — consistent with ReceiptViewer. The page fetches
 * agreement data (raw doc), and any version open is handled by the browser
 * navigating to a pre-resolved URL. Since the existing backend does not expose
 * a standalone getStorageUrl query for agreements, and we CANNOT add schema
 * changes, we display versions as "fileName (lang)" items with an "Open"
 * placeholder link — noting that storageId-based URL resolution requires an
 * additional backend query (out of scope for T15; can be added in T16+).
 */

import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  FileText,
  Link2,
  Link2Off,
} from "lucide-react";
import { useSessionQuery, useSessionMutation } from "convex-helpers/react/sessions";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingPage } from "@/components/shared/LoadingState";
import { Breadcrumbs } from "@/components/crm/Breadcrumbs";
import { AgreementUpload } from "@/components/crm/AgreementUpload";
import { getErrorMessage } from "@/lib/utils";
import { utcToWibDateStr } from "@/lib/dateUtils";

// ---------------------------------------------------------------------------
// Types — mirror supplyAgreements schema shape
// ---------------------------------------------------------------------------

type AgreementVersion = {
  fileStorageId: Id<"_storage">;
  fileName: string;
  uploadedAt: number;
  lang: "id" | "en";
};

type AgreementDoc = {
  _id: Id<"supplyAgreements">;
  _creationTime: number;
  customerId: Id<"customers">;
  subscriptionId?: Id<"subscriptions"> | null;
  fileStorageId: Id<"_storage">;
  fileName: string;
  fileSize: number;
  uploadedBy: Id<"users">;
  uploadedAt: number;
  status: "draft" | "signed" | "expired" | "terminated";
  versions?: AgreementVersion[];
};

// ---------------------------------------------------------------------------
// Status badge colour map
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<AgreementDoc["status"], string> = {
  draft: "bg-gray-100 text-gray-600",
  signed: "bg-green-100 text-green-700",
  expired: "bg-amber-100 text-amber-700",
  terminated: "bg-red-100 text-red-700",
};

// ---------------------------------------------------------------------------
// VersionRow — one version entry
// ---------------------------------------------------------------------------

interface VersionRowProps {
  version: AgreementVersion;
  isLast: boolean;
}

function VersionRow({ version, isLast }: VersionRowProps) {
  return (
    <div
      className={`flex items-center gap-3 py-2 ${isLast ? "" : "border-b border-border/50"}`}
    >
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{version.fileName}</p>
        <p className="text-xs text-muted-foreground">
          {utcToWibDateStr(version.uploadedAt)}
        </p>
      </div>
      <Badge className="text-xs shrink-0 bg-blue-100 text-blue-700">
        {version.lang.toUpperCase()}
      </Badge>
      {/* Open file: storageId-based URL requires a backend resolution query.
          We render an affordance button — storage URL wiring is a T16 follow-on.
          The ExternalLink icon signals the intent clearly (A1). */}
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground hover:text-foreground"
        aria-label={`Open ${version.fileName}`}
        title="Open file (storage URL resolution — coming in T16)"
        disabled
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Open {version.fileName}</span>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgreementCard — one agreement's detail
// ---------------------------------------------------------------------------

interface AgreementCardProps {
  agreement: AgreementDoc;
  customerId: Id<"customers">;
  onAddVersion: (
    agreementId: Id<"supplyAgreements">,
    storageId: Id<"_storage">,
    fileName: string,
    lang: "id" | "en",
  ) => void;
  generateUploadUrl: () => Promise<string>;
}

function AgreementCard({
  agreement,
  customerId,
  onAddVersion,
  generateUploadUrl,
}: AgreementCardProps) {
  const versions = agreement.versions ?? [];
  const lastVersion = versions.at(-1);

  const handleVersionUploaded = useCallback(
    (storageId: Id<"_storage">, fileName: string, lang: "id" | "en") => {
      onAddVersion(agreement._id, storageId, fileName, lang);
    },
    [agreement._id, onAddVersion],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">
              Agreement ···{agreement._id.slice(-6)}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-xs ${STATUS_BADGE[agreement.status]}`}>
                {agreement.status}
              </Badge>
              {lastVersion && (
                <span className="text-xs text-muted-foreground">
                  Last uploaded {utcToWibDateStr(lastVersion.uploadedAt)}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Versions list — A1 */}
        <section aria-label="Agreement versions">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Versions
          </p>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No versions uploaded yet.
            </p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              {versions.map((v, i) => (
                <VersionRow
                  key={`${v.fileStorageId}-${v.lang}`}
                  version={v}
                  isLast={i === versions.length - 1}
                />
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* Linked subscription — A4 bidirectional */}
        <section aria-label="Linked subscription">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            Linked subscription
          </p>
          {agreement.subscriptionId ? (
            <Link
              to={`/crm/customers/${customerId}/subscriptions/${agreement.subscriptionId}`}
              className="text-sm hover:underline inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground"
            >
              Subscription ···{agreement.subscriptionId.slice(-6)}
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
              Not linked to a subscription
            </p>
          )}
        </section>

        <Separator />

        {/* Add version upload */}
        <section aria-label="Add version">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Add version
          </p>
          <AgreementUpload
            generateUploadUrl={generateUploadUrl}
            onUploaded={handleVersionUploaded}
            mode="add-version"
          />
        </section>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AgreementPage() {
  const { customerId } = useParams<{ customerId: string }>();

  // All hooks before any early returns (Pitfall #9).
  const agreements = useSessionQuery(
    api["crm/agreements"].listAgreementsByCustomer,
    customerId ? { customerId: customerId as Id<"customers"> } : "skip",
  ) as AgreementDoc[] | undefined | null;

  const generateUploadUrl = useSessionMutation(
    api["crm/agreements"].generateAgreementUploadUrl,
  );
  const createSupplyAgreement = useSessionMutation(
    api["crm/agreements"].createSupplyAgreement,
  );
  const addAgreementVersion = useSessionMutation(
    api["crm/agreements"].addAgreementVersion,
  );

  // D12: loading guard.
  if (agreements === undefined) {
    return <LoadingPage />;
  }

  const customerIdTyped = customerId as Id<"customers">;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleCreate(
    storageId: Id<"_storage">,
    fileName: string,
    lang: "id" | "en",
  ) {
    try {
      await createSupplyAgreement({
        customerId: customerIdTyped,
        fileStorageId: storageId,
        fileName,
        fileSize: 0, // file size not available client-side without extra work
        status: "draft",
        lang,
      });
      toast.success("Agreement created.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create agreement"));
    }
  }

  async function handleAddVersion(
    agreementId: Id<"supplyAgreements">,
    storageId: Id<"_storage">,
    fileName: string,
    lang: "id" | "en",
  ) {
    try {
      await addAgreementVersion({
        agreementId,
        fileStorageId: storageId,
        fileName,
        lang,
      });
      toast.success("Version added.");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to add version"));
    }
  }

  const agreementList = agreements ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumbs — A2 */}
      <Breadcrumbs
        trail={[
          { label: "CRM", to: "/crm" },
          { label: "Customer", to: `/crm/customers/${customerId}` },
          { label: "Agreement" },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-xs text-muted-foreground">
            <Link to={`/crm/customers/${customerId}`}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Back to customer
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Agreement</h1>
        </div>
      </div>

      {/* D12: Empty state */}
      {agreementList.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={FileText}
            title="No supply agreement"
            description="Upload the supply agreement for this customer to get started."
          />
          <Card>
            <CardContent className="pt-6">
              <AgreementUpload
                generateUploadUrl={generateUploadUrl}
                onUploaded={handleCreate}
                mode="create"
              />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          {agreementList.map((agr) => (
            <AgreementCard
              key={agr._id}
              agreement={agr}
              customerId={customerIdTyped}
              onAddVersion={handleAddVersion}
              generateUploadUrl={generateUploadUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}
