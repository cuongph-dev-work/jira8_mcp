import { readFile } from "node:fs/promises";
import { z } from "zod";
import { configError } from "../errors.js";
import { fromRoot } from "../bootstrap.js";

const gitlabLinkSchema = z.object({
  gitlabBaseUrl: z.string().url(),
  projectPath: z.string().min(1),
});

const projectMapSchema = z.record(z.array(gitlabLinkSchema));

export type GitlabProjectLink = z.infer<typeof gitlabLinkSchema>;
export type GitlabProjectMap = z.infer<typeof projectMapSchema>;

export const DEFAULT_GITLAB_PROJECTS_FILE = fromRoot(".jira/gitlab-projects.json");

export async function loadGitlabProjectLinks(
  projectKey: string,
  filePath: string = DEFAULT_GITLAB_PROJECTS_FILE
): Promise<GitlabProjectLink[]> {
  let rawText: string;
  try {
    rawText = await readFile(filePath, "utf8");
  } catch {
    throw configError(
      `GitLab project map not found at ${filePath}. Copy .jira/gitlab-projects.json.example and configure links for ${projectKey}.`
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch (err: unknown) {
    throw configError(`Invalid JSON in ${filePath}`, err);
  }

  const parsed = projectMapSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw configError(`Invalid GitLab project map in ${filePath}`, parsed.error);
  }

  const links = parsed.data[projectKey];
  if (!links || links.length === 0) {
    throw configError(
      `No GitLab links configured for project "${projectKey}" in ${filePath}.`
    );
  }

  return links.map((link) => ({
    gitlabBaseUrl: link.gitlabBaseUrl.replace(/\/$/, ""),
    projectPath: link.projectPath.replace(/^\/+|\/+$/g, ""),
  }));
}
