import { useQuery } from "@tanstack/react-query";
import {
  listWorkspaceConversations,
  listWorkspaceConversationMessages,
} from "@/lib/app-api";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: listWorkspaceConversations,
  });
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["conversations", conversationId, "messages"],
    queryFn: () => listWorkspaceConversationMessages(conversationId!),
    enabled: !!conversationId,
  });
}
