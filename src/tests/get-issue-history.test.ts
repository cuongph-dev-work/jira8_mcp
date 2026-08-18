import { describe, expect, it } from "vitest";
import { getIssueHistorySchema } from "../tools/get-issue-history.js";

describe("getIssueHistorySchema", () => {
  it("applies pagination defaults", () => {
    const result = getIssueHistorySchema.parse({ issueKey: "UNI-4053" });
    expect(result.startAt).toBe(0);
    expect(result.maxResults).toBe(50);
  });

  it("rejects invalid pagination", () => {
    expect(getIssueHistorySchema.safeParse({ issueKey: "UNI-4053", startAt: -1 }).success).toBe(false);
    expect(getIssueHistorySchema.safeParse({ issueKey: "UNI-4053", maxResults: 101 }).success).toBe(false);
  });
});
