import {
  AFFECTED_OBJECTS,
  COMPONENT,
  CUSTOM_FIELD,
  DEGRADE,
  DEFECT_ORIGIN,
  DEFECT_TYPE,
  DIFFICULTY_LEVEL,
  FIELD,
  HANDLING_OPTION,
  HAS_BILL_FOR_CR,
  IMPACT,
  INCIDENT_SCOPE,
  INCIDENT_TYPE,
  ISSUE_TYPE,
  ISSUE_TYPE_LABEL,
  LIKELIHOOD,
  OPTIONAL_FIELDS,
  PRIORITY,
  PROJECT_STAGE,
  REQUIRED_FIELDS,
  RESOLUTION,
  RISK_ISSUE_CATEGORY,
  RISK_LEVEL,
  type IssueTypeId,
} from "./constants.js";

export interface CreateMetaIssueType {
  id: IssueTypeId;
  label: string;
  requiredFields: readonly string[];
  optionalFields: readonly string[];
  knownOptions: Record<string, Record<string, string>>;
}

export interface JiraCreateMetaResult {
  issueTypes: CreateMetaIssueType[];
}

export function buildCreateMeta(issueTypeId?: IssueTypeId): JiraCreateMetaResult {
  const issueTypes = Object.values(ISSUE_TYPE)
    .filter((id) => issueTypeId == null || id === issueTypeId)
    .map((id) => ({
      id,
      label: ISSUE_TYPE_LABEL[id],
      requiredFields: REQUIRED_FIELDS[id].filter((fieldId) => fieldId !== FIELD.ISSUE_TYPE),
      optionalFields: OPTIONAL_FIELDS[id],
      knownOptions: pickKnownOptionsForFields([
        ...REQUIRED_FIELDS[id],
        ...OPTIONAL_FIELDS[id],
      ]),
    }));

  return { issueTypes };
}

export function getKnownFieldOptions(): Record<string, Record<string, string>> {
  return {
    [FIELD.PRIORITY]: PRIORITY,
    [FIELD.RESOLUTION]: RESOLUTION,
    [FIELD.COMPONENTS]: COMPONENT,
    [CUSTOM_FIELD.PROJECT_STAGES]: PROJECT_STAGE,
    [CUSTOM_FIELD.DIFFICULTY_LEVEL]: DIFFICULTY_LEVEL,
    [CUSTOM_FIELD.DEFECT_TYPE]: DEFECT_TYPE,
    [CUSTOM_FIELD.DEFECT_ORIGIN]: DEFECT_ORIGIN,
    [CUSTOM_FIELD.IMPACT]: IMPACT,
    [CUSTOM_FIELD.DEGRADE]: DEGRADE,
    [CUSTOM_FIELD.HAS_BILL_FOR_CR]: HAS_BILL_FOR_CR,
    [CUSTOM_FIELD.LIKELIHOOD]: LIKELIHOOD,
    [CUSTOM_FIELD.RISK_LEVEL]: RISK_LEVEL,
    [CUSTOM_FIELD.RISK_ISSUE_CATEGORY]: RISK_ISSUE_CATEGORY,
    [CUSTOM_FIELD.HANDLING_OPTION]: HANDLING_OPTION,
    [CUSTOM_FIELD.INCIDENT_TYPE]: INCIDENT_TYPE,
    [CUSTOM_FIELD.INCIDENT_SCOPE]: INCIDENT_SCOPE,
    [CUSTOM_FIELD.AFFECTED_OBJECTS]: AFFECTED_OBJECTS,
  };
}

function pickKnownOptionsForFields(
  fieldIds: readonly string[]
): Record<string, Record<string, string>> {
  const allOptions = getKnownFieldOptions();

  return fieldIds.reduce<Record<string, Record<string, string>>>((acc, fieldId) => {
    if (allOptions[fieldId]) {
      acc[fieldId] = allOptions[fieldId];
    }
    return acc;
  }, {});
}
