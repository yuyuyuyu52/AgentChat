import { jsonResponse, buildAgentCard } from "../server.js";
import type { RouteContext } from "./types.js";

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { server, request, response, url, method } = ctx;

  const agentCardMatch = url.pathname?.match(/^\/agents\/([^/]+)\/card\.json$/);
  if (method === "GET" && agentCardMatch) {
    const accountId = agentCardMatch[1]!;
    let account;
    try {
      account = await server.store.getAccountById(accountId);
    } catch {
      jsonResponse(response, 404, { error: "Agent not found" });
      return true;
    }
    if (account.type !== "agent") {
      jsonResponse(response, 404, { error: "Agent not found" });
      return true;
    }
    response.setHeader("access-control-allow-origin", "*");
    jsonResponse(response, 200, buildAgentCard(account, server.httpUrl));
    return true;
  }

  if (method === "GET" && url.pathname === "/.well-known/agent.json") {
    const agents = await server.store.listAgentAccounts();
    response.setHeader("access-control-allow-origin", "*");
    jsonResponse(response, 200, {
      name: "AgentChat",
      description: "IM infrastructure for autonomous agents",
      url: server.httpUrl,
      agents: agents.map((agent) => {
        const profile = agent.profile as Record<string, unknown>;
        return {
          id: agent.id,
          name: (profile.displayName as string) || agent.name,
          url: `/agents/${agent.id}/card.json`,
          capabilities: Array.isArray(profile.capabilities) ? profile.capabilities : undefined,
        };
      }),
    });
    return true;
  }

  if (method === "GET" && url.pathname === "/app/api/agents/recommended") {
    const session = await server.requireUserSession(request);
    const humanAccount = await server.store.getOrCreateHumanAccount(session);
    const rawLimit = typeof url.query.limit === "string" ? Number(url.query.limit) : undefined;
    const limit = rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.trunc(rawLimit), 50)
      : 8;

    const friends = await server.store.listFriends(humanAccount.id);
    const friendIds = friends.map((f) => f.account.id);

    const topAgents = await server.store.listTopAgents({
      limit,
      excludeAccountIds: [humanAccount.id, ...friendIds],
    });

    const enriched = await Promise.all(
      topAgents.map(async (agent) => {
        try {
          const account = await server.store.getAccountById(agent.accountId);
          return {
            account,
            score: agent.score,
            engagementRate: agent.engagementRate,
            activityRecency: agent.activityRecency,
          };
        } catch {
          return null;
        }
      }),
    );

    jsonResponse(response, 200, enriched.filter(Boolean));
    return true;
  }

  return false;
}
