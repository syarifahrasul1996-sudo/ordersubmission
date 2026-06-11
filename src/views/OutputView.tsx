import React, { useEffect, useRef } from 'react';
import { Check, Copy } from 'lucide-react';
import { useAppContext } from '../AppContext';

export function OutputView({ onCopy }: { onCopy: (msg: string) => void }) {
  const { generatedMessages, state, reset, pushView, appLanguage } = useAppContext();

  useEffect(() => {
    if (generatedMessages.length > 0) {
      onCopy(generatedMessages[0]);
    }
  }, []);

  return (
    <div className="flex flex-col p-4 sm:p-6 space-y-8 text-center pb-[calc(env(safe-area-inset-bottom)+4rem)]">
      <div className="pt-6 sm:pt-8 w-full flex flex-col items-center">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-green-100 text-secondary rounded-full flex items-center justify-center mb-6 sm:mb-8 shadow-sm shrink-0">
          <Check className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-text tracking-tighter">{appLanguage === 'ms' ? 'Selesai!' : 'Done!'}</h2>
        <p className="text-subtext mt-2 sm:mt-3 px-4 font-medium text-[14px] sm:text-[15px]">{appLanguage === 'ms' ? 'Mesej utama telah disalin secara automatik.' : 'Main message has been copied automatically.'}</p>
      </div>

      <div className="space-y-6 sm:space-y-8 w-full text-left" aria-live="polite">
        {generatedMessages.map((msg, i) => (
          <div key={i} className="relative w-full">
            <p className="text-[10px] sm:text-[11px] font-black text-subtext mb-2 uppercase tracking-widest px-1">
              {i === 0 ? (appLanguage === 'ms' ? 'Message Utama' : 'Main Message') : (state.isEditMode ? (appLanguage === 'ms' ? 'Info Penting' : 'Important Info') : (appLanguage === 'ms' ? 'Butiran Template' : 'Template Details'))}
            </p>
            <AutoResizeTextarea value={msg} />
            <button 
              onClick={() => onCopy(msg)}
              className="absolute top-8 sm:top-9 right-2 sm:right-3 w-10 h-10 sm:w-12 sm:h-12 bg-white border border-gray-100 rounded-full flex items-center justify-center text-primary shadow-sm active:scale-90 transition-all hover:bg-surface"
            >
              <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        ))}
      </div>

      <div className="pt-4 w-full space-y-4">
        <button 
          onClick={() => pushView('customer-info')}
          className="w-full h-[64px] sm:h-20 bg-primary text-white font-black text-[15px] sm:text-[16px] rounded-[18px] active:scale-[0.98] md:hover:bg-primary/90 transition-all shadow-md"
        >
          {appLanguage === 'ms' ? 'Simpan Maklumat Pelanggan' : 'Save Customer Info'}
        </button>
        <button 
          onClick={reset}
          className="w-full h-[64px] sm:h-20 bg-surface text-text font-black text-[15px] sm:text-[16px] rounded-[18px] border border-gray-100/80 active:scale-[0.98] md:hover:bg-gray-200 transition-all"
        >
          {appLanguage === 'ms' ? 'Buat Tempahan Baru' : 'Create New Order'}
        </button>
      </div>
    </div>
  );
}

function AutoResizeTextarea({ value }: { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = (ref.current.scrollHeight + 10) + 'px';
    }
  }, [value]);

  return (
    <textarea 
      ref={ref}
      readOnly 
      value={value}
      className="w-full p-4 sm:p-5 pr-14 sm:pr-16 rounded-[20px] sm:rounded-[24px] bg-surface border border-gray-100/50 text-[13px] sm:text-[14px] font-mono outline-none resize-none shadow-inner overflow-hidden text-text/90 select-text" 
      style={{ minHeight: '100px' }}
    />
  );
}
