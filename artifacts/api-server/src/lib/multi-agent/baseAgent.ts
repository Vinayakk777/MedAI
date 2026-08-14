import {
  AgentDefinition, AgentInput, AgentOutput, AgentContext,
  AgentConfig, LLMProvider, LLMGenerateParams,
} from "./types";
import { getLLMProvider } from "./providers/llmProvider";

export abstract class BaseAgent implements AgentDefinition {
  abstract readonly name: string;
  abstract readonly description: string;
  readonly version = "1.0";
  readonly dependsOn: string[] = [];
  abstract readonly inputSchema: Record<string, unknown>;
  abstract readonly outputSchema: Record<string, unknown>;
  maxRetries = 2;
  timeoutMs = 14000;

  protected config: AgentConfig;

  constructor(config?: AgentConfig) {
    this.config = config ?? {};
    if (config?.maxRetries !== undefined) this.maxRetries = config.maxRetries;
    if (config?.timeoutMs !== undefined) this.timeoutMs = config.timeoutMs;
  }

  abstract execute(input: AgentInput, context: AgentContext): Promise<AgentOutput>;

  protected getProvider(): LLMProvider | undefined {
    return getLLMProvider(this.config.llmProvider);
  }

  protected async generateJSON<T>(
    systemPrompt: string,
    userContent: string,
    opts?: { temperature?: number; maxTokens?: number },
  ): Promise<T | null> {
    const provider = this.getProvider();
    if (!provider) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const params: LLMGenerateParams = {
        systemPrompt,
        userContent,
        temperature: opts?.temperature ?? this.config.temperature ?? 0.3,
        maxTokens: opts?.maxTokens ?? this.config.maxTokens ?? 2048,
        signal: controller.signal,
        responseFormat: "json",
      };
      return await provider.generateJSON<T>(params);
    } finally {
      clearTimeout(timeout);
    }
  }

  protected async generateText(
    systemPrompt: string,
    userContent: string,
    opts?: { temperature?: number; maxTokens?: number },
  ): Promise<string | null> {
    const provider = this.getProvider();
    if (!provider) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const params: LLMGenerateParams = {
        systemPrompt,
        userContent,
        temperature: opts?.temperature ?? this.config.temperature ?? 0.3,
        maxTokens: opts?.maxTokens ?? this.config.maxTokens ?? 2048,
        signal: controller.signal,
        responseFormat: "text",
      };
      return await provider.generateText(params);
    } finally {
      clearTimeout(timeout);
    }
  }

  protected buildErrorOutput(
    error: string,
    startTime: number,
    retryCount: number,
  ): AgentOutput {
    return {
      agentName: this.name,
      status: "error",
      data: {},
      confidence: 0,
      summary: `Agent failed: ${error}`,
      processingTimeMs: Date.now() - startTime,
      error,
      retryCount,
    };
  }

  protected buildSuccessOutput(
    data: Record<string, unknown>,
    confidence: number,
    summary: string,
    startTime: number,
    retryCount: number,
  ): AgentOutput {
    return {
      agentName: this.name,
      status: "success",
      data,
      confidence,
      summary,
      processingTimeMs: Date.now() - startTime,
      retryCount,
    };
  }
}
