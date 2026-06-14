import React, { useState, useEffect } from 'react';
import { FileText, Mail, MoreHorizontal, ChevronRight, Calculator, Clock, Minus, Plus, Copy, Check, RefreshCcw } from 'lucide-react';
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
    { id: 'normal', label: appLanguage === 'ms' ? 'Tak Urgent' : 'Not Urgent' },
    { id: 'semi', label: 'Semi Urgent' },
    { id: 'urgent', label: 'Urgent' },
    { id: 'super', label: 'Super Urgent' },
  ];

  return (
    <div className="flex flex-col p-4 sm:p-6 space-y-6 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <div className="space-y-3.5">
        <button 
          onClick={() => startNewOrder('resume-type', { mainType: 'Resume' })} 
          className="h-[72px] bg-surface active:bg-gray-200 md:hover:bg-gray-200 text-text font-bold rounded-[20px] flex items-center px-4 sm:px-5 w-full active:scale-[0.98] transition-all"
        >
          <span className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-full flex items-center justify-center text-primary shadow-sm shrink-0"><FileText className="w-5 h-5 sm:w-5 sm:h-5" /></span>
          <span className="ml-4 text-[16px] sm:text-[17px] text-left tracking-tight">Resume</span>
          <ChevronRight className="ml-auto text-subtext w-5 h-5 shrink-0" />
        </button>
        <button 
          onClick={() => startNewOrder('general-form', { mainType: 'Surat' })} 
          className="h-[72px] bg-surface active:bg-gray-200 md:hover:bg-gray-200 text-text font-bold rounded-[20px] flex items-center px-4 sm:px-5 w-full active:scale-[0.98] transition-all"
        >
          <span className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-full flex items-center justify-center text-primary shadow-sm shrink-0"><Mail className="w-5 h-5 sm:w-5 sm:h-5" /></span>
          <span className="ml-4 text-[16px] sm:text-[17px] text-left tracking-tight">{appLanguage === 'ms' ? 'Surat' : 'Letters'}</span>
          <ChevronRight className="ml-auto text-subtext w-5 h-5 shrink-0" />
        </button>
        <button 
          onClick={() => startNewOrder('general-form', { mainType: 'Lain-lain' })} 
          className="h-[72px] bg-surface active:bg-gray-200 md:hover:bg-gray-200 text-text font-bold rounded-[20px] flex items-center px-4 sm:px-5 w-full active:scale-[0.98] transition-all"
        >
          <span className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-full flex items-center justify-center text-primary shadow-sm shrink-0"><MoreHorizontal className="w-5 h-5 sm:w-5 sm:h-5" /></span>
          <span className="ml-4 text-[16px] sm:text-[17px] text-left tracking-tight">{appLanguage === 'ms' ? 'Lain-lain' : 'Others'}</span>
          <ChevronRight className="ml-auto text-subtext w-5 h-5 shrink-0" />
        </button>
        <button 
          onClick={() => pushView('customer-info')} 
          className="h-[72px] bg-surface active:bg-gray-200 md:hover:bg-gray-200 text-text font-bold rounded-[20px] flex items-center px-4 sm:px-5 w-full active:scale-[0.98] transition-all"
        >
          <span className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-full flex items-center justify-center text-primary shadow-sm shrink-0"><svg className="w-5 h-5 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></span>
          <span className="ml-4 text-[16px] sm:text-[17px] text-left tracking-tight">{appLanguage === 'ms' ? 'Maklumat Pelanggan' : 'Customer Info'}</span>
          <ChevronRight className="ml-auto text-subtext w-5 h-5 shrink-0" />
        </button>
      </div>

      <div className="bg-surface rounded-[24px] p-5 shadow-inner border border-gray-100/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center text-text">
            <Calculator className="w-5 h-5 mr-2 text-primary" />
            <h2 className="font-bold tracking-tight text-sm">{appLanguage === 'ms' ? 'Kira Anggaran Masa Siap' : 'Calculate Estimated Time'}</h2>
          </div>
          {(calcUrgency !== 'all' || superHours !== 2) && (
            <button
              onClick={() => {
                setCalcUrgency('all');
                setSuperHours(2);
              }}
              className="flex items-center justify-center p-2 -mr-2 text-primary hover:bg-primary/10 rounded-full active:scale-95 transition-all"
              aria-label="Reset"
              title="Reset"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 p-1.5 bg-[#e5e5ea] rounded-[16px] gap-1.5 mb-4 shadow-inner">
          {urgencyOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => setCalcUrgency(prev => prev === opt.id ? 'all' : opt.id)}
              className={cn(
                "py-2.5 rounded-[12px] font-black text-[12px] transition-all",
                calcUrgency === opt.id 
                  ? "bg-white text-text shadow-sm" 
                  : "text-subtext md:hover:bg-white/50"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          calcUrgency === 'super' ? "max-h-24 opacity-100 mb-4" : "max-h-0 opacity-0"
        )}>
          <div className="flex justify-center items-center gap-5 sm:gap-6 pt-1">
            <button 
              onClick={() => setSuperHours(h => Math.max(1, h - 1))}
              className="w-11 h-11 sm:w-12 sm:h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-text border border-gray-100/50 active:scale-95 transition-transform md:hover:bg-surface"
            >
              <Minus className="w-5 h-5 sm:w-5 sm:h-5"/>
            </button>
            <div className="flex flex-col items-center min-w-[60px]">
               <span className="font-black text-[26px] sm:text-3xl leading-none text-primary">{superHours}</span>
               <span className="text-[10px] sm:text-[11px] font-black tracking-widest uppercase text-subtext mt-1">{appLanguage === 'ms' ? 'Jam' : 'Hours'}</span>
            </div>
            <button 
              onClick={() => setSuperHours(h => h + 1)}
              className="w-11 h-11 sm:w-12 sm:h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-text border border-gray-100/50 active:scale-95 transition-transform md:hover:bg-surface"
            >
              <Plus className="w-5 h-5 sm:w-5 sm:h-5"/>
            </button>
          </div>
        </div>

        <div className="relative">
          <span className="absolute top-3.5 left-4 text-[11px] font-black uppercase tracking-widest text-subtext flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1.5 text-primary/70" />
            {appLanguage === 'ms' ? 'Anggaran' : 'Estimate'}
          </span>
          <div 
            className="w-full pt-[38px] pb-4 px-4 pr-14 rounded-[16px] bg-white border border-gray-100 shadow-sm text-[13px] sm:text-[14px] text-text font-normal leading-relaxed select-text whitespace-pre-wrap"
            style={{ minHeight: '80px' }}
          >
            {eta}
          </div>
          <button 
            onClick={handleCopy}
            className="absolute top-3 right-3 w-10 h-10 bg-surface border border-gray-100 rounded-full flex items-center justify-center text-primary shadow-sm active:scale-90 transition-all md:hover:bg-gray-200"
          >
            {copied ? <Check className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
