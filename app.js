/* ===== ESTADO ===== */
const ACCOUNTS = [
  { id: "corriente", name: "Corriente", type: "normal" },
  { id: "conjunta", name: "Conjunta", type: "conjunta" },
  { id: "triodos", name: "Triodos", type: "normal" },
  { id: "trade", name: "Trade Republic", type: "remunerada" }
];

let state = {
  currentAccount: "corriente",
  currentMonth: new Date().toISOString().slice(0, 7),
  balances: { corriente: 2115.40, conjunta: 0, triodos: 0, trade: 6420.80 },
  tradeSplit: { yo: 3100, ella: 3320.80, interestRate: 2.45 },
  categories: {
    corriente: [
      { id: "vivienda", name: "Vivienda", emoji: "", budget: 450, spent: 415.50 },
      { id: "suministros", name: "Suministros", emoji: "", budget: 80, spent: 68.45 },
      { id: "alimentacion", name: "Alimentación", emoji: "", budget: 180, spent: 147.79 },
      { id: "vestir", name: "Vestir, higiene y peluquería", emoji: "", budget: 90, spent: 78.75 },
      { id: "mobiliario", name: "Mobiliario y hogar", emoji: "", budget: 60, spent: 27.00 },
      { id: "salud", name: "Salud y gym", emoji: "", budget: 70, spent: 63.19 },
      { id: "coche", name: "Coche", emoji: "", budget: 250, spent: 237.10 },
      { id: "ocio", name: "Ocio y cultura", emoji: "", budget: 30, spent: 9.20 },
      { id: "bares", name: "Bares y restaurantes", emoji: "", budget: 220, spent: 221.85 },
      { id: "regalos", name: "Regalos", emoji: "", budget: 50, spent: 43.00 },
      { id: "viajes", name: "Viajes / vacaciones", emoji: "", budget: 300, spent: 64.00 },
      { id: "otros", name: "Otros", emoji: "", budget: 100, spent: 0 }
    ],
    conjunta: [],
    triodos: [],
    trade: []
  },
  movements: { corriente: [], conjunta: [], triodos: [], trade: [] },
  incomeMonth: { corriente: 2061.63, conjunta: 0, triodos: 0, trade: 0 },
  goals: [
    { id: "japon", name: "Viaje a Japón", target: 3000, saved: 1800 },
    { id: "emergencia", name: "Fondo de emergencia", target: 2000, saved: 1550 }
  ],
  history: []
};

let useFirebase = false;
try {
  if (typeof db !== "undefined") {
    useFirebase = true;
    db.on("value", snap => {
      const data = snap.val();
      if (data) { state = data; renderAll(); }
      else { persist(); }
    });
  }
} catch (e) { useFirebase = false; }

function persist() {
  localStorage.setItem("moneyManagerState", JSON.stringify(state));
  if (useFirebase) { try { db.set(state); } catch (e) {} }
}

if (!useFirebase) {
  const cached = localStorage.getItem("moneyManagerState");
  if (cached) state = JSON.parse(cached);
}

function fmt(n) {
  return (n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

/* ===== TABS ===== */
function switchTab(tab) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + tab).classList.add("active");
  document.querySelectorAll(".tabbar-item").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  if (tab === "analytics") renderAnalytics();
  if (tab === "historico") renderHistorico();
}

function closeModal(id) { document.getElementById(id).classList.remove("open"); }
function openModal(id) { document.getElementById(id).classList.add("open"); }

/* ===== CUENTAS ===== */
function renderAccountTabs() {
  const wrap = document.getElementById("account-tabs");
  wrap.innerHTML = ACCOUNTS.map(a =>
    `<div class="pill ${a.id === state.currentAccount ? "active" : ""}" onclick="selectAccount('${a.id}')">${a.name}</div>`
  ).join("");
}

function selectAccount(id) {
  state.currentAccount = id;
  renderAccounts();
}

