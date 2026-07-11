import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList, CartesianGrid } from 'recharts';
import { RefreshCcw, AlertCircle, X, ChevronDown } from 'lucide-react';
import { parseDateStringToTimestamp } from '../utils';
import { getOrderDueTimestamp } from '../utils/orderWindow';
import { AppState } from '../types';

// Pure helper functions
const normalizeBoolean = (value: unknown): boolean => {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    String(value ?? '').trim().toLowerCase() === 'true'
  );
};

const normalizePhone = (value: unknown): string => {
  let phone = String(value ?? '').replace(/\D/g, '');

  if (phone.startsWith('60')) {
    phone = `0${phone.slice(2)}`;
  }

  return phone;
};

const normalizeName = (value: unknown): string => {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

const parseMoney = (value: unknown): number => {
  if (value === undefined || value === null) return 0;
  let str = String(value).trim();
  if (!str) return 0;
  // Remove RM prefix (case-insensitive)
  str = str.replace(/RM/gi, '');
  // Remove commas used as thousands separators
  str = str.replace(/,/g, '');
  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? parsed : 0;
};

type UrgencyKey = 'normal' | 'semi' | 'urgent' | 'super';

const getUrgencyKey = (value: unknown): UrgencyKey => {
  const str = String(value ?? '').trim().toLowerCase();
  if (
    str === 'super' ||
    str === 'super urgent' ||
    str === 'super-urgent'
  ) {
    return 'super';
  }
  if (
    str === 'semi' ||
    str === 'semi urgent' ||
    str === 'semi-urgent' ||
    str === 'semu urgent'
  ) {
    return 'semi';
  }
  if (str === 'urgent') {
    return 'urgent';
  }
  return 'normal';
};

const getCanonicalCustomerKey = (order: any): string | null => {
  const phone = normalizePhone(order.customerPhone || order.phone);
  if (phone) return `phone:${phone}`;

  const name = normalizeName(order.customerName || order.name);
  if (name) return `name:${name}`;

  return null;
};

const getNormalizedCategory = (order: any): string => {
  let cat = '';
  if (order.mainType) {
    cat = String(order.mainType).trim();
  } else if (order.customerOrder) {
    cat = String(order.customerOrder).trim();
  } else if (order.order) {
    cat = String(order.order).trim();
  } else if (order.jenisTempahan) {
    cat = String(order.jenisTempahan).trim();
  }

  if (!cat) return 'unknown';

  const lowerCat = cat.toLowerCase();
  if (['lain2', 'lain-lain', 'lain lain', 'others', 'other'].includes(lowerCat)) {
    let customVal = '';
    if (order.customerOrder && !['lain2', 'lain-lain', 'lain lain', 'others', 'other'].includes(String(order.customerOrder).trim().toLowerCase())) {
      customVal = String(order.customerOrder).trim();
    } else if (order.order && !['lain2', 'lain-lain', 'lain lain', 'others', 'other'].includes(String(order.order).trim().toLowerCase())) {
      customVal = String(order.order).trim();
    } else if (order.jenisTempahan && !['lain2', 'lain-lain', 'lain lain', 'others', 'other'].includes(String(order.jenisTempahan).trim().toLowerCase())) {
      customVal = String(order.jenisTempahan).trim();
    }
    
    if (customVal) return customVal;
    return 'other';
  }

  return cat;
};

interface SafeResponsiveContainerProps {
  children: React.ReactElement;
}

function SafeResponsiveContainer({ children }: SafeResponsiveContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      
      const { width, height } = entries[0].contentRect;
      
      setDimensions({
        width: Math.max(1, Math.floor(width)),
        height: Math.max(1, Math.floor(height || containerRef.current?.clientHeight || 200)),
      });
    });

    resizeObserver.observe(containerRef.current);

    const initialWidth = containerRef.current.clientWidth;
    const initialHeight = containerRef.current.clientHeight;
    if (initialWidth > 0 && initialHeight > 0) {
      setDimensions({
        width: initialWidth,
        height: initialHeight,
      });
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[50px] relative" style={{ minWidth: 1, minHeight: 1 }}>
      {dimensions.width > 0 && dimensions.height > 0 ? (
        <ResponsiveContainer width={dimensions.width} height={dimensions.height}>
          {children}
        </ResponsiveContainer>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
          Loading...
        </div>
      )}
    </div>
  );
}

