import { invalidInput } from "../errors.js";
import { normalizeAdfValue } from "./adf.js";
import { CUSTOM_FIELD, FIELD } from "./constants.js";

export const UPDATEABLE_FIELDS = [
  FIELD.SUMMARY,
  FIELD.DESCRIPTION,
  FIELD.ASSIGNEE,
  FIELD.PRIORITY,
  FIELD.COMPONENTS,
  FIELD.LABELS,
  FIELD.DUE_DATE,
  FIELD.FIX_VERSIONS,
  FIELD.AFFECTS_VERSIONS,
  FIELD.TIME_TRACKING,
  CUSTOM_FIELD.PROJECT_STAGES,
  CUSTOM_FIELD.DIFFICULTY_LEVEL,
  CUSTOM_FIELD.DEFECT_TYPE,
  CUSTOM_FIELD.DEGRADE,
  CUSTOM_FIELD.DEFECT_ORIGIN,
  CUSTOM_FIELD.CAUSE_CATEGORY,
  CUSTOM_FIELD.SEVERITY,
  CUSTOM_FIELD.IMPACT_ASSESSMENT,
  CUSTOM_FIELD.CAUSE_ANALYSIS,
  CUSTOM_FIELD.ACTION,
  CUSTOM_FIELD.DOD,
  CUSTOM_FIELD.IMPACT,
  CUSTOM_FIELD.HAS_BILL_FOR_CR,
  CUSTOM_FIELD.AFFECTED_OBJECTS,
  CUSTOM_FIELD.DISCOVERY_DATE,
  CUSTOM_FIELD.INCIDENT_TYPE,
  CUSTOM_FIELD.INCIDENT_SCOPE,
  CUSTOM_FIELD.RISK_OWNER,
  CUSTOM_FIELD.LIKELIHOOD,
  CUSTOM_FIELD.RISK_LEVEL,
  CUSTOM_FIELD.RISK_ISSUE_CATEGORY,
  CUSTOM_FIELD.HANDLING_OPTION,
] as const;

export interface JiraUpdateIssuePayload {
  fields: Record<string, unknown>;
}

export function buildUpdateIssuePayload(
  fields: Record<string, unknown>
): JiraUpdateIssuePayload {
  const unsupported = Object.keys(fields).filter(
    (fieldId) => !UPDATEABLE_FIELDS.includes(fieldId as (typeof UPDATEABLE_FIELDS)[number])
  );
  if (unsupported.length > 0) {
    throw invalidInput(`Unsupported fields for issue update: ${unsupported.join(", ")}`, {
      unsupported,
    });
  }

  return {
    fields: normalizeUpdateFields(fields),
  };
}

function normalizeUpdateFields(fields: Record<string, unknown>): Record<string, unknown> {
  if (fields[FIELD.DESCRIPTION] == null) {
    return fields;
  }

  return {
    ...fields,
    [FIELD.DESCRIPTION]: normalizeAdfValue(fields[FIELD.DESCRIPTION]),
  };
}
