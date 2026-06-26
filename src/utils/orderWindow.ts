import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';

export function FloatingControls() {
  const { state, setState, viewStack, pushView } = useAppContext();
  const currentView = viewStack[viewStack.length - 1];
  
  const formViews = ['resume-type', 'resume-form-fields', 'general-form'];
  if (!formViews.includes(currentView)) return null;

  let isReady = !!state.urgency && (state.isEditMode || state.mainType !== 'Resume' || (state.resumeLangs || []).length > 0);
  if (state.mainType === 'Lain-lain' && !state.customDoc.trim()) {
    isReady = false;
  }

  return (
    <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 right-4 sm:left-5 sm:right-5 bg-white/95 backdrop-blur-2xl border border-gray-100 p-3 flex gap-2 sm:gap-3 z-50 transition-all duration-300 rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
      <button 
        onClick={() => setState(prev => ({ ...prev, extraHours: Math.max(0, prev.extraHours - 1) }))}
        className="w-12 h-12 sm:w-14 sm:h-14 bg-surface active:bg-gray-200 text-text font-black rounded-[14px] flex items-center justify-center active:scale-95 shadow-sm transition-transform"
      >
        <Minus className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>
      <button 
        onClick={() => setState(prev => ({ ...prev, extraHours: prev.extraHours + 1 }))}
        className="w-12 h-12 sm:w-14 sm:h-14 bg-surface active:bg-gray-200 text-text font-black rounded-[14px] flex items-center justify-center active:scale-95 shadow-sm transition-transform"
      >
        <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>
      <button 
        disabled={!isReady}
        onClick={() => pushView('confirmation')}
        className={cn(
          "flex-1 h-12 sm:h-14 font-black text-base sm:text-[17px] rounded-[14px] transition-all active:scale-[0.98]",
          isReady ? "bg-primary text-white shadow-md" : "bg-disabled text-white opacity-50"
        )}
      >
        Sahkan Maklumat
      </button>
    </div>
  );
}
