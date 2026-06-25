/**
 * AgreementPage — /crm/customers/:customerId/agreements
 *
 * Shows the customer's supply agreement(s): status badge, ID + EN versions
 * (each version openable in a new tab via getFileUrl → ctx.storage.getUrl()),
 * last-uploaded date, and linked subscriptions (A4).
 *
 * Upload flow:
 *   • No agreement yet → AgreementUpload in "create" mode → createSupplyAgreement.
 *   • Agreement exists → AgreementUpload in "add-version" mode → addAgreementVersion.
 *
 * Storage URL pattern: each VersionRow calls getFileUrl({ storageId }) via
 * useSessionQuery. This resolves ctx.storage.getUrl() server-side and returns
 * a signed URL the browser can open directly. VersionRow is a React component
 * so hook calls are valid (Pitfall #9).
 *
 * CRM design principles:
 *   A1: all references render as links — version rows open in new tab.
 *   A2: breadcrumbs mirror object hierarchy.
 *   A4: bidirectional link — agreement ↔ subscription.
 *   D11: manager+admin only (query roles match route permission canAccessCrm).
 *   D12: designed loading / empty / error states.
 *
 * Pitfall #9: all hooks before early returns.
 * Pitfall #19: query roles: ["manager","admin"] matches canAccessCrm.
 */

import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  FileText,
  Link2,
  Link2Off,
  Loader2,
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
// VersionOpenButton — resolves a storage URL and renders an "Open" link.
// Uses its own hook so each row subscribes independently without violating
// Rules of Hooks (each VersionRow is a component, not a conditional call).
// ---------------------------------------------------------------------------

interface VersionOpenButtonProps {
  storageId: Id<"_storage">;
  fileName: string;
}

function VersionOpenButton({ storageId, fileName }: VersionOpenButtonProps) {
  const url = useSessionQuery(api.crm.agreements.getFileUrl, { storageId });

  if (url === undefined) {
    // Still resolving
    return (
      <Button variant="ghost" size="sm" disabled aria-label="Resolving…">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      </Button>
    );
  }

  if (url === null) {
    // Storage object not found
    return (
      <Button variant="ghost" size="sm" disabled aria-label="File not found">
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-xs text-muted-foreground hover:text-foreground"
      aria-label={`Open ${fileName}`}
      asChild
    >
      <a href={url} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Open {fileName}</span>
      </a>
    </Button>
  );
}

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
      className={`flex items-center gap-3 py-2 px-3 ${isLast ? "" : "border-b border-border/50"}`}
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
      {/* A1: version file opens in new tab via resolved storage URL. */}
      <VersionOpenButton
        storageId={version.fileStorageId}
        fileName={version.fileName}
      />
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
    fileSize: number,
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
    (
      storageId: Id<"_storage">,
      fileName: string,
      lang: "id" | "en",
      fileSize: number,
    ) => {
      onAddVersion(agreement._id, storageId, fileName, lang, fileSize);
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
    api.crm.agreements.listAgreementsByCustomer,
    customerId ? { customerId: customerId as Id<"customers"> } : "skip",
  ) as AgreementDoc[] | undefined | null;

  const generateUploadUrl = useSessionMutation(
    api.crm.agreements.generateAgreementUploadUrl,
  );
  const createSupplyAgreement = useSessionMutation(
    api.crm.agreements.createSupplyAgreement,
  );
  const addAgreementVersion = useSessionMutation(
    api.crm.agreements.addAgreementVersion,
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
    fileSize: number,
  ) {
    try {
      await createSupplyAgreement({
        customerId: customerIdTyped,
        fileStorageId: storageId,
        fileName,
        fileSize,
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
    // fileSize is not part of addAgreementVersion args (version entries don't
    // track size independently); the real size is stored on the primary doc.
    _fileSize: number,
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
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="-ml-2 text-xs text-muted-foreground"
          >
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
