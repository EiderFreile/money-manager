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
  balances: { corriente: 0, conjunta: 0, triodos: 0, trade: 0 },
  tradeSplit: { yo: 0, ella: 0, interestRate: 0 },
  categories: { corriente: [], conjunta: [], triodos: [], trade: [] },
  movements: { corriente: [], conjunta: [], triodos: [], trade: [] },
  incomeMonth: { corriente: 0, conjunta: 0, triodos: 0, trade: 0 },
  incomeList: { corriente: [], conjunta: [], triodos: [], trade: [] },
  goals: [],
  history: []
};

let useFirebase = false;
try {
  if (typeof db !== "undefined") {
    useFirebase = true;
    db.on("value", snap => {
      const data = snap.val();
      if (data) { state = data; ensureShape(); renderAll(); }
    });
  }
} catch (e) { useFirebase = false; }

function ensureShape() {
  state.balances = state.balances || {};
  state.categories = state.categories || {};
  state.movements = state.movements || {};
  state.incomeMonth = state.incomeMonth || {};
  state.incomeList = state.incomeList || {};
  state.tradeSplit = state.tradeSplit || { yo: 0, ella: 0, interestRate: 0 };
  state.goals = state.goals || [];
  state.history = state.history || [];
  state.currentAccount = state.currentAccount || "corriente";
  state.currentMonth = state.currentMonth || new Date().toISOString().slice(0, 7);
  ACCOUNTS.forEach(a => {
    state.categories[a.id] = state.categories[a.id] || [];
    state.movements[a.id] = state.movements[a.id] || [];
    state.incomeList[a.id] = state.incomeList[a.id] || [];
    if (state.balances[a.id] === undefined) state.balances[a.id] = 0;
    if (state.incomeMonth[a.id] === undefined) state.incomeMonth[a.id] = 0;
  });
}
ensureShape();

function persist() {
  localStorage.setItem("moneyManagerState", JSON.stringify(state));
  if (useFirebase) { try { db.set(state); } catch (e) {} }
}

if (!useFirebase) {
  const cached = localStorage.getItem("moneyManagerState");
  if (cached) { state = JSON.parse(cached); ensureShape(); }
}

function fmt(n) {
  return (n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
function uid(prefix) { return prefix + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000); }

/* ===== TABS PRINCIPALES ===== */
function switchTab(tab) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + tab).classList.add("active");
  document.querySelectorAll(".tabbar-item").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  if (tab === "analytics") renderAnalytics();
  if (tab === "historico") renderHistorico();
}

function closeModal(id) { document.getElementById(id).classList.remove("open"); }
function openModal(id) { document.getElementById(id).classList.add("open"); }

function selectTag(el, groupId) {
  el.parentElement.querySelectorAll(".tag-option").forEach(t => t.classList.remove("selected"));
  el.classList.add("selected");
  el.parentElement.dataset.value = el.dataset.value;
  if (groupId === "income-type") toggleIncomeFieldsByType();
}

/* ===== RESUMEN ===== */
function renderResumen() {
  document.getElementById("resumen-grid").innerHTML = ACCOUNTS.map(a => `
    <div class="resumen-card" onclick="selectAccount('${a.id}')">
      <p class="name">${a.name}</p>
      <p class="amt">${fmt(state.balances[a.id])}</p>
    </div>`).join("");
}

/* ===== CUENTAS ===== */
function renderAccountTabs() {
  document.getElementById("account-tabs").innerHTML = ACCOUNTS.map(a =>
    `<div class="pill ${a.id === state.currentAccount ? "active" : ""}" onclick="selectAccount('${a.id}')">${a.name}</div>`
  ).join("");
}

function selectAccount(id) { state.currentAccount = id; renderAccounts(); }

