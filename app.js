/* ===== ESTADO ===== */
let state = {
  categories: [],       // {id, name, budget, includeGlobal, transactions:[{id,desc,amount,date}]}  amount<0 gasto, amount>0 ingreso-en-categoria (no cuenta en total)
  incomeCategories: [], // {id, name, entries:[{id,desc,amount,date}]}
  savings: [],           // {id, desc, amount, date}
  periods: []            // {id, label, startDate, endDate}  endDate null = periodo abierto (mes en curso)
};

let useFirebase = false;
let dataLoaded = false;
let ownWriteInFlight = false;
try {
  if (typeof db !== "undefined") {
    useFirebase = true;
    db.on("value", snap => {
      if (ownWriteInFlight) { ownWriteInFlight = false; return; } // es el eco de nuestro propio guardado, ya tenemos esta versión
      const data = snap.val();
      if (data) { state = data; ensureShape(); }
      dataLoaded = true;
      hideLoadingOverlay();
      renderAll();
    }, () => { dataLoaded = true; hideLoadingOverlay(); renderAll(); });
  }
} catch (e) { useFirebase = false; }

function hideLoadingOverlay() {
  const el = document.getElementById("loading-overlay");
  if (el) el.remove();
}

function ensureShape() {
  state.categories = state.categories || [];
  state.incomeCategories = state.incomeCategories || [];
  state.savings = state.savings || [];
  state.periods = state.periods || [];
  state.notes = state.notes || [];
  state.categories.forEach(c => {
    c.transactions = c.transactions || [];
    c.includeGlobal = c.includeGlobal !== false;
    c.budget = c.budget || 0;
  });
  state.incomeCategories.forEach(c => { c.entries = c.entries || []; });
  let earliest = null;
  state.categories.forEach(c => (c.transactions || []).forEach(t => { if (!earliest || t.date < earliest) earliest = t.date; }));
  state.incomeCategories.forEach(c => (c.entries || []).forEach(e => { if (!earliest || e.date < earliest) earliest = e.date; }));

  const open = state.periods.find(p => !p.endDate);
  if (!open) {
    state.periods.push({ id: uid("per"), label: "Mes actual", startDate: earliest || todayISO(), endDate: null });
  } else if (earliest && earliest < open.startDate) {
    open.startDate = earliest;
  }
}
ensureShape();

function persist() {
  if (!dataLoaded) return;
  const clean = JSON.parse(JSON.stringify(state)); // quita cualquier undefined, Firebase lo rechaza
  localStorage.setItem("moneyManagerV2State", JSON.stringify(clean));
  if (useFirebase) {
    ownWriteInFlight = true;
    try { db.set(clean).catch(err => { ownWriteInFlight = false; console.error("Money Manager: Firebase rechazó el guardado:", err); }); }
    catch (e) { ownWriteInFlight = false; console.error("Money Manager: excepción al guardar:", e); }
  }
}

if (!useFirebase) {
  const cached = localStorage.getItem("moneyManagerV2State");
  if (cached) { state = JSON.parse(cached); ensureShape(); }
  dataLoaded = true;
}

function fmt(n) { return (n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; }
function uid(p) { return p + "-" + Date.now() + "-" + Math.floor(Math.random() * 1000); }
function todayISO() { return new Date().toISOString(); }

function sortedPeriods() { return state.periods.slice().sort((a, b) => (a.startDate || "").localeCompare(b.startDate || "")); }
function currentPeriod() { return state.periods.find(p => !p.endDate) || sortedPeriods()[sortedPeriods().length - 1]; }
function inPeriod(dateStr, period) {
  if (!period) return false;
  if (dateStr < period.startDate) return false;
  if (period.endDate && dateStr >= period.endDate) return false;
  return true;
}
function countsYet(dateStr, period) {
  // Mientras el periodo siga abierto, lo fechado en el futuro no cuenta todavía en los totales
  if (period && !period.endDate && dateStr > todayISO()) return false;
  return true;
}
function periodYear(period) { return (period.endDate || todayISO()).slice(0, 4); }

/* ===== TABS ===== */
function switchTab(tab) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + tab).classList.add("active");
  document.querySelectorAll(".tabbar-item").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  if (tab === "notas") renderNotas();
  if (tab === "historico") renderHistorico();
}
function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

/* ===== HELPERS DE CATEGORÍA (por periodo) ===== */
function catSpentInMonth(cat, period) {
  return (cat.transactions || []).filter(t => t.amount < 0 && inPeriod(t.date, period) && countsYet(t.date, period)).reduce((s, t) => s + Math.abs(t.amount), 0);
}
function catIngresosInMonth(cat, period) {
  return (cat.transactions || []).filter(t => t.amount > 0 && inPeriod(t.date, period) && countsYet(t.date, period)).reduce((s, t) => s + t.amount, 0);
}
function catGastadoNeto(cat, period) { return Math.max(0, catSpentInMonth(cat, period) - catIngresosInMonth(cat, period)); }
function catBalanceReal(cat, period) { return catSpentInMonth(cat, period) - catIngresosInMonth(cat, period); }
function incCatTotalInMonth(ic, period) { return (ic.entries || []).filter(e => inPeriod(e.date, period) && countsYet(e.date, period)).reduce((s, e) => s + e.amount, 0); }
function savingsInMonth(period) { return state.savings.filter(s => inPeriod(s.date, period) && countsYet(s.date, period)).reduce((s2, s) => s2 + s.amount, 0); }

function periodsInYear(year) { return sortedPeriods().filter(p => periodYear(p) === year); }
/* ===== RENDER GASTOS ===== */
function renderGastos() {
  const mp = currentPeriod();

  const totalGastos = state.categories.reduce((s, c) => s + catGastadoNeto(c, mp), 0);
  const totalIngresos = state.incomeCategories.reduce((s, c) => s + incCatTotalInMonth(c, mp), 0);
  document.getElementById("summary-gastos").textContent = fmt(totalGastos);
  const balance = totalIngresos - totalGastos;
  document.getElementById("summary-balance").textContent = fmt(balance);
  document.getElementById("summary-balance-card").className = "metric " + (balance >= 0 ? "green" : "red");

  renderMovements();
  renderCategoriesList();
  renderIncomeCategoriesList();
  renderSavingsList();
  renderBudgetCard(mp);
  persist();
}

