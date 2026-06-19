import React, { useState, useEffect } from 'react';
import { Clock, Copy, Trash2, Calendar, AlertCircle, RefreshCcw, Save } from 'lucide-react';
import { useAppContext } from '../AppContext';

const formatCustomerName = (name?: string) => {
  if (!name) return '';
  const words = name.trim().split(/\s+/).slice(0, 2);
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

export function HistoryView() {
  const { history, clearHistory, deleteOrderFromHistory, loadOrder, pushView, appLanguage, updateSpecificHistoryItem } = useAppContext();
  const [showConfirm, setShowConfirm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [startY, setStartY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleSyncLink = async (e: React.MouseEvent, item: any) => {
    e.stopPropagation();
    if (!item.state.orderId || !item.state.spreadsheetId) {
      alert(appLanguage === 'ms' ? 'Kekurangan Order ID atau Spreadsheet ID.' : 'Missing Order ID or Spreadsheet ID.');
      return;
    }
    
    setSyncingId(item.id);
    const webhookUrl = 'https://script.google.com/macros/s/AKfycbzK2tjLkKaFaVFMIsgPZSj4ZtI26fD7rnqJAc7NKBTI932kOCWZzVBo6l6ezbyjxZw51A/exec';
    const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
    
    const url = new URL(webhookUrl);
    url.searchParams.append("action", "get_link");
    url.searchParams.append("orderId", item.state.orderId);
    url.searchParams.append("spreadsheetId", item.state.spreadsheetId);
    url.searchParams.append("callback", callbackName);

    const script = document.createElement('script');
    script.src = url.toString();
    script.async = true;

    // Create a promise to handle the JSONP response
    const jsonpPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Request timed out. Please check your Google Apps Script deployment.'));
        cleanup();
      }, 15000); // 15 seconds timeout

      (window as any)[callbackName] = (data: any) => {
        clearTimeout(timeoutId);
        resolve(data);
        cleanup();
      };

      script.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error('Failed to fetch'));
        cleanup();
      };

      const cleanup = () => {
        delete (window as any)[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      };
    });

    document.body.appendChild(script);

    try {
      const data: any = await jsonpPromise;
      
      if (data.status === "success" && data.link) {
        updateSpecificHistoryItem(item.id, { googleSheetLink: data.link });
        alert(appLanguage === 'ms' ? 'Pautan berjaya dikemaskini!' : 'Link successfully updated!');
      } else if (data.status === "success") {
        alert(appLanguage === 'ms' ? 'Tiada pautan dijumpai dalam rekod Google Sheet.' : 'No link found in the Google Sheet record.');
      } else {
        alert("Error: " + (data.message || 'Unknown error'));
      }
    } catch(err) {
      console.error(err);
      let errMsg = String(err);
      if (errMsg.includes('Failed to fetch')) {
        errMsg = appLanguage === 'ms' 
          ? 'Gagal menyegerak: Google Apps Script tidak dapat dihubungi. Sila pastikan anda telah mengemas kini kod Google Apps Script dengan fungsi doGet dan Deploy versi baru. Rujuk "Panduan Setup Google Sheet".' 
          : 'Failed to sync: Unable to reach Google Apps Script. Please make sure you have updated the script with the doGet function and deployed a new version. Refer to the "Google Sheet Setup Guide".';
      }
      alert(errMsg);
    } finally {
      setSyncingId(null);
    }
  };

  // Pull to refresh logic
  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 0) {
      setStartY(e.touches[0].clientY);
      setIsPulling(true);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || refreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    
    if (diff > 0) {
      setPullProgress(Math.min(diff * 0.5, 80));
    } else {
      setPullProgress(0);
    }
  };

  const onTouchEnd = () => {
    if (!isPulling) return;
    setIsPulling(false);
    
    if (pullProgress >= 60) {
      setRefreshing(true);
      setPullProgress(60);
      setTimeout(() => {
        setRefreshing(false);
        setPullProgress(0);
      }, 1000); // Simulate network refresh delay
    } else {
      setPullProgress(0);
    }
  };

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
    <div 
      className="flex flex-col bg-background w-full min-h-screen pb-[calc(env(safe-area-inset-bottom)+8rem)] overscroll-y-contain"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div 
        className="w-full flex items-center justify-center overflow-hidden"
        style={{ 
          height: `${pullProgress}px`,
          transition: isPulling && !refreshing ? 'none' : 'height 0.3s ease-out'
        }}
      >
        <div 
          className="flex items-center justify-center w-8 h-8 rounded-full bg-surface shadow-sm text-subtext"
          style={{
            transform: refreshing ? 'none' : `rotate(${pullProgress * 4}deg)`,
            opacity: pullProgress / 40 > 1 ? 1 : pullProgress / 40
          }}
        >
          <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin text-primary' : ''}`} />
        </div>
      </div>

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
              <div 
                key={item.id} 
                onClick={() => loadOrder(item)}
                className="bg-surface border border-gray-100 rounded-[16px] p-2.5 shadow-sm flex flex-col space-y-1 cursor-pointer hover:bg-gray-50 active:scale-[0.99] transition-all"
              >
                <div className="flex justify-between items-start border-b border-gray-100 pb-1.5">
                  <div>
                    <div className="flex items-center text-primary/70 text-[10px] font-black uppercase tracking-widest mb-0.5">
                      <Calendar className="w-3 h-3 mr-1" />
                      {formattedDate}
                    </div>
                    <p className="font-bold text-[14px] leading-tight text-text">
                      {item.state?.mainType === 'Lain-lain' ? item.state?.customDoc : item.state?.mainType} {item.state?.isEditMode ? '(Edit)' : ''}
                      {item.state?.customerName ? ` - ${formatCustomerName(item.state.customerName)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); pushView('customer-info', { ...item.state, timestamp: item.timestamp, historyId: item.id }); }}
                      className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center active:scale-95 transition-all"
                      title="Google Sheets"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleCopyAll(item.messages || []); }}
                      className="w-8 h-8 bg-gray-100 text-text rounded-full flex items-center justify-center active:scale-95 transition-all"
                      title={appLanguage === 'ms' ? 'Salin Semua' : 'Copy All'}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteOrderFromHistory(item.id); }}
                      className="w-8 h-8 bg-red-100 text-red-500 rounded-full flex items-center justify-center active:scale-95 transition-all"
                      title={appLanguage === 'ms' ? 'Padam' : 'Delete'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] mt-1.5 leading-snug">
                  {item.state?.template && (
                    <div>
                      <span className="text-subtext">{appLanguage === 'ms' ? 'Templat' : 'Template'}:</span>{' '}
                      <span className="font-medium text-text">{item.state.template}</span>
                    </div>
                  )}
                  {(() => {
                    const isNewResume = item.state?.mainType === 'Resume' && !item.state?.isEditMode;
                    const isSurat = item.state?.mainType === 'Surat';
                    const displayBahasa = item.state?.customerBahasa ? item.state.customerBahasa : ((isNewResume || isSurat) ? (item.state?.resumeLangs?.join(' & ') || '') : '');
                    
                    if (!displayBahasa) return null;
                    return (
                      <div>
                        <span className="text-subtext">{appLanguage === 'ms' ? 'Bahasa' : 'Language'}:</span>{' '}
                        <span className="font-medium text-text">{displayBahasa}</span>
                      </div>
                    );
                  })()}
                  {item.state?.urgency && (
                    <div>
                      <span className="text-subtext">{appLanguage === 'ms' ? 'Jenis' : 'Type'}:</span>{' '}
                      <span className="font-medium text-text">
                        {item.state.urgency === 'super' ? 'Super Urgent' : item.state.urgency === 'urgent' ? 'Urgent' : item.state.urgency === 'semi' ? 'Semi Urgent' : 'Tidak Urgent'}
                      </span>
                    </div>
                  )}
                  {item.state?.addons && item.state.addons.length > 0 && (
                    <div className="w-full">
                       <span className="text-subtext">{appLanguage === 'ms' ? 'Tambahan' : 'Add-ons'}:</span>{' '}
                       <span className="font-medium text-text">{item.state.addons.join(', ')}</span>
                    </div>
                  )}
                  {item.state?.orderId && (
                    <div className="w-full flex items-center justify-between pt-1">
                      <div className="flex-1 truncate mr-2">
                        <span className="text-subtext">Link:</span>{' '}
                        {item.state.googleSheetLink ? (
                          <div className="flex flex-col gap-1">
                            {item.state.googleSheetLink.split(/[\n,]+/).filter(Boolean).map((link, idx) => (
                              <a key={idx} href={link.trim()} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline font-medium truncate inline-block max-w-[200px] sm:max-w-[300px]" onClick={(e) => e.stopPropagation()} title={link.trim()}>
                                {link.trim()}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic font-medium">{appLanguage === 'ms' ? 'Belum dimasukkan' : 'Not entered'}</span>
                        )}
                      </div>
                      <button 
                        onClick={(e) => handleSyncLink(e, item)}
                        disabled={syncingId === item.id}
                        className="shrink-0 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-text p-1.5 rounded-full transition-all disabled:opacity-50"
                        title={appLanguage === 'ms' ? 'Segerak Link dari Google Sheet' : 'Sync Link from Google Sheet'}
                      >
                        <RefreshCcw className={`w-3.5 h-3.5 ${syncingId === item.id ? 'animate-spin text-primary' : ''}`} />
                      </button>
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