function renderAccounts() {
  renderResumen();
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
  const incomes = state.incomeList[acc.id] || [];
  document.getElementById("income-list").innerHTML = incomes.length
    ? incomes.slice(-8).reverse().map(i => `<div class="movement-row"><span>${i.desc}${i.who ? " · " + i.who : ""}</span><span>${fmt(i.amount)}</span></div>`).join("")
    : `<p class="empty-hint">Todavía no hay ingresos este mes</p>`;

  const budgetCard = document.getElementById("budget-card");
  const cats = state.categories[acc.id] || [];
  if (acc.type === "remunerada") {
    budgetCard.style.display = "none";
  } else {
    budgetCard.style.display = "flex";
    const budgeted = cats.filter(c => c.includeGlobal !== false);
    const totalBudget = budgeted.reduce((s, c) => s + c.budget, 0);
    const totalSpent = budgeted.reduce((s, c) => s + c.spent, 0);
    document.getElementById("budget-text").textContent = `${totalSpent.toFixed(2)} € / ${totalBudget.toFixed(2)} €`;
    const fill = document.getElementById("budget-fill");
    fill.style.width = totalBudget ? Math.min(100, (totalSpent / totalBudget) * 100) + "%" : "0%";
    fill.classList.toggle("over", totalSpent > totalBudget && totalBudget > 0);
  }

  const moves = state.movements[acc.id] || [];
  document.getElementById("movements-list").innerHTML = moves.length
    ? moves.slice(-5).reverse().map(m => `<div class="movement-row"><span>${m.desc} · ${m.category || ""}${m.who ? " (" + m.who + ")" : ""}</span><span>${fmt(m.amount)}</span></div>`).join("")
    : `<p class="empty-hint">Todavía no hay movimientos</p>`;

  document.getElementById("categories-label").textContent = acc.type === "remunerada" ? "Historial de aportaciones" : "Categorías";
  const catList = document.getElementById("categories-list");
  const catBtn = document.querySelector('button[onclick="openCategoryModal()"]');
  if (acc.type === "remunerada") {
    if (catBtn) catBtn.style.display = "none";
    catList.innerHTML = `
      <div class="card teal-card" style="margin-bottom:12px;">
        <div class="teal-card-head">
          <div><p class="label">Interés generado (mes)</p><p class="sub">Tipo actual: ${state.tradeSplit.interestRate}% TAE</p></div>
          <span class="value">${fmt(calcTradeInterest())}</span>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn" onclick="openTransferModal()">+ Aportar</button>
        <button class="btn" onclick="openModal('modal-interest')">% Editar interés</button>
      </div>
      <div id="trade-history"></div>`;
    const moves2 = state.movements.trade || [];
    document.getElementById("trade-history").innerHTML = moves2.length
      ? moves2.slice().reverse().map(m => `<div class="movement-row"><span>${m.desc}</span><span>${fmt(m.amount)}</span></div>`).join("")
      : `<p class="empty-hint">Todavía no hay aportaciones</p>`;
  } else {
    if (catBtn) catBtn.style.display = "flex";
    catList.innerHTML = cats.length ? cats.map((c, i) => {
      const tone = i % 2 === 0 ? "tone-a" : "tone-b";
      const pct = c.budget ? Math.min(100, (c.spent / c.budget) * 100) : 0;
      return `<div class="cat-card ${tone}" onclick="openCategoryDetail('${c.id}')">
        <div class="cat-head"><span class="cat-name">${c.emoji ? c.emoji + " " : ""}${c.name}</span><span class="cat-amt">${fmt(c.spent)} / ${fmt(c.budget)}</span></div>
        <div class="progress-track"><div class="progress-fill ${c.spent > c.budget && c.budget > 0 ? "over" : ""}" style="width:${pct}%;"></div></div>
      </div>`;
    }).join("") : `<p class="empty-hint">Todavía no hay categorías en esta cuenta</p>`;
  }
  persist();
}

function calcTradeInterest() {
  const ts = state.tradeSplit;
  const total = (ts.yo || 0) + (ts.ella || 0);
  return total * (ts.interestRate / 100) / 12;
}

/* ===== TARJETITAS DE CUENTA (selector genérico) ===== */
function renderAccountCardSelect(containerId, selectedId, includeSavings, onSelect) {
  const el = document.getElementById(containerId);
  let html = ACCOUNTS.map(a =>
    `<div class="card-select ${a.id === selectedId ? "selected" : ""}" data-id="${a.id}" onclick="${onSelect}('${containerId}','${a.id}')">${a.name}</div>`
  ).join("");
  if (includeSavings) {
    html += `<div class="card-select ${selectedId === "ahorro" ? "selected" : ""}" data-id="ahorro" onclick="${onSelect}('${containerId}','ahorro')">Ahorro</div>`;
  }
  el.innerHTML = html;
}

