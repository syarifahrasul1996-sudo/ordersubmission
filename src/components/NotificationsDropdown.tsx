import React, { useState, useRef, useEffect } from 'react';
import { Bell, Clock, RefreshCw, HelpCircle, CheckCircle2, Trash2, Eye } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';

function formatTimeAgo(timestamp: number, language: 'ms' | 'en') {
  const diff = Date.now() - timestamp;
  const secs = Math.max(0, Math.floor(diff / 1000));
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (language === 'ms') {
    if (secs < 60) return 'Baru sahaja';
    if (mins < 60) return `${mins} minit lepas`;
    if (hours < 24) return `${hours} jam lepas`;
    return `${days} hari lepas`;
  } else {
    if (secs < 60) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
}

export function NotificationsDropdown() {
  const { appLanguage, inAppNotifications, markNotificationAsRead, clearAllNotifications } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = inAppNotifications.filter(n => !n.isRead).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getIcon = (type?: string) => {
    switch (type) {
      case 'soon':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'due':
        return <Clock className="w-4 h-4 text-rose-500 font-bold" />;
      case 'sync':
        return <RefreshCw className="w-4 h-4 text-emerald-500" />;
      case 'status_query':
        return <HelpCircle className="w-4 h-4 text-blue-500" />;
      default:
        return <Bell className="w-4 h-4 text-gray-400" />;
    }
  };

  const handleNotificationClick = (id: string) => {
    markNotificationAsRead(id);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-all text-text relative bg-surface hover:bg-gray-200/50 dark:hover:bg-gray-800/50",
          isOpen && "bg-gray-200/80 dark:bg-gray-800/80"
        )}
        aria-label="Notifications"
        title="Notifications"
        id="bell-notification-button"
      >
        <Bell className={cn("w-5 h-5 transition-transform duration-500", isOpen && "scale-110")} />
        
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500 text-[8px] font-black text-white items-center justify-center">
              {unreadCount}
            </span>
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl z-50 animate-fade-in-up flex flex-col max-h-[420px]">
          {/* Header */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-text">
                {appLanguage === 'ms' ? 'Notifikasi' : 'Notifications'}
              </span>
              {unreadCount > 0 && (
                <span className="bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[10px] px-2 py-0.5 rounded-full font-black">
                  {unreadCount} {appLanguage === 'ms' ? 'baru' : 'new'}
                </span>
              )}
            </div>
            
            {inAppNotifications.length > 0 && (
              <button
                onClick={clearAllNotifications}
                className="text-xs text-rose-500 hover:text-rose-600 font-bold flex items-center space-x-1 hover:underline"
                title={appLanguage === 'ms' ? 'Padam Semua' : 'Clear All'}
                id="clear-all-notifications-btn"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{appLanguage === 'ms' ? 'Padam' : 'Clear'}</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 divide-y divide-gray-50 dark:divide-gray-800/50">
            {inAppNotifications.length === 0 ? (
              <div className="p-8 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 bg-gray-50 dark:bg-zinc-800/50 rounded-full flex items-center justify-center">
                  <Bell className="w-6 h-6 text-gray-300 dark:text-zinc-600" />
                </div>
                <h3 className="text-sm font-bold text-text">
                  {appLanguage === 'ms' ? 'Tiada Notifikasi' : 'No Notifications'}
                </h3>
                <p className="text-subtext text-xs leading-relaxed max-w-[200px]">
                  {appLanguage === 'ms' 
                    ? 'Semua caught up! Tiada makluman baru buat masa ini.' 
                    : 'You are all caught up! Check back later for new notifications.'}
                </p>
              </div>
            ) : (
              inAppNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif.id)}
                  className={cn(
                    "p-4 flex items-start space-x-3 transition-colors cursor-pointer text-left hover:bg-gray-50/80 dark:hover:bg-gray-800/30",
                    !notif.isRead && "bg-blue-50/30 dark:bg-blue-950/10"
                  )}
                  id={`notif-item-${notif.id}`}
                >
                  <div className="mt-0.5 w-7 h-7 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                    {getIcon(notif.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between space-x-1">
                      <p className={cn(
                        "text-xs font-bold truncate text-text",
                        !notif.isRead && "font-black"
                      )}>
                        {notif.title}
                      </p>
                      <span className="text-[9px] text-gray-400 dark:text-zinc-500 shrink-0">
                        {formatTimeAgo(notif.timestamp, appLanguage)}
                      </span>
                    </div>
                    <p className="text-[11px] text-subtext leading-normal mt-0.5 line-clamp-2">
                      {notif.body}
                    </p>
                    
                    {!notif.isRead && (
                      <div className="flex items-center mt-1.5 space-x-1 text-[10px] text-blue-500 font-bold">
                        <Eye className="w-3 h-3" />
                        <span>{appLanguage === 'ms' ? 'Tandakan telah dibaca' : 'Mark as read'}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
