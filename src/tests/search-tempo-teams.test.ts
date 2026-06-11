import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchTempoTeamsSchema, handleSearchTempoTeams } from "../tools/search-tempo-teams.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { loadAndValidateSession } from "../auth/session-manager.js";

const mockConfig = {
  JIRA_BASE_URL: "https://jira.example.com",
  JIRA_SESSION_FILE: ".jira/session.json",
  JIRA_VALIDATE_PATH: "/rest/api/2/myself" as const,
  ATTACHMENT_WORKSPACE: "downloads",
  LOG_LEVEL: "info" as const,
  PLAYWRIGHT_HEADLESS: false as const,
  PLAYWRIGHT_BROWSER: "chromium" as const,
};

// Hoisted mocks
vi.mock("../auth/session-manager.js", () => ({
  loadAndValidateSession: vi.fn(),
}));

vi.mock("../jira/http-client.js", () => {
  return {
    JiraHttpClient: vi.fn().mockImplementation(() => ({
      searchTempoTeams: vi.fn(),
    })),
  };
});

describe("searchTempoTeamsSchema", () => {
  it("validates correct input", () => {
    expect(searchTempoTeamsSchema.safeParse({ query: "Gensai" }).success).toBe(true);
    expect(searchTempoTeamsSchema.safeParse({ query: "" }).success).toBe(true);
  });

  it("rejects non-string query", () => {
    expect(searchTempoTeamsSchema.safeParse({ query: 123 }).success).toBe(false);
  });
});

describe("handleSearchTempoTeams", () => {
  let mockSearchTempoTeams: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchTempoTeams = vi.fn();
    vi.mocked(JiraHttpClient).mockImplementation(() => ({
      searchTempoTeams: mockSearchTempoTeams,
    }) as any);
  });

  it("formats teams successfully", async () => {
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
    
    mockSearchTempoTeams.mockResolvedValue([
      {
        id: 531,
        name: "GensaiPlatform",
        summary: "",
        leadUsername: "cuongph@runsystem.net",
        leadDisplayName: "Phan Hùng Cường",
        isPublic: false,
      }
    ]);

    const result = await handleSearchTempoTeams({ query: "Gensai" }, mockConfig);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("GensaiPlatform");
    expect(result.content[0].text).toContain("Phan Hùng Cường");
    expect(result.content[0].text).toContain("531");
    expect(result.content[0].text).toContain("❌");
  });

  it("returns no teams found message", async () => {
    vi.mocked(loadAndValidateSession).mockResolvedValue({ cookieHeader: "cookie" });
    mockSearchTempoTeams.mockResolvedValue([]);

    const result = await handleSearchTempoTeams({ query: "xyz" }, mockConfig);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No Tempo teams found");
  });
});
