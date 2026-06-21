import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useAppContext } from '../AppContext';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList, CartesianGrid } from 'recharts';
import { RefreshCcw, AlertCircle, Clock } from 'lucide-react';

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec';

const extractId = (input: string) => {
  if (input.includes('docs.google.com/spreadsheets/d/')) {
    const match = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : input;
  }
  return input.trim();
};

const jsonpRequest = (url: URL, callbackName: string) => {
  return new Promise<any>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url.toString();
    script.async = true;

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Request timed out'));
    }, 45000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (script.parentNode) script.parentNode.removeChild(script);
      delete (window as any)[callbackName];
    };

    (window as any)[callbackName] = (data: any) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('JSONP request failed'));
    };

    document.body.appendChild(script);
  });
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
  const { appLanguage } = useAppContext();
  
  const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
  const [filterMonth, setFilterMonth] = useState<string>('all');
  
  const [remoteOrders, setRemoteOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

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

  const globalScriptUrl = useMemo(() => {
    return localStorage.getItem('db_global_script_url') || GOOGLE_SCRIPT_URL;
  }, []);

  const fetchDashboardOrders = async (year: string) => {
    setIsLoading(true);
    setError(null);

    if (year === 'all') {
      const activeConfigs = annualSheets.filter((s: any) => s.year && s.spreadsheetId?.trim() !== '');
      if (activeConfigs.length === 0) {
        setRemoteOrders([]);
        setError(appLanguage === 'ms' 
          ? `Tiada Database Cloud dikonfigurasikan. Sila tetapkan di Sejarah > Tetapan.`
          : `No Cloud Database configured. Please configure in History > Settings.`
        );
        setIsLoading(false);
        return;
      }

      try {
        const fetchPromises = activeConfigs.map(async (sheetConfig: any) => {
          try {
            const sId = extractId(sheetConfig.spreadsheetId);
            const sUrl = sheetConfig.scriptUrl?.trim() || globalScriptUrl;
            const callbackName = 'jsonp_callback_dashboard_' + Math.round(1000000 * Math.random()) + '_' + sheetConfig.year;
            const url = new URL(sUrl);

            url.searchParams.append('action', 'get_dashboard_orders');
            url.searchParams.append('spreadsheetId', sId);
            url.searchParams.append('year', sheetConfig.year);
            url.searchParams.append('callback', callbackName);

            const data = await jsonpRequest(url, callbackName);
            if (data && data.status === 'success' && Array.isArray(data.orders)) {
              return data.orders;
            }
          } catch (e) {
            console.warn(`Failed to fetch dashboard orders for ${sheetConfig.year}:`, e);
          }
          return [];
        });

        const results = await Promise.all(fetchPromises);
        setRemoteOrders(results.flat());
        setLastUpdated(Date.now());
      } catch (err: any) {
        console.warn('All-time fetch failed:', err);
        setError(appLanguage === 'ms' ? `Ralat mendapatkan data: ${err.message}` : `Failed to fetch data: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const sheetConfig = annualSheets.find((s: any) => s.year === year && s.spreadsheetId?.trim() !== '');
    if (!sheetConfig) {
      setRemoteOrders([]);
      setError(appLanguage === 'ms' 
        ? `Tiada Database Cloud dikonfigurasikan untuk tahun ${year}. Sila tetapkan di Sejarah > Tetapan.`
        : `No Cloud Database configured for year ${year}. Please configure in History > Settings.`
      );
      setIsLoading(false);
      return;
    }

    const sId = extractId(sheetConfig.spreadsheetId);
    const sUrl = sheetConfig.scriptUrl?.trim() || globalScriptUrl;
    
    try {
      const callbackName = 'jsonp_callback_dashboard_' + Math.round(100000 * Math.random()) + '_' + year;
      const url = new URL(sUrl);

      url.searchParams.append('action', 'get_dashboard_orders');
      url.searchParams.append('spreadsheetId', sId);
      url.searchParams.append('year', year);
      url.searchParams.append('callback', callbackName);

      const data = await jsonpRequest(url, callbackName);
      
      if (data && data.status === 'success' && Array.isArray(data.orders)) {
        setRemoteOrders(data.orders);
        setLastUpdated(Date.now());
      } else {
        throw new Error(data?.message || 'Invalid response format');
      }
    } catch (err: any) {
      console.warn('Dashboard fetch failed:', err);
      setError(appLanguage === 'ms' ? `Ralat mendapatkan data: ${err.message}` : `Failed to fetch data: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardOrders(filterYear);
  }, [filterYear, annualSheets, globalScriptUrl]);

  const stats = useMemo(() => {
    const orders = remoteOrders;
    
    const availableYearsSet = new Set<string>(annualSheets.filter((s:any) => s.year).map((s:any) => s.year));
    if (filterYear !== 'all' && !availableYearsSet.has(filterYear)) {
      availableYearsSet.add(filterYear);
    }

    const yearCounts = new Map<string, number>();
    availableYearsSet.forEach(yr => {
      yearCounts.set(yr, 0);
    });
    
    const monthCounts = new Map<string, number>();
    for (let i = 1; i <= 12; i++) {
      monthCounts.set(String(i).padStart(2, '0'), 0);
    }

    const filteredOrders = orders.filter(order => {
      if (filterMonth !== 'all' && filterYear !== 'all') {
        if (!order.dueTimestamp || order.dueTimestamp === 0) return false;
        
        const date = new Date(order.dueTimestamp);
        const mStr = String(date.getMonth() + 1).padStart(2, '0');
        if (mStr !== filterMonth) return false;
      }
      return true;
    });

    let totalOrders = 0;
    const customers = new Map<string, number>(); 
    const typeCounts = new Map<string, number>();
    const urgencyCounts = new Map<string, number>();
    
    let invalidDatesCount = 0;

    filteredOrders.forEach(order => {
      // Order ID deduplication
      if (String(order.name || '').trim() !== '') {
        totalOrders++;
      }

      // Customer Phone normalization
      let phone = order.phone || '';
      phone = String(phone).replace(/\D/g, '');
      if (phone.startsWith('60')) phone = '0' + phone.substring(2);
      if (phone) customers.set(phone, (customers.get(phone) || 0) + 1);

      // Main Type
      const type = order.order || order.jenisTempahan || 'Unknown';
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);

      // Urgency
      // Urgency
      const urgencyRaw = String(order.jenis || order.urgency || '')
        .trim()
        .toLowerCase();

      let urgency = 'Tak Urgent';

      if (urgencyRaw === 'urgent') {
        urgency = 'Urgent';
      } else if (
        urgencyRaw === 'semi urgent' ||
        urgencyRaw === 'semi-urgent' ||
        urgencyRaw === 'semu urgent'
      ) {
        urgency = 'Semi Urgent';
      } else if (
        urgencyRaw === 'super urgent' ||
        urgencyRaw === 'super-urgent'
      ) {
        urgency = 'Super Urgent';
      }

      urgencyCounts.set(urgency, (urgencyCounts.get(urgency) || 0) + 1);

      // Monthly chart aggregation (only if valid date)
      if (order.dueTimestamp && order.dueTimestamp > 0) {
        const date = new Date(order.dueTimestamp);
        const mStr = String(date.getMonth() + 1).padStart(2, '0');
        const yStr = String(date.getFullYear());
        monthCounts.set(mStr, (monthCounts.get(mStr) || 0) + 1);
        yearCounts.set(yStr, (yearCounts.get(yStr) || 0) + 1);
      } else {
        invalidDatesCount++;
      }
    });

    let repeatCustomers = 0;
    customers.forEach(count => {
      if (count > 1) repeatCustomers++;
    });

    const totalUniqueCustomers = customers.size;
    const repeatCustomerRate = totalUniqueCustomers > 0 
      ? ((repeatCustomers / totalUniqueCustomers) * 100).toFixed(1) 
      : '0.0';

    const monthNamesMs = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
    const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const months = appLanguage === 'ms' ? monthNamesMs : monthNamesEn;

    const ordersChartData = filterYear === 'all'
      ? Array.from(yearCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([yStr, value]) => ({ 
            name: yStr, 
            value 
          }))
      : Array.from(monthCounts.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([mStr, value]) => ({ 
            name: months[parseInt(mStr, 10) - 1], 
            value 
          }));

    const customerTypes = [
      { name: appLanguage === 'ms' ? 'Baru' : 'New', value: totalUniqueCustomers - repeatCustomers },
      { name: appLanguage === 'ms' ? 'Berulang' : 'Repeat', value: repeatCustomers }
    ];

    const typesChart = Array.from(typeCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 5);
      
    const urgencyChart = Array.from(urgencyCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 5);

    const years = Array.from(availableYearsSet).sort().reverse();

    return {
      totalUniqueOrders: totalOrders,
      totalUniqueCustomers,
      repeatCustomers,
      repeatCustomerRate,
      ordersByMonth: ordersChartData,
      customerTypes,
      typesChart,
      urgencyChart,
      years,
      months,
      invalidDatesCount
    };
  }, [remoteOrders, appLanguage, filterYear, filterMonth, annualSheets]);

  const COLORS = ['#0A84FF', '#34C759', '#FF9F0A', '#FF453A', '#BF5AF2', '#64D2FF'];

  return (
    <div className="flex flex-col p-4 sm:p-6 space-y-6 pb-[calc(env(safe-area-inset-bottom)+2rem)] max-w-7xl mx-auto w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-black text-text tracking-tighter">
            {appLanguage === 'ms' ? 'Tinjauan Perniagaan' : 'Business Overview'}
          </h2>
          {lastUpdated && (
            <p className="text-xs text-gray-500 flex items-center mt-1">
              <Clock className="w-3 h-3 mr-1" />
              {appLanguage === 'ms' ? 'Dikemas kini: ' : 'Updated: '} {new Date(lastUpdated).toLocaleTimeString()}
            </p>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fetchDashboardOrders(filterYear)}
            disabled={isLoading}
            className={`h-10 px-4 rounded-xl font-bold border border-gray-200 flex items-center justify-center transition-all ${
              isLoading ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'bg-surface hover:bg-gray-50 active:scale-95 text-text'
            }`}
          >
            <RefreshCcw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {appLanguage === 'ms' ? 'Muat Semula' : 'Refresh'}
          </button>
          
          <select 
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="flex-1 sm:flex-none h-10 bg-surface border border-gray-200 text-text text-sm font-semibold rounded-xl px-3 outline-none focus:border-primary/50 focus:ring-2 ring-primary/20 cursor-pointer shadow-sm"
          >
            <option value="all">{appLanguage === 'ms' ? 'Semua Masa' : 'All Time'}</option>
            {stats.years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          
          {filterYear !== 'all' && (
            <select 
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="flex-1 sm:flex-none h-10 bg-surface border border-gray-200 text-text text-sm font-semibold rounded-xl px-3 outline-none focus:border-primary/50 focus:ring-2 ring-primary/20 cursor-pointer shadow-sm"
            >
              <option value="all">{appLanguage === 'ms' ? 'Sepanjang Tahun' : 'Whole Year'}</option>
              {stats.months.map((month, idx) => {
                const mVal = String(idx + 1).padStart(2, '0');
                return <option key={mVal} value={mVal}>{month}</option>;
              })}
            </select>
          )}
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl flex border border-red-100 shadow-sm leading-relaxed text-sm">
          <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      ) : isLoading && remoteOrders.length === 0 ? (
        <div className="bg-surface rounded-xl p-8 flex flex-col items-center justify-center border border-gray-100 shadow-sm mt-8">
          <RefreshCcw className="w-8 h-8 text-primary animate-spin mb-4" />
          <p className="text-gray-500 font-medium">
            {appLanguage === 'ms' ? 'Memuatkan data dari Google Sheets...' : 'Loading data from Google Sheets...'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-surface border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{appLanguage === 'ms' ? 'Jumlah Order' : 'Total Orders'}</p>
              <p className="text-3xl font-black text-text">{stats.totalUniqueOrders}</p>
            </div>
            
            <div className="bg-surface border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{appLanguage === 'ms' ? 'Pelanggan Unik' : 'Unique Customers'}</p>
              <p className="text-3xl font-black text-text">{stats.totalUniqueCustomers}</p>
            </div>

            <div className="bg-surface border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{appLanguage === 'ms' ? 'Pelanggan Berulang' : 'Repeat Customers'}</p>
              <p className="text-3xl font-black text-text">{stats.repeatCustomers}</p>
            </div>

            <div className="bg-surface border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col justify-center relative overflow-hidden">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{appLanguage === 'ms' ? 'Kadar Ulangan' : 'Repeat Rate'}</p>
              <p className="text-3xl font-black text-primary">{stats.repeatCustomerRate}%</p>
            </div>
          </div>

          {stats.invalidDatesCount > 0 && (
            <div className="bg-amber-50 text-amber-700 p-3 rounded-xl flex items-center border border-amber-100 shadow-sm text-xs font-medium">
              <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
              <p>
                {appLanguage === 'ms' 
                  ? `${stats.invalidDatesCount} order mempunyai tarikh yang tidak sah (tidak ditunjukkan dalam carta bulanan).`
                  : `${stats.invalidDatesCount} orders have invalid dates (excluded from monthly chart).`}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="bg-surface border border-gray-100 rounded-[24px] p-5 shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-bold text-text mb-4">
                  {filterYear === 'all'
                    ? (appLanguage === 'ms' ? 'Order Mengikut Tahun' : 'Orders By Year')
                    : (appLanguage === 'ms' ? `Order Mengikut Bulan (${filterYear})` : `Orders By Month (${filterYear})`)}
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
                      <span className="text-[9px] font-bold text-gray-400 uppercase">{appLanguage === 'ms' ? 'Jumlah' : 'Total'}</span>
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

            <div className="bg-surface border border-gray-100 rounded-[24px] p-5 shadow-sm space-y-6">
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
                      <Bar dataKey="value" fill="#FF9F0A" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="value" position="right" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#636366' }} />
                      </Bar>
                    </BarChart>
                  </SafeResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
