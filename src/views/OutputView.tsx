import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, AlertCircle } from 'lucide-react';
import { useAppContext } from '../AppContext';

export function OutputView({ onCopy }: { onCopy: (msg: string) => void }) {
  const { generatedMessages, state, reset, pushView, appLanguage } = useAppContext();
  const [confirmAction, setConfirmAction] = useState<{ title?: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    if (generatedMessages.length > 0) {
      onCopy(generatedMessages[0]);
    }
  }, []);

  const handleReset = () => {
    setConfirmAction({
      title: appLanguage === 'ms' ? 'Padam Data Semasa?' : 'Delete Current Data?',
      message: appLanguage === 'ms' 
        ? 'Adakah anda pasti mahu membuat tempahan baru? Data semasa akan dipadam jika tidak disimpan.' 
        : 'Are you sure you want to create a new order? Current data will be deleted if not saved.',
      onConfirm: () => {
        reset();
        setConfirmAction(null);
      }
    });
  };

  return (
    <div className="flex flex-col p-4 sm:p-6 space-y-8 text-center pb-[calc(env(safe-area-inset-bottom)+4rem)]">
      <div className="pt-6 sm:pt-8 w-full flex flex-col items-center">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-green-100 text-secondary rounded-full flex items-center justify-center mb-6 sm:mb-8 shadow-sm shrink-0">
          <Check className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-text tracking-tighter">{appLanguage === 'ms' ? 'Selesai!' : 'Done!'}</h2>
        <p className="text-subtext mt-2 sm:mt-3 px-4 font-medium text-sm sm:text-base">{appLanguage === 'ms' ? 'Mesej utama telah disalin secara automatik.' : 'Main message has been copied automatically.'}</p>
      </div>

      <div className="space-y-6 sm:space-y-8 w-full text-left" aria-live="polite">
        {generatedMessages.map((msg, i) => (
          <div key={i} className="relative w-full">
            <p className="text-[10px] sm:text-xs font-black text-subtext mb-2 uppercase tracking-widest px-1">
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
          className="w-full h-[64px] sm:h-20 bg-primary text-white font-black text-base sm:text-base rounded-[18px] active:scale-[0.98] md:hover:bg-primary/90 transition-all shadow-md"
        >
          {appLanguage === 'ms' ? 'Simpan Maklumat Pelanggan' : 'Save Customer Info'}
        </button>
        <button 
          onClick={handleReset}
          className="w-full h-[64px] sm:h-20 bg-surface text-text font-black text-base sm:text-base rounded-[18px] border border-gray-100/80 active:scale-[0.98] md:hover:bg-gray-200 transition-all"
        >
          {appLanguage === 'ms' ? 'Buat Tempahan Baru' : 'Create New Order'}
        </button>
      </div>

      {confirmAction && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setConfirmAction(null)}
          />
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-[320px] shadow-2xl animate-fade-in-up text-left">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-2">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-text">
                {confirmAction.title || (appLanguage === 'ms' ? 'Pasti?' : 'Are you sure?')}
              </h3>
              <p className="text-sm text-subtext pb-4">
                {confirmAction.message}
              </p>
              <div className="flex w-full space-x-3">
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  className="flex-1 py-3 px-4 rounded-full font-bold text-sm text-text bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all"
                >
                  {appLanguage === 'ms' ? 'Batal' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={confirmAction.onConfirm}
                  className="flex-1 py-3 px-4 rounded-full font-bold text-sm text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all"
                >
                  {appLanguage === 'ms' ? 'Teruskan' : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
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
      className="w-full p-4 sm:p-5 pr-14 sm:pr-16 rounded-[20px] sm:rounded-3xl bg-surface border border-gray-100/50 text-sm sm:text-sm font-mono outline-none resize-none shadow-inner overflow-hidden text-text/90 select-text" 
      style={{ minHeight: '100px' }}
    />
  );
}