/* ===== INGRESO ===== */
let incomeSelectedAccount = "corriente";
function openIncomeModal() {
  incomeSelectedAccount = state.currentAccount;
  document.getElementById("income-desc").value = "";
  document.getElementById("income-amount").value = "";
  renderAccountCardSelect("income-account-cards", incomeSelectedAccount, false, "pickIncomeAccount");
  toggleIncomeFieldsByType();
  openModal("modal-income");
}
function pickIncomeAccount(containerId, id) {
  incomeSelectedAccount = id;
  renderAccountCardSelect(containerId, id, false, "pickIncomeAccount");
  toggleIncomeFieldsByType();
}
function toggleIncomeFieldsByType() {
  const accInfo = ACCOUNTS.find(a => a.id === incomeSelectedAccount);
  document.getElementById("income-type-field").style.display = accInfo && accInfo.type === "normal" ? "block" : "none";
  document.getElementById("income-who-field").style.display = accInfo && accInfo.type === "conjunta" ? "block" : "none";
}

function saveIncome() {
  const acc = incomeSelectedAccount;
  const desc = document.getElementById("income-desc").value || "Ingreso";
  const amount = parseFloat(document.getElementById("income-amount").value) || 0;
  if (!amount) return;
  const typeGroup = document.getElementById("income-type-field").querySelector(".tag-row");
  const whoGroup = document.getElementById("income-who-field").querySelector(".tag-row");
  const type = typeGroup ? typeGroup.dataset.value || "ingreso" : "ingreso";
  const who = whoGroup ? whoGroup.dataset.value || "ella" : "";

  state.balances[acc] = (state.balances[acc] || 0) + amount;
  if (type !== "aportacion") state.incomeMonth[acc] = (state.incomeMonth[acc] || 0) + amount;
  state.incomeList[acc] = state.incomeList[acc] || [];
  state.incomeList[acc].push({ desc, amount, who, type });
  state.movements[acc] = state.movements[acc] || [];
  state.movements[acc].push({ desc, amount, category: type === "aportacion" ? "Aportación" : "Ingreso", who });
  closeModal("modal-income");
  renderAccounts();
}

/* ===== TRANSFERENCIA ===== */
let transferFrom = "corriente", transferTo = "conjunta";
function openTransferModal() {
  transferFrom = state.currentAccount;
  transferTo = ACCOUNTS.find(a => a.id !== transferFrom).id;
  renderAccountCardSelect("transfer-from-cards", transferFrom, false, "pickTransferFrom");
  renderAccountCardSelect("transfer-to-cards", transferTo, true, "pickTransferTo");
  toggleTransferGoalField();
  openModal("modal-transfer");
}
function pickTransferFrom(containerId, id) { transferFrom = id; renderAccountCardSelect(containerId, id, false, "pickTransferFrom"); }
function pickTransferTo(containerId, id) { transferTo = id; renderAccountCardSelect(containerId, id, true, "pickTransferTo"); toggleTransferGoalField(); }
function toggleTransferGoalField() {
  const field = document.getElementById("transfer-goal-field");
  if (transferTo === "ahorro") {
    field.style.display = "block";
    document.getElementById("transfer-goal").innerHTML = state.goals.map(g => `<option value="${g.id}">${g.name}</option>`).join("") || `<option value="">Crea una meta primero</option>`;
  } else { field.style.display = "none"; }
}