function renderAccounts() {
  renderAccountTabs();
  const acc = ACCOUNTS.find(a => a.id === state.currentAccount);
  document.getElementById("balance-label").textContent = "Saldo " + acc.name.toLowerCase();
  document.getElementById("balance-value").textContent = fmt(state.balances[acc.id]);

  const splitRow = document.getElementById("split-row");
  if (acc.type === "remunerada") {
    splitRow.style.display = "flex";
    const ts = state.tradeSplit;
    splitRow.innerHTML = `
      <div class="split-chip"><p class="who">Tú</p><p class="amt">${fmt(ts.yo)}</p></div>
      <div class="split-chip"><p class="who">Ella</p><p class="amt">${fmt(ts.ella)}</p></div>`;
  } else { splitRow.style.display = "none"; }

  document.getElementById("income-summary-value").textContent = fmt(state.incomeMonth[acc.id]);

  const budgetCard = document.getElementById("budget-card");
  const cats = state.categories[acc.id] || [];
  if (acc.type === "remunerada") {
    budgetCard.style.display = "none";
  } else {
    budgetCard.style.display = "flex";
    const totalBudget = cats.reduce((s, c) => s + c.budget, 0);
    const totalSpent = cats.reduce((s, c) => s + c.spent, 0);
    document.getElementById("budget-text").textContent = `${fmt(totalSpent).replace(" €", "")} € / ${fmt(totalBudget).replace(" €", "")} €`;
    document.getElementById("budget-fill").style.width = totalBudget ? Math.min(100, (totalSpent / totalBudget) * 100) + "%" : "0%";
  }

  const moves = state.movements[acc.id] || [];
  document.getElementById("movements-list").innerHTML = moves.length
    ? moves.slice(-5).reverse().map(m => `<div class="movement-row"><span>${m.desc} · ${m.category || ""}</span><span>${fmt(m.amount)}</span></div>`).join("")
    : `<p class="empty-hint">Todavía no hay movimientos</p>`;

  document.getElementById("categories-label").textContent = acc.type === "remunerada" ? "Historial de aportaciones" : "Categorías";
  const catList = document.getElementById("categories-list");
  if (acc.type === "remunerada") {
    catList.innerHTML = `
      <div class="card teal-card" style="margin-bottom:12px;">
        <div><p class="label">Interés generado</p><p class="sub">Tipo actual: ${state.tradeSplit.interestRate}% TAE</p></div>
        <span class="value">${fmt(calcTradeInterest())}</span>
      </div>
      <div class="btn-row">
        <button class="btn" onclick="openTransferModal()">+ Aportar</button>
        <button class="btn" onclick="openModal('modal-interest')">% Editar interés</button>
      </div>`;
  } else {
    catList.innerHTML = cats.map((c, i) => {
      const tone = i % 2 === 0 ? "tone-a" : "tone-b";
      const pct = c.budget ? Math.min(100, (c.spent / c.budget) * 100) : 0;
      return `<div class="cat-card ${tone}" onclick="openExpenseModal('${c.id}')">
        <div class="cat-head"><span class="cat-name">${c.emoji ? c.emoji + " " : ""}${c.name}</span><span class="cat-amt">${fmt(c.spent)} / ${fmt(c.budget)}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>
      </div>`;
    }).join("");
  }
  persist();
}

function calcTradeInterest() {
  const ts = state.tradeSplit;
  const total = ts.yo + ts.ella;
  return total * (ts.interestRate / 100) / 12;
}

/* ===== INGRESO / APORTACIÓN ===== */
function openIncomeModal() {
  const sel = document.getElementById("income-account");
  sel.innerHTML = ACCOUNTS.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
  sel.value = state.currentAccount;
  toggleIncomeFields();
  sel.onchange = toggleIncomeFields;
  openModal("modal-income");
}

function toggleIncomeFields() {
  const acc = document.getElementById("income-account").value;
  const accInfo = ACCOUNTS.find(a => a.id === acc);
  document.getElementById("income-type-field").style.display = accInfo.type === "normal" ? "block" : "none";
  document.getElementById("income-who-field").style.display = accInfo.type === "conjunta" ? "block" : "none";
  document.getElementById("income-saving-field").style.display = acc === "ahorro" ? "block" : "none";
}

function saveIncome() {
  const acc = document.getElementById("income-account").value;
  const desc = document.getElementById("income-desc").value || "Ingreso";
  const amount = parseFloat(document.getElementById("income-amount").value) || 0;
  if (!amount) return;
  state.balances[acc] = (state.balances[acc] || 0) + amount;
  state.incomeMonth[acc] = (state.incomeMonth[acc] || 0) + amount;
  state.movements[acc] = state.movements[acc] || [];
  state.movements[acc].push({ desc, amount, category: "Ingreso" });
  closeModal("modal-income");
  renderAccounts();
}

/* ===== TRANSFERENCIA ===== */
function openTransferModal() {
  const from = document.getElementById("transfer-from");
  const to = document.getElementById("transfer-to");
  const opts = ACCOUNTS.map(a => `<option value="${a.id}">${a.name}</option>`).concat(
    state.goals.map(g => `<option value="goal:${g.id}">Ahorro · ${g.name}</option>`)
  ).join("");
  from.innerHTML = opts; to.innerHTML = opts;
  from.value = state.currentAccount;
  openModal("modal-transfer");
}

