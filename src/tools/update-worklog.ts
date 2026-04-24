import { z } from "zod";
import { loadAndValidateSession } from "../auth/session-manager.js";
import { isMcpError, McpError } from "../errors.js";
import {
  TEMPO_PROCESS,
  TEMPO_TYPE_OF_WORK,
  TEMPO_WORK_ATTRIBUTE,
} from "../jira/constants.js";
import { JiraHttpClient } from "../jira/http-client.js";
import { parseDuration } from "./add-worklog.js";
import type { Config } from "../config.js";
import type { TempoWorkAttributeValue, TempoWorklogInput } from "../types.js";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const updateWorklogSchema = z.object({
  worklogId: z.string().min(1, "worklogId is required"),
  timeSpent: z.string().min(1).optional(),
  startDate: z.string().regex(DATE_REGEX, "startDate must be in yyyy-MM-dd format").optional(),
  comment: z.string().optional(),
  process: z.enum(TEMPO_PROCESS).optional(),
  typeOfWork: z.enum(TEMPO_TYPE_OF_WORK).optional(),
});

export async function handleUpdateWorklog(
  rawInput: unknown,
  cfg: Config
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const parsed = updateWorklogSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    return errorContent(`Invalid input: ${msg}`);
  }

  let timeSpentSeconds: number | undefined;
  if (parsed.data.timeSpent) {
    try {
      timeSpentSeconds = parseDuration(parsed.data.timeSpent);
    } catch (err: unknown) {
      if (isMcpError(err)) return errorContent(err.message);
      throw err;
    }
  }

  const payload = buildWorklogUpdatePayload({
    startDate: parsed.data.startDate,
    comment: parsed.data.comment,
    process: parsed.data.process,
    typeOfWork: parsed.data.typeOfWork,
    timeSpentSeconds,
  });

  if (Object.keys(payload).length === 0) {
    return errorContent("Invalid input: provide at least one field to update.");
  }

  let sessionCookies;
  try {
    sessionCookies = await loadAndValidateSession(
      cfg.JIRA_SESSION_FILE,
      cfg.JIRA_BASE_URL,
      cfg.JIRA_VALIDATE_PATH
    );
  } catch (err: unknown) {
    if (isMcpError(err)) return authErrorContent(err.code, err.message);
    throw err;
  }

  try {
    const client = new JiraHttpClient(cfg.JIRA_BASE_URL, sessionCookies);
    const worklog = await client.updateWorklog(parsed.data.worklogId, payload);
    return {
      content: [
        {
          type: "text",
          text: [
            `✅ **Worklog updated**`,
            "",
            `| Field | Value |`,
            `|---|---|`,
            `| **Tempo ID** | ${worklog.tempoWorklogId} |`,
            `| **Issue** | ${worklog.issue?.key ?? "—"} |`,
            `| **Date** | ${worklog.startDate ?? "—"} |`,
            `| **Duration** | ${worklog.timeSpent ?? `${worklog.timeSpentSeconds}s`} |`,
          ].join("\n"),
        },
      ],
    };
  } catch (err: unknown) {
    if (isMcpError(err)) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof McpError) return errorContent(`[${err.code}] ${err.message}`);
    if (err instanceof Error) return errorContent(err.message);
    throw err;
  }
}

function buildWorklogUpdatePayload(input: {
  startDate?: string;
  comment?: string;
  process?: string;
  typeOfWork?: string;
  timeSpentSeconds?: number;
}): Partial<TempoWorklogInput> {
  const payload: Partial<TempoWorklogInput> = {};

  if (input.startDate) payload.started = input.startDate;
  if (input.comment !== undefined) payload.comment = input.comment;
  if (input.timeSpentSeconds !== undefined) payload.timeSpentSeconds = input.timeSpentSeconds;

  const attributes: Record<string, TempoWorkAttributeValue> = {};
  if (input.process) {
    const attr = TEMPO_WORK_ATTRIBUTE.PROCESS;
    attributes[attr.key] = {
      name: attr.name,
      workAttributeId: attr.id,
      value: input.process,
    };
  }
  if (input.typeOfWork) {
    const attr = TEMPO_WORK_ATTRIBUTE.TYPE_OF_WORK;
    attributes[attr.key] = {
      name: attr.name,
      workAttributeId: attr.id,
      value: input.typeOfWork,
    };
  }
  if (Object.keys(attributes).length > 0) {
    payload.attributes = attributes;
  }

  return payload;
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

function authErrorContent(code: string, message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: `[${code}] ${message}` }] };
}