function saveTransfer() {
  const amount = parseFloat(document.getElementById("transfer-amount").value) || 0;
  if (!amount) return;
  if (state.balances[transferFrom] !== undefined) state.balances[transferFrom] -= amount;
  if (transferTo === "ahorro") {
    const goalId = document.getElementById("transfer-goal").value;
    const goal = state.goals.find(g => g.id === goalId);
    if (goal) goal.saved += amount;
  } else if (state.balances[transferTo] !== undefined) {
    state.balances[transferTo] += amount;
    if (transferTo === "conjunta") {
      state.incomeList.conjunta = state.incomeList.conjunta || [];
      state.incomeList.conjunta.push({ desc: "Aportación desde " + (ACCOUNTS.find(a=>a.id===transferFrom)||{}).name, amount, who: "ella", type: "aportacion" });
    }
  }
  closeModal("modal-transfer");
  renderAccounts(); renderAhorro();
}

/* ===== CATEGORÍAS ===== */
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
  state.categories[acc].push({ id: uid("cat"), name, emoji, budget, spent: 0, includeGlobal: true, transactions: [] });
  closeModal("modal-category");
  renderAccounts();
}

/* ===== DETALLE DE CATEGORÍA ===== */
let cdCurrentCat = null;
function openCategoryDetail(catId) {
  cdCurrentCat = catId;
  renderCategoryDetail();
  openModal("modal-cat-detail");
}
function renderCategoryDetail() {
  const cat = (state.categories[state.currentAccount] || []).find(c => c.id === cdCurrentCat);
  if (!cat) return;
  document.getElementById("cd-name").textContent = (cat.emoji ? cat.emoji + " " : "") + cat.name;
  document.getElementById("cd-spent").textContent = fmt(cat.spent);
  document.getElementById("cd-budget-view").textContent = fmt(cat.budget);
  document.getElementById("cd-budget-input").value = cat.budget;
  document.getElementById("cd-include-global").checked = cat.includeGlobal !== false;
  const pct = cat.budget ? Math.min(100, (cat.spent / cat.budget) * 100) : 0;
  const fill = document.getElementById("cd-progress");
  fill.style.width = pct + "%";
  fill.classList.toggle("over", cat.spent > cat.budget && cat.budget > 0);
  const warn = document.getElementById("cd-warning");
  if (cat.budget > 0 && cat.spent > cat.budget) {
    warn.style.display = "block";
    warn.textContent = `⚠ Pasado en ${fmt(cat.spent - cat.budget)}`;
  } else { warn.style.display = "none"; }

  const txs = cat.transactions || [];
  document.getElementById("cd-transactions").innerHTML = txs.length
    ? txs.slice().reverse().map(t => `
      <div class="movement-row">
        <span>${t.desc}</span>
        <span style="display:flex; align-items:center; gap:8px;">
          <span style="color:${t.amount < 0 ? "var(--pink-neg)" : "var(--teal-soft-text-2)"};">${t.amount < 0 ? "-" : "+"}${fmt(Math.abs(t.amount))}</span>
          <span class="movement-actions">
            <button class="icon-btn danger" onclick="deleteTransaction('${t.id}')">🗑</button>
          </span>
        </span>
      </div>`).join("")
    : `<p class="empty-hint">Todavía no hay transacciones</p>`;
}
function fijarPresupuesto() {
  const cat = (state.categories[state.currentAccount] || []).find(c => c.id === cdCurrentCat);
  if (!cat) return;
  cat.budget = parseFloat(document.getElementById("cd-budget-input").value) || 0;
  cat.includeGlobal = document.getElementById("cd-include-global").checked;
  renderCategoryDetail();
  renderAccounts();
}
function deleteCategory() {
  if (!confirm("¿Eliminar esta categoría y todas sus transacciones?")) return;
  const list = state.categories[state.currentAccount];
  state.categories[state.currentAccount] = list.filter(c => c.id !== cdCurrentCat);
  closeModal("modal-cat-detail");
  renderAccounts();
}
function deleteTransaction(txId) {
  const cat = (state.categories[state.currentAccount] || []).find(c => c.id === cdCurrentCat);
  if (!cat) return;
  const tx = (cat.transactions || []).find(t => t.id === txId);
  if (!tx) return;
  cat.spent -= tx.amount < 0 ? Math.abs(tx.amount) : -tx.amount;
  state.balances[state.currentAccount] += tx.amount < 0 ? Math.abs(tx.amount) : -tx.amount;
  cat.transactions = cat.transactions.filter(t => t.id !== txId);
  renderCategoryDetail();
  renderAccounts();
}
function openCatIncomeModal() {
  closeModal("modal-cat-detail");
  openIncomeModal();
}

