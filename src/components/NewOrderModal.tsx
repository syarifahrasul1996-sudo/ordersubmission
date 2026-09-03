import React, { useEffect } from 'react';
import { 
  FileText, 
  Mail, 
  MoreHorizontal, 
  Users, 
  X,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { useAppContext } from '../AppContext';
import { cn } from '../cn';

interface NewOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewOrderModal({ isOpen, onClose }: NewOrderModalProps) {
  const { startNewOrder, pushView, appLanguage } = useAppContext();

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const orderOptions = [
    {
      id: 'resume',
      title: 'Resume',
      subtitle: appLanguage === 'ms' 
        ? 'Resume Profesional, ATS, Infografik & Bahasa Inggeris' 
        : 'Professional, ATS, Infographic & English Resumes',
      icon: FileText,
      color: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15',
      iconColor: 'bg-primary/10 text-primary',
      onClick: () => {
        onClose();
        startNewOrder('resume-type', { mainType: 'Resume' });
      }
    },
    {
      id: 'surat',
      title: appLanguage === 'ms' ? 'Surat Rasmi / Rayuan' : 'Formal Letters & Appeals',
      subtitle: appLanguage === 'ms' 
        ? 'Surat rayuan, berhenti kerja, permohonan & rasmi' 
        : 'Appeals, resignation, applications & official letters',
      icon: Mail,
      color: 'bg-purple-500/10 text-purple-600 border-purple-500/20 hover:bg-purple-500/15',
      iconColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
      onClick: () => {
        onClose();
        startNewOrder('general-form', { mainType: 'Surat' });
      }
    },
    {
      id: 'lain-lain',
      title: appLanguage === 'ms' ? 'Lain-lain Servis' : 'Other Services',
      subtitle: appLanguage === 'ms' 
        ? 'Editing, reformat, translation & servis lain' 
        : 'Editing, formatting, translation & custom jobs',
      icon: MoreHorizontal,
      color: 'bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/15',
      iconColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      onClick: () => {
        onClose();
        startNewOrder('general-form', { mainType: 'Lain-lain' });
      }
    },
    {
      id: 'customer-info',
      title: appLanguage === 'ms' ? 'Maklumat Pelanggan' : 'Customer Info Form',
      subtitle: appLanguage === 'ms' 
        ? 'Borang pendaftaran & data maklumat pelanggan' 
        : 'Client registration form & details',
      icon: Users,
      color: 'bg-teal-500/10 text-teal-600 border-teal-500/20 hover:bg-teal-500/15',
      iconColor: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
      onClick: () => {
        onClose();
        pushView('customer-info');
      }
    }
  ];

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end md:items-center justify-center z-50 animate-fade-in p-0 md:p-4"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[500px] bg-white dark:bg-[#1C1C1E] rounded-t-[32px] md:rounded-3xl p-5 md:p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:pb-6 space-y-4 animate-slide-up md:animate-scale-in shadow-2xl border border-gray-100 dark:border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="font-black text-base md:text-lg text-text">
                {appLanguage === 'ms' ? 'Tambah Tempahan Baru' : 'Create New Order'}
              </h3>
            </div>
            <p className="text-xs text-subtext font-medium">
              {appLanguage === 'ms' ? 'Pilih jenis perkhidmatan yang ingin dibuat:' : 'Select which service category to create:'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full flex items-center justify-center text-text active:scale-90 transition-all cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Options List */}
        <div className="grid grid-cols-1 gap-2.5 pt-1">
          {orderOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={opt.onClick}
                className="flex items-center justify-between p-3.5 bg-gray-50/70 hover:bg-gray-100/80 dark:bg-zinc-900/50 dark:hover:bg-zinc-800/80 border border-gray-100 dark:border-zinc-800 rounded-2xl text-left transition-all active:scale-[0.98] cursor-pointer group"
              >
                <div className="flex items-center gap-3.5">
                  <div className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform",
                    opt.iconColor
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-text flex items-center gap-1.5">
                      {opt.title}
                    </h4>
                    <p className="text-xs text-subtext line-clamp-1 mt-0.5 font-normal">
                      {opt.subtitle}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-subtext/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
