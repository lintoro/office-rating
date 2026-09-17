const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data.json');

// 初始化預設資料
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
      console.error('讀取 data.json 失敗，重新初始化預設值', e);
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
      dbData = defaultData;
    }
  }
}

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf-8');
}

loadDb();

// 評價計算邏輯
function calculateRating(points) {
  if (points >= 120) return { grade: 'S', label: '卓越 (S)', badgeClass: 'bg-danger' };
  if (points >= 100) return { grade: 'A', label: '優秀 (A)', badgeClass: 'bg-success' };
  if (points >= 80) return { grade: 'B', label: '良好 (B)', badgeClass: 'bg-primary' };
  if (points >= 60) return { grade: 'C', label: '尚可 (C)', badgeClass: 'bg-warning text-dark' };
  return { grade: 'D', label: '需加強 (D)', badgeClass: 'bg-secondary' };
}

module.exports = {
  // 管理員登入比對
  findManager(username, password) {
    return dbData.managers.find(m => m.username === username && m.password === password);
  },

  // 取得管理者列表
  getManagers() {
    return dbData.managers.map(m => ({ username: m.username, name: m.name }));
  },

  // 取得所有員工與評價
  getEmployees() {
    return dbData.employees.map(emp => {
      const rating = calculateRating(emp.points);
      return {
        ...emp,
        rating
      };
    });
  },

  // 取得特定員工詳細資料與歷史紀錄
  getEmployeeById(id) {
    const emp = dbData.employees.find(e => e.id === Number(id));
    if (!emp) return null;
    const rating = calculateRating(emp.points);
    const logs = dbData.point_logs
      .filter(l => l.employee_id === Number(id))
      .sort((a, b) => b.id - a.id);
    return {
      ...emp,
      rating,
      logs
    };
  },

  // 新增員工
  addEmployee(name, department, title, initialPoints = 100) {
    const newId = dbData.employees.length > 0 ? Math.max(...dbData.employees.map(e => e.id)) + 1 : 1;
    const newEmp = {
      id: newId,
      name,
      department: department || '通用部門',
      title: title || '一般同仁',
      points: Number(initialPoints) || 100
    };
    dbData.employees.push(newEmp);
    saveDb();
    return newEmp;
  },

  // 點數異動 (+ / -)
  adjustPoints(employeeId, delta, reason, manager) {
    const emp = dbData.employees.find(e => e.id === Number(employeeId));
    if (!emp) throw new Error('找不到該員工');

    const numDelta = Number(delta);
    if (isNaN(numDelta) || numDelta === 0) throw new Error('無效的點數異動數值');

    emp.points += numDelta;

    const logId = dbData.point_logs.length > 0 ? Math.max(...dbData.point_logs.map(l => l.id)) + 1 : 1;
    const newLog = {
      id: logId,
      employee_id: Number(employeeId),
      manager_username: manager.username,
      manager_name: manager.name,
      delta: numDelta,
      reason: reason || (numDelta > 0 ? '表現優良獎勵' : '規章違規扣分'),
      created_at: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
    };

    dbData.point_logs.push(newLog);
    saveDb();

    return {
      updatedEmployee: {
        ...emp,
        rating: calculateRating(emp.points)
      },
      log: newLog
    };
  },

  // 取得最新幾條全公司異動日誌
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