function renderMovements() {
  const items = [];
  state.categories.forEach(c => (c.transactions || []).forEach(t => items.push({ desc: t.desc, amount: t.amount, date: t.date, tag: c.name })));
  state.incomeCategories.forEach(c => (c.entries || []).forEach(e => items.push({ desc: e.desc, amount: e.amount, date: e.date, tag: c.name })));
  state.savings.forEach(s => items.push({ desc: s.desc, amount: s.amount, date: s.date, tag: "Ahorro" }));
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const last5 = items.slice(0, 5);
  document.getElementById("movements-list").innerHTML = last5.length
    ? last5.map(i => `<div class="movement-row"><span>${i.desc} · ${i.tag}</span><span style="color:${i.amount < 0 ? "var(--pink-neg)" : "var(--teal-soft-text-2)"};">${i.amount < 0 ? "-" : "+"}${fmt(Math.abs(i.amount))}</span></div>`).join("")
    : `<p class="empty-hint">Todavía no hay movimientos</p>`;
}

let expandedCatId = null;
function toggleCatExpand(id) { expandedCatId = expandedCatId === id ? null : id; renderGastos(); }

function renderCategoriesList() {
  const mp = currentPeriod();
  const list = document.getElementById("categories-list");
  list.innerHTML = state.categories.length ? state.categories.map(c => {
    const gastado = catGastadoNeto(c, mp);
    const pct = c.budget ? Math.max(0, Math.min(100, (gastado / c.budget) * 100)) : 0;
    const remaining = c.budget - gastado;
    const remainingText = c.budget > 0 ? (remaining >= 0 ? `Quedan ${fmt(remaining)}` : `Pasado en ${fmt(Math.abs(remaining))}`) : "";
    const isOpen = expandedCatId === c.id;
    const balance = catBalanceReal(c, mp);
    return `<div class="cat-card">
      <div class="cat-head">
        <span class="cat-name-big" onclick="toggleCatExpand('${c.id}')">${c.name} ${isOpen ? "︿" : "›"}</span>
        <span class="balance-real-big">${fmt(balance)}</span>
        <div class="cat-actions">
          <button class="round-btn plus" onclick="openCategoryIncomeModal('${c.id}')" title="Añadir ingreso a la categoría">−</button>
          <button class="round-btn minus" onclick="openExpenseModal('${c.id}')" title="Añadir gasto">+</button>
        </div>
      </div>
      <div class="progress-track"><div class="progress-fill ${gastado > c.budget && c.budget > 0 ? "over" : ""}" style="width:${pct}%;"></div></div>
      <div class="cat-foot-row">
        <span class="remaining-text" style="margin:0;">${remainingText}</span>
        <span class="remaining-text" style="margin:0;">${fmt(gastado)} / ${fmt(c.budget)}</span>
      </div>
      ${isOpen ? renderCatDetailInline(c, mp, balance) : ""}
    </div>`;
  }).join("") : `<p class="empty-hint">Todavía no hay categorías de gasto</p>`;
}

function renderCatDetailInline(c, mp, balance) {
  const txs = (c.transactions || []).filter(t => inPeriod(t.date, mp)).slice().reverse();
  const txHtml = txs.length ? txs.map(t => `
    <div class="movement-row">
      <span>${t.desc}</span>
      <span style="display:flex; align-items:center; gap:8px;">
        <span style="color:${t.amount < 0 ? "var(--pink-neg)" : "var(--teal-soft-text-2)"};">${t.amount < 0 ? "-" : "+"}${fmt(Math.abs(t.amount))}</span>
        <span class="movement-actions">
          <button class="icon-btn" onclick="event.stopPropagation(); editCatTransaction('${c.id}','${t.id}')">✎</button>
          <button class="icon-btn danger" onclick="event.stopPropagation(); deleteCatTransaction('${c.id}','${t.id}')">🗑</button>
        </span>
      </span>
    </div>`).join("") : `<p class="empty-hint">Sin movimientos este mes</p>`;
  return `<div class="cat-detail-inline" onclick="event.stopPropagation()">
    ${txHtml}
  </div>`;
}

let expandedIncCatId = null;
function toggleIncCatExpand(id) { expandedIncCatId = expandedIncCatId === id ? null : id; renderGastos(); }

function renderIncomeCategoriesList() {
  const mp = currentPeriod();
  const list = document.getElementById("income-categories-list");
  list.innerHTML = state.incomeCategories.length ? state.incomeCategories.map(c => {
    const total = incCatTotalInMonth(c, mp);
    const isOpen = expandedIncCatId === c.id;
    const entries = (c.entries || []).filter(e => inPeriod(e.date, mp)).slice().reverse();
    const entriesHtml = entries.length ? entries.map(e => `
      <div class="movement-row">
        <span>${e.desc}</span>
        <span style="display:flex; align-items:center; gap:8px;">
          <span style="color:var(--teal-soft-text-2);">+${fmt(e.amount)}</span>
          <span class="movement-actions">
            <button class="icon-btn" onclick="event.stopPropagation(); editIncomeEntry('${c.id}','${e.id}')">✎</button>
            <button class="icon-btn danger" onclick="event.stopPropagation(); deleteIncomeEntry('${c.id}','${e.id}')">🗑</button>
          </span>
        </span>
      </div>`).join("") : `<p class="empty-hint">Sin ingresos este mes</p>`;
    return `<div class="cat-card">
      <div class="cat-head">
        <span class="cat-name" onclick="toggleIncCatExpand('${c.id}')">${c.name} ${isOpen ? "︿" : "›"}</span>
        <div class="cat-actions">
          <span class="cat-amt">${fmt(total)}</span>
          <button class="round-btn plus" onclick="openIncomeModal('${c.id}')" title="Añadir ingreso">+</button>
        </div>
      </div>
      ${isOpen ? `<div class="cat-detail-inline" onclick="event.stopPropagation()">${entriesHtml}</div>` : ""}
    </div>`;
  }).join("") : `<p class="empty-hint">Todavía no hay categorías de ingreso</p>`;
}

