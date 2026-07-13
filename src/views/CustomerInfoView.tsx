import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCcw, Save, Check, FileText, ExternalLink, LogOut, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { calculateDeadline, formatPhoneUniversal, parseDateStringToTimestamp, toProperCase, formatAddOnString, normalizeBahasa } from '../utils';
import { Toast } from '../components/Toast';
import { SetupHelper } from '../components/SetupHelper';
import { googleSignIn, initAuth, getAccessToken, logout } from '../utils/googleAuth';
import { User } from 'firebase/auth';
import { cn } from '../cn';
import { isFirestoreCanary, saveOrderToFirestore } from '../services/firestoreOrders';

const TEMPLATE_SOURCES = {
  agreement: {
    docUrl: "https://docs.google.com/document/d/1Twi6iHoypMyWrpey9zC2GXUUOXBRZ8Op/edit",
    mode: "strict"
  },
  letter: {
    docUrl: "https://docs.google.com/document/d/135jL7gApNbIPMbnKs2bw1gdj53dFyg5i9fLTHb2yxP0/edit",
    mode: "flexible"
  }
};

function generateOrderId() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `ORD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function jsonpRequest<T>(url: string, params: Record<string, string | number | boolean>): Promise<T> {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_edit_callback_' + Math.round(100000 * Math.random());
    (window as any)[callbackName] = (data: T) => {
      cleanup();
      resolve(data);
    };

    const script = document.createElement('script');
    const separator = url.indexOf('?') === -1 ? '?' : '&';
    const queryParts = [`callback=${callbackName}`];
    Object.entries(params).forEach(([key, value]) => {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    });
    
    script.src = url + separator + queryParts.join('&');
    script.async = true;

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP request timed out'));
    }, 15000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      delete (window as any)[callbackName];
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('JSONP request failed'));
    };

    document.body.appendChild(script);
  });
}

export function CustomerInfoView() {
  const { appLanguage, state, setState, goHome, viewStack, updateOrderHistoryState, addToOfflineQueue, saveAsDraft: contextSaveAsDraft, deleteDraft, history, setHistory } = useAppContext();
  const isActive = viewStack[viewStack.length - 1] === 'customer-info';

  const computeInitialValues = useCallback(() => {
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
        if (state.resumeLangs.length === 2) initBahasa = '2 Bahasa';
        else if (state.resumeLangs.length === 1) initBahasa = state.resumeLangs[0];
      }
    }

    let initJenis = '';
    if (state.urgency === 'noturgent' || state.urgency === 'standard') initJenis = appLanguage === 'ms' ? 'Tak Urgent' : 'Not Urgent';
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
        } else if (a === 'Custom') {
          initAddOnList.push(toProperCase(state.customDoc || '').trim() || 'Custom');
        } else {
          initAddOnList.push(toProperCase(a));
        }
      });
    }
    const initAddOn = formatAddOnString(initAddOnList.join(', '));

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

    let initDue = '';
    if (state.isDueInvalid) {
      const originalDue = (state.customerDue || '').toString().trim();
      if (originalDue) {
        initDue = originalDue; // Keep the "wrong" text as requested
      } else {
        // Build suggested date based on filters
        const d = new Date();
        const y = state.dashboardFilterYear || d.getFullYear().toString();
        const m = state.dashboardFilterMonth && state.dashboardFilterMonth !== 'all' 
          ? (parseInt(state.dashboardFilterMonth) + 1).toString().padStart(2, '0') 
          : (d.getMonth() + 1).toString().padStart(2, '0');
        
        // Time keep empty as requested
        initDue = ` /${m}/${y}`;
      }
    } else {
      initDue = state.customerDue ? String(state.customerDue) : `${formattedDate} at ${formattedTime}`;
    }

    return { 
      initName: state.customerName || (state as any).name || '',
      initPhone: state.customerPhone || (state as any).phone || '',
      initOrder: state.customerOrder ? String(state.customerOrder) : initOrder, 
      initBahasa: state.customerBahasa ? String(state.customerBahasa) : initBahasa, 
      initType: state.mainType || 'Resume',
      initSubType: state.subType || '',
      initUrgency: state.urgency || 'normal',
      initJenis: state.customerJenis ? String(state.customerJenis) : initJenis, 
      initDue, 
      initDueTimestamp: state.dueTimestamp || dl.getTime(),
      initTemplate: state.customerTemplate || initTemplate, 
      initAddOn: state.customerAddOn || initAddOn,
      initAddOnDropdown,
      initInfo: state.customerInfo || '',
      initLink: state.googleSheetLink || state.orderLink || '',
      initOrderId,
      initPrice: state.price !== undefined ? String(state.price) : '',
    };
  }, [state]);

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
  const [price, setPrice] = useState('');
  const [isAddOnOpen, setIsAddOnOpen] = useState(false);
  const addOnRef = useRef<HTMLDivElement>(null);

  const [spreadsheetId, setSpreadsheetId] = useState(state.spreadsheetId);
  const webhookUrl = 'https://script.google.com/macros/s/AKfycbw5KpBvJyFpIXmsHueg4XPSRkZ0mg6kxHqjMGp3WEs8Hx_JodvKSoKEg6RMsdH54iCa/exec';
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isInIframe, setIsInIframe] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  
  // Form session recovery state
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);
  const isInitializingRef = useRef(true);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addOnRef.current && !addOnRef.current.contains(event.target as Node)) {
        setIsAddOnOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleGenerateDoc = async () => {
    let token = await getAccessToken();
    if (!googleUser || !token) {
      try {
        const authRes = await googleSignIn();
        if (!authRes) return;
        setGoogleUser(authRes.user);
        token = authRes.accessToken;
      } catch (err) {
        showToastMessage("Ralat melog masuk ke Google");
        return;
      }
    }

    setIsGeneratingDoc(true);

    try {
      if (!token) throw new Error("Sila log masuk ke Google Drive/Docs dahulu.");

      const fetchDocContent = async (docUrl: string): Promise<string> => {
        const match = docUrl.match(/\/d\/(.+?)(?:\/|$)/);
        if (!match) throw new Error("Templat link format tidak sah: " + docUrl);
        const templateId = match[1];

        const templateRes = await fetch(`https://docs.googleapis.com/v1/documents/${templateId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!templateRes.ok) {
          throw new Error("Gagal membaca templat dokumen. Sila pastikan templat boleh diakses (shared).");
        }
        const templateDoc = await templateRes.json();
        
        let extractedText = "";
        if (templateDoc.body && templateDoc.body.content) {
          templateDoc.body.content.forEach((el: any) => {
            if (el.paragraph && el.paragraph.elements) {
              el.paragraph.elements.forEach((elem: any) => {
                if (elem.textRun && elem.textRun.content) {
                  extractedText += elem.textRun.content;
                }
              });
            }
          });
        }
        return extractedText;
      };

      let templateContent = "";
      let mode = "letter";

      if (order === "Surat") {
        const letterTemplate = await fetchDocContent(TEMPLATE_SOURCES.letter.docUrl);
        templateContent = letterTemplate || "";
        mode = "letter";
      } else if (order === "Agreement" || (template && template.includes("PERJANJIAN"))) {
        const agreementTemplateSection = await fetchDocContent(TEMPLATE_SOURCES.agreement.docUrl);
        templateContent = agreementTemplateSection || "";
        mode = "agreement";
      }

      // Perform standard placeholder replacements locally instead of using Gemini AI
      let text = templateContent;
      if (text) {
        const replacements: Record<string, string> = {
          "NAMA": name || "",
          "NAME": name || "",
          "NAMA_PELANGGAN": name || "",
          "CUSTOMER_NAME": name || "",
          "TELEFON": phone || "",
          "PHONE": phone || "",
          "NO_TELEFON": phone || "",
          "PHONE_NUMBER": phone || "",
          "ORDER": order || "",
          "JENIS_ORDER": order || "",
          "TEMPLATE": template || "",
          "BAHASA": bahasa || "",
          "ADD_ON": addOn || "",
          "JENIS": jenis || "",
          "DUE": due || "",
          "DUE_DATE": due || "",
          "TARIKH_AKHIR": due || "",
          "ORDER_ID": orderId || "",
          "ID_ORDER": orderId || "",
          "INFO": info || "",
          "MAKLUMAT": info || "",
        };

        Object.entries(replacements).forEach(([key, value]) => {
          const bracketRegex = new RegExp(`\\[${key}\\]|\\{${key}\\}|\\{\\{${key}\\}\\}`, 'gi');
          text = text.replace(bracketRegex, value);
        });
      } else {
        // Fallback layout if template doc couldn't be loaded or is empty
        text = `RUJUKAN: ${orderId}
TARIKH: ${new Date().toLocaleDateString('ms-MY')}

Kepada:
${name}
${phone}

Perkara: ${order.toUpperCase()} - TEMPLATE: ${template.toUpperCase()}

Tuan/Puan,

Merujuk kepada perkara di atas, berikut adalah maklumat terperinci mengenai pesanan anda:

1. ID PESANAN: ${orderId}
2. JENIS TEMPLATE: ${template}
3. BAHASA: ${bahasa || 'N/A'}
4. ADD-ON: ${addOn || 'N/A'}
5. JENIS PESANAN: ${jenis || 'N/A'}
6. TARIKH AKHIR (DUE DATE): ${due || 'N/A'}

MAKLUMAT TAMBAHAN:
${info || 'Tiada maklumat tambahan disediakan.'}

Sekian, terima kasih.

Yang benar,
Dokumen Dijana Secara Automatik`;
      }
      
      // Create new doc
      const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${order || 'Surat'} - ${name || orderId}` })
      });
      if (!createRes.ok) throw new Error("Gagal membuat fail dokumen");
      const docData = await createRes.json();
      const documentId = docData.documentId;

      // Insert text and apply formatting (Cambria font, 1.15 line spacing)
      await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: text
              }
            },
            {
              updateTextStyle: {
                textStyle: {
                  weightedFontFamily: {
                    fontFamily: "Cambria"
                  }
                },
                fields: "weightedFontFamily",
                range: {
                  startIndex: 1,
                  endIndex: 1 + text.length
                }
              }
            },
            {
              updateParagraphStyle: {
                paragraphStyle: {
                  lineSpacing: 115
                },
                fields: "lineSpacing",
                range: {
                  startIndex: 1,
                  endIndex: 1 + text.length
                }
              }
            }
          ]
        })
      });

      // Update permissions
      await fetch(`https://www.googleapis.com/drive/v3/files/${documentId}/permissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'anyone', role: 'writer' })
      });

      const newLink = `https://docs.google.com/document/d/${documentId}/edit`;
      setLink(prev => {
        const cleaned = (prev || '').trim();
        return cleaned ? `${cleaned}\n${newLink}` : newLink;
      });
      showToastMessage(appLanguage === 'ms' ? "Surat berjaya dicipta!" : "Letter generated!");
    } catch (e: any) {
      console.error(e);
      showToastMessage(e.message || (appLanguage === 'ms' ? "Gagal mencipta surat." : "Failed to generate letter."));
    } finally {
      setIsGeneratingDoc(false);
    }
  };

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
      isInitializingRef.current = true;
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
      setAddOn(initVals.initAddOn);
      setJenis(initVals.initJenis);
      setDue(initVals.initDue);
      setDueTimestamp(initVals.initDueTimestamp);
      setOrderId(initVals.initOrderId);
      setPrice(initVals.initPrice);
      setSpreadsheetId(state.spreadsheetId);

      // Check if there is unsaved progress to restore
      try {
        const savedProgress = localStorage.getItem('customer_form_progress');
        if (savedProgress) {
          const data = JSON.parse(savedProgress);
          // Has meaningful unsaved data?
          const hasUnsavedData = (data.name && data.name.trim()) || 
                                 (data.phone && data.phone.trim()) || 
                                 (data.info && data.info.trim()) || 
                                 (data.link && data.link.trim());
          
          if (hasUnsavedData) {
            // Is it actually different from the computed active order details?
            const isDifferent = data.name !== initVals.initName ||
                                data.phone !== initVals.initPhone ||
                                data.info !== initVals.initInfo ||
                                data.link !== initVals.initLink ||
                                data.order !== initVals.initOrder ||
                                data.template !== initVals.initTemplate ||
                                data.bahasa !== initVals.initBahasa ||
                                data.addOn !== initVals.initAddOn ||
                                data.jenis !== initVals.initJenis ||
                                data.due !== initVals.initDue;
            
            if (isDifferent) {
              setShowResumeBanner(true);
            }
          }
        }
      } catch (e) {
        console.warn('Error checking form progress recovery in localStorage:', e);
      }

      const timer = setTimeout(() => {
        isInitializingRef.current = false;
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isActive]); // fetch when mounted or when switching views

  const handleResumeProgress = () => {
    try {
      const savedProgress = localStorage.getItem('customer_form_progress');
      if (savedProgress) {
        const data = JSON.parse(savedProgress);
        if (data.name !== undefined) setName(data.name);
        if (data.phone !== undefined) setPhone(data.phone);
        if (data.info !== undefined) setInfo(data.info);
        if (data.link !== undefined) setLink(data.link);
        if (data.order !== undefined) setOrder(data.order);
        if (data.template !== undefined) setTemplate(data.template);
        if (data.bahasa !== undefined) setBahasa(data.bahasa);
        if (data.addOn !== undefined) setAddOn(data.addOn);
        if (data.jenis !== undefined) setJenis(data.jenis);
        if (data.due !== undefined) setDue(data.due);
        if (data.dueTimestamp !== undefined) setDueTimestamp(data.dueTimestamp);
        if (data.orderId !== undefined) setOrderId(data.orderId);
        if (data.price !== undefined) setPrice(data.price);
        
        showToastMessage(appLanguage === 'ms' ? 'Kemajuan borang telah dipulihkan!' : 'Form progress restored!');
      }
    } catch (e) {
      console.error("Failed to resume progress:", e);
    }
    setShowResumeBanner(false);
  };

  const handleDismissProgress = () => {
    localStorage.removeItem('customer_form_progress');
    setShowResumeBanner(false);
  };

  const syncStateAndSave = (isDraftSave = false) => {
    if (isSaving || saved) return;

    const formValues = {
      customerName: name,
      customerPhone: phone,
      customerOrder: order,
      customerTemplate: template,
      customerBahasa: bahasa,
      customerAddOn: addOn,
      customerJenis: jenis,
      customerDue: due,
      dueTimestamp: dueTimestamp,
      customerInfo: info,
      orderLink: link,
      googleSheetLink: link,
      orderId: orderId,
      price: price ? parseFloat(price) : undefined,
    };

    if (isDraftSave) {
        // Only save draft if it's a transient draft, NOT a completed order in local history or remote search result
        const checkId = state.historyId;
        const isRealOrder = checkId && (!checkId.startsWith('draft_') || history?.some(item => item.id === checkId));
        if (!isRealOrder) {
          contextSaveAsDraft(formValues);
          showToastMessage(appLanguage === 'ms' ? 'Draf disimpan secara lokal!' : 'Draft saved locally!');
        }
    } else {
        setState(prev => ({
          ...prev,
          ...formValues,
        }));
    }
  };

  const handleSaveDraft = () => {
    syncStateAndSave(true);
  };

  // Debounced Auto-Save
  useEffect(() => {
    if (isActive && !isSaving && !saved) {
      const timer = setTimeout(() => {
        syncStateAndSave(true);
      }, 5000); 
      return () => clearTimeout(timer);
    }
  }, [name, phone, order, template, bahasa, addOn, jenis, due, info, link, orderId, isActive, isSaving, saved]);

  // Save form progress to localStorage with a debounce
  useEffect(() => {
    if (isActive && !showResumeBanner && !isInitializingRef.current) {
      const timer = setTimeout(() => {
        const data = {
          name,
          phone,
          info,
          link,
          order,
          template,
          bahasa,
          addOn,
          jenis,
          due,
          dueTimestamp,
          orderId,
          price,
          savedAt: Date.now()
        };
        localStorage.setItem('customer_form_progress', JSON.stringify(data));
      }, 1000); // 1s debounce to align updates nicely
      return () => clearTimeout(timer);
    }
  }, [name, phone, info, link, order, template, bahasa, addOn, jenis, due, dueTimestamp, orderId, price, isActive, showResumeBanner]);

  const handleSaveInfo = async () => {
    if (isSaving) return;
    if (!name.trim() || !phone.trim()) {
      setErrorMsg(appLanguage === 'ms' ? 'Sila isi semua ruangan.' : 'Please fill all fields.');
      return;
    }
    
    setIsSaving(true);
    setSaved(false);

    try {
      // Cleanup draft if it exists
      if (state.historyId) {
          deleteDraft(state.historyId);
      }

      const parsedObj = parseDateStringToTimestamp(due, dueTimestamp);
      const parsedTimestamp = parsedObj.timestamp;
      const targetDate = parsedObj.date;

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
      
      // Format phone first using our universal helper
      const formattedPhone = formatPhoneUniversal(phone);
      setPhone(formattedPhone);

      const updatedInfo = info.replace(
        /(No\.?\s*Telefon|Phone Number)\s*:\s*.*/i,
        `$1: ${formattedPhone}`
      );

      setInfo(updatedInfo);

      const oldIdToSend = orderId;
      let finalOrderId = orderId;

      // Check if we need to upgrade a temporary ID or empty ID to a permanent one
      if (!finalOrderId || finalOrderId.trim() === "" || finalOrderId.indexOf("SYNC-") === 0) {
        finalOrderId = generateOrderId();
        setOrderId(finalOrderId);

        // Rename existing history item in local memory (so updateOrderHistoryState updates it instead of duplicating)
        setHistory(prev => {
          return prev.map(item => {
            if (item.id === state.historyId || item.id === oldIdToSend || (item.state && item.state.orderId === oldIdToSend)) {
              return {
                ...item,
                id: finalOrderId,
                state: {
                  ...item.state,
                  orderId: finalOrderId,
                  historyId: finalOrderId,
                }
              };
            }
            return item;
          });
        });
      }

      // Format name and template correctly
      const finalFormattedName = name.trim().replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
      const finalFormattedTemplate = template.trim().toUpperCase();

      let finalMainType = 'Resume';
      let finalIsEditMode = false;
      if (order === 'Edit Resume') {
        finalMainType = 'Resume';
        finalIsEditMode = true;
      } else if (order === 'Surat') {
        finalMainType = 'Surat';
        finalIsEditMode = false;
      } else if (order === 'Edit PDF') {
        finalMainType = 'Edit PDF';
        finalIsEditMode = false;
      } else if (order === 'Lain2' || order === 'Lain-lain') {
        finalMainType = 'Lain-lain';
        finalIsEditMode = false;
      } else {
        finalMainType = 'Resume';
        finalIsEditMode = false;
      }

      const finalFormattedAddOn = formatAddOnString(addOn);

      // Save the new values to global state + history with syncing status
      const updatedState = {
        ...state,
        customerName: finalFormattedName,
        customerPhone: formattedPhone,
        customerInfo: updatedInfo,
        orderLink: link,
        googleSheetLink: link,
        customerOrder: order,
        customerTemplate: finalFormattedTemplate,
        customerBahasa: normalizeBahasa(bahasa),
        customerAddOn: finalFormattedAddOn,
        customerJenis: jenis,
        customerDue: due,
        dueTimestamp: parsedTimestamp,
        hasNotified: false,
        orderId: finalOrderId,
        historyId: finalOrderId,
        price: price ? parseFloat(price) : undefined,
        spreadsheetId: resolvedSpreadsheetId,
        scriptUrl: resolvedWebhookUrl,
        syncStatus: isFirestoreCanary ? ('synced' as const) : ('syncing' as const),
        mainType: finalMainType,
        isEditMode: finalIsEditMode
      };

      updateOrderHistoryState(updatedState);
      setDueTimestamp(parsedTimestamp);
      setErrorMsg('');

      if (isFirestoreCanary) {
        await saveOrderToFirestore(updatedState);
        localStorage.removeItem('customer_form_progress');
        setSaved(true);
        showToastMessage(appLanguage === 'ms' ? 'Berjaya disimpan di Firestore!' : 'Successfully saved to Firestore!');
        setIsSaving(false);
        setTimeout(() => goHome(), 500);
        return;
      }

      // Columns: Checkbox, Nama, Phone Number, Order, Template, Bahasa, Add On, Jenis, Due, Link, Order ID
      const orderRow = [
        state.isDelivered || false,
        finalFormattedName,
        formattedPhone,
        order,
        finalFormattedTemplate || "",
        normalizeBahasa(bahasa),
        finalFormattedAddOn || "",
        jenis,
        due,
        link || "",
        finalOrderId || "",
        price ? price.toString() : ""
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
      
      // Offline check & queue
      if (!navigator.onLine) {
        try {
          addToOfflineQueue(payload, resolvedWebhookUrl, finalOrderId);
          localStorage.removeItem('customer_form_progress');
          setSaved(true);
          showToastMessage(appLanguage === 'ms' ? 'Luar Talian: Disimpan dalam Que' : 'Offline: Saved to Queue');
          setTimeout(() => goHome(), 1800);
          return;
        } catch (e) {
          throw new Error('Failed to save to offline queue.');
        }
      }

      // Optimistic instant response
      localStorage.removeItem('customer_form_progress');
      setSaved(true);
      showToastMessage(appLanguage === 'ms' ? 'Berjaya dihantar!' : 'Successfully submitted!');
      setIsSaving(false);
      setTimeout(() => goHome(), 500);

      // Perform background update_order via JSONP
      const jsonpParams = {
        action: 'update_order',
        spreadsheetId: resolvedSpreadsheetId,
        orderId: finalOrderId,
        oldOrderId: oldIdToSend || "",
        isDelivered: state.isDelivered || false,
        name: finalFormattedName,
        phone: formattedPhone,
        order: order,
        template: finalFormattedTemplate || "",
        bahasa: normalizeBahasa(bahasa),
        addon: addOn || "",
        jenis: jenis,
        due: due,
        link: link || "",
        price: price ? price.toString() : ""
      };

      const triggerPostFallback = () => {
        fetch(resolvedWebhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify({
  ...payload,
  action: 'update_order',
  oldOrderId: oldIdToSend || '',
})
        }).then(() => {
          updateOrderHistoryState({
            syncStatus: 'synced',
            syncLastSuccess: Date.now(),
            lastModifiedLocally: Date.now()
          });
        }).catch(postErr => {
          console.error("POST fallback failed, adding to offline queue:", postErr);
          addToOfflineQueue(payload, resolvedWebhookUrl, finalOrderId);
          updateOrderHistoryState({
            syncStatus: 'failed',
            syncLastAttempt: Date.now()
          });
        });
      };

      jsonpRequest<{status: string; message?: string; orderId?: string; isUpgraded?: boolean}>(resolvedWebhookUrl, jsonpParams)
        .then((resp) => {
          if (resp && resp.status === 'success') {
            const returnedId = resp.orderId || finalOrderId;
            if (returnedId && returnedId !== finalOrderId) {
              
              // Update matching history item's ID & internal state
              setHistory(prev => {
                return prev.map(item => {
                  if (item.id === finalOrderId || (item.state && item.state.orderId === finalOrderId)) {
                    return {
                      ...item,
                      id: returnedId,
                      state: {
                        ...item.state,
                        orderId: returnedId,
                        historyId: returnedId,
                        syncStatus: 'synced',
                        syncLastSuccess: Date.now(),
                        lastModifiedLocally: Date.now()
                      }
                    };
                  }
                  return item;
                });
              });

              // Update the main App state
              setState(prev => ({
                ...prev,
                orderId: returnedId,
                historyId: returnedId,
                syncStatus: 'synced',
                syncLastSuccess: Date.now(),
                lastModifiedLocally: Date.now()
              }));
            } else {
              updateOrderHistoryState({
                syncStatus: 'synced',
                syncLastSuccess: Date.now(),
                lastModifiedLocally: Date.now()
              });
            }
          } else if (resp && resp.status === 'error') {
            console.error("JSONP update_order returned error response:", JSON.stringify(resp));
            updateOrderHistoryState({
              syncStatus: 'failed',
              syncLastAttempt: Date.now(),
              lastModifiedLocally: Date.now()
            });
            setErrorMsg(resp.message || 'Server returned an error');
            showToastMessage(appLanguage === 'ms' ? 'Ralat pelayan: Gagal di-sync' : 'Server error: Sync failed');
          } else {
            console.error("JSONP update_order failed or returned invalid response:", resp);
            triggerPostFallback();
          }
        })
        .catch(err => {
          console.error("JSONP update_order failed, running fallback:", err);
          triggerPostFallback();
        });
      return;
      
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
    let newTemplate = template;

    const properCase = (str: string) => {
      return str.trim().replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
    };

    // 1. Extract Nama
    const nameMatch = info.match(/(?:Nama Penuh|Full Name):\s*(.*)/i);
    if (nameMatch && nameMatch[1].trim()) {
      newName = properCase(nameMatch[1]);
    }

    // 1.2 Extract Template / Design Info
    const templateMatch = info.match(/(?:Template|Pilihan Template|Template Info|Design):\s*(.*)/i);
    if (templateMatch && templateMatch[1].trim()) {
      newTemplate = templateMatch[1].trim().toUpperCase();
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
        newBahasa = '2 Bahasa';
      } else if (val.includes('BM') || val.includes('MELAYU')) {
        newBahasa = 'Melayu';
      } else if (val.includes('BI') || val.includes('ENGLISH') || val.includes('INGGERIS')) {
        newBahasa = 'English';
      }
    }

    setName(newName);
    setOrder(newOrder);
    setBahasa(newBahasa);
    setTemplate(newTemplate);
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
    <div className="flex flex-col p-4 sm:p-5 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-xl font-black text-text tracking-tighter">
            {appLanguage === 'ms' ? 'Maklumat Pelanggan' : 'Customer Info'}
          </h2>
        </div>
        <p className="text-subtext text-xs">
          {appLanguage === 'ms' 
            ? 'Simpan maklumat pelanggan untuk rujukan masa depan.' 
            : 'Save customer info for future reference.'}
        </p>
      </div>

      <div className="space-y-3.5">
        {showResumeBanner && (
          <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-950 dark:text-amber-200 border border-amber-200/50 dark:border-amber-800/20 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between animate-fade-in mb-2">
            <div className="flex gap-2.5 items-start">
              <AlertCircle className="w-5.5 h-5.5 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <p className="text-xs font-black tracking-tight leading-none mb-1">
                  {appLanguage === 'ms' ? 'Kemajuan Tidak Disimpan Dikesan' : 'Unsaved Progress Detected'}
                </p>
                <p className="text-[11px] text-amber-800/95 dark:text-amber-300/80 leading-snug">
                  {appLanguage === 'ms' 
                    ? 'Anda mempunyai data borang yang tidak disimpan dari sesi lepas.' 
                    : 'You have unsaved form data from your previous session.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto shrink-0 pt-0.5 sm:pt-0">
              <button
                type="button"
                onClick={handleResumeProgress}
                className="flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs active:scale-95 transition-all shadow-sm"
              >
                {appLanguage === 'ms' ? 'Pulihkan' : 'Resume'}
              </button>
              <button
                type="button"
                onClick={handleDismissProgress}
                className="flex-1 sm:flex-none px-3 py-1.5 rounded-xl bg-white dark:bg-gray-800 border border-amber-200/40 dark:border-amber-800/30 hover:bg-amber-100/30 text-amber-900 dark:text-amber-200 font-bold text-xs transition-colors"
              >
                {appLanguage === 'ms' ? 'Padam' : 'Discard'}
              </button>
            </div>
          </div>
        )}

        {orderId && (
          <div className="flex items-center space-x-2 ml-1">
            <span className="text-[10px] font-bold text-subtext uppercase tracking-widest whitespace-nowrap">Order ID</span>
            <span className="text-[10px] font-mono text-text bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded cursor-default border border-gray-200 dark:border-gray-700 select-all">{orderId}</span>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-black text-gray-400 ml-1 uppercase tracking-widest">
            {appLanguage === 'ms' ? 'Nama Pelanggan' : 'Customer Name'}
          </label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => {
              const val = e.target.value;
              // Capitalize first letter of each word in real-time as they type
              const properVal = val.replace(/(^|\s)\S/g, (match) => match.toUpperCase());
              setName(properVal);
            }}
            onBlur={() => setName(name.trim().replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()))}
            placeholder={appLanguage === 'ms' ? 'Cth: Ali bin Abu' : 'E.g. John Doe'}
            className="w-full h-[46px] bg-surface rounded-xl px-4 font-bold text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all placeholder:text-gray-300 text-sm" 
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-black text-gray-400 ml-1 uppercase tracking-widest">
            {appLanguage === 'ms' ? 'No. Telefon' : 'Phone Number'}
          </label>
          <input 
            type="tel" 
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setPhone(formatPhoneUniversal(phone))}
            placeholder="01X-XXX XXXX"
            className="w-full h-[46px] bg-surface rounded-xl px-4 font-bold text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all placeholder:text-gray-300 text-sm" 
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-black text-gray-400 ml-1 uppercase tracking-widest">Order</label>
          <div className="relative">
            <select 
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="w-full h-[46px] bg-surface text-text rounded-xl px-4 font-bold border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all appearance-none text-sm" 
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
          <label className="text-xs font-black text-gray-400 ml-1 uppercase tracking-widest">Template</label>
          <input 
            type="text" 
            value={template}
            onChange={(e) => setTemplate(e.target.value.toUpperCase())}
            onBlur={() => setTemplate(template.trim().toUpperCase())}
            className="w-full h-[46px] bg-surface rounded-xl px-4 font-bold text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all text-sm" 
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-black text-gray-400 ml-1 uppercase tracking-widest">Bahasa</label>
          <div className="relative">
            <select 
              value={bahasa}
              onChange={(e) => setBahasa(e.target.value)}
              className="w-full h-[46px] bg-surface text-text rounded-xl px-4 font-bold border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all appearance-none text-sm" 
            >
              <option value="Melayu">Melayu</option>
              <option value="English">English</option>
              <option value="2 Bahasa">2 Bahasa</option>
              <option value=""></option>
            </select>
            <div className="absolute top-0 right-4 h-full flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-subtext" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>

        <div className="space-y-1.5 col-span-full" ref={addOnRef}>
          <label className="text-xs font-black text-gray-400 ml-1 uppercase tracking-widest">{appLanguage === 'ms' ? 'Add On (Boleh Pilih Lebih Dari 1)' : 'Add On (Select Multiple)'}</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsAddOnOpen(!isAddOnOpen)}
              className="w-full h-[46px] bg-surface text-text rounded-xl px-4 font-bold border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all flex items-center justify-between text-sm text-left"
            >
              <span className="truncate pr-4 text-gray-500 font-semibold">
                {appLanguage === 'ms' ? 'Pilih Add On...' : 'Select Add On...'}
              </span>
              <ChevronDown className={cn("w-4 h-4 text-subtext transition-transform shrink-0", isAddOnOpen && "rotate-180")} />
            </button>
            {isAddOnOpen && (
              <div className="absolute z-10 w-full mt-2 bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl max-h-60 overflow-y-auto p-2 animate-fade-in-up">
                {[
                  'Editable softcopy BI',
                  'Editable softcopy BM',
                  'ATS',
                  'Cover Letter BI',
                  'Cover Letter BM',
                  'Resign Letter',
                  'Fail',
                  'Nota Temuduga',
                  'Pakej Temuduga Kerajaan'
                ].map((option) => {
                  const selectedAddons = addOn ? addOn.split(',').map(s => s.trim()).filter(Boolean) : [];
                  const isSelected = selectedAddons.some(item => item.toLowerCase() === option.toLowerCase());
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        let nextAddons;
                        if (isSelected) {
                          nextAddons = selectedAddons.filter(item => item.toLowerCase() !== option.toLowerCase());
                        } else {
                          nextAddons = [...selectedAddons, option];
                        }
                        setAddOn(nextAddons.join(', '));
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all hover:bg-gray-50 dark:hover:bg-zinc-800/50 cursor-pointer ${
                        isSelected ? 'text-primary font-bold' : 'text-text font-semibold'
                      }`}
                    >
                      <span className="text-xs">{option}</span>
                      <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0 ${
                        isSelected 
                          ? 'bg-primary border-primary text-white' 
                          : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="pt-0.5">
            <input 
              type="text"
              value={addOn}
              onChange={(e) => setAddOn(e.target.value)}
              onBlur={() => setAddOn(formatAddOnString(addOn))}
              placeholder={appLanguage === 'ms' ? 'Pilihan terpilih (boleh taip atau edit secara manual di sini)...' : 'Selected options (type or edit manually here)...'}
              className="w-full h-[40px] bg-surface rounded-xl px-4 font-bold text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all text-xs placeholder:text-gray-300 placeholder:font-semibold" 
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-black text-gray-400 ml-1 uppercase tracking-widest">Jenis</label>
          <div className="relative">
            {(() => {
              let selectColorClass = "border-gray-100/50";
              const v = (jenis || '').toLowerCase();
              if (v.includes('super')) {
                selectColorClass = "border-super focus:border-super focus:ring-super/20 text-super font-black bg-super/5 dark:bg-super/10 ml-0";
              } else if (v.includes('semi')) {
                selectColorClass = "border-semi focus:border-semi focus:ring-semi/20 text-semi font-black bg-semi/5 dark:bg-semi/10 ml-0";
              } else if (v.includes('tak') || v.includes('normal') || v.includes('not') || v.includes('tidak')) {
                selectColorClass = "border-noturgent focus:border-noturgent focus:ring-noturgent/20 text-noturgent font-black bg-noturgent/5 dark:bg-noturgent/10 ml-0";
              } else if (v.includes('urgent')) {
                selectColorClass = "border-urgent focus:border-urgent focus:ring-urgent/20 text-urgent font-black bg-urgent/5 dark:bg-urgent/10 ml-0";
              }
              return (
                <select 
                  value={jenis}
                  onChange={(e) => setJenis(e.target.value)}
                  className={cn(
                    "w-full h-[46px] bg-surface text-text rounded-xl px-4 font-bold border outline-none focus:ring-2 transition-all appearance-none text-sm",
                    selectColorClass
                  )} 
                >
                  <option className="text-text font-normal bg-surface" value="Tak Urgent">{appLanguage === 'ms' ? 'Tak Urgent' : 'Not Urgent'}</option>
                  <option className="text-text font-normal bg-surface" value="Semi Urgent">Semi Urgent</option>
                  <option className="text-text font-normal bg-surface" value="Urgent">Urgent</option>
                  <option className="text-text font-normal bg-surface" value="Super Urgent">Super Urgent</option>
                  <option className="text-text font-normal bg-surface" value=""></option>
                </select>
              );
            })()}
            <div className="absolute top-0 right-4 h-full flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-subtext" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-black text-gray-400 ml-1 uppercase tracking-widest">Due</label>
          <div className="relative">
            <input 
              type="text" 
              value={due}
              onChange={(e) => setDue(e.target.value)}
              placeholder={appLanguage === 'ms' ? 'HH/BB/TTTT (Contoh: 25/12/2024)' : 'DD/MM/YYYY (Example: 25/12/2024)'}
              className={cn(
                "w-full h-[46px] bg-surface rounded-xl px-4 font-bold text-text border outline-none focus:ring-2 transition-all text-sm",
                state.isDueInvalid ? "border-amber-400 bg-amber-50/10 ring-amber-400/10 focus:border-amber-500 placeholder:text-amber-300" : "border-gray-100/50 focus:border-primary/50 focus:ring-primary/10"
              )} 
            />
            {state.isDueInvalid && (
              <div className="flex items-center mt-1.5 ml-1 text-[10px] font-black text-amber-600 uppercase tracking-tight">
                <AlertCircle className="w-3.5 h-3.5 mr-1" />
                {appLanguage === 'ms' ? 'Format Tarikh Tidak Sah / Kosong dari Sheets' : 'Invalid Date Format / Empty from Sheets'}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-black text-gray-400 ml-1 uppercase tracking-widest">{appLanguage === 'ms' ? 'Harga (RM)' : 'Price (RM)'}</label>
          <input
          data-price-field="text-version"
          type="text"
          inputMode="decimal"
          value={price}
          onChange={(e) => {
  const value = e.target.value
    .replace(',', '.')
    .replace(/[^\d.]/g, '');

  if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
    setPrice(value);
  }
}}
            placeholder={appLanguage === 'ms' ? 'Contoh: 50.00' : 'Example: 50.00'}
            className="w-full h-[46px] bg-surface rounded-xl px-4 font-bold text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all text-sm placeholder:text-gray-300"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center ml-1 mb-0.5">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
              {appLanguage === 'ms' ? 'Link (Asingkan dengan enter/koma untuk lebih 1 link)' : 'Links (Separate multiple links with enter/comma)'}
            </label>
          </div>
          
          <div className="relative">
            <textarea 
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example1.com&#10;https://example2.com"
              className="w-full min-h-[68px] py-2 bg-surface rounded-xl px-4 font-bold text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all text-sm sm:text-sm resize-none" 
            />
          </div>
          
          {/* Display multiple parsed links as clickable pills under the field */}
          {(() => {
            const parsedLinks = link.split(/[\n,;\s]+/).map(l => l.trim()).filter(l => l.startsWith('http://') || l.startsWith('https://') || l.includes('.com') || l.includes('docs.google.com') || l.includes('drive.google.com'));
            if (parsedLinks.length > 0) {
              return (
                <div className="mt-1.5 flex flex-wrap gap-1.5 p-1.5 bg-gray-50/50 rounded-xl border border-gray-100/30">
                  {parsedLinks.map((pLink, idx) => {
                    let label = `Link ${idx + 1}`;
                    try {
                      const url = new URL(pLink.startsWith('http') ? pLink : `https://${pLink}`);
                      if (url.hostname.includes('docs.google.com')) {
                        label = `Google Doc ${idx + 1}`;
                      } else if (url.hostname.includes('drive.google.com')) {
                        label = `Google Drive ${idx + 1}`;
                      } else if (url.hostname.includes('canva.com')) {
                        label = `Canva ${idx + 1}`;
                      } else {
                        label = `${url.hostname.replace('www.', '')} [${idx + 1}]`;
                      }
                    } catch (e) {
                      // ignore
                    }
                    return (
                      <a 
                        key={idx}
                        href={pLink.startsWith('http') ? pLink : `https://${pLink}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50/70 border border-blue-100/60 hover:bg-blue-100 text-blue-600 rounded-lg text-[11px] font-black tracking-normal transition-colors cursor-pointer select-none"
                      >
                        <ExternalLink className="w-3 h-3 text-blue-500" />
                        <span className="truncate max-w-[140px]">{label}</span>
                      </a>
                    );
                  })}
                </div>
              );
            }
            return null;
          })()}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between ml-1 mb-1">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">
              {appLanguage === 'ms' ? 'Maklumat Pelanggan' : 'Customer Information'}
            </label>
            <button
              onClick={handleAutoFill}
              className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg hover:bg-blue-100 transition-colors active:scale-95"
            >
              {appLanguage === 'ms' ? 'Auto-isi' : 'Auto-fill'}
            </button>
          </div>
          <textarea 
            value={info}
            onChange={(e) => setInfo(e.target.value)}
            rows={8}
            placeholder={appLanguage === 'ms' ? 'Salin dan tampal maklumat pelanggan/resume di sini...' : 'Copy and paste customer/resume details here...'}
            className="w-full bg-surface rounded-xl p-3 font-medium text-text border border-gray-100/50 outline-none focus:border-primary/50 focus:ring-2 ring-primary/10 transition-all placeholder:text-gray-300 text-sm resize-y min-h-[10rem]" 
          />
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs font-medium border border-red-100 whitespace-pre-wrap">
            {errorMsg}
          </div>
        )}

        <div className="pt-2 space-y-2">
          <button
            onClick={handleSaveDraft}
            className="w-full h-[48px] bg-white dark:bg-gray-800 text-blue-600 border-2 border-blue-600/20 font-bold text-sm rounded-2xl flex items-center justify-center space-x-2 active:scale-[0.98] transition-all hover:bg-blue-50 dark:hover:bg-blue-900/10"
          >
            <RefreshCcw className="w-4 h-4" />
            <span>{appLanguage === 'ms' ? 'Simpan Sebagai Draf' : 'Save as Draft'}</span>
          </button>

          <button
            onClick={handleSaveInfo}
            disabled={isSaving}
            className="w-full h-[58px] bg-blue-600 hover:bg-blue-700 text-white font-black text-base sm:text-base rounded-2xl flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-70 shadow-md shadow-blue-500/10"
          >
            {isSaving ? (
              <RefreshCcw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{appLanguage === 'ms' ? 'Hantar Ke Google Sheet' : 'Save To Google Sheet'}</span>
                <Save className="w-4 h-4 ml-1" />
              </>
            )}
          </button>
        </div>
      </div>
      <Toast show={showToast} message={toastMsg} />
      {showSetup && <SetupHelper onClose={() => setShowSetup(false)} appLanguage={appLanguage} />}
    </div>
  );
}
