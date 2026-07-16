// ---------------------------------------------------------------------------
// GitLab REST API v4 URL builders
// ---------------------------------------------------------------------------

function encodeProjectPath(projectPath: string): string {
  return encodeURIComponent(projectPath.replace(/^\/+|\/+$/g, ""));
}

export function mergeRequestsUrl(baseUrl: string, projectPath: string): string {
  const root = baseUrl.replace(/\/$/, "");
  return `${root}/api/v4/projects/${encodeProjectPath(projectPath)}/merge_requests`;
}

export function mergeRequestUrl(
  baseUrl: string,
  projectPath: string,
  mrIid: number
): string {
  return `${mergeRequestsUrl(baseUrl, projectPath)}/${mrIid}`;
}

export function mergeRequestDiscussionsUrl(
  baseUrl: string,
  projectPath: string,
  mrIid: number
): string {
  return `${mergeRequestUrl(baseUrl, projectPath, mrIid)}/discussions`;
}
