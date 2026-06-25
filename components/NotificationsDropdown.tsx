import React, { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';

export function NotificationsDropdown() {
  const { appLanguage } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      >
        <Bell className={cn("w-5 h-5 transition-transform duration-500", isOpen && "scale-110")} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl p-6 shrink-0 z-50 animate-fade-in-up">
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-12 h-12 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-1">
              <Bell className="w-6 h-6 text-gray-400 dark:text-zinc-500" />
            </div>
            <h2 className="text-base font-bold text-text">
              {appLanguage === 'ms' ? 'Tiada Notifikasi' : 'No Notifications'}
            </h2>
            <p className="text-subtext text-xs leading-relaxed max-w-xs">
              {appLanguage === 'ms' 
                ? 'Anda telah membaca semua notifikasi yang ada. Sila semak semula nanti.' 
                : 'You are all caught up! Check back later for new notifications.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
