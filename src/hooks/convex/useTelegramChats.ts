/**
 * Phase 85 — Telegram chat registry hooks.
 *
 * All registry functions take an explicit `token` arg (raw query/mutation/action
 * + requireRole — the QRIS pattern; there is no protectedAction/useSessionAction
 * in this project, see useQrisCreate.ts). The token is read from the auth user.
 * Wrapping in named hooks keeps TelegramChatsManager + its RTL test decoupled
 * from convex/react (the test mocks THIS module by name).
 *
 * `useTelegramChats` returns `undefined` while the subscription resolves
 * (Convex pitfall #2) — the consumer must handle it.
 */
import { useQuery, useMutation, useConvex } from "convex/react";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../../convex/_generated/api";

export function useTelegramChats(includeArchived: boolean) {
  const { user } = useAuth();
  const token = user?.token ?? "";
  return useQuery(
    api.telegram.chatRegistry.listChats,
    token ? { token, includeArchived } : "skip",
  );
}

export function useAssignRole() {
  const { user } = useAuth();
  const token = user?.token ?? "";
  const fn = useMutation(api.telegram.chatRegistry.assignRole);
  return (args: {
    chatId: string;
    role: string | null;
    forceReassign?: boolean;
    restoreIfArchived?: boolean;
  }) => fn({ ...args, token });
}

export function useArchiveChat() {
  const { user } = useAuth();
  const token = user?.token ?? "";
  const fn = useMutation(api.telegram.chatRegistry.archiveChat);
  return (chatId: string) => fn({ chatId, token });
}

export function useRestoreChat() {
  const { user } = useAuth();
  const token = user?.token ?? "";
  const fn = useMutation(api.telegram.chatRegistry.restoreChat);
  return (chatId: string) => fn({ chatId, token });
}

export function useSendTestMessage() {
  const convex = useConvex();
  const { user } = useAuth();
  const token = user?.token ?? "";
  return (chatId: string) => {
    if (!convex) return Promise.resolve(undefined); // provider-tolerant for RTL
    return convex.action(api.telegram.chatRegistry.sendTestMessage, { chatId, token });
  };
}

export function useSendAnnouncement() {
  const convex = useConvex();
  const { user } = useAuth();
  const token = user?.token ?? "";
  return (role: string, text: string) => {
    if (!convex) return Promise.resolve(undefined); // provider-tolerant for RTL
    return convex.action(api.telegram.chatRegistry.sendAnnouncement, {
      role,
      text,
      token,
    });
  };
}
