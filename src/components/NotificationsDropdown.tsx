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
  Copy
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { getOrderDueTimestamp } from '../utils/orderWindow';
import { 
  getFCMStatus, 
  getCurrentFid, 
  enableFCMNotifications, 
  sendTestFCMNotification,
  FCMStatus 
} from '../lib/fcm';
import { cn } from '../cn';

interface NotificationItem {
  id: string;
  type: 'overdue' | 'due_soon' | 'missing_link' | 'sync_failed' | 'drafts';
  title: string;
  message: string;
  severity: 'danger' | 'warning' | 'info' | 'success';
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
    drafts
  } = useAppContext();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // FCM state
  const [fcmStatus, setFcmStatus] = useState<FCMStatus>('permission-default');
  const [registeredFid, setRegisteredFid] = useState<string | null>(() => getCurrentFid());
  const [isRegistering, setIsRegistering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [regError, setRegError] = useState<string | null>(null);

  // Read notification IDs stored in localStorage
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('app_read_notifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('app_read_notifications', JSON.stringify(readIds));
    } catch (e) {
      console.warn(e);
    }
  }, [readIds]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update status when dropdown is opened or on mount without prompting
  useEffect(() => {
    getFCMStatus().then(status => {
      setFcmStatus(status);
      const fid = getCurrentFid();
      if (fid) setRegisteredFid(fid);
    });
  }, [isOpen]);

  const handleEnableNotifications = async () => {
    setIsRegistering(true);
    setTestResult(null);
    setRegError(null);

    const result = await enableFCMNotifications();

    setIsRegistering(false);

    if (result.success && result.fid) {
      setRegisteredFid(result.fid);
      setFcmStatus('enabled');
      setRegError(null);
    } else {
      setRegisteredFid(null);
      if (result.error && (result.error.includes('denied') || result.error.includes('blocked'))) {
        setFcmStatus('permission-denied');
        setRegError(appLanguage === 'ms' ? 'Kebenaran notifikasi disekat di pelayar.' : 'Notification permission was denied.');
      } else {
        setFcmStatus('failed');
        setRegError(result.error || (appLanguage === 'ms' ? 'Pendaftaran notifikasi gagal.' : 'Registration failed.'));
      }
    }
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
    if (!registeredFid) return;
    setTestSending(true);
    setTestResult(null);

    const title = appLanguage === 'ms' ? '🔥 Ujian FCM Berjaya!' : '🔥 FCM Test Successful!';
    const body = appLanguage === 'ms' 
      ? 'Notifikasi Firebase Cloud Messaging berfungsi dengan lancar di pelayar ini.' 
      : 'Firebase Cloud Messaging push notification is working reliably in this browser.';

    const res = await sendTestFCMNotification(registeredFid, title, body);
    setTestSending(false);

    if (res.success) {
      setTestResult({
        success: true,
        message: appLanguage === 'ms'
          ? 'Notifikasi ujian berjaya dihantar! Sila semak dulang notifikasi sistem anda.'
          : 'Test notification sent! Check your system notification banner/tray.'
      });
    } else {
      setTestResult({
        success: false,
        message: res.error || 'Failed to send test notification.'
      });
    }
  };

  // Generate smart notifications from real application state
  const notifications = useMemo(() => {
    const list: NotificationItem[] = [];
    const now = Date.now();

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

    // 3. Active Order Deadlines & Alerts
    const activeOrders = history.filter(h => 
      !h.state?.isDeleted && 
      !h.state?.isDelivered && 
      !deletedOrderIds.includes(h.id) &&
      (!h.state?.orderId || !deletedOrderIds.includes(h.state.orderId))
    );

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

    return list;
  }, [history, deletedOrderIds, queueSize, drafts, appLanguage]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !readIds.includes(n.id)).length;
  }, [notifications, readIds]);

  const handleMarkAllRead = () => {
    const allIds = notifications.map(n => n.id);
    setReadIds(allIds);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    if (!readIds.includes(item.id)) {
      setReadIds(prev => [...prev, item.id]);
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
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden shrink-0 z-50 animate-fade-in-up">
          {/* Header */}
          <div className="p-4 border-b border-gray-100 dark:border-zinc-800/80 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/40">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-extrabold text-text">
                {appLanguage === 'ms' ? 'Pemberitahuan & Notifikasi' : 'Notifications & Alerts'}
              </h2>
              {unreadCount > 0 && (
                <span className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded-full border border-primary/20">
                  {unreadCount} {appLanguage === 'ms' ? 'baru' : 'new'}
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-bold text-primary hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>{appLanguage === 'ms' ? 'Tanda Dibaca' : 'Mark all read'}</span>
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-[24rem] overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800/50 p-2 space-y-2">
            
            {/* FCM Status & Test Controller Panel */}
            <div className="p-3 bg-gray-50 dark:bg-zinc-900/70 border border-gray-200 dark:border-zinc-800 rounded-xl space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-text flex items-center space-x-1.5">
                  <span>🔥 Firebase Cloud Messaging</span>
                </span>

                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                  fcmStatus === 'enabled'
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : fcmStatus === 'permission-denied'
                      ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                      : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                )}>
                  {fcmStatus === 'enabled' 
                    ? (appLanguage === 'ms' ? 'Aktif' : 'Active') 
                    : fcmStatus === 'permission-denied' 
                      ? (appLanguage === 'ms' ? 'Disekat' : 'Denied') 
                      : (appLanguage === 'ms' ? 'Sedia Diaktifkan' : 'Ready')}
                </span>
              </div>

              {/* State 1: Permission Not Granted / Enable Action */}
              {fcmStatus !== 'enabled' && (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-subtext leading-relaxed">
                    {fcmStatus === 'permission-denied'
                      ? (appLanguage === 'ms'
                          ? 'Kebenaran notifikasi telah disekat pada pelayar. Sila buka tetapan URL (ikon kunci/slider) di bar pelayar anda dan pilih "Allow Notifications".'
                          : 'Notification permission is blocked. Please open your browser address bar settings and allow notifications.')
                      : (appLanguage === 'ms'
                          ? 'Aktifkan notifikasi Firebase untuk menerima peringatan pesanan secara langsung di latar belakang.'
                          : 'Enable Firebase Cloud Messaging to receive push notifications in the background.')}
                  </p>

                  <div className="flex items-center space-x-2">
                    <button
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
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>{appLanguage === 'ms' ? 'Aktifkan Notifikasi' : 'Enable Notifications'}</span>
                        </>
                      )}
                    </button>

                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1 bg-white dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-subtext border border-gray-200 dark:border-zinc-700 font-bold text-xs py-2 px-2.5 rounded-lg active:scale-95 transition-all cursor-pointer"
                      title={appLanguage === 'ms' ? 'Buka di tab penuh' : 'Open in full tab'}
                    >
                      <span>{appLanguage === 'ms' ? 'Tab Penuh' : 'Full Tab'}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {regError && (
                    <div className="p-2 rounded-lg text-[10px] leading-tight font-medium bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/40">
                      {regError}
                    </div>
                  )}
                </div>
              )}

              {/* State 2: Enabled - Show FID & Test Actions */}
              {fcmStatus === 'enabled' && registeredFid && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-subtext">
                      {appLanguage === 'ms' ? 'Installation ID (FID):' : 'Installation ID (FID):'}
                    </span>
                    <button
                      onClick={handleCopyFid}
                      className="font-bold text-primary hover:underline flex items-center space-x-1 cursor-pointer bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copied ? (appLanguage === 'ms' ? 'Disalin!' : 'Copied!') : (appLanguage === 'ms' ? 'Salin FID' : 'Copy FID')}</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    readOnly
                    value={registeredFid}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full p-1.5 bg-white dark:bg-zinc-950 rounded border border-gray-200 dark:border-zinc-800 font-mono text-[9px] text-gray-700 dark:text-zinc-300 select-all focus:outline-none"
                  />

                  {/* Send Test Notification Button */}
                  <button
                    onClick={handleSendTest}
                    disabled={testSending}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-1.5 px-3 rounded-lg shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    {testSending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{appLanguage === 'ms' ? 'Menghantar Ujian...' : 'Sending Test Push...'}</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>{appLanguage === 'ms' ? 'Uji Hantar Notifikasi (FCM)' : 'Send Test Notification (FCM)'}</span>
                      </>
                    )}
                  </button>

                  {testResult && (
                    <div className={cn(
                      "p-2 rounded-lg text-[10px] leading-tight font-medium border",
                      testResult.success
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40"
                        : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/40"
                    )}>
                      {testResult.message}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* List of notifications */}
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
                      "p-3 rounded-xl transition-all flex items-start space-x-3 cursor-pointer relative group text-left border border-transparent",
                      isUnread
                        ? "bg-primary/5 dark:bg-primary/10 border-primary/10 font-medium"
                        : "hover:bg-gray-50 dark:hover:bg-zinc-800/40 opacity-80"
                    )}
                  >
                    <div className={cn("p-2 rounded-xl border shrink-0", badgeInfo.bg)}>
                      <IconComponent className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-text truncate">
                          {item.title}
                        </h3>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-subtext leading-snug mt-0.5">
                        {item.message}
                      </p>

                      {item.actionText && (
                        <div className="mt-2">
                          <span className="text-[10px] font-bold text-primary hover:underline inline-flex items-center space-x-1">
                            <span>{item.actionText}</span>
                            <span>&rarr;</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center space-y-2">
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
        </div>
      )}
    </div>
  );
}
