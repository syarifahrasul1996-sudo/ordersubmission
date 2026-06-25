import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { calculateDeadline, generateMessages } from '../utils';

export function ConfirmationView({ onGenerated }: { onGenerated: () => void }) {
  const { state, pushView, popView, setGeneratedMessages, saveOrderToHistory, appLanguage } = useAppContext();
  const [copied, setCopied] = useState(false);

  const isE = state.isEditMode;
  let raw = state.mainType === 'Lain-lain' ? ((state.customDoc || '').trim() || 'Dokumen') : state.mainType;
  const typeTextHead = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  const typeText = `${typeTextHead} ${state.subType ? '(' + state.subType + ')' : ''}`;

  const langText = (!isE && state.resumeLangs && state.resumeLangs.length > 0) ? state.resumeLangs.join(' & ') : '-';
  const dlInfo = calculateDeadline(state, appLanguage);

  const adds = (state.addons || []).map(a => {
      if (a === 'Soft Copy Word') return `Soft Copy Word (${state.softcopyLang})`;
      if (a === 'Cover Letter') {
          const clText = ['Melayu', 'English'].filter(l => state.clLangs && state.clLangs.includes(l)).join(' & ');
          return `Cover Letter (${clText})`;
      }
      if (a === 'Custom') return (state.customDoc || '').trim() || 'Custom';
      return a;
  });

  const handleGenerate = () => {
    const finalDlInfo = calculateDeadline(state, appLanguage);
    const messages = generateMessages(state, finalDlInfo, appLanguage);
    setGeneratedMessages(messages);
    saveOrderToHistory(messages);
    pushView('output');
    onGenerated();
  };

  const urgencyLabels: Record<string, string> = {
    'super': 'Super Urgent',
    'urgent': 'Urgent',
    'semi': 'Semi Urgent',
    'noturgent': appLanguage === 'ms' ? 'Tak Urgent' : 'Not Urgent'
  };
  const urgencyLabel = urgencyLabels[state.urgency || ''] || '';
  
  const priceDocLabel = state.mainType === 'Resume' ? 'Resume' : raw;

  const langTextRaw = (!isE && state.resumeLangs && state.resumeLangs.length > 0) ? state.resumeLangs.join(' & ') : '';
  const docPart = [priceDocLabel, langTextRaw].filter(Boolean).join(' ');
  const addonsPart = adds.length > 0 ? '+ ' + adds.join(' + ') : '';

  const mainPart = [docPart, addonsPart, urgencyLabel].filter(Boolean).join(' ');

  const isDays = state.urgency === 'semi' || state.urgency === 'noturgent';
  const displayVal = isDays ? Math.round(dlInfo.total / 24) : dlInfo.total;

  let priceMsg = '';
  if (appLanguage === 'en') {
    const duration = isDays ? `${displayVal} days` : `${displayVal} hours`;
    priceMsg = `${mainPart} RM XX, ready in ${duration} after payment.`;
  } else {
    const duration = isDays ? `${displayVal} hari` : `${displayVal} jam`;
    priceMsg = `${mainPart} RM XX, siap ${duration} lepas payment.`;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(priceMsg);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = priceMsg;
      ta.style.position = "fixed";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col p-4 sm:p-5 space-y-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <div className="bg-surface rounded-[20px] p-4 border border-gray-100 space-y-4 shadow-inner" aria-live="polite">
        <div className="flex justify-between items-start border-b border-gray-200/80 pb-4 text-text">
            <div>
                <p className="text-[10px] font-black text-subtext uppercase tracking-widest mb-1">{appLanguage === 'ms' ? 'Dokumen' : 'Document'}</p>
                <p className="text-lg font-black text-text tracking-tight leading-none">{typeText}</p>
            </div>
            {(!isE) && (
              <div className="text-right">
                  <p className="text-[10px] font-black text-subtext uppercase tracking-widest mb-1">{appLanguage === 'ms' ? 'Bahasa' : 'Language'}</p>
                  <p className="font-bold text-text leading-none">{langText}</p>
              </div>
            )}
        </div>
        
        <div className="grid grid-cols-1">
            <div>
                <p className="text-[10px] font-black text-subtext uppercase tracking-widest mb-1">{appLanguage === 'ms' ? 'Tempoh Siap' : 'Time to Complete'}</p>
                <p className="text-base font-black text-text leading-none">{displayVal} {appLanguage === 'ms' ? (isDays ? 'Hari' : 'Jam') : (isDays ? 'Days' : 'Hours')}</p>
            </div>
        </div>

        {state.mainType === 'Resume' && (
          <div className="space-y-4 pt-1">
              {state.template.trim() ? (
                <div>
                    <p className="text-[10px] font-black text-subtext uppercase tracking-widest mb-1">Template</p>
                    <p className="font-bold text-text text-sm uppercase tracking-wider">{state.template.trim().toUpperCase()}</p>
                </div>
              ) : null}
              {!isE && (
                <div>
                    <p className="text-[10px] font-black text-subtext uppercase tracking-widest mb-1">Add-ons</p>
                    <p className="font-bold text-text text-sm leading-tight">{adds.length ? adds.join(', ') : (appLanguage === 'ms' ? 'Tiada' : 'None')}</p>
                </div>
              )}
          </div>
        )}

        <div className="pt-4 border-t border-gray-200/80 bg-white/50 -mx-4 -mb-4 p-4 rounded-b-[20px]">
            <p className="text-[10px] font-black text-subtext uppercase tracking-widest mb-1">{appLanguage === 'ms' ? 'Anggaran Siap' : 'Estimated Time'}</p>
            <p className="text-lg sm:text-xl font-black text-text tracking-tighter leading-tight">{dlInfo.formatted}</p>
        </div>
      </div>

      <div className="relative">
        <div 
          className="w-full pt-[30px] pb-3 px-3 pr-11 rounded-xl bg-white border border-gray-100 shadow-sm text-sm text-text font-normal leading-relaxed select-text"
          style={{ minHeight: '65px' }}
        >
          {priceMsg}
        </div>
        <span className="absolute top-2.5 left-3 text-[10px] font-black uppercase tracking-widest text-subtext flex items-center">
          {appLanguage === 'ms' ? 'Ringkasan Harga' : 'Price Summary'}
        </span>
        <button 
          onClick={handleCopy}
          className="absolute top-2 right-2 w-8 h-8 bg-surface border border-gray-100 rounded-full flex items-center justify-center text-primary shadow-sm active:scale-90 transition-all md:hover:bg-gray-200"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="space-y-2.5">
        <button 
          onClick={handleGenerate} 
          className="w-full h-[58px] bg-primary text-white font-black text-base sm:text-base rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all"
        >
          Submit & Copy
        </button>
        <button 
          onClick={popView} 
          className="w-full h-[44px] text-text/60 hover:text-text font-black rounded-xl active:bg-surface transition-all text-xs"
        >
          {appLanguage === 'ms' ? 'Kembali & Edit' : 'Back & Edit'}
        </button>
      </div>
    </div>
  );
}