/* ===== GASTOS ===== */
let expenseTargetCategory = null;
function openExpenseModal(catId) {
  expenseTargetCategory = catId;
  closeModal("modal-cat-detail");
  document.getElementById("expense-desc").value = "";
  document.getElementById("expense-amount").value = "";
  document.getElementById("expense-recurring").checked = false;
  document.getElementById("recurring-fields").style.display = "none";
  document.getElementById("expense-rec-day").value = "";
  document.getElementById("expense-rec-noend").checked = true;
  document.getElementById("rec-end-field").style.display = "none";
  const acc = ACCOUNTS.find(a => a.id === state.currentAccount);
  const cat = (state.categories[state.currentAccount] || []).find(c => c.id === catId);
  document.getElementById("expense-who-field").style.display = acc.type === "conjunta" ? "block" : "none";
  document.getElementById("expense-remaining").textContent = cat ? `Te quedan ${fmt(cat.budget - cat.spent)} de presupuesto en ${cat.name}` : "";
  openModal("modal-expense");
}
function toggleRecurringFields() {
  document.getElementById("recurring-fields").style.display = document.getElementById("expense-recurring").checked ? "block" : "none";
}
function toggleRecEnd() {
  document.getElementById("rec-end-field").style.display = document.getElementById("expense-rec-noend").checked ? "none" : "block";
}

function saveExpense() {
  const acc = state.currentAccount;
  const cat = (state.categories[acc] || []).find(c => c.id === expenseTargetCategory);
  if (!cat) return;
  const desc = document.getElementById("expense-desc").value || cat.name;
  const amount = parseFloat(document.getElementById("expense-amount").value) || 0;
  if (!amount) return;
  const whoGroup = document.getElementById("expense-who-field").querySelector(".tag-row");
  const who = whoGroup && document.getElementById("expense-who-field").style.display !== "none" ? (whoGroup.dataset.value || "yo") : "";
  const recurring = document.getElementById("expense-recurring").checked;
  const recDay = parseInt(document.getElementById("expense-rec-day").value) || null;
  const recNoEnd = document.getElementById("expense-rec-noend").checked;
  const recEnd = recNoEnd ? null : document.getElementById("expense-rec-end").value;

  cat.spent += amount;
  cat.transactions = cat.transactions || [];
  const tx = { id: uid("tx"), desc, amount: -amount, who, recurring, recDay, recNoEnd, recEnd, date: new Date().toISOString() };
  cat.transactions.push(tx);
  state.balances[acc] -= amount;
  state.movements[acc] = state.movements[acc] || [];
  state.movements[acc].push({ desc, amount: -amount, category: cat.name, who });
  closeModal("modal-expense");
  renderAccounts();
}

function closeMonth() {
  if (!confirm("¿Cerrar el mes actual y archivarlo en el histórico?")) return;
  const acc = state.currentAccount;
  const cats = state.categories[acc] || [];
  state.history.push({
    month: state.currentMonth, account: acc,
    categories: cats.map(c => ({ name: c.name, spent: c.spent, budget: c.budget })),
    income: state.incomeMonth[acc] || 0,
    spent: cats.reduce((s, c) => s + c.spent, 0)
  });
  cats.forEach(c => { c.spent = 0; c.transactions = []; });
  state.incomeMonth[acc] = 0;
  state.incomeList[acc] = [];
  persist();
  renderAccounts();
}

