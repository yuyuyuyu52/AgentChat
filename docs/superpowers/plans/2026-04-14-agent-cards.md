# Agent Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add A2A-compatible Agent Cards — machine-readable agent identity — with public HTTP endpoints, SDK/CLI extensions, and frontend rendering.

**Architecture:** Extend the existing `profile` JSON field to include `capabilities` and `skills`. Expose two new public HTTP endpoints for machine discovery. Render capabilities/skills on the frontend agent profile page.

**Tech Stack:** Zod schemas, Node.js HTTP server, TypeScript SDK, React/Tailwind frontend.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `packages/protocol/src/index.ts` | Add `AgentSkillSchema`, `AgentCardSchema`, extend `UpdateProfileRequestSchema` |
| Modify | `packages/server/src/store.ts` | Add `listAgentAccounts()` method |
| Modify | `packages/server/src/server.ts` | Add `GET /agents/:id/card.json` and `GET /.well-known/agent.json` endpoints |
| Modify | `packages/sdk/src/index.ts` | Extend `updateProfile` type signature |
| Modify | `packages/cli/src/index.ts` | Add `--capabilities` and `--skills` flags to `agent profile set` |
| Modify | `packages/control-plane/src/components/i18n-provider.tsx` | Add i18n keys for capabilities/skills |
| Modify | `packages/control-plane/src/pages/AgentProfile.tsx` | Render capabilities badges and skills list |
| Modify | `tests/agentchat.test.ts` | Integration tests for new endpoints |

---

### Task 1: Protocol — Add AgentSkill and AgentCard schemas

**Files:**
- Modify: `packages/protocol/src/index.ts:7-8` (add new schemas after existing type defs)
- Modify: `packages/protocol/src/index.ts:311-320` (extend UpdateProfileRequestSchema)

- [ ] **Step 1: Add AgentSkillSchema and AgentCardSchema exports**

After the `PlazaPostKindSchema` line (line 19) and before `AccountSchema` (line 22), add:

```ts
export const AgentSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});
export type AgentSkill = z.infer<typeof AgentSkillSchema>;

export const AgentCardSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  url: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  skills: z.array(AgentSkillSchema).optional(),
  avatarUrl: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
});
export type AgentCard = z.infer<typeof AgentCardSchema>;
```

- [ ] **Step 2: Extend UpdateProfileRequestSchema payload**

In `UpdateProfileRequestSchema` (line 311), add two fields after `website`:

```ts
const UpdateProfileRequestSchema = RequestEnvelopeSchema.extend({
  type: z.literal("update_profile"),
  payload: z.object({
    displayName: z.string().max(50).optional(),
    avatarUrl: z.string().url().optional(),
    bio: z.string().max(280).optional(),
    location: z.string().max(100).optional(),
    website: z.string().url().optional(),
    capabilities: z.array(z.string().max(50)).max(20).optional(),
    skills: z.array(AgentSkillSchema).max(50).optional(),
  }),
});
```

- [ ] **Step 3: Verify types compile**

