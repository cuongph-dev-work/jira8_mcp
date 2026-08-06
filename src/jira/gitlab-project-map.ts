import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { configError } from "../errors.js";
import { defaultSessionDir } from "../bootstrap.js";

const gitlabLinkSchema = z.object({
  name: z.string().trim().min(1),
  gitlabBaseUrl: z.string().url(),
  projectPath: z.string().min(1),
});

const projectMapSchema = z.record(z.array(gitlabLinkSchema));

export type GitlabProjectLink = z.infer<typeof gitlabLinkSchema>;
export type GitlabProjectMap = z.infer<typeof projectMapSchema>;

export const DEFAULT_GITLAB_PROJECTS_FILE = join(defaultSessionDir, "gitlab-projects.json");

export async function loadGitlabProjectLinks(
  projectKey: string,
  filePath: string = DEFAULT_GITLAB_PROJECTS_FILE
): Promise<GitlabProjectLink[]> {
  let rawText: string;
  try {
    rawText = await readFile(filePath, "utf8");
  } catch {
    throw configError(
      `GitLab project map not found at ${filePath}. Provide GITLAB_PROJECTS_JSON in MCP env, or copy .jira/gitlab-projects.json.example to this path (or set GITLAB_PROJECTS_FILE) and configure links for ${projectKey}.`
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (err: unknown) {
    throw configError(`Invalid JSON in ${filePath}`, err);
  }

  return parseAndExtractLinks(projectKey, parsedJson, filePath);
}

export async function loadGitlabProjectLinksFromJson(
  projectKey: string,
  rawJson: string
): Promise<GitlabProjectLink[]> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawJson);
  } catch (err: unknown) {
    throw configError("Invalid JSON in GITLAB_PROJECTS_JSON", err);
  }

  return parseAndExtractLinks(projectKey, parsedJson, "GITLAB_PROJECTS_JSON");
}

function parseAndExtractLinks(
  projectKey: string,
  parsedJson: unknown,
  sourceLabel: string
): GitlabProjectLink[] {
  const parsed = projectMapSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw configError(`Invalid GitLab project map in ${sourceLabel}`, parsed.error);
  }

  const links = parsed.data[projectKey];
  if (!links || links.length === 0) {
    throw configError(
      `No GitLab links configured for project "${projectKey}" in ${sourceLabel}.`
    );
  }

  return links.map((link) => ({
    name: link.name,
    gitlabBaseUrl: link.gitlabBaseUrl.replace(/\/$/, ""),
    projectPath: link.projectPath.replace(/^\/+|\/+$/g, ""),
  }));
}