/* ===== AHORRO ===== */
function renderAhorro() {
  const total = state.goals.reduce((s, g) => s + g.saved, 0);
  document.getElementById("savings-total").textContent = fmt(total);
  const list = document.getElementById("goals-list");
  list.innerHTML = state.goals.length ? state.goals.map((g, i) => {
    const tone = i % 2 === 0 ? "tone-a" : "tone-b";
    const pct = g.target ? Math.min(100, (g.saved / g.target) * 100) : 0;
    return `<div class="card" style="padding:0; overflow:hidden;">
      <div class="cat-card ${tone}" style="margin:0; border-radius:16px 16px 0 0; cursor:default;">
        <div class="cat-head"><span class="cat-name">${g.name}</span><span class="cat-amt">${fmt(g.saved)} / ${fmt(g.target)}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>
      </div>
      <div class="btn-row-3" style="margin:10px 12px 12px;">
        <button class="btn btn-small" onclick="openGoalMove('${g.id}','add')">+ Añadir</button>
        <button class="btn btn-small" onclick="openGoalMove('${g.id}','withdraw')">- Retirar</button>
        <button class="btn btn-small" onclick="editGoal('${g.id}')">✎ Editar</button>
      </div>
      <button class="btn btn-danger btn-small" style="width:calc(100% - 24px); margin:0 12px 12px;" onclick="deleteGoal('${g.id}')">Eliminar meta</button>
    </div>`;
  }).join("") : `<p class="empty-hint">Todavía no tienes metas de ahorro</p>`;
}

let goalModalEditingId = null;
function openGoalModal() {
  goalModalEditingId = null;
  document.getElementById("goal-modal-title").textContent = "Meta de ahorro";
  document.getElementById("goal-name").value = "";
  document.getElementById("goal-target").value = "";
  openModal("modal-goal");
}
function editGoal(id) {
  const g = state.goals.find(g => g.id === id);
  if (!g) return;
  goalModalEditingId = id;
  document.getElementById("goal-modal-title").textContent = "Editar meta";
  document.getElementById("goal-name").value = g.name;
  document.getElementById("goal-target").value = g.target;
  openModal("modal-goal");
}
function saveGoal() {
  const name = document.getElementById("goal-name").value.trim();
  const target = parseFloat(document.getElementById("goal-target").value) || 0;
  if (!name) return;
  if (goalModalEditingId) {
    const g = state.goals.find(g => g.id === goalModalEditingId);
    if (g) { g.name = name; g.target = target; }
  } else {
    state.goals.push({ id: uid("goal"), name, target, saved: 0 });
  }
  closeModal("modal-goal");
  renderAhorro();
  persist();
}
function deleteGoal(id) {
  if (!confirm("¿Eliminar esta meta de ahorro?")) return;
  state.goals = state.goals.filter(g => g.id !== id);
  renderAhorro();
  persist();
}
let goalMoveId = null, goalMoveMode = "add";
function openGoalMove(id, mode) {
  goalMoveId = id; goalMoveMode = mode;
  document.getElementById("goal-move-title").textContent = mode === "add" ? "Añadir a la meta" : "Retirar de la meta";
  document.getElementById("goal-move-amount").value = "";
  openModal("modal-goal-move");
}
function saveGoalMove() {
  const g = state.goals.find(g => g.id === goalMoveId);
  const amount = parseFloat(document.getElementById("goal-move-amount").value) || 0;
  if (!g || !amount) return;
  g.saved += goalMoveMode === "add" ? amount : -amount;
  if (g.saved < 0) g.saved = 0;
  closeModal("modal-goal-move");
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
  const cats = (state.categories[acc.id] || []).filter(c => c.includeGlobal !== false);
  const total = cats.reduce((s, c) => s + c.spent, 0) || 1;
  const colors = ["#534AB7", "#7F77DD", "#AFA9EC", "#0F6E56", "#5DCAA5", "#9F8FE0"];
  let acc0 = 0;
  const stops = cats.map((c, i) => {
    const pct = (c.spent / total) * 100;
    const start = acc0; acc0 += pct;
    return `${colors[i % colors.length]} ${start}% ${acc0}%`;
  }).join(", ");
  document.getElementById("pie-chart").style.background = cats.length ? `conic-gradient(${stops})` : "#EEEDFE";
  document.getElementById("pie-legend").innerHTML = cats.map((c, i) =>
    `<div class="legend-item"><span class="legend-dot" style="background:${colors[i % colors.length]};"></span>${c.name} ${Math.round((c.spent / total) * 100)}%</div>`
  ).join("") || `<p class="empty-hint">Sin gastos aún</p>`;

  const monthlyTotal = cats.reduce((s, c) => s + c.spent, 0);
  document.getElementById("avg-total").textContent = fmt(monthlyTotal);
  document.getElementById("avg-breakdown").innerHTML = cats.map(c =>
    `<div class="movement-row"><span>${c.name}</span><span>${fmt(c.spent)}</span></div>`
  ).join("");

  const yearTotal = monthlyTotal + state.history.filter(h => h.account === acc.id).reduce((s, h) => s + h.spent, 0);
  document.getElementById("year-total").textContent = fmt(yearTotal);

  const profit = (state.incomeMonth[acc.id] || 0) - monthlyTotal;
  document.getElementById("month-profit").textContent = fmt(profit);

  drawLine("chart-monthly", state.history.filter(h => h.account === acc.id).map(h => h.spent).concat([monthlyTotal]));
  drawLine("chart-annual", state.history.filter(h => h.account === acc.id).map(h => h.spent));
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
  const items = state.history.filter(h => h.account === state.currentAccount);
  mesView.innerHTML = items.length
    ? items.map(h => {
        const profit = h.income - h.spent;
        return `<div class="hist-item"><span>${h.month}</span><span class="amt ${profit >= 0 ? "pos" : "neg"}">${profit >= 0 ? "+" : ""}${fmt(profit)}</span></div>`;
      }).join("")
    : `<p class="empty-hint">Todavía no hay meses cerrados para esta cuenta</p>`;

  const catNames = [...new Set(items.flatMap(h => h.categories.map(c => c.name)))];
  const months = [...new Set(items.map(h => h.month))];
  const rows = catNames.map(name => {
    const cells = months.map(m => {
      const entry = items.find(h => h.month === m)?.categories.find(c => c.name === name);
      return `<td>${entry ? entry.spent.toFixed(2) : "-"}</td>`;
    }).join("");
    return `<tr><td>${name}</td>${cells}</tr>`;
  }).join("");
  document.getElementById("hist-anual-view").innerHTML = months.length
    ? `<div class="table-scroll"><table class="hist-table"><tr><td>Categoría</td>${months.map(m => `<td>${m}</td>`).join("")}</tr>${rows}</table></div>`
    : `<p class="empty-hint">Todavía no hay datos anuales para esta cuenta</p>`;
}

