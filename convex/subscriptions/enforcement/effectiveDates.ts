export const DAY_MS = 86_400_000;

/** UTC epoch ms when a notice given at noticeDate becomes effective after `days`. */
export function effectiveDateOf(noticeDate: number, days: number): number {
  return noticeDate + days * DAY_MS;
}

/** True once a permanent baseline change has reached its effective date. */
export function permanentChangeEffective(noticeDate: number, days: number, now: number): boolean {
  return effectiveDateOf(noticeDate, days) <= now;
}

/** True once a termination notice has reached its end date. */
export function terminationEffective(noticeDate: number, days: number, now: number): boolean {
  return effectiveDateOf(noticeDate, days) <= now;
}
