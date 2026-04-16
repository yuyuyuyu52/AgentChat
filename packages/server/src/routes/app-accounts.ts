import { z } from "zod";
import { AgentSkillSchema } from "@agentchatjs/protocol";
import { AppError } from "../errors.js";
import { readJson, jsonResponse } from "../server.js";
import type { RouteContext } from "./types.js";

const CreateAccountBodySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["agent", "admin"]).optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
});

const UpdateProfileBodySchema = z.object({
  displayName: z.string().max(50).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  bio: z.string().max(280).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
  website: z.string().url().optional().nullable(),
  capabilities: z.array(z.string().max(50)).max(20).optional().nullable(),
  skills: z.array(AgentSkillSchema).max(50).optional().nullable(),
});

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { server, request, response, url, method, userSession } = ctx;

  if (method === "GET" && url.pathname === "/app/api/accounts") {
    const session = await server.requireUserSession(request);
    jsonResponse(response, 200, await server.listAccounts(session.subject));
    return true;
  }

  if (method === "GET" && url.pathname === "/app/api/session") {
    if (!userSession) {
      throw new AppError("UNAUTHORIZED", "Login required", 401);
    }
    jsonResponse(response, 200, {
      subject: userSession.subject,
      email: userSession.email,
      name: userSession.name,
      authProvider: userSession.authProvider,
    });
    return true;
  }

  if (method === "POST" && url.pathname === "/app/api/accounts") {
    const session = await server.requireUserSession(request);
    const body = CreateAccountBodySchema.parse(await readJson(request));
    jsonResponse(
      response,
      201,
      await server.createAccount({
        ...body,
        owner: {
          subject: session.subject,
          email: session.email,
          name: session.name,
        },
      }),
    );
    return true;
  }

  const appAccountTokenMatch = url.pathname?.match(/^\/app\/api\/accounts\/([^/]+)\/reset-token$/);
  if (method === "POST" && appAccountTokenMatch) {
    const session = await server.requireUserSession(request);
    jsonResponse(response, 200, await server.resetToken(appAccountTokenMatch[1]!, session.subject));
    return true;
  }

  const appAccountProfileMatch = url.pathname?.match(/^\/app\/api\/accounts\/([^/]+)\/profile$/);
  if (method === "PATCH" && appAccountProfileMatch) {
    const session = await server.requireUserSession(request);
    const body = UpdateProfileBodySchema.parse(await readJson(request));
    jsonResponse(
      response,
      200,
      await server.store.updateProfile(appAccountProfileMatch[1]!, body, session.subject),
    );
    return true;
  }

  const appAccountDetailMatch = url.pathname?.match(/^\/app\/api\/accounts\/([^/]+)$/);
  if (method === "GET" && appAccountDetailMatch) {
    await server.requireUserSession(request);
    jsonResponse(response, 200, await server.store.getAccountById(appAccountDetailMatch[1]!));
    return true;
  }

  if (method === "DELETE" && appAccountDetailMatch) {
    const session = await server.requireUserSession(request);
    await server.deleteAccount(appAccountDetailMatch[1]!, session.subject);
    jsonResponse(response, 200, { ok: true });
    return true;
  }

  return false;
}
