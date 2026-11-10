function parsePaymentAmount(value) {
  const text = String(value ?? '').replace(/[\s\u00a0\u202f]/g, '').trim();
  if (!text) return NaN;
  let normalized = text;
  if (text.includes(',') && text.includes('.')) {
    normalized = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.');
  }
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return NaN;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : NaN;
}

function paymentChange(due, received) {
  const dueAmount = parsePaymentAmount(due);
  const receivedAmount = parsePaymentAmount(received);
  if (!Number.isFinite(dueAmount) || !Number.isFinite(receivedAmount) || dueAmount < 0) {
    return { valid: false, change: 0 };
  }
  const dueCents = Math.round(dueAmount * 100);
  const receivedCents = Math.round(receivedAmount * 100);
  return { valid: receivedCents >= dueCents, change: Math.max(0, receivedCents - dueCents) / 100 };
}

module.exports = { parsePaymentAmount, paymentChange };