function renderSavingsList() {
  const list = document.getElementById("savings-list");
  const items = state.savings.slice().reverse().slice(0, 8);
  list.innerHTML = items.length ? `<div class="card">` + items.map(s => `
    <div class="movement-row">
      <span>${s.desc}</span>
      <span style="display:flex; align-items:center; gap:8px;">
        <span style="color:var(--teal-soft-text-2);">+${fmt(s.amount)}</span>
        <span class="movement-actions">
          <button class="icon-btn" onclick="editSaving('${s.id}')">✎</button>
          <button class="icon-btn danger" onclick="deleteSaving('${s.id}')">🗑</button>
        </span>
      </span>
    </div>`).join("") + `</div>` : `<p class="empty-hint">Todavía no hay ahorros</p>`;
}

function openCloseMonthModal() {
  document.getElementById("close-month-label").value = "";
  openModal("modal-close-month");
}
function confirmCloseMonth() {
  const label = document.getElementById("close-month-label").value.trim() || "Mes cerrado";
  const p = currentPeriod();
  if (!confirm(`¿Cerrar "${label}" y empezar un mes nuevo desde hoy?`)) return;
  p.label = label;
  p.endDate = todayISO();
  const newStart = todayISO();
  state.periods.push({ id: uid("per"), label: "Mes actual", startDate: newStart, endDate: null });
  generateRecurringForNewPeriod(newStart);
  closeModal("modal-close-month");
  renderGastos();
}

function generateRecurringForNewPeriod(newStart) {
  const today = new Date();
  state.categories.forEach(cat => {
    (cat.transactions || []).filter(t => t.recurring).forEach(t => {
      if (t.recEnd && t.recEnd < newStart) return; // ya venció
      const day = t.recDay && t.recDay >= 1 && t.recDay <= 28 ? t.recDay : today.getDate();
      const d = new Date(today.getFullYear(), today.getMonth(), day, 12, 0, 0);
      cat.transactions.push({ id: uid("tx"), desc: t.desc, amount: t.amount, date: d.toISOString(), recurring: true, recDay: t.recDay, recNoEnd: t.recNoEnd, recEnd: t.recEnd });
    });
  });
  state.incomeCategories.forEach(cat => {
    (cat.entries || []).filter(e => e.recurring).forEach(e => {
      if (e.recEnd && e.recEnd < newStart) return;
      const day = e.recDay && e.recDay >= 1 && e.recDay <= 28 ? e.recDay : today.getDate();
      const d = new Date(today.getFullYear(), today.getMonth(), day, 12, 0, 0);
      cat.entries.push({ id: uid("inc"), desc: e.desc, amount: e.amount, date: d.toISOString(), recurring: true, recDay: e.recDay, recNoEnd: e.recNoEnd, recEnd: e.recEnd });
    });
  });
}

function renderBudgetCard(mp) {
  const budgeted = state.categories.filter(c => c.includeGlobal !== false);
  const totalBudget = budgeted.reduce((s, c) => s + c.budget, 0);
  const totalSpent = budgeted.reduce((s, c) => s + catGastadoNeto(c, mp), 0);
  document.getElementById("budget-total-text").textContent = fmt(totalBudget);
  document.getElementById("budget-spent-text").textContent = fmt(totalSpent);
  document.getElementById("budget-remaining-text").textContent = "Te quedan " + fmt(totalBudget - totalSpent);
  const pct = totalBudget ? Math.max(0, Math.min(100, (totalSpent / totalBudget) * 100)) : 0;
  const fill = document.getElementById("budget-fill");
  fill.style.width = pct + "%";
  fill.classList.toggle("over", totalSpent > totalBudget && totalBudget > 0);
  document.getElementById("budget-pct-text").textContent = Math.round(pct) + "% usado";
  document.getElementById("budget-breakdown").innerHTML = budgeted.length
    ? budgeted.map(c => `<div class="movement-row"><span>${c.name}</span><span>${fmt(catGastadoNeto(c, mp))} / ${fmt(c.budget)}</span></div>`).join("")
    : `<p class="empty-hint">Sin categorías en el presupuesto global</p>`;
}

/* ===== CATEGORÍAS DE GASTO ===== */
let categoryEditingId = null;
function openCategoryPicker() {
  const wrap = document.getElementById("pick-category-list");
  wrap.innerHTML = state.categories.length
    ? state.categories.map(c => `<div class="movement-row" style="cursor:pointer;" onclick="closeModal('modal-pick-category'); openCategoryModal('${c.id}')"><span>${c.name}</span><span class="chevron">›</span></div>`).join("")
    : `<p class="empty-hint">Todavía no hay categorías</p>`;
  openModal("modal-pick-category");
}
function openIncomeCategoryPicker() {
  const wrap = document.getElementById("pick-income-category-list");
  wrap.innerHTML = state.incomeCategories.length
    ? state.incomeCategories.map(c => `<div class="movement-row" style="cursor:pointer;" onclick="closeModal('modal-pick-income-category'); openIncomeCategoryModal('${c.id}')"><span>${c.name}</span><span class="chevron">›</span></div>`).join("")
    : `<p class="empty-hint">Todavía no hay categorías de ingreso</p>`;
  openModal("modal-pick-income-category");
}

