const fs = require('fs');
const path = require('path');
const sheetsSync = require('./sheets_sync');

const DB_FILE = path.join(__dirname, 'data.json');

// 預設關聯記憶體備份
const defaultData = {
  managers: [
    { id: 1, username: 'manager1', password: '123', name: '張經理 (主管 A)' },
    { id: 2, username: 'manager2', password: '123', name: '李課長 (主管 B)' }
  ],
  employees: [
    { id: 1, name: '王小明', department: '專案開發部', points: 100, title: '軟體工程師' },
    { id: 2, name: '陳美玲', department: '專案開發部', points: 105, title: 'UI/UX 設計師' },
    { id: 3, name: '林志豪', department: '市場營運部', points: 92, title: '行銷企劃' },
    { id: 4, name: '黃怡君', department: '行政管理部', points: 115, title: '行政專員' }
  ],
  point_logs: [
    {
      id: 1,
      employee_id: 1,
      manager_username: 'manager1',
      manager_name: '張經理 (主管 A)',
      delta: 5,
      reason: '完成階段性 API 開發與測試',
      created_at: new Date(Date.now() - 86400000 * 2).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
    },
    {
      id: 2,
      employee_id: 3,
      manager_username: 'manager2',
      manager_name: '李課長 (主管 B)',
      delta: -8,
      reason: '未於期限內繳交市場分析報告',
      created_at: new Date(Date.now() - 86400000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
    },
    {
      id: 3,
      employee_id: 4,
      manager_username: 'manager1',
      manager_name: '張經理 (主管 A)',
      delta: 15,
      reason: '優化辦公室資產採購流程，節省公司成本',
      created_at: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
    }
  ]
};

let dbData = null;

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    dbData = defaultData;
  } else {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      dbData = JSON.parse(raw);
    } catch (e) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
      dbData = defaultData;
    }
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf-8');
  } catch (e) {
    console.error('寫入 data.json 失敗:', e.message);
  }
}

loadDb();

// 初始化 Google Sheets 結構
(async () => {
  try {
    const sheets = sheetsSync.getSheetsClient();
    if (sheets) {
      await sheetsSync.ensureSheetsExist(sheets);
      console.log('✅ 已與 Google 試算表完成初始化同步 (Spreadsheet ID:', sheetsSync.SPREADSHEET_ID, ')');
    }
  } catch (e) {
    console.error('Google Sheets 初始化失敗 (回退至本地機制):', e.message);
  }
})();

module.exports = {
  findManager(username, password) {
    return dbData.managers.find(m => m.username === username && m.password === password);
  },

  getManagers() {
    return dbData.managers.map(m => ({ username: m.username, name: m.name }));
  },

  getEmployees() {
    return dbData.employees.map(emp => {
      const rating = sheetsSync.calculateRating(emp.points);
      return {
        ...emp,
        rating
      };
    });
  },

  getEmployeeById(id) {
    const emp = dbData.employees.find(e => e.id === Number(id));
    if (!emp) return null;
    const rating = sheetsSync.calculateRating(emp.points);
    const logs = dbData.point_logs
      .filter(l => l.employee_id === Number(id))
      .sort((a, b) => b.id - a.id);
    return {
      ...emp,
      rating,
      logs
    };
  },

  addEmployee(name, department, title, initialPoints = 100) {
    const newId = dbData.employees.length > 0 ? Math.max(...dbData.employees.map(e => e.id)) + 1 : 1;
    const pointsNum = Number(initialPoints) || 100;
    const ratingObj = sheetsSync.calculateRating(pointsNum);

    const newEmp = {
      id: newId,
      name,
      department: department || '通用部門',
      title: title || '一般同仁',
      points: pointsNum
    };
    dbData.employees.push(newEmp);
    saveDb();

    // 異步寫入 Google Sheets
    (async () => {
      try {
        const sheets = sheetsSync.getSheetsClient();
        if (sheets) {
          const nowStr = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
          await sheets.spreadsheets.values.append({
            spreadsheetId: sheetsSync.SPREADSHEET_ID,
            range: `'${sheetsSync.SHEET_EMPLOYEES}'!A:G`,
            valueInputOption: 'USER_ENTERED',
            resource: {
              values: [[newId, name, newEmp.department, newEmp.title, pointsNum, ratingObj.label, nowStr]]
            }
          });
        }
      } catch (e) {
        console.error('寫入 Google Sheets 失敗:', e.message);
      }
    })();

    return { ...newEmp, rating: ratingObj };
  },

  adjustPoints(employeeId, delta, reason, manager) {
    const emp = dbData.employees.find(e => e.id === Number(employeeId));
    if (!emp) throw new Error('找不到該員工');

    const numDelta = Number(delta);
    if (isNaN(numDelta) || numDelta === 0) throw new Error('無效的點數異動數值');

    emp.points += numDelta;
    const ratingObj = sheetsSync.calculateRating(emp.points);

    const logId = dbData.point_logs.length > 0 ? Math.max(...dbData.point_logs.map(l => l.id)) + 1 : 1;
    const nowStr = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    const deltaStr = numDelta > 0 ? `+${numDelta}` : `${numDelta}`;

    const newLog = {
      id: logId,
      employee_id: Number(employeeId),
      manager_username: manager.username,
      manager_name: manager.name,
      delta: numDelta,
      reason: reason || (numDelta > 0 ? '表現優良獎勵' : '規章違規扣分'),
      created_at: nowStr
    };

    dbData.point_logs.push(newLog);
    saveDb();

    // 同步更新 Google Sheets (1. 異動紀錄 Append  2. 員工清單總分覆蓋)
    (async () => {
      try {
        const sheets = sheetsSync.getSheetsClient();
        if (sheets) {
          // 1. 新增異動紀錄
          await sheets.spreadsheets.values.append({
            spreadsheetId: sheetsSync.SPREADSHEET_ID,
            range: `'${sheetsSync.SHEET_LOGS}'!A:G`,
            valueInputOption: 'USER_ENTERED',
            resource: {
              values: [[logId, emp.id, emp.name, manager.name, deltaStr, newLog.reason, nowStr]]
            }
          });

          // 2. 更新或追加員工清單列
          const empRes = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetsSync.SPREADSHEET_ID,
            range: `'${sheetsSync.SHEET_EMPLOYEES}'!A1:A500`
          });
          const rows = empRes.data.values || [];
          let targetRowIndex = -1;
          for (let i = 1; i < rows.length; i++) {
            if (rows[i] && Number(rows[i][0]) === emp.id) {
              targetRowIndex = i + 1; // 1-based index
              break;
            }
          }

          if (targetRowIndex > 0) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: sheetsSync.SPREADSHEET_ID,
              range: `'${sheetsSync.SHEET_EMPLOYEES}'!A${targetRowIndex}:G${targetRowIndex}`,
              valueInputOption: 'USER_ENTERED',
              resource: {
                values: [[emp.id, emp.name, emp.department, emp.title, emp.points, ratingObj.label, nowStr]]
              }
            });
          }
        }
      } catch (e) {
        console.error('同步 Google Sheets 異動失敗:', e.message);
      }
    })();

    return {
      updatedEmployee: {
        ...emp,
        rating: ratingObj
      },
      log: newLog
    };
  },

  getRecentLogs(limit = 10) {
    return dbData.point_logs
      .slice()
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map(log => {
        const emp = dbData.employees.find(e => e.id === log.employee_id);
        return {
          ...log,
          employee_name: emp ? emp.name : '未知員工'
        };
      });
  }
};
