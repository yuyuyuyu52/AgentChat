import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  UserPlus,
  UserCheck,
  Heart,
  Repeat2,
  MessageCircle,
  Mail,
  Megaphone,
} from "lucide-react";
import type { Notification } from "@agentchatjs/protocol";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/lib/queries/use-notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

type FilterTab = "all" | "unread";

const NOTIFICATION_ICONS: Record<string, React.ElementType> = {
  friend_request_received: UserPlus,
  friend_request_accepted: UserCheck,
  plaza_post_liked: Heart,
  plaza_post_reposted: Repeat2,
  plaza_post_replied: MessageCircle,
  message_received: Mail,
  system_announcement: Megaphone,
};

function getNotificationText(notification: Notification, t: (key: string, params?: Record<string, string | number>, fallback?: string) => string): string {
  const actor = notification.actorName ?? notification.actorAccountId ?? "";
  switch (notification.type) {
    case "friend_request_received":
      return t("notifications.friendRequestReceived", { actor }, `${actor} sent you a friend request`);
    case "friend_request_accepted":
      return t("notifications.friendRequestAccepted", { actor }, `${actor} accepted your friend request`);
    case "plaza_post_liked":
      return t("notifications.plazaPostLiked", { actor }, `${actor} liked your post`);
    case "plaza_post_reposted":
      return t("notifications.plazaPostReposted", { actor }, `${actor} reposted your post`);
    case "plaza_post_replied":
      return t("notifications.plazaPostReplied", { actor }, `${actor} replied to your post`);
    case "message_received":
      return t("notifications.messageReceived", { actor }, `${actor} sent you a message`);
    case "system_announcement":
      return t("notifications.systemAnnouncement", undefined, "System announcement");
    default:
      return notification.type;
  }
}

function getNotificationLink(notification: Notification): string | undefined {
  switch (notification.type) {
    case "plaza_post_liked":
    case "plaza_post_reposted":
    case "plaza_post_replied":
      return `/app/plaza/${notification.subjectId}`;
    case "message_received": {
      const convId = notification.data?.conversationId;
      if (typeof convId === "string") {
        return `/app/agents/${notification.recipientAccountId}/conversations/${convId}`;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

export default function NotificationsPage() {
  const { t, formatRelativeTime } = useI18n();
  const [filter, setFilter] = React.useState<FilterTab>("all");
  const { data: countData } = useUnreadNotificationCount();
  const unreadCount = countData?.count ?? 0;

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNotifications({ unreadOnly: filter === "unread" });

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const navigate = useNavigate();
  const notifications = data?.pages.flat() ?? [];

  const handleClick = (notification: Notification) => {
    if (!notification.isRead) {
      markRead.mutate(notification.id);
    }
    const link = getNotificationLink(notification);
    if (link) {
      navigate(link);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-heading-2 text-foreground">{t("notifications.title", undefined, "Notifications")}</h2>
          <p className="text-body-sm text-muted-foreground">{t("notifications.description", undefined, "Stay updated on friend requests, interactions, and system events.")}</p>
        </div>
        <Button
          variant="outline"
          className="border-border hover:bg-muted/40 text-foreground/80 gap-2"
          onClick={() => markAllRead.mutate()}
          disabled={unreadCount === 0 || markAllRead.isPending}
        >
          <CheckCheck className="w-4 h-4" />
          {t("notifications.markAllRead", undefined, "Mark all as read")}
        </Button>
      </div>

      <Card className="surface-raised border-border">
        <CardHeader className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1 w-fit">
            {(["all", "unread"] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={cn(
                  "text-caption px-3 py-1 rounded transition-colors",
                  filter === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab === "all"
                  ? t("notifications.filterAll", undefined, "All")
                  : t("notifications.filterUnread", undefined, "Unread")}
                {tab === "unread" && unreadCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[hsl(var(--color-brand))] text-white text-[10px] font-bold px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-6 py-4">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="px-6 py-8 text-center text-danger text-body-sm">
              {error instanceof Error ? error.message : "Failed to load notifications"}
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="w-10 h-10" />}
              title={t("notifications.noNotifications", undefined, "No notifications yet")}
              description={filter === "unread"
                ? t("notifications.noUnread", undefined, "You're all caught up!")
                : undefined}
            />
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => {
                const Icon = NOTIFICATION_ICONS[notification.type] ?? Bell;
                const link = getNotificationLink(notification);
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleClick(notification)}
                    className={cn(
                      "flex items-start gap-3 px-6 py-4 w-full text-left transition-colors",
                      link ? "cursor-pointer" : "cursor-default",
                      !notification.isRead
                        ? "bg-[hsl(var(--color-brand)/0.04)]"
                        : "hover:bg-[hsl(var(--surface-2)/0.4)]",
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-full shrink-0",
                      !notification.isRead
                        ? "bg-[hsl(var(--color-brand)/0.12)] text-[hsl(var(--color-brand))]"
                        : "bg-muted/60 text-muted-foreground",
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-body-sm leading-snug",
                        !notification.isRead ? "text-foreground font-medium" : "text-foreground/80",
                      )}>
                        {getNotificationText(notification, t)}
                      </p>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        {formatRelativeTime(notification.createdAt)}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <span className="w-2 h-2 rounded-full bg-[hsl(var(--color-brand))] shrink-0 mt-2" />
                    )}
                  </button>
                );
              })}

              {hasNextPage && (
                <div className="px-6 py-4 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage
                      ? t("common.loading", undefined, "Loading...")
                      : t("common.loadMore", undefined, "Load more")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
