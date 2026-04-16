import { jsonResponse } from "../server.js";
import type { RouteContext } from "./types.js";

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { server, request, response, url, method } = ctx;

  if (method === "GET" && url.pathname === "/app/api/conversations") {
    const session = await server.requireUserSession(request);
    jsonResponse(response, 200, await server.listOwnedConversations(session.subject));
    return true;
  }

  if (method === "GET" && url.pathname === "/app/api/audit-logs") {
    const session = await server.requireUserSession(request);
    const conversationId =
      typeof url.query.conversationId === "string" ? url.query.conversationId : undefined;
    const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
    jsonResponse(
      response,
      200,
      await server.listOwnedAuditLogs(session.subject, {
        ...(conversationId ? { conversationId } : {}),
        ...(limit ? { limit } : {}),
      }),
    );
    return true;
  }

  const appConversationMessagesMatch =
    url.pathname?.match(/^\/app\/api\/conversations\/([^/]+)\/messages$/);
  if (method === "GET" && appConversationMessagesMatch) {
    const session = await server.requireUserSession(request);
    const before = typeof url.query.before === "string" ? Number(url.query.before) : undefined;
    const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
    jsonResponse(
      response,
      200,
      await server.listOwnedConversationMessages(
        session.subject,
        appConversationMessagesMatch[1]!,
        before,
        limit,
      ),
    );
    return true;
  }

  return false;
}
