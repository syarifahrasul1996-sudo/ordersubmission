import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Bell, 
  Check, 
  AlertCircle, 
  Clock, 
  Link as LinkIcon, 
  WifiOff, 
  FileText, 
  CheckCircle2, 
  Volume2, 
  ShieldAlert, 
  ExternalLink,
  Send,
  Loader2,
  Copy,
  Smartphone,
  Share2,
  PlusSquare,
  X,
  Info,
  RefreshCw,
  MonitorSmartphone,
  Settings,
  ArrowLeft
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { INITIAL_STATE, OrderHistoryItem } from '../types';
import { getOrderDueTimestamp } from '../utils/orderWindow';
import { 
  getFCMStatus, 
  getCurrentFid, 
  getOrCreateSyncDeviceId,
  enableFCMNotifications, 
  sendTestFCMNotification,
  showServiceWorkerNotification,
  isIOS,
  isStandaloneMode,
  playAlertChime,
  FCMStatus 
} from '../lib/fcm';
import { cn } from '../cn';

interface NotificationItem {
  id: string;
  type: 'synced_alert' | 'overdue' | 'due_soon' | 'missing_link' | 'sync_failed' | 'drafts';
  title: string;
  message: string;
  severity: 'danger' | 'warning' | 'info' | 'success';
  isFromOtherDevice?: boolean;
  actionText?: string;
  onAction?: () => void;
}