/* Añadir mes pasado manualmente */
let manualMonthAccount = "corriente";
function openManualMonthModal() {
  manualMonthAccount = state.currentAccount;
  renderAccountCardSelect("manual-month-account-cards", manualMonthAccount, false, "pickManualMonthAccount");
  document.getElementById("manual-month-value").value = "";
  document.getElementById("manual-month-income").value = "";
  renderManualMonthCategories();
  openModal("modal-manual-month");
}
function pickManualMonthAccount(containerId, id) {
  manualMonthAccount = id;
  renderAccountCardSelect(containerId, id, false, "pickManualMonthAccount");
  renderManualMonthCategories();
}
function renderManualMonthCategories() {
  const cats = state.categories[manualMonthAccount] || [];
  const wrap = document.getElementById("manual-month-categories");
  wrap.innerHTML = cats.length
    ? cats.map(c => `<div class="field"><label>${c.name}</label><input type="number" class="mm-cat" data-name="${c.name}" placeholder="0,00"></div>`).join("")
    : `<p class="empty-hint">Esta cuenta todavía no tiene categorías creadas</p>`;
}
function saveManualMonth() {
  const monthVal = document.getElementById("manual-month-value").value;
  if (!monthVal) return;
  const income = parseFloat(document.getElementById("manual-month-income").value) || 0;
  const cats = Array.from(document.querySelectorAll(".mm-cat")).map(inp => ({
    name: inp.dataset.name, spent: parseFloat(inp.value) || 0, budget: 0
  }));
  const spent = cats.reduce((s, c) => s + c.spent, 0);
  state.history.push({ month: monthVal, account: manualMonthAccount, categories: cats, income, spent });
  closeModal("modal-manual-month");
  persist();
  renderHistorico();
}

/* ===== INIT ===== */
function renderAll() {
  renderAccounts();
  renderAhorro();
}
renderAll();
