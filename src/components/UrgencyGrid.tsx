import React from 'react';
import { cn } from '../cn';
import { useAppContext } from '../AppContext';

interface UrgencyGridProps {
  mode: 'new' | 'edit' | 'surat' | 'lain-lain';
}

export function UrgencyGrid({ mode }: UrgencyGridProps) {
  const { state, setState, appLanguage } = useAppContext();

  const handleSelect = (urgency: string, hours: number, subType?: string) => {
    setState(prev => ({ 
      ...prev, 
      urgency, 
      baseHours: hours,
      ...(subType ? { subType } : {})
    }));
  };

  if (mode === 'edit') {
    return (
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5" role="radiogroup">
        <button 
          onClick={() => handleSelect('super', 1, 'Super Urgent')}
          className={cn(
            "col-span-2 h-[58px] rounded-[14px] flex items-center justify-between px-4 sm:px-5 transition-all active:scale-[0.98]",
            state.urgency === 'super' 
              ? "bg-super text-white shadow-[0_6px_14px_-3px_rgba(225,29,72,0.4)]" 
              : "bg-surface text-text hover:bg-gray-200/50 dark:hover:bg-gray-800/40"
          )}
        >
          <span className="font-black text-[14px] sm:text-[15px]">Super Urgent</span>
          <span className={cn("px-2.5 py-1 rounded-lg text-[9px] sm:text-[10px] font-black leading-none", state.urgency === 'super' ? "bg-white/20" : "bg-white/60")}>{appLanguage === 'ms' ? '1 Jam' : '1 Hour'}</span>
        </button>
        <button 
          onClick={() => handleSelect('urgent', 24, 'Urgent')}
          className={cn(
            "col-span-2 h-[58px] rounded-[14px] flex items-center justify-between px-4 sm:px-5 transition-all active:scale-[0.98]",
            state.urgency === 'urgent' 
              ? "bg-urgent text-white shadow-[0_6px_14px_-3px_rgba(234,88,12,0.4)]" 
              : "bg-surface text-text hover:bg-gray-200/50 dark:hover:bg-gray-800/40"
          )}
        >
          <span className="font-black text-[14px] sm:text-[15px]">Urgent</span>
          <span className={cn("px-2.5 py-1 rounded-lg text-[9px] sm:text-[10px] font-black leading-none", state.urgency === 'urgent' ? "bg-white/20" : "bg-white/60")}>{appLanguage === 'ms' ? '24 Jam' : '24 Hours'}</span>
        </button>
      </div>
    );
  }

  const configs = {
    new: [ {id:'super', h:2, l:'Super', s: appLanguage === 'ms' ? '2 Jam' : '2 Hours'}, {id:'urgent', h:24, l:'Urgent', s: appLanguage === 'ms' ? '24 Jam' : '24 Hours'}, {id:'semi', h:48, l:'Semi', s: appLanguage === 'ms' ? '2 Hari' : '2 Days'}, {id:'noturgent', h:72, l:'Normal', s: appLanguage === 'ms' ? '3 Hari' : '3 Days'} ],
    surat: [ {id:'super', h:1, l:'Super', s: appLanguage === 'ms' ? '1 Jam' : '1 Hour'}, {id:'urgent', h:24, l:'Urgent', s: appLanguage === 'ms' ? '24 Jam' : '24 Hours'}, {id:'semi', h:48, l:'Semi', s: appLanguage === 'ms' ? '2 Hari' : '2 Days'}, {id:'noturgent', h:72, l:'Normal', s: appLanguage === 'ms' ? '3 Hari' : '3 Days'} ],
    'lain-lain': [ {id:'super', h:1, l:'Super', s: appLanguage === 'ms' ? '1 Jam' : '1 Hour'}, {id:'urgent', h:24, l:'Urgent', s: appLanguage === 'ms' ? '24 Jam' : '24 Hours'}, {id:'semi', h:48, l:'Semi', s: appLanguage === 'ms' ? '2 Hari' : '2 Days'}, {id:'noturgent', h:72, l:'Normal', s: appLanguage === 'ms' ? '3 Hari' : '3 Days'} ]
  };

  const options = configs[mode];

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-2.5" role="radiogroup">
      {options.map(opt => {
        const isSelected = state.urgency === opt.id;
        let bgClass = "bg-surface text-text hover:bg-gray-200/50 dark:hover:bg-gray-800/40";
        let shadowClass = "";
        
        if (isSelected) {
          if (opt.id === 'super') {
            bgClass = "bg-super text-white";
            shadowClass = "shadow-[0_6px_14px_-3px_rgba(225,29,72,0.4)]";
          } else if (opt.id === 'urgent') {
            bgClass = "bg-urgent text-white";
            shadowClass = "shadow-[0_6px_14px_-3px_rgba(234,88,12,0.4)]";
          } else if (opt.id === 'semi') {
            bgClass = "bg-semi text-white";
            shadowClass = "shadow-[0_6px_14px_-3px_rgba(217,119,6,0.4)]";
          } else {
            bgClass = "bg-noturgent text-white";
            shadowClass = "shadow-[0_6px_14px_-3px_rgba(5,150,105,0.4)]";
          }
        }

        return (
          <button 
            key={opt.id}
            onClick={() => handleSelect(opt.id, opt.h)}
            className={cn(
              "h-[58px] sm:h-[62px] rounded-[14px] flex flex-col items-center justify-center transition-all active:scale-[0.98]",
              bgClass,
              shadowClass
            )}
          >
            <span className="font-black text-[14px] sm:text-[15px] leading-tight">{opt.l}</span>
            <span className="text-[9px] sm:text-[10px] font-black opacity-60 uppercase tracking-tight mt-0.5">{opt.s}</span>
          </button>
        )
      })}
    </div>
  );
}
