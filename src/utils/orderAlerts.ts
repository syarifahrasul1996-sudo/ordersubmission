import { OrderHistoryItem } from '../types';

/**
 * Order Deadline & Reminder calculation utilities.
 * Preserves timing logic for 20-minute, due-time, and 3-hour reminders.
 */

export interface ScheduledAlertPayload {
  id: string;
  triggerAt: number;
  title: string;
  body: string;
  url?: string;
}

export function computeOrderAlerts(item: OrderHistoryItem, language: 'ms' | 'en'): ScheduledAlertPayload[] {
  const now = Date.now();
  const alerts: ScheduledAlertPayload[] = [];
  const { dueTimestamp, customerName, mainType, subType, isDelivered, googleSheetLink, hasNotified, hasDueAlerted } = item.state;

  if (dueTimestamp && !isDelivered) {
    // 1. 20-minute alert
    const TWENTY_MINS = 20 * 60 * 1000;
    const twentyMinsTrigger = dueTimestamp - TWENTY_MINS;
    if (twentyMinsTrigger > now) {
      alerts.push({
        id: 'twenty-mins',
        triggerAt: twentyMinsTrigger,
        title: language === 'ms' ? 'Pesanan Bakal Selesai!' : 'Order Due Soon!',
        body: language === 'ms'
          ? `Pesanan untuk ${customerName || 'Pelanggan'} (${mainType} ${subType}) berbaki kurang dari 20 minit!`
          : `Order for ${customerName || 'Customer'} (${mainType} ${subType}) is due in less than 20 minutes!`,
        url: '/'
      });
    } else if (dueTimestamp > now && !hasNotified) {
      alerts.push({
        id: 'twenty-mins-immediate',
        triggerAt: now + 5000,
        title: language === 'ms' ? 'Pesanan Bakal Selesai!' : 'Order Due Soon!',
        body: language === 'ms'
          ? `Pesanan untuk ${customerName || 'Pelanggan'} (${mainType} ${subType}) berbaki kurang dari 20 minit!`
          : `Order for ${customerName || 'Customer'} (${mainType} ${subType}) is due in less than 20 minutes!`,
        url: '/'
      });
    }

    // 2. Due-time alert
    if (dueTimestamp > now && !hasDueAlerted) {
      alerts.push({
        id: 'due-now',
        triggerAt: dueTimestamp,
        title: language === 'ms' ? 'Tempahan Sudah Sampai Tempoh!' : 'Order Deadline Reached!',
        body: language === 'ms'
          ? `Tempahan untuk ${customerName || 'Pelanggan'} (${mainType} ${subType}) sudah sampai tempoh sekarang!`
          : `Order for ${customerName || 'Customer'} (${mainType} ${subType}) is due now!`,
        url: '/'
      });
    }

    // 3. 3-hour alert
    const THREE_HOURS = 3 * 60 * 60 * 1000;
    const threeHourTrigger = dueTimestamp - THREE_HOURS;
    if (threeHourTrigger > now && (!googleSheetLink || googleSheetLink.trim() === '')) {
      alerts.push({
        id: 'three-hour',
        triggerAt: threeHourTrigger,
        title: language === 'ms' ? 'Status Tempahan' : 'Ask Order Status',
        body: language === 'ms'
          ? `${customerName || 'Pelanggan'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`
          : `${customerName || 'Customer'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link still not entered.`,
        url: '/'
      });
    }
  }

  return alerts;
}
