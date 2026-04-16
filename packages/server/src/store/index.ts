import type {
  Account,
  AccountType,
  AuditLog,
  AuthAccount,
  ConversationSummary,
  FriendRecord,
  FriendRequest,
  Message,
  Notification,
  NotificationType,
  PlazaPost,
} from "@agentchatjs/protocol";
import {
  createDatabaseAdapter,
  type DatabaseAdapter,
  type Queryable,
  type StorageDriver,
} from "../db.js";
import { BASE_SCHEMA } from "./schema.js";

import * as accountFns from "./accounts.js";
import * as sessionFns from "./sessions.js";
import * as friendFns from "./friends.js";
import * as conversationFns from "./conversations.js";
import * as plazaFns from "./plaza.js";
import * as notificationFns from "./notifications.js";
import * as auditLogFns from "./audit-logs.js";
import * as recommendationFns from "./recommendation.js";

import type {
  CreateAccountInput,
  SendMessageInput,
  OwnedConversationSummary,
  OwnedConversationMessage,
  HumanUser,
  StoredUserSession,
  ListPlazaPostsOptions,
  AgentChatStoreOptions,
} from "./types.js";

// Re-export all public types so external consumers see no change
export type {
  CreateAccountInput,
  SendMessageInput,
  OwnedConversationSummary,
  OwnedConversationMessage,
  HumanUser,
  StoredUserSession,
  ListPlazaPostsOptions,
  AgentChatStoreOptions,
} from "./types.js";

export type { StorageDriver } from "../db.js";

export class AgentChatStore {
  readonly databasePath: string;
  readonly driver: StorageDriver;

  private readonly db: DatabaseAdapter;
  private initialized = false;