function openCategoryModal(catId) {
  categoryEditingId = catId || null;
  const cat = catId ? state.categories.find(c => c.id === catId) : null;
  document.getElementById("category-modal-title").textContent = cat ? "Editar Categoría" : "Añadir Categoría";
  document.getElementById("category-save-btn").textContent = cat ? "Guardar" : "Crear";
  document.getElementById("category-delete-btn").style.display = cat ? "block" : "none";
  document.getElementById("cat-name").value = cat ? cat.name : "";
  document.getElementById("cat-budget").value = cat ? cat.budget : "";
  document.getElementById("cat-include-global").checked = cat ? cat.includeGlobal !== false : true;
  openModal("modal-category");
}
function saveCategory() {
  const name = document.getElementById("cat-name").value.trim();
  const budget = parseFloat(document.getElementById("cat-budget").value) || 0;
  const includeGlobal = document.getElementById("cat-include-global").checked;
  if (!name) return;
  if (categoryEditingId) {
    const c = state.categories.find(c => c.id === categoryEditingId);
    if (c) { c.name = name; c.budget = budget; c.includeGlobal = includeGlobal; }
  } else {
    state.categories.push({ id: uid("cat"), name, budget, includeGlobal, transactions: [] });
  }
  categoryEditingId = null;
  closeModal("modal-category");
  renderGastos();
}
function deleteCategory() {
  if (!categoryEditingId) return;
  if (!confirm("¿Eliminar esta categoría y todas sus transacciones?")) return;
  state.categories = state.categories.filter(c => c.id !== categoryEditingId);
  if (expandedCatId === categoryEditingId) expandedCatId = null;
  categoryEditingId = null;
  closeModal("modal-category");
  renderGastos();
}

/* ===== CATEGORÍAS DE INGRESO ===== */
let incomeCategoryEditingId = null;
function openIncomeCategoryModal(catId) {
  incomeCategoryEditingId = catId || null;
  const cat = catId ? state.incomeCategories.find(c => c.id === catId) : null;
  document.getElementById("income-category-modal-title").textContent = cat ? "Editar Categoría de ingreso" : "Añadir Categoría de ingreso";
  document.getElementById("income-category-save-btn").textContent = cat ? "Guardar" : "Crear";
  document.getElementById("income-category-delete-btn").style.display = cat ? "block" : "none";
  document.getElementById("inccat-name").value = cat ? cat.name : "";
  openModal("modal-income-category");
}
function saveIncomeCategory() {
  const name = document.getElementById("inccat-name").value.trim();
  if (!name) return;
  if (incomeCategoryEditingId) {
    const c = state.incomeCategories.find(c => c.id === incomeCategoryEditingId);
    if (c) c.name = name;
  } else {
    state.incomeCategories.push({ id: uid("inccat"), name, entries: [] });
  }
  incomeCategoryEditingId = null;
  closeModal("modal-income-category");
  renderGastos();
}
function deleteIncomeCategory() {
  if (!incomeCategoryEditingId) return;
  if (!confirm("¿Eliminar esta categoría de ingreso?")) return;
  state.incomeCategories = state.incomeCategories.filter(c => c.id !== incomeCategoryEditingId);
  incomeCategoryEditingId = null;
  closeModal("modal-income-category");
  renderGastos();
}

/* ===== GASTOS (transacciones dentro de una categoría) ===== */
let expenseTargetCategory = null;
let editingExpenseTxId = null;
function openExpenseModal(catId) {
  expenseTargetCategory = catId;
  editingExpenseTxId = null;
  document.getElementById("expense-title").textContent = "Añadir gasto";
  document.getElementById("expense-category-field").style.display = "none";
  document.getElementById("expense-amount").value = "";
  document.getElementById("expense-desc").value = "";
  document.getElementById("expense-date").value = "";
  resetRecurringFields("expense");
  openModal("modal-expense");
}
function openGlobalExpenseModal() {
  if (!state.categories.length) { alert("Primero crea una categoría de gasto."); return; }
  editingExpenseTxId = null;
  document.getElementById("expense-title").textContent = "Añadir gasto";
  const field = document.getElementById("expense-category-field");
  field.style.display = "block";
  document.getElementById("expense-category-select").innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  expenseTargetCategory = state.categories[0].id;
  document.getElementById("expense-amount").value = "";
  document.getElementById("expense-desc").value = "";
  document.getElementById("expense-date").value = "";
  resetRecurringFields("expense");
  openModal("modal-expense");
}
function editCatTransaction(catId, txId) {
  const cat = state.categories.find(c => c.id === catId);
  if (!cat) return;
  const tx = (cat.transactions || []).find(t => t.id === txId);
  if (!tx) return;
  if (tx.amount > 0) { editCategoryIncomeTx(catId, txId); return; }
  expenseTargetCategory = catId;
  editingExpenseTxId = txId;
  document.getElementById("expense-title").textContent = "Editar gasto";
  document.getElementById("expense-category-field").style.display = "none";
  document.getElementById("expense-amount").value = Math.abs(tx.amount);
  document.getElementById("expense-desc").value = tx.desc;
  document.getElementById("expense-date").value = tx.date ? tx.date.slice(0, 10) : "";
  document.getElementById("expense-recurring").checked = !!tx.recurring;
  document.getElementById("expense-rec-fields").style.display = tx.recurring ? "block" : "none";
  document.getElementById("expense-rec-day").value = tx.recDay || "";
  document.getElementById("expense-rec-noend").checked = tx.recNoEnd !== false;
  document.getElementById("expense-rec-end-field").style.display = tx.recNoEnd === false ? "block" : "none";
  document.getElementById("expense-rec-end").value = tx.recEnd ? tx.recEnd.slice(0, 10) : "";
  openModal("modal-expense");
}
function saveExpense() {
  const catField = document.getElementById("expense-category-field");
  const catId = catField.style.display !== "none" ? document.getElementById("expense-category-select").value : expenseTargetCategory;
  const cat = state.categories.find(c => c.id === catId);
  if (!cat) return;
  const amount = parseFloat(document.getElementById("expense-amount").value) || 0;
  if (!amount) return;
  const desc = document.getElementById("expense-desc").value || "Gasto";
  const dateVal = document.getElementById("expense-date").value;
  const date = dateVal ? dateVal + "T12:00:00.000Z" : todayISO();
  const rec = readRecurringFields("expense");
  cat.transactions = cat.transactions || [];
  if (editingExpenseTxId) {
    const tx = cat.transactions.find(t => t.id === editingExpenseTxId);
    if (tx) { tx.desc = desc; tx.amount = -amount; tx.date = date; Object.assign(tx, rec); }
  } else {
    cat.transactions.push({ id: uid("tx"), desc, amount: -amount, date, ...rec });
  }
  editingExpenseTxId = null;
  closeModal("modal-expense");
  renderGastos();
}
function deleteCatTransaction(catId, txId) {
  const cat = state.categories.find(c => c.id === catId);
  if (!cat) return;
  if (!confirm("¿Eliminar este movimiento?")) return;
  cat.transactions = (cat.transactions || []).filter(t => t.id !== txId);
  renderGastos();
}