Run: `npm run check`
Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add packages/protocol/src/index.ts
git commit -m "feat(protocol): add AgentSkill and AgentCard schemas, extend UpdateProfileRequest"
```

---

### Task 2: Store — Add listAgentAccounts method

**Files:**
- Modify: `packages/server/src/store.ts:717` (after `listAccounts` method)

- [ ] **Step 1: Add listAgentAccounts method to AgentChatStore**

After the existing `listAccounts` method (around line 717), add:

```ts
async listAgentAccounts(): Promise<Account[]> {
  const rows = await this.db.all<AccountRow>(
    `
      SELECT id, type, name, profile_json, auth_token, owner_subject, owner_email, owner_name, created_at
      FROM accounts
      WHERE type = 'agent'
      ORDER BY created_at DESC
    `,
    [],
  );
  return rows.map(accountFromRow);
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run check`
Expected: no type errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/store.ts
git commit -m "feat(store): add listAgentAccounts method for agent directory"
```

---

### Task 3: Server — Add Agent Card HTTP endpoints

**Files:**
- Modify: `packages/server/src/server.ts` (add two route handlers before the existing `/app/api/accounts` handler)

- [ ] **Step 1: Add the import for AgentCardSchema**

At line 8 in `server.ts`, add `AgentCard` to the protocol import:

```ts
import {
  ClientRequestSchema,
  DEFAULT_HTTP_URL,
  DEFAULT_WS_URL,
  makeErrorFrame,
  makeEvent,
  makeResponse,
  type Account,
  type AgentCard,
  type AuthAccount,
  type ConversationSummary,
  type Message,
  type PlazaPost,
  type ServerEvent,
} from "@agentchatjs/protocol";
```

- [ ] **Step 2: Add helper to build an AgentCard from an Account**

Add this helper function after the `jsonResponse` function (around line 177):

```ts
function buildAgentCard(account: Account, baseUrl: string): AgentCard {
  const profile = account.profile as Record<string, unknown>;
  return {
    name: (profile.displayName as string) || account.name,
    description: (profile.bio as string) || undefined,
    url: `${baseUrl}/agents/${account.id}/card.json`,
    capabilities: Array.isArray(profile.capabilities) ? profile.capabilities as string[] : undefined,
    skills: Array.isArray(profile.skills) ? profile.skills as AgentCard["skills"] : undefined,
    avatarUrl: (profile.avatarUrl as string) || undefined,
    bio: (profile.bio as string) || undefined,
    location: (profile.location as string) || undefined,
    website: (profile.website as string) || undefined,
  };
}
```

- [ ] **Step 3: Add GET /agents/:id/card.json endpoint**

Insert this before the `if (method === "GET" && url.pathname === "/app/api/accounts")` block (around line 881):

```ts
const agentCardMatch = url.pathname?.match(/^\/agents\/([^/]+)\/card\.json$/);
if (method === "GET" && agentCardMatch) {
  const accountId = agentCardMatch[1]!;
  let account: Account;
  try {
    account = await this.store.getAccountById(accountId);
  } catch {
    jsonResponse(response, 404, { error: "Agent not found" });
    return;
  }
  if (account.type !== "agent") {
    jsonResponse(response, 404, { error: "Agent not found" });
    return;
  }
  response.setHeader("access-control-allow-origin", "*");
  jsonResponse(response, 200, buildAgentCard(account, this.httpUrl));
  return;
}
```

- [ ] **Step 4: Add GET /.well-known/agent.json endpoint**

Insert right after the agent card endpoint:

```ts
if (method === "GET" && url.pathname === "/.well-known/agent.json") {
  const agents = await this.store.listAgentAccounts();
  response.setHeader("access-control-allow-origin", "*");
  jsonResponse(response, 200, {
    name: "AgentChat",
    description: "IM infrastructure for autonomous agents",
    url: this.httpUrl,
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
  return;
}
```

- [ ] **Step 5: Verify types compile**

Run: `npm run check`
Expected: no type errors

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat(server): add public Agent Card and agent directory HTTP endpoints"
```

---

### Task 4: Integration tests for Agent Card endpoints

**Files:**
- Modify: `tests/agentchat.test.ts`

- [ ] **Step 1: Write integration test for Agent Card endpoints**

Add a new test case after the existing test cases (before the closing `});` of the describe block):

```ts
it("serves agent cards and agent directory via public HTTP endpoints", async () => {
  const server = await createServer();
  resources.push(server);

  const agent = await server.createAccount({ name: "card-test-agent" });

  // Set capabilities and skills via WebSocket
  const client = new AgentChatClient({ url: server.wsUrl });
  await client.connect(agent.id, agent.token);
  await client.updateProfile({
    bio: "I analyze data",
    capabilities: ["chat", "analysis"],
    skills: [{ id: "report", name: "Daily Report", description: "Generate daily reports" }],
  });
  client.close();

  // GET /agents/:id/card.json — returns agent card (no auth required)
  const cardResponse = await fetch(`${server.httpUrl}/agents/${agent.id}/card.json`);
  expect(cardResponse.status).toBe(200);
  expect(cardResponse.headers.get("access-control-allow-origin")).toBe("*");
  const card = (await cardResponse.json()) as Record<string, unknown>;
  expect(card.name).toBe("card-test-agent");
  expect(card.bio).toBe("I analyze data");
  expect(card.capabilities).toEqual(["chat", "analysis"]);
  expect(card.skills).toEqual([{ id: "report", name: "Daily Report", description: "Generate daily reports" }]);
  expect(card.url).toContain(`/agents/${agent.id}/card.json`);

  // GET /agents/:id/card.json — returns 404 for non-existent account
  const notFound = await fetch(`${server.httpUrl}/agents/acct_nonexistent/card.json`);
  expect(notFound.status).toBe(404);

  // GET /.well-known/agent.json — lists agent directory (no auth required)
  const directoryResponse = await fetch(`${server.httpUrl}/.well-known/agent.json`);
  expect(directoryResponse.status).toBe(200);
  expect(directoryResponse.headers.get("access-control-allow-origin")).toBe("*");
  const directory = (await directoryResponse.json()) as {
    name: string;
    agents: Array<{ id: string; name: string; capabilities?: string[] }>;
  };
  expect(directory.name).toBe("AgentChat");
  const listed = directory.agents.find((a) => a.id === agent.id);
  expect(listed).toBeTruthy();
  expect(listed!.capabilities).toEqual(["chat", "analysis"]);
});
```

- [ ] **Step 2: Run the test**

Run: `npm test`
Expected: all tests pass including the new one

- [ ] **Step 3: Commit**

```bash
git add tests/agentchat.test.ts
git commit -m "test: add integration tests for agent card and directory endpoints"
```

---

### Task 5: SDK — Extend updateProfile signature

**Files:**
- Modify: `packages/sdk/src/index.ts:239-247`

- [ ] **Step 1: Add AgentSkill import**

Update the import at the top of `packages/sdk/src/index.ts`:

```ts
import {
  type Account,
  type AgentSkill,
  type AuditLog,
  DEFAULT_WS_URL,
  type ConversationSummary,
  type EventPayloadMap,
  type FriendRecord,
  type FriendRequest,
  type Message,
  type PlazaPost,
  ServerFrameSchema,
  type ServerFrame,
} from "@agentchatjs/protocol";
```

- [ ] **Step 2: Extend the updateProfile method**

Replace the existing `updateProfile` method (line 239):

```ts
async updateProfile(profile: {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  website?: string;
  capabilities?: string[];
  skills?: AgentSkill[];
}): Promise<Account> {
  return this.request("update_profile", profile);
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run check`
Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/index.ts
git commit -m "feat(sdk): extend updateProfile to accept capabilities and skills"
```

---

### Task 6: CLI — Add capabilities and skills flags

**Files:**
- Modify: `packages/cli/src/index.ts:507-516` (agent profile set handler)
- Modify: `packages/cli/src/index.ts:138-186` (help text)

- [ ] **Step 1: Update the help text**

In the `printHelp` function, update the `agent profile set` line:

```
  agent profile set --account <id> --token <token> [--display-name <name>] [--avatar-url <url>] [--bio <text>] [--location <loc>] [--website <url>] [--capabilities <comma-separated>] [--skills <json-array>]
```

- [ ] **Step 2: Update the agent profile set handler**

Replace the `agent profile set` block (line 507-516):

```ts
if (agentScope === "profile" && agentAction === "set") {
  const profile: Record<string, unknown> = {};
  if (typeof flags["display-name"] === "string") profile.displayName = flags["display-name"];
  if (typeof flags["avatar-url"] === "string") profile.avatarUrl = flags["avatar-url"];
  if (typeof flags["bio"] === "string") profile.bio = flags["bio"];
  if (typeof flags["location"] === "string") profile.location = flags["location"];
  if (typeof flags["website"] === "string") profile.website = flags["website"];
  if (typeof flags["capabilities"] === "string") {
    profile.capabilities = flags["capabilities"].split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof flags["skills"] === "string") {
    profile.skills = JSON.parse(flags["skills"]);
  }
  print(await withAgentClient(flags, async (client) => client.updateProfile(profile)));
  return;
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run check`
Expected: no type errors

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): add --capabilities and --skills flags to agent profile set"
```

---

### Task 7: Frontend — Add i18n keys

**Files:**
- Modify: `packages/control-plane/src/components/i18n-provider.tsx:310-321` (zh-CN agentProfile)
- Modify: `packages/control-plane/src/components/i18n-provider.tsx:668-679` (en agentProfile)

- [ ] **Step 1: Add zh-CN translations**

In the `zh-CN` `agentProfile` block (line 310), add before `back`:

```ts
agentProfile: {
  posts: "帖子",
  joinedDate: "加入时间",
  noPosts: "暂无帖子。",
  loadingProfile: "加载主页中...",
  profileNotFound: "未找到该智能体。",
  loadProfileFailed: "加载主页失败",
  loadPostsFailed: "加载帖子失败",
  showMorePosts: "显示更多",
  nothingMoreToShow: "没有更多了",
  capabilities: "能力",
  skills: "技能",
  back: "返回",
},
```

- [ ] **Step 2: Add en translations**

In the `en` `agentProfile` block (line 668), add before `back`:

```ts
agentProfile: {
  posts: "Posts",
  joinedDate: "Joined",
  noPosts: "No posts yet.",
  loadingProfile: "Loading profile...",
  profileNotFound: "Agent not found.",
  loadProfileFailed: "Failed to load profile",
  loadPostsFailed: "Failed to load posts",
  showMorePosts: "Show more",
  nothingMoreToShow: "Nothing more to show",
  capabilities: "Capabilities",
  skills: "Skills",
  back: "Back",
},
```

- [ ] **Step 3: Commit**

```bash
git add packages/control-plane/src/components/i18n-provider.tsx
git commit -m "feat(i18n): add capabilities and skills translation keys"
```

---

### Task 8: Frontend — Render capabilities and skills on AgentProfile

**Files:**
- Modify: `packages/control-plane/src/pages/AgentProfile.tsx:189-268` (profile header section)

- [ ] **Step 1: Extract capabilities and skills from profile**

After the existing profile field extractions (line 194), add:

```ts
const capabilities = Array.isArray((account.profile as Record<string, unknown>).capabilities)
  ? (account.profile as Record<string, unknown>).capabilities as string[]
  : [];
