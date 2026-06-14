export function calculateDeadline(state: any, appLanguage: string) {
  const now = state.timestamp ? new Date(state.timestamp) : new Date();
  const isSuperUrgent = state.urgency === 'super';
  const addonHours = (state.mainType === 'Resume' && !state.isEditMode && isSuperUrgent && state.addons) ? state.addons.length : 0;
  const total = (state.baseHours || 0) + (state.extraHours || 0) + addonHours;
  
  const dl = new Date(now.getTime() + total * 3600000);
  const timeStr = dl.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const daysMs = ['Ahad','Isnin','Selasa','Rabu','Khamis','Jumaat','Sabtu'];
  const daysEn = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  
  const diff = Math.round((new Date(dl.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400000);
  
  let dateStr = '';
  if (diff === 0) {
    dateStr = appLanguage === 'ms' ? `hari ini ${timeStr}` : `today at ${timeStr}`;
  } else if (diff === 1) {
    dateStr = appLanguage === 'ms' ? `esok ${timeStr}` : `tomorrow at ${timeStr}`;
  } else if (diff > 1) {
    if (appLanguage === 'ms') {
      dateStr = `pada hari ${daysMs[dl.getDay()]} (${String(dl.getDate()).padStart(2,'0')}/${String(dl.getMonth()+1).padStart(2,'0')}) ${timeStr}`;
    } else {
      dateStr = `on ${daysEn[dl.getDay()]} (${String(dl.getDate()).padStart(2,'0')}/${String(dl.getMonth()+1).padStart(2,'0')}) at ${timeStr}`;
    }
  }
  
  return { formatted: dateStr, total };
}

export function generateMessages(state: any, dl: { formatted: string, total: number }, appLanguage: string) {
  const isE = state.isEditMode;
  let raw = state.mainType === 'Lain-lain' ? ((state.customDoc || '').trim() || 'Dokumen') : state.mainType;
  const docLabel = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  
  const addsForDisplay = (state.addons || []).map((a: string) => {
      if (a === 'Soft Copy Word') return `Soft Copy Word (${state.softcopyLang})`;
      if (a === 'Cover Letter') {
          const clText = ['Melayu', 'English'].filter(l => state.clLangs && state.clLangs.includes(l)).join(' & ');
          return `Cover Letter (${clText})`;
      }
      return a;
  });
  
  const title = docLabel + (addsForDisplay.length > 0 && !isE ? " + " + addsForDisplay.join(" + ") : "");
  
  const ms = {
      ms: { thanks: "Terima kasih ☺️✨", will: (t: string, d: string) => `${t} ni saya akan hantar selewatnya ${d}`, super: "Kalau siap awal kita send awal", late: "Kalau saya terlewat, jangan segan untuk terus chat ya.", more: "Kalau nak siap lebih awal dari due yg diberi, boleh tukar ke pakej lebih cepat dan buat bayaran tambahan.", recalc: "> ⏱ Tempoh siap akan dikira semula dari tarikh bayaran tambahan dibuat, bukan dari tarikh bayaran asal.", h: "jam", template: "Template", language: "Bahasa", addon: "Add-on", disc: "Kita anggap maklumat resume yang diberi tu lengkap dan dah disemak.\n\n> Kalau nak betulkan sikit-sikit lepas siap, takde caj. Tapi kalau ada penambahan atau perubahan besar, akan dikenakan caj asing. Harap maklum ☺️" },
      en: { thanks: "Thank you ☺️✨", will: (t: string, d: string) => `I will send this ${t} by ${d}`, super: "If it's ready earlier I'll send it earlier", late: "If I'm late, please don’t hesitate to message me directly.", more: "If you want it ready earlier than the given due date, you can switch to a faster package and make an additional payment.", recalc: "> ⏱ Completion time will be recalculated from the date of additional payment, not from the original payment date.", h: "hours", template: "Template", language: "Language", addon: "Add-ons", disc: "We assume the resume information provided is complete and checked.\n\n> Minor corrections after completion are free. However, any major additions or changes will incur separate charges. Thank you for your understanding ☺️" }
  };
  const t = appLanguage === 'en' ? ms.en : ms.ms;
  let m1 = `${t.thanks}\n\n`;
  
  const isSuper = state.urgency === 'super';
  if (isSuper) {
      m1 += `${t.will(title, dl.formatted)} (${dl.total} ${t.h})\n\n${t.super}`;
  } else {
      m1 += `${t.will(title, dl.formatted)}. ${t.late}\n\n${t.more}\n\n${t.recalc}`;
  }
  
  const out = [m1];
  if (state.mainType === 'Resume') {
      if (!isE) {
          let m2 = `${t.template}: ${((state.template || '').trim() || '-').toUpperCase()}\n${t.language}: ${(state.resumeLangs || []).join(' & ')}\n${t.addon}: ${addsForDisplay.length ? addsForDisplay.join(', ') : '-'}\n\n${t.disc}`;
          out.push(m2);
      } else { out.push(t.disc); }
  }

  return out;
}
