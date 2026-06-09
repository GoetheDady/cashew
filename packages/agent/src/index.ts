import { Agent } from "@earendil-works/pi-agent-core";
import { getEnvApiKey, getModel, registerBuiltInApiProviders } from "@earendil-works/pi-ai";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface AgentRunInput {
  prompt: string;
}

export interface AgentRunResult {
  text: string;
}

registerBuiltInApiProviders();

function getLocalEnvValue(name: string): string | undefined {
  const candidateFiles = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "apps/desktop/.env.local"),
    path.resolve(process.cwd(), "apps/desktop/.env"),
    path.resolve(process.cwd(), "../..", ".env.local"),
    path.resolve(process.cwd(), "../..", ".env"),
    path.resolve(process.cwd(), "../..", "apps/desktop/.env.local"),
    path.resolve(process.cwd(), "../..", "apps/desktop/.env"),
  ];

  for (const filePath of [...new Set(candidateFiles)]) {
    if (!existsSync(filePath)) {
      continue;
    }

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();

      if (key !== name) {
        continue;
      }

      return trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    }
  }

  return undefined;
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunResult> {
  const prompt = input.prompt.trim();

  if (!prompt) {
    throw new Error("Prompt is empty.");
  }

  const apiKey = getEnvApiKey("deepseek") ?? getLocalEnvValue("DEEPSEEK_API_KEY");

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set.");
  }

  const model = getModel("deepseek", "deepseek-v4-flash");
  let text = "";

  const agent = new Agent({
    initialState: {
      systemPrompt: "You are Cashew, a concise and helpful desktop agent.",
      model,
      thinkingLevel: "minimal",
      tools: [],
      messages: [],
    },
    getApiKey: (provider) => (provider === "deepseek" ? apiKey : undefined),
  });

  agent.subscribe((event) => {
    if (event.type !== "message_update") {
      return;
    }

    const update = event.assistantMessageEvent;

    if (update.type === "text_delta") {
      text += update.delta;
    }
  });

  await agent.prompt(prompt);

  return {
    text: text.trim(),
  };
}
