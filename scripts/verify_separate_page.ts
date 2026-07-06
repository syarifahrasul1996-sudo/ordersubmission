
import crypto from 'crypto';

const spreadsheetId = '1myU9apnYWWtU3snnCw14qI6ZS05i4DY6oOswLz1sCwo';
const worksheet = 'Februari 2025';
const sourceRow = 99;

const input = `${spreadsheetId}|${worksheet}|${sourceRow}`;
const hash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
const documentId = `sheet-${hash}`;

console.log('Source Key:', input);
console.log('SHA-256 Input:', input);
console.log('Replacement Document ID:', documentId);
