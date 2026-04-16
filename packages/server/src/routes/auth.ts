import { z } from "zod";
import { AppError, asAppError } from "../errors.js";
import { readJson, jsonResponse, redirect } from "../server.js";
import type { RouteContext } from "./types.js";

const HumanLoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const HumanRegisterBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
});

export async function handle(ctx: RouteContext): Promise<boolean> {
  const { server, request, response, url, method } = ctx;

  if (method === "POST" && url.pathname === "/auth/login") {
    const isForm = request.headers["content-type"]?.includes("application/x-www-form-urlencoded");
    const body = isForm
      ? HumanLoginBodySchema.parse(await server.readForm(request))
      : HumanLoginBodySchema.parse(await readJson(request));
    const rateLimitKey = `user-login:${server.getClientAddress(request)}`;
    server.userLoginRateLimiter.assertAllowed(rateLimitKey);
    try {
      const user = await server.store.authenticateHumanUser(body.email, body.password);
      server.userLoginRateLimiter.clear(rateLimitKey);
      await server.startUserSession(
        request,
        response,
        {
          createdAt: Date.now(),
          subject: `local:${user.id}`,
          email: user.email,
          name: user.name,
          authProvider: "local",
        },
      );
    } catch (error) {
      const appError = error instanceof z.ZodError
        ? new AppError("INVALID_ARGUMENT", error.message)
        : asAppError(error);
      if (appError.statusCode === 401) {
        server.userLoginRateLimiter.recordFailure(rateLimitKey);
      }
      throw error;
    }
    if (isForm) {
      redirect(response, "/app");
      return true;
    }
    jsonResponse(response, 200, { ok: true });
    return true;
  }

  if (method === "POST" && url.pathname === "/auth/register") {
    const isForm = request.headers["content-type"]?.includes("application/x-www-form-urlencoded");
    const body = isForm
      ? HumanRegisterBodySchema.parse(await server.readForm(request))
      : HumanRegisterBodySchema.parse(await readJson(request));
    const user = await server.store.createHumanUser(body);
    await server.startUserSession(
      request,
      response,
      {
        createdAt: Date.now(),
        subject: `local:${user.id}`,
        email: user.email,
        name: user.name,
        authProvider: "local",
      },
    );
    if (isForm) {
      redirect(response, "/app");
      return true;
    }
    jsonResponse(response, 201, { ok: true });
    return true;
  }

  if (method === "GET" && url.pathname === "/auth/google/login") {
    server.ensureGoogleAuthConfigured();
    const state = await server.store.createOAuthState(10 * 60);
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", server.googleAuth!.clientId);
    authUrl.searchParams.set("redirect_uri", server.googleAuth!.redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", "select_account");
    redirect(response, authUrl.toString());
    return true;
  }

  if (method === "GET" && url.pathname === "/auth/google/callback") {
    server.ensureGoogleAuthConfigured();
    const code = typeof url.query.code === "string" ? url.query.code : undefined;
    const state = typeof url.query.state === "string" ? url.query.state : undefined;
    if (!code || !state || !(await server.store.consumeOAuthState(state))) {
      throw new AppError("UNAUTHORIZED", "Invalid Google OAuth callback", 401);
    }
    const profile = await server.exchangeGoogleCodeForProfile(code);
    await server.startUserSession(
      request,
      response,
      profile.picture
        ? {
            createdAt: Date.now(),
            subject: profile.sub,
            email: profile.email,
            name: profile.name,
            picture: profile.picture,
            authProvider: "google",
          }
        : {
            createdAt: Date.now(),
            subject: profile.sub,
            email: profile.email,
            name: profile.name,
            authProvider: "google",
          },
    );
    redirect(response, "/app");
    return true;
  }

  if (method === "GET" && url.pathname === "/auth/logout") {
    const sessionId = server.getCookie(request, "agentchat_user_session");
    if (sessionId) {
      await server.store.deleteUserSession(sessionId);
    }
    response.setHeader(
      "set-cookie",
      server.makeSessionCookie("agentchat_user_session", "", {
        maxAge: 0,
        secure: server.shouldUseSecureCookies(request),
      }),
    );
    redirect(response, "/");
    return true;
  }

  return false;
}
