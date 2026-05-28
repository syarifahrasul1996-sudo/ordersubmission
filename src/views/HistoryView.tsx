import React, { useState } from 'react';
import { Clock, Copy, Trash2, Calendar, AlertCircle, RefreshCcw } from 'lucide-react';
import { useAppContext } from '../AppContext';

export function HistoryView() {
  const { history, clearHistory, loadOrder, appLanguage } = useAppContext();
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
    <div className="flex flex-col h-full bg-background absolute inset-0 z-50 overflow-y-auto">
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
          history.map((item) => {
            const date = new Date(item.timestamp);
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
                      {item.state.mainType === 'Lain-lain' ? item.state.customDoc : item.state.mainType} {item.state.isEditMode ? '(Edit)' : ''}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0 ml-2">
                    <button 
                      onClick={() => loadOrder(item.state)}
                      className="flex items-center h-10 px-3.5 bg-primary/10 text-primary font-bold text-[12px] sm:text-[13px] rounded-full active:scale-95 transition-all md:hover:bg-primary/20"
                      title={appLanguage === 'ms' ? 'Guna Semula' : 'Reuse'}
                    >
                      <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                      {appLanguage === 'ms' ? 'Guna Semula' : 'Reuse'}
                    </button>
                    <button 
                      onClick={() => handleCopyAll(item.messages)}
                      className="w-10 h-10 bg-gray-50 border border-gray-200 rounded-full flex items-center justify-center text-text active:scale-95 transition-all shadow-sm md:hover:bg-gray-100"
                      title={appLanguage === 'ms' ? 'Salin Semua' : 'Copy All'}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {item.messages.map((msg, i) => (
                    <div key={i} className="bg-gray-50 rounded-[12px] p-3 text-[13px] text-text whitespace-pre-wrap font-medium">
                      {msg}
                    </div>
                  ))}
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
