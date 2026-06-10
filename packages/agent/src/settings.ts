import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ChatErrorCode } from "@cashew/shared";

export interface AgentModelConfig {
  provider: "deepseek";
  model: "deepseek-v4-flash";
  apiKey: string;
  thinkingLevel: "minimal";
}

export interface LoadAgentModelConfigOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  isPackaged?: boolean;
  exists?: (filePath: string) => boolean;
  readFile?: (filePath: string) => string;
}

export class AgentConfigError extends Error {
  readonly code: ChatErrorCode;

  constructor(code: ChatErrorCode, message: string) {
    super(message);
    this.name = "AgentConfigError";
    this.code = code;
  }
}

function readEnvFileValue(
  filePath: string,
  name: string,
  exists: (filePath: string) => boolean,
  readFile: (filePath: string) => string,
): string | undefined {
  if (!exists(filePath)) {
    return undefined;
  }

  const lines = readFile(filePath).split(/\r?\n/);

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

  return undefined;
}

function resolveWorkspaceRoot(cwd: string): string {
  if (path.basename(cwd) === "desktop" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..");
  }

  return cwd;
}

export function getDevelopmentEnvFiles(cwd = process.cwd()): string[] {
  const workspaceRoot = resolveWorkspaceRoot(cwd);

  return [
    path.resolve(workspaceRoot, "apps/desktop/.env.local"),
    path.resolve(workspaceRoot, "apps/desktop/.env"),
    path.resolve(workspaceRoot, ".env.local"),
    path.resolve(workspaceRoot, ".env"),
  ];
}

export function loadAgentModelConfig(
  options: LoadAgentModelConfigOptions = {},
): AgentModelConfig {
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const readFile = options.readFile ?? ((filePath: string) => readFileSync(filePath, "utf8"));
  const cwd = options.cwd ?? process.cwd();
  const isPackaged = options.isPackaged ?? false;

  let apiKey = env.DEEPSEEK_API_KEY?.trim();

  if (!apiKey && !isPackaged) {
    for (const filePath of getDevelopmentEnvFiles(cwd)) {
      apiKey = readEnvFileValue(filePath, "DEEPSEEK_API_KEY", exists, readFile);

      if (apiKey) {
        break;
      }
    }
  }

  if (!apiKey) {
    throw new AgentConfigError("missing_api_key", "DEEPSEEK_API_KEY is not set.");
  }

  return {
    provider: "deepseek",
    model: "deepseek-v4-flash",
    apiKey,
    thinkingLevel: "minimal",
  };
}
