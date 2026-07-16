import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { fromRoot } from "../bootstrap.js";

const storeSchema = z.object({
  processedIds: z.array(z.string()).default([]),
});

export type GitlabReviewDedupStore = z.infer<typeof storeSchema>;

export const DEFAULT_GITLAB_REVIEW_DEDUP_FILE = fromRoot(
  ".jira/gitlab-review-defects.json"
);

export async function loadGitlabReviewDedupStore(
  filePath: string = DEFAULT_GITLAB_REVIEW_DEDUP_FILE
): Promise<Set<string>> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return new Set();
    return new Set(parsed.data.processedIds);
  } catch {
    return new Set();
  }
}

export async function appendGitlabReviewDedupIds(
  ids: string[],
  filePath: string = DEFAULT_GITLAB_REVIEW_DEDUP_FILE
): Promise<void> {
  if (ids.length === 0) return;

  const existing = await loadGitlabReviewDedupStore(filePath);
  for (const id of ids) existing.add(id);

  await mkdir(dirname(filePath), { recursive: true });
  const payload: GitlabReviewDedupStore = {
    processedIds: [...existing].sort(),
  };
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
