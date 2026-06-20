import React, { useState, useEffect } from 'react';
import { RefreshCcw, Save, Check } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { calculateDeadline } from '../utils';
import { Toast } from '../components/Toast';
import { SetupHelper } from '../components/SetupHelper';

function generateOrderId() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `ORD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

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
    const isNewResume = state.mainType === 'Resume' && !state.isEditMode;
    const isSurat = state.mainType === 'Surat';
    const isLainLain = state.mainType === 'Lain-lain';
    
    // Only prefill if the user went through a flow that asks for language
    if (isNewResume || isSurat || isLainLain) {
      if (Array.isArray(state.resumeLangs)) {
        if (state.resumeLangs.length === 2) initBahasa = '2 bahasa';
        else if (state.resumeLangs.length === 1) initBahasa = state.resumeLangs[0];
      }
    }

    let initJenis = '';
    if (state.urgency === 'noturgent' || state.urgency === 'standard') initJenis = 'Tidak Urgent';
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

    const validDropdownOptions = [
      'Editable softcopy BI',
      'Editable softcopy BM',
      'ATS',
      'Cover Letter BI',
      'Cover Letter BM',
      'Resign Letter',
      'Fail',
      'Nota Temuduga',
      'Pakej Temuduga Kerajaan'
    ];

    let initAddOnDropdown = '';
    const addOnToCheck = String(state.customerAddOn || initAddOn).trim();
    if (addOnToCheck) {
      if (validDropdownOptions.includes(addOnToCheck)) {
        initAddOnDropdown = addOnToCheck;
      } else {
        const normalizedCheck = addOnToCheck.toLowerCase();
        const found = validDropdownOptions.find(opt => {
          const normOpt = opt.toLowerCase();
          return normalizedCheck.includes(normOpt) || normOpt.includes(normalizedCheck);
        });
        if (found) {
          initAddOnDropdown = found;
        } else {
          const parts = addOnToCheck.split(',').map(p => p.trim().toLowerCase());
          const matchPart = validDropdownOptions.find(opt => parts.includes(opt.toLowerCase()));
          if (matchPart) {
            initAddOnDropdown = matchPart;
          }
        }
      }
    }

    let initOrderId = state.orderId;
    if (!initOrderId) {
      initOrderId = generateOrderId();
    }

    return { 
      initName: state.customerName ? String(state.customerName) : '',
      initPhone: state.customerPhone ? String(state.customerPhone) : '',
      initOrder: state.customerOrder ? String(state.customerOrder) : initOrder, 
      initBahasa: state.customerBahasa ? String(state.customerBahasa) : initBahasa, 
      initJenis: state.customerJenis ? String(state.customerJenis) : initJenis, 
      initDue: state.customerDue ? String(state.customerDue) : `${formattedDate} at ${formattedTime}`, 
      initDueTimestamp: state.dueTimestamp || dl.getTime(),
      initTemplate: state.customerTemplate || initTemplate, 
      initAddOn: state.customerAddOn || initAddOn,
      initAddOnDropdown,
      initInfo: state.customerInfo || [
        `--- ${appLanguage === 'ms' ? 'MAKLUMAT PELANGGAN' : 'CUSTOMER INFORMATION'} ---`,
        `${appLanguage === 'ms' ? 'Nama Penuh' : 'Full Name'}: ${state.customerName || ''}`,
        `${appLanguage === 'ms' ? 'No. Telefon' : 'Phone Number'}: ${state.customerPhone || ''}`,
        `Order: ${state.customerOrder || initOrder || ''}`,
        `Template: ${state.customerTemplate || initTemplate || ''}`,
        `${appLanguage === 'ms' ? 'Bahasa' : 'Language'}: ${state.customerBahasa || initBahasa || ''}`,
        `${appLanguage === 'ms' ? 'Add On' : 'Add On'}: ${state.customerAddOn || initAddOn || ''}`,
        `Jenis: ${state.customerJenis || initJenis || ''}`,
        `Due: ${state.customerDue || `${formattedDate} at ${formattedTime}`}`,
        `Link: ${state.orderLink || state.googleSheetLink || ''}`,
        `Order ID: ${initOrderId}`
      ].join('\n'),
      initLink: state.orderLink || '',
      initOrderId,
    };
  };

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [info, setInfo] = useState('');
  const [link, setLink] = useState('');
  
  const [order, setOrder] = useState('');
  const [template, setTemplate] = useState('');
  const [bahasa, setBahasa] = useState('');
  const [addOn, setAddOn] = useState('');
  const [jenis, setJenis] = useState('');
  const [due, setDue] = useState('');
  const [dueTimestamp, setDueTimestamp] = useState(0);
  const [orderId, setOrderId] = useState('');

  const [spreadsheetId, setSpreadsheetId] = useState(state.spreadsheetId);
  const webhookUrl = 'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec';
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isInIframe, setIsInIframe] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  const showToastMessage = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

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
      setInfo(initVals.initInfo);
      setLink(initVals.initLink);
      setOrder(initVals.initOrder);
      setTemplate(initVals.initTemplate);
      setBahasa(initVals.initBahasa);
      setAddOn(initVals.initAddOnDropdown);
      setJenis(initVals.initJenis);
      setDue(initVals.initDue);
      setDueTimestamp(initVals.initDueTimestamp);
      setOrderId(initVals.initOrderId);
      setSpreadsheetId(state.spreadsheetId);
    }
  }, [isActive, state.historyId, state.timestamp]); // fetch when mounted or when switching orders

  const handleSaveInfo = async () => {
    if (!name.trim() || !phone.trim()) {
      setErrorMsg(appLanguage === 'ms' ? 'Sila isi semua ruangan.' : 'Please fill all fields.');
      return;
    }

    // Parse the edited "due" text field to dueTimestamp so card/history display is perfectly synchronized
    let parsedTimestamp = dueTimestamp;
    if (due && due.trim().length > 0) {
      const dueStrClean = due.replace(/\s+at\s+/i, ' ').trim();
      const directDate = new Date(dueStrClean);
      if (!isNaN(directDate.getTime())) {
        parsedTimestamp = directDate.getTime();
      } else {
        // Attempt custom DD/MM/YYYY parses with optional time
        const parts = dueStrClean.split(/\s+/);
        const datePart = parts[0];
        const timePart = parts[1] || '00:00';

        const dateSegs = datePart.split('/');
        if (dateSegs.length === 3) {
          const day = parseInt(dateSegs[0], 10);
          const month = parseInt(dateSegs[1], 10) - 1;
          const year = parseInt(dateSegs[2], 10);

          const timeSegs = timePart.split(':');
          let hours = parseInt(timeSegs[0] || '0', 10);
          const minutes = parseInt(timeSegs[1] || '0', 10);
          const seconds = parseInt(timeSegs[2] || '0', 10);

          const isPM = dueStrClean.toUpperCase().includes('PM');
          const isAM = dueStrClean.toUpperCase().includes('AM');
          if (isPM && hours < 12) {
            hours += 12;
          } else if (isAM && hours === 12) {
            hours = 0;
          }

          const parsedDME = new Date(year, month, day, hours, minutes, seconds);
          if (!isNaN(parsedDME.getTime())) {
            parsedTimestamp = parsedDME.getTime();
          }
        }
      }
    }
    
    // Determine monthly target sheet name on frontend to submit
    let targetDate = new Date();
    if (due && due.trim().length > 0) {
      // Simple heuristic: try to parse the due string to a Date
      // Since due might be "15/06/2026 at 10:00" or similar
      const dueStr = due.replace(' at ', ' ');
      const parsedDue = new Date(dueStr);
      if (!isNaN(parsedDue.getTime())) {
        targetDate = parsedDue;
      } else {
        // Attempt DD/MM/YYYY
        const parts = due.split(' ')[0].split('/');
        if (parts.length === 3) {
          const parsedDME = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          if (!isNaN(parsedDME.getTime())) {
            targetDate = parsedDME;
          }
        }
      }
    }

    const orderYear = String(targetDate.getFullYear());
    let resolvedSpreadsheetId = spreadsheetId || state.spreadsheetId || '1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo';
    let resolvedWebhookUrl = webhookUrl.trim();

    try {
      const savedSheets = localStorage.getItem('db_annual_sheets');
      if (savedSheets) {
        const parsed = JSON.parse(savedSheets);
        if (Array.isArray(parsed)) {
          const matches = parsed.find(s => s.year === orderYear);
          if (matches) {
            if (matches.spreadsheetId && matches.spreadsheetId.trim()) {
              const rawInput = matches.spreadsheetId.trim();
              if (rawInput.includes('docs.google.com/spreadsheets/d/')) {
                const matchedId = rawInput.match(/\/d\/([a-zA-Z0-9-_]+)/);
                resolvedSpreadsheetId = matchedId ? matchedId[1] : rawInput;
              } else {
                resolvedSpreadsheetId = rawInput;
              }
            }
            if (matches.scriptUrl && matches.scriptUrl.trim()) {
              resolvedWebhookUrl = matches.scriptUrl.trim();
            }
          }
        }
      }
    } catch (err) {
      console.error("Error reading db_annual_sheets:", err);
    }

    // Default fallbacks for each year if not customized
    if (resolvedSpreadsheetId === '1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo' || !resolvedSpreadsheetId) {
      if (orderYear === '2024') {
        resolvedSpreadsheetId = '1B9zdWXVLnvj0jNNVnKxcb6cJnS1VLCIdB4j-RR3wOlg';
      } else if (orderYear === '2025') {
        resolvedSpreadsheetId = '1myU9apnYWWtU3snnCw14qI6ZS05i4DY6oOswLz1sCwo';
      } else if (orderYear === '2026') {
        resolvedSpreadsheetId = '1kUAJYUVhr9bPYErtpnohpvuGGyhBSvJyEOIyzEFivJo';
      }
    }

    // Save the new values to global state + history
    updateOrderHistoryState({
      customerName: name,
      customerPhone: phone,
      customerInfo: info,
      orderLink: link,
      customerOrder: order,
      customerTemplate: template,
      customerBahasa: bahasa,
      customerAddOn: addOn,
      customerJenis: jenis,
      customerDue: due,
      dueTimestamp: parsedTimestamp,
      hasNotified: false,
      orderId: orderId,
      spreadsheetId: resolvedSpreadsheetId,
      scriptUrl: resolvedWebhookUrl,
    });

    setDueTimestamp(parsedTimestamp);
    setErrorMsg('');
    setIsSaving(true);
    setSaved(false);

    try {
      let formattedPhone = phone.trim();
      if (formattedPhone.startsWith('+')) {
        formattedPhone = formattedPhone.substring(1);
      }
      formattedPhone = formattedPhone.replace(/\D/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '60' + formattedPhone.substring(1);
      }

      let formattedName = name.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());

      // Columns: Checkbox, Nama, Phone Number, Order, Template, Bahasa, Add On, Jenis, Due, Link, Order ID
      const orderRow = [
        false,
        formattedName,
        formattedPhone,
        order,
        template || "",
        bahasa || "",
        addOn || "",
        jenis,
        due,
        link || "",
        orderId || ""
      ].map(v => v == null ? "" : v);
      
      const monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const monthNamesMs = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
      
      // Send both language variants so the backend can try both if needed
      const targetSheetEn = `${monthNamesEn[targetDate.getMonth()]} ${targetDate.getFullYear()}`;
      const targetSheetMs = `${monthNamesMs[targetDate.getMonth()]} ${targetDate.getFullYear()}`;

      const payload = {
        rowData: orderRow,
        sheetName: targetSheetEn, // Fallback for older script version
        sheetNameEn: targetSheetEn,
        sheetNameMs: targetSheetMs,
        spreadsheetId: resolvedSpreadsheetId
      };
      
      console.log("Submitting payload to Google Apps Script:", JSON.stringify(payload, null, 2));

      // Offline check & queue
      if (!navigator.onLine) {
        try {
          const queueStr = localStorage.getItem('db_offline_sync_queue');
          const queue = queueStr ? JSON.parse(queueStr) : [];
          queue.push({
            payload,
            webhookUrl: resolvedWebhookUrl,
            id: orderId,
            timestamp: Date.now()
          });
          localStorage.setItem('db_offline_sync_queue', JSON.stringify(queue));
          setSaved(true);
          showToastMessage(appLanguage === 'ms' ? 'Luar Talian: Disimpan dalam Que' : 'Offline: Saved to Queue');
          setTimeout(() => goHome(), 1800);
          return;
        } catch (e) {
          throw new Error('Failed to save to offline queue.');
        }
      }

      let response;
      try {
        response = await fetch(resolvedWebhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(payload)
        });
      } catch (fetchErr: any) {
        // Fallback to offline queue if network fails
        try {
          const queueStr = localStorage.getItem('db_offline_sync_queue');
          const queue = queueStr ? JSON.parse(queueStr) : [];
          queue.push({
            payload,
            webhookUrl: resolvedWebhookUrl,
            id: orderId,
            timestamp: Date.now()
          });
          localStorage.setItem('db_offline_sync_queue', JSON.stringify(queue));
          setSaved(true);
          showToastMessage(appLanguage === 'ms' 
            ? 'Sambungan gagal: Disimpan dalam Que' 
            : 'Connection failed: Saved to Queue');
          setTimeout(() => goHome(), 1800);
          return;
        } catch (e) {
          throw fetchErr; // rethrow the original fetch error
        }
      }

      // Handle opaque response for no-cors
      if (response.type === 'opaque') {
        setSaved(true);
        showToastMessage(appLanguage === 'ms' ? 'Berjaya dihantar!' : 'Successfully submitted!');
        setTimeout(() => {
          goHome();
        }, 2000);
        return;
      }

      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        throw new Error('Failed to parse response: ' + responseText);
      }

      if (result.status === 'error') {
        const errorLogs = result.logs && result.logs.length > 0 ? `\nLogs: ${result.logs.join(' -> ')}` : '';
        throw new Error((result.message || 'Error from server') + errorLogs);
      }

      setSaved(true);
      showToastMessage(appLanguage === 'ms' 
        ? `Berjaya disalurkan ke tab: ${result.message.replace('Data added to ', '').replace(' tab', '')}` 
        : `Successfully saved to tab: ${result.message.replace('Data added to ', '').replace(' tab', '')}`);
      
      // Auto return home after successful save
      setTimeout(() => {
        goHome();
      }, 2000);
      
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || 'Error occurred while saving';
      if (errMsg.includes('Failed to fetch')) {
        errMsg = 'Failed to fetch: You MUST deploy the Web App as "Execute as: Me" and "Who has access: Anyone". If it requires login, it will fail.';
      }
      setErrorMsg(errMsg);
      showToastMessage(appLanguage === 'ms' ? 'Ralat, sila semak mesej ralat' : 'Failed, please see logs');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoFill = () => {
    let newName = name;
    let newOrder = order;
    let newBahasa = bahasa;

    // 1. Extract Nama
    const nameMatch = info.match(/(?:Nama Penuh|Full Name):\s*(.*)/i);
    if (nameMatch && nameMatch[1].trim()) {
      newName = nameMatch[1].trim();
    }

    // 2. Extract Order
    const uppercaseInfo = info.toUpperCase();
    if (
      uppercaseInfo.includes('MAKLUMAT PENGHANTAR') ||
      uppercaseInfo.includes('MAKLUMAT PENERIMA') ||
      uppercaseInfo.includes('JENIS / TUJUAN SURAT') ||
      uppercaseInfo.includes('TARIKH SURAT')
    ) {
      newOrder = 'Surat';
    } else if (uppercaseInfo.includes('BORANG RESUME')) {
      newOrder = 'Resume';
    }

    // 3. Extract Bahasa
    const bahasaMatch = info.match(/(?:Surat BM\/BI\?|Bahasa:|Language:)\s*(.*)/i);
    if (bahasaMatch && bahasaMatch[1]) {
      const val = bahasaMatch[1].toUpperCase();
      if (val.includes('2 BAHASA') || val.includes('DUA BAHASA') || val.includes('BOTH') || (val.includes('BM') && val.includes('BI'))) {
        newBahasa = '2 bahasa';
      } else if (val.includes('BM') || val.includes('MELAYU')) {
        newBahasa = 'Melayu';
      } else if (val.includes('BI') || val.includes('ENGLISH') || val.includes('INGGERIS')) {
        newBahasa = 'English';
      }
    }

    setName(newName);
    setOrder(newOrder);
    setBahasa(newBahasa);
    showToastMessage(appLanguage === 'ms' ? 'Auto-isi terpakai!' : 'Auto-fill applied!');
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-black text-text tracking-tighter">
            {appLanguage === 'ms' ? 'Maklumat Pelanggan' : 'Customer Info'}
          </h2>
        </div>
        <p className="text-subtext text-sm">
          {appLanguage === 'ms' 
            ? 'Simpan maklumat pelanggan untuk rujukan masa depan.' 
            : 'Save customer info for future reference.'}
        </p>
      </div>

      <div className="space-y-4">
        {orderId && (
          <div className="flex items-center space-x-2 ml-1">
            <span className="text-[11px] font-bold text-subtext uppercase tracking-widest whitespace-nowrap">Order ID</span>
            <span className="text-[11px] font-mono text-text bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded cursor-default border border-gray-200 dark:border-gray-700 select-all">{orderId}</span>
          </div>
        )}

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
              <option value="2 bahasa">2 bahasa</option>
              <option value=""></option>
            </select>
            <div className="absolute top-0 right-4 h-full flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-subtext" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7-7-7-7"></path></svg>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[13px] font-bold text-text ml-1 uppercase tracking-wider">Add On</label>
          <div className="relative">
            <select 
              value={addOn}
              onChange={(e) => setAddOn(e.target.value)}
              className="w-full h-14 bg-surface text-text rounded-[16px] px-4 font-medium border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all appearance-none text-[16px]" 
            >
              <option value=""></option>
              <option value="Editable softcopy BI">Editable softcopy BI</option>
              <option value="Editable softcopy BM">Editable softcopy BM</option>
              <option value="ATS">ATS</option>
              <option value="Cover Letter BI">Cover Letter BI</option>
              <option value="Cover Letter BM">Cover Letter BM</option>
              <option value="Resign Letter">Resign Letter</option>
              <option value="Fail">Fail</option>
              <option value="Nota Temuduga">Nota Temuduga</option>
              <option value="Pakej Temuduga Kerajaan">Pakej Temuduga Kerajaan</option>
            </select>
            <div className="absolute top-0 right-4 h-full flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-subtext" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[13px] font-bold text-text ml-1 uppercase tracking-wider">Jenis</label>
          <div className="relative">
            <select 
              value={jenis}
              onChange={(e) => setJenis(e.target.value)}
              className="w-full h-14 bg-surface text-text rounded-[16px] px-4 font-medium border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all appearance-none text-[16px]" 
            >
              <option value="Tidak Urgent">Tidak Urgent</option>
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

        <div className="space-y-1">
          <label className="text-[13px] font-bold text-text ml-1 uppercase tracking-wider">Link</label>
          <input 
            type="text" 
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://..."
            className="w-full h-14 bg-surface rounded-[16px] px-4 font-medium text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all text-[16px]" 
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between ml-1 mb-1">
            <label className="text-[13px] font-bold text-text uppercase tracking-wider">
              {appLanguage === 'ms' ? 'Maklumat Pelanggan' : 'Customer Information'}
            </label>
            <button
              onClick={handleAutoFill}
              className="text-[12px] font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-[12px] hover:bg-blue-100 transition-colors active:scale-95"
            >
              {appLanguage === 'ms' ? 'Auto-isi' : 'Auto-fill'}
            </button>
          </div>
          <textarea 
            value={info}
            onChange={(e) => setInfo(e.target.value)}
            rows={12}
            placeholder={appLanguage === 'ms' ? 'Salin dan tampal maklumat pelanggan/resume di sini...' : 'Copy and paste customer/resume details here...'}
            className="w-full bg-surface rounded-[16px] p-4 font-medium text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all placeholder:text-gray-300 text-[16px] resize-y min-h-[14rem]" 
          />
        </div>



        {errorMsg && (
          <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100 whitespace-pre-wrap">
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
      <Toast show={showToast} message={toastMsg} />
      {showSetup && <SetupHelper onClose={() => setShowSetup(false)} appLanguage={appLanguage} />}
    </div>
  );
}
