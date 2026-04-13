import type {
  Account,
  AuditLog,
  ConversationSummary,
  Message,
} from "@agentchatjs/protocol";

export type OwnedConversationSummary = ConversationSummary & {
  ownedAgents: Array<{
    id: string;
    name: string;
  }>;
};

export type OwnedConversationMessage = Message & {
  senderName: string;
};

type ErrorPayload = {
  message?: string;
};

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  return response.json();
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const payload = await readJson(response);

  if (response.status === 401) {
    window.location.assign("/auth/login");
    throw new Error("Login required");
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? (payload as ErrorPayload).message
        : undefined;
    throw new Error(message ?? `Request failed with status ${response.status}`);
  }

  return payload as T;
}

export function listWorkspaceAccounts(): Promise<Account[]> {
  return requestJson<Account[]>("/app/api/accounts");
}

export function createWorkspaceAccount(input: {
  name: string;
  type?: "agent" | "admin";
  profile?: Record<string, unknown>;
}) {
  return requestJson<{ id: string; name: string; type: "agent" | "admin"; createdAt: string; profile: Record<string, unknown>; token: string }>(
    "/app/api/accounts",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function resetWorkspaceAccountToken(accountId: string) {
  return requestJson<{ accountId: string; token: string }>(
    `/app/api/accounts/${encodeURIComponent(accountId)}/reset-token`,
    {
      method: "POST",
    },
  );
}

export function listWorkspaceConversations(): Promise<OwnedConversationSummary[]> {
  return requestJson<OwnedConversationSummary[]>("/app/api/conversations");
}

export function listWorkspaceConversationMessages(
  conversationId: string,
): Promise<OwnedConversationMessage[]> {
  return requestJson<OwnedConversationMessage[]>(
    `/app/api/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
}

export function listWorkspaceAuditLogs(options: {
  conversationId?: string;
  limit?: number;
} = {}): Promise<AuditLog[]> {
  const params = new URLSearchParams();
  if (options.conversationId) {
    params.set("conversationId", options.conversationId);
  }
  if (options.limit) {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  return requestJson<AuditLog[]>(`/app/api/audit-logs${query ? `?${query}` : ""}`);
}
