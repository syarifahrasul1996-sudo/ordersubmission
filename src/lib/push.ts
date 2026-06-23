import { OrderHistoryItem } from '../types';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Web Push is not fully supported in this browser environment.');
    return null;
  }

  try {
    // Request normal browser notification permissions first
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission was denied.');
        return null;
      }
    } else if (Notification.permission !== 'granted') {
      return null;
    }

    // Register service worker if not already registered or active
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });

    // Get stable public VAPID key from the node server
    const res = await fetch('/api/vapid-public-key');
    if (!res.ok) {
      throw new Error(`Failed to fetch VAPID key: ${res.status}`);
    }
    const { publicKey } = await res.json();

    const subscribeOptions = {
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    };

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe(subscribeOptions);
    }
    return subscription;
  } catch (err) {
    console.warn('Failed to subscribe or register Web Push SW:', err);
    return null;
  }
}

export async function syncPushNotifications(item: OrderHistoryItem, language: 'ms' | 'en') {
  try {
    const subscription = await getSubscription();
    if (!subscription) {
      console.log('Skipping syncPushNotifications: No push subscription acquired.');
      return;
    }

    const now = Date.now();
    const alerts = [];

    const { dueTimestamp, customerName, mainType, subType, isDelivered, googleSheetLink, hasNotified, hasDueAlerted } = item.state;

    // Only set alerts if they have set a dueTimestamp, and it hasn't been delivered/completed
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
        // Trigger a nearly immediate reminder if they just set a deadline within the 20-min window
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

      // 3. 3-hour alert (only if googleSheetLink style checking is required and not finished/entered yet)
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

    // Call server to schedule / replace Scheduled Pushes
    await fetch('/api/schedule-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: item.id,
        subscription,
        alerts
      })
    });
  } catch (err) {
    console.warn('Could not sync push notification to server:', err);
  }
}

// Function to clear/delete push notifications for a given order (e.g. when completed or deleted)
export async function clearPushNotifications(orderId: string) {
  try {
    const subscription = await getSubscription();
    if (!subscription) return;

    await fetch('/api/schedule-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        subscription,
        alerts: []
      })
    });
  } catch (err) {
    console.warn('Could not clear push notification from server:', err);
  }
}
