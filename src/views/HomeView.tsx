import React, { useState, useEffect } from 'react';
import { isActivePendingOrder } from '../utils/orderWindow';
import { 
  Calculator, 
  Clock, 
  Minus, 
  Plus, 
  Copy, 
  Check, 
  RefreshCcw, 
  AlertCircle,
  Calendar,
  Hourglass
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';
import { parseDateStringToTimestamp } from '../utils';

export function HomeView() {
  const { 
    appLanguage, 
    history, 
    changeTab, 
    setHistoryDeliveryFilter, 
    setHistoryPendingTimeFilter 
  } = useAppContext();
  const [calcUrgency, setCalcUrgency] = useState<string>('all');
  const [superHours, setSuperHours] = useState<number>(2);
  const [eta, setEta] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Helper to parse due timestamp
  const parseDueTimestamp = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string' || !value.trim()) {
      return 0;
    }

    return parseDateStringToTimestamp(value, 0).timestamp;
  };

  // Update Estimated Delivery Times
  useEffect(() => {
    const updateEta = () => {
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(now.getHours() + 1, 0, 0, 0);

      const formatEta = (calcHours: number) => {
        const dl = new Date(nextHour.getTime() + calcHours * 3600000);
        const timeStr = dl.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).toUpperCase();
        const diff = Math.round((new Date(dl.toDateString()).getTime() - new Date(nextHour.toDateString()).getTime()) / 86400000);
        const daysMs = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
        const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        if (diff === 0) {
          return appLanguage === 'ms' ? `hari ini ${timeStr}` : `today at ${timeStr}`;
        } else if (diff === 1) {
          return appLanguage === 'ms' ? `esok ${timeStr}` : `tomorrow at ${timeStr}`;
        } else {
          return appLanguage === 'ms' 
            ? `hari ${daysMs[dl.getDay()]} (${String(dl.getDate()).padStart(2, '0')}/${String(dl.getMonth() + 1).padStart(2, '0')}) ${timeStr}`
            : `on ${daysEn[dl.getDay()]} (${String(dl.getDate()).padStart(2, '0')}/${String(dl.getMonth() + 1).padStart(2, '0')}) at ${timeStr}`;
        }
      };

      const paymentTimeStr = nextHour.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).toUpperCase();

      const options = [
        { id: 'super', label: 'Super Urgent', hours: superHours },
        { id: 'urgent', label: 'Urgent', hours: 24 },
        { id: 'semi', label: 'Semi Urgent', hours: 48 },
        { id: 'normal', label: appLanguage === 'ms' ? 'Tak Urgent' : 'Not Urgent', hours: 72 },
      ];

      if (calcUrgency === 'all') {
        const lines = options.map(opt => `${opt.label}: ${appLanguage === 'ms' ? 'Kalau payment' : 'If payment at'} ${paymentTimeStr}, ${appLanguage === 'ms' ? 'siap' : 'ready'} ${formatEta(opt.hours)}`);
        setEta(lines.join('\n\n'));
      } else {
        const opt = options.find(o => o.id === calcUrgency);
        if (opt) {
          setEta(`${opt.label}: ${appLanguage === 'ms' ? 'Kalau payment' : 'If payment at'} ${paymentTimeStr}, ${appLanguage === 'ms' ? 'siap' : 'ready'} ${formatEta(opt.hours)}`);
        }
      }
    };

    updateEta();
    const interval = setInterval(updateEta, 60000);
    return () => clearInterval(interval);
  }, [calcUrgency, superHours, appLanguage]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(eta);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = eta;
      ta.style.position = "fixed";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const urgencyOptions = [
    { id: 'normal', label: appLanguage === 'ms' ? 'Tak Urgent' : 'Not Urgent' },
    { id: 'semi', label: 'Semi Urgent' },
    { id: 'urgent', label: 'Urgent' },
    { id: 'super', label: 'Super Urgent' },
  ];

const activeWindow = getActiveOrderWindow();

console.log('Active order window:', {
  start: new Date(
    activeWindow.startTimestamp
  ).toLocaleString(),
  end: new Date(
    activeWindow.endTimestamp
  ).toLocaleString(),
});

