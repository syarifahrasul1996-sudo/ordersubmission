import React from 'react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';
import { UrgencyGrid } from '../components/UrgencyGrid';

export function GeneralFormView() {
  const { state, setState, appLanguage } = useAppContext();
  const isSurat = state.mainType === 'Surat';

  return (
    <div className="flex flex-col p-4 sm:p-6 space-y-8 pb-[calc(env(safe-area-inset-bottom)+8rem)]">
      {!isSurat && (
        <section>
          <label className="block text-[13px] font-black uppercase tracking-widest mb-4 text-gray-400">{appLanguage === 'ms' ? 'Nama Dokumen' : 'Document Name'}</label>
          <input 
            type="text" 
            maxLength={25} 
            placeholder={appLanguage === 'ms' ? 'Contoh: Assignment' : 'Example: Assignment'}
            value={state.customDoc}
            onChange={(e) => setState(prev => ({...prev, customDoc: e.target.value}))} 
            className="w-full bg-surface border-2 border-transparent rounded-[16px] h-[56px] px-5 sm:px-6 focus:outline-none focus:border-primary font-bold shadow-inner transition-all text-text select-text text-[14px]" 
          />
        </section>
      )}

      <section>
        <h2 className="text-[13px] font-black uppercase tracking-widest mb-4 text-gray-400">{appLanguage === 'ms' ? 'Bahasa Dokumen' : 'Document Language'}</h2>
        <div className="flex bg-surface p-1.5 rounded-[16px] h-[56px] sm:h-[64px] gap-2 mb-3">
          {['Melayu', 'English'].map((lang) => (
            <button
              key={lang}
              onClick={() => {
                const isSelected = state.resumeLangs.includes(lang);
                let newLangs = [...state.resumeLangs];
                if (isSelected) {
                   newLangs = newLangs.filter(l => l !== lang);
                   if (newLangs.length === 0) newLangs = [lang]; // minimum 1
                } else {
                   newLangs.push(lang);
                }
                setState(prev => ({ ...prev, resumeLangs: newLangs }));
              }}
              className={cn(
                "flex-1 rounded-[12px] font-bold transition-all text-[13px] sm:text-[14px]",
                state.resumeLangs.includes(lang) ? "bg-[#1C1C1E] text-white shadow-md transform scale-[1.02]" : "text-text active:bg-gray-200"
              )}
            >
              {lang}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[13px] font-black uppercase tracking-widest mb-4 text-gray-400">{appLanguage === 'ms' ? 'Pilihan Pakej' : 'Package Option'}</h2>
        <UrgencyGrid mode={isSurat ? 'surat' : 'lain-lain'} />
      </section>
    </div>
  );
}
