import React, { useState, useEffect } from 'react';
import { FileText, Mail, MoreHorizontal, ChevronRight, Calculator, Clock, Minus, Plus, Copy, Check, RefreshCcw, BarChart3 } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';

export function HomeView() {
  const { pushView, startNewOrder, appLanguage } = useAppContext();
  const [calcUrgency, setCalcUrgency] = useState<string>('all');
  const [superHours, setSuperHours] = useState<number>(2);
  const [eta, setEta] = useState<string>('');
  const [copied, setCopied] = useState(false);

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
        { id: 'normal', label: appLanguage === 'ms' ? 'Tidak Urgent' : 'Not Urgent', hours: 72 },
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
  }, [calcUrgency, superHours]);

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
    { id: 'normal', label: appLanguage === 'ms' ? 'Tidak Urgent' : 'Not Urgent' },
    { id: 'semi', label: 'Semi Urgent' },
    { id: 'urgent', label: 'Urgent' },
    { id: 'super', label: 'Super Urgent' },
  ];

  return (
    <div className="flex flex-col p-4 sm:p-5 space-y-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <div className="space-y-2.5">
        <button 
          onClick={() => startNewOrder('resume-type', { mainType: 'Resume' })} 
          className="h-[58px] bg-surface active:bg-gray-200 md:hover:bg-gray-200 text-text font-bold rounded-[16px] flex items-center px-4 w-full active:scale-[0.98] transition-all"
        >
          <span className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-primary shadow-sm shrink-0"><FileText className="w-4.5 h-4.5" /></span>
          <span className="ml-3.5 text-[15px] sm:text-[16px] text-left tracking-tight">Resume</span>
          <ChevronRight className="ml-auto text-subtext w-4.5 h-4.5 shrink-0" />
        </button>
        <button 
          onClick={() => startNewOrder('general-form', { mainType: 'Surat' })} 
          className="h-[58px] bg-surface active:bg-gray-200 md:hover:bg-gray-200 text-text font-bold rounded-[16px] flex items-center px-4 w-full active:scale-[0.98] transition-all"
        >
          <span className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-primary shadow-sm shrink-0"><Mail className="w-4.5 h-4.5" /></span>
          <span className="ml-3.5 text-[15px] sm:text-[16px] text-left tracking-tight">{appLanguage === 'ms' ? 'Surat' : 'Letters'}</span>
          <ChevronRight className="ml-auto text-subtext w-4.5 h-4.5 shrink-0" />
        </button>
        <button 
          onClick={() => startNewOrder('general-form', { mainType: 'Lain-lain' })} 
          className="h-[58px] bg-surface active:bg-gray-200 md:hover:bg-gray-200 text-text font-bold rounded-[16px] flex items-center px-4 w-full active:scale-[0.98] transition-all"
        >
          <span className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-primary shadow-sm shrink-0"><MoreHorizontal className="w-4.5 h-4.5" /></span>
          <span className="ml-3.5 text-[15px] sm:text-[16px] text-left tracking-tight">{appLanguage === 'ms' ? 'Lain-lain' : 'Others'}</span>
          <ChevronRight className="ml-auto text-subtext w-4.5 h-4.5 shrink-0" />
        </button>
        <button 
          onClick={() => pushView('customer-info')} 
          className="h-[58px] bg-surface active:bg-gray-200 md:hover:bg-gray-200 text-text font-bold rounded-[16px] flex items-center px-4 w-full active:scale-[0.98] transition-all"
        >
          <span className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-primary shadow-sm shrink-0"><svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></span>
          <span className="ml-3.5 text-[15px] sm:text-[16px] text-left tracking-tight">{appLanguage === 'ms' ? 'Maklumat Pelanggan' : 'Customer Info'}</span>
          <ChevronRight className="ml-auto text-subtext w-4.5 h-4.5 shrink-0" />
        </button>
        <button 
          onClick={() => pushView('dashboard')} 
          className="h-[58px] bg-surface active:bg-gray-200 md:hover:bg-gray-200 text-text font-bold rounded-[16px] flex items-center px-4 w-full active:scale-[0.98] transition-all"
        >
          <span className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-primary shadow-sm shrink-0"><BarChart3 className="w-4.5 h-4.5" /></span>
          <span className="ml-3.5 text-[15px] sm:text-[16px] text-left tracking-tight">{appLanguage === 'ms' ? 'Tinjauan Perniagaan' : 'Business Overview'}</span>
          <ChevronRight className="ml-auto text-subtext w-4.5 h-4.5 shrink-0" />
        </button>
      </div>

      <div className="bg-surface rounded-[20px] p-4 shadow-inner border border-gray-100/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center text-text">
            <Calculator className="w-4.5 h-4.5 mr-2 text-primary" />
            <h2 className="font-bold tracking-tight text-xs sm:text-sm">{appLanguage === 'ms' ? 'Kira Anggaran Masa Siap' : 'Calculate Estimated Time'}</h2>
          </div>
          {(calcUrgency !== 'all' || superHours !== 2) && (
            <button
              onClick={() => {
                setCalcUrgency('all');
                setSuperHours(2);
              }}
              className="flex items-center justify-center p-1.5 -mr-1.5 text-primary hover:bg-primary/10 rounded-full active:scale-95 transition-all"
              aria-label="Reset"
              title="Reset"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 p-1 bg-gray-200/50 dark:bg-gray-800/50 rounded-[14px] gap-1 mb-3 shadow-inner">
          {urgencyOptions.map(opt => {
            const isSelected = calcUrgency === opt.id;
            let activeBg = "bg-white text-text";
            if (isSelected) {
              if (opt.id === 'super') activeBg = "bg-super text-white shadow-[0_4px_12px_-2px_rgba(225,29,72,0.3)]";
              else if (opt.id === 'urgent') activeBg = "bg-urgent text-white shadow-[0_4px_12px_-2px_rgba(234,88,12,0.3)]";
              else if (opt.id === 'semi') activeBg = "bg-semi text-white shadow-[0_4px_12px_-2px_rgba(217,119,6,0.3)]";
              else activeBg = "bg-noturgent text-white shadow-[0_4px_12px_-2px_rgba(5,150,105,0.3)]";
            }
            return (
              <button
                key={opt.id}
                onClick={() => setCalcUrgency(prev => prev === opt.id ? 'all' : opt.id)}
                className={cn(
                  "py-2 rounded-[10px] font-black text-[11px] sm:text-[12px] transition-all",
                  isSelected 
                    ? activeBg 
                    : "text-subtext md:hover:bg-white/50 dark:md:hover:bg-gray-700/50"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          calcUrgency === 'super' ? "max-h-20 opacity-100 mb-3" : "max-h-0 opacity-0"
        )}>
          <div className="flex justify-center items-center gap-4 pt-0.5">
            <button 
              onClick={() => setSuperHours(h => Math.max(1, h - 1))}
              className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm text-text border border-gray-100/50 active:scale-95 transition-transform md:hover:bg-surface"
            >
              <Minus className="w-4 h-4"/>
            </button>
            <div className="flex flex-col items-center min-w-[50px]">
               <span className="font-black text-2xl leading-none text-primary">{superHours}</span>
               <span className="text-[9px] font-black tracking-widest uppercase text-subtext mt-0.5">{appLanguage === 'ms' ? 'Jam' : 'Hours'}</span>
            </div>
            <button 
              onClick={() => setSuperHours(h => h + 1)}
              className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm text-text border border-gray-100/50 active:scale-95 transition-transform md:hover:bg-surface"
            >
              <Plus className="w-4 h-4"/>
            </button>
          </div>
        </div>

        <div className="relative">
          <span className="absolute top-2.5 left-3 text-[10px] font-black uppercase tracking-widest text-subtext flex items-center">
            <Clock className="w-3 h-3 mr-1.5 text-primary/70" />
            {appLanguage === 'ms' ? 'Anggaran' : 'Estimate'}
          </span>
          <div 
            className="w-full pt-[30px] pb-3 px-3 pr-11 rounded-[12px] bg-white border border-gray-100 shadow-sm text-[13px] text-text font-normal leading-relaxed select-text whitespace-pre-wrap"
            style={{ minHeight: '65px' }}
          >
            {eta}
          </div>
          <button 
            onClick={handleCopy}
            className="absolute top-2 right-2 w-8 h-8 bg-surface border border-gray-100 rounded-full flex items-center justify-center text-primary shadow-sm active:scale-90 transition-all md:hover:bg-gray-200"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
