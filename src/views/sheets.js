/** Tab 4 — export centre. */
import { escapeHtml, setText, setHtml, show, hide, $, toast } from '../utils/dom.js';
import { toDateKey, todayMidnight, addDays, startOfMonth } from '../utils/date.js';
import { state } from '../state.js';
import { isGuest } from '../store.js';
import { fetchExport, downloadCSV, toTSV, exportToGoogleSheet } from '../export.js';

const PERIODS = ['month', '3months', '6months', 'year', 'custom'];

let lastExport = null;

export function getExportRange() {
  const today = todayMidnight();
  if (state.exportPeriod === 'custom') {
    return {
      startKey: state.exportStart || toDateKey(addDays(today, -30)),
      endKey: state.exportEnd || toDateKey(today),
    };
  }
  const spans = { month: null, '3months': 92, '6months': 183, year: 365 };
  const days = spans[state.exportPeriod];
  return {
    startKey: toDateKey(days ? addDays(today, -days) : startOfMonth(today)),
    endKey: toDateKey(today),
  };
}

export function renderSheetsTab() {
  PERIODS.forEach((p) => {
    $(`pbtn-${p}`)?.classList.toggle('active', state.exportPeriod === p);
  });
  state.exportPeriod === 'custom' ? show('custom-range-box') : hide('custom-range-box');

  if (isGuest()) {
    setHtml(
      'sheet-preview-table',
      '<tr><td style="padding:14px; color:var(--text-sub); font-size:12px;">' +
        'Export ke liye Google se sign in kijiye — data server se generate hota hai.</td></tr>'
    );
    setText('preview-row-counter', '—');
    return;
  }

  setHtml(
    'sheet-preview-table',
    '<tr><td style="padding:14px; color:var(--text-sub); font-size:12px;">' +
      '⏳ Report generate ho rahi hai…</td></tr>'
  );

  const { startKey, endKey } = getExportRange();
  fetchExport(state.exportPeriod, startKey, endKey)
    .then((data) => {
      lastExport = data;
      setText('exp-kpi-days', String(data.meta.daysCount));
      setText('exp-kpi-logs', String(data.meta.totalLogs));
      setText('exp-kpi-rate', `${data.meta.rate}%`);
      setText('preview-row-counter', `${data.rows.length} rows`);

      const head = `<tr>${data.header.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
      const body = data.rows
        .slice(0, 60)
        .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
        .join('');
      setHtml('sheet-preview-table', head + body);
    })
    .catch((err) => {
      console.error('[HabitPulse] export fetch:', err);
      setHtml(
        'sheet-preview-table',
        `<tr><td style="padding:14px; color:var(--rose); font-size:12px;">` +
          `Report nahi ban payi: ${escapeHtml(err.message || err.code || 'unknown error')}</td></tr>`
      );
    });
}

export async function handleDownloadCSV() {
  if (isGuest()) return toast('Pehle sign in kijiye');
  try {
    const { startKey, endKey } = getExportRange();
    const data = lastExport ?? (await fetchExport(state.exportPeriod, startKey, endKey));
    downloadCSV(data.header, data.rows, state.exportPeriod);
    toast('⬇️ CSV download ho gayi');
  } catch (err) {
    toast(`CSV fail: ${err.message || err.code}`);
  }
}

export async function handleCopyTSV() {
  if (isGuest()) return toast('Pehle sign in kijiye');
  try {
    const { startKey, endKey } = getExportRange();
    const data = lastExport ?? (await fetchExport(state.exportPeriod, startKey, endKey));
    await navigator.clipboard.writeText(toTSV(data.header, data.rows));
    toast('📋 Copy ho gaya — sheets.new kholkar Ctrl+V');
  } catch {
    toast('Clipboard access nahi mila');
  }
}

export async function handleGoogleSheet() {
  if (isGuest()) return toast('Pehle sign in kijiye');
  toast('⏳ Google Sheet ban rahi hai…');
  try {
    const { startKey, endKey } = getExportRange();
    const url = await exportToGoogleSheet(state.exportPeriod, startKey, endKey);
    window.open(url, '_blank', 'noopener');
    toast('✅ Sheet aapki Drive mein ban gayi');
  } catch (err) {
    console.error('[HabitPulse] sheet export:', err);
    toast(`Sheet fail: ${err.message || err.code}`);
  }
}
