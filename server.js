const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session 配置
app.use(
  session({
    secret: 'antigravity-employee-rating-secret-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
  })
);

// 靜態檔案
app.use(express.static(path.join(__dirname, 'public')));

// 驗證 Middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.manager) {
    return next();
  }
  return res.status(401).json({ success: false, message: '請先登入管理幹部帳號' });
}

// 1. 登入 API
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '請輸入帳號與密碼' });
  }

  const manager = db.findManager(username, password);
  if (!manager) {
    return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
  }

  req.session.manager = {
    username: manager.username,
    name: manager.name
  };

  return res.json({
    success: true,
    message: '登入成功',
    manager: req.session.manager
  });
});

// 2. 登出 API
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: '登出失敗' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: '已成功登出' });
  });
});

// 3. 取得目前登入狀態 API
app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.manager) {
    return res.json({
      authenticated: true,
      manager: req.session.manager,
      allManagers: db.getManagers()
    });
  }
  return res.json({ authenticated: false });
});

// 4. 取得所有員工列表 API
app.get('/api/employees', requireAuth, (req, res) => {
  try {
    const employees = db.getEmployees();
    return res.json({ success: true, employees });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// 5. 取得特定員工詳細資料與履歷 API
app.get('/api/employees/:id', requireAuth, (req, res) => {
  try {
    const employee = db.getEmployeeById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, message: '找不到該員工' });
    }
    return res.json({ success: true, employee });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// 6. 新增員工 API
app.post('/api/employees', requireAuth, (req, res) => {
  try {
    const { name, department, title, points } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: '員工姓名為必填項目' });
    }
    const newEmp = db.addEmployee(name.trim(), department, title, points);
    return res.json({ success: true, message: '員工建立成功', employee: newEmp });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// 7. 調整員工點數 API
app.post('/api/employees/:id/points', requireAuth, (req, res) => {
  try {
    const { delta, reason } = req.body;
    const manager = req.session.manager;

    const result = db.adjustPoints(req.params.id, delta, reason, manager);
    return res.json({
      success: true,
      message: `成功為 ${result.updatedEmployee.name} ${delta > 0 ? '+' : ''}${delta} 點！`,
      employee: result.updatedEmployee,
      log: result.log
    });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// 8. 全公司最新點數異動動態 API
app.get('/api/logs/recent', requireAuth, (req, res) => {
  try {
    const logs = db.getRecentLogs(15);
    return res.json({ success: true, logs });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// 啟動 Server
app.listen(PORT, () => {
  console.log(`=== 員工評分與點數管理系統 (小辦公室版) 已於 http://localhost:${PORT} 啟動 ===`);
});
