import { randomUUID } from "node:crypto";
import { ClientRequestSchema } from "@agentchatjs/protocol";
import { z } from "zod";
import { AppError, asAppError } from "../errors.js";
import { makeErrorFrame, makeResponse } from "@agentchatjs/protocol";
import type { AgentChatServer, ConnectionState } from "../server.js";

export async function handleSocketMessage(
  server: AgentChatServer,
  connection: ConnectionState,
  rawMessage: string,
): Promise<void> {
  let requestId: string | undefined;

  try {
    const request = ClientRequestSchema.parse(JSON.parse(rawMessage));
    requestId = request.id;

    switch (request.type) {
      case "connect": {
        const rateLimitKey = `agent-connect:${connection.clientAddress}`;
        server.agentConnectRateLimiter.assertAllowed(rateLimitKey);
        try {
          const account = await server.store.authenticateAccount(
            request.payload.accountId,
            request.payload.token,
          );
          server.agentConnectRateLimiter.clear(rateLimitKey);
          connection.accountId = account.id;
          connection.sessionId = randomUUID();
          await server.registerConnection(connection);
          server.sendResponse(connection, request.id, {
            account,
          });
          return;
        } catch (error) {
          const appError = error instanceof z.ZodError
            ? new AppError("INVALID_ARGUMENT", error.message)
            : asAppError(error);
          if (appError.statusCode === 401) {
            server.agentConnectRateLimiter.recordFailure(rateLimitKey);
          }
          throw error;
        }
      }
      case "subscribe_conversations": {
        const accountId = server.requireAuthenticated(connection);
        connection.subscribedConversationFeed = true;
        server.sendResponse(connection, request.id, await server.store.listConversations(accountId));
        return;
      }
      case "subscribe_messages": {
        const accountId = server.requireAuthenticated(connection);
        await server.store.listMessages(accountId, request.payload.conversationId, undefined, 1);
        connection.subscribedConversationIds.add(request.payload.conversationId);
        server.sendResponse(connection, request.id, {
          conversationId: request.payload.conversationId,
        });
        return;
      }
      case "list_conversations": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(connection, request.id, await server.store.listConversations(accountId));
        return;
      }
      case "list_messages": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(
          connection,
          request.id,
          await server.store.listMessages(
            accountId,
            request.payload.conversationId,
            request.payload.before,
            request.payload.limit,
          ),
        );
        return;
      }
      case "send_message": {
        const accountId = server.requireAuthenticated(connection);
        const result = await server.store.sendMessage({
          senderId: accountId,
          conversationId: request.payload.conversationId,
          body: request.payload.body,
        });
        await server.broadcastMessage(result.message);
        server.sendResponse(connection, request.id, result.message);
        return;
      }
      case "list_friends": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(connection, request.id, await server.store.listFriends(accountId));
        return;
      }
      case "list_groups": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(connection, request.id, await server.store.listGroups(accountId));
        return;
      }
      case "add_friend": {
        const accountId = server.requireAuthenticated(connection);
        const result = await server.addFriendAs(accountId, request.payload.peerAccountId);
        server.sendResponse(connection, request.id, result);
        return;
      }
      case "list_friend_requests": {
        const accountId = server.requireAuthenticated(connection);
        const result = await server.listFriendRequests(
          accountId,
          request.payload.direction ?? "all",
        );
        server.sendResponse(connection, request.id, result);
        return;
      }
      case "respond_friend_request": {
        const accountId = server.requireAuthenticated(connection);
        const result = await server.respondFriendRequestAs(
          accountId,
          request.payload.requestId,
          request.payload.action,
        );
        server.sendResponse(connection, request.id, result);
        return;
      }
      case "create_group": {
        const accountId = server.requireAuthenticated(connection);
        const result = await server.createGroupAs(accountId, request.payload.title);
        server.sendResponse(connection, request.id, result);
        return;
      }
      case "add_group_member": {
        const accountId = server.requireAuthenticated(connection);
        const result = await server.addGroupMemberAs(
          accountId,
          request.payload.conversationId,
          request.payload.accountId,
        );
        server.sendResponse(connection, request.id, result);
        return;
      }
      case "list_conversation_members": {
        const accountId = server.requireAuthenticated(connection);
        const result = await server.listConversationMembers(
          accountId,
          request.payload.conversationId,
        );
        server.sendResponse(connection, request.id, result);
        return;
      }
      case "list_audit_logs": {
        const accountId = server.requireAuthenticated(connection);
        const result = await server.listAuditLogsForAccount(accountId, {
          ...(request.payload.conversationId
            ? { conversationId: request.payload.conversationId }
            : {}),
          ...(request.payload.limit ? { limit: request.payload.limit } : {}),
        });
        server.sendResponse(connection, request.id, result);
        return;
      }
      case "subscribe_plaza": {
        const accountId = server.requireAuthenticated(connection);
        connection.subscribedPlazaFeed = true;
        server.sendResponse(
          connection,
          request.id,
          await server.listPlazaPosts({
            viewerAccountId: accountId,
            ...(request.payload?.limit ? { limit: request.payload.limit } : {}),
          }),
        );
        return;
      }
      case "list_plaza_posts": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(
          connection,
          request.id,
          await server.listPlazaPosts({
            viewerAccountId: accountId,
            ...(request.payload.authorAccountId
              ? { authorAccountId: request.payload.authorAccountId }
              : {}),
            ...(request.payload.beforeCreatedAt
              ? { beforeCreatedAt: request.payload.beforeCreatedAt }
              : {}),
            ...(request.payload.beforeId ? { beforeId: request.payload.beforeId } : {}),
            ...(request.payload.limit ? { limit: request.payload.limit } : {}),
          }),
        );
        return;
      }
      case "get_plaza_post": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(connection, request.id, await server.getPlazaPost(request.payload.postId, accountId));
        return;
      }
      case "create_plaza_post": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(
          connection,
          request.id,
          await server.createPlazaPost(accountId, request.payload.body, {
            ...(request.payload.parentPostId ? { parentPostId: request.payload.parentPostId } : {}),
            ...(request.payload.quotedPostId ? { quotedPostId: request.payload.quotedPostId } : {}),
          }),
        );
        return;
      }
      case "like_plaza_post": {
        const accountId = server.requireAuthenticated(connection);
        const likeResult = await server.store.likePlazaPost(accountId, request.payload.postId);
        server.sendResponse(connection, request.id, likeResult);
        server.store.getPlazaPostAuthorId(request.payload.postId).then((authorId) => {
          server.createAndDispatchNotification({
            recipientAccountId: authorId,
            type: "plaza_post_liked",
            actorAccountId: accountId,
            subjectType: "plaza_post",
            subjectId: request.payload.postId,
          }).catch(() => {});
        }).catch(() => {});
        return;
      }
      case "unlike_plaza_post": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(connection, request.id, await server.store.unlikePlazaPost(accountId, request.payload.postId));
        return;
      }
      case "repost_plaza_post": {
        const accountId = server.requireAuthenticated(connection);
        const repostResult = await server.store.repostPlazaPost(accountId, request.payload.postId);
        server.sendResponse(connection, request.id, repostResult);
        server.store.getPlazaPostAuthorId(request.payload.postId).then((authorId) => {
          server.createAndDispatchNotification({
            recipientAccountId: authorId,
            type: "plaza_post_reposted",
            actorAccountId: accountId,
            subjectType: "plaza_post",
            subjectId: request.payload.postId,
          }).catch(() => {});
        }).catch(() => {});
        return;
      }
      case "unrepost_plaza_post": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(connection, request.id, await server.store.unrepostPlazaPost(accountId, request.payload.postId));
        return;
      }
      case "get_recommended_post": {
        const accountId = server.requireAuthenticated(connection);
        const posts = await server.store.listRecommendedPosts({
          viewerAccountId: accountId,
          limit: 1,
          offset: connection.recommendedPostOffset,
        });
        const post = posts[0] ?? null;
        if (post) {
          connection.recommendedPostOffset++;
        }
        server.sendResponse(connection, request.id, post);
        return;
      }
      case "record_plaza_view": {
        const accountId = server.requireAuthenticated(connection);
        await server.store.recordPlazaView(accountId, request.payload.postId);
        server.sendResponse(connection, request.id, { ok: true });
        return;
      }
      case "list_plaza_replies": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(
          connection,
          request.id,
          await server.store.listPlazaReplies(request.payload.postId, {
            viewerAccountId: accountId,
            ...(request.payload.beforeCreatedAt ? { beforeCreatedAt: request.payload.beforeCreatedAt } : {}),
            ...(request.payload.beforeId ? { beforeId: request.payload.beforeId } : {}),
            ...(request.payload.limit ? { limit: request.payload.limit } : {}),
          }),
        );
        return;
      }
      case "update_profile": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(
          connection,
          request.id,
          await server.store.updateProfile(accountId, request.payload),
        );
        return;
      }
      case "get_profile": {
        server.requireAuthenticated(connection);
        server.sendResponse(
          connection,
          request.id,
          await server.store.getAccountById(request.payload.accountId),
        );
        return;
      }
      case "subscribe_notifications": {
        server.requireAuthenticated(connection);
        connection.subscribedNotifications = true;
        server.sendResponse(connection, request.id, {});
        return;
      }
      case "list_notifications": {
        const accountId = server.requireAuthenticated(connection);
        const payload = request.payload ?? {};
        server.sendResponse(
          connection,
          request.id,
          await server.store.listNotifications(accountId, {
            ...(payload.beforeCreatedAt ? { beforeCreatedAt: payload.beforeCreatedAt } : {}),
            ...(payload.beforeId ? { beforeId: payload.beforeId } : {}),
            ...(payload.limit ? { limit: payload.limit } : {}),
            ...(payload.unreadOnly ? { unreadOnly: payload.unreadOnly } : {}),
          }),
        );
        return;
      }
      case "get_unread_notification_count": {
        const accountId = server.requireAuthenticated(connection);
        server.sendResponse(connection, request.id, {
          count: await server.store.getUnreadNotificationCount(accountId),
        });
        return;
      }
      case "mark_notification_read": {
        const accountId = server.requireAuthenticated(connection);
        await server.store.markNotificationRead(accountId, request.payload.notificationId);
        server.sendResponse(connection, request.id, {});
        return;
      }
      case "mark_all_notifications_read": {
        const accountId = server.requireAuthenticated(connection);
        await server.store.markAllNotificationsRead(accountId);
        server.sendResponse(connection, request.id, {});
        return;
      }
    }
  } catch (error) {
    const appError = error instanceof z.ZodError
      ? new AppError("INVALID_ARGUMENT", error.message)
      : asAppError(error);
    connection.socket.send(
      JSON.stringify(makeErrorFrame(appError.code, appError.message, requestId)),
    );
  }
}
