import { jiraResponseError } from "../errors.js";
import type {
  JiraEditMetaAllowedValue,
  JiraEditMetaField,
  JiraEditMetaResult,
} from "../types.js";

interface RawEditMetaField {
  required?: unknown;
  name?: unknown;
  schema?: { type?: unknown; custom?: unknown };
  allowedValues?: unknown;
}

export function normalizeEditMetaResponse(issueKey: string, raw: unknown): JiraEditMetaResult {
  const body = raw as { fields?: unknown };
  if (!body || typeof body !== "object" || !body.fields || typeof body.fields !== "object") {
    throw jiraResponseError("Unexpected edit metadata response shape", raw);
  }

  const fields = Object.entries(body.fields as Record<string, RawEditMetaField>).map(
    ([id, field]) => normalizeField(id, field)
  );

  return {
    issueKey,
    fields: fields.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function normalizeField(id: string, field: RawEditMetaField): JiraEditMetaField {
  return {
    id,
    name: typeof field.name === "string" ? field.name : id,
    required: field.required === true,
    schemaType:
      typeof field.schema?.type === "string"
        ? field.schema.type
        : typeof field.schema?.custom === "string"
          ? field.schema.custom
          : null,
    allowedValues: normalizeAllowedValues(field.allowedValues),
  };
}

function normalizeAllowedValues(raw: unknown): JiraEditMetaAllowedValue[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((value) => {
    if (!value || typeof value !== "object") {
      return {
        id: null,
        name: String(value),
        value: String(value),
      };
    }

    const record = value as { id?: unknown; name?: unknown; value?: unknown };
    return {
      id: typeof record.id === "string" ? record.id : null,
      name: typeof record.name === "string" ? record.name : null,
      value: typeof record.value === "string" ? record.value : null,
    };
  });
}
