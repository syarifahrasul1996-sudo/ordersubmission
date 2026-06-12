import React, { useState } from 'react';
import { Clock, Copy, Trash2, Calendar, AlertCircle, RefreshCcw, Edit3, Save } from 'lucide-react';
import { useAppContext } from '../AppContext';

export function HistoryView() {
  const { history, clearHistory, deleteOrderFromHistory, loadOrder, pushView, appLanguage } = useAppContext();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleCopyAll = async (msgs: string[]) => {
    try {
      await navigator.clipboard.writeText(msgs.join('\n\n\n'));
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = msgs.join('\n\n\n');
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const handleClearConfirm = () => {
    clearHistory();
    setShowConfirm(false);
  };

  return (
    <div className="flex flex-col bg-background w-full pb-[calc(env(safe-area-inset-bottom)+8rem)]">
      <div className="p-4 sm:p-6 space-y-4">
        {history.length > 0 && (
          <div className="flex justify-end mb-2">
            <button 
              onClick={() => setShowConfirm(true)}
              className="flex items-center text-[13px] font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-full transition-all"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {appLanguage === 'ms' ? 'Padam Semua' : 'Delete All'}
            </button>
          </div>
        )}

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-subtext">
            <Clock className="w-16 h-16 mb-4 opacity-50" />
            <p className="font-bold">{appLanguage === 'ms' ? 'Tiada sejarah tempahan' : 'No order history'}</p>
          </div>
        ) : (
          history.filter(Boolean).map((item) => {
            const date = new Date(item.timestamp || Date.now());
            const formattedDate = date.toLocaleDateString(appLanguage === 'ms' ? 'ms-MY' : 'en-US', { 
              day: 'numeric', 
              month: 'short', 
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <div key={item.id} className="bg-surface border border-gray-100 rounded-[20px] p-4 shadow-sm flex flex-col space-y-4">
                <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                  <div>
                    <div className="flex items-center text-primary/70 text-[11px] font-black uppercase tracking-widest mb-1.5">
                      <Calendar className="w-3.5 h-3.5 mr-1" />
                      {formattedDate}
                    </div>
                    <p className="font-bold text-[16px] text-text">
                      {item.state?.mainType === 'Lain-lain' ? item.state?.customDoc : item.state?.mainType} {item.state?.isEditMode ? '(Edit)' : ''}
                    </p>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                    <button 
                      onClick={() => loadOrder(item.state)}
                      className="w-9 h-9 bg-primary/10 text-primary rounded-full flex items-center justify-center active:scale-95 transition-all"
                      title={appLanguage === 'ms' ? 'Edit' : 'Edit'}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => pushView('customer-info', item.state)}
                      className="w-9 h-9 bg-green-100 text-green-600 rounded-full flex items-center justify-center active:scale-95 transition-all"
                      title="Google Sheets"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleCopyAll(item.messages || [])}
                      className="w-9 h-9 bg-gray-100 text-text rounded-full flex items-center justify-center active:scale-95 transition-all"
                      title={appLanguage === 'ms' ? 'Salin Semua' : 'Copy All'}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => deleteOrderFromHistory(item.id)}
                      className="w-9 h-9 bg-red-100 text-red-500 rounded-full flex items-center justify-center active:scale-95 transition-all"
                      title={appLanguage === 'ms' ? 'Padam' : 'Delete'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] mt-2">
                  {item.state?.template && (
                    <div>
                      <span className="text-subtext">{appLanguage === 'ms' ? 'Templat' : 'Template'}:</span>{' '}
                      <span className="font-medium text-text">{item.state.template}</span>
                    </div>
                  )}
                  {item.state?.language && (
                    <div>
                      <span className="text-subtext">{appLanguage === 'ms' ? 'Bahasa' : 'Language'}:</span>{' '}
                      <span className="font-medium text-text">{item.state.language === 'ms' ? 'Melayu' : 'English'}</span>
                    </div>
                  )}
                  {item.state?.urgency && (
                    <div>
                      <span className="text-subtext">{appLanguage === 'ms' ? 'Kecemasan' : 'Urgency'}:</span>{' '}
                      <span className="font-medium text-text">
                        {item.state.urgency === 'super' ? 'Super Urgent' : item.state.urgency === 'semi' ? 'Semi Urgent' : 'Normal'}
                      </span>
                    </div>
                  )}
                  {item.state?.addons && item.state.addons.length > 0 && (
                    <div className="w-full">
                       <span className="text-subtext">{appLanguage === 'ms' ? 'Tambahan' : 'Add-ons'}:</span>{' '}
                       <span className="font-medium text-text">{item.state.addons.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          />
          <div className="relative bg-white rounded-[24px] p-6 w-full max-w-[320px] shadow-2xl animate-fade-in-up">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-2">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-[18px] font-bold text-text">{appLanguage === 'ms' ? 'Padam Semua Sejarah?' : 'Delete All History?'}</h3>
              <p className="text-[14px] text-subtext pb-4">
                {appLanguage === 'ms' ? 'Tindakan ini tidak boleh diundurkan. Semua rekod tempahan akan dipadam.' : 'This action cannot be undone. All order records will be deleted.'}
              </p>
              
              <div className="flex w-full space-x-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 px-4 rounded-full font-bold text-[14px] text-text bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all"
                >
                  {appLanguage === 'ms' ? 'Batal' : 'Cancel'}
                </button>
                <button
                  onClick={handleClearConfirm}
                  className="flex-1 py-3 px-4 rounded-full font-bold text-[14px] text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all"
                >
                  {appLanguage === 'ms' ? 'Padam' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
