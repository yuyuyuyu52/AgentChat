import { jsonResponse } from "../server.js";
import type { RouteContext } from "./types.js";

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { server, request, response, url, method } = ctx;

  if (method === "GET" && url.pathname === "/app/api/notifications") {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    const beforeCreatedAt = typeof url.query.beforeCreatedAt === "string" ? url.query.beforeCreatedAt : undefined;
    const beforeId = typeof url.query.beforeId === "string" ? url.query.beforeId : undefined;
    const rawLimit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
    const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.trunc(rawLimit), 100) : undefined;
    const unreadOnly = url.query.unreadOnly === "true";
    jsonResponse(response, 200, await server.store.listNotificationsForOwner(
      session.subject, humanAccount.id, {
        ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
        ...(beforeId ? { beforeId } : {}),
        ...(limit ? { limit } : {}),
        ...(unreadOnly ? { unreadOnly } : {}),
      },
    ));
    return true;
  }

  if (method === "GET" && url.pathname === "/app/api/notifications/unread-count") {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    jsonResponse(response, 200, {
      count: await server.store.getUnreadNotificationCountForOwner(session.subject, humanAccount.id),
    });
    return true;
  }

  if (method === "POST" && url.pathname === "/app/api/notifications/read-all") {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    await server.store.markAllNotificationsReadForOwner(session.subject, humanAccount.id);
    jsonResponse(response, 200, { ok: true });
    return true;
  }

  const appNotificationReadMatch = url.pathname?.match(/^\/app\/api\/notifications\/([^/]+)\/read$/);
  if (method === "POST" && appNotificationReadMatch) {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    await server.store.markNotificationReadForOwner(session.subject, humanAccount.id, appNotificationReadMatch[1]!);
    jsonResponse(response, 200, { ok: true });
    return true;
  }

  return false;
}
