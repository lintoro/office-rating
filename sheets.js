const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

/**
 * Initialize Google Sheets API Client
 */
function getSheetsClient(credPath) {
  const absoluteCredPath = path.isAbsolute(credPath) ? credPath : path.join(process.cwd(), credPath);
  if (!fs.existsSync(absoluteCredPath)) {
    throw new Error(`找不到 Service Account 金鑰檔案: ${absoluteCredPath}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: absoluteCredPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Get header mapping and pending rows from sheet
 */
async function fetchSheetData(config) {
  const sheets = getSheetsClient(config.GOOGLE_APPLICATION_CREDENTIALS);
  const spreadsheetId = config.SPREADSHEET_ID;
  const sheetName = config.SHEET_NAME || '工作表1';

  if (!spreadsheetId || spreadsheetId === 'your_google_sheet_id_here') {
    throw new Error('SPREADSHEET_ID 未設定或未填寫正確');
  }

  // Fetch header and rows
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A1:Z2000`,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) {
    throw new Error(`工作表 ${sheetName} 是空的，請先建立標題列！`);
  }

  const header = rows[0].map(h => (h || '').trim());
  
  // Column index map
  const colIndex = {
    prompt: header.indexOf(config.PROMPT_COLUMN || 'prompt'),
    status: header.indexOf(config.STATUS_COLUMN || 'status'),
    image_url: header.indexOf(config.IMAGE_URL_COLUMN || 'image_url'),
    image_path: header.indexOf(config.IMAGE_PATH_COLUMN || 'image_path'),
    model: header.indexOf(config.MODEL_COLUMN || 'model'),
    generated_at: header.indexOf(config.GENERATED_AT_COLUMN || 'generated_at'),
    error: header.indexOf(config.ERROR_COLUMN || 'error'),
  };

  if (colIndex.prompt === -1 || colIndex.status === -1) {
    throw new Error(`試算表標題列缺少必要的欄位 (${config.PROMPT_COLUMN} 或 ${config.STATUS_COLUMN})！現有標題為: ${header.join(', ')}`);
  }

  const pendingStatuses = (config.PENDING_STATUSES || ',TODO,QUEUED,RETRY')
    .split(',')
    .map(s => s.trim().toUpperCase());

  const pendingRows = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const promptVal = (row[colIndex.prompt] || '').trim();
    const statusVal = (row[colIndex.status] || '').trim().toUpperCase();

    if (promptVal && (pendingStatuses.includes(statusVal) || statusVal === '')) {
      pendingRows.push({
        rowIndex: i + 1, // 1-indexed row number in Google Sheet
        prompt: promptVal,
        rawRow: row
      });
    }
  }

  return { sheets, header, colIndex, pendingRows };
}

/**
 * Update specific cells of a row in Google Sheet
 */
async function updateRowData(sheets, config, rowIndex, updateFields) {
  const spreadsheetId = config.SPREADSHEET_ID;
  const sheetName = config.SHEET_NAME || '工作表1';
  const colIndex = config._colIndex;

  // First fetch the current row so we don't overwrite unrelated columns
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A${rowIndex}:Z${rowIndex}`,
  });

  const rowValues = (res.data.values && res.data.values[0]) ? res.data.values[0] : [];

  // Make sure rowValues length accommodates all required column indices
  const maxIdx = Math.max(...Object.values(colIndex));
  while (rowValues.length <= maxIdx) {
    rowValues.push('');
  }

  for (const [key, val] of Object.entries(updateFields)) {
    if (colIndex[key] !== undefined && colIndex[key] !== -1) {
      rowValues[colIndex[key]] = val;
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowValues],
    },
  });
}

/**
 * Ensure header row exists in Google Sheet
 */
async function ensureHeader(config) {
  const sheets = getSheetsClient(config.GOOGLE_APPLICATION_CREDENTIALS);
  const spreadsheetId = config.SPREADSHEET_ID;
  const sheetName = config.SHEET_NAME || '工作表1';

  const defaultHeaders = [
    config.PROMPT_COLUMN || 'prompt',
    config.STATUS_COLUMN || 'status',
    config.IMAGE_URL_COLUMN || 'image_url',
    config.IMAGE_PATH_COLUMN || 'image_path',
    config.MODEL_COLUMN || 'model',
    config.GENERATED_AT_COLUMN || 'generated_at',
    config.ERROR_COLUMN || 'error'
  ];

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A1:Z1`,
  });

  const existing = res.data.values && res.data.values[0];
  if (!existing || existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [defaultHeaders] }
    });
    console.log(`✅ 已自動建立試算表標題列: ${defaultHeaders.join(' | ')}`);
  }
}

module.exports = {
  fetchSheetData,
  updateRowData,
  ensureHeader
};
