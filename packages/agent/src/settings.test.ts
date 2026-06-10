import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AgentConfigError, loadAgentModelConfig } from "./settings.js";

function withTempWorkspace(run: (root: string) => void): void {
  const root = mkdtempSync(path.join(tmpdir(), "cashew-settings-"));

  try {
    run(root);
  } finally {
    rmSync(root, {
      recursive: true,
      force: true,
    });
  }
}

describe("loadAgentModelConfig", () => {
  it("prefers process env over development env files", () => {
    withTempWorkspace((root) => {
      writeFileSync(path.join(root, ".env.local"), "DEEPSEEK_API_KEY=file-key\n");

      const config = loadAgentModelConfig({
        cwd: root,
        env: {
          DEEPSEEK_API_KEY: "env-key",
        },
      });

      expect(config.apiKey).toBe("env-key");
      expect(config.provider).toBe("deepseek");
      expect(config.model).toBe("deepseek-v4-flash");
      expect(config.thinkingLevel).toBe("minimal");
    });
  });

  it("reads development env files in the configured order", () => {
    withTempWorkspace((root) => {
      const desktopDir = path.join(root, "apps/desktop");

      mkdirSync(desktopDir, {
        recursive: true,
      });
      writeFileSync(path.join(root, ".env.local"), "DEEPSEEK_API_KEY=root-local\n");
      writeFileSync(path.join(root, ".env"), "DEEPSEEK_API_KEY=root-env\n");
      writeFileSync(path.join(root, "apps/desktop/.env"), "DEEPSEEK_API_KEY=desktop-env\n", {
        flag: "wx",
      });

      const config = loadAgentModelConfig({
        cwd: root,
        env: {},
        exists: (filePath) => filePath !== path.join(desktopDir, ".env.local"),
      });

      expect(config.apiKey).toBe("desktop-env");
    });
  });

  it("does not read env files for packaged builds", () => {
    withTempWorkspace((root) => {
      writeFileSync(path.join(root, ".env.local"), "DEEPSEEK_API_KEY=file-key\n");

      expect(() =>
        loadAgentModelConfig({
          cwd: root,
          env: {},
          isPackaged: true,
        }),
      ).toThrow(AgentConfigError);
    });
  });

  it("maps missing keys to missing_api_key", () => {
    try {
      loadAgentModelConfig({
        env: {},
        exists: () => false,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentConfigError);
      expect((error as AgentConfigError).code).toBe("missing_api_key");
    }
  });
});
