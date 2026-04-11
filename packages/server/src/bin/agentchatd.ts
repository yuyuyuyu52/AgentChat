import { AgentChatServer } from "../index.js";

const port = process.env.AGENTCHAT_PORT ? Number(process.env.AGENTCHAT_PORT) : undefined;
const host = process.env.AGENTCHAT_HOST;
const databasePath = process.env.AGENTCHAT_DB_PATH;
const adminPassword = process.env.AGENTCHAT_ADMIN_PASSWORD;
const googleClientId = process.env.AGENTCHAT_GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.AGENTCHAT_GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.AGENTCHAT_GOOGLE_REDIRECT_URI;

const server = new AgentChatServer({
  host,
  port,
  databasePath,
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
console.log(`Database: ${server.store.databasePath}`);
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
