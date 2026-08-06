// ---------------------------------------------------------------------------
// Bootstrap — load .env and resolve paths relative to project root.
// Automatically triggered via config.ts import chain.
//
// Strategy:
//   Local dev (tsx src/server.ts):  session stored in <project>/.jira/
//   Published npm (npx pkg):        session stored in ~/.jira/jira-mcp/
// ---------------------------------------------------------------------------
import { resolve, dirname, join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { config as loadDotenv } from "dotenv";

const thisFile =
  typeof __filename !== "undefined"
    ? __filename
    : fileURLToPath(import.meta.url);

export const projectRoot = dirname(dirname(thisFile));
export const fromRoot = (p: string): string => resolve(projectRoot, p);

const isNpmInstall = projectRoot.includes("node_modules");

export const defaultSessionDir = isNpmInstall
  ? join(homedir(), ".jira", "jira-mcp")
  : fromRoot(".jira");

export const defaultDownloadsDir = isNpmInstall
  ? join(homedir(), ".jira", "jira-mcp", "downloads")
  : fromRoot("downloads");

if (isNpmInstall) {
  loadDotenv({ path: join(defaultSessionDir, ".env") });
} else {
  loadDotenv({ path: fromRoot(".env") });
}
