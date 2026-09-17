const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1b9IUhQ2d62vEws0lq0Ly1ZJkXrgxLx7MABE8wY_m2kQ';
const SHEET_EMPLOYEES = '員工評分清單';
const SHEET_LOGS = '評分異動紀錄';
const SHEET_MANAGERS = '管理幹部名單';

function getSheetsClient() {
  let auth;
  
  // 1. 優先嘗試 Render 環境變數 JSON
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } catch (e) {
      console.error('解析 GOOGLE_SERVICE_ACCOUNT_JSON 失敗:', e.message);
    }
  }

  // 2. 若無環境變數，讀取本地 service-account.json
  if (!auth) {
    const credPath = path.join(process.cwd(), 'service-account.json');
    if (fs.existsSync(credPath)) {
      auth = new google.auth.GoogleAuth({
        keyFile: credPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }
  }

  if (!auth) {
    return null;
  }

  return google.sheets({ version: 'v4', auth });
}

// 評價等級計算
function calculateRating(points) {
  if (points >= 120) return { grade: 'S', label: '卓越 (S)', badgeClass: 'bg-danger' };
  if (points >= 100) return { grade: 'A', label: '優秀 (A)', badgeClass: 'bg-success' };
  if (points >= 80) return { grade: 'B', label: '良好 (B)', badgeClass: 'bg-primary' };
  if (points >= 60) return { grade: 'C', label: '尚可 (C)', badgeClass: 'bg-warning text-dark' };
  return { grade: 'D', label: '需加強 (D)', badgeClass: 'bg-secondary' };
}

// 確保工作表分頁與標題列存在
async function ensureSheetsExist(sheets) {
  if (!sheets) return;
  try {
    const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existingTitles = res.data.sheets.map(s => s.properties.title);

    const requests = [];
    if (!existingTitles.includes(SHEET_EMPLOYEES)) {
      requests.push({ addSheet: { properties: { title: SHEET_EMPLOYEES } } });
    }
    if (!existingTitles.includes(SHEET_LOGS)) {
      requests.push({ addSheet: { properties: { title: SHEET_LOGS } } });
    }
    if (!existingTitles.includes(SHEET_MANAGERS)) {
      requests.push({ addSheet: { properties: { title: SHEET_MANAGERS } } });
    }

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: { requests }
      });
      console.log('✅ 成功在 Google 試算表建立分頁:', requests.map(r => r.addSheet.properties.title).join(', '));
    }

    // 檢查標題列
    await initHeaders(sheets);
  } catch (e) {
    console.error('確保工作表存在時出錯:', e.message);
  }
}

async function initHeaders(sheets) {
  // 1. 員工分頁標題與預設資料
  const empRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_EMPLOYEES}'!A1:G1`
  }).catch(() => null);

  if (!empRes || !empRes.data.values || empRes.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_EMPLOYEES}'!A1:G5`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [
          ['員工ID', '姓名', '部門', '職稱', '當前累積點數', '綜合評價等級', '最後更新時間'],
          [1, '王小明', '專案開發部', '軟體工程師', 100, '優秀 (A)', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })],
          [2, '陳美玲', '專案開發部', 'UI/UX 設計師', 105, '優秀 (A)', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })],
          [3, '林志豪', '市場營運部', '行銷企劃', 92, '良好 (B)', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })],
          [4, '黃怡君', '行政管理部', '行政專員', 115, '優秀 (A)', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })]
        ]
      }
    });
  }

  // 2. 異動紀錄分頁標題
  const logRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_LOGS}'!A1:G1`
  }).catch(() => null);

  if (!logRes || !logRes.data.values || logRes.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_LOGS}'!A1:G4`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [
          ['紀錄ID', '員工ID', '員工姓名', '評分幹部', '點數變更', '具體表現理由', '評分時間'],
          [1, 1, '王小明', '張經理 (主管 A)', '+5', '完成階段性 API 開發與測試', new Date(Date.now() - 86400000 * 2).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })],
          [2, 3, '林志豪', '李課長 (主管 B)', '-8', '未於期限內繳交市場分析報告', new Date(Date.now() - 86400000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })],
          [3, 4, '黃怡君', '張經理 (主管 A)', '+15', '優化辦公室資產採購流程，節省公司成本', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })]
        ]
      }
    });
  }

  // 3. 管理幹部標題
  const mgrRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_MANAGERS}'!A1:D1`
  }).catch(() => null);

  if (!mgrRes || !mgrRes.data.values || mgrRes.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${SHEET_MANAGERS}'!A1:D3`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [
          ['幹部ID', '登入帳號', '密碼', '幹部名稱/職稱'],
          [1, 'manager1', '123', '張經理 (主管 A)'],
          [2, 'manager2', '123', '李課長 (主管 B)']
        ]
      }
    });
  }
}

module.exports = {
  getSheetsClient,
  ensureSheetsExist,
  SPREADSHEET_ID,
  SHEET_EMPLOYEES,
  SHEET_LOGS,
  SHEET_MANAGERS,
  calculateRating
};