/* Recurrentes: campos compartidos por gasto e ingreso */
function resetRecurringFields(prefix) {
  document.getElementById(prefix + "-recurring").checked = false;
  document.getElementById(prefix + "-rec-fields").style.display = "none";
  document.getElementById(prefix + "-rec-day").value = "";
  document.getElementById(prefix + "-rec-noend").checked = true;
  document.getElementById(prefix + "-rec-end-field").style.display = "none";
  document.getElementById(prefix + "-rec-end").value = "";
}
function toggleRecurringFields(prefix) {
  document.getElementById(prefix + "-rec-fields").style.display = document.getElementById(prefix + "-recurring").checked ? "block" : "none";
}
function toggleRecEnd(prefix) {
  document.getElementById(prefix + "-rec-end-field").style.display = document.getElementById(prefix + "-rec-noend").checked ? "none" : "block";
}
function readRecurringFields(prefix) {
  const recurring = document.getElementById(prefix + "-recurring").checked;
  if (!recurring) return { recurring: false, recDay: null, recNoEnd: true, recEnd: null };
  const recDay = parseInt(document.getElementById(prefix + "-rec-day").value) || null;
  const recNoEnd = document.getElementById(prefix + "-rec-noend").checked;
  const recEndVal = document.getElementById(prefix + "-rec-end").value;
  const recEnd = recNoEnd || !recEndVal ? null : recEndVal + "T23:59:59.000Z";
  return { recurring, recDay, recNoEnd, recEnd };
}

/* ===== INGRESO DENTRO DE UNA CATEGORÍA DE GASTO (no cuenta en el total) ===== */
let catIncomeTargetId = null;
let editingCatIncomeTxId = null;
function openCategoryIncomeModal(catId) {
  catIncomeTargetId = catId;
  editingCatIncomeTxId = null;
  document.getElementById("cat-income-amount").value = "";
  document.getElementById("cat-income-desc").value = "";
  document.getElementById("cat-income-date").value = "";
  openModal("modal-cat-income");
}
function editCategoryIncomeTx(catId, txId) {
  const cat = state.categories.find(c => c.id === catId);
  const tx = cat && (cat.transactions || []).find(t => t.id === txId);
  if (!tx) return;
  catIncomeTargetId = catId;
  editingCatIncomeTxId = txId;
  document.getElementById("cat-income-amount").value = tx.amount;
  document.getElementById("cat-income-desc").value = tx.desc;
  document.getElementById("cat-income-date").value = tx.date ? tx.date.slice(0, 10) : "";
  openModal("modal-cat-income");
}
function saveCategoryIncome() {
  const cat = state.categories.find(c => c.id === catIncomeTargetId);
  if (!cat) return;
  const amount = parseFloat(document.getElementById("cat-income-amount").value) || 0;
  if (!amount) return;
  const desc = document.getElementById("cat-income-desc").value || "Ingreso en categoría";
  const dateVal = document.getElementById("cat-income-date").value;
  const date = dateVal ? dateVal + "T12:00:00.000Z" : todayISO();
  cat.transactions = cat.transactions || [];
  if (editingCatIncomeTxId) {
    const tx = cat.transactions.find(t => t.id === editingCatIncomeTxId);
    if (tx) { tx.desc = desc; tx.amount = amount; tx.date = date; }
  } else {
    cat.transactions.push({ id: uid("tx"), desc, amount, date });
  }
  editingCatIncomeTxId = null;
  closeModal("modal-cat-income");
  renderGastos();
}

/* ===== INGRESOS REALES (dentro de una categoría de ingreso) ===== */
let incomeTargetCategory = null;
let editingIncomeEntryId = null;
function openIncomeModal(catId) {
  incomeTargetCategory = catId;
  editingIncomeEntryId = null;
  document.getElementById("income-title").textContent = "Añadir ingreso";
  document.getElementById("income-category-field").style.display = "none";
  document.getElementById("income-amount").value = "";
  document.getElementById("income-desc").value = "";
  document.getElementById("income-date").value = "";
  resetRecurringFields("income");
  openModal("modal-income");
}
function editIncomeEntry(catId, entryId) {
  const cat = state.incomeCategories.find(c => c.id === catId);
  const entry = cat && (cat.entries || []).find(e => e.id === entryId);
  if (!entry) return;
  incomeTargetCategory = catId;
  editingIncomeEntryId = entryId;
  document.getElementById("income-title").textContent = "Editar ingreso";
  document.getElementById("income-category-field").style.display = "none";
  document.getElementById("income-amount").value = entry.amount;
  document.getElementById("income-desc").value = entry.desc;
  document.getElementById("income-date").value = entry.date ? entry.date.slice(0, 10) : "";
  document.getElementById("income-recurring").checked = !!entry.recurring;
  document.getElementById("income-rec-fields").style.display = entry.recurring ? "block" : "none";
  document.getElementById("income-rec-day").value = entry.recDay || "";
  document.getElementById("income-rec-noend").checked = entry.recNoEnd !== false;
  document.getElementById("income-rec-end-field").style.display = entry.recNoEnd === false ? "block" : "none";
  document.getElementById("income-rec-end").value = entry.recEnd ? entry.recEnd.slice(0, 10) : "";
  openModal("modal-income");
}
function saveIncome() {
  const cat = state.incomeCategories.find(c => c.id === incomeTargetCategory);
  if (!cat) return;
  const amount = parseFloat(document.getElementById("income-amount").value) || 0;
  if (!amount) return;
  const desc = document.getElementById("income-desc").value || "Ingreso";
  const dateVal = document.getElementById("income-date").value;
  const date = dateVal ? dateVal + "T12:00:00.000Z" : todayISO();
  const rec = readRecurringFields("income");
  cat.entries = cat.entries || [];
  if (editingIncomeEntryId) {
    const e = cat.entries.find(e => e.id === editingIncomeEntryId);
    if (e) { e.desc = desc; e.amount = amount; e.date = date; Object.assign(e, rec); }
  } else {
    cat.entries.push({ id: uid("inc"), desc, amount, date, ...rec });
  }
  editingIncomeEntryId = null;
  closeModal("modal-income");
  renderGastos();
}
function deleteIncomeEntry(catId, entryId) {
  const cat = state.incomeCategories.find(c => c.id === catId);
  if (!cat) return;
  if (!confirm("¿Eliminar este ingreso?")) return;
  cat.entries = (cat.entries || []).filter(e => e.id !== entryId);
  renderGastos();
}

