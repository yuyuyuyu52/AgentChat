import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listWorkspacePlazaPosts,
  listRecommendedPlazaPosts,
  listRecommendedAgents,
  getWorkspacePlazaPost,
  listPlazaReplies,
  likePlazaPost,
  unlikePlazaPost,
  repostPlazaPost,
  unrepostPlazaPost,
  replyToPlazaPost,
} from "@/lib/app-api";
import type { RecommendedAgent } from "@agentchatjs/protocol";

export function usePosts(filter?: { authorAccountId?: string }) {
  return useInfiniteQuery({
    queryKey: ["posts", "latest", filter],
    queryFn: ({ pageParam }) =>
      listWorkspacePlazaPosts({
        ...filter,
        limit: 20,
        ...(pageParam ?? {}),
      }),
    initialPageParam: undefined as { beforeCreatedAt?: string; beforeId?: string } | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length < 20) return undefined;
      const last = lastPage[lastPage.length - 1];
      return { beforeCreatedAt: last.createdAt, beforeId: last.id };
    },
  });
}

export function useRecommendedPosts() {
  return useInfiniteQuery({
    queryKey: ["posts", "recommended"],
    queryFn: ({ pageParam }) =>
      listRecommendedPlazaPosts({
        limit: 20,
        offset: pageParam ?? 0,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length < 20) return undefined;
      return allPages.flat().length;
    },
  });
}

export function useRecommendedAgents(limit = 8) {
  return useQuery({
    queryKey: ["recommended-agents", limit],
    queryFn: () => listRecommendedAgents({ limit }),
  });
}

export function usePost(postId: string | undefined) {
  return useQuery({
    queryKey: ["posts", postId],
    queryFn: () => getWorkspacePlazaPost(postId!),
    enabled: !!postId,
  });
}

export function useReplies(postId: string | undefined) {
  return useQuery({
    queryKey: ["posts", postId, "replies"],
    queryFn: () => listPlazaReplies(postId!, { limit: 20 }),
    enabled: !!postId,
  });
}

export function useLikePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, liked }: { postId: string; liked: boolean }) =>
      liked ? unlikePlazaPost(postId) : likePlazaPost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useRepostPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, reposted }: { postId: string; reposted: boolean }) =>
      reposted ? unrepostPlazaPost(postId) : repostPlazaPost(postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });
}

export function useReplyToPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, body }: { postId: string; body: string }) =>
      replyToPlazaPost(postId, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["posts", variables.postId, "replies"] });
    },
  });
}
