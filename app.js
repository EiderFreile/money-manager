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
let dataLoaded = false;
try {
  if (typeof db !== "undefined") {
    useFirebase = true;
    db.once("value").then(snap => {
      const data = snap.val();
      if (data) { state = data; ensureShape(); }
      dataLoaded = true;
      renderAll();
    }).catch(() => { dataLoaded = true; renderAll(); });
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
  if (!dataLoaded) return;
  localStorage.setItem("moneyManagerState", JSON.stringify(state));
  if (useFirebase) { try { db.set(state); } catch (e) {} }
}

if (!useFirebase) {
  const cached = localStorage.getItem("moneyManagerState");
  if (cached) { state = JSON.parse(cached); ensureShape(); }
  dataLoaded = true;
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

/* ===== CUENTAS ===== */
function renderResumen() {
  document.getElementById("resumen-grid").innerHTML = ACCOUNTS.map(a => `
    <div class="resumen-card ${a.id === state.currentAccount ? "selected" : ""}" onclick="selectAccount('${a.id}')">
      <p class="name">${a.name}</p>
      <p class="amt">${fmt(state.balances[a.id])}</p>
    </div>`).join("");
}

function selectAccount(id) { state.currentAccount = id; renderAccounts(); }

function renderAccounts() {
  renderResumen();
  const acc = ACCOUNTS.find(a => a.id === state.currentAccount);
  document.getElementById("balance-label").textContent = "Saldo " + acc.name.toLowerCase();
  const balVal = document.getElementById("balance-value");
  balVal.textContent = fmt(state.balances[acc.id]);
  balVal.onclick = () => openEditBalance();

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
    document.getElementById("budget-breakdown").innerHTML = budgeted.length
      ? budgeted.map(c => `<div class="movement-row"><span>${c.emoji ? c.emoji + " " : ""}${c.name}</span><span>${fmt(c.spent)} / ${fmt(c.budget)} · quedan ${fmt(c.budget - c.spent)}</span></div>`).join("")
      : `<p class="empty-hint">Sin categorías en el presupuesto global</p>`;
  }

  const splitCard = document.getElementById("split-spend-card");
  if (acc.type === "conjunta") {
    splitCard.style.display = "block";
    let yoTotal = 0, otroTotal = 0;
    cats.forEach(c => (c.transactions || []).forEach(t => {
      const amt = Math.abs(t.amount);
      const pct = t.splitPct !== undefined ? t.splitPct : 50;
      yoTotal += amt * (pct / 100);
      otroTotal += amt * (1 - pct / 100);
    }));
    document.getElementById("split-spend-row").innerHTML = `
      <div class="split-chip" style="background:var(--lilac-soft);"><p class="who" style="color:var(--lilac-soft-text-2);">Tú</p><p class="amt" style="color:var(--lilac-soft-text);">${fmt(yoTotal)}</p></div>
      <div class="split-chip"><p class="who">Ella</p><p class="amt">${fmt(otroTotal)}</p></div>`;
  } else {
    splitCard.style.display = "none";
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
      const remaining = c.budget - c.spent;
      const remainingText = c.budget > 0
        ? (remaining >= 0 ? `Quedan ${fmt(remaining)}` : `Pasado en ${fmt(Math.abs(remaining))}`)
        : "";
      return `<div class="cat-card ${tone}" onclick="openCategoryDetail('${c.id}')">
        <div class="cat-head">
          <span class="cat-name">${c.emoji ? c.emoji + " " : ""}${c.name}</span>
          <span style="display:flex; align-items:center; gap:8px;">
            <span class="cat-amt">${fmt(c.spent)} / ${fmt(c.budget)}</span>
            <span class="cat-chevron">›</span>
          </span>
        </div>
        <div class="progress-track"><div class="progress-fill ${c.spent > c.budget && c.budget > 0 ? "over" : ""}" style="width:${pct}%;"></div></div>
        ${remainingText ? `<p style="font-size:11px; margin:6px 0 0; opacity:.85;">${remainingText}</p>` : ""}
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

function openEditBalance() {
  document.getElementById("edit-balance-input").value = state.balances[state.currentAccount];
  openModal("modal-edit-balance");
}
function saveEditBalance() {
  const val = parseFloat(document.getElementById("edit-balance-input").value);
  if (isNaN(val)) return;
  state.balances[state.currentAccount] = val;
  closeModal("modal-edit-balance");
  renderAccounts();
  persist();
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
  document.getElementById("income-type-field").style.display = accInfo && accInfo.type === "conjunta" ? "block" : "none";
}

function saveIncome() {
  const acc = incomeSelectedAccount;
  const desc = document.getElementById("income-desc").value || "Ingreso";
  const amount = parseFloat(document.getElementById("income-amount").value) || 0;
  if (!amount) return;
  const typeGroup = document.getElementById("income-type-field").querySelector(".tag-row");
  const type = typeGroup ? typeGroup.dataset.value || "ingreso" : "ingreso";
  const who = (type === "aportacion") ? "pareja" : "";

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
  renderAccountCardSelect("transfer-from-cards", transferFrom, true, "pickTransferFrom");
  renderAccountCardSelect("transfer-to-cards", transferTo, true, "pickTransferTo");
  toggleTransferGoalField();
  openModal("modal-transfer");
}
function pickTransferFrom(containerId, id) { transferFrom = id; renderAccountCardSelect(containerId, id, true, "pickTransferFrom"); toggleTransferGoalField(); }
function pickTransferTo(containerId, id) { transferTo = id; renderAccountCardSelect(containerId, id, true, "pickTransferTo"); toggleTransferGoalField(); }
function toggleTransferGoalField() {
  const toField = document.getElementById("transfer-goal-field");
  if (transferTo === "ahorro") {
    toField.style.display = "block";
    document.getElementById("transfer-goal").innerHTML = state.goals.map(g => `<option value="${g.id}">${g.name}</option>`).join("") || `<option value="">Crea una meta primero</option>`;
  } else { toField.style.display = "none"; }
  const fromField = document.getElementById("transfer-from-goal-field");
  if (transferFrom === "ahorro") {
    fromField.style.display = "block";
    document.getElementById("transfer-from-goal").innerHTML = state.goals.map(g => `<option value="${g.id}">${g.name}</option>`).join("") || `<option value="">No tienes metas todavía</option>`;
  } else { fromField.style.display = "none"; }
}

function saveTransfer() {
  const amount = parseFloat(document.getElementById("transfer-amount").value) || 0;
  if (!amount) return;

  if (transferFrom === "ahorro") {
    const goalId = document.getElementById("transfer-from-goal").value;
    const goal = state.goals.find(g => g.id === goalId);
    if (goal) { goal.saved -= amount; if (goal.saved < 0) goal.saved = 0; }
  } else if (state.balances[transferFrom] !== undefined) {
    state.balances[transferFrom] -= amount;
  }

  if (transferTo === "ahorro") {
    const goalId = document.getElementById("transfer-goal").value;
    const goal = state.goals.find(g => g.id === goalId);
    if (goal) goal.saved += amount;
  } else if (state.balances[transferTo] !== undefined) {
    state.balances[transferTo] += amount;
    if (transferTo === "conjunta" && transferFrom !== "ahorro") {
      state.incomeList.conjunta = state.incomeList.conjunta || [];
      state.incomeList.conjunta.push({ desc: "Aportación desde " + (ACCOUNTS.find(a=>a.id===transferFrom)||{}).name, amount, who: "ella", type: "aportacion" });
    }
  }
  closeModal("modal-transfer");
  renderAccounts(); renderAhorro();
  persist();
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
  document.getElementById("cd-name-input").value = cat.name;
  document.getElementById("cd-emoji-input").value = cat.emoji || "";
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
            <button class="icon-btn" onclick="editTransaction('${t.id}')">✎</button>
            <button class="icon-btn danger" onclick="deleteTransaction('${t.id}')">🗑</button>
          </span>
        </span>
      </div>`).join("")
    : `<p class="empty-hint">Todavía no hay transacciones</p>`;
}
function fijarPresupuesto() {
  const cat = (state.categories[state.currentAccount] || []).find(c => c.id === cdCurrentCat);
  if (!cat) return;
  const newName = document.getElementById("cd-name-input").value.trim();
  if (newName) cat.name = newName;
  cat.emoji = document.getElementById("cd-emoji-input").value.trim();
  cat.budget = parseFloat(document.getElementById("cd-budget-input").value) || 0;
  cat.includeGlobal = document.getElementById("cd-include-global").checked;
  renderCategoryDetail();
  renderAccounts();
  persist();
}
function toggleIncludeGlobal() {
  const cat = (state.categories[state.currentAccount] || []).find(c => c.id === cdCurrentCat);
  if (!cat) return;
  cat.includeGlobal = document.getElementById("cd-include-global").checked;
  renderAccounts();
  persist();
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
let editingTxId = null;

function openExpenseModal(catId) {
  editingTxId = null;
  expenseTargetCategory = catId;
  closeModal("modal-cat-detail");
  document.getElementById("expense-title").textContent = "Añadir gasto";
  document.getElementById("expense-category-field").style.display = "none";
  document.getElementById("expense-desc").value = "";
  document.getElementById("expense-amount").value = "";
  document.getElementById("expense-recurring").checked = false;
  document.getElementById("recurring-fields").style.display = "none";
  document.getElementById("expense-rec-day").value = "";
  document.getElementById("expense-rec-noend").checked = true;
  document.getElementById("rec-end-field").style.display = "none";
  const acc = ACCOUNTS.find(a => a.id === state.currentAccount);
  document.getElementById("expense-who-field").style.display = acc.type === "conjunta" ? "block" : "none";
  document.getElementById("expense-split-field").style.display = acc.type === "conjunta" ? "block" : "none";
  if (acc.type === "conjunta") document.getElementById("expense-split").value = 50;
  openModal("modal-expense");
}

function openGlobalExpenseModal() {
  const acc = ACCOUNTS.find(a => a.id === state.currentAccount);
  const cats = state.categories[state.currentAccount] || [];
  if (!cats.length) { alert("Primero crea una categoría en esta cuenta."); return; }
  editingTxId = null;
  document.getElementById("expense-title").textContent = "Añadir gasto";
  const catField = document.getElementById("expense-category-field");
  catField.style.display = "block";
  document.getElementById("expense-category-select").innerHTML = cats.map(c => `<option value="${c.id}">${c.emoji ? c.emoji + " " : ""}${c.name}</option>`).join("");
  expenseTargetCategory = cats[0].id;
  document.getElementById("expense-desc").value = "";
  document.getElementById("expense-amount").value = "";
  document.getElementById("expense-recurring").checked = false;
  document.getElementById("recurring-fields").style.display = "none";
  document.getElementById("expense-rec-day").value = "";
  document.getElementById("expense-rec-noend").checked = true;
  document.getElementById("rec-end-field").style.display = "none";
  document.getElementById("expense-who-field").style.display = acc.type === "conjunta" ? "block" : "none";
  document.getElementById("expense-split-field").style.display = acc.type === "conjunta" ? "block" : "none";
  if (acc.type === "conjunta") document.getElementById("expense-split").value = 50;
  openModal("modal-expense");
}

function editTransaction(txId) {
  const cat = (state.categories[state.currentAccount] || []).find(c => c.id === cdCurrentCat);
  if (!cat) return;
  const tx = (cat.transactions || []).find(t => t.id === txId);
  if (!tx) return;
  editingTxId = txId;
  expenseTargetCategory = cat.id;
  closeModal("modal-cat-detail");
  document.getElementById("expense-title").textContent = "Editar gasto";
  document.getElementById("expense-category-field").style.display = "none";
  document.getElementById("expense-desc").value = tx.desc;
  document.getElementById("expense-amount").value = Math.abs(tx.amount);
  document.getElementById("expense-recurring").checked = !!tx.recurring;
  document.getElementById("recurring-fields").style.display = tx.recurring ? "block" : "none";
  document.getElementById("expense-rec-day").value = tx.recDay || "";
  document.getElementById("expense-rec-noend").checked = tx.recNoEnd !== false;
  document.getElementById("rec-end-field").style.display = tx.recNoEnd === false ? "block" : "none";
  document.getElementById("expense-rec-end").value = tx.recEnd || "";
  const acc = ACCOUNTS.find(a => a.id === state.currentAccount);
  document.getElementById("expense-who-field").style.display = acc.type === "conjunta" ? "block" : "none";
  document.getElementById("expense-split-field").style.display = acc.type === "conjunta" ? "block" : "none";
  document.getElementById("expense-split").value = tx.splitPct !== undefined ? tx.splitPct : 50;
  if (tx.who) {
    const whoGroup = document.getElementById("expense-who-field").querySelector(".tag-row");
    whoGroup.querySelectorAll(".tag-option").forEach(t => t.classList.toggle("selected", t.dataset.value === tx.who));
    whoGroup.dataset.value = tx.who;
  }
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
  const catField = document.getElementById("expense-category-field");
  const catId = catField.style.display !== "none" ? document.getElementById("expense-category-select").value : expenseTargetCategory;
  const cat = (state.categories[acc] || []).find(c => c.id === catId);
  if (!cat) return;
  const desc = document.getElementById("expense-desc").value || cat.name;
  const amount = parseFloat(document.getElementById("expense-amount").value) || 0;
  if (!amount) return;
  const whoGroup = document.getElementById("expense-who-field").querySelector(".tag-row");
  const who = whoGroup && document.getElementById("expense-who-field").style.display !== "none" ? (whoGroup.dataset.value || "yo") : "";
  const splitVisible = document.getElementById("expense-split-field").style.display !== "none";
  const splitPct = splitVisible ? (parseFloat(document.getElementById("expense-split").value) ?? 50) : undefined;
  const recurring = document.getElementById("expense-recurring").checked;
  const recDay = parseInt(document.getElementById("expense-rec-day").value) || null;
  const recNoEnd = document.getElementById("expense-rec-noend").checked;
  const recEnd = recNoEnd ? null : document.getElementById("expense-rec-end").value;

  cat.transactions = cat.transactions || [];

  if (editingTxId) {
    const tx = cat.transactions.find(t => t.id === editingTxId);
    if (tx) {
      const oldAmount = Math.abs(tx.amount);
      const delta = amount - oldAmount;
      cat.spent += delta;
      state.balances[acc] -= delta;
      tx.desc = desc; tx.amount = -amount; tx.who = who; tx.splitPct = splitPct;
      tx.recurring = recurring; tx.recDay = recDay; tx.recNoEnd = recNoEnd; tx.recEnd = recEnd;
    }
  } else {
    cat.spent += amount;
    const tx = { id: uid("tx"), desc, amount: -amount, who, splitPct, recurring, recDay, recNoEnd, recEnd, date: new Date().toISOString() };
    cat.transactions.push(tx);
    state.balances[acc] -= amount;
    state.movements[acc] = state.movements[acc] || [];
    state.movements[acc].push({ desc, amount: -amount, category: cat.name, who });
  }
  editingTxId = null;
  closeModal("modal-expense");
  renderAccounts();
  persist();
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
function getMonthlySeries(accId) {
  const monthMap = {};
  state.history.filter(h => h.account === accId).forEach(h => {
    monthMap[h.month] = monthMap[h.month] || {};
    h.categories.forEach(c => { monthMap[h.month][c.name] = (monthMap[h.month][c.name] || 0) + c.spent; });
  });
  const liveMonth = state.currentMonth;
  monthMap[liveMonth] = monthMap[liveMonth] || {};
  (state.categories[accId] || []).forEach(c => { monthMap[liveMonth][c.name] = (monthMap[liveMonth][c.name] || 0) + c.spent; });
  const months = Object.keys(monthMap).sort();
  const catNames = [...new Set(months.flatMap(m => Object.keys(monthMap[m])))];
  return { months, monthMap, catNames };
}

function renderAnalytics() {
  const acc = ACCOUNTS.find(a => a.id === state.currentAccount) || ACCOUNTS[0];
  const cats = (state.categories[acc.id] || []).filter(c => c.includeGlobal !== false);
  const total = cats.reduce((s, c) => s + c.spent, 0) || 1;
  const colors = ["#534AB7", "#7F77DD", "#AFA9EC", "#0F6E56", "#5DCAA5", "#9F8FE0", "#D18FC9", "#E0A458"];
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

  const { months, monthMap, catNames } = getMonthlySeries(acc.id);

  // Promedios: solo se cuentan los meses que realmente existen (nunca meses futuros vacíos)
  const monthCount = months.length || 1;
  const totalAllMonths = months.reduce((s, m) => s + Object.values(monthMap[m]).reduce((a, b) => a + b, 0), 0);
  document.getElementById("avg-total").textContent = fmt(totalAllMonths / monthCount);
  document.getElementById("avg-breakdown").innerHTML = catNames.map(name => {
    const sum = months.reduce((s, m) => s + (monthMap[m][name] || 0), 0);
    return `<div class="movement-row"><span>${name}</span><span>${fmt(sum / monthCount)}</span></div>`;
  }).join("") || `<p class="empty-hint">Sin datos aún</p>`;

  const currentYear = new Date().getFullYear().toString();
  const yearMonths = months.filter(m => m.startsWith(currentYear));
  const yearTotal = yearMonths.reduce((s, m) => s + Object.values(monthMap[m]).reduce((a, b) => a + b, 0), 0);
  document.getElementById("year-total").textContent = fmt(yearTotal);

  const liveSpent = cats.reduce((s, c) => s + c.spent, 0);
  const profit = (state.incomeMonth[acc.id] || 0) - liveSpent;
  document.getElementById("month-profit").textContent = fmt(profit);

  // Gráfico mensual: una línea por categoría, mes a mes
  drawMultiLineChart("chart-monthly", "chart-monthly-legend", months, catNames, monthMap, colors);

  // Gráfico anual: una línea por categoría, año a año (sumando los meses de cada año)
  const yearMap = {};
  months.forEach(m => {
    const y = m.slice(0, 4);
    yearMap[y] = yearMap[y] || {};
    Object.keys(monthMap[m]).forEach(name => { yearMap[y][name] = (yearMap[y][name] || 0) + monthMap[m][name]; });
  });
  const years = Object.keys(yearMap).sort();
  drawMultiLineChart("chart-annual", "chart-annual-legend", years, catNames, yearMap, colors);
}

function drawMultiLineChart(canvasId, legendId, labels, catNames, dataMap, colors) {
  const legendEl = document.getElementById(legendId);
  if (legendEl) {
    legendEl.innerHTML = catNames.map((name, i) =>
      `<span class="legend-item" style="display:inline-flex; margin-right:10px;"><span class="legend-dot" style="background:${colors[i % colors.length]};"></span>${name}</span>`
    ).join("") || `<p class="empty-hint">Sin datos aún</p>`;
  }

  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth;
  const h = canvas.height = 180;
  ctx.clearRect(0, 0, w, h);
  if (!labels.length || !catNames.length) return;

  const padL = 46, padB = 22, padT = 10, padR = 10;
  const chartW = w - padL - padR, chartH = h - padT - padB;

  let maxVal = 0;
  labels.forEach(l => catNames.forEach(name => { maxVal = Math.max(maxVal, dataMap[l]?.[name] || 0); }));
  if (maxVal === 0) maxVal = 1;
  maxVal = Math.ceil(maxVal / 50) * 50 || 50;

  // Ejes y grid
  ctx.strokeStyle = "#E4E1F5";
  ctx.fillStyle = "#6E6B8A";
  ctx.font = "10px sans-serif";
  ctx.lineWidth = 1;
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padT + chartH - (i / steps) * chartH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillText(Math.round((maxVal / steps) * i) + "€", 2, y + 3);
  }
  ctx.strokeStyle = "#B9B4E0";
  ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + chartH); ctx.lineTo(w - padR, padT + chartH); ctx.stroke();

  labels.forEach((l, i) => {
    const x = padL + (labels.length > 1 ? (i / (labels.length - 1)) * chartW : chartW / 2);
    ctx.fillText(l.length > 7 ? l.slice(2) : l, x - 12, h - 6);
  });

  // Líneas por categoría
  catNames.forEach((name, ci) => {
    ctx.strokeStyle = colors[ci % colors.length];
    ctx.lineWidth = 2;
    ctx.beginPath();
    labels.forEach((l, i) => {
      const val = dataMap[l]?.[name] || 0;
      const x = padL + (labels.length > 1 ? (i / (labels.length - 1)) * chartW : chartW / 2);
      const y = padT + chartH - (val / maxVal) * chartH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
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
    ? items.map((h, i) => {
        const realIndex = state.history.indexOf(h);
        const profit = h.income - h.spent;
        return `<div class="hist-item" onclick="openManualMonthModal(${realIndex})"><span>${h.month}</span><span class="amt ${profit >= 0 ? "pos" : "neg"}">${profit >= 0 ? "+" : ""}${fmt(profit)}</span></div>`;
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

/* Añadir o editar mes pasado manualmente */
let manualMonthAccount = "corriente";
let editingHistIndex = null;
function openManualMonthModal(histIndex) {
  editingHistIndex = (histIndex !== undefined) ? histIndex : null;
  const entry = editingHistIndex !== null ? state.history[editingHistIndex] : null;
  manualMonthAccount = entry ? entry.account : state.currentAccount;
  document.getElementById("manual-month-title").textContent = entry ? "Editar mes" : "Añadir mes pasado";
  renderAccountCardSelect("manual-month-account-cards", manualMonthAccount, false, "pickManualMonthAccount");
  document.getElementById("manual-month-value").value = entry ? entry.month : "";
  document.getElementById("manual-month-income").value = entry ? entry.income : "";
  renderManualMonthCategories(entry);
  openModal("modal-manual-month");
}
function pickManualMonthAccount(containerId, id) {
  manualMonthAccount = id;
  renderAccountCardSelect(containerId, id, false, "pickManualMonthAccount");
  renderManualMonthCategories();
}
function renderManualMonthCategories(entry) {
  const cats = state.categories[manualMonthAccount] || [];
  const wrap = document.getElementById("manual-month-categories");
  const existing = {};
  if (entry) entry.categories.forEach(c => { existing[c.name] = c.spent; });
  wrap.innerHTML = cats.length
    ? cats.map(c => `<div class="field"><label>${c.name}</label><input type="number" class="mm-cat" data-name="${c.name}" placeholder="0,00" value="${existing[c.name] !== undefined ? existing[c.name] : ""}"></div>`).join("")
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
  if (editingHistIndex !== null) {
    state.history[editingHistIndex] = { month: monthVal, account: manualMonthAccount, categories: cats, income, spent };
  } else {
    state.history.push({ month: monthVal, account: manualMonthAccount, categories: cats, income, spent });
  }
  editingHistIndex = null;
  closeModal("modal-manual-month");
  persist();
  renderHistorico();
}

/* ===== INIT ===== */
function renderAll() {
  renderAccounts();
  renderAhorro();
}
if (!useFirebase) renderAll();
