import React, { useMemo, useState } from 'react';
import { useAppContext } from '../AppContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';

export function DashboardView() {
  const { history, appLanguage } = useAppContext();
  
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

  const stats = useMemo(() => {
    const orders = history || [];
    
    const uniqueOrders = new Set();
    const customers = new Map<string, number>(); // phone -> count
    
    // Monthly & Yearly aggregations
    const monthCounts = new Map<string, number>();
    const yearCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    const urgencyCounts = new Map<string, number>();
    
    const availableYears = new Set<string>();

    orders.forEach(order => {
      const state = order.state || {};
      
      // Order ID
      if (state.orderId) uniqueOrders.add(state.orderId);
      else uniqueOrders.add(order.id);

      // Customer Phone normalization
      let phone = state.customerPhone || '';
      phone = String(phone).replace(/\D/g, ''); // kept only digits
      if (phone.startsWith('60')) phone = '0' + phone.substring(2);
      if (phone) {
        customers.set(phone, (customers.get(phone) || 0) + 1);
      }

      // Main Type
      const type = state.mainType || 'Unknown';
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);

      // Urgency
      const urgency = state.urgency || 'Normal';
      urgencyCounts.set(urgency, (urgencyCounts.get(urgency) || 0) + 1);

      // Dates
      const ts = state.dueTimestamp || order.timestamp || Date.now();
      const date = new Date(ts);
      
      const yearStr = `${date.getFullYear()}`;
      availableYears.add(yearStr);
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1);
      yearCounts.set(yearStr, (yearCounts.get(yearStr) || 0) + 1);
    });

    let repeatCustomers = 0;
    customers.forEach(count => {
      if (count > 1) repeatCustomers++;
    });

    const totalUniqueCustomers = customers.size;
    const repeatCustomerRate = totalUniqueCustomers > 0 
      ? ((repeatCustomers / totalUniqueCustomers) * 100).toFixed(1) 
      : '0.0';

    // Filter months by selected year
    const ordersByMonth = Array.from(monthCounts.entries())
      .filter(([name]) => name.startsWith(selectedYear + '-'))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value]) => ({ name: name.substring(5), value })); // Just show MM

    const ordersByYear = Array.from(yearCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value]) => ({ name, value }));
      
    const customerTypes = [
      { name: appLanguage === 'ms' ? 'Baru' : 'New', value: totalUniqueCustomers - repeatCustomers },
      { name: appLanguage === 'ms' ? 'Berulang' : 'Repeat', value: repeatCustomers }
    ];

    const typesChart = Array.from(typeCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
      
    const urgencyChart = Array.from(urgencyCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
      
    const years = Array.from(availableYears).sort().reverse();

    return {
      totalUniqueOrders: uniqueOrders.size,
      totalUniqueCustomers,
      repeatCustomers,
      repeatCustomerRate,
      ordersByMonth,
      ordersByYear,
      customerTypes,
      typesChart,
      urgencyChart,
      years
    };
  }, [history, appLanguage, selectedYear]);

  const COLORS = ['#0A84FF', '#34C759', '#FF9F0A', '#FF453A', '#BF5AF2', '#64D2FF'];

  return (
    <div className="flex flex-col p-4 sm:p-6 space-y-6 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-black text-text tracking-tighter">
          {appLanguage === 'ms' ? 'Tinjauan Perniagaan' : 'Business Overview'}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-gray-100 rounded-[20px] p-4 shadow-sm flex flex-col items-center text-center">
          <span className="text-[11px] font-bold text-subtext uppercase tracking-widest mb-1">
            {appLanguage === 'ms' ? 'Total Order' : 'Total Orders'}
          </span>
          <span className="text-3xl font-black text-text">{stats.totalUniqueOrders}</span>
        </div>
        <div className="bg-surface border border-gray-100 rounded-[20px] p-4 shadow-sm flex flex-col items-center text-center">
          <span className="text-[11px] font-bold text-subtext uppercase tracking-widest mb-1">
            {appLanguage === 'ms' ? 'Pelanggan' : 'Customers'}
          </span>
          <span className="text-3xl font-black text-text">{stats.totalUniqueCustomers}</span>
        </div>
        <div className="bg-surface border border-gray-100 rounded-[20px] p-4 shadow-sm flex flex-col items-center text-center">
          <span className="text-[11px] font-bold text-subtext uppercase tracking-widest mb-1">
            {appLanguage === 'ms' ? 'Pelanggan Tetap' : 'Repeat Cust.'}
          </span>
          <span className="text-3xl font-black text-text">{stats.repeatCustomers}</span>
        </div>
        <div className="bg-surface border border-gray-100 rounded-[20px] p-4 shadow-sm flex flex-col items-center text-center">
          <span className="text-[11px] font-bold text-subtext uppercase tracking-widest mb-1">
            {appLanguage === 'ms' ? 'Kadar Berulang' : 'Repeat Rate'}
          </span>
          <span className="text-3xl font-black text-text">{stats.repeatCustomerRate}%</span>
        </div>
      </div>

      <div className="bg-surface border border-gray-100 rounded-[24px] p-5 shadow-sm space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-text">{appLanguage === 'ms' ? 'Order Mengikut Bulan' : 'Orders By Month'}</h3>
            {stats.years.length > 0 && (
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-gray-50 border border-gray-200 text-text text-xs rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              >
                {stats.years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            )}
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.ordersByMonth} margin={{ top: 20 }}>
                <XAxis dataKey="name" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                <Bar dataKey="value" fill="#0A84FF" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="value" position="top" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#636366' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-gray-100 rounded-[24px] p-5 shadow-sm space-y-6">
        <div>
          <h3 className="text-sm font-bold text-text mb-4">{appLanguage === 'ms' ? 'Order Mengikut Tahun' : 'Orders By Year'}</h3>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.ordersByYear} margin={{ top: 20 }}>
                <XAxis dataKey="name" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                <Bar dataKey="value" fill="#34C759" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="value" position="top" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#636366' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="bg-surface border border-gray-100 rounded-[24px] p-5 shadow-sm flex flex-col items-center">
          <h3 className="text-sm font-bold text-text mb-4">{appLanguage === 'ms' ? 'Pelanggan: Baru vs Tetap' : 'Customers: New vs Repeat'}</h3>
          <div className="h-[160px] w-full">
            <ResponsiveContainer width="100%" height="100%">
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
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-2">
            {stats.customerTypes.map((entry, index) => (
              <div key={entry.name} className="flex items-center text-[11px] font-bold text-subtext">
                <span className="w-2.5 h-2.5 rounded-full mr-1.5" style={{backgroundColor: COLORS[index % COLORS.length]}}></span>
                {entry.name}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-gray-100 rounded-[24px] p-5 shadow-sm flex flex-col items-center">
          <h3 className="text-sm font-bold text-text mb-4">{appLanguage === 'ms' ? 'Jenis Order Popular' : 'Popular Order Types'}</h3>
          <div className="h-[160px] w-full">
            <ResponsiveContainer width="100%" height="100%">
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
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {stats.typesChart.map((entry, index) => (
              <div key={entry.name} className="flex items-center text-[10px] font-bold text-subtext whitespace-nowrap">
                <span className="w-2.5 h-2.5 rounded-full mr-1.5 shrink-0" style={{backgroundColor: COLORS[(index + 2) % COLORS.length]}}></span>
                {entry.name}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="bg-surface border border-gray-100 rounded-[24px] p-5 shadow-sm space-y-6">
        <div>
          <h3 className="text-sm font-bold text-text mb-4">{appLanguage === 'ms' ? 'Jenis Urgency Popular' : 'Popular Urgency'}</h3>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.urgencyChart} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" tick={{fontSize: 10}} tickLine={false} axisLine={false} width={80} />
                <Tooltip cursor={{fill: 'rgba(0,0,0,0.05)'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                <Bar dataKey="value" fill="#FF9F0A" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="value" position="right" style={{ fontSize: '10px', fontWeight: 'bold', fill: '#636366' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
}
