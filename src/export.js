/**
 * Export — CSV download aur direct Google Sheet creation.
 *
 * HATAYA GAYA: purana Apps Script webhook.
 *   fetch(url, { mode: 'no-cors' }).then(() => toast('Sent!'))
 * `no-cors` mein response opaque hota hai — request bhejte hi promise HAMESHA
 * resolve karta hai. Yaani Apps Script fail bhi ho jaye to user ko "✅ sent"
 * dikhta tha. Upar se diya gaya doPost() snippet bina kisi auth check ke
 * sheet.clear() karta tha — URL jiske paas ho, wo sheet wipe kar sakta tha.
 *
 * Ab: data Cloud Function se aata hai (server-side), aur Sheet seedha user ki
 * apni Drive mein `drive.file` scope se banti hai.
 */
import { GoogleAuthProvider, reauthenticateWithPopup } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, fns } from './firebase.js';

/**
 * CSV / formula injection guard.
 * Habit names user-controlled hain. Excel aur Sheets `=`, `+`, `-`, `@` se
 * shuru hone wale cell ko formula maan kar execute kar dete hain.
 */
function escapeCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(header, rows) {
  return [header, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

export function toTSV(header, rows) {
  return [header, ...rows]
    .map((r) => r.map((c) => String(c ?? '').replace(/[\t\n\r]/g, ' ')).join('\t'))
    .join('\n');
}

export async function fetchExport(period, startKey, endKey) {
  const call = httpsCallable(fns, 'exportHabits');
  const { data } = await call({ period, startKey, endKey });
  return data;
}

export function downloadCSV(header, rows, label = 'export') {
  // BOM lagana zaroori hai, warna Excel mein emoji aur Hindi tut jaate hain
  const blob = new Blob(['﻿' + toCSV(header, rows)], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `HabitPulse_${label}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Direct Google Sheet.
 *
 * `drive.file` scope jaan-boojh kar chuna gaya hai: ye RESTRICTED scope nahi hai,
 * isliye Google ka saalana (aur mehnga) security assessment nahi karana padta.
 * Ye sirf un files tak pahunch deta hai jo app khud banaye — user ki baaki
 * Drive chhui bhi nahi jati.
 */
export async function exportToGoogleSheet(period, startKey, endKey) {
  if (!auth.currentUser) throw new Error('Pehle sign in kijiye.');

  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.setCustomParameters({ prompt: 'consent' });

  const result = await reauthenticateWithPopup(auth.currentUser, provider);
  const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!token) throw new Error('Google ne Drive access token nahi diya.');

  const { header, rows, meta } = await fetchExport(period, startKey, endKey);

  const title = `HabitPulse — ${meta.startKey} to ${meta.endKey}`;
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: { title } }),
  });
  if (!createRes.ok) {
    throw new Error(`Sheet nahi ban payi (HTTP ${createRes.status})`);
  }
  const sheet = await createRes.json();

  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/A1:append` +
      '?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [header, ...rows] }),
    }
  );
  if (!appendRes.ok) {
    throw new Error(`Data likhne mein dikkat (HTTP ${appendRes.status})`);
  }

  return sheet.spreadsheetUrl;
}
