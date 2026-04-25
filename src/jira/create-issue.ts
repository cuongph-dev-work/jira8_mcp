import { invalidInput } from "../errors.js";
import type { JiraCreatedIssue } from "../types.js";
import {
  FIELD,
  ISSUE_TYPE_LABEL,
  REQUIRED_FIELDS,
  type IssueTypeId,
} from "./constants.js";

export interface JiraCreateIssuePayload {
  fields: Record<string, unknown>;
}

export function validateCreateIssueFields(
  issueTypeId: IssueTypeId,
  fields: Record<string, unknown>
): void {
  if (fields[FIELD.ISSUE_TYPE] != null) {
    throw invalidInput(
      `Do not pass ${FIELD.ISSUE_TYPE} inside fields. Use issueTypeId instead.`
    );
  }

  const requiredFields = REQUIRED_FIELDS[issueTypeId].filter(
    (fieldId) => fieldId !== FIELD.ISSUE_TYPE
  );
  const missing = requiredFields.filter((fieldId) => fields[fieldId] == null);
  if (missing.length > 0) {
    throw invalidInput(`Missing required fields: ${missing.join(", ")}`, {
      issueTypeId,
      missing,
    });
  }
  // Note: no allowlist check — Jira will return a descriptive 400 for unknown fields.
  // This allows fields from any project, not just DNIEM.
}

export function buildCreateIssuePayload(
  issueTypeId: IssueTypeId,
  fields: Record<string, unknown>
): JiraCreateIssuePayload {
  validateCreateIssueFields(issueTypeId, fields);
  const normalizedFields = normalizeCreateIssueFields(fields);

  return {
    fields: {
      ...normalizedFields,
      [FIELD.ISSUE_TYPE]: { id: issueTypeId },
    },
  };
}

export function buildCreateIssueResult(
  baseUrl: string,
  created: { id: string; key: string; url: string },
  issueTypeId: IssueTypeId,
  summary: string
): JiraCreatedIssue {
  return {
    id: created.id,
    key: created.key,
    url: created.url || `${baseUrl.replace(/\/$/, "")}/browse/${created.key}`,
    issueTypeId,
    issueType: ISSUE_TYPE_LABEL[issueTypeId],
    summary,
  };
}

function normalizeCreateIssueFields(fields: Record<string, unknown>): Record<string, unknown> {
  const description = fields[FIELD.DESCRIPTION];
  if (description == null) {
    return fields;
  }
  // Accept both plain string (legacy) and pre-normalized ADF object (set by tool layer)
  if (typeof description !== "string" && (typeof description !== "object" || description === null)) {
    throw invalidInput("description must be a plain text string or an ADF document object.");
  }
  return fields;
}
