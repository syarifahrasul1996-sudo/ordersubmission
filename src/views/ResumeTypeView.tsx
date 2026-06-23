import React from 'react';
import { PlusCircle, Edit } from 'lucide-react';
import { useAppContext } from '../AppContext';

export function ResumeTypeView() {
  const { pushView, appLanguage } = useAppContext();

  return (
    <div className="flex flex-col p-4 sm:p-5 space-y-3 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
      <button 
        onClick={() => pushView('resume-form-fields', { subType: 'New', isEditMode: false })} 
        className="h-[58px] bg-primary text-white font-black text-base sm:text-base rounded-2xl flex items-center justify-center w-full shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform"
      >
        <PlusCircle className="mr-2 sm:mr-2.5 w-4.5 h-4.5" /> {appLanguage === 'ms' ? 'Resume Baru' : 'New Resume'}
      </button>
      <button 
        onClick={() => pushView('resume-form-fields', { subType: 'Edit', isEditMode: true })} 
        className="h-[58px] bg-white border-[1.5px] border-primary text-primary font-black text-base sm:text-base rounded-2xl flex items-center justify-center w-full active:scale-[0.98] transition-transform"
      >
        <Edit className="mr-2 sm:mr-2.5 w-4.5 h-4.5" /> {appLanguage === 'ms' ? 'Edit Resume Sedia Ada' : 'Edit Existing Resume'}
      </button>
    </div>
  );
}