function saveTransfer() {
  const from = document.getElementById("transfer-from").value;
  const to = document.getElementById("transfer-to").value;
  const amount = parseFloat(document.getElementById("transfer-amount").value) || 0;
  if (!amount) return;
  if (state.balances[from] !== undefined) state.balances[from] -= amount;
  if (to.startsWith("goal:")) {
    const goal = state.goals.find(g => g.id === to.replace("goal:", ""));
    if (goal) goal.saved += amount;
  } else if (state.balances[to] !== undefined) {
    state.balances[to] += amount;
  }
  closeModal("modal-transfer");
  renderAccounts(); renderAhorro();
}

/* ===== CATEGORÍAS Y GASTOS ===== */
function openCategoryModal() {
  document.getElementById("cat-name").value = "";
  document.getElementById("cat-emoji").value = "";
  document.getElementById("cat-budget").value = "";
  openModal("modal-category");
}

function saveCategory() {
  const name = document.getElementById("cat-name").value.trim();
  const emoji = document.getElementById("cat-emoji").value.trim();
  const budget = parseFloat(document.getElementById("cat-budget").value) || 0;
  if (!name) return;
  const acc = state.currentAccount;
  state.categories[acc] = state.categories[acc] || [];
  state.categories[acc].push({ id: name.toLowerCase().replace(/\s+/g, "-"), name, emoji, budget, spent: 0 });
  closeModal("modal-category");
  renderAccounts();
}

let expenseTargetCategory = null;
function openExpenseModal(catId) {
  expenseTargetCategory = catId;
  document.getElementById("expense-desc").value = "";
  document.getElementById("expense-amount").value = "";
  document.getElementById("expense-recurring").checked = false;
  const acc = ACCOUNTS.find(a => a.id === state.currentAccount);
  document.getElementById("expense-split-field").style.display = acc.type === "conjunta" ? "block" : "none";
  openModal("modal-expense");
}

function saveExpense() {
  const acc = state.currentAccount;
  const cat = (state.categories[acc] || []).find(c => c.id === expenseTargetCategory);
  const desc = document.getElementById("expense-desc").value || cat.name;
  const amount = parseFloat(document.getElementById("expense-amount").value) || 0;
  if (!amount || !cat) return;
  cat.spent += amount;
  state.balances[acc] -= amount;
  state.movements[acc] = state.movements[acc] || [];
  state.movements[acc].push({ desc, amount: -amount, category: cat.name });
  closeModal("modal-expense");
  renderAccounts();
}

function closeMonth() {
  if (!confirm("¿Cerrar el mes actual y archivarlo en el histórico?")) return;
  const acc = state.currentAccount;
  const cats = state.categories[acc] || [];
  state.history.push({
    month: state.currentMonth,
    account: acc,
    categories: cats.map(c => ({ name: c.name, spent: c.spent, budget: c.budget })),
    income: state.incomeMonth[acc] || 0,
    spent: cats.reduce((s, c) => s + c.spent, 0)
  });
  cats.forEach(c => c.spent = 0);
  state.incomeMonth[acc] = 0;
  persist();
  renderAccounts();
}

/* ===== AHORRO ===== */
function renderAhorro() {
  const total = state.goals.reduce((s, g) => s + g.saved, 0);
  document.getElementById("savings-total").textContent = fmt(total);
  const list = document.getElementById("goals-list");
  list.innerHTML = state.goals.map((g, i) => {
    const tone = i % 2 === 0 ? "tone-a" : "tone-b";
    const pct = g.target ? Math.min(100, (g.saved / g.target) * 100) : 0;
    return `<div class="cat-card ${tone}">
      <div class="cat-head"><span class="cat-name">${g.name}</span><span class="cat-amt">${fmt(g.saved)} / ${fmt(g.target)}</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>
    </div>`;
  }).join("");
}

function openGoalModal() {
  document.getElementById("goal-name").value = "";
  document.getElementById("goal-target").value = "";
  openModal("modal-goal");
}

function saveGoal() {
  const name = document.getElementById("goal-name").value.trim();
  const target = parseFloat(document.getElementById("goal-target").value) || 0;
  if (!name) return;
  state.goals.push({ id: name.toLowerCase().replace(/\s+/g, "-"), name, target, saved: 0 });
  closeModal("modal-goal");
  renderAhorro();
  persist();
}

