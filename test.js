const state = { customerName: undefined };
console.log(String(state?.customerName || state?.name || '').trim());
const state2 = { customerName: "undefined" };
console.log(String(state2?.customerName || state2?.name || '').trim());
