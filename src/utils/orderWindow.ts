import type { OrderHistoryItem } from '../types';
import { parseDateStringToTimestamp } from '../utils';

const ACTIVE_WINDOW_PAST_DAYS = 2;
const ACTIVE_WINDOW_FUTURE_DAYS = 3;

/**
 * Returns the order's valid due timestamp.
 *
 * Priority:
 * 1. state.dueTimestamp
 * 2. Parsed state.customerDue
 *
 * It deliberately does not use item.timestamp because that is the
 * time the order was created, not the order's due date.
 */
export function getOrderDueTimestamp(
  item: OrderHistoryItem
): number | null {
  const storedTimestamp = Number(item.state?.dueTimestamp);

  if (
    Number.isFinite(storedTimestamp) &&
    storedTimestamp > 0
  ) {
    return storedTimestamp;
  }

  const customerDue = String(
    item.state?.customerDue ?? ''
  ).trim();

  if (!customerDue) {
    return null;
  }

  const parsedTimestamp =
    parseDateStringToTimestamp(customerDue, 0).timestamp;

  if (
    !Number.isFinite(parsedTimestamp) ||
    parsedTimestamp <= 0
  ) {
    return null;
  }

  return parsedTimestamp;
}

/**
 * Returns the active order window:
 * - Beginning of two days ago
 * - End of three days from today
 */
export function getActiveOrderWindow(
  referenceDate: Date = new Date()
) {
  const startDate = new Date(referenceDate);
  startDate.setDate(
    startDate.getDate() - ACTIVE_WINDOW_PAST_DAYS
  );
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(referenceDate);
  endDate.setDate(
    endDate.getDate() + ACTIVE_WINDOW_FUTURE_DAYS
  );
  endDate.setHours(23, 59, 59, 999);

  return {
    startTimestamp: startDate.getTime(),
    endTimestamp: endDate.getTime(),
  };
}

/**
 * Checks whether an order's due date is within the active window.
 */
export function isOrderInsideActiveWindow(
  item: OrderHistoryItem,
  referenceDate: Date = new Date()
): boolean {
  const dueTimestamp = getOrderDueTimestamp(item);

  if (dueTimestamp === null) {
    return false;
  }

  const {
    startTimestamp,
    endTimestamp,
  } = getActiveOrderWindow(referenceDate);

  return (
    dueTimestamp >= startTimestamp &&
    dueTimestamp <= endTimestamp
  );
}

/**
 * Checks whether an order:
 * - Is not delivered
 * - Is not deleted
 * - Has a valid due date
 * - Is inside the active date window
 */
export function isActivePendingOrder(
  item: OrderHistoryItem,
  referenceDate: Date = new Date()
): boolean {
  if (!item?.state) {
    return false;
  }

  // whatever only saved locally, that is a draft. dont take into account
  const stateVal = item.state as any;
  if (stateVal.syncStatus === 'draft' || stateVal.status === 'draft') {
    return false;
  }

  if (
    item.state.isDelivered === true ||
    item.state.isDeleted === true
  ) {
    return false;
  }

  return isOrderInsideActiveWindow(
    item,
    referenceDate
  );
}
