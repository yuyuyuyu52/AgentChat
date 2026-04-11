import { AgentChatServer } from "../index.js";

const port = process.env.AGENTCHAT_PORT ? Number(process.env.AGENTCHAT_PORT) : undefined;
const host = process.env.AGENTCHAT_HOST;
const databasePath = process.env.AGENTCHAT_DB_PATH;

const server = new AgentChatServer({
  host,
  port,
  databasePath,
});

await server.start();

console.log(`agentchatd listening on ${server.httpUrl}`);
console.log(`WebSocket endpoint: ${server.wsUrl}`);
console.log(`Database: ${server.store.databasePath}`);

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