export function DashboardView() {
  const { appLanguage, pushView, history, syncOrders, isSyncing, deletedOrderIds } = useAppContext();
  
  const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
  const [filterMonth, setFilterMonth] = useState<string>(
    String(new Date().getMonth() + 1).padStart(2, '0')
  );
  
  const annualSheets = useMemo(() => {
    try {
      const saved = localStorage.getItem('db_annual_sheets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }

    return [
      {
        year: '2024',
        spreadsheetId: '1B9zdWXVLnvj0jNNVnKxcb6cJnS1VLCIdB4j-RR3wOlg',
        scriptUrl: ''
      },
      {
        year: '2025',
        spreadsheetId: '1myU9apnYWWtU3snnCw14qI6ZS05i4DY6oOswLz1sCwo',
        scriptUrl: ''
      },
      {
        year: '2026',
        spreadsheetId: '1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo',
        scriptUrl: ''
      }
    ];
  }, []);

  const stats = useMemo(() => {
    // 1. Remove deleted and draft orders first
    const activeHistoryItems = history.filter(Boolean).filter((item) => {
      if (!item || !item.state) return false;
      const state = item.state as any;
      if (normalizeBoolean(state.isDeleted)) return false;
      if (state.syncStatus === 'draft' || state.status === 'draft') return false;

      // Filter out empty orders
      const hasName = String(state?.customerName || state?.name || '').trim();
      const hasOrder = String(state?.customerOrder || state?.order || state?.jenisTempahan || state?.mainType || '').trim();
      const hasPhone = String(state?.customerPhone || state?.phone || '').trim();
      if (!hasName && !hasOrder && !hasPhone) return false;

      if (deletedOrderIds) {
        if (deletedOrderIds.includes(item.id)) return false;
        if (state.orderId && deletedOrderIds.includes(state.orderId)) return false;
      }
      return true;
    });

    // 2. Deduplicate orders using Priority and Map
    const deduplicatedMap = new Map<string, typeof history[0]>();
    
    activeHistoryItems.forEach(item => {
      const state = item.state;
      let key = '';
      if (state.orderId) {
        key = `orderId:${state.orderId}`;
      } else if (item.id) {
        key = `historyId:${item.id}`;
      } else {
        const phone = normalizePhone(state.customerPhone || state.phone);
        const name = normalizeName(state.customerName || state.name);
        const clientIdent = phone || name || 'unknown';
        const dueVal = String(state.customerDue || state.due || '').trim();
        const orderType = normalizeName(state.customerOrder || state.order || state.jenisTempahan || state.mainType || '');
        key = `fallback:${clientIdent}_${dueVal}_${orderType}`;
      }

      const existing = deduplicatedMap.get(key);
      if (existing) {
        const currentTs = Number(item.timestamp) || 0;
        const existingTs = Number(existing.timestamp) || 0;
        if (currentTs > existingTs) {
          deduplicatedMap.set(key, item);
        }
      } else {
        deduplicatedMap.set(key, item);
      }
    });

    // 3. Normalize orders
    const normalizedOrders = Array.from(deduplicatedMap.values()).map(item => {
      const state = item.state as any || {};
      const dueResult = getOrderDueTimestamp(item);
      const isDueVal = dueResult !== null && Number.isFinite(dueResult) && dueResult > 0;
      
      let computedTimestamp = Number(item.timestamp) || 0;
      const orderIdToParse = state.orderId || item.id;
      if (!computedTimestamp && orderIdToParse && typeof orderIdToParse === 'string' && orderIdToParse.startsWith('ORD-')) {
        const parts = orderIdToParse.split('-');
        if (parts.length >= 3) {
          const datePart = parts[1]; 
          const timePart = parts[2];
          if (datePart.length === 8 && timePart.length >= 6) {
            const yyyy = parseInt(datePart.substring(0, 4), 10);
            const MM = parseInt(datePart.substring(4, 6), 10) - 1;
            const dd = parseInt(datePart.substring(6, 8), 10);
            const hh = parseInt(timePart.substring(0, 2), 10);
            const mm = parseInt(timePart.substring(2, 4), 10);
            const ss = parseInt(timePart.substring(4, 6), 10);
            computedTimestamp = new Date(yyyy, MM, dd, hh, mm, ss).getTime();
          }
        }
      }
      
      if (!computedTimestamp && isDueVal) {
        computedTimestamp = dueResult;
      }
      
      return {
        ...state,
        historyId: item.id,
        historyTimestamp: computedTimestamp,
        analysisDueTimestamp: isDueVal ? dueResult : null,
        isDueInvalid: !isDueVal
      };
    });

    // 4. Create analysis datasets
    const filterByDate = (orders: typeof normalizedOrders, useDue: boolean) => {
      return orders.filter(order => {
        const timestamp = useDue ? order.analysisDueTimestamp : order.historyTimestamp;
        if (!timestamp) return false;

        const date = new Date(timestamp);
        if (filterYear !== 'all' && String(date.getFullYear()) !== filterYear) return false;
        if (filterMonth !== 'all' && String(date.getMonth() + 1).padStart(2, '0') !== filterMonth) return false;
        return true;
      });
    };

    const businessOrders = filterByDate(normalizedOrders, false); // By Order Date
    const workloadOrders = filterByDate(normalizedOrders, true);   // By Due Date

    // 5. Calculate Metrics (Business by Order Date)
    const globalCustomerCounts = new Map<string, number>();
    normalizedOrders.forEach(order => {
      const key = getCanonicalCustomerKey(order);
      if (key) globalCustomerCounts.set(key, (globalCustomerCounts.get(key) || 0) + 1);
    });

    const isGloballyRepeat = (key: string): boolean => (globalCustomerCounts.get(key) || 0) >= 2;

    const periodCustomerKeys = new Set<string>();
    businessOrders.forEach(order => {
      const key = getCanonicalCustomerKey(order);
      if (key) periodCustomerKeys.add(key);
    });

    const totalUniqueCustomers = periodCustomerKeys.size;
    let repeatCustomers = 0;
    periodCustomerKeys.forEach(key => { if (isGloballyRepeat(key)) repeatCustomers++; });
    const newCustomers = totalUniqueCustomers - repeatCustomers;

    const totalOrders = businessOrders.length;
    const totalIncome = businessOrders.reduce((sum, order) => sum + parseMoney(order.price), 0);

    // 6. Metrics (Workload by Due Date)
    const completedOrdersWorkload = workloadOrders.filter(order => normalizeBoolean(order.isDelivered)).length;
    const pendingOrdersWorkload = workloadOrders.length - completedOrdersWorkload;

    // 7. Categories & Urgency (By Order Date)
    const categoryMap = new Map<string, number>();
    businessOrders.forEach(order => {
      const cat = getNormalizedCategory(order);
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    });

    const typesChart = Array.from(categoryMap.entries())
      .map(([name, value]) => ({
        name: name === 'other' ? (appLanguage === 'ms' ? 'Lain-lain' : 'Others') : name === 'unknown' ? (appLanguage === 'ms' ? 'Tidak Diketahui' : 'Unknown') : name,
        value
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const urgencyMap = new Map<UrgencyKey, number>();
    ['normal', 'semi', 'urgent', 'super'].forEach(k => urgencyMap.set(k as UrgencyKey, 0));
    businessOrders.forEach(o => {
      const uKey = getUrgencyKey(o.customerJenis || o.jenis || o.urgency);
      urgencyMap.set(uKey, (urgencyMap.get(uKey) || 0) + 1);
    });

    const urgencyChart = Object.entries({
      normal: { en: 'Not Urgent', ms: 'Tak Urgent' },
      semi: { en: 'Semi Urgent', ms: 'Semi Urgent' },
      urgent: { en: 'Urgent', ms: 'Urgent' },
      super: { en: 'Super Urgent', ms: 'Super Urgent' }
    }).map(([key, labelObj]) => ({
      name: appLanguage === 'ms' ? labelObj.ms : labelObj.en,
      value: urgencyMap.get(key as UrgencyKey) || 0
    })).sort((a, b) => b.value - a.value);

    // 8. Order Chart Data (By Order Date)
    const availableYearsSet = new Set<string>();
    annualSheets.forEach((s: any) => s.year && availableYearsSet.add(s.year));
    normalizedOrders.forEach(order => availableYearsSet.add(String(new Date(order.historyTimestamp).getFullYear())));
    if (filterYear !== 'all') availableYearsSet.add(filterYear);

    const yearCounts = new Map<string, number>();
    const monthCounts = new Map<string, number>();
    for (let i = 1; i <= 12; i++) monthCounts.set(String(i).padStart(2, '0'), 0);
    const dayCounts = new Map<string, number>();
    if (filterYear !== 'all' && filterMonth !== 'all') {
      const numDays = new Date(parseInt(filterYear, 10), parseInt(filterMonth, 10), 0).getDate();
      for (let i = 1; i <= numDays; i++) dayCounts.set(String(i).padStart(2, '0'), 0);
    }

    businessOrders.forEach(order => {
      const date = new Date(order.historyTimestamp);
      const yStr = String(date.getFullYear());
      const mStr = String(date.getMonth() + 1).padStart(2, '0');
      const dStr = String(date.getDate()).padStart(2, '0');

      if (filterYear === 'all') yearCounts.set(yStr, (yearCounts.get(yStr) || 0) + 1);
      else if (filterMonth === 'all') monthCounts.set(mStr, (monthCounts.get(mStr) || 0) + 1);
      else if (dayCounts.has(dStr)) dayCounts.set(dStr, (dayCounts.get(dStr) || 0) + 1);
    });

    const months = appLanguage === 'ms' ? ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const ordersChartData = filterYear === 'all'
      ? Array.from(yearCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([name, value]) => ({ name, value }))
      : filterMonth === 'all'
        ? Array.from(monthCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([mStr, value]) => ({ name: months[parseInt(mStr, 10) - 1], value }))
        : Array.from(dayCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([name, value]) => ({ name, value }));

    return {
      totalUniqueOrders: totalOrders,
      totalIncome,
      totalUniqueCustomers,
      repeatCustomers,
      repeatCustomerRate: totalUniqueCustomers > 0 ? ((repeatCustomers / totalUniqueCustomers) * 100).toFixed(1) : '0.0',
      completedOrdersWorkload,
      pendingOrdersWorkload,
      ordersByMonth: ordersChartData,
      customerTypes: [
        { name: appLanguage === 'ms' ? 'Baru' : 'New', value: newCustomers },
        { name: appLanguage === 'ms' ? 'Berulang' : 'Repeat', value: repeatCustomers }
      ],
      typesChart,
      urgencyChart,
      years: Array.from(availableYearsSet).sort().reverse(),
      months,
      invalidDatesCount: normalizedOrders.filter(o => o.isDueInvalid).length,
      invalidOrdersList: normalizedOrders.filter(o => o.isDueInvalid)
    };
  }, [appLanguage, filterYear, filterMonth, annualSheets, history, deletedOrderIds]);

  const [showInvalidModal, setShowInvalidModal] = useState(false);

  const handleOrderClick = (order: any) => {
    const dueValue = String(
      order.customerDue ||
      order.due ||
      ''
    ).trim();

    const { timestamp: parsedDueTimestamp } =
      parseDateStringToTimestamp(dueValue, -1);

    const isDueInvalid =
      !dueValue ||
      parsedDueTimestamp === -1 ||
      !Number.isFinite(parsedDueTimestamp) ||
      parsedDueTimestamp <= 0;

    const orderType = (
      order.customerOrder ||
      order.order ||
      order.jenisTempahan ||
      order.mainType ||
      ''
    ).trim();

    const normUrgency = getUrgencyKey(order.customerJenis || order.jenis || order.urgency);

    const updates: Partial<AppState> = {
      customerName: order.customerName || order.name || '',
      customerPhone: order.customerPhone || order.phone || '',
      customerOrder: order.customerOrder || order.order || order.jenisTempahan || '',
      customerTemplate: order.customerTemplate || order.template || '',
      customerBahasa: order.customerBahasa || order.bahasa || '',
      customerAddOn: order.customerAddOn || order.addOn || order.addon || '',
      customerJenis: order.customerJenis || order.jenis || order.urgency || '',
      customerDue: order.customerDue || order.due || '',
      mainType: order.mainType || (orderType === 'Edit Resume' ? 'Resume' : orderType === 'Surat' ? 'Surat' : orderType === 'Edit PDF' ? 'Edit PDF' : orderType === 'Lain2' || orderType === 'Lain-lain' ? 'Lain-lain' : 'Resume'),
      subType: order.subType || order.pakej || '',
      urgency: normUrgency,
      dueTimestamp: isDueInvalid ? 0 : parsedDueTimestamp,
      spreadsheetId: order.spreadsheetId || '',
      orderId: order.orderId || '',
      googleSheetLink: order.googleSheetLink || order.orderLink || order.link || '',
      isEditMode: orderType === 'Edit Resume' || order.isEditMode === true || order.isEditMode === 'true',
      isDueInvalid: isDueInvalid,
      dashboardFilterMonth: filterMonth,
      dashboardFilterYear: filterYear,
      addons: order.addons || [],
      customDoc: order.customDoc || '',
      clLangs: order.clLangs || [],
      resumeLangs: order.resumeLangs || [],
      softcopyLang: order.softcopyLang || ''
    };

    pushView('customer-info', updates);
    setShowInvalidModal(false);
  };

  const COLORS = ['#0A84FF', '#34C759', '#FF9F0A', '#FF453A', '#BF5AF2', '#64D2FF'];

  return (
    <>
      {/* Invalid Dates Modal */}
      {showInvalidModal && (
        <div className="fixed inset-0 z-[999] flex items-start justify-center p-4 pt-10 sm:pt-20">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setShowInvalidModal(false)}
          />
          <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl relative flex flex-col max-h-[85vh] overflow-hidden border border-gray-200 animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
              <h3 className="font-black text-text uppercase tracking-wider text-sm">
                {appLanguage === 'ms' ? 'Order Dengan Tarikh Tidak Sah' : 'Orders with Invalid Dates'}
              </h3>
              <button 
                onClick={() => setShowInvalidModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 bg-gray-50/30">
              <p className="text-xs text-gray-500 leading-relaxed mb-4">
                {appLanguage === 'ms' 
                  ? 'Berikut adalah order dengan format tarikh yang tidak dapat diproses. Klik pada order untuk melihat Format Maklumat Pelanggan.'
                  : 'Below are orders with date formats that cannot be processed. Click on an order to view its Customer Info Format.'}
              </p>
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                {stats.invalidOrdersList.map((order, idx) => (
                  <button 
                    key={order.orderId || order.historyId || `${normalizePhone(order.customerPhone || order.phone)}-${idx}`} 
                    onClick={() => handleOrderClick(order)}
                    className="w-full text-left p-4 hover:bg-primary/5 transition-all group border-none outline-none"
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="font-bold text-sm text-text group-hover:text-primary transition-colors">
                        {order.customerName || order.name || 'Anonymous'}
                      </span>
                      <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                        {order.customerOrder || order.order || order.jenisTempahan || order.mainType || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-subtext">
                      <span className="font-medium">{order.customerPhone || order.phone || '-'}</span>
                      <div className="flex items-center text-amber-600 font-bold uppercase tracking-tighter text-[10px]">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {appLanguage === 'ms' ? 'Format Tarikh Salah' : 'Wrong Date Format'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-white shrink-0">
              <button 
                onClick={() => setShowInvalidModal(false)}
                className="w-full h-11 bg-surface border border-gray-200 text-text font-bold rounded-xl active:scale-95 transition-all text-sm shadow-sm"
              >
                {appLanguage === 'ms' ? 'Tutup' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col p-4 sm:p-6 space-y-6 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] max-w-7xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-2">
          <div>
            <h2 className="text-2xl font-black text-text tracking-tighter">
              {appLanguage === 'ms' ? 'Tinjauan Perniagaan (Ikut Tarikh Order)' : 'Business Overview (By Order Date)'}
            </h2>
          </div>
          
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">
            <button
              onClick={() => syncOrders()}
              disabled={isSyncing}
              className={`h-10 w-10 shrink-0 rounded-xl font-bold border border-gray-200 flex items-center justify-center transition-all ${
                isSyncing ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'bg-surface hover:bg-gray-50 active:scale-95 text-text'
              }`}
              title={appLanguage === 'ms' ? 'Muat Semula' : 'Refresh'}
            >
              <RefreshCcw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
            
            <div className="relative flex-1 sm:flex-none">
              <select 
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="w-full h-10 bg-surface border border-gray-100/50 text-text text-sm font-bold rounded-xl pl-3 pr-8 outline-none focus:border-primary/50 focus:ring-2 ring-primary/20 cursor-pointer shadow-sm appearance-none transition-all"
              >
                <option value="all">{appLanguage === 'ms' ? 'Semua Masa' : 'All Time'}</option>
                {stats.years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <div className="absolute top-0 right-2.5 h-full flex items-center pointer-events-none">
                <ChevronDown className="w-4 h-4 text-subtext" />
              </div>
            </div>
            
            {filterYear !== 'all' && (
              <div className="relative w-full sm:w-auto sm:flex-none">
                <select 
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="w-full h-10 bg-surface border border-gray-100/50 text-text text-sm font-bold rounded-xl pl-3 pr-8 outline-none focus:border-primary/50 focus:ring-2 ring-primary/20 cursor-pointer shadow-sm appearance-none transition-all"
                >
                  <option value="all">{appLanguage === 'ms' ? 'Sepanjang Tahun' : 'Whole Year'}</option>
                  {stats.months.map((month, idx) => {
                    const mVal = String(idx + 1).padStart(2, '0');
                    return <option key={mVal} value={mVal}>{month}</option>;
                  })}
                </select>
                <div className="absolute top-0 right-2.5 h-full flex items-center pointer-events-none">
                  <ChevronDown className="w-4 h-4 text-subtext" />
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-surface border border-gray-100 rounded-xl p-3 shadow-sm flex flex-col justify-center">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5 truncate">{appLanguage === 'ms' ? 'Pendapatan (RM)' : 'Total Income (RM)'}</p>
            <p className="text-2xl font-black text-emerald-600">{stats.totalIncome.toFixed(2)}</p>
          </div>
          
          <div className="bg-surface border border-gray-100 rounded-xl p-3 shadow-sm flex flex-col justify-center">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5 truncate">{appLanguage === 'ms' ? 'Jumlah Order' : 'Total Orders'}</p>
            <p className="text-2xl font-black text-text">{stats.totalUniqueOrders}</p>
          </div>
        </div>
          
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-surface border border-gray-100 rounded-xl p-3 shadow-sm flex flex-col justify-center">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5 truncate">{appLanguage === 'ms' ? 'Pelanggan Unik' : 'Unique Customers'}</p>
            <p className="text-2xl font-black text-text">{stats.totalUniqueCustomers}</p>
          </div>

          <div className="bg-surface border border-gray-100 rounded-xl p-3 shadow-sm flex flex-col justify-center">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5 truncate">{appLanguage === 'ms' ? 'Berulang' : 'Repeat Customers'}</p>
            <p className="text-2xl font-black text-text">{stats.repeatCustomers}</p>
          </div>

          <div className="bg-surface border border-gray-100 rounded-xl p-3 shadow-sm flex flex-col justify-center relative overflow-hidden">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-0.5 truncate">{appLanguage === 'ms' ? 'Kadar Ulangan' : 'Repeat Rate'}</p>
            <p className="text-2xl font-black text-primary">{stats.repeatCustomerRate}%</p>
          </div>
        </div>


        
        {stats.invalidDatesCount > 0 && (
          <button 
            onClick={() => setShowInvalidModal(true)}
            className="w-full text-left bg-amber-50 text-amber-700 p-3 rounded-xl flex items-center border border-amber-100 shadow-sm text-xs font-medium cursor-pointer hover:bg-amber-100/50 transition-colors mb-4"
          >
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
            <p className="flex-1">
              {appLanguage === 'ms' 
                ? `${stats.invalidDatesCount} order mempunyai tarikh tamat yang tidak sah. Klik untuk lihat.`
                : `${stats.invalidDatesCount} orders have invalid due dates. Click to view.`}
            </p>
          </button>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
          <div className="bg-surface border border-gray-100 rounded-[20px] p-4 shadow-sm space-y-6">
            <div>
              <h3 className="text-sm font-bold text-text mb-4">
                {filterYear === 'all'
                  ? (appLanguage === 'ms' ? 'Order Mengikut Tahun' : 'Orders By Year')
                  : filterMonth === 'all'
                    ? (appLanguage === 'ms' ? `Order Mengikut Bulan (${filterYear})` : `Orders By Month (${filterYear})`)
                    : (appLanguage === 'ms' ? `Order Mengikut Hari (${stats.months[parseInt(filterMonth, 10) - 1]} ${filterYear})` : `Orders By Day (${stats.months[parseInt(filterMonth, 10) - 1]} ${filterYear})`)}
              </h3>
              <div className="h-[200px] w-full">
                <SafeResponsiveContainer>
                  <LineChart data={stats.ordersByMonth} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                    <YAxis tick={{fontSize: 10}} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                    <Line type="monotone" dataKey="value" stroke="#0A84FF" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} >
                      <LabelList dataKey="value" position="top" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#636366' }} />
                    </Line>
                  </LineChart>
                </SafeResponsiveContainer>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-text mb-4">{appLanguage === 'ms' ? 'Jenis Pelanggan' : 'Customer Types'}</h3>
              <div className="h-[180px] w-full flex items-center justify-center">
                <div className="w-[180px] h-full relative">
                  <SafeResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={stats.customerTypes}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={5}
                        dataKey="value"
                        label={{ fontSize: '10px', fill: '#636366', fontWeight: 'bold' }}
                      >
                        {stats.customerTypes.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                    </PieChart>
                  </SafeResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
                    <span className="text-xl font-black text-text">{stats.totalUniqueCustomers}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">{appLanguage === 'ms' ? 'Jumlah' : 'Total'}</span>
                  </div>
                </div>
                <div className="flex flex-col justify-center space-y-2 ml-4">
                  {stats.customerTypes.map((entry, index) => (
                    <div key={entry.name} className="flex items-center text-xs">
                      <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                      <span className="text-gray-500 mr-2">{entry.name}</span>
                      <span className="font-bold text-text">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-gray-100 rounded-[20px] p-4 shadow-sm space-y-6">
            <div>
              <h3 className="text-sm font-bold text-text mb-4">{appLanguage === 'ms' ? 'Kategori Tempahan' : 'Order Categories'}</h3>
              <div className="h-[200px] w-full">
                <SafeResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={stats.typesChart}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="value"
                      label={{ fontSize: '10px', fill: '#636366', fontWeight: 'bold' }}
                    >
                      {stats.typesChart.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                  </PieChart>
                </SafeResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {stats.typesChart.map((entry, index) => (
                  <div key={entry.name} className="flex items-center text-[10px]">
                    <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS[(index + 2) % COLORS.length] }}></div>
                    <span className="text-gray-500 mr-1 truncate max-w-[80px]">{entry.name}</span>
                    <span className="font-bold text-text">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-text mb-4">{appLanguage === 'ms' ? 'Prioriti (Tahap Urgency)' : 'Priority (Urgency Level)'}</h3>
              <div className="h-[160px] w-full">
                <SafeResponsiveContainer>
                  <BarChart data={stats.urgencyChart} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" tick={{fontSize: 10}} tickLine={false} axisLine={false} width={80} />
                    <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {stats.urgencyChart.map((entry, index) => {
                        let color = '#059669'; // default Tak Urgent / Not Urgent
                        if (entry.name === 'Super Urgent') color = '#E11D48';
                        else if (entry.name === 'Urgent') color = '#EA580C';
                        else if (entry.name === 'Semi Urgent') color = '#D97706';
                        return <Cell key={`cell-${index}`} fill={color} />;
                      })}
                      <LabelList dataKey="value" position="right" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#636366' }} />
                    </Bar>
                  </BarChart>
                </SafeResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
