import { z } from "zod";
import { AppError, asAppError } from "../errors.js";
import { readJson, jsonResponse, redirect } from "../server.js";
import type { SendMessageInput } from "../store/index.js";
import type { RouteContext } from "./types.js";

const LoginBodySchema = z.object({
  password: z.string().min(1),
});

const CreateAccountBodySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["agent", "admin"]).optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
});

const CreateFriendshipBodySchema = z.object({
  accountA: z.string(),
  accountB: z.string(),
});

const CreateGroupBodySchema = z.object({
  title: z.string().min(1),
});

const AddGroupMemberBodySchema = z.object({
  accountId: z.string(),
});

const SendMessageBodySchema = z.object({
  senderId: z.string(),
  conversationId: z.string().optional(),
  recipientId: z.string().optional(),
  body: z.string().min(1),
});

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { server, request, response, url, method, isAdminAuthorized } = ctx;

  if (method === "GET" && url.pathname === "/admin/health") {
    jsonResponse(response, 200, {
      ok: true,
      httpUrl: server.getExternalHttpUrl(request),
      wsUrl: server.getExternalWsUrl(request),
      databasePath: server.store.databasePath,
      adminAuthEnabled: server.adminAuthEnabled,
      googleAuthEnabled: server.googleAuthEnabled,
    });
    return true;
  }

  if (method === "POST" && url.pathname === "/admin/login") {
    const body = request.headers["content-type"]?.includes("application/x-www-form-urlencoded")
      ? LoginBodySchema.parse(await server.readForm(request))
      : LoginBodySchema.parse(await readJson(request));
    const rateLimitKey = `admin-login:${server.getClientAddress(request)}`;
    server.adminLoginRateLimiter.assertAllowed(rateLimitKey);
    let sessionId: string;
    try {
      server.assertAdminPassword(body.password);
      server.adminLoginRateLimiter.clear(rateLimitKey);
      sessionId = await server.store.createAdminSession(60 * 60 * 8);
    } catch (error) {
      const appError = error instanceof z.ZodError
        ? new AppError("INVALID_ARGUMENT", error.message)
        : asAppError(error);
      if (appError.statusCode === 401) {
        server.adminLoginRateLimiter.recordFailure(rateLimitKey);
      }
      throw error;
    }
    response.setHeader(
      "set-cookie",
      server.makeSessionCookie("agentchat_admin_session", sessionId, {
        maxAge: 60 * 60 * 8,
        secure: server.shouldUseSecureCookies(request),
      }),
    );
    if (request.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
      redirect(response, "/admin/ui");
      return true;
    }
    jsonResponse(response, 200, { ok: true });
    return true;
  }

  if (method === "POST" && url.pathname === "/admin/logout") {
    const sessionId = server.getAdminSessionId(request);
    if (sessionId) {
      await server.store.deleteAdminSession(sessionId);
    }
    response.setHeader(
      "set-cookie",
      server.makeSessionCookie("agentchat_admin_session", "", {
        maxAge: 0,
        secure: server.shouldUseSecureCookies(request),
      }),
    );
    if (request.headers.accept?.includes("text/html")) {
      redirect(response, "/admin/ui");
      return true;
    }
    jsonResponse(response, 200, { ok: true });
    return true;
  }

  // All remaining admin routes require authorization
  if (!url.pathname?.startsWith("/admin/")) {
    return false;
  }

  // These routes require admin auth
  if (!isAdminAuthorized) {
    return false;
  }
  await server.requireAdminAuthorization(request);

  if (method === "POST" && url.pathname === "/admin/init") {
    jsonResponse(response, 200, {
      ok: true,
      databasePath: server.store.databasePath,
      httpUrl: server.getExternalHttpUrl(request),
      wsUrl: server.getExternalWsUrl(request),
    });
    return true;
  }

  if (method === "GET" && url.pathname === "/admin/accounts") {
    jsonResponse(response, 200, await server.listAccounts());
    return true;
  }

  if (method === "GET" && url.pathname === "/admin/audit-logs") {
    const accountId =
      typeof url.query.accountId === "string" ? url.query.accountId : undefined;
    const conversationId =
      typeof url.query.conversationId === "string" ? url.query.conversationId : undefined;
    const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
    jsonResponse(
      response,
      200,
      await server.listAuditLogs({
        ...(accountId ? { accountId } : {}),
        ...(conversationId ? { conversationId } : {}),
        ...(limit ? { limit } : {}),
      }),
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/admin/accounts") {
    const body = CreateAccountBodySchema.parse(await readJson(request));
    jsonResponse(response, 201, await server.createAccount(body));
    return true;
  }

  const accountTokenMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/reset-token$/);
  if (method === "POST" && accountTokenMatch) {
    jsonResponse(response, 200, await server.resetToken(accountTokenMatch[1]!));
    return true;
  }

  const friendsMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/friends$/);
  if (method === "GET" && friendsMatch) {
    jsonResponse(response, 200, await server.listFriends(friendsMatch[1]!));
    return true;
  }

  const groupsMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/groups$/);
  if (method === "GET" && groupsMatch) {
    jsonResponse(response, 200, await server.listGroups(groupsMatch[1]!));
    return true;
  }

  const conversationsMatch = url.pathname?.match(/^\/admin\/accounts\/([^/]+)\/conversations$/);
  if (method === "GET" && conversationsMatch) {
    jsonResponse(response, 200, await server.listConversations(conversationsMatch[1]!));
    return true;
  }

  if (method === "POST" && url.pathname === "/admin/friendships") {
    const body = CreateFriendshipBodySchema.parse(await readJson(request));
    jsonResponse(response, 201, await server.createFriendship(body.accountA, body.accountB));
    return true;
  }

  if (method === "POST" && url.pathname === "/admin/groups") {
    const body = CreateGroupBodySchema.parse(await readJson(request));
    jsonResponse(response, 201, await server.createGroup(body.title));
    return true;
  }

  const groupMemberMatch = url.pathname?.match(/^\/admin\/groups\/([^/]+)\/members$/);
  if (method === "POST" && groupMemberMatch) {
    const body = AddGroupMemberBodySchema.parse(await readJson(request));
    jsonResponse(response, 201, await server.addGroupMember(groupMemberMatch[1]!, body.accountId));
    return true;
  }

  if (method === "POST" && url.pathname === "/admin/messages") {
    const body = SendMessageBodySchema.parse(await readJson(request));
    if (!body.conversationId && !body.recipientId) {
      throw new AppError(
        "INVALID_ARGUMENT",
        "Either conversationId or recipientId is required",
      );
    }
    jsonResponse(response, 201, await server.sendAdminMessage(body as SendMessageInput));
    return true;
  }

  const messageMatch = url.pathname?.match(/^\/admin\/conversations\/([^/]+)\/messages$/);
  if (method === "GET" && messageMatch) {
    const accountId = url.query.accountId;
    if (typeof accountId !== "string" || !accountId) {
      throw new AppError("INVALID_ARGUMENT", "accountId is required");
    }
    const before = typeof url.query.before === "string" ? Number(url.query.before) : undefined;
    const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
    jsonResponse(
      response,
      200,
      await server.listConversationMessages(accountId, messageMatch[1]!, before, limit),
    );
    return true;
  }

  return false;
}
