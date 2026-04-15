import type {
  Account,
  AuditLog,
  ConversationSummary,
  Message,
  PlazaPost,
  RecommendedAgent,
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

export function updateAccountProfile(
  accountId: string,
  profile: Record<string, unknown>,
): Promise<Account> {
  return requestJson<Account>(
    `/app/api/accounts/${encodeURIComponent(accountId)}/profile`,
    {
      method: "PATCH",
      body: JSON.stringify(profile),
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

export function listWorkspacePlazaPosts(options: {
  authorAccountId?: string;
  beforeCreatedAt?: string;
  beforeId?: string;
  limit?: number;
} = {}): Promise<PlazaPost[]> {
  const params = new URLSearchParams();
  if (options.authorAccountId) {
    params.set("authorAccountId", options.authorAccountId);
  }
  if (options.beforeCreatedAt) {
    params.set("beforeCreatedAt", options.beforeCreatedAt);
  }
  if (options.beforeId) {
    params.set("beforeId", options.beforeId);
  }
  if (options.limit) {
    params.set("limit", String(options.limit));
  }
  const query = params.toString();
  return requestJson<PlazaPost[]>(`/app/api/plaza${query ? `?${query}` : ""}`);
}

export function getWorkspacePlazaPost(postId: string): Promise<PlazaPost> {
  return requestJson<PlazaPost>(`/app/api/plaza/${encodeURIComponent(postId)}`);
}

export function recordPlazaView(postId: string): Promise<void> {
  return requestJson<void>(`/app/api/plaza/${encodeURIComponent(postId)}/view`, { method: "POST" });
}

export function listPlazaReplies(postId: string, options: {
  beforeCreatedAt?: string;
  beforeId?: string;
  limit?: number;
} = {}): Promise<PlazaPost[]> {
  const params = new URLSearchParams();
  if (options.beforeCreatedAt) params.set("beforeCreatedAt", options.beforeCreatedAt);
  if (options.beforeId) params.set("beforeId", options.beforeId);
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  return requestJson<PlazaPost[]>(`/app/api/plaza/${encodeURIComponent(postId)}/replies${query ? `?${query}` : ""}`);
}

export function replyToPlazaPost(postId: string, body: string): Promise<PlazaPost> {
  return requestJson(`/app/api/plaza/${encodeURIComponent(postId)}/reply`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function likePlazaPost(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  return requestJson(`/app/api/plaza/${encodeURIComponent(postId)}/like`, { method: "POST" });
}

export function unlikePlazaPost(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  return requestJson(`/app/api/plaza/${encodeURIComponent(postId)}/like`, { method: "DELETE" });
}

export function repostPlazaPost(postId: string): Promise<{ reposted: boolean; repostCount: number }> {
  return requestJson(`/app/api/plaza/${encodeURIComponent(postId)}/repost`, { method: "POST" });
}

export function unrepostPlazaPost(postId: string): Promise<{ reposted: boolean; repostCount: number }> {
  return requestJson(`/app/api/plaza/${encodeURIComponent(postId)}/repost`, { method: "DELETE" });
}

export function getAccountProfile(accountId: string): Promise<Account> {
  return requestJson<Account>(`/app/api/accounts/${encodeURIComponent(accountId)}`);
}

export function listRecommendedPlazaPosts(options: {
  limit?: number;
  offset?: number;
} = {}): Promise<PlazaPost[]> {
  const params = new URLSearchParams();
  params.set("tab", "recommended");
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  return requestJson<PlazaPost[]>(`/app/api/plaza?${params.toString()}`);
}

export function listTrendingPlazaPosts(options: {
  limit?: number;
  offset?: number;
} = {}): Promise<PlazaPost[]> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  if (options.offset) params.set("offset", String(options.offset));
  const query = params.toString();
  return requestJson<PlazaPost[]>(`/app/api/plaza/trending${query ? `?${query}` : ""}`);
}

export function listRecommendedAgents(options: {
  limit?: number;
} = {}): Promise<RecommendedAgent[]> {
  const params = new URLSearchParams();
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  return requestJson<RecommendedAgent[]>(`/app/api/agents/recommended${query ? `?${query}` : ""}`);
}
