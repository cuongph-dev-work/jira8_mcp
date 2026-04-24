import { invalidInput } from "../errors.js";
import type { JiraIssueTransition } from "../types.js";

export interface TransitionSelector {
  transitionId?: string;
  transitionName?: string;
}

export function assertSingleTransitionSelector(selector: TransitionSelector): void {
  const hasId = typeof selector.transitionId === "string" && selector.transitionId.trim().length > 0;
  const hasName =
    typeof selector.transitionName === "string" && selector.transitionName.trim().length > 0;

  if (hasId === hasName) {
    throw invalidInput("Provide exactly one of transitionId or transitionName.");
  }
}

export function resolveTransitionIdByName(
  transitions: JiraIssueTransition[],
  transitionName: string
): JiraIssueTransition {
  const normalizedName = transitionName.trim().toLowerCase();
  const matches = transitions.filter(
    (transition) => transition.name.trim().toLowerCase() === normalizedName
  );

  if (matches.length === 0) {
    throw invalidInput(`No available transition named "${transitionName}".`);
  }

  if (matches.length > 1) {
    throw invalidInput(`Multiple available transitions named "${transitionName}". Use transitionId.`);
  }

  return matches[0];
}
