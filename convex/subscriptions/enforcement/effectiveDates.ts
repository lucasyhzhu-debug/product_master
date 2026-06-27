export const DAY_MS = 86_400_000;

/** UTC epoch ms when a notice given at noticeDate becomes effective after `days`. */
export function effectiveDateOf(noticeDate: number, days: number): number {
  return noticeDate + days * DAY_MS;
}