/* ===== AHORROS ===== */
let editingSavingId = null;
function openSavingModal() {
  editingSavingId = null;
  document.getElementById("saving-title").textContent = "Añadir ahorro";
  document.getElementById("saving-amount").value = "";
  document.getElementById("saving-desc").value = "";
  openModal("modal-saving");
}
function editSaving(id) {
  const s = state.savings.find(s => s.id === id);
  if (!s) return;
  editingSavingId = id;
  document.getElementById("saving-title").textContent = "Editar ahorro";
  document.getElementById("saving-amount").value = s.amount;
  document.getElementById("saving-desc").value = s.desc;
  openModal("modal-saving");
}
function saveSaving() {
  const amount = parseFloat(document.getElementById("saving-amount").value) || 0;
  if (!amount) return;
  const desc = document.getElementById("saving-desc").value || "Ahorro";
  if (editingSavingId) {
    const s = state.savings.find(s => s.id === editingSavingId);
    if (s) { s.desc = desc; s.amount = amount; }
  } else {
    state.savings.push({ id: uid("sav"), desc, amount, date: todayISO() });
  }
  editingSavingId = null;
  closeModal("modal-saving");
  renderGastos();
}
function deleteSaving(id) {
  if (!confirm("¿Eliminar este ahorro?")) return;
  state.savings = state.savings.filter(s => s.id !== id);
  renderGastos();
}

/* ===== NOTAS ===== */
function renderNotas() {
  const list = document.getElementById("notas-list");
  const notes = (state.notes || []).slice().reverse();
  list.innerHTML = notes.length ? notes.map(n => `
    <div class="card" style="cursor:pointer;" onclick="editNote('${n.id}')">
      <p style="margin:0 0 6px; font-size:11px; color:var(--text-muted);">${new Date(n.date).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" })}</p>
      <p style="margin:0; white-space:pre-wrap;">${n.text}</p>
    </div>`).join("") : `<p class="empty-hint">Todavía no hay notas</p>`;
}
let editingNoteId = null;
function openNoteModal() {
  editingNoteId = null;
  document.getElementById("note-title").textContent = "Añadir nota";
  document.getElementById("note-text").value = "";
  document.getElementById("note-delete-btn").style.display = "none";
  openModal("modal-note");
}
function editNote(id) {
  const n = (state.notes || []).find(n => n.id === id);
  if (!n) return;
  editingNoteId = id;
  document.getElementById("note-title").textContent = "Editar nota";
  document.getElementById("note-text").value = n.text;
  document.getElementById("note-delete-btn").style.display = "block";
  openModal("modal-note");
}
function saveNote() {
  const text = document.getElementById("note-text").value.trim();
  if (!text) return;
  state.notes = state.notes || [];
  if (editingNoteId) {
    const n = state.notes.find(n => n.id === editingNoteId);
    if (n) n.text = text;
  } else {
    state.notes.push({ id: uid("note"), text, date: todayISO() });
  }
  editingNoteId = null;
  closeModal("modal-note");
  renderNotas();
  persist();
}
function deleteNote() {
  if (!editingNoteId) return;
  if (!confirm("¿Eliminar esta nota?")) return;
  state.notes = (state.notes || []).filter(n => n.id !== editingNoteId);
  editingNoteId = null;
  closeModal("modal-note");
  renderNotas();
  persist();
}



/* ===== HISTÓRICO ===== */
let histIndex = null; // índice dentro de sortedPeriods(); null = el periodo actual (abierto)

function changeHistPeriod(delta) {
  const periods = sortedPeriods();
  const curIdx = histIndex === null ? periods.length - 1 : histIndex;
  const next = curIdx + delta;
  if (next < 0 || next >= periods.length) return;
  histIndex = next === periods.length - 1 && !periods[next].endDate ? null : next;
  renderHistorico();
}

function histPeriod() {
  const periods = sortedPeriods();
  if (!periods.length) return null;
  return histIndex === null ? periods[periods.length - 1] : periods[histIndex];
}

function renderHistPeriodSelect(current) {
  const periods = sortedPeriods();
  const sel = document.getElementById("hist-period-select");
  sel.innerHTML = periods.slice().reverse().map(p =>
    `<option value="${p.id}" ${p.id === current.id ? "selected" : ""}>${p.label || "Mes actual"}${!p.endDate ? " (en curso)" : ""}</option>`
  ).join("");
}
function jumpToHistPeriod(periodId) {
  const periods = sortedPeriods();
  const idx = periods.findIndex(p => p.id === periodId);
  if (idx === -1) return;
  histIndex = idx === periods.length - 1 && !periods[idx].endDate ? null : idx;
  renderHistorico();
}

