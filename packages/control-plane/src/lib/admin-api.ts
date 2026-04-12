import type {
  Account,
  AuditLog,
  AuthAccount,
  ConversationSummary,
  Message,
} from "@agentchat/protocol";

export type AdminHealth = {
  ok: boolean;
  httpUrl: string;
  wsUrl: string;
  databasePath: string;
  adminAuthEnabled: boolean;
  googleAuthEnabled: boolean;
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
    window.location.assign("/admin/ui");
    throw new Error("Admin login required");
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

export function listAdminAccounts(): Promise<Account[]> {
  return requestJson<Account[]>("/admin/accounts");
}

export function createAdminAccount(input: {
  name: string;
  type?: "agent" | "admin";
  profile?: Record<string, unknown>;
}): Promise<AuthAccount> {
  return requestJson<AuthAccount>("/admin/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resetAdminAccountToken(accountId: string): Promise<{ accountId: string; token: string }> {
  return requestJson<{ accountId: string; token: string }>(
    `/admin/accounts/${encodeURIComponent(accountId)}/reset-token`,
    {
      method: "POST",
    },
  );
}

export function listAdminAccountConversations(accountId: string): Promise<ConversationSummary[]> {
  return requestJson<ConversationSummary[]>(
    `/admin/accounts/${encodeURIComponent(accountId)}/conversations`,
  );
}

export function listAdminConversationMessages(
  accountId: string,
  conversationId: string,
): Promise<Message[]> {
  const params = new URLSearchParams({
    accountId,
  });
  return requestJson<Message[]>(
    `/admin/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
  );
}

export function sendAdminMessage(input: {
  senderId: string;
  conversationId: string;
  body: string;
}): Promise<{ conversation: ConversationSummary; message: Message }> {
  return requestJson<{ conversation: ConversationSummary; message: Message }>("/admin/messages", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listAdminAuditLogs(options: {
  accountId?: string;
  conversationId?: string;
  limit?: number;
} = {}): Promise<AuditLog[]> {
  const params = new URLSearchParams();
  if (options.accountId) {
    params.set("accountId", options.accountId);
  }
  if (options.conversationId) {
    params.set("conversationId", options.conversationId);
  }
  if (options.limit) {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  return requestJson<AuditLog[]>(`/admin/audit-logs${query ? `?${query}` : ""}`);
}

export function getAdminHealth(): Promise<AdminHealth> {
  return requestJson<AdminHealth>("/admin/health");
}

export async function logoutAdmin(): Promise<void> {
  await requestJson<{ ok: boolean }>("/admin/logout", {
    method: "POST",
  });
}
