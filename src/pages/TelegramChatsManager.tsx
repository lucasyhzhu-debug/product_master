/**
 * Phase 85 — Telegram chat registry admin page.
 *
 * Route:        /admin/telegram-chats
 * Gating:       <ProtectedRoute requiredPermission="canAccessTelegramChats">
 * Backend:      api.telegram.chatRegistry.{listChats, assignRole, archiveChat,
 *               restoreChat, sendTestMessage}
 *
 * Pattern reference: src/pages/ChannelRoutingManager.tsx (admin Manager convention).
 */

import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Send, Archive, RotateCcw, Copy, MoreHorizontal } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  useTelegramChats, useAssignRole, useArchiveChat, useRestoreChat, useSendTestMessage,
} from "@/hooks/convex/useTelegramChats";
import { formatShortWIB } from "@/lib/dateUtils";
import { KNOWN_TELEGRAM_ROLES } from "../../convex/telegram/config";

const TEST_MESSAGE_PREVIEW = (wibTime: string) =>
  `🧪 Test from FrollieProBot — wiring works! Sent at ${wibTime} WIB.`;

type ChatRow = {
  _id: string;
  chatId: string;
  chatType: "private" | "group" | "supergroup";
  title: string;
  role?: string;
  registeredBy?: number;
  registeredAt: number;
  lastSeenAt: number;
  archivedAt?: number;
  lastError?: { at: number; message: string };
};

type StatusKey = "archived" | "error" | "live" | "dormant";

function deriveStatus(row: ChatRow, nowMs: number): StatusKey {
  if (row.archivedAt !== undefined) return "archived";
  if (row.lastError && nowMs - row.lastError.at < 24 * 60 * 60 * 1000) return "error";
  if (row.role) return "live";
  return "dormant";
}

