import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';
import { UrgencyGrid } from '../components/UrgencyGrid';

export function ResumeFormFieldsView() {
  const { state, setState, appLanguage } = useAppContext();
  const [customAddon, setCustomAddon] = useState('');

  const isMulti = (state.resumeLangs || []).length > 1;

  const toggleResumeLang = (lang: string) => {
    setState(prev => {
      let nextLangs = [...(prev.resumeLangs || [])];
      if (nextLangs.includes(lang)) {
        if (nextLangs.length > 1) {
          nextLangs = nextLangs.filter(l => l !== lang);
        }
      } else {
        nextLangs.push(lang);
      }
      return { ...prev, resumeLangs: nextLangs };
    });
  };

  const toggleAddon = (addon: string) => {
    setState(prev => {
      let nextAddons = [...(prev.addons || [])];
      if (nextAddons.includes(addon)) {
        nextAddons = nextAddons.filter(a => a !== addon);
      } else {
        if (addon === 'Soft Copy Word') nextAddons = nextAddons.filter(a => a !== 'Soft Copy Dua Bahasa');
        if (addon === 'Soft Copy Dua Bahasa') nextAddons = nextAddons.filter(a => a !== 'Soft Copy Word');
        nextAddons.push(addon);
      }
      return { ...prev, addons: nextAddons };
    });
  };

  const toggleClLang = (lang: string) => {
    setState(prev => {
      let nextLangs = [...(prev.clLangs || [])];
      if (nextLangs.includes(lang)) {
        if (nextLangs.length > 1) nextLangs = nextLangs.filter(l => l !== lang);
      } else {
        nextLangs.push(lang);
      }
      return { ...prev, clLangs: nextLangs };
    });
  };

  // Sync softcopy/CL lang when not multi
  React.useEffect(() => {
    if (!isMulti && (state.resumeLangs || []).length > 0) {
      const firstLang = state.resumeLangs?.[0] || '';
      const firstClLang = state.clLangs?.[0] || '';
      const clLangsLen = (state.clLangs || []).length;
      if (state.softcopyLang !== firstLang || firstClLang !== firstLang || clLangsLen > 1) {
        setState(prev => ({
          ...prev,
          softcopyLang: firstLang,
          clLangs: [firstLang],
          addons: (prev.addons || []).filter(a => a !== "Soft Copy Dua Bahasa")
        }));
      }
    }
  }, [isMulti, state.resumeLangs, state.softcopyLang, state.clLangs, setState]);

  return (
    <div className="flex flex-col p-4 sm:p-5 space-y-4 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
      <section>
        <h2 className="text-[11px] font-black uppercase tracking-widest mb-2 text-gray-400">{appLanguage === 'ms' ? 'Pilihan Pakej' : 'Package Option'}</h2>
        <UrgencyGrid mode={state.isEditMode ? 'edit' : 'new'} />
      </section>

      {!state.isEditMode && (
        <section>
          <h2 className="text-[11px] font-black uppercase tracking-widest mb-2 text-gray-400">{appLanguage === 'ms' ? 'Bahasa Resume' : 'Resume Language'}</h2>
          <div className="flex bg-surface p-1 rounded-[12px] h-[46px] gap-1.5">
            {['Melayu', 'English'].map(lang => (
              <button 
                key={lang}
                onClick={() => toggleResumeLang(lang)}
                className={cn(
                  "flex-1 rounded-[8px] sm:rounded-[10px] font-bold transition-all text-[12px] sm:text-[13px]",
                  state.resumeLangs.includes(lang) ? "bg-[#1C1C1E] text-white shadow-sm transform scale-[1.01]" : "text-text active:bg-gray-200"
                )}
              >
                {lang}
              </button>
            ))}
          </div>
        </section>
      )}

      {!state.isEditMode && (
        <section>
          <h2 className="text-[11px] font-black uppercase tracking-widest mb-2 text-gray-400">{appLanguage === 'ms' ? 'Add-ons (Pilihan)' : 'Add-ons (Optional)'}</h2>
          <div className="space-y-2.5">
            
            {/* Soft Copy Word */}
            <div className="space-y-2">
              <button 
                onClick={() => toggleAddon('Soft Copy Word')}
                className={cn(
                  "w-full py-3 px-4 rounded-xl flex justify-between items-center transition-all border border-transparent",
                  state.addons.includes('Soft Copy Word') ? "bg-primary text-white shadow-md font-bold" : "bg-surface font-semibold text-text"
                )}
              >
                <span className="text-sm sm:text-[15px]">Soft Copy Word</span>
                <CheckCircle2 className={cn("w-5 h-5 transition-opacity", state.addons.includes('Soft Copy Word') ? "opacity-100" : "opacity-20")} />
              </button>
              {state.addons.includes('Soft Copy Word') && isMulti && (
                <div className="p-4 bg-surface rounded-xl border border-primary/20 space-y-3 shadow-inner">
                  <p className="text-[11px] font-bold text-primary tracking-tight">{appLanguage === 'ms' ? 'Pilih Bahasa Soft Copy:' : 'Choose Soft Copy Language:'}</p>
                  <div className="flex gap-2">
                    {['Melayu', 'English'].map(lang => (
                      <button 
                        key={lang}
                        onClick={() => setState(prev => ({...prev, softcopyLang: lang}))}
                        className={cn(
                          "flex-1 py-2 rounded-lg font-bold border border-transparent transition-all text-xs",
                          state.softcopyLang === lang ? "bg-primary text-white shadow-sm" : "bg-white text-text shadow-xs"
                        )}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cover Letter */}
            <div className="space-y-2">
              <button 
                onClick={() => toggleAddon('Cover Letter')}
                className={cn(
                  "w-full py-3 px-4 rounded-xl flex justify-between items-center transition-all border border-transparent",
                  state.addons.includes('Cover Letter') ? "bg-primary text-white shadow-md font-bold" : "bg-surface font-semibold text-text"
                )}
              >
                <span className="text-sm sm:text-[15px]">Cover Letter</span>
                <CheckCircle2 className={cn("w-5 h-5 transition-opacity", state.addons.includes('Cover Letter') ? "opacity-100" : "opacity-20")} />
              </button>
              {state.addons.includes('Cover Letter') && isMulti && (
                <div className="p-4 bg-surface rounded-xl border border-primary/20 space-y-3 shadow-inner">
                  <p className="text-[11px] font-bold text-primary tracking-tight">{appLanguage === 'ms' ? 'Pilih Bahasa Cover Letter:' : 'Choose Cover Letter Language:'}</p>
                  <div className="flex gap-2">
                    {['Melayu', 'English'].map(lang => (
                      <button 
                        key={lang}
                        onClick={() => toggleClLang(lang)}
                        className={cn(
                          "flex-1 py-2 rounded-lg font-bold border border-transparent transition-all text-xs",
                          state.clLangs.includes(lang) ? "bg-primary text-white shadow-sm" : "bg-white text-text shadow-xs"
                        )}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Dua Bahasa */}
            {isMulti && (
              <button 
                  onClick={() => toggleAddon('Soft Copy Dua Bahasa')}
                  className={cn(
                    "w-full py-3 px-4 rounded-xl flex justify-between items-center transition-all border border-transparent",
                    state.addons.includes('Soft Copy Dua Bahasa') ? "bg-primary text-white shadow-md font-bold" : "bg-surface font-semibold text-text"
                  )}
                >
                  <span className="text-sm sm:text-[15px]">Soft Copy Dua Bahasa</span>
                  <CheckCircle2 className={cn("w-5 h-5 transition-opacity", state.addons.includes('Soft Copy Dua Bahasa') ? "opacity-100" : "opacity-20")} />
              </button>
            )}

            {/* Custom Addon */}
            <div className="space-y-2">
              <button 
                onClick={() => toggleAddon('Custom')}
                className={cn(
                  "w-full py-3 px-4 rounded-xl flex justify-between items-center transition-all border border-transparent",
                  state.addons.includes('Custom') ? "bg-primary text-white shadow-md font-bold" : "bg-surface font-semibold text-text"
                )}
              >
                <span className="text-sm sm:text-[15px]">Custom</span>
                <CheckCircle2 className={cn("w-5 h-5 transition-opacity", state.addons.includes('Custom') ? "opacity-100" : "opacity-20")} />
              </button>
              {state.addons.includes('Custom') && (
                <div className="pt-0.5">
                  <input 
                    type="text" 
                    value={state.customDoc} 
                    onChange={(e) => setState(prev => ({...prev, customDoc: e.target.value}))}
                    placeholder={appLanguage === 'ms' ? 'Apa yang anda perlukan?' : 'What do you need?'}
                    className="w-full bg-surface border-2 border-transparent rounded-[12px] h-[46px] px-4 focus:outline-none focus:border-primary font-bold text-text shadow-inner transition-all select-text text-sm"
                  />
                </div>
              )}
            </div>
            
          </div>
        </section>
      )}

      <section>
        <label className="block text-[11px] font-black uppercase tracking-widest mb-2 text-gray-400">Template Info</label>
        <input 
          type="text" 
          value={state.template}
          onChange={(e) => setState(prev => ({...prev, template: e.target.value}))}
          className="w-full bg-surface border-2 border-transparent rounded-[12px] h-[46px] px-4 focus:outline-none focus:border-primary font-bold uppercase tracking-wider text-text shadow-inner transition-all select-text text-sm" 
          placeholder="CTH: MODERN 01" 
        />
      </section>

    </div>
  );
}
