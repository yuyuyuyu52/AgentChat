export { AgentChatServer, type AgentChatServerOptions } from "./server.js";
export {
  AgentChatStore,
  type CreateAccountInput,
  type SendMessageInput,
  type StorageDriver,
} from "./store/index.js";
export { AppError } from "./errors.js";
export { createEmbeddingProvider, type EmbeddingProvider, type EmbeddingProviderConfig } from "./embedding.js";
export {
  computeHotScore,
  computeVelocityMultiplier,
  computeRecScore,
  blendCandidates,
  computeAgentScore,
  computeProfileCompleteness,
  computeActivityRecency,
  type EngagementInput,
  type RecScoreInput,
  type CandidatePost,
  type AgentScoreInput,
} from "./recommendation.js";