export function NotificationsDropdown() {
  const {
    appLanguage,
    history,
    deletedOrderIds,
    queueSize,
    syncOfflineQueue,
    loadOrder,
    pushView,
    drafts,
    remoteReminders,
    recentSyncedAlerts,
    syncedDevicesCount,
    syncedDevices,
    sharedReadNotificationIds,
    isSyncingNotifications,
    markNotificationsRead,
    syncAllDevicesNotifications
  } = useAppContext();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'alerts' | 'settings'>('alerts');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // FCM state
  const [fcmStatus, setFcmStatus] = useState<FCMStatus>('permission-default');
  const [registeredFid, setRegisteredFid] = useState<string | null>(() => getCurrentFid());
  const [isRegistering, setIsRegistering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [audioTestPlayed, setAudioTestPlayed] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const myDeviceId = useMemo(() => getOrCreateSyncDeviceId(), []);
  const isAppleDevice = useMemo(() => isIOS(), []);
  const isPWA = useMemo(() => isStandaloneMode(), []);
  const inIframe = useMemo(() => {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      return true;
    }
  }, []);

  const readIds = sharedReadNotificationIds;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Refresh live time every 30s and pull latest cross-device sync when opening dropdown
  useEffect(() => {
    if (isOpen) {
      setNowTick(Date.now());
      syncAllDevicesNotifications().catch(() => {});
    }
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [isOpen, syncAllDevicesNotifications]);

  // Update status when dropdown is opened or on mount without prompting
  useEffect(() => {
    getFCMStatus().then(status => {
      setFcmStatus(status);
      const fid = getCurrentFid();
      if (fid) setRegisteredFid(fid);
    });
  }, [isOpen]);

  const handleEnableNotifications = async () => {
    // If on iOS and not yet running in standalone mode, show iOS guide directly
    if (isAppleDevice && !isPWA) {
      setShowIOSModal(true);
      return;
    }

    setIsRegistering(true);
    setTestResult(null);
    setRegError(null);

    const result = await enableFCMNotifications();

    setIsRegistering(false);

    if (result.success && result.fid) {
      setRegisteredFid(result.fid);
      setFcmStatus('enabled');
      setRegError(null);
      syncAllDevicesNotifications().catch(() => {});
    } else {
      setRegisteredFid(null);
      if (result.isIOSRequiresPWA) {
        setShowIOSModal(true);
        setRegError(null);
      } else if (result.error && (result.error.includes('denied') || result.error.includes('blocked'))) {
        setFcmStatus('permission-denied');
        setRegError(appLanguage === 'ms' ? 'Kebenaran notifikasi disekat di pelayar.' : 'Notification permission was denied.');
      } else {
        setFcmStatus('failed');
        setRegError(result.error || (appLanguage === 'ms' ? 'Pendaftaran notifikasi gagal.' : 'Registration failed.'));
      }
    }
  };

  const handleTestAudioChime = () => {
    playAlertChime();
    setAudioTestPlayed(true);
    setTimeout(() => setAudioTestPlayed(false), 2500);
  };

  const handleCopyFid = async () => {
    if (!registeredFid) return;
    let isCopied = false;
    try {
      await navigator.clipboard.writeText(registeredFid);
      isCopied = true;
    } catch (e) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = registeredFid;
        textArea.style.position = 'fixed';
        textArea.style.left = '-99999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        isCopied = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.warn('Copy fallback failed:', err);
      }
    }

    if (isCopied) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSendTest = async () => {
    setTestSending(true);
    setTestResult(null);

    const title = appLanguage === 'ms' ? '🔥 Ujian Notifikasi Berjaya!' : '🔥 Test Notification Sent!';
    const body = appLanguage === 'ms' 
      ? 'Notifikasi peringatan pesanan berfungsi & disegerakkan ke semua peranti.' 
      : 'Order reminder notifications are active & synced across all devices.';

    const res = await sendTestFCMNotification(registeredFid || 'local_device', title, body, true);
    await syncAllDevicesNotifications().catch(() => {});
    setTestSending(false);

    if (res.success) {
      playAlertChime();
      const totalDevs = Math.max(res.totalDevices || 0, syncedDevicesCount || 0, 1);
      let msg = '';
      if (totalDevs > 1) {
        msg = appLanguage === 'ms'
          ? `Ujian notifikasi dihantar & disegerakkan ke semua ${totalDevs} peranti aktif!`
          : `Test notification synced & dispatched across all ${totalDevs} active devices!`;
      } else {
        msg = appLanguage === 'ms'
          ? 'Notifikasi ujian berjaya diuji pada peranti ini! Hanya 1 peranti disambungkan ke URL ini sekarang — buka pautan URL yang sama pada peranti lain untuk segerak bersama.'
          : 'Test notification triggered here! Only 1 device is currently connected to this URL — open the exact same URL on your other device so both stay synced.';
      }
      setTestResult({
        success: true,
        message: msg
      });
    } else {
      // Fire local ServiceWorker notification so user immediately verifies their device display & sound
      const swTriggered = await showServiceWorkerNotification(title, {
        body: body,
        icon: 'https://i.imgur.com/49kNDoe.png',
        tag: 'fcm_test_sw_direct',
      });

      if (swTriggered) {
        playAlertChime();
        setTestResult({
          success: true,
          message: appLanguage === 'ms'
            ? 'Notifikasi peranti berjaya dipaparkan pada telefon anda! Sistem peringatan aktif dan sedia berfungsi.'
            : 'Device notification successfully displayed on your phone! Reminder system is active and ready.'
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || (appLanguage === 'ms' ? 'Gagal memaparkan notifikasi peranti. Sila semak kebenaran pelayar.' : 'Failed to display device notification. Please check browser permissions.')
        });
      }
    }
  };

  // Generate smart notifications from real application state
  const notifications = useMemo(() => {
    const list: NotificationItem[] = [];
    const now = nowTick;

    // 0. Synced Cross-Device Alerts (test notifications & server-triggered order alerts)
    recentSyncedAlerts.forEach((alert) => {
      const minsAgo = Math.max(0, Math.round((now - (alert.createdAt || now)) / 60000));
      const timeLabel = minsAgo < 1
        ? (appLanguage === 'ms' ? 'Baru sahaja' : 'Just now')
        : (appLanguage === 'ms' ? `${minsAgo} minit lepas` : `${minsAgo}m ago`);
      const senderText = alert.senderDeviceLabel ? ` • ${alert.senderDeviceLabel}` : '';
      const isOther = Boolean(alert.senderDeviceId && alert.senderDeviceId !== myDeviceId);

      list.push({
        id: alert.id,
        type: 'synced_alert',
        title: alert.title,
        message: `${alert.body} (${timeLabel}${senderText})`,
        severity: alert.type === 'test_alert' ? 'success' : 'warning',
        isFromOtherDevice: isOther,
      });
    });

    // 1. Offline Queue alert
    if (queueSize > 0) {
      list.push({
        id: 'sync_queue_alert',
        type: 'sync_failed',
        title: appLanguage === 'ms' ? 'Pesanan Luar Talian Menunggu' : 'Pending Offline Orders',
        message: appLanguage === 'ms' 
          ? `Terdapat ${queueSize} pesanan belum dimuat naik ke Google Sheets.` 
          : `${queueSize} order(s) pending sync to Google Sheets.`,
        severity: 'warning',
        actionText: appLanguage === 'ms' ? 'Segerak Sekarang' : 'Sync Now',
        onAction: () => syncOfflineQueue()
      });
    }

    // 2. Drafts
    if (drafts && drafts.length > 0) {
      list.push({
        id: 'drafts_alert',
        type: 'drafts',
        title: appLanguage === 'ms' ? 'Draf Disimpan' : 'Saved Drafts',
        message: appLanguage === 'ms'
          ? `Anda mempunyai ${drafts.length} draf pesanan belum dihantar.`
          : `You have ${drafts.length} saved order draft(s).`,
        severity: 'info',
        actionText: appLanguage === 'ms' ? 'Lihat Draf' : 'View Drafts',
        onAction: () => pushView('drafts')
      });
    }

    // 3. Active Order Deadlines & Alerts (Local + Remote Synced)
    const activeOrders = history.filter(h => 
      !h.state?.isDeleted && 
      !h.state?.isDelivered && 
      !deletedOrderIds.includes(h.id) &&
      (!h.state?.orderId || !deletedOrderIds.includes(h.state.orderId))
    );

    const localKeySet = new Set<string>();
    history.forEach(h => {
      localKeySet.add(h.id);
      if (h.state?.orderId) localKeySet.add(h.state.orderId);
    });

    activeOrders.forEach(order => {
      const state = order.state || {};
      const { customerName, mainType, subType, googleSheetLink } = state;
      const dueTimestamp = getOrderDueTimestamp(order);
      const orderName = customerName || (mainType ? `${mainType} ${subType || ''}` : 'Tempahan');

      if (dueTimestamp) {
        const diffMinutes = Math.round((dueTimestamp - now) / 60000);

        if (diffMinutes < 0) {
          // Overdue
          list.push({
            id: `overdue_${order.id}`,
            type: 'overdue',
            title: appLanguage === 'ms' ? 'Pesanan Melebihi Masa' : 'Order Overdue',
            message: appLanguage === 'ms'
              ? `Pesanan "${orderName}" telah melebihi tarikh siap (${Math.abs(diffMinutes)} minit lepas).`
              : `Order "${orderName}" is overdue by ${Math.abs(diffMinutes)} minute(s).`,
            severity: 'danger',
            actionText: appLanguage === 'ms' ? 'Buka Pesanan' : 'Open Order',
            onAction: () => loadOrder(order)
          });
        } else if (diffMinutes <= 20) {
          // Due soon (within 20 mins)
          list.push({
            id: `due_soon_${order.id}`,
            type: 'due_soon',
            title: appLanguage === 'ms' ? 'Pesanan Bakal Siap' : 'Order Due Soon',
            message: appLanguage === 'ms'
              ? `Pesanan "${orderName}" perlu disiapkan dalam masa ${diffMinutes} minit!`
              : `Order "${orderName}" is due in ${diffMinutes} minute(s)!`,
            severity: 'warning',
            actionText: appLanguage === 'ms' ? 'Buka Pesanan' : 'Open Order',
            onAction: () => loadOrder(order)
          });
        }
      }

      // Check missing link for orders
      if (!googleSheetLink || googleSheetLink.trim() === '') {
        list.push({
          id: `missing_link_${order.id}`,
          type: 'missing_link',
          title: appLanguage === 'ms' ? 'Pautan Canva/File Belum Diisi' : 'Missing Work Link',
          message: appLanguage === 'ms'
            ? `Pesanan "${orderName}" belum mempunyai pautan fail/Google Sheets.`
            : `Order "${orderName}" has no work link attached yet.`,
          severity: 'info',
          actionText: appLanguage === 'ms' ? 'Kemaskini' : 'Update',
          onAction: () => loadOrder(order)
        });
      }
    });

    // 4. Remote synced orders from other devices not yet in local history
    remoteReminders.forEach(rem => {
      if (rem.isDeleted || rem.isDelivered) return;
      if (localKeySet.has(rem.id) || (rem.orderId && localKeySet.has(rem.orderId))) return;
      if (deletedOrderIds.includes(rem.id) || (rem.orderId && deletedOrderIds.includes(rem.orderId))) return;

      const orderName = rem.customerName || `${rem.mainType} ${rem.subType || ''}`.trim() || 'Tempahan';
      const openRemoteOrder = () => {
        const synthesized: OrderHistoryItem = {
          id: rem.id,
          timestamp: rem.createdAt ? Date.parse(rem.createdAt) || Date.now() : Date.now(),
          state: {
            ...INITIAL_STATE,
            historyId: rem.id,
            orderId: rem.orderId || rem.id,
            customerName: rem.customerName,
            mainType: rem.mainType,
            subType: rem.subType || '',
            dueTimestamp: rem.dueTimestamp,
            isDelivered: rem.isDelivered,
            isDeleted: rem.isDeleted,
            googleSheetLink: rem.googleSheetLink || '',
            orderLink: rem.googleSheetLink || '',
            hasNotified: rem.hasNotified20Min,
            hasDueAlerted: rem.hasDueAlerted,
            hasThreeHourChecked: rem.hasThreeHourAlerted,
            threeHourAlerted: rem.hasThreeHourAlerted,
          },
          messages: [],
        };
        loadOrder(synthesized);
      };

      if (rem.dueTimestamp) {
        const diffMinutes = Math.round((rem.dueTimestamp - now) / 60000);
        if (diffMinutes < 0) {
          list.push({
            id: `overdue_${rem.id}`,
            type: 'overdue',
            title: appLanguage === 'ms' ? 'Pesanan Melebihi Masa' : 'Order Overdue',
            message: appLanguage === 'ms'
              ? `Pesanan "${orderName}" telah melebihi tarikh siap (${Math.abs(diffMinutes)} minit lepas).`
              : `Order "${orderName}" is overdue by ${Math.abs(diffMinutes)} minute(s).`,
            severity: 'danger',
            isFromOtherDevice: true,
            actionText: appLanguage === 'ms' ? 'Buka Pesanan' : 'Open Order',
            onAction: openRemoteOrder
          });
        } else if (diffMinutes <= 20) {
          list.push({
            id: `due_soon_${rem.id}`,
            type: 'due_soon',
            title: appLanguage === 'ms' ? 'Pesanan Bakal Siap' : 'Order Due Soon',
            message: appLanguage === 'ms'
              ? `Pesanan "${orderName}" perlu disiapkan dalam masa ${diffMinutes} minit!`
              : `Order "${orderName}" is due in ${diffMinutes} minute(s)!`,
            severity: 'warning',
            isFromOtherDevice: true,
            actionText: appLanguage === 'ms' ? 'Buka Pesanan' : 'Open Order',
            onAction: openRemoteOrder
          });
        }
      }

      if (!rem.googleSheetLink || rem.googleSheetLink.trim() === '') {
        list.push({
          id: `missing_link_${rem.id}`,
          type: 'missing_link',
          title: appLanguage === 'ms' ? 'Pautan Canva/File Belum Diisi' : 'Missing Work Link',
          message: appLanguage === 'ms'
            ? `Pesanan "${orderName}" belum mempunyai pautan fail/Google Sheets.`
            : `Order "${orderName}" has no work link attached yet.`,
          severity: 'info',
          isFromOtherDevice: true,
          actionText: appLanguage === 'ms' ? 'Kemaskini' : 'Update',
          onAction: openRemoteOrder
        });
      }
    });

    return list;
  }, [history, remoteReminders, recentSyncedAlerts, myDeviceId, deletedOrderIds, queueSize, drafts, appLanguage, nowTick]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !readIds.includes(n.id)).length;
  }, [notifications, readIds]);

  const handleMarkAllRead = () => {
    const allIds = notifications.map(n => n.id);
    if (allIds.length > 0) {
      markNotificationsRead(allIds, 'read').catch(() => {});
    }
  };

  const handleNotificationClick = (item: NotificationItem) => {
    if (!readIds.includes(item.id)) {
      markNotificationsRead([item.id], 'read').catch(() => {});
    }
    if (item.onAction) {
      item.onAction();
      setIsOpen(false);
    }
  };

  const getSeverityBadge = (severity: NotificationItem['severity']) => {
    switch (severity) {
      case 'danger':
        return {
          bg: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
          icon: AlertCircle
        };
      case 'warning':
        return {
          bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
          icon: Clock
        };
      case 'success':
        return {
          bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          icon: CheckCircle2
        };
      default:
        return {
          bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          icon: FileText
        };
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative p-2 rounded-xl transition-all duration-200 cursor-pointer",
          isOpen
            ? "bg-primary text-white shadow-md shadow-primary/20 scale-105"
            : "text-subtext hover:text-text hover:bg-gray-100 dark:hover:bg-zinc-800"
        )}
        title={appLanguage === 'ms' ? 'Pemberitahuan' : 'Notifications'}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top))] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[24rem] bg-white dark:bg-[#1C1C1E] border border-gray-200/80 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden shrink-0 z-50 animate-fade-in-up flex flex-col">
          {/* Compact Header */}
          <div className="px-3.5 py-2.5 border-b border-gray-100 dark:border-zinc-800/80 bg-gray-50/70 dark:bg-zinc-900/50 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 min-w-0">
              {activeTab === 'settings' ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('alerts')}
                  title={appLanguage === 'ms' ? 'Kembali' : 'Back'}
                  className="p-1 -ml-1 rounded-lg text-subtext hover:text-text hover:bg-gray-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              ) : (
                <Bell className="w-4 h-4 text-primary shrink-0" />
              )}

              <h2 className="text-xs sm:text-sm font-extrabold text-text truncate">
                {activeTab === 'settings'
                  ? (appLanguage === 'ms' ? 'Tetapan & Peranti' : 'Settings & Devices')
                  : (appLanguage === 'ms' ? 'Pemberitahuan' : 'Notifications')}
              </h2>

              {activeTab === 'alerts' && unreadCount > 0 && (
                <span className="min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-primary text-white text-[10px] font-extrabold inline-flex items-center justify-center shrink-0">
                  {unreadCount}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1 shrink-0">
              {activeTab === 'alerts' && unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[10px] font-bold text-primary hover:underline flex items-center space-x-1 px-1.5 py-1 cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  <span>{appLanguage === 'ms' ? 'Tanda Dibaca' : 'Mark read'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => syncAllDevicesNotifications()}
                disabled={isSyncingNotifications}
                title={appLanguage === 'ms' ? 'Segerak sekarang' : 'Sync now'}
                className="p-1.5 rounded-lg text-subtext hover:text-text hover:bg-gray-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isSyncingNotifications && "animate-spin")} />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'settings' ? 'alerts' : 'settings')}
                title={appLanguage === 'ms' ? 'Tetapan Notifikasi' : 'Notification Settings'}
                className={cn(
                  "p-1.5 rounded-lg transition-colors cursor-pointer",
                  activeTab === 'settings'
                    ? "bg-primary/15 text-primary"
                    : "text-subtext hover:text-text hover:bg-gray-200/60 dark:hover:bg-zinc-800"
                )}
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* TAB 1: CLEAN ALERTS FEED */}
          {activeTab === 'alerts' && (
            <>
              {/* Subtle one-line enable prompt only if not yet enabled */}
              {fcmStatus !== 'enabled' && (
                <div className="px-3.5 py-2 bg-amber-50/90 dark:bg-amber-950/30 border-b border-amber-200/70 dark:border-amber-800/40 flex items-center justify-between gap-2 text-left">
                  <span className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 truncate">
                    {isAppleDevice && !isPWA
                      ? (appLanguage === 'ms' ? 'Tambah ke Skrin Utama untuk notifikasi push' : 'Add to Home Screen for push alerts')
                      : (appLanguage === 'ms' ? 'Notifikasi pelayar belum diaktifkan' : 'Browser notifications not enabled')}
                  </span>
                  <button
                    type="button"
                    onClick={() => isAppleDevice && !isPWA ? setShowIOSModal(true) : handleEnableNotifications()}
                    disabled={isRegistering}
                    className="shrink-0 text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isRegistering
                      ? '...'
                      : isAppleDevice && !isPWA
                        ? (appLanguage === 'ms' ? 'Panduan' : 'Guide')
                        : (appLanguage === 'ms' ? 'Aktifkan' : 'Enable')}
                  </button>
                </div>
              )}

              {/* Notification List */}
              <div className="max-h-[58dvh] sm:max-h-[22rem] overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800/70">
                {notifications.length > 0 ? (
                  notifications.map((item) => {
                    const isUnread = !readIds.includes(item.id);
                    const badgeInfo = getSeverityBadge(item.severity);
                    const IconComponent = badgeInfo.icon;

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleNotificationClick(item)}
                        className={cn(
                          "px-4 py-3 transition-colors flex items-start space-x-3 cursor-pointer text-left",
                          isUnread
                            ? "bg-primary/[0.04] dark:bg-primary/[0.08] hover:bg-primary/[0.08]"
                            : "hover:bg-gray-50 dark:hover:bg-zinc-800/40 opacity-75"
                        )}
                      >
                        <div className={cn("p-2 rounded-xl border shrink-0 mt-0.5", badgeInfo.bg)}>
                          <IconComponent className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className={cn("text-xs text-text truncate", isUnread ? "font-extrabold" : "font-semibold")}>
                              {item.title}
                            </h3>
                            <div className="flex items-center space-x-1.5 shrink-0">
                              {item.isFromOtherDevice && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                  {appLanguage === 'ms' ? 'Segerak' : 'Synced'}
                                </span>
                              )}
                              {isUnread && <span className="w-2 h-2 rounded-full bg-primary" />}
                            </div>
                          </div>

                          <p className="text-[11px] text-subtext leading-snug mt-0.5 line-clamp-2">
                            {item.message}
                          </p>

                          {item.actionText && (
                            <span className="mt-1.5 text-[10px] font-bold text-primary hover:underline inline-flex items-center space-x-1">
                              <span>{item.actionText}</span>
                              <span>&rarr;</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 px-6 text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
                    <p className="text-xs font-bold text-text">
                      {appLanguage === 'ms' ? 'Tiada Pemberitahuan Baru' : 'No New Notifications'}
                    </p>
                    <p className="text-[11px] text-subtext">
                      {appLanguage === 'ms' ? 'Semua pesanan anda dalam keadaan teratur.' : 'All your orders are up to date.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Quick feedback banner when testing from footer */}
              {testResult && (
                <div className={cn(
                  "px-3.5 py-2 border-t text-[11px] font-medium flex items-start justify-between gap-2 text-left",
                  testResult.success
                    ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-200/70 dark:border-emerald-800/40"
                    : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 border-red-200/70 dark:border-red-800/40"
                )}>
                  <span className="leading-snug">{testResult.message}</span>
                  <button
                    type="button"
                    onClick={() => setTestResult(null)}
                    className="p-0.5 opacity-70 hover:opacity-100 cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Sleek Sticky Footer */}
              <div className="px-3.5 py-2.5 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-900/50 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="text-[11px] font-semibold text-subtext hover:text-text flex items-center space-x-1.5 cursor-pointer"
                >
                  <span className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    fcmStatus === 'enabled' ? "bg-emerald-500" : "bg-blue-400"
                  )} />
                  <span>
                    {appLanguage === 'ms'
                      ? `${Math.max(syncedDevicesCount, 1)} peranti aktif`
                      : `${Math.max(syncedDevicesCount, 1)} active device(s)`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={testSending}
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95 transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {testSending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  <span>{appLanguage === 'ms' ? 'Uji Notifikasi' : 'Send Test'}</span>
                </button>
              </div>
            </>
          )}

          {/* TAB 2: DEVICES & NOTIFICATION SETUP */}
          {activeTab === 'settings' && (
            <div className="max-h-[65dvh] sm:max-h-[26rem] overflow-y-auto p-3.5 space-y-3 text-left">
              {/* Section 1: Device Push Status */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200/80 dark:border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-text">
                    {appLanguage === 'ms' ? 'Status Peranti Ini' : 'This Device Status'}
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                    fcmStatus === 'enabled'
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : fcmStatus === 'permission-denied' || fcmStatus === 'failed'
                        ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                        : fcmStatus === 'ios-requires-pwa' || (isAppleDevice && !isPWA)
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                  )}>
                    {fcmStatus === 'enabled'
                      ? (appLanguage === 'ms' ? 'Aktif' : 'Active')
                      : fcmStatus === 'permission-denied'
                        ? (appLanguage === 'ms' ? 'Disekat' : 'Blocked')
                        : fcmStatus === 'failed'
                          ? (appLanguage === 'ms' ? 'Cuba Semula' : 'Retry')
                          : fcmStatus === 'unsupported'
                            ? (inIframe ? (appLanguage === 'ms' ? 'Mod Pratonton' : 'Preview Frame') : (appLanguage === 'ms' ? 'Tidak Disokong' : 'Unsupported'))
                            : fcmStatus === 'ios-requires-pwa' || (isAppleDevice && !isPWA)
                              ? (appLanguage === 'ms' ? 'Perlu Skrin Utama' : 'Add to Home')
                              : (appLanguage === 'ms' ? 'Belum Aktif' : 'Not Enabled')}
                  </span>
                </div>

                {fcmStatus === 'enabled' && registeredFid ? (
                  <p className="text-[11px] text-subtext leading-relaxed">
                    {appLanguage === 'ms'
                      ? 'Notifikasi push dan bunyi amaran sedia berfungsi untuk peranti ini.'
                      : 'Push notifications and alert chimes are active on this device.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-subtext leading-relaxed">
                      {isAppleDevice && !isPWA
                        ? (appLanguage === 'ms'
                            ? 'Pada iPhone/iPad, tambah aplikasi ini ke Skrin Utama dahulu untuk mengaktifkan notifikasi push.'
                            : 'On iPhone/iPad, add this app to your Home Screen first to enable push notifications.')
                        : fcmStatus === 'permission-denied'
                          ? (appLanguage === 'ms'
                              ? 'Kebenaran disekat oleh pelayar. Buka tetapan URL di bar pelayar dan pilih "Allow Notifications".'
                              : 'Permission is blocked. Open your browser address bar settings and allow notifications.')
                          : fcmStatus === 'unsupported' && inIframe
                            ? (appLanguage === 'ms'
                                ? 'Notifikasi disekat di dalam pratonton. Buka di Tab Penuh untuk mengaktifkan.'
                                : 'Notifications are blocked in preview frames. Open in Full Tab to enable.')
                            : (appLanguage === 'ms'
                                ? 'Aktifkan notifikasi supaya peranti ini menerima amaran pesanan secara automatik.'
                                : 'Enable notifications to receive automatic order deadline alerts on this device.')}
                    </p>

                    <div className="flex items-center gap-2">
                      {isAppleDevice && !isPWA ? (
                        <button
                          type="button"
                          onClick={() => setShowIOSModal(true)}
                          className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 px-3 rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>{appLanguage === 'ms' ? 'Panduan Skrin Utama iOS' : 'iOS Setup Guide'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleEnableNotifications}
                          disabled={isRegistering}
                          className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold text-xs py-2 px-3 rounded-lg shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
                        >
                          {isRegistering ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>{appLanguage === 'ms' ? 'Mendaftar...' : 'Registering...'}</span>
                            </>
                          ) : (
                            <>
                              <Bell className="w-3.5 h-3.5" />
                              <span>{appLanguage === 'ms' ? 'Aktifkan Notifikasi' : 'Enable Notifications'}</span>
                            </>
                          )}
                        </button>
                      )}

                      {inIframe && (
                        <a
                          href={typeof window !== 'undefined' ? window.location.href : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center space-x-1 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-text border border-gray-200 dark:border-zinc-700 font-bold text-xs py-2 px-2.5 rounded-lg transition-all cursor-pointer"
                        >
                          <span>{appLanguage === 'ms' ? 'Tab Penuh' : 'Full Tab'}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {regError && (
                      <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                        {regError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Section 2: Synced Devices List */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-200/80 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-text flex items-center space-x-1.5">
                    <MonitorSmartphone className="w-3.5 h-3.5 text-primary" />
                    <span>{appLanguage === 'ms' ? 'Peranti Disegerakkan' : 'Synced Devices'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => syncAllDevicesNotifications()}
                    disabled={isSyncingNotifications}
                    className="text-[11px] font-bold text-primary hover:underline flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-3 h-3", isSyncingNotifications && "animate-spin")} />
                    <span>{appLanguage === 'ms' ? 'Segerak' : 'Sync'}</span>
                  </button>
                </div>

                {syncedDevices.length > 0 ? (
                  <div className="divide-y divide-gray-200/70 dark:divide-zinc-800/80 bg-white dark:bg-zinc-950/60 rounded-lg border border-gray-200/70 dark:border-zinc-800 overflow-hidden">
                    {syncedDevices.map((dev) => {
                      const isThisDevice =
                        (dev.deviceId && dev.deviceId === myDeviceId) ||
                        (registeredFid && dev.fidSuffix && registeredFid.endsWith(dev.fidSuffix));
                      return (
                        <div key={dev.id} className="px-2.5 py-2 flex items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center space-x-2 min-w-0">
                            <span
                              className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                dev.fcmEnabled ? "bg-emerald-500" : "bg-blue-400"
                              )}
                            />
                            <span className="font-bold text-text truncate">{dev.deviceLabel}</span>
                            {isThisDevice && (
                              <span className="text-[10px] font-bold text-primary shrink-0">
                                ({appLanguage === 'ms' ? 'Ini' : 'This'})
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-subtext font-medium shrink-0">
                            {dev.fcmEnabled
                              ? (appLanguage === 'ms' ? 'Push Aktif' : 'Push Active')
                              : (appLanguage === 'ms' ? 'Dalam Apl' : 'In-App')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-subtext">
                    {appLanguage === 'ms' ? 'Tiada peranti lain dikesan buat masa ini.' : 'No other devices detected yet.'}
                  </p>
                )}

                {syncedDevicesCount <= 1 && (
                  <p className="text-[10px] text-subtext leading-snug">
                    {appLanguage === 'ms'
                      ? 'Tip: Buka pautan URL yang sama di telefon/peranti lain untuk menerima segerak bersama.'
                      : 'Tip: Open this exact same URL on your other device to sync notifications live.'}
                  </p>
                )}
              </div>

              {/* Section 3: Test & Sound Actions */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleSendTest}
                    disabled={testSending}
                    className="col-span-2 sm:col-span-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    {testSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{appLanguage === 'ms' ? 'Uji Hantar' : 'Send Test'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestAudioChime}
                    className="col-span-2 sm:col-span-1 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-text font-bold text-xs py-2 px-3 rounded-xl active:scale-95 transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-primary" />
                    <span>{audioTestPlayed ? (appLanguage === 'ms' ? 'Bunyi Berjaya!' : 'Played!') : (appLanguage === 'ms' ? 'Uji Bunyi' : 'Test Sound')}</span>
                  </button>
                </div>

                {testResult && (
                  <div className={cn(
                    "p-2.5 rounded-xl text-[11px] leading-snug font-medium border",
                    testResult.success
                      ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40"
                      : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/40"
                  )}>
                    {testResult.message}
                  </div>
                )}
              </div>

              {/* Section 4: Collapsible Technical & Help Details */}
              <details className="text-[11px] text-subtext rounded-xl border border-gray-200/70 dark:border-zinc-800 px-3 py-2">
                <summary className="font-semibold text-subtext hover:text-text cursor-pointer select-none">
                  {appLanguage === 'ms' ? 'Bantuan & Maklumat Peranti' : 'Help & Device Info'}
                </summary>
                <div className="pt-2 mt-2 border-t border-gray-100 dark:border-zinc-800 space-y-2 text-[10px] leading-relaxed">
                  <p>
                    {appLanguage === 'ms'
                      ? 'Pelayan menyemak pesanan setiap 30 saat dan menyegerakkan amaran ke semua peranti yang membuka URL yang sama.'
                      : 'The server checks orders every 30 seconds and syncs alerts across all devices connected to this URL.'}
                  </p>
                  {registeredFid && (
                    <div className="p-2 bg-gray-50 dark:bg-zinc-950 rounded-lg border border-gray-200 dark:border-zinc-800 flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] truncate select-all">{registeredFid}</span>
                      <button
                        type="button"
                        onClick={handleCopyFid}
                        className="font-bold text-primary hover:underline flex items-center space-x-1 cursor-pointer shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copied ? (appLanguage === 'ms' ? 'Disalin' : 'Copied') : (appLanguage === 'ms' ? 'Salin FID' : 'Copy FID')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {/* iOS PWA Step-by-Step Installation Modal */}
      {showIOSModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowIOSModal(false)}
        >
          <div 
            className="w-full max-w-sm sm:max-w-md bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-3xl shadow-2xl p-5 space-y-4 text-left animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-text">
                    {appLanguage === 'ms' ? 'Panduan Notifikasi iPhone / iPad' : 'iPhone / iPad Notification Guide'}
                  </h3>
                  <p className="text-[11px] text-subtext font-medium">
                    {appLanguage === 'ms' ? 'Syarat Web Push Apple (iOS 16.4+)' : 'Apple Web Push Requirement (iOS 16.4+)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-subtext hover:text-text transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Why Explanation */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-2xl border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-900 dark:text-blue-200 leading-relaxed">
              <strong>{appLanguage === 'ms' ? 'Mengapa perlu langkah ini?' : 'Why is this step required?'}</strong>
              <p className="mt-0.5 opacity-90">
                {appLanguage === 'ms'
                  ? 'Pada iOS, Apple menyekat notifikasi push dalam tab pelayar Safari biasa. Notifikasi HANYA dibenarkan selepas aplikasi ini ditambah ke Skrin Utama.'
                  : 'On iOS, Apple disables push notifications inside standard Safari tabs. Push is ONLY permitted once the web app is added to your Home Screen.'}
              </p>
            </div>

            {/* Step by step */}
            <div className="space-y-2.5 pt-1">
              {/* Step 1 */}
              <div className="flex items-start space-x-3 p-2.5 rounded-2xl bg-gray-50 dark:bg-zinc-800/50 border border-gray-100 dark:border-zinc-800">
                <div className="w-7 h-7 rounded-full bg-primary text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  1
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-text">
                      {appLanguage === 'ms' ? 'Tekan Butang Kongsi (Share)' : 'Tap the Share Button'}
                    </span>
                    <Share2 className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <p className="text-[11px] text-subtext mt-0.5 leading-snug">
                    {appLanguage === 'ms'
                      ? 'Di bar bawah pelayar Safari iPhone anda, tekan butang Kongsi (ikon segi empat dengan anak panah ke atas ⎋).'
                      : 'In Safari bottom navigation toolbar, tap the Share icon (square with upward arrow ⎋).'}
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start space-x-3 p-2.5 rounded-2xl bg-gray-50 dark:bg-zinc-800/50 border border-gray-100 dark:border-zinc-800">
                <div className="w-7 h-7 rounded-full bg-primary text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  2
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-text">
                      {appLanguage === 'ms' ? 'Pilih "Tambah ke Skrin Utama"' : 'Select "Add to Home Screen"'}
                    </span>
                    <PlusSquare className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <p className="text-[11px] text-subtext mt-0.5 leading-snug">
                    {appLanguage === 'ms'
                      ? 'Skrol menu ke bawah, tekan "Tambah ke Skrin Utama" (Add to Home Screen ➕), kemudian tekan "Tambah" (Add) di sudut kanan atas.'
                      : 'Scroll down the share sheet, select "Add to Home Screen" ➕, then tap "Add" in the top right corner.'}
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start space-x-3 p-2.5 rounded-2xl bg-gray-50 dark:bg-zinc-800/50 border border-gray-100 dark:border-zinc-800">
                <div className="w-7 h-7 rounded-full bg-primary text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  3
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-text">
                      {appLanguage === 'ms' ? 'Buka dari Skrin Utama & Aktifkan' : 'Open from Home Screen & Enable'}
                    </span>
                    <Bell className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <p className="text-[11px] text-subtext mt-0.5 leading-snug">
                    {appLanguage === 'ms'
                      ? 'Keluar dari Safari, buka ikon "Order Sub" baru di Skrin Utama anda. Tekan loceng di atas dan pilih "Aktifkan Notifikasi" -> "Allow".'
                      : 'Exit Safari, launch the newly created "Order Sub" icon on your Home Screen. Open the bell menu and tap "Enable Notifications" -> "Allow".'}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={handleTestAudioChime}
                className="flex-1 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-text font-bold text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5 text-primary" />
                <span>{audioTestPlayed ? (appLanguage === 'ms' ? 'Bunyi Berjaya!' : 'Chime Played!') : (appLanguage === 'ms' ? 'Uji Bunyi Peringatan' : 'Test Sound Alert')}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold text-xs py-2.5 px-3 rounded-xl shadow-md transition-all cursor-pointer text-center"
              >
                {appLanguage === 'ms' ? 'Faham, Terima Kasih' : 'Got it, Thanks'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
