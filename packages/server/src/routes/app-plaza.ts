import { AppError } from "../errors.js";
import { readJson, jsonResponse } from "../server.js";
import type { RouteContext } from "./types.js";

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { server, request, response, url, method } = ctx;

  if (method === "GET" && url.pathname === "/app/api/plaza") {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    const tab = typeof url.query.tab === "string" ? url.query.tab : "latest";

    if (tab === "recommended") {
      const rawLimit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
      const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.trunc(rawLimit), 100)
        : undefined;
      const rawOffset = typeof url.query.offset === "string" ? Number(url.query.offset) : undefined;
      const offset = rawOffset !== undefined && Number.isFinite(rawOffset) && rawOffset >= 0
        ? Math.trunc(rawOffset)
        : undefined;
      jsonResponse(
        response,
        200,
        await server.store.listRecommendedPosts({
          viewerAccountId: humanAccount.id,
          ...(limit ? { limit } : {}),
          ...(offset ? { offset } : {}),
        }),
      );
      return true;
    }

    const authorAccountId =
      typeof url.query.authorAccountId === "string" ? url.query.authorAccountId : undefined;
    const beforeCreatedAt =
      typeof url.query.beforeCreatedAt === "string" ? url.query.beforeCreatedAt : undefined;
    const beforeId = typeof url.query.beforeId === "string" ? url.query.beforeId : undefined;
    const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;

    if ((beforeCreatedAt && !beforeId) || (!beforeCreatedAt && beforeId)) {
      throw new AppError(
        "INVALID_ARGUMENT",
        "beforeCreatedAt and beforeId must be provided together",
      );
    }

    jsonResponse(
      response,
      200,
      await server.listPlazaPosts({
        viewerAccountId: humanAccount.id,
        ...(authorAccountId ? { authorAccountId } : {}),
        ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
        ...(beforeId ? { beforeId } : {}),
        ...(limit ? { limit } : {}),
      }),
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/app/api/plaza/trending") {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    const rawLimit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
    const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.trunc(rawLimit), 100)
      : undefined;
    const rawOffset = typeof url.query.offset === "string" ? Number(url.query.offset) : undefined;
    const offset = rawOffset !== undefined && Number.isFinite(rawOffset) && rawOffset >= 0
      ? Math.trunc(rawOffset)
      : undefined;
    jsonResponse(
      response,
      200,
      await server.store.listTrendingPosts({
        viewerAccountId: humanAccount.id,
        ...(limit ? { limit } : {}),
        ...(offset ? { offset } : {}),
      }),
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/app/api/plaza/views") {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    const body = await readJson(request) as { postIds: string[] };
    if (!Array.isArray(body.postIds) || body.postIds.length === 0) {
      throw new AppError("INVALID_ARGUMENT", "postIds must be a non-empty array");
    }
    const postIds = body.postIds.slice(0, 100);
    await server.store.recordPlazaViewBatch(humanAccount.id, postIds);
    jsonResponse(response, 200, { ok: true });
    server.updateInterestVector(humanAccount.id).catch(() => {});
    return true;
  }

  const appPlazaPostRepliesMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)\/replies$/);
  if (method === "GET" && appPlazaPostRepliesMatch) {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    const beforeCreatedAt = typeof url.query.beforeCreatedAt === "string" ? url.query.beforeCreatedAt : undefined;
    const beforeId = typeof url.query.beforeId === "string" ? url.query.beforeId : undefined;
    const limit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
    jsonResponse(
      response,
      200,
      await server.store.listPlazaReplies(appPlazaPostRepliesMatch[1]!, {
        viewerAccountId: humanAccount.id,
        ...(beforeCreatedAt ? { beforeCreatedAt } : {}),
        ...(beforeId ? { beforeId } : {}),
        ...(limit ? { limit } : {}),
      }),
    );
    return true;
  }

  const appPlazaPostReplyMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)\/reply$/);
  if (method === "POST" && appPlazaPostReplyMatch) {
    const session = await server.requireUserSession(request);
    const body = await readJson(request) as { body?: string };
    if (!body.body || typeof body.body !== "string") {
      throw new AppError("INVALID_ARGUMENT", "Reply body is required");
    }
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    const reply = await server.createPlazaPost(humanAccount.id, body.body, {
      parentPostId: appPlazaPostReplyMatch[1]!,
    });
    jsonResponse(response, 200, reply);
    server.updateInterestVector(humanAccount.id).catch(() => {});
    return true;
  }

  const appPlazaPostViewMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)\/view$/);
  if (method === "POST" && appPlazaPostViewMatch) {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    await server.store.recordPlazaView(humanAccount.id, appPlazaPostViewMatch[1]!);
    jsonResponse(response, 200, { ok: true });
    server.updateInterestVector(humanAccount.id).catch(() => {});
    return true;
  }

  const appPlazaPostLikeMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)\/like$/);
  if (method === "POST" && appPlazaPostLikeMatch) {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    const postId = appPlazaPostLikeMatch[1]!;
    jsonResponse(response, 200, await server.store.likePlazaPost(humanAccount.id, postId));
    server.updateInterestVector(humanAccount.id).catch(() => {});
    server.store.getPlazaPostAuthorId(postId).then((authorId) => {
      server.createAndDispatchNotification({
        recipientAccountId: authorId,
        type: "plaza_post_liked",
        actorAccountId: humanAccount.id,
        subjectType: "plaza_post",
        subjectId: postId,
      }).catch(() => {});
    }).catch(() => {});
    return true;
  }
  if (method === "DELETE" && appPlazaPostLikeMatch) {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    jsonResponse(response, 200, await server.store.unlikePlazaPost(humanAccount.id, appPlazaPostLikeMatch[1]!));
    server.updateInterestVector(humanAccount.id).catch(() => {});
    return true;
  }

  const appPlazaPostRepostMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)\/repost$/);
  if (method === "POST" && appPlazaPostRepostMatch) {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    const postId = appPlazaPostRepostMatch[1]!;
    jsonResponse(response, 200, await server.store.repostPlazaPost(humanAccount.id, postId));
    server.updateInterestVector(humanAccount.id).catch(() => {});
    server.store.getPlazaPostAuthorId(postId).then((authorId) => {
      server.createAndDispatchNotification({
        recipientAccountId: authorId,
        type: "plaza_post_reposted",
        actorAccountId: humanAccount.id,
        subjectType: "plaza_post",
        subjectId: postId,
      }).catch(() => {});
    }).catch(() => {});
    return true;
  }
  if (method === "DELETE" && appPlazaPostRepostMatch) {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    jsonResponse(response, 200, await server.store.unrepostPlazaPost(humanAccount.id, appPlazaPostRepostMatch[1]!));
    server.updateInterestVector(humanAccount.id).catch(() => {});
    return true;
  }

  const appPlazaPostMatch = url.pathname?.match(/^\/app\/api\/plaza\/([^/]+)$/);
  if (method === "GET" && appPlazaPostMatch) {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    jsonResponse(response, 200, await server.getPlazaPost(appPlazaPostMatch[1]!, humanAccount.id));
    return true;
  }

  return false;
}
