import React from 'react';
import { PlusCircle, Edit } from 'lucide-react';
import { useAppContext } from '../AppContext';

export function ResumeTypeView() {
  const { pushView, appLanguage } = useAppContext();

  return (
    <div className="flex flex-col p-4 sm:p-6 space-y-4 pb-[calc(env(safe-area-inset-bottom)+8rem)]">
      <button 
        onClick={() => pushView('resume-form-fields', { subType: 'New', isEditMode: false })} 
        className="h-[72px] bg-primary text-white font-black text-[16px] sm:text-[17px] rounded-[20px] flex items-center justify-center w-full shadow-xl shadow-primary/30 active:scale-[0.98] transition-transform"
      >
        <PlusCircle className="mr-2 sm:mr-3 w-5 h-5 sm:w-6 sm:h-6" /> {appLanguage === 'ms' ? 'Resume Baru' : 'New Resume'}
      </button>
      <button 
        onClick={() => pushView('resume-form-fields', { subType: 'Edit', isEditMode: true })} 
        className="h-[72px] bg-white border-[1.5px] border-primary text-primary font-black text-[16px] sm:text-[17px] rounded-[20px] flex items-center justify-center w-full active:scale-[0.98] transition-transform"
      >
        <Edit className="mr-2 sm:mr-3 w-5 h-5 sm:w-6 sm:h-6" /> {appLanguage === 'ms' ? 'Edit Resume Sedia Ada' : 'Edit Existing Resume'}
      </button>
    </div>
  );
}
