// 全域變數
let currentManager = null;
let currentEmployeesCache = [];

// DOM 載入後執行
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  bindFormEvents();
});

// 1. 檢查身分驗證
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();

    if (data.authenticated) {
      currentManager = data.manager;
      showDashboardView();
    } else {
      showLoginView();
    }
  } catch (err) {
    console.error('檢查身分驗證失敗:', err);
    showLoginView();
  }
}

function showLoginView() {
  document.getElementById('login-view').classList.remove('d-none');
  document.getElementById('dashboard-view').classList.add('d-none');
}

function showDashboardView() {
  document.getElementById('login-view').classList.add('d-none');
  document.getElementById('dashboard-view').classList.remove('d-none');

  if (currentManager) {
    document.getElementById('nav-manager-name').textContent = currentManager.name;
    document.getElementById('nav-manager-avatar').textContent = currentManager.name.charAt(0);
  }

  loadDashboard();
}

// 快速登入填寫
function quickLogin(username, password) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = password;
  document.getElementById('login-form').requestSubmit();
}

// 事件繫結
function bindFormEvents() {
  // 登入表單
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value.trim();

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();
      if (data.success) {
        currentManager = data.manager;
        Swal.fire({
          icon: 'success',
          title: `歡迎登入，${data.manager.name}！`,
          timer: 1500,
          showConfirmButton: false
        });
        showDashboardView();
      } else {
        Swal.fire('登入失敗', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('錯誤', '系統連線異常', 'error');
    }
  });

  // 新增員工表單
  document.getElementById('add-employee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-emp-name').value.trim();
    const department = document.getElementById('new-emp-dept').value.trim();
    const title = document.getElementById('new-emp-title').value.trim();
    const points = document.getElementById('new-emp-points').value;

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, department, title, points })
      });
      const data = await res.json();
      if (data.success) {
        // 關閉 Modal
        const modalEl = document.getElementById('addEmployeeModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal.hide();
        document.getElementById('add-employee-form').reset();

        Swal.fire({
          icon: 'success',
          title: '建立成功',
          text: `新同仁 ${name} 已加入辦公室評分系統`,
          timer: 1500,
          showConfirmButton: false
        });
        loadDashboard();
      } else {
        Swal.fire('建立失敗', data.message, 'error');
      }
    } catch (err) {
      Swal.fire('錯誤', '連線伺服器失敗', 'error');
    }
  });

  // 自訂評分表單
  document.getElementById('custom-point-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const empId = document.getElementById('modal-emp-id').value;
    const delta = document.getElementById('modal-point-delta').value;
    const reason = document.getElementById('modal-point-reason').value.trim();

    await submitPointAdjustment(empId, delta, reason);

    const modalEl = document.getElementById('customPointModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
  });
}

// 登出
async function handleLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    currentManager = null;
    showLoginView();
    Swal.fire({
      icon: 'info',
      title: '已安全登出',
      timer: 1200,
      showConfirmButton: false
    });
  } catch (err) {
    console.error('登出異常:', err);
  }
}

// 2. 載入儀表板資料
async function loadDashboard() {
  await Promise.all([renderEmployees(), renderRecentLogs()]);
}

