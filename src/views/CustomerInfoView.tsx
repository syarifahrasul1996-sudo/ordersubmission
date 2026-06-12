import React, { useState, useEffect } from 'react';
import { RefreshCcw, Save, Check } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { initAuth, googleSignIn, getAccessToken } from '../auth';
import { calculateDeadline } from '../utils';

export function CustomerInfoView() {
  const { appLanguage, state, setState, goHome } = useAppContext();
  
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [token, setToken] = useState<string | null>(null);

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
    if (state.urgency === 'noturgent' || state.urgency === 'standard') initJenis = 'Tidak Urgent';
    else if (state.urgency === 'urgent') initJenis = 'Urgent';
    else if (state.urgency === 'super') initJenis = 'Super Urgent';
    else if (state.urgency === 'semi') initJenis = 'Semi Urgent';

    const isSuperUrgent = state.urgency === 'super';
    const addonHours = (state.mainType === 'Resume' && !state.isEditMode && isSuperUrgent && state.addons && Array.isArray(state.addons)) ? state.addons.length : 0;
    const total = (state.baseHours || 0) + (state.extraHours || 0) + addonHours;
    const dl = new Date(Date.now() + total * 3600000);
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

    return { initOrder, initBahasa, initJenis, initDue: `${formattedDate} at ${formattedTime}`, initTemplate, initAddOn };
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
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [authError, setAuthError] = useState('');

  // Re-compute when navigating here or state changes
  useEffect(() => {
    const initVals = computeInitialValues();
    setOrder(initVals.initOrder);
    setTemplate(initVals.initTemplate);
    setBahasa(initVals.initBahasa);
    setAddOn(initVals.initAddOn);
    setJenis(initVals.initJenis);
    setDue(initVals.initDue);
    setSpreadsheetId(state.spreadsheetId);
  }, [state]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, t) => {
        setToken(t);
        setNeedsAuth(false);
      },
      () => {
        setToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError('');
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      // Give a helpful error message about mobile/iframe issues
      setAuthError(appLanguage === 'ms' 
        ? `Gagal log masuk (${err.message || 'Ralat'}). Sila buka app ini di tab baru jika anda di telefon bimbit.` 
        : `Login failed (${err.message || 'Error'}). Please open this app in a new tab if you are on mobile.`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!name.trim() || !phone.trim()) {
      setErrorMsg(appLanguage === 'ms' ? 'Sila isi semua ruangan.' : 'Please fill all fields.');
      return;
    }
    
    // Save the new spreadsheet ID to global state
    setState(prev => ({ ...prev, spreadsheetId }));

    setErrorMsg('');
    setIsSaving(true);
    setSaved(false);

    try {
      let t = token;
      if (!t) {
        t = await getAccessToken();
      }
      
      if (!t) {
        setNeedsAuth(true);
        setIsSaving(false);
        return;
      }

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
        template,
        bahasa,
        addOn,
        jenis,
        due,
        ""
      ];

      // fetch spreadsheet to see available sheets
      const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      let targetSheet = "Sheet1";
      let targetSheetId = 0;

      if (metaRes.ok) {
        const meta = await metaRes.json();
        const sheets = meta.sheets || [];
        
        // Let's try to match current month
        const now = new Date();
        const monthNamesEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const monthNamesEnShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthNamesMs = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];
        const currentMonthEn = monthNamesEn[now.getMonth()];
        const currentMonthEnShort = monthNamesEnShort[now.getMonth()];
        const currentMonthMs = monthNamesMs[now.getMonth()];
        
        // Find a sheet that contains the current month name
        const currentMonthSheet = sheets.find((s: any) => {
          const title = s.properties.title;
          return title.includes(currentMonthEn) || 
                 title.includes(currentMonthEnShort) || 
                 title.includes(currentMonthMs);
        });

        if (currentMonthSheet) {
          targetSheet = currentMonthSheet.properties.title;
          targetSheetId = currentMonthSheet.properties.sheetId;
        } else if (sheets.length > 0) {
          // Fallback to the first sheet if we couldn't find a month match
          targetSheet = sheets[0].properties.title;
          targetSheetId = sheets[0].properties.sheetId;
        }
      }

      // Fetch existing data to determine insertion point
      const sheetDataRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(targetSheet)}'!A:J`, {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      
      let existingRows: any[] = [];
      if (sheetDataRes.ok) {
         const sheetData = await sheetDataRes.json();
         existingRows = sheetData.values || [];
      }

      const parseDateString = (dateStr: string) => {
        if (!dateStr) return null;
        const parts = dateStr.split(' at ');
        if (parts.length !== 2) return null;
        const dateParts = parts[0].split('/');
        if (dateParts.length !== 3) return null;
        const timeAndAMPM = parts[1].split(' ');
        if (timeAndAMPM.length !== 2) return null;
        const timeParts = timeAndAMPM[0].split(':');
        if (timeParts.length !== 2) return null;

        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const year = parseInt(dateParts[2], 10);
        let hour = parseInt(timeParts[0], 10);
        const minute = parseInt(timeParts[1], 10);
        const isPM = timeAndAMPM[1].toUpperCase() === 'PM';

        if (isPM && hour < 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;

        return new Date(year, month, day, hour, minute);
      };

      const newDateParsed = parseDateString(due);
      const newDateStrOnly = due.split(' at ')[0];

      let insertIndex = existingRows.length;
      let addBlankAbove = false;
      let addBlankBelow = false;

      if (newDateParsed && existingRows.length > 1) {
         const parsedExisting = existingRows.map((r, i) => {
            if (!r || r.length === 0 || !r[8]) return { index: i, date: null, dateStr: null, isBlank: true };
            const dateObj = parseDateString(r[8]);
            return { index: i, date: dateObj, dateStr: r[8].split(' at ')[0], isBlank: false };
         });

         for (let i = 1; i < parsedExisting.length; i++) {
            const curr = parsedExisting[i];
            if (curr.date && newDateParsed < curr.date) {
               insertIndex = i;
               break;
            }
         }

         const itemAbove = insertIndex > 0 ? parsedExisting[insertIndex - 1] : null;
         const itemBelow = insertIndex < parsedExisting.length ? parsedExisting[insertIndex] : null;

         if (itemAbove && !itemAbove.isBlank && itemAbove.dateStr !== newDateStrOnly && itemAbove.index !== 0) addBlankAbove = true;
         if (itemBelow && !itemBelow.isBlank && itemBelow.dateStr !== newDateStrOnly) addBlankBelow = true;
      }

      if (insertIndex < 1) insertIndex = 1; // Never insert before header

      const totalRowsToInsert = 1 + (addBlankAbove ? 1 : 0) + (addBlankBelow ? 1 : 0);
      const dataRowIndex = insertIndex + (addBlankAbove ? 1 : 0);

      const rowDataToInsert = [];
      if (addBlankAbove) rowDataToInsert.push({ values: [] });
      
      rowDataToInsert.push({
        values: orderRow.map(val => {
           if (val === "FALSE" || val === "TRUE") {
               return { userEnteredValue: { boolValue: val === "TRUE" } };
           } else {
               return { userEnteredValue: { stringValue: val } };
           }
        })
      });

      if (addBlankBelow) rowDataToInsert.push({ values: [] });

      const requests: any[] = [
         {
            insertDimension: {
               range: {
                  sheetId: targetSheetId,
                  dimension: "ROWS",
                  startIndex: insertIndex,
                  endIndex: insertIndex + totalRowsToInsert
               },
               inheritFromBefore: false
            }
         },
         {
            updateCells: {
               rows: rowDataToInsert,
               fields: "userEnteredValue",
               start: {
                  sheetId: targetSheetId,
                  rowIndex: insertIndex,
                  columnIndex: 0
               }
            }
         },
         {
            copyPaste: {
               source: {
                  sheetId: targetSheetId,
                  startRowIndex: 1,
                  endRowIndex: 2,
                  startColumnIndex: 0,
                  endColumnIndex: 10
               },
               destination: {
                  sheetId: targetSheetId,
                  startRowIndex: dataRowIndex,
                  endRowIndex: dataRowIndex + 1,
                  startColumnIndex: 0,
                  endColumnIndex: 10
               },
               pasteType: "PASTE_DATA_VALIDATION",
               pasteOrientation: "NORMAL"
            }
         },
         {
            copyPaste: {
               source: {
                  sheetId: targetSheetId,
                  startRowIndex: 1,
                  endRowIndex: 2,
                  startColumnIndex: 0,
                  endColumnIndex: 10
               },
               destination: {
                  sheetId: targetSheetId,
                  startRowIndex: dataRowIndex,
                  endRowIndex: dataRowIndex + 1,
                  startColumnIndex: 0,
                  endColumnIndex: 10
               },
               pasteType: "PASTE_FORMAT",
               pasteOrientation: "NORMAL"
            }
         }
      ];

      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${t}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ requests })
      });

      if (!res.ok) {
         const errorData = await res.json();
         console.error('Sheets Error:', errorData);
         throw new Error(errorData.error?.message || 'Failed to update Google Sheet.');
      }
      
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

        {errorMsg && (
          <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-medium border border-red-100">
            {errorMsg}
          </div>
        )}

        <div className="pt-6">
          {needsAuth ? (
            <div className="space-y-3 p-5 bg-surface border border-gray-100 rounded-2xl flex flex-col items-center">
              <p className="text-[13px] text-text text-center font-medium">
                {appLanguage === 'ms' 
                  ? 'Anda perlu log masuk untuk menyimpan ke dalam Google Sheets.' 
                  : 'You need to sign in to save into Google Sheets.'}
              </p>
              
              <button 
                onClick={handleLogin} 
                disabled={isLoggingIn}
                className="gsi-material-button w-full shrink-0 flex items-center justify-center relative bg-white text-[#3c4043] border border-[#dadce0] rounded-[4px] h-[40px] px-3 font-semibold hover:bg-[#f8fafc] cursor-pointer"
              >
                <div className="mr-3 w-[18px] h-[18px]">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-[18px] h-[18px] block">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="text-[14px]">
                  Sign in with Google
                </span>
              </button>
              
              {authError && (
                <p className="text-[12px] text-red-500 font-medium text-center px-2">
                  {authError}
                </p>
              )}
              
              <div className="relative w-full flex items-center py-2">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink-0 mx-4 text-subtext text-[12px] uppercase tracking-wider">{appLanguage === 'ms' ? 'ATAU' : 'OR'}</span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>
              
              <button
                onClick={() => {
                  let formattedPhone = phone.trim();
                  if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1);
                  else if (formattedPhone.startsWith('0')) formattedPhone = '6' + formattedPhone;
                  let formattedName = name.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
                  
                  const textToCopy = `Nama: ${formattedName}\nPhone: ${formattedPhone}\nOrder: ${order}\nTemplate: ${template}\nBahasa: ${bahasa}\nAdd On: ${addOn}\nJenis: ${jenis}\nDue: ${due}`;
                  
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(textToCopy).then(() => {
                      alert(appLanguage === 'ms' ? 'Maklumat disalin!' : 'Info copied!');
                    }).catch(err => console.error(err));
                  }
                }}
                className="w-full h-12 bg-gray-100 text-text font-bold text-[14px] rounded-[12px] flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                {appLanguage === 'ms' ? 'Salin Maklumat Secara Manual' : 'Copy Info Manually'}
              </button>
            </div>
          ) : (
            <button
              onClick={handleSaveInfo}
              disabled={isSaving}
              className="w-full h-16 bg-primary text-white font-black text-[16px] rounded-[18px] flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-70 shadow-sm"
            >
              {isSaving ? (
                <RefreshCcw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>{appLanguage === 'ms' ? 'Simpan Data Ke Sheets' : 'Save To Sheets'}</span>
                  <Save className="w-5 h-5 ml-1" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