function renderHistorico() {
  const mp = histPeriod();
  if (!mp) { document.getElementById("hist-content").innerHTML = `<p class="empty-hint">Todavía no hay ningún mes</p>`; return; }
  document.getElementById("hist-period-label").textContent = mp.label || "Mes actual";
  renderHistPeriodSelect(mp);
  const year = periodYear(mp);

  const gastosMes = state.categories.reduce((s, c) => s + catGastadoNeto(c, mp), 0);
  const ingresosMes = state.incomeCategories.reduce((s, c) => s + incCatTotalInMonth(c, mp), 0);
  const yearPeriods = periodsInYear(year);
  const nMeses = yearPeriods.length || 1;
  const gastosPorMes = yearPeriods.map(p => state.categories.reduce((s, c) => s + catGastadoNeto(c, p), 0));
  const ingresosPorMes = yearPeriods.map(p => state.incomeCategories.reduce((s, c) => s + incCatTotalInMonth(c, p), 0));

  const gastoRows = state.categories.map(c => {
    const periodsWith = yearPeriods.filter(p => catSpentInMonth(c, p) > 0 || catIngresosInMonth(c, p) > 0);
    const total = periodsWith.reduce((s, p) => s + catGastadoNeto(c, p), 0);
    const avg = total / (periodsWith.length || 1);
    return `<tr><td>${c.name}</td><td>${fmt(avg)}</td><td class="col-year">${fmt(total)}</td></tr>`;
  }).join("") || `<tr><td colspan="3" class="empty-hint">Sin categorías</td></tr>`;

  const incRows = state.incomeCategories.map(c => {
    const periodsWith = yearPeriods.filter(p => incCatTotalInMonth(c, p) > 0);
    const total = periodsWith.reduce((s, p) => s + incCatTotalInMonth(c, p), 0);
    const avg = total / (periodsWith.length || 1);
    return `<tr><td>${c.name}</td><td>${fmt(avg)}</td><td class="col-year">${fmt(total)}</td></tr>`;
  }).join("") || `<tr><td colspan="3" class="empty-hint">Sin categorías</td></tr>`;

  const barsHtml = state.categories.map(c => {
    const g = catGastadoNeto(c, mp);
    const pct = c.budget ? Math.max(0, Math.min(100, (g / c.budget) * 100)) : 0;
    return `<div class="bar-row">
      <div class="bar-row-head"><span>${c.name}</span><span>${fmt(g)} / ${fmt(c.budget)}</span></div>
      <div class="progress-track"><div class="progress-fill ${g > c.budget && c.budget > 0 ? "over" : ""}" style="width:${pct}%;"></div></div>
    </div>`;
  }).join("") || `<p class="empty-hint">Sin categorías</p>`;

  document.getElementById("hist-content").innerHTML = `
    <div class="metric-grid-3" style="margin-bottom:14px;">
      <div class="metric red"><p class="label">Gastos mes</p><p class="value">${fmt(gastosMes)}</p></div>
      <div class="metric green"><p class="label">Ingresos mes</p><p class="value">${fmt(ingresosMes)}</p></div>
      <div class="metric wide"><p class="label">Balance Ingresos − Gastos</p><p class="value">${fmt(ingresosMes - gastosMes)}</p></div>
    </div>
    <div class="metric-grid" style="margin-bottom:14px;">
      <div class="metric red"><p class="label">Promedio total gastos mensuales (${year})</p><p class="value">${fmt(gastosPorMes.reduce((a, b) => a + b, 0) / nMeses)}</p></div>
      <div class="metric green"><p class="label">Promedio total ingresos mensuales (${year})</p><p class="value">${fmt(ingresosPorMes.reduce((a, b) => a + b, 0) / nMeses)}</p></div>
    </div>
    <div class="card"><p class="section-label">Gasto por categoría</p><div style="overflow-x:auto;"><table class="cat-table"><tr><th>Categoría</th><th>Prom. Mes</th><th>Total Año</th></tr>${gastoRows}</table></div></div>
    <div class="card"><p class="section-label">Ingreso por categoría</p><div style="overflow-x:auto;"><table class="cat-table"><tr><th>Categoría</th><th>Prom. Mes</th><th>Total Año</th></tr>${incRows}</table></div></div>
    <div class="card"><p class="section-label">Gasto vs presupuesto</p>${barsHtml}</div>
  `;
}