// 渲染員工列表
async function renderEmployees() {
  try {
    const res = await fetch('/api/employees');
    const data = await res.json();
    if (!data.success) return;

    const employees = data.employees;
    currentEmployeesCache = employees;

    // 計算頂部統計數據
    const totalCount = employees.length;
    const avgScore = totalCount > 0 ? Math.round(employees.reduce((acc, cur) => acc + cur.points, 0) / totalCount) : 0;
    const highPerformers = employees.filter(e => e.points >= 100).length;
    const needAttention = employees.filter(e => e.points < 80).length;

    document.getElementById('stat-total-emp').textContent = totalCount;
    document.getElementById('stat-avg-score').textContent = avgScore;
    document.getElementById('stat-high-performers').textContent = highPerformers;
    document.getElementById('stat-need-attention').textContent = needAttention;

    // 渲染卡片 HTML
    const container = document.getElementById('employee-list-container');
    container.innerHTML = '';

    employees.forEach(emp => {
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6';
      col.innerHTML = `
        <div class="card p-3 employee-card h-100">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <h5 class="fw-bold mb-1">${escapeHtml(emp.name)}</h5>
              <span class="badge bg-light text-secondary border me-1">${escapeHtml(emp.department)}</span>
              <span class="small text-muted">${escapeHtml(emp.title)}</span>
            </div>
            <span class="badge ${emp.rating.badgeClass} rating-badge">${emp.rating.label}</span>
          </div>

          <div class="d-flex align-items-baseline my-2">
            <span class="score-badge text-primary me-2">${emp.points}</span>
            <span class="text-muted small">當前總點數</span>
          </div>

          <div class="mt-3">
            <div class="d-flex gap-1 mb-2">
              <button class="btn btn-point btn-point-plus flex-fill" onclick="quickAdjustPoint(${emp.id}, 1)">+1 點</button>
              <button class="btn btn-point btn-point-plus flex-fill" onclick="quickAdjustPoint(${emp.id}, 5)">+5 點</button>
              <button class="btn btn-point btn-point-minus flex-fill" onclick="quickAdjustPoint(${emp.id}, -1)">-1 點</button>
              <button class="btn btn-point btn-point-minus flex-fill" onclick="quickAdjustPoint(${emp.id}, -5)">-5 點</button>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-outline-secondary btn-sm flex-fill" onclick="openCustomModal(${emp.id})">
                <i class="bi bi-pencil-square"></i> 自訂評分
              </button>
              <button class="btn btn-outline-primary btn-sm flex-fill" onclick="openHistoryModal(${emp.id})">
                <i class="bi bi-clock-history"></i> 異動履歷
              </button>
            </div>
          </div>
        </div>
      `;
      container.appendChild(col);
    });
  } catch (err) {
    console.error('渲染員工列表失敗:', err);
  }
}

// 渲染全公司最新動態
async function renderRecentLogs() {
  try {
    const res = await fetch('/api/logs/recent');
    const data = await res.json();
    if (!data.success) return;

    const logs = data.logs;
    const container = document.getElementById('recent-logs-container');

    if (logs.length === 0) {
      container.innerHTML = '<div class="text-muted text-center py-3">尚無評分紀錄</div>';
      return;
    }

    let html = '<div class="timeline">';
    logs.forEach(log => {
      const isPositive = log.delta > 0;
      const deltaClass = isPositive ? 'text-success' : 'text-danger';
      const deltaSign = isPositive ? '+' : '';

      html += `
        <div class="timeline-item">
          <div class="d-flex justify-content-between align-items-center">
            <span class="fw-bold">${escapeHtml(log.employee_name)}</span>
            <span class="fw-bold ${deltaClass}">${deltaSign}${log.delta} 點</span>
          </div>
          <div class="small text-dark mt-1">${escapeHtml(log.reason)}</div>
          <div class="small text-muted mt-1" style="font-size: 0.75rem;">
            <i class="bi bi-person me-1"></i>${escapeHtml(log.manager_name)} ・ ${log.created_at}
          </div>
        </div>
      `;
    });
    html += '</div>';

    container.innerHTML = html;
  } catch (err) {
    console.error('渲染最新動態失敗:', err);
  }
}

