import type { IncomingMessage, ServerResponse } from "node:http";
import type { UrlWithParsedQuery } from "node:url";
import type { AgentChatServer } from "../server.js";
import type { StoredUserSession } from "../store/index.js";

export type RouteContext = {
  server: AgentChatServer;
  request: IncomingMessage;
  response: ServerResponse;
  url: UrlWithParsedQuery;
  method: string;
  userSession: StoredUserSession | undefined;
  isAdminAuthorized: boolean;
};