console.log(
  'Orders inside active window:',
  history.filter(order =>
    isActivePendingOrder(order)
  ).map(order => ({
    orderId: order.state?.orderId,
    customerName: order.state?.customerName,
    customerDue: order.state?.customerDue,
    dueTimestamp: getOrderDueTimestamp(order),
  }))
);
  // Derive statistics
  const activeOrders = history.filter(isActivePendingOrder);
  const totalPendingCount = activeOrders.length;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const tomorrowStart = new Date();
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date();
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const todayPendingCount = activeOrders.filter(o => {
    const ts = parseDueTimestamp(o.state?.dueTimestamp || o.timestamp);
    return ts >= todayStart.getTime() && ts <= todayEnd.getTime();
  }).length;

  const tomorrowPendingCount = activeOrders.filter(o => {
    const ts = parseDueTimestamp(o.state?.dueTimestamp || o.timestamp);
    return ts >= tomorrowStart.getTime() && ts <= tomorrowEnd.getTime();
  }).length;

  return (
    <div className="flex flex-col p-3.5 sm:p-4 space-y-3.5 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] animate-fade-in">
      
      {/* 1. Header & Welcome Area */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-black tracking-tight text-text">
          {appLanguage === 'ms' ? 'Selamat Kembali!' : 'Welcome Back!'}
        </h2>
        <span className="text-[10px] text-subtext/80 font-medium">
          {appLanguage === 'ms' ? 'Ringkasan Tempahan' : 'Order Overview'}
        </span>
      </div>

      {/* 2. Order Statistics Overview - 3-Column Compact Card Grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* Card 1: All Pending */}
        <button
          onClick={() => {
            setHistoryDeliveryFilter('pending');
            setHistoryPendingTimeFilter('all');
            changeTab('history');
          }}
          className="w-full text-left bg-primary/10 dark:bg-primary/5 border border-primary/15 dark:border-primary/950 rounded-xl p-2.5 flex flex-col justify-between h-20 relative overflow-hidden hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-1">
            <Hourglass className="w-3 h-3 text-primary shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-wider text-primary truncate">
              {appLanguage === 'ms' ? 'Belum Siap' : 'Pending'}
            </span>
          </div>
          <div>
            <span className="font-mono font-black text-2xl text-primary block leading-none">
              {totalPendingCount}
            </span>
            <span className="text-[8px] text-subtext/70 font-semibold block mt-0.5 leading-none">
              {appLanguage === 'ms' ? 'aktif' : 'active'}
            </span>
          </div>
        </button>

        {/* Card 2: Due Today */}
        <button
          onClick={() => {
            setHistoryDeliveryFilter('pending');
            setHistoryPendingTimeFilter('today');
            changeTab('history');
          }}
          className="w-full text-left bg-rose-500/10 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-950/50 rounded-xl p-2.5 flex flex-col justify-between h-20 relative overflow-hidden hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 truncate">
              {appLanguage === 'ms' ? 'Hari Ini' : 'Today'}
            </span>
          </div>
          <div>
            <span className="font-mono font-black text-2xl text-rose-600 dark:text-rose-400 block leading-none">
              {todayPendingCount}
            </span>
            <span className="text-[8px] text-subtext/70 font-semibold block mt-0.5 leading-none">
              {appLanguage === 'ms' ? 'tempahan' : 'orders'}
            </span>
          </div>
        </button>

        {/* Card 3: Due Tomorrow */}
        <button
          onClick={() => {
            setHistoryDeliveryFilter('pending');
            setHistoryPendingTimeFilter('tomorrow');
            changeTab('history');
          }}
          className="w-full text-left bg-amber-500/10 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-950/50 rounded-xl p-2.5 flex flex-col justify-between h-20 relative overflow-hidden hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
        >
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 truncate">
              {appLanguage === 'ms' ? 'Esok' : 'Tomorrow'}
            </span>
          </div>
          <div>
            <span className="font-mono font-black text-2xl text-amber-600 dark:text-amber-400 block leading-none">
              {tomorrowPendingCount}
            </span>
            <span className="text-[8px] text-subtext/70 font-semibold block mt-0.5 leading-none">
              {appLanguage === 'ms' ? 'tempahan' : 'orders'}
            </span>
          </div>
        </button>
      </div>

      {/* 3. Re-designed ETA Calculator Card (Highly Compact) */}
      <div className="bg-surface rounded-2xl p-3.5 border border-gray-100/60 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center text-text gap-1.5">
            <div className="p-1 bg-primary/10 rounded text-primary">
              <Calculator className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-black tracking-tight text-[10px] sm:text-xs text-text uppercase">
              {appLanguage === 'ms' ? 'Kira Anggaran Masa Siap' : 'Calculate Ready Time'}
            </h3>
          </div>
          {(calcUrgency !== 'all' || superHours !== 2) && (
            <button
              onClick={() => {
                setCalcUrgency('all');
                setSuperHours(2);
              }}
              className="flex items-center justify-center p-1 text-primary bg-primary/5 hover:bg-primary/10 rounded-full active:scale-95 transition-all cursor-pointer"
              title="Reset"
            >
              <RefreshCcw className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Urgency selector strip */}
        <div className="grid grid-cols-4 p-1 bg-gray-100/80 dark:bg-zinc-900/60 rounded-xl gap-1 shadow-inner">
          {urgencyOptions.map(opt => {
            const isSelected = calcUrgency === opt.id;
            let activeBg = "bg-white text-text shadow-sm";
            if (isSelected) {
              if (opt.id === 'super') activeBg = "bg-rose-600 text-white shadow-sm";
              else if (opt.id === 'urgent') activeBg = "bg-orange-600 text-white shadow-sm";
              else if (opt.id === 'semi') activeBg = "bg-amber-600 text-white shadow-sm";
              else activeBg = "bg-emerald-600 text-white shadow-sm";
            }
            return (
              <button
                key={opt.id}
                onClick={() => setCalcUrgency(prev => prev === opt.id ? 'all' : opt.id)}
                className={cn(
                  "py-2 px-0.5 rounded-lg font-black text-[9px] min-[360px]:text-[10px] sm:text-xs leading-tight transition-all cursor-pointer text-center flex items-center justify-center min-h-[36px]",
                  isSelected 
                    ? activeBg 
                    : "text-subtext hover:bg-white/40 dark:hover:bg-zinc-800/40"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Super Urgent hours controller */}
        <div className={cn(
          "overflow-hidden transition-all duration-200 ease-out",
          calcUrgency === 'super' ? "max-h-12 opacity-100" : "max-h-0 opacity-0"
        )}>
          <div className="flex justify-center items-center gap-3 bg-gray-50/50 dark:bg-zinc-900/20 p-1.5 rounded-xl border border-gray-100/50">
            <button 
              onClick={() => setSuperHours(h => Math.max(1, h - 1))}
              className="w-7 h-7 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center shadow-sm text-text border border-gray-100/50 active:scale-95 transition-transform cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
            <div className="flex items-center gap-1">
               <span className="font-black text-base text-primary">{superHours}</span>
               <span className="text-[9px] font-black tracking-widest uppercase text-subtext">{appLanguage === 'ms' ? 'Jam' : 'Hours'}</span>
            </div>
            <button 
              onClick={() => setSuperHours(h => h + 1)}
              className="w-7 h-7 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center shadow-sm text-text border border-gray-100/50 active:scale-95 transition-transform cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Output Area */}
        <div className="relative">
          <span className="absolute top-2 left-2.5 text-[8px] font-black uppercase tracking-widest text-subtext/75 flex items-center">
            <Clock className="w-3 h-3 mr-1 text-primary" />
            {appLanguage === 'ms' ? 'Format Anggaran Siap' : 'Formatted Ready Times'}
          </span>
          <div 
            className="w-full pt-6 pb-2.5 px-3 pr-10 rounded-xl bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-zinc-800/80 shadow-inner text-xs text-text font-medium leading-relaxed select-text whitespace-pre-wrap font-sans"
            style={{ minHeight: '52px' }}
          >
            {eta}
          </div>
          <button 
            onClick={handleCopy}
            className="absolute top-1.5 right-1.5 w-6.5 h-6.5 bg-surface hover:bg-gray-200 border border-gray-100 dark:border-zinc-800 rounded-full flex items-center justify-center text-primary shadow-sm active:scale-90 transition-all cursor-pointer"
            title="Copy"
          >
            {copied ? <Check className="w-3 text-emerald-500" /> : <Copy className="w-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}
