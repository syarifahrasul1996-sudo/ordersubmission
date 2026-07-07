import { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { calculateDeadline, generateMessages, toProperCase } from '../utils';

export function ConfirmationView({ onGenerated }: { onGenerated: () => void }) {
  const { state, pushView, popView, setGeneratedMessages, saveOrderToHistory, appLanguage } = useAppContext();
  const [copied, setCopied] = useState(false);
  const [srStatus, setSrStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitLockRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const isE = state.isEditMode;
  let raw = '';
  const mainTypeStr = String(state.mainType ?? '').trim();
  if (mainTypeStr === 'Lain-lain') {
    raw = String(state.customDoc ?? '').trim() || 'Dokumen';
  } else {
    raw = mainTypeStr || 'Dokumen';
  }
  const trimmedRaw = raw.trim();
  const typeTextHead = trimmedRaw ? (trimmedRaw.charAt(0).toUpperCase() + trimmedRaw.slice(1)) : '';
  const subTypeStr = String(state.subType ?? '').trim();
  const typeText = subTypeStr ? `${typeTextHead} (${subTypeStr})` : typeTextHead;

  const isResume = mainTypeStr === 'Resume';
  let langText = '';
  let showLangSection = false;

  if (isResume) {
    if (!isE) {
      if (Array.isArray(state.resumeLangs) && state.resumeLangs.length > 0) {
        langText = state.resumeLangs.join(' & ');
        showLangSection = true;
      } else {
        const cb = String(state.customerBahasa ?? '').trim();
        if (cb) {
          langText = cb;
          showLangSection = true;
        }
      }
    } else {
      const cb = String(state.customerBahasa ?? '').trim();
      if (cb) {
        langText = cb;
        showLangSection = true;
      }
    }
  } else {
    const cb = String(state.customerBahasa ?? '').trim();
    if (cb) {
      langText = cb;
      showLangSection = true;
    }
  }

  const dlInfo = calculateDeadline(state, appLanguage);

  let adds: string[] = [];
  if (state.customerAddOn !== undefined && state.customerAddOn !== null && String(state.customerAddOn).trim()) {
    const rawList = String(state.customerAddOn)
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);

    const seen = new Set<string>();
    const uniqueList: string[] = [];
    for (const item of rawList) {
      const lower = item.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        uniqueList.push(toProperCase(item));
      }
    }
    adds = uniqueList;
  } else {
    adds = (state.addons || [])
      .map((a: unknown) => String(a ?? '').trim())
      .filter(Boolean)
      .map((a: string) => {
        if (a === 'Soft Copy Word') {
          const lang = String(state.softcopyLang ?? '').trim();
          return lang ? `Soft Copy Word (${lang})` : 'Soft Copy Word';
        }
        if (a === 'Cover Letter') {
          const clText = ['Melayu', 'English']
            .filter(l => Array.isArray(state.clLangs) && state.clLangs.includes(l))
            .join(' & ');
          return clText ? `Cover Letter (${clText})` : 'Cover Letter';
        }
        if (a === 'Custom') {
          return toProperCase(state.customDoc || '').trim() || 'Custom';
        }
        return a;
      })
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  const handleGenerate = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    try {
      try {
        await handleCopy();
      } catch (e) {
        // Continue generating even if clipboard access fails, prevent unhandled promise errors
      }
      const finalDlInfo = calculateDeadline(state, appLanguage);
      const messages = generateMessages(state, finalDlInfo, appLanguage);
      setGeneratedMessages(messages);
      saveOrderToHistory(messages);
      pushView('output');
      onGenerated();
    } catch (err) {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const urgencyLabels: Record<string, string> = appLanguage === 'ms' ? {
    'super': 'Sangat Segera',
    'urgent': 'Segera',
    'semi': 'Separuh Segera',
    'noturgent': 'Tidak Segera'
  } : {
    'super': 'Super Urgent',
    'urgent': 'Urgent',
    'semi': 'Semi Urgent',
    'noturgent': 'Not Urgent'
  };
  const urgencyLabel = urgencyLabels[state.urgency || ''] || '';
  
  const priceDocLabel = isResume ? 'Resume' : trimmedRaw;

  const langTextRaw = showLangSection ? langText : '';
  const docPart = [priceDocLabel, langTextRaw].map(s => s.trim()).filter(Boolean).join(' ');
  const addonsPart = adds.length > 0 ? '+ ' + adds.join(' + ') : '';

  const mainPart = [docPart, addonsPart, urgencyLabel].map(s => s.trim()).filter(Boolean).join(' ');

  const isDays = state.urgency === 'semi' || state.urgency === 'noturgent';
  const rawTotal = (dlInfo && typeof dlInfo.total === 'number' && !isNaN(dlInfo.total)) ? dlInfo.total : 0;
  const safeTotal = rawTotal > 0 ? rawTotal : 0;
  const displayVal = isDays ? Math.ceil(safeTotal / 24) : safeTotal;

  const template = String(state.template ?? '').trim();

  let priceMsg = '';
  if (appLanguage === 'en') {
    const duration = isDays ? `${displayVal} days` : `${displayVal} hours`;
    priceMsg = `${mainPart} RM XX, ready in ${duration} after payment.`;
  } else {
    const duration = isDays ? `${displayVal} hari` : `${displayVal} jam`;
    priceMsg = `${mainPart} RM XX, siap ${duration} selepas pembayaran.`;
  }
  priceMsg = priceMsg.trim();

  const handleCopy = async (): Promise<boolean> => {
    let success = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(priceMsg);
        success = true;
      } else {
        throw new Error('Clipboard API not supported');
      }
    } catch (e) {
      let ta: HTMLTextAreaElement | null = null;
      try {
        ta = document.createElement("textarea");
        ta.value = priceMsg;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.pointerEvents = "none";
        document.body.appendChild(ta);
        ta.select();
        success = document.execCommand('copy');
      } catch (err) {
        success = false;
      } finally {
        if (ta && ta.parentNode) {
          ta.parentNode.removeChild(ta);
        }
      }
    }

    if (success) {
      setCopied(true);
      setSrStatus(appLanguage === 'ms' ? 'Ringkasan harga disalin!' : 'Price summary copied successfully!');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 2000);
    } else {
      setSrStatus(appLanguage === 'ms' ? 'Gagal menyalin ringkasan harga.' : 'Failed to copy price summary.');
    }
    return success;
  };

  return (
    <div className="flex flex-col p-4 sm:p-5 space-y-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <div className="bg-surface rounded-[20px] p-4 border border-gray-100 space-y-4 shadow-inner" aria-live="polite">
        <div className="flex justify-between items-start border-b border-gray-200/80 pb-4 text-text">
            <div>
                <p className="text-[10px] font-black text-subtext uppercase tracking-widest mb-1">{appLanguage === 'ms' ? 'Dokumen' : 'Document'}</p>
                <p className="text-lg font-black text-text tracking-tight leading-none">{typeText}</p>
            </div>
            {showLangSection && (
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

        {mainTypeStr === 'Resume' && (
          <div className="space-y-4 pt-1">
              {template ? (
                <div>
                    <p className="text-[10px] font-black text-subtext uppercase tracking-widest mb-1">{appLanguage === 'ms' ? 'Templat' : 'Template'}</p>
                    <p className="font-bold text-text text-sm uppercase tracking-wider">{template.toUpperCase()}</p>
                </div>
              ) : null}
              {!isE && (
                <div>
                    <p className="text-[10px] font-black text-subtext uppercase tracking-widest mb-1">{appLanguage === 'ms' ? 'Add-on' : 'Add-ons'}</p>
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
          type="button"
          onClick={handleCopy}
          className="absolute top-2 right-2 w-8 h-8 bg-surface border border-gray-100 rounded-full flex items-center justify-center text-primary shadow-sm active:scale-90 transition-all md:hover:bg-gray-200"
          aria-label={
            appLanguage === 'ms'
              ? (copied ? 'Ringkasan harga disalin' : 'Salin ringkasan harga')
              : (copied ? 'Price summary copied' : 'Copy price summary')
          }
          title={
            appLanguage === 'ms'
              ? (copied ? 'Ringkasan harga disalin' : 'Salin ringkasan harga')
              : (copied ? 'Price summary copied' : 'Copy price summary')
          }
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-secondary" aria-hidden="true" />
          ) : (
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="space-y-2.5">
        <button 
          type="button"
          onClick={handleGenerate} 
          disabled={isSubmitting}
          className="w-full h-[58px] bg-primary text-white font-black text-base sm:text-base rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
        >
          {isSubmitting 
            ? (appLanguage === 'ms' ? 'Menghantar...' : 'Submitting...') 
            : (appLanguage === 'ms' ? 'Hantar & Salin' : 'Submit & Copy')}
        </button>
        <button 
          type="button"
          onClick={popView} 
          className="w-full h-[44px] text-text/60 hover:text-text font-black rounded-xl active:bg-surface transition-all text-xs"
        >
          {appLanguage === 'ms' ? 'Kembali & Edit' : 'Back & Edit'}
        </button>
      </div>

      <div className="sr-only" aria-live="polite" role="status">
        {srStatus}
      </div>
    </div>
  );
}
