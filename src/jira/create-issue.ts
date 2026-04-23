import { invalidInput } from "../errors.js";
import type { JiraCreatedIssue } from "../types.js";
import {
  FIELD,
  ISSUE_TYPE_LABEL,
  REQUIRED_FIELDS,
  getAllowedFields,
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

  const allowedFields = new Set(getAllowedFields(issueTypeId));
  const unsupported = Object.keys(fields).filter((fieldId) => !allowedFields.has(fieldId));
  if (unsupported.length > 0) {
    throw invalidInput(
      `Unsupported fields for issue type ${issueTypeId}: ${unsupported.join(", ")}`,
      { issueTypeId, unsupported }
    );
  }
}

export function buildCreateIssuePayload(
  issueTypeId: IssueTypeId,
  fields: Record<string, unknown>
): JiraCreateIssuePayload {
  validateCreateIssueFields(issueTypeId, fields);

  return {
    fields: {
      ...fields,
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