  constructor(options: AgentChatStoreOptions) {
    this.driver = "postgres";
    this.db = createDatabaseAdapter(options);
    this.databasePath = this.db.descriptor;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    for (const statement of BASE_SCHEMA) {
      await this.db.exec(statement);
    }
    await accountFns.ensureAccountOwnerColumns(this.db);
    await plazaFns.ensurePlazaPostColumns(this.db);
    await accountFns.seedDefaultHumanUser(this.db, this.driver);
    this.initialized = true;
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  // ── Accounts ─────────────────────────────────────────────────────

  async createAccount(input: CreateAccountInput): Promise<AuthAccount> {
    return accountFns.createAccount(this.db, this.driver, input);
  }

  async getOrCreateHumanAccount(session: { subject: string; email: string; name: string }): Promise<Account> {
    return accountFns.getOrCreateHumanAccount(this.db, this.driver, session);
  }

  async getAccountById(accountId: string): Promise<Account> {
    return accountFns.getAccountById(this.db, accountId);
  }

  async updateProfile(accountId: string, profileFields: Record<string, unknown>, ownerSubject?: string): Promise<Account> {
    return accountFns.updateProfile(this.db, accountId, profileFields, ownerSubject);
  }

  async listAccounts(ownerSubject?: string): Promise<Account[]> {
    return accountFns.listAccounts(this.db, ownerSubject);
  }

  async listAgentAccounts(): Promise<Account[]> {
    return accountFns.listAgentAccounts(this.db);
  }

  async authenticateAccount(accountId: string, token: string): Promise<Account> {
    return accountFns.authenticateAccount(this.db, accountId, token);
  }

  async resetToken(accountId: string, ownerSubject?: string): Promise<{ accountId: string; token: string }> {
    return accountFns.resetToken(this.db, accountId, ownerSubject);
  }

  async deleteAccount(accountId: string, ownerSubject?: string): Promise<void> {
    return accountFns.deleteAccount(this.db, accountId, ownerSubject);
  }

  async createHumanUser(input: { email: string; name: string; password: string }): Promise<HumanUser> {
    return accountFns.createHumanUser(this.db, this.driver, input);
  }

  async authenticateHumanUser(email: string, password: string): Promise<HumanUser> {
    return accountFns.authenticateHumanUser(this.db, email, password);
  }

  async getHumanUserByEmail(email: string): Promise<HumanUser | undefined> {
    return accountFns.getHumanUserByEmail(this.db, email);
  }

  async listAccountsByType(type: AccountType): Promise<Account[]> {
    return accountFns.listAccountsByType(this.db, type);
  }

  // ── Sessions & OAuth ─────────────────────────────────────────────

  async createAdminSession(ttlSeconds: number): Promise<string> {
    return sessionFns.createAdminSession(this.db, ttlSeconds);
  }

  async hasAdminSession(sessionId: string): Promise<boolean> {
    return sessionFns.hasAdminSession(this.db, sessionId);
  }

  async deleteAdminSession(sessionId: string): Promise<void> {
    return sessionFns.deleteAdminSession(this.db, sessionId);
  }

  async createUserSession(input: { subject: string; email: string; name: string; picture?: string; authProvider: "google" | "local" }, ttlSeconds: number): Promise<string> {
    return sessionFns.createUserSession(this.db, input, ttlSeconds);
  }

  async getUserSession(sessionId: string): Promise<StoredUserSession | undefined> {
    return sessionFns.getUserSession(this.db, sessionId);
  }

  async deleteUserSession(sessionId: string): Promise<void> {
    return sessionFns.deleteUserSession(this.db, sessionId);
  }

  async createOAuthState(ttlSeconds: number): Promise<string> {
    return sessionFns.createOAuthState(this.db, ttlSeconds);
  }

  async consumeOAuthState(state: string): Promise<boolean> {
    return sessionFns.consumeOAuthState(this.db, state);
  }

  // ── Friends ──────────────────────────────────────────────────────

  async createFriendship(accountA: string, accountB: string): Promise<{ friendshipId: string; conversationId: string; createdAt: string }> {
    return friendFns.createFriendship(this.db, accountA, accountB);
  }

  async listFriends(accountId: string): Promise<FriendRecord[]> {
    return friendFns.listFriends(this.db, accountId);
  }

  async addFriendAs(actorId: string, peerAccountId: string): Promise<{ requestId: string; createdAt: string }> {
    return friendFns.addFriendAs(this.db, actorId, peerAccountId);
  }

  async listFriendRequests(accountId: string, direction: "incoming" | "outgoing" | "all" = "all"): Promise<FriendRequest[]> {
    return friendFns.listFriendRequests(this.db, accountId, direction);
  }

  async respondFriendRequestAs(actorId: string, requestId: string, action: "accept" | "reject"): Promise<FriendRequest | { friendshipId: string; conversationId: string; createdAt: string }> {
    return friendFns.respondFriendRequestAs(this.db, actorId, requestId, action);
  }

  async getFriendRequestWatcherIds(requestId: string): Promise<string[]> {
    return friendFns.getFriendRequestWatcherIds(this.db, requestId);
  }

  // ── Conversations & Messages ─────────────────────────────────────

  async createGroup(title: string): Promise<ConversationSummary> {
    return conversationFns.createGroup(this.db, title);
  }

  async createGroupAs(creatorId: string, title: string): Promise<ConversationSummary> {
    return conversationFns.createGroupAs(this.db, creatorId, title);
  }

  async addGroupMember(conversationId: string, accountId: string): Promise<ConversationSummary> {
    return conversationFns.addGroupMember(this.db, conversationId, accountId);
  }

  async addGroupMemberAs(actorId: string, conversationId: string, accountId: string): Promise<ConversationSummary> {
    return conversationFns.addGroupMemberAs(this.db, actorId, conversationId, accountId);
  }

  async listGroups(accountId: string): Promise<ConversationSummary[]> {
    return conversationFns.listGroups(this.db, accountId);
  }

  async listConversationMembers(accountId: string, conversationId: string): Promise<Account[]> {
    return conversationFns.listConversationMembers(this.db, accountId, conversationId);
  }

  async listConversations(accountId: string): Promise<ConversationSummary[]> {
    return conversationFns.listConversations(this.db, accountId);
  }

  async listOwnedConversations(ownerSubject: string): Promise<OwnedConversationSummary[]> {
    return conversationFns.listOwnedConversations(this.db, ownerSubject);
  }

  async listOwnedConversationMessages(ownerSubject: string, conversationId: string, before?: number, limit = 50): Promise<OwnedConversationMessage[]> {
    return conversationFns.listOwnedConversationMessages(this.db, ownerSubject, conversationId, before, limit);
  }

  async listMessages(accountId: string, conversationId: string, before?: number, limit = 50): Promise<Message[]> {
    return conversationFns.listMessages(this.db, accountId, conversationId, before, limit);
  }

  async sendMessage(input: SendMessageInput): Promise<{ conversation: ConversationSummary; message: Message }> {
    return conversationFns.sendMessage(this.db, this.driver, input);
  }

  async getConversationSummaryForAccount(accountId: string, conversationId: string, db: Queryable = this.db): Promise<ConversationSummary> {
    return conversationFns.getConversationSummaryForAccount(this.db, accountId, conversationId, db);
  }

  async getConversationSummaryForSystem(conversationId: string): Promise<ConversationSummary> {
    return conversationFns.getConversationSummaryForSystem(this.db, conversationId);
  }

  async getConversationMemberIds(conversationId: string, db: Queryable = this.db): Promise<string[]> {
    return conversationFns.getConversationMemberIds(this.db, conversationId, db);
  }

  async getConversationWatcherIds(accountId: string): Promise<string[]> {
    return conversationFns.getConversationWatcherIds(this.db, accountId);
  }

  async markSessionStatus(sessionId: string, accountId: string, status: "online" | "offline"): Promise<void> {
    return conversationFns.markSessionStatus(this.db, sessionId, accountId, status);
  }

  // ── Plaza ────────────────────────────────────────────────────────

  async createPlazaPost(authorAccountId: string, body: string, options?: { parentPostId?: string; quotedPostId?: string }): Promise<PlazaPost> {
    return plazaFns.createPlazaPost(this.db, authorAccountId, body, options);
  }

  async listPlazaPosts(options: ListPlazaPostsOptions = {}): Promise<PlazaPost[]> {
    return plazaFns.listPlazaPosts(this.db, options);
  }

  async listTrendingPosts(options: { viewerAccountId?: string; limit?: number; offset?: number } = {}): Promise<PlazaPost[]> {
    return plazaFns.listTrendingPosts(this.db, options);
  }

  async getPlazaPost(postId: string, viewerAccountId?: string): Promise<PlazaPost> {
    return plazaFns.getPlazaPost(this.db, postId, viewerAccountId);
  }

  async likePlazaPost(accountId: string, postId: string): Promise<{ liked: boolean; likeCount: number }> {
    return plazaFns.likePlazaPost(this.db, accountId, postId);
  }

  async unlikePlazaPost(accountId: string, postId: string): Promise<{ liked: boolean; likeCount: number }> {
    return plazaFns.unlikePlazaPost(this.db, accountId, postId);
  }

  async repostPlazaPost(accountId: string, postId: string): Promise<{ reposted: boolean; repostCount: number }> {
    return plazaFns.repostPlazaPost(this.db, accountId, postId);
  }

  async unrepostPlazaPost(accountId: string, postId: string): Promise<{ reposted: boolean; repostCount: number }> {
    return plazaFns.unrepostPlazaPost(this.db, accountId, postId);
  }

  async recordPlazaView(accountId: string, postId: string): Promise<void> {
    return plazaFns.recordPlazaView(this.db, accountId, postId);
  }

  async recordPlazaViewBatch(accountId: string, postIds: string[]): Promise<void> {
    return plazaFns.recordPlazaViewBatch(this.db, accountId, postIds);
  }

  async listPlazaReplies(postId: string, options: { viewerAccountId?: string; beforeCreatedAt?: string; beforeId?: string; limit?: number } = {}): Promise<PlazaPost[]> {
    return plazaFns.listPlazaReplies(this.db, postId, options);
  }

  async upsertPostEmbedding(postId: string, embedding: number[], model: string): Promise<void> {
    return plazaFns.upsertPostEmbedding(this.db, postId, embedding, model);
  }

  async getPostEmbedding(postId: string): Promise<{ postId: string; embedding: number[]; model: string } | null> {
    return plazaFns.getPostEmbedding(this.db, postId);
  }

  async upsertInterestVector(accountId: string, vector: number[], interactionCount: number): Promise<void> {
    return plazaFns.upsertInterestVector(this.db, accountId, vector, interactionCount);
  }

  async getInterestVector(accountId: string): Promise<{ interestVector: number[]; interactionCount: number } | null> {
    return plazaFns.getInterestVector(this.db, accountId);
  }

  async findSimilarPosts(queryVector: number[], options: { limit?: number; excludePostIds?: string[] } = {}): Promise<Array<{ postId: string; similarity: number }>> {
    return plazaFns.findSimilarPosts(this.db, queryVector, options);
  }

  async upsertAgentScore(accountId: string, scores: { score: number; engagementRate: number; postQualityAvg: number; activityRecency: number; profileCompleteness: number; contentVector?: number[] }): Promise<void> {
    return plazaFns.upsertAgentScore(this.db, accountId, scores);
  }

  async getPlazaPostAuthorId(postId: string): Promise<string> {
    return plazaFns.getPlazaPostAuthorId(this.db, postId);
  }

  // ── Notifications ────────────────────────────────────────────────

  async createNotification(input: { recipientAccountId: string; type: NotificationType; actorAccountId?: string; subjectType: string; subjectId: string; data?: Record<string, unknown> }): Promise<Notification | null> {
    return notificationFns.createNotification(this.db, input);
  }

  async listNotifications(accountId: string, options?: { beforeCreatedAt?: string; beforeId?: string; limit?: number; unreadOnly?: boolean }): Promise<Notification[]> {
    return notificationFns.listNotifications(this.db, accountId, options);
  }

  async listNotificationsForOwner(_ownerSubject: string, humanAccountId: string, options?: { beforeCreatedAt?: string; beforeId?: string; limit?: number; unreadOnly?: boolean }): Promise<Notification[]> {
    return notificationFns.listNotificationsForOwner(this.db, _ownerSubject, humanAccountId, options);
  }

  async getUnreadNotificationCount(accountId: string): Promise<number> {
    return notificationFns.getUnreadNotificationCount(this.db, accountId);
  }

  async getUnreadNotificationCountForOwner(_ownerSubject: string, humanAccountId: string): Promise<number> {
    return notificationFns.getUnreadNotificationCountForOwner(this.db, _ownerSubject, humanAccountId);
  }

  async markNotificationRead(accountId: string, notificationId: string): Promise<void> {
    return notificationFns.markNotificationRead(this.db, accountId, notificationId);
  }

  async markNotificationReadForOwner(_ownerSubject: string, humanAccountId: string, notificationId: string): Promise<void> {
    return notificationFns.markNotificationReadForOwner(this.db, _ownerSubject, humanAccountId, notificationId);
  }

  async markAllNotificationsRead(accountId: string): Promise<void> {
    return notificationFns.markAllNotificationsRead(this.db, accountId);
  }

  async markAllNotificationsReadForOwner(_ownerSubject: string, humanAccountId: string): Promise<void> {
    return notificationFns.markAllNotificationsReadForOwner(this.db, _ownerSubject, humanAccountId);
  }

  // ── Audit Logs ───────────────────────────────────────────────────

  async listAuditLogsForAccount(accountId: string, options: { conversationId?: string; limit?: number } = {}): Promise<AuditLog[]> {
    return auditLogFns.listAuditLogsForAccount(this.db, accountId, options);
  }

  async listAuditLogs(options: { accountId?: string; conversationId?: string; limit?: number } = {}) {
    return auditLogFns.listAuditLogs(this.db, options);
  }

  async listOwnedAuditLogs(ownerSubject: string, options: { conversationId?: string; limit?: number } = {}): Promise<AuditLog[]> {
    return auditLogFns.listOwnedAuditLogs(this.db, ownerSubject, options);
  }

  // ── Recommendation ───────────────────────────────────────────────

  async listTopAgents(options: { limit?: number; excludeAccountIds?: string[] } = {}): Promise<Array<{ accountId: string; score: number; engagementRate: number; postQualityAvg: number; activityRecency: number; profileCompleteness: number }>> {
    return recommendationFns.listTopAgents(this.db, options);
  }

  async buildInterestVector(accountId: string): Promise<{ vector: number[]; interactionCount: number } | null> {
    return recommendationFns.buildInterestVector(this.db, accountId);
  }

  async listRecommendedPosts(options: { viewerAccountId: string; limit?: number; offset?: number }): Promise<PlazaPost[]> {
    return recommendationFns.listRecommendedPosts(this.db, options);
  }

  async getAgentPostQualityAvg(accountId: string): Promise<number> {
    return recommendationFns.getAgentPostQualityAvg(this.db, accountId);
  }

  async getAgentEngagementRate(accountId: string): Promise<number> {
    return recommendationFns.getAgentEngagementRate(this.db, accountId);
  }

  async getAgentLastPostAgeHours(accountId: string): Promise<number | null> {
    return recommendationFns.getAgentLastPostAgeHours(this.db, accountId);
  }
}
