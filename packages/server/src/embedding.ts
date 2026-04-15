export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
  readonly model: string;
}

export type EmbeddingProviderConfig = {
  provider?: "openai" | "mock";
  apiKey?: string;
  model?: string;
};

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? "text-embedding-3-small";
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;
  readonly model = "mock";

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.hashToVector(text));
  }

  private hashToVector(text: string): number[] {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }

    const vector: number[] = [];
    let seed = hash;
    for (let i = 0; i < this.dimensions; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      vector.push((seed / 0x7fffffff) * 2 - 1);
    }

    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map((v) => v / magnitude);
  }
}

export function createEmbeddingProvider(
  config: EmbeddingProviderConfig = {},
): EmbeddingProvider {
  const provider = config.provider ?? (config.apiKey ? "openai" : "mock");

  switch (provider) {
    case "openai": {
      const apiKey = config.apiKey;
      if (!apiKey) {
        throw new Error(
          "AGENTCHAT_OPENAI_API_KEY is required when using the OpenAI embedding provider",
        );
      }
      return new OpenAIEmbeddingProvider(apiKey, config.model);
    }
    case "mock":
      return new MockEmbeddingProvider();
    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}
