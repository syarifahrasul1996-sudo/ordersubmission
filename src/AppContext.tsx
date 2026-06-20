import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { AppState, INITIAL_STATE, ViewType, OrderHistoryItem } from './types';

interface AppContextType {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  viewStack: ViewType[];
  pushView: (view: ViewType, updates?: Partial<AppState>) => void;
  startNewOrder: (view: ViewType, updates: Partial<AppState>) => void;
  popView: () => void;
  goHome: () => void;
  reset: () => void;
  generatedMessages: string[];
  setGeneratedMessages: (msgs: string[]) => void;
  history: OrderHistoryItem[];
  setHistory: React.Dispatch<React.SetStateAction<OrderHistoryItem[]>>;
  saveOrderToHistory: (messages: string[]) => void;
  updateOrderHistoryState: (updates: Partial<AppState>) => void;
  updateSpecificHistoryItem: (id: string, updates: Partial<AppState>) => void;
  deleteOrderFromHistory: (id: string) => void;
  clearHistory: () => void;
  loadOrder: (item: OrderHistoryItem) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  appLanguage: 'ms' | 'en';
  toggleLanguage: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('appTheme') as 'light' | 'dark';
      if (saved) return saved;
      return 'light';
    } catch {
      return 'light';
    }
  });

  const [appLanguage, setAppLanguage] = useState<'ms' | 'en'>(() => {
    try {
      const saved = localStorage.getItem('appLanguage') as 'ms' | 'en';
      if (saved) return saved;
      return 'ms';
    } catch {
      return 'ms';
    }
  });

  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem('appState');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...INITIAL_STATE,
          ...parsed,
          addons: Array.isArray(parsed.addons) ? parsed.addons : INITIAL_STATE.addons,
          clLangs: Array.isArray(parsed.clLangs) ? parsed.clLangs : INITIAL_STATE.clLangs,
          resumeLangs: Array.isArray(parsed.resumeLangs) ? parsed.resumeLangs : INITIAL_STATE.resumeLangs
        };
      }
      return INITIAL_STATE;
    } catch {
      return INITIAL_STATE;
    }
  });
  
  const [viewStack, setViewStack] = useState<ViewType[]>(() => {
    try {
      const saved = localStorage.getItem('viewStack');
      return saved ? JSON.parse(saved) : ['home'];
    } catch {
      return ['home'];
    }
  });

  const [generatedMessages, setGeneratedMessages] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('generatedMessages');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState<OrderHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('orderHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('appState', JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem('viewStack', JSON.stringify(viewStack));
  }, [viewStack]);

  useEffect(() => {
    localStorage.setItem('generatedMessages', JSON.stringify(generatedMessages));
  }, [generatedMessages]);

  useEffect(() => {
    localStorage.setItem('orderHistory', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('appTheme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark-theme-active');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark-theme-active');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('appLanguage', appLanguage);
  }, [appLanguage]);

  useEffect(() => {
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec';

    const extractId = (input: string) => {
      if (!input) return '';
      const trimmed = input.trim();
      if (trimmed.includes('docs.google.com/spreadsheets/d/')) {
        const matches = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
        return matches ? matches[1] : trimmed;
      }
      return trimmed;
    };

    const getActiveScriptUrl = (sId?: string) => {
      const globalUrl = localStorage.getItem('db_global_script_url');
      if (globalUrl && globalUrl.trim() !== '') {
        return globalUrl.trim();
      }
      const savedSheets = localStorage.getItem('db_annual_sheets');
      const annualSheets = savedSheets ? JSON.parse(savedSheets) : [];
      if (sId) {
        const targetId = extractId(sId);
        const found = annualSheets.find((s: any) => extractId(s.spreadsheetId) === targetId);
        if (found && found.scriptUrl && found.scriptUrl.trim() !== '') {
          return found.scriptUrl.trim();
        }
      }
      const firstActive = annualSheets.find((s: any) => s.scriptUrl && s.scriptUrl.trim() !== '');
      if (firstActive) {
        return firstActive.scriptUrl.trim();
      }
      return GOOGLE_SCRIPT_URL;
    };

    const jsonpRequest = (url: URL, callbackName: string): Promise<any> => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url.toString();
        script.async = true;

        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Request timeout'));
        }, 15000);

        const cleanup = () => {
          clearTimeout(timeout);
          try {
            document.body.removeChild(script);
          } catch (e) {}
          delete (window as any)[callbackName];
        };

        (window as any)[callbackName] = (data: any) => {
          cleanup();
          resolve(data);
        };

        script.onerror = () => {
          cleanup();
          reject(new Error('Script load error'));
        };

        document.body.appendChild(script);
      });
    };

    const checkAlerts = () => {
      const now = Date.now();
      const TWENTY_MINS = 20 * 60 * 1000;
      const THREE_HOURS = 3 * 60 * 60 * 1000;
      
      setHistory(prevHistory => {
        let updatedHistory = false;
        const newHistory = prevHistory.map(item => {
          const { dueTimestamp, hasNotified, hasThreeHourChecked, customerName, subType, mainType, orderId, isDelivered } = item.state;
          
          let itemUpdated = false;
          let newState = { ...item.state };

          if (dueTimestamp && !isDelivered) {
            const timeUntilDue = dueTimestamp - now;

            // 1. Check 3 hours logic: 3 hours before due time
            if (timeUntilDue <= THREE_HOURS && !hasThreeHourChecked) {
              newState.hasThreeHourChecked = true;
              itemUpdated = true;

              const spreadsheetId = item.state?.spreadsheetId || '1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo';
              const oId = item.state?.orderId;

              if (oId && spreadsheetId) {
                const callbackName = 'jsonp_auto_sync_' + Math.round(100000 * Math.random()) + '_' + item.id;
                const url = new URL(getActiveScriptUrl(spreadsheetId));
                url.searchParams.append('action', 'get_link');
                url.searchParams.append('orderId', oId);
                url.searchParams.append('spreadsheetId', spreadsheetId);
                url.searchParams.append('callback', callbackName);

                jsonpRequest(url, callbackName)
                  .then((data) => {
                    if (data && data.status === 'success' && data.link) {
                      // Update successfully and save link
                      updateSpecificHistoryItem(item.id, {
                        googleSheetLink: data.link,
                        orderLink: data.link,
                        hasThreeHourChecked: true,
                        threeHourAlerted: true
                      });
                    } else {
                      // Not updated, send custom status query notification!
                      if (!item.state.googleSheetLink || item.state.googleSheetLink.trim() === '') {
                        const notifyTitle = appLanguage === 'ms' ? 'Status Tempahan' : 'Ask Order Status';
                        const notifyBody = `${customerName || 'Customer'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`;
                        
                        try {
                          if ('Notification' in window && Notification.permission === 'granted') {
                            new Notification(notifyTitle, { body: notifyBody });
                          }
                        } catch (e) { console.warn(e); }
                      }
                      updateSpecificHistoryItem(item.id, {
                        hasThreeHourChecked: true,
                        threeHourAlerted: true
                      });
                    }
                  })
                  .catch((err) => {
                    console.warn('Auto background sync failed:', err);
                    if (!item.state.googleSheetLink || item.state.googleSheetLink.trim() === '') {
                      const notifyTitle = appLanguage === 'ms' ? 'Status Tempahan' : 'Ask Order Status';
                      const notifyBody = `${customerName || 'Customer'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`;
                      
                      try {
                        if ('Notification' in window && Notification.permission === 'granted') {
                          new Notification(notifyTitle, { body: notifyBody });
                        }
                      } catch (e) { console.warn(e); }
                    }
                    updateSpecificHistoryItem(item.id, {
                      hasThreeHourChecked: true,
                      threeHourAlerted: true
                    });
                  });
              } else {
                // No spreadsheetId or orderId, just ask for status if no link
                if (!item.state.googleSheetLink || item.state.googleSheetLink.trim() === '') {
                  const notifyTitle = appLanguage === 'ms' ? 'Status Tempahan' : 'Ask Order Status';
                  const notifyBody = `${customerName || 'Customer'} (${mainType || 'Tempahan'}) - Dah siap ke belum? Link masih belum dimasukkan.`;
                  
                  try {
                    if ('Notification' in window && Notification.permission === 'granted') {
                      new Notification(notifyTitle, { body: notifyBody });
                    }
                  } catch (e) { console.warn(e); }
                }
                newState.threeHourAlerted = true;
              }
            }

            // 2. Check 20 mins logic
            if (!hasNotified && timeUntilDue > 0 && timeUntilDue <= TWENTY_MINS) {
              const title = 'Order Due Soon!';
              const body = `Order for ${customerName || 'Customer'} (${mainType} ${subType}) is due in less than 20 minutes!`;
              
              try {
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification(title, { body });
                }
              } catch (e) { console.warn(e); }
              newState.hasNotified = true;
              itemUpdated = true;
            }
          }

          if (itemUpdated) {
            updatedHistory = true;
            return {
              ...item,
              state: newState
            };
          }
          return item;
        });

        return updatedHistory ? newHistory : prevHistory;
      });
    };

    // Ask for permission if not asked yet
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(console.warn);
      }
    } catch (e) {
      console.warn("Could not request notification permission on mount", e);
    }

    const interval = setInterval(checkAlerts, 60000); // Check every minute
    checkAlerts(); // Check right away
    
    return () => clearInterval(interval);
  }, [appLanguage]);

  useEffect(() => {
    const processOfflineQueue = async () => {
      if (!navigator.onLine) return;

      const queueStr = localStorage.getItem('db_offline_sync_queue');
      if (!queueStr) return;

      let queue: any[] = [];
      try {
        queue = JSON.parse(queueStr);
      } catch (e) {
        localStorage.removeItem('db_offline_sync_queue');
        return;
      }

      if (!Array.isArray(queue) || queue.length === 0) return;

      let remainingQueue = [...queue];
      let processedCount = 0;

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (!navigator.onLine) break;

        try {
          const response = await fetch(item.webhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(item.payload)
          });
          remainingQueue = remainingQueue.filter(q => q !== item);
          processedCount++;
        } catch (e) {
          console.warn('Failed to sync offline item', e);
        }
      }

      if (remainingQueue.length === 0) {
        localStorage.removeItem('db_offline_sync_queue');
        if (processedCount > 0) {
          try {
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(appLanguage === 'ms' ? 'Sync Selesai' : 'Sync Completed', { 
                body: appLanguage === 'ms' 
                  ? `${processedCount} rekod dari luar talian telah disync.` 
                  : `${processedCount} offline records synced.` 
              });
            }
          } catch(e) {}
        }
      } else if (remainingQueue.length !== queue.length) {
        localStorage.setItem('db_offline_sync_queue', JSON.stringify(remainingQueue));
      }
    };

    window.addEventListener('online', processOfflineQueue);
    
    // Check initially in case app loaded when online but had queue
    const timeoutId = setTimeout(processOfflineQueue, 5000);

    return () => {
      window.removeEventListener('online', processOfflineQueue);
      clearTimeout(timeoutId);
    };
  }, [appLanguage]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  const toggleLanguage = () => setAppLanguage(l => l === 'ms' ? 'en' : 'ms');

  const saveOrderToHistory = (messages: string[]) => {
    let currentId = state.historyId;
    let currentTimestamp = state.timestamp;
    
    if (!currentId) {
      currentId = Date.now().toString();
      currentTimestamp = Date.now();
    }
    
    const finalState = { ...state, historyId: currentId, timestamp: currentTimestamp };
    
    const newItem: OrderHistoryItem = {
      id: currentId,
      timestamp: currentTimestamp!,
      state: finalState,
      messages: [...messages]
    };
    
    setHistory(prev => {
      const exists = prev.find(item => item.id === currentId);
      if (exists) {
        return prev.map(item => item.id === currentId ? newItem : item);
      }
      return [newItem, ...prev];
    });
    
    setState(finalState);
  };
  
  const updateOrderHistoryState = (updates: Partial<AppState>) => {
    const finalState = { ...state, ...updates };
    setState(finalState);
    if (finalState.historyId) {
       setHistory(prev => prev.map(item => item.id === finalState.historyId ? { ...item, state: finalState } : item));
    }
  };

  const updateSpecificHistoryItem = (id: string, updates: Partial<AppState>) => {
    setHistory(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, state: { ...item.state, ...updates } };
      }
      return item;
    }));
  };

  const deleteOrderFromHistory = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('orderHistory');
  };

  const loadOrder = (item: OrderHistoryItem) => {
    setState({
      ...INITIAL_STATE,
      ...item.state,
      addons: Array.isArray(item.state?.addons) ? item.state.addons : INITIAL_STATE.addons,
      clLangs: Array.isArray(item.state?.clLangs) ? item.state.clLangs : INITIAL_STATE.clLangs,
      resumeLangs: Array.isArray(item.state?.resumeLangs) ? item.state.resumeLangs : INITIAL_STATE.resumeLangs,
      timestamp: item.timestamp,
      historyId: item.id
    });
    setViewStack(['home', 'history', 'customer-info']);
  };

  const startNewOrder = (view: ViewType, updates: Partial<AppState>) => {
    setState({ ...INITIAL_STATE, ...updates });
    setViewStack(['home', view]);
  };

  const pushView = (view: ViewType, updates?: Partial<AppState>) => {
    if (updates) {
      setState(prev => ({ ...prev, ...updates }));
    }
    setViewStack(prev => [...prev, view]);
  };

  const popView = () => {
    setViewStack(prev => {
      if (prev.length <= 1) return prev;
      return prev.slice(0, -1);
    });
  };

  const goHome = () => {
    reset();
  };

  const reset = () => {
    setState(INITIAL_STATE);
    setViewStack(['home']);
    setGeneratedMessages([]);
    localStorage.removeItem('appState');
    localStorage.removeItem('viewStack');
    localStorage.removeItem('generatedMessages');
  };

  return (
    <AppContext.Provider value={{ state, setState, viewStack, pushView, startNewOrder, popView, goHome, reset, generatedMessages, setGeneratedMessages, history, setHistory, saveOrderToHistory, updateOrderHistoryState, updateSpecificHistoryItem, deleteOrderFromHistory, clearHistory, loadOrder, theme, toggleTheme, appLanguage, toggleLanguage }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
