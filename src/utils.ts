// ---------------------------------------------------------------------------
// Shared utility functions
// ---------------------------------------------------------------------------

import dayjs from "dayjs";

/**
 * Returns today's date in yyyy-MM-dd format using the local timezone.
 */
export function todayLocalDate(): string {
  return dayjs().format("YYYY-MM-DD");
}
