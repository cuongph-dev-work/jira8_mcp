import { jiraResponseError } from "../errors.js";
import type { JiraUserSearchResult } from "../types.js";

interface RawJiraUser {
  key?: unknown;
  name?: unknown;
  displayName?: unknown;
  emailAddress?: unknown;
  active?: unknown;
}

export function normalizeUserSearchResponse(raw: unknown): JiraUserSearchResult[] {
  if (!Array.isArray(raw)) {
    throw jiraResponseError("Unexpected user search response shape", raw);
  }

  return raw.map((user) => normalizeUser(user));
}

function normalizeUser(raw: unknown): JiraUserSearchResult {
  const user = raw as RawJiraUser;
  const displayName =
    typeof user.displayName === "string"
      ? user.displayName
      : typeof user.name === "string"
        ? user.name
        : typeof user.key === "string"
          ? user.key
          : "Unknown user";

  return {
    key: typeof user.key === "string" ? user.key : null,
    name: typeof user.name === "string" ? user.name : null,
    displayName,
    emailAddress: typeof user.emailAddress === "string" ? user.emailAddress : null,
    active: typeof user.active === "boolean" ? user.active : null,
  };
}