function saveInterest() {
  const rate = parseFloat(document.getElementById("interest-rate").value);
  if (isNaN(rate)) return;
  state.tradeSplit.interestRate = rate;
  closeModal("modal-interest");
  renderAccounts();
}

/* ===== ANALYTICS ===== */
function renderAnalytics() {
  const acc = ACCOUNTS.find(a => a.id === state.currentAccount) || ACCOUNTS[0];
  const cats = state.categories[acc.id] || [];
  const total = cats.reduce((s, c) => s + c.spent, 0) || 1;
  const colors = ["#534AB7", "#7F77DD", "#AFA9EC", "#0F6E56", "#5DCAA5"];
  let acc0 = 0;
  const stops = cats.map((c, i) => {
    const pct = (c.spent / total) * 100;
    const start = acc0; acc0 += pct;
    return `${colors[i % colors.length]} ${start}% ${acc0}%`;
  }).join(", ");
  document.getElementById("pie-chart").style.background = cats.length ? `conic-gradient(${stops})` : "#EEEDFE";
  document.getElementById("pie-legend").innerHTML = cats.map((c, i) =>
    `<div class="legend-item"><span class="legend-dot" style="background:${colors[i % colors.length]};"></span>${c.name} ${Math.round((c.spent / total) * 100)}%</div>`
  ).join("");

  const monthlyAvg = cats.reduce((s, c) => s + c.spent, 0);
  document.getElementById("avg-total").textContent = fmt(monthlyAvg);
  document.getElementById("avg-breakdown").innerHTML = cats.map(c =>
    `<div class="movement-row"><span>${c.name}</span><span>${fmt(c.spent)}</span></div>`
  ).join("");

  const yearTotal = cats.reduce((s, c) => s + c.spent, 0) + state.history.reduce((s, h) => s + h.spent, 0);
  document.getElementById("year-total").textContent = fmt(yearTotal);

  const profit = (state.incomeMonth[acc.id] || 0) - cats.reduce((s, c) => s + c.spent, 0);
  document.getElementById("month-profit").textContent = fmt(profit);

  drawLine("chart-monthly", state.history.filter(h => h.account === acc.id).map(h => h.spent).concat([cats.reduce((s, c) => s + c.spent, 0)]));
  drawLine("chart-annual", state.history.map(h => h.spent));
}

function drawLine(canvasId, values) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth;
  const h = canvas.height = 70;
  ctx.clearRect(0, 0, w, h);
  if (!values.length) return;
  const max = Math.max(...values, 1);
  ctx.strokeStyle = "#534AB7";
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = h - (v / max) * (h - 10) - 5;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/* ===== HISTÓRICO ===== */
function setHistView(mode, ev) {
  document.querySelectorAll("#view-historico .pill").forEach(p => p.classList.remove("active"));
  ev.target.classList.add("active");
  document.getElementById("hist-mes-view").style.display = mode === "mes" ? "block" : "none";
  document.getElementById("hist-anual-view").style.display = mode === "anual" ? "block" : "none";
}

function renderHistorico() {
  const mesView = document.getElementById("hist-mes-view");
  mesView.innerHTML = state.history.length
    ? state.history.map(h => {
        const profit = h.income - h.spent;
        return `<div class="hist-item"><span>${h.month}</span><span class="amt ${profit >= 0 ? "pos" : "neg"}">${profit >= 0 ? "+" : ""}${fmt(profit)}</span></div>`;
      }).join("")
    : `<p class="empty-hint">Todavía no hay meses cerrados</p>`;

  const catNames = [...new Set(state.history.flatMap(h => h.categories.map(c => c.name)))];
  const months = [...new Set(state.history.map(h => h.month))];
  const rows = catNames.map(name => {
    const cells = months.map(m => {
      const entry = state.history.find(h => h.month === m)?.categories.find(c => c.name === name);
      return `<td>${entry ? entry.spent.toFixed(2) : "-"}</td>`;
    }).join("");
    return `<tr><td>${name}</td>${cells}</tr>`;
  }).join("");
  document.getElementById("hist-anual-view").innerHTML = months.length
    ? `<div class="table-scroll"><table class="hist-table"><tr><td>Categoría</td>${months.map(m => `<td>${m}</td>`).join("")}</tr>${rows}</table></div>`
    : `<p class="empty-hint">Todavía no hay datos anuales</p>`;
}

/* ===== INIT ===== */
function renderAll() {
  renderAccounts();
  renderAhorro();
}
renderAll();
