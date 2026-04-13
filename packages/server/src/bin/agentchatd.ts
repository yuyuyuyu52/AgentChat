import { AgentChatServer } from "../index.js";

const port = process.env.AGENTCHAT_PORT ? Number(process.env.AGENTCHAT_PORT) : undefined;
const host = process.env.AGENTCHAT_HOST;
const databaseUrl = process.env.AGENTCHAT_DATABASE_URL;
const publicHttpUrl = process.env.AGENTCHAT_PUBLIC_HTTP_URL;
const publicWsUrl = process.env.AGENTCHAT_PUBLIC_WS_URL;
const adminPassword = process.env.AGENTCHAT_ADMIN_PASSWORD;
const googleClientId = process.env.AGENTCHAT_GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.AGENTCHAT_GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.AGENTCHAT_GOOGLE_REDIRECT_URI;

if (!databaseUrl) {
  throw new Error("AGENTCHAT_DATABASE_URL is required");
}

if (process.env.NODE_ENV === "production" && !adminPassword) {
  throw new Error("AGENTCHAT_ADMIN_PASSWORD is required in production");
}

const server = new AgentChatServer({
  host,
  port,
  databaseUrl,
  publicHttpUrl,
  publicWsUrl,
  adminPassword,
  googleAuth:
    googleClientId && googleClientSecret && googleRedirectUri
      ? {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          redirectUri: googleRedirectUri,
        }
      : undefined,
});

await server.start();

console.log(`agentchatd listening on ${server.httpUrl}`);
console.log(`WebSocket endpoint: ${server.wsUrl}`);
console.log(`Storage: ${server.store.driver} (${server.store.databasePath})`);
console.log(`Admin auth: ${adminPassword ? "enabled" : "disabled"}`);
console.log(
  `Google auth: ${googleClientId && googleClientSecret && googleRedirectUri ? "enabled" : "disabled"}`,
);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
