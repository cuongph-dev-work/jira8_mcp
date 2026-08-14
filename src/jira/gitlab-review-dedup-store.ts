import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { defaultSessionDir } from "../bootstrap.js";
import type { GitlabMrState } from "../gitlab/http-client.js";

const storeSchema = z.object({
  processedIds: z.array(z.string()).default([]),
  watermarks: z.record(z.string()).default({}),
});

export type GitlabReviewDedupStore = z.infer<typeof storeSchema>;

export const DEFAULT_GITLAB_REVIEW_DEDUP_FILE = join(
  defaultSessionDir,
  "gitlab-review-defects.json"
);

export const WATERMARK_OVERLAP_DAYS = 2;

export function buildGitlabReviewWatermarkKey(
  gitlabBaseUrl: string,
  projectPath: string,
  mrState: GitlabMrState
): string {
  const base = gitlabBaseUrl.replace(/\/$/, "");
  return `${base}|${projectPath}|${mrState}`;
}

async function readStore(filePath: string): Promise<GitlabReviewDedupStore> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = storeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { processedIds: [], watermarks: {} };
    }
    return parsed.data;
  } catch {
    return { processedIds: [], watermarks: {} };
  }
}

async function writeStore(filePath: string, store: GitlabReviewDedupStore): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const payload: GitlabReviewDedupStore = {
    processedIds: [...new Set(store.processedIds)].sort(),
    watermarks: { ...store.watermarks },
  };
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function loadGitlabReviewDedupStore(
  filePath: string = DEFAULT_GITLAB_REVIEW_DEDUP_FILE
): Promise<Set<string>> {
  const store = await readStore(filePath);
  return new Set(store.processedIds);
}

export async function loadGitlabReviewWatermarks(
  filePath: string = DEFAULT_GITLAB_REVIEW_DEDUP_FILE
): Promise<Record<string, string>> {
  const store = await readStore(filePath);
  return { ...store.watermarks };
}

export async function getGitlabReviewWatermark(
  gitlabBaseUrl: string,
  projectPath: string,
  mrState: GitlabMrState,
  filePath: string = DEFAULT_GITLAB_REVIEW_DEDUP_FILE
): Promise<string | undefined> {
  const store = await readStore(filePath);
  const key = buildGitlabReviewWatermarkKey(gitlabBaseUrl, projectPath, mrState);
  return store.watermarks[key];
}

export function watermarkUpdatedAfterIso(storedIso: string, overlapDays = WATERMARK_OVERLAP_DAYS): string {
  const date = new Date(storedIso);
  date.setUTCDate(date.getUTCDate() - overlapDays);
  return date.toISOString();
}

export async function saveGitlabReviewWatermark(
  gitlabBaseUrl: string,
  projectPath: string,
  mrState: GitlabMrState,
  syncedAtIso: string,
  filePath: string = DEFAULT_GITLAB_REVIEW_DEDUP_FILE
): Promise<void> {
  const store = await readStore(filePath);
  const key = buildGitlabReviewWatermarkKey(gitlabBaseUrl, projectPath, mrState);
  store.watermarks[key] = syncedAtIso;
  await writeStore(filePath, store);
}

export async function appendGitlabReviewDedupIds(
  ids: string[],
  filePath: string = DEFAULT_GITLAB_REVIEW_DEDUP_FILE
): Promise<void> {
  if (ids.length === 0) return;

  const store = await readStore(filePath);
  const existing = new Set(store.processedIds);
  for (const id of ids) existing.add(id);
  store.processedIds = [...existing];
  await writeStore(filePath, store);
}
