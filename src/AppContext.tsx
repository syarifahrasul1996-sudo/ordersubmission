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
  saveOrderToHistory: (messages: string[]) => void;
  updateOrderHistoryState: (updates: Partial<AppState>) => void;
  deleteOrderFromHistory: (id: string) => void;
  clearHistory: () => void;
  loadOrder: (state: AppState) => void;
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
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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
      return saved ? { ...INITIAL_STATE, ...JSON.parse(saved) } : INITIAL_STATE;
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

  const deleteOrderFromHistory = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('orderHistory');
  };

  const loadOrder = (savedState: AppState) => {
    setState(savedState);
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
    <AppContext.Provider value={{ state, setState, viewStack, pushView, startNewOrder, popView, goHome, reset, generatedMessages, setGeneratedMessages, history, saveOrderToHistory, updateOrderHistoryState, deleteOrderFromHistory, clearHistory, loadOrder, theme, toggleTheme, appLanguage, toggleLanguage }}>
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
