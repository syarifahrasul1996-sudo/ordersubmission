import React, { useState, useEffect } from 'react';
import { RefreshCcw, Save, Check } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { calculateDeadline } from '../utils';

export function CustomerInfoView() {
  const { appLanguage, state, setState, goHome, viewStack, updateOrderHistoryState } = useAppContext();
  const isActive = viewStack[viewStack.length - 1] === 'customer-info';

  const computeInitialValues = () => {
    let initOrder = '';
    if (state.mainType === 'Resume') {
      initOrder = state.isEditMode ? 'Edit Resume' : 'Resume';
    } else if (state.mainType === 'Surat') {
      initOrder = 'Surat';
    } else if (state.mainType === 'Edit PDF') {
      initOrder = 'Edit PDF';
    } else if (state.mainType === 'Lain-lain') {
      initOrder = 'Lain2';
    }

    let initBahasa = '';
    if (Array.isArray(state.resumeLangs)) {
      if (state.resumeLangs.length === 2) initBahasa = '2 Bahasa';
      else if (state.resumeLangs.length === 1) initBahasa = state.resumeLangs[0];
    }

    let initJenis = '';
    if (state.urgency === 'noturgent' || state.urgency === 'standard') initJenis = 'Tak Urgent';
    else if (state.urgency === 'urgent') initJenis = 'Urgent';
    else if (state.urgency === 'super') initJenis = 'Super Urgent';
    else if (state.urgency === 'semi') initJenis = 'Semi Urgent';

    const isSuperUrgent = state.urgency === 'super';
    const addonHours = (state.mainType === 'Resume' && !state.isEditMode && isSuperUrgent && state.addons && Array.isArray(state.addons)) ? state.addons.length : 0;
    const total = (state.baseHours || 0) + (state.extraHours || 0) + addonHours;
    const baseTime = state.timestamp ? state.timestamp : Date.now();
    const dl = new Date(baseTime + total * 3600000);
    const formattedDate = `${String(dl.getDate()).padStart(2, '0')}/${String(dl.getMonth() + 1).padStart(2, '0')}/${dl.getFullYear()}`;
    const formattedTime = dl.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    let initTemplate = '';
    if (state.mainType === 'Resume' && !state.isEditMode) {
      initTemplate = state.template || '';
    }

    let initAddOnList: string[] = [];
    if (state.addons && Array.isArray(state.addons)) {
      state.addons.forEach((a: string) => {
        if (a === 'Soft Copy Word') {
          if (state.softcopyLang === 'English') initAddOnList.push('Editable softcopy BI');
          else if (state.softcopyLang === 'Melayu') initAddOnList.push('Editable softcopy BM');
          else initAddOnList.push('Editable softcopy BI'); 
        } else if (a === 'Cover Letter') {
          if (state.clLangs && Array.isArray(state.clLangs)) {
            if (state.clLangs.includes('English')) initAddOnList.push('Cover Letter BI');
            if (state.clLangs.includes('Melayu')) initAddOnList.push('Cover Letter BM');
          }
        } else if (a === 'ATS Resume' || a === 'ATS') {
          initAddOnList.push('ATS');
        } else {
          initAddOnList.push(a);
        }
      });
    }
    const initAddOn = initAddOnList.join(', ');

    return { 
      initName: state.customerName || '',
      initPhone: state.customerPhone || '',
      initOrder: state.customerOrder || initOrder, 
      initBahasa: state.customerBahasa || initBahasa, 
      initJenis: state.customerJenis || initJenis, 
      initDue: state.customerDue || `${formattedDate} at ${formattedTime}`, 
      initTemplate: state.customerTemplate || initTemplate, 
      initAddOn: state.customerAddOn || initAddOn,
    };
  };

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  
  const [order, setOrder] = useState('');
  const [template, setTemplate] = useState('');
  const [bahasa, setBahasa] = useState('');
  const [addOn, setAddOn] = useState('');
  const [jenis, setJenis] = useState('');
  const [due, setDue] = useState('');

  const [spreadsheetId, setSpreadsheetId] = useState(state.spreadsheetId);
  const webhookUrl = 'https://script.google.com/macros/s/AKfycbxmXQZ19F7HBQV5qCjIchom20Jh-o-1g7rnEJMAbCPRkbth3sv8CVEFp7TP6VABRZxUdw/exec';
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch (e) {
      setIsInIframe(true);
    }
  }, []);

  // Re-compute when navigating here or state changes
  useEffect(() => {
    if (isActive) {
      setSaved(false);
      setIsSaving(false);
      setErrorMsg('');
      const initVals = computeInitialValues();
      setName(initVals.initName);
      setPhone(initVals.initPhone);
      setOrder(initVals.initOrder);
      setTemplate(initVals.initTemplate);
      setBahasa(initVals.initBahasa);
      setAddOn(initVals.initAddOn);
      setJenis(initVals.initJenis);
      setDue(initVals.initDue);
      setSpreadsheetId(state.spreadsheetId);
    }
  }, [isActive, state.historyId, state.timestamp]); // fetch when mounted or when switching orders

  const handleSaveInfo = async () => {
    if (!name.trim() || !phone.trim()) {
      setErrorMsg(appLanguage === 'ms' ? 'Sila isi semua ruangan.' : 'Please fill all fields.');
      return;
    }
    
    // Save the new values to global state + history
    updateOrderHistoryState({
      customerName: name,
      customerPhone: phone,
      customerOrder: order,
      customerTemplate: template,
      customerBahasa: bahasa,
      customerAddOn: addOn,
      customerJenis: jenis,
      customerDue: due,
      spreadsheetId: spreadsheetId,
    });

    setErrorMsg('');
    setIsSaving(true);
    setSaved(false);

    try {
      let formattedPhone = phone.trim();
      if (formattedPhone.startsWith('+')) {
        formattedPhone = formattedPhone.substring(1);
      } else if (formattedPhone.startsWith('0')) {
        formattedPhone = '6' + formattedPhone;
      }

      let formattedName = name.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());

      // Columns: Checkbox, Nama, Phone Number, Order, Template, Bahasa, Add On, Jenis, Due, Link
      const orderRow = [
        "FALSE",
        formattedName,
        formattedPhone,
        order,
        template || "",
        bahasa || "",
        addOn || "",
        jenis,
        due,
        ""
      ];

      // We save directly to Apps Script Web App URL
      // Determine monthly target sheet name on frontend to submit
      const now = new Date();
      const monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const monthNamesMs = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
      // Support standard pattern
      const currentMonthEn = monthNamesEn[now.getMonth()];
      const currentMonthMs = monthNamesMs[now.getMonth()];
      const targetSheet = appLanguage === 'ms' ? currentMonthMs : currentMonthEn;

      await fetch(webhookUrl.trim(), {
        method: 'POST',
        mode: 'no-cors', // To avoid any CORS / Redirect blocks when client is on separate domain like Vercel
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rowData: orderRow,
          sheetName: targetSheet,
          spreadsheetId: spreadsheetId
        })
      });

      setSaved(true);
      
      // Auto return home after successful save
      setTimeout(() => {
        goHome();
      }, 2000);
      
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="flex flex-col p-4 sm:p-6 space-y-8 text-center pb-[calc(env(safe-area-inset-bottom)+4rem)] min-h-[50vh] justify-center items-center">
         <div className="w-20 h-20 sm:w-24 sm:h-24 bg-green-100 text-secondary rounded-full flex items-center justify-center mb-6 shadow-sm">
           <Check className="w-8 h-8 sm:w-10 sm:h-10" />
         </div>
         <h2 className="text-2xl sm:text-3xl font-black text-text tracking-tighter">
           {appLanguage === 'ms' ? 'Berjaya Disimpan!' : 'Successfully Saved!'}
         </h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 sm:p-6 pb-[calc(env(safe-area-inset-bottom)+4rem)]">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-text tracking-tighter mb-2">
          {appLanguage === 'ms' ? 'Maklumat Pelanggan' : 'Customer Info'}
        </h2>
        <p className="text-subtext text-sm">
          {appLanguage === 'ms' 
            ? 'Simpan maklumat pelanggan untuk rujukan masa depan.' 
            : 'Save customer info for future reference.'}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-[13px] font-bold text-text ml-1 uppercase tracking-wider">
            {appLanguage === 'ms' ? 'Nama Pelanggan' : 'Customer Name'}
          </label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={appLanguage === 'ms' ? 'Cth: Ali bin Abu' : 'E.g. John Doe'}
            className="w-full h-14 bg-surface rounded-[16px] px-4 font-medium text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all placeholder:text-gray-300 text-[16px]" 
          />
        </div>

        <div className="space-y-1">
          <label className="text-[13px] font-bold text-text ml-1 uppercase tracking-wider">
            {appLanguage === 'ms' ? 'No. Telefon' : 'Phone Number'}
          </label>
          <input 
            type="tel" 
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01X-XXX XXXX"
            className="w-full h-14 bg-surface rounded-[16px] px-4 font-medium text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all placeholder:text-gray-300 text-[16px]" 
          />
        </div>

        <div className="space-y-1">
          <label className="text-[13px] font-bold text-text ml-1 uppercase tracking-wider">Order</label>
          <div className="relative">
            <select 
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="w-full h-14 bg-surface text-text rounded-[16px] px-4 font-medium border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all appearance-none text-[16px]" 
            >
              <option value="Resume">Resume</option>
              <option value="Surat">Surat</option>
              <option value="Edit PDF">Edit PDF</option>
              <option value="Lain2">Lain2</option>
              <option value="Edit Resume">Edit Resume</option>
              <option value=""></option>
            </select>
            <div className="absolute top-0 right-4 h-full flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-subtext" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[13px] font-bold text-text ml-1 uppercase tracking-wider">Template</label>
          <input 
            type="text" 
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="w-full h-14 bg-surface rounded-[16px] px-4 font-medium text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all text-[16px]" 
          />
        </div>

        <div className="space-y-1">
          <label className="text-[13px] font-bold text-text ml-1 uppercase tracking-wider">Bahasa</label>
          <div className="relative">
            <select 
              value={bahasa}
              onChange={(e) => setBahasa(e.target.value)}
              className="w-full h-14 bg-surface text-text rounded-[16px] px-4 font-medium border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all appearance-none text-[16px]" 
            >
              <option value="Melayu">Melayu</option>
              <option value="English">English</option>
              <option value="2 Bahasa">2 Bahasa</option>
              <option value=""></option>
            </select>
            <div className="absolute top-0 right-4 h-full flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-subtext" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7-7-7-7"></path></svg>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[13px] font-bold text-text ml-1 uppercase tracking-wider">Add On</label>
          <input 
            type="text" 
            value={addOn}
            onChange={(e) => setAddOn(e.target.value)}
            className="w-full h-14 bg-surface rounded-[16px] px-4 font-medium text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all text-[16px]" 
          />
        </div>

        <div className="space-y-1">
          <label className="text-[13px] font-bold text-text ml-1 uppercase tracking-wider">Jenis</label>
          <div className="relative">
            <select 
              value={jenis}
              onChange={(e) => setJenis(e.target.value)}
              className="w-full h-14 bg-surface text-text rounded-[16px] px-4 font-medium border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all appearance-none text-[16px]" 
            >
              <option value="Tak Urgent">Tak Urgent</option>
              <option value="Semi Urgent">Semi Urgent</option>
              <option value="Urgent">Urgent</option>
              <option value="Super Urgent">Super Urgent</option>
              <option value=""></option>
            </select>
            <div className="absolute top-0 right-4 h-full flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-subtext" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[13px] font-bold text-text ml-1 uppercase tracking-wider">Due</label>
          <input 
            type="text" 
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-full h-14 bg-surface rounded-[16px] px-4 font-medium text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all text-[16px]" 
          />
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
            {errorMsg}
          </div>
        )}

        <div className="pt-4 space-y-4">
          <div className="space-y-4">
            <button
              onClick={handleSaveInfo}
              disabled={isSaving}
              className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white font-black text-[16px] rounded-[18px] flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-70 shadow-sm"
            >
              {isSaving ? (
                <RefreshCcw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>{appLanguage === 'ms' ? 'Hantar Ke Google Sheet' : 'Save To Google Sheet'}</span>
                  <Save className="w-5 h-5 ml-1" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