/* Descargar a Excel el mes que se está viendo en Histórico */
function downloadHistPeriodExcel() {
  const mp = histPeriod();
  if (!mp || typeof XLSX === "undefined") return;
  const rows = [["Money Manager · " + (mp.label || "Mes actual")], []];
  rows.push(["GASTOS POR CATEGORÍA"]);
  rows.push(["Categoría", "Gastado", "Presupuesto"]);
  state.categories.forEach(c => rows.push([c.name, catGastadoNeto(c, mp), c.budget]));
  rows.push([]);
  rows.push(["INGRESOS POR CATEGORÍA"]);
  rows.push(["Categoría", "Total"]);
  state.incomeCategories.forEach(c => rows.push([c.name, incCatTotalInMonth(c, mp)]));
  rows.push([]);
  const totalGastos = state.categories.reduce((s, c) => s + catGastadoNeto(c, mp), 0);
  const totalIngresos = state.incomeCategories.reduce((s, c) => s + incCatTotalInMonth(c, mp), 0);
  const totalAhorro = savingsInMonth(mp);
  rows.push(["AHORRO"]);
  rows.push(["Ahorrado este mes", totalAhorro]);
  rows.push([]);
  rows.push(["RESUMEN"]);
  rows.push(["Gastos mes", totalGastos]);
  rows.push(["Ingresos mes", totalIngresos]);
  rows.push(["Balance", totalIngresos - totalGastos]);
  rows.push(["Ahorrado", totalAhorro]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resumen");
  XLSX.writeFile(wb, `MoneyManager-${(mp.label || "mes").replace(/\s+/g, "_")}.xlsx`);
}

/* Descarga el año completo (todos los meses ya pasados + el actual) con los meses como columnas, tipo el Excel original */
function downloadYearExcel() {
  if (typeof XLSX === "undefined") return;
  const mp = histPeriod() || currentPeriod();
  const year = periodYear(mp);
  const yearPeriods = periodsInYear(year);
  if (!yearPeriods.length) { alert("No hay ningún mes de ese año todavía."); return; }
  const labels = yearPeriods.map(p => p.label || "Mes actual");

  const rows = [];
  rows.push(["MONEY MANAGER · " + year]);
  rows.push([]);

  rows.push(["GASTOS", ...labels, "Anual", "Media"]);
  state.categories.forEach(c => {
    const vals = yearPeriods.map(p => catGastadoNeto(c, p));
    const total = vals.reduce((a, b) => a + b, 0);
    const nMonths = vals.filter(v => v > 0).length || 1;
    rows.push([c.name, ...vals, total, total / nMonths]);
  });
  const gastosTotales = yearPeriods.map(p => state.categories.reduce((s, c) => s + catGastadoNeto(c, p), 0));
  rows.push(["TOTAL GASTOS", ...gastosTotales, gastosTotales.reduce((a, b) => a + b, 0), gastosTotales.reduce((a, b) => a + b, 0) / (yearPeriods.length || 1)]);
  rows.push([]);

  rows.push(["INGRESOS", ...labels, "Anual", "Media"]);
  state.incomeCategories.forEach(c => {
    const vals = yearPeriods.map(p => incCatTotalInMonth(c, p));
    const total = vals.reduce((a, b) => a + b, 0);
    const nMonths = vals.filter(v => v > 0).length || 1;
    rows.push([c.name, ...vals, total, total / nMonths]);
  });
  const ingresosTotales = yearPeriods.map(p => state.incomeCategories.reduce((s, c) => s + incCatTotalInMonth(c, p), 0));
  rows.push(["TOTAL INGRESOS", ...ingresosTotales, ingresosTotales.reduce((a, b) => a + b, 0), ingresosTotales.reduce((a, b) => a + b, 0) / (yearPeriods.length || 1)]);
  rows.push([]);

  const ahorroPorMes = yearPeriods.map(p => savingsInMonth(p));
  rows.push(["AHORRO", ...labels, "Anual", "Media"]);
  rows.push(["Ahorrado", ...ahorroPorMes, ahorroPorMes.reduce((a, b) => a + b, 0), ahorroPorMes.reduce((a, b) => a + b, 0) / (yearPeriods.length || 1)]);
  rows.push([]);

  const balancePorMes = yearPeriods.map((p, i) => ingresosTotales[i] - gastosTotales[i]);
  rows.push(["BALANCE (Ingresos − Gastos)", ...labels, "Anual", "Media"]);
  rows.push(["Balance", ...balancePorMes, balancePorMes.reduce((a, b) => a + b, 0), balancePorMes.reduce((a, b) => a + b, 0) / (yearPeriods.length || 1)]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, year);
  XLSX.writeFile(wb, `MoneyManager-${year}.xlsx`);
}

/* Añadir mes pasado: crea un periodo cerrado con nombre + fechas propias, y mete un total por categoría */
function openManualMonthModal() {
  document.getElementById("manual-month-label").value = "";
  document.getElementById("manual-month-start").value = "";
  document.getElementById("manual-month-end").value = "";
  document.getElementById("manual-month-savings").value = "";
  document.getElementById("manual-month-gastos").innerHTML = state.categories.length
    ? state.categories.map(c => `<div class="field"><label>${c.name}</label><input type="number" class="mm-gasto" data-id="${c.id}" placeholder="0,00"></div>`).join("")
    : `<p class="empty-hint">Todavía no tienes categorías de gasto</p>`;
  document.getElementById("manual-month-ingresos").innerHTML = state.incomeCategories.length
    ? state.incomeCategories.map(c => `<div class="field"><label>${c.name}</label><input type="number" class="mm-ingreso" data-id="${c.id}" placeholder="0,00"></div>`).join("")
    : `<p class="empty-hint">Todavía no tienes categorías de ingreso</p>`;
  openModal("modal-manual-month");
}
function saveManualMonth() {
  const label = document.getElementById("manual-month-label").value.trim();
  const start = document.getElementById("manual-month-start").value;
  const end = document.getElementById("manual-month-end").value;
  if (!label || !start || !end) return;
  const startDate = start + "T00:00:00.000Z";
  const endDate = end + "T23:59:59.999Z";
  const midDate = start + "T12:00:00.000Z";

  document.querySelectorAll(".mm-gasto").forEach(inp => {
    const val = parseFloat(inp.value);
    if (!val) return;
    const cat = state.categories.find(c => c.id === inp.dataset.id);
    if (cat) { cat.transactions = cat.transactions || []; cat.transactions.push({ id: uid("tx"), desc: label, amount: -val, date: midDate }); }
  });
  document.querySelectorAll(".mm-ingreso").forEach(inp => {
    const val = parseFloat(inp.value);
    if (!val) return;
    const cat = state.incomeCategories.find(c => c.id === inp.dataset.id);
    if (cat) { cat.entries = cat.entries || []; cat.entries.push({ id: uid("inc"), desc: label, amount: val, date: midDate }); }
  });
  const savingsVal = parseFloat(document.getElementById("manual-month-savings").value);
  if (savingsVal) state.savings.push({ id: uid("sav"), desc: label, amount: savingsVal, date: midDate });

  state.periods.push({ id: uid("per"), label, startDate, endDate });
  closeModal("modal-manual-month");
  persist();
  histIndex = sortedPeriods().findIndex(p => p.label === label && p.startDate === startDate);
  renderHistorico();
}

/* ===== INIT ===== */
function renderAll() {
  renderGastos();
}
if (!useFirebase) renderAll();