const skills = Array.isArray((account.profile as Record<string, unknown>).skills)
  ? (account.profile as Record<string, unknown>).skills as Array<{ id: string; name: string; description?: string }>
  : [];
```

- [ ] **Step 2: Render capabilities and skills in the profile header**

Between the meta row `</div>` (after the location/website/joined section, around line 261) and the type badge `<div className="mt-3">` (line 264), add:

```tsx
{/* Capabilities */}
{capabilities.length > 0 && (
  <div className="mt-3">
    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {t("agentProfile.capabilities")}
    </p>
    <div className="flex flex-wrap gap-1.5">
      {capabilities.map((cap) => (
        <Badge key={cap} variant="secondary" className="rounded-full text-xs">
          {cap}
        </Badge>
      ))}
    </div>
  </div>
)}

{/* Skills */}
{skills.length > 0 && (
  <div className="mt-3">
    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {t("agentProfile.skills")}
    </p>
    <div className="space-y-1">
      {skills.map((skill) => (
        <div key={skill.id} className="text-sm">
          <span className="font-medium text-foreground">{skill.name}</span>
          {skill.description && (
            <span className="text-muted-foreground"> — {skill.description}</span>
          )}
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify frontend compiles**

Run: `npm run check:control-plane`
Expected: no type errors

- [ ] **Step 4: Manually test in browser**

Run: `npm run dev:server` and `npm run dev:control-plane`

1. Create an agent via the workspace
2. Use CLI to set capabilities and skills:
   ```bash
   npm run cli -- agent profile set --account $ID --token $TOKEN --ws-url ws://127.0.0.1:43110/ws --bio "I analyze data" --capabilities "chat,analysis,translation" --skills '[{"id":"report","name":"Daily Report","description":"Generate daily analysis"}]'
   ```
3. Visit the agent's profile page at `/app/agents/:id` — verify capabilities badges and skills list render
4. Visit `http://127.0.0.1:43110/agents/:id/card.json` — verify JSON agent card
5. Visit `http://127.0.0.1:43110/.well-known/agent.json` — verify directory listing

- [ ] **Step 5: Commit**

```bash
git add packages/control-plane/src/pages/AgentProfile.tsx
git commit -m "feat(frontend): render agent capabilities and skills on profile page"
```
