import { isToday, isTomorrow, isBefore, startOfDay, format } from 'date-fns';

export interface DueDateGroup {
  key: string;
  label: string;
  isOverdue: boolean;
  orderCount: number;
  orders: Array<{ _id: string; dueDate?: number; expedited?: boolean; [key: string]: unknown }>;
}

/**
 * Groups orders by due date using WIB timezone (UTC+7).
 *
 * Sort order: OVERDUE -> Due Today -> Due Tomorrow -> future dates (chronological) -> No Due Date
 * Within each group, EXPEDITED orders are pinned to the top.
 *
 * Uses the same UTC+7 offset approach as convex/lib/wibDate.ts and useKitchenProduction.
 */
export function groupByDueDate<T extends { _id: string; dueDate?: number; expedited?: boolean }>(
  orders: T[]
): DueDateGroup[] {
  // Use WIB (UTC+7) for date comparisons
  const wibOffset = 7 * 60 * 60 * 1000;
  const nowWIB = new Date(Date.now() + wibOffset);
  const todayStartWIB = startOfDay(nowWIB);

  const groups = new Map<string, DueDateGroup>();

  for (const order of orders) {
    const due = order.dueDate ? new Date(order.dueDate + wibOffset) : null;
    let key: string, label: string, isOverdue = false;

    if (!due) {
      key = 'no-date'; label = 'No Due Date';
    } else if (isBefore(startOfDay(due), todayStartWIB)) {
      key = 'overdue'; label = 'OVERDUE'; isOverdue = true;
    } else if (isToday(due)) {
      key = 'today'; label = 'Due Today';
    } else if (isTomorrow(due)) {
      key = 'tomorrow'; label = 'Due Tomorrow';
    } else {
      key = format(due, 'yyyy-MM-dd');
      label = `Due ${format(due, 'EEE, MMM d')}`;
    }

    if (!groups.has(key)) {
      groups.set(key, { key, label, isOverdue, orderCount: 0, orders: [] });
    }
    const group = groups.get(key)!;
    group.orderCount++;

    // EXPEDITED orders pinned to top of their group
    if (order.expedited) {
      group.orders.unshift(order);
    } else {
      group.orders.push(order);
    }
  }

  // Sort: OVERDUE first, then today, tomorrow, future dates chronologically, no-date last
  return Array.from(groups.values()).sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    const priority: Record<string, number> = { overdue: -1, today: 0, tomorrow: 1, 'no-date': 999 };
    const aP = priority[a.key] ?? 2;
    const bP = priority[b.key] ?? 2;
    if (aP !== bP) return aP - bP;
    return a.key.localeCompare(b.key); // chronological for future dates
  });
}