// 快捷點數調整（跳出填寫具體理由彈窗）
async function quickAdjustPoint(empId, delta) {
  const emp = currentEmployeesCache.find(e => e.id === empId);
  if (!emp) return;

  const isPositive = delta > 0;
  const deltaText = isPositive ? `+${delta}` : `${delta}`;
  const badgeClass = isPositive ? 'text-success' : 'text-danger';

  // 快捷常見標籤
  const commonReasons = isPositive
    ? ['完成階段專案任務', '主動協助團隊同仁', '客戶滿意度好評', '優化工作流程']
    : ['未於期限內交付作業', '會議無故遲到/缺席', '工作品質出現重大瑕疵', '未遵守團隊規範'];

  const tagsHtml = commonReasons.map(r => 
    `<button type="button" class="btn btn-outline-secondary btn-sm me-1 mb-1 tag-btn" onclick="document.getElementById('swal-reason-input').value='${r}'">${r}</button>`
  ).join('');

  const { value: formValues } = await Swal.fire({
    title: `評分調整：${escapeHtml(emp.name)}`,
    html: `
      <div class="mb-3">
        <span class="fs-4 fw-bold ${badgeClass}">${deltaText} 點</span>
        <div class="text-muted small">請輸入增加或減少此點數的具體理由</div>
      </div>
      <div class="mb-2 text-start">
        <label class="form-label small fw-bold">快捷理由標籤 (點擊帶入)：</label>
        <div>${tagsHtml}</div>
      </div>
      <div class="text-start">
        <label class="form-label small fw-bold">具體理由事由 <span class="text-danger">*</span></label>
        <textarea id="swal-reason-input" class="form-control" rows="3" placeholder="請填寫具體表現或事由（必填）..."></textarea>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: '確定送出評分',
    cancelButtonText: '取消',
    confirmButtonColor: isPositive ? '#198754' : '#dc3545',
    preConfirm: () => {
      const reason = document.getElementById('swal-reason-input').value.trim();
      if (!reason) {
        Swal.showValidationMessage('請輸入具體增加或減少的理由！');
        return false;
      }
      return { reason };
    }
  });

  if (formValues && formValues.reason) {
    await submitPointAdjustment(empId, delta, formValues.reason);
  }
}

// 提交點數調整到 API
async function submitPointAdjustment(empId, delta, reason) {
  try {
    const res = await fetch(`/api/employees/${empId}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta, reason })
    });
    const data = await res.json();

    if (data.success) {
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true
      });
      Toast.fire({
        icon: delta > 0 ? 'success' : 'warning',
        title: data.message
      });

      // 重新整理資料
      loadDashboard();
    } else {
      Swal.fire('操作失敗', data.message, 'error');
    }
  } catch (err) {
    Swal.fire('錯誤', '連線異常', 'error');
  }
}

// 打開自訂評分 Modal
function openCustomModal(empId) {
  const emp = currentEmployeesCache.find(e => e.id === empId);
  if (!emp) return;

  document.getElementById('modal-emp-id').value = emp.id;
  document.getElementById('modal-emp-name').textContent = emp.name;
  document.getElementById('modal-emp-info').textContent = `${emp.department} ・ ${emp.title} (當前: ${emp.points}點)`;
  document.getElementById('modal-point-delta').value = '';
  document.getElementById('modal-point-reason').value = '';

  const modal = new bootstrap.Modal(document.getElementById('customPointModal'));
  modal.show();
}

// 打開歷程紀錄 Modal
async function openHistoryModal(empId) {
  try {
    const res = await fetch(`/api/employees/${empId}`);
    const data = await res.json();
    if (!data.success) return;

    const emp = data.employee;

    document.getElementById('history-emp-name').textContent = emp.name;
    document.getElementById('history-emp-dept').textContent = `${emp.department} ・ ${emp.title}`;
    document.getElementById('history-emp-score').textContent = `${emp.points} 點`;

    const badgeEl = document.getElementById('history-emp-badge');
    badgeEl.className = `badge ${emp.rating.badgeClass}`;
    badgeEl.textContent = emp.rating.label;

    const tbody = document.getElementById('history-logs-tbody');
    tbody.innerHTML = '';

    if (!emp.logs || emp.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">尚無評分紀錄</td></tr>';
    } else {
      emp.logs.forEach(log => {
        const isPositive = log.delta > 0;
        const deltaClass = isPositive ? 'text-success fw-bold' : 'text-danger fw-bold';
        const deltaSign = isPositive ? '+' : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="small text-muted">${log.created_at}</td>
          <td><span class="badge bg-secondary-subtle text-dark border">${escapeHtml(log.manager_name)}</span></td>
          <td class="${deltaClass}">${deltaSign}${log.delta}</td>
          <td>${escapeHtml(log.reason)}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    const modal = new bootstrap.Modal(document.getElementById('empLogsModal'));
    modal.show();
  } catch (err) {
    console.error('取得歷程失敗:', err);
  }
}

// XSS 防範工具
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