function StatusBadge({ status }: { status: StatusKey }) {
  const map: Record<StatusKey, { dot: string; label: string; cls: string }> = {
    live:     { dot: "●", label: "Live",     cls: "text-green-600" },
    dormant:  { dot: "○", label: "Dormant",  cls: "text-amber-600" },
    error:    { dot: "⚠", label: "Error",    cls: "text-red-600" },
    archived: { dot: "▣", label: "Archived", cls: "text-muted-foreground" },
  };
  const { dot, label, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${cls}`}>
      <span aria-hidden>{dot}</span>{label}
    </span>
  );
}

export function TelegramChatsManager() {
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [reassignTarget, setReassignTarget] = useState<{
    chatId: string; role: string; currentHolderTitle: string;
  } | null>(null);
  // Capture the preview WIB time when the dialog opens (not from mount-time
  // `now`) so it matches the time the backend stamps at send.
  const [testPreview, setTestPreview] = useState<{ chatId: string; wibTime: string } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);

  const chats = useTelegramChats(showArchived);
  const assignRole = useAssignRole();
  const archiveChat = useArchiveChat();
  const restoreChat = useRestoreChat();
  const sendTest = useSendTestMessage();

  const filtered = useMemo(() => {
    if (!chats) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.role && c.role.toLowerCase().includes(q)),
    );
  }, [chats, search]);

  // Captured once at mount (pure during render — react-hooks/purity); the error
  // badge freshness window is 24h, so a mount-time snapshot is fine here.
  const [now] = useState(() => Date.now());

  if (chats === undefined) {
    return (
      <div className="container mx-auto p-6">
        <PageHeader title="Telegram Chats" description="Loading..." />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (chats.length === 0) {
    return <EmptyState />;
  }

  async function handleRoleChange(row: ChatRow, value: string) {
    const newRole = value === "_none" ? null : value;
    // No-op: the chat already holds this value (incl. None→None). Avoid a
    // spurious mutation + misleading toast.
    if (newRole === (row.role ?? null)) return;
    if (newRole === null) {
      try {
        await assignRole({ chatId: row.chatId, role: null });
        toast.success("Role cleared");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to clear role");
      }
      return;
    }
    // Display-only conflict check from already-fetched data — surfaces the
    // reassign dialog. NOT the enforcement point: assignRole re-resolves the
    // current holder atomically server-side (forceReassign).
    const holder = chats?.find(
      (c) => c.role === newRole && c.archivedAt === undefined && c.chatId !== row.chatId,
    );
    if (holder) {
      setReassignTarget({
        chatId: row.chatId,
        role: newRole,
        currentHolderTitle: holder.title,
      });
      return;
    }
    try {
      await assignRole({ chatId: row.chatId, role: newRole });
      toast.success("Role assigned");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign");
    }
  }

  async function confirmReassign() {
    if (!reassignTarget) return;
    const { chatId, role } = reassignTarget;
    setReassignTarget(null);
    try {
      await assignRole({ chatId, role, forceReassign: true });
      toast.success("Role reassigned");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reassign");
    }
  }

  async function handleArchive(chatId: string) {
    try {
      await archiveChat(chatId);
      toast.success("Chat archived");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive");
    }
  }

  async function handleRestore(chatId: string) {
    try {
      await restoreChat(chatId);
      toast.success("Chat restored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    const chatId = archiveTarget;
    setArchiveTarget(null);
    await handleArchive(chatId);
  }

  async function confirmTestSend() {
    if (!testPreview) return;
    const { chatId } = testPreview;
    setTestPreview(null);
    try {
      await sendTest(chatId);
      toast.success("Test message sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test send failed");
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        title="Telegram Chats"
        description="Manage chats where FrollieProBot delivers messages."
        action={
          <div className="flex items-center gap-2">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} id="show-archived" />
            <label htmlFor="show-archived" className="text-sm">Show archived</label>
          </div>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="p-4">
            <Input
              placeholder="Search by title or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Chat ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Seen</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((row) => {
                const status = deriveStatus(row, now);
                return (
                  <Fragment key={row._id}>
                    <TableRow>
                      <TableCell>{row.title}</TableCell>
                      <TableCell className="text-muted-foreground">{row.chatType}</TableCell>
                      <TableCell className="font-mono text-xs">{row.chatId}</TableCell>
                      <TableCell>
                        <Select
                          value={row.role ?? "_none"}
                          onValueChange={(value) => {
                            void handleRoleChange(row, value);
                          }}
                        >
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">None</SelectItem>
                            {KNOWN_TELEGRAM_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><StatusBadge status={status} /></TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatShortWIB(row.lastSeenAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() =>
                                setTestPreview({
                                  chatId: row.chatId,
                                  wibTime: new Date(Date.now() + 7 * 60 * 60 * 1000)
                                    .toISOString()
                                    .slice(11, 19),
                                })
                              }
                            >
                              <Send className="mr-2 h-4 w-4" /> Test send
                            </DropdownMenuItem>
                            {row.archivedAt === undefined ? (
                              <DropdownMenuItem onSelect={() => setArchiveTarget(row.chatId)}>
                                <Archive className="mr-2 h-4 w-4" /> Archive
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => void handleRestore(row.chatId)}>
                                <RotateCcw className="mr-2 h-4 w-4" /> Restore
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {row.lastError && status === "error" && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="bg-red-50 dark:bg-red-950/30 pl-12 text-sm text-red-700 dark:text-red-300"
                        >
                          ⚠ {formatShortWIB(row.lastError.at)} — {row.lastError.message}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={reassignTarget !== null} onOpenChange={(o) => !o && setReassignTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reassign role?</AlertDialogTitle>
            <AlertDialogDescription>
              {reassignTarget && (
                <>
                  <b>{reassignTarget.role}</b> is currently delivered to{" "}
                  <i>'{reassignTarget.currentHolderTitle}'</i>. Reassign to this chat?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmReassign()}>
              Reassign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={testPreview !== null} onOpenChange={(o) => !o && setTestPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send test message?</AlertDialogTitle>
            <AlertDialogDescription>This message will be sent to the Telegram chat:</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-sm">
            {testPreview && TEST_MESSAGE_PREVIEW(testPreview.wibTime)}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmTestSend()}>
              Send to Telegram
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive confirmation — destructive (clears role + stops cron delivery). */}
      <AlertDialog open={archiveTarget !== null} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              Cron jobs and tests will stop delivering here. You can restore later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmArchive()}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState() {
  const REGISTER_CMD = "/register@FrollieProBot";
  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <PageHeader
        title="Telegram Chats"
        description="Manage chats where FrollieProBot delivers messages."
      />
      <Card>
        <CardContent className="py-12 text-center space-y-6">
          <div className="inline-block rounded-2xl bg-blue-100 dark:bg-blue-950 p-4 text-2xl">
            ✈ <span className="text-base">Hi! I'm @FrollieProBot</span>
          </div>
          <div>
            <h3 className="text-lg font-medium">No chats registered yet</h3>
          </div>
          <ol className="text-left max-w-md mx-auto space-y-4">
            <li>
              <span className="font-medium">1.</span> Add @FrollieProBot to your Telegram group
            </li>
            <li>
              <span className="font-medium">2.</span> Send{" "}
              <code className="rounded bg-muted px-2 py-1 font-mono text-sm">{REGISTER_CMD}</code>{" "}
              <Button
                size="sm" variant="ghost"
                onClick={() => {
                  if (navigator.clipboard?.writeText) {
                    void navigator.clipboard.writeText(REGISTER_CMD);
                    toast.success("Copied");
                  } else {
                    toast.error("Copy not supported — select and copy manually");
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </li>
            <li>
              <span className="font-medium">3.</span> Come back here and assign a role
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
