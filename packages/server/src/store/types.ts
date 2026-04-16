import type {
  AccountType,
  ConversationKind,
  ConversationSummary,
  FriendRequestStatus,
  Message,
} from "@agentchatjs/protocol";

// ── Row types (internal) ────────────────────────────────────────

export type AccountRow = {
  id: string;
  type: AccountType;
  name: string;
  profile_json: string;
  auth_token: string;
  owner_subject: string | null;
  owner_email: string | null;
  owner_name: string | null;
  created_at: string;
};

export type ConversationRow = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  kind: "text";
  created_at: string;
  seq: number;
};

export type PlazaPostRow = {
  id: string;
  author_account_id: string;
  body: string;
  kind: "text";
  created_at: string;
  parent_post_id: string | null;
  quoted_post_id: string | null;
};

export type MembershipRow = {
  conversation_id: string;
  account_id: string;
  role: string;
  joined_at: string;
  history_start_seq: number;
};

export type FriendshipRow = {
  id: string;
  account_a: string;
  account_b: string;
  status: string;
  dm_conversation_id: string;
  created_at: string;
};

export type FriendRequestRow = {
  id: string;
  requester_id: string;
  target_id: string;
  status: FriendRequestStatus;
  created_at: string;
  responded_at: string | null;
};

export type AuditLogRow = {
  id: string;
  actor_account_id: string | null;
  event_type: string;
  subject_type: string;
  subject_id: string;
  conversation_id: string | null;
  metadata_json: string;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  recipient_account_id: string;
  type: string;
  actor_account_id: string | null;
  subject_type: string;
  subject_id: string;
  data_json: string;
  is_read: boolean;
  created_at: string;
};

export type HumanUserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
};

export type AdminAuthSessionRow = {
  id: string;
  created_at: string;
  expires_at: string;
};

export type UserAuthSessionRow = {
  id: string;
  subject: string;
  email: string;
  name: string;
  picture: string | null;
  auth_provider: "google" | "local";
  created_at: string;
  expires_at: string;
};

export type OAuthStateRow = {
  id: string;
  created_at: string;
  expires_at: string;
};

export type OwnedConversationRow = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  created_at: string;
};

// ── Public exported types ───────────────────────────────────────

export type CreateAccountInput = {
  name: string;
  type?: AccountType | undefined;
  profile?: Record<string, unknown> | undefined;
  owner?:
    | {
        subject: string;
        email: string;
        name: string;
      }
    | undefined;
};

export type SendMessageInput =
  | {
      senderId: string;
      conversationId: string;
      body: string;
      recipientId?: never;
    }
  | {
      senderId: string;
      recipientId: string;
      body: string;
      conversationId?: never;
    };

export type OwnedConversationSummary = ConversationSummary & {
  ownedAgents: Array<{
    id: string;
    name: string;
  }>;
};

export type OwnedConversationMessage = Message & {
  senderName: string;
};

export type HumanUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type StoredUserSession = {
  createdAt: number;
  subject: string;
  email: string;
  name: string;
  picture?: string;
  authProvider: "google" | "local";
};

export type ListPlazaPostsOptions = {
  authorAccountId?: string;
  viewerAccountId?: string;
  parentPostId?: string;
  beforeCreatedAt?: string;
  beforeId?: string;
  limit?: number;
};

export type AgentChatStoreOptions = {
  databaseUrl: string;
};
