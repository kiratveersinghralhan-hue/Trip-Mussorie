import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getDatabase, onValue, ref, set } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

/*
  ✅ GitHub Pages-ready static app.
  ✅ For realtime between all friends, paste your Firebase web config below.
  ✅ Without Firebase, the app works locally and syncs instantly between tabs on the same device.
*/
const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const DEFAULT_ROOM = "mussoorie-boys-trip";
const ROOM_ID = new URLSearchParams(location.search).get("room") || DEFAULT_ROOM;
const STORAGE_KEY = `boysTripState:${ROOM_ID}`;
const CHANNEL_NAME = `boysTripChannel:${ROOM_ID}`;
const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

const appRoot = document.querySelector("#app");
const syncDot = document.querySelector("#syncDot");
const syncTitle = document.querySelector("#syncTitle");
const syncDetail = document.querySelector("#syncDetail");

let firebaseRef = null;
let usingFirebase = false;
let saveTimer = null;
let remoteApplying = false;
let channel = null;

const defaultState = () => ({
  version: 1,
  tripName: "Mussoorie Boys Trip",
  updatedAt: new Date().toISOString(),
  members: [
    { id: "m1", name: "Aryan", budget: 6000 },
    { id: "m2", name: "Kabir", budget: 6000 },
    { id: "m3", name: "Rohit", budget: 6000 },
    { id: "m4", name: "Yash", budget: 6000 },
    { id: "m5", name: "Dev", budget: 6000 },
    { id: "m6", name: "Kunal", budget: 6000 },
    { id: "m7", name: "Aman", budget: 6000 }
  ],
  expenses: [
    {
      id: cryptoId(),
      title: "Demo: cab advance",
      amount: 1400,
      paidBy: "m1",
      splitBetween: ["m1", "m2", "m3", "m4", "m5", "m6", "m7"],
      category: "Travel",
      date: today()
    }
  ],
  orders: [
    {
      id: cryptoId(),
      place: "Demo: roadside café",
      paidBy: "m2",
      finalTotal: 840,
      createdAt: new Date().toISOString(),
      items: [
        { id: cryptoId(), memberId: "m1", name: "Maggie", qty: 1, price: 0 },
        { id: cryptoId(), memberId: "m2", name: "Tea", qty: 2, price: 0 },
        { id: cryptoId(), memberId: "m3", name: "Sandwich", qty: 1, price: 0 }
      ]
    }
  ]
});

let state = loadState();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function cryptoId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(saved || defaultState());
  } catch {
    return defaultState();
  }
}

function normalizeState(next) {
  const fresh = defaultState();
  const merged = { ...fresh, ...(next || {}) };
  merged.members = Array.isArray(merged.members) ? merged.members : fresh.members;
  merged.expenses = Array.isArray(merged.expenses) ? merged.expenses : [];
  merged.orders = Array.isArray(merged.orders) ? merged.orders : [];
  merged.members = merged.members.map((member, index) => ({
    id: member.id || cryptoId(),
    name: member.name || `Friend ${index + 1}`,
    budget: Number(member.budget) || 0
  }));
  merged.expenses = merged.expenses.map(expense => ({
    id: expense.id || cryptoId(),
    title: expense.title || "Expense",
    amount: Number(expense.amount) || 0,
    paidBy: expense.paidBy || merged.members[0]?.id || "",
    splitBetween: Array.isArray(expense.splitBetween) && expense.splitBetween.length ? expense.splitBetween : merged.members.map(m => m.id),
    category: expense.category || "General",
    date: expense.date || today()
  }));
  merged.orders = merged.orders.map(order => ({
    id: order.id || cryptoId(),
    place: order.place || "Restaurant stop",
    paidBy: order.paidBy || merged.members[0]?.id || "",
    finalTotal: Number(order.finalTotal) || 0,
    createdAt: order.createdAt || new Date().toISOString(),
    items: Array.isArray(order.items) ? order.items.map(item => ({
      id: item.id || cryptoId(),
      memberId: item.memberId || merged.members[0]?.id || "",
      name: item.name || "Item",
      qty: Number(item.qty) || 1,
      price: Number(item.price) || 0
    })) : []
  }));
  return merged;
}

function hasFirebaseConfig() {
  return Boolean(
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.databaseURL &&
    FIREBASE_CONFIG.projectId &&
    !FIREBASE_CONFIG.apiKey.includes("PASTE")
  );
}

function setSyncStatus(mode, title, detail) {
  syncDot.className = `dot ${mode}`;
  syncTitle.textContent = title;
  syncDetail.textContent = detail;
}

async function initRealtime() {
  setupLocalRealtime();

  if (!hasFirebaseConfig()) {
    setSyncStatus("local", "Local live mode", "Add Firebase config for friend-to-friend realtime");
    render();
    return;
  }

  try {
    const fbApp = initializeApp(FIREBASE_CONFIG);
    const db = getDatabase(fbApp);
    firebaseRef = ref(db, `trips/${ROOM_ID}`);
    usingFirebase = true;

    onValue(firebaseRef, snapshot => {
      const remote = snapshot.val();
      if (!remote) {
        writeFirebase(state);
        return;
      }
      remoteApplying = true;
      state = normalizeState(remote);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      remoteApplying = false;
      setSyncStatus("online", "Realtime online", `Room: ${ROOM_ID}`);
    }, error => {
      setSyncStatus("error", "Firebase error", error.message);
      usingFirebase = false;
      render();
    });
  } catch (error) {
    setSyncStatus("error", "Firebase setup failed", "Using local backup mode");
    usingFirebase = false;
    render();
  }
}

function setupLocalRealtime() {
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = event => {
      if (!event.data || event.data.updatedAt === state.updatedAt) return;
      remoteApplying = true;
      state = normalizeState(event.data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
      remoteApplying = false;
    };
  }

  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const incoming = normalizeState(JSON.parse(event.newValue));
      if (incoming.updatedAt === state.updatedAt) return;
      remoteApplying = true;
      state = incoming;
      render();
      remoteApplying = false;
    } catch {
      // Ignore invalid local storage payloads.
    }
  });
}

function commit({ immediate = false } = {}) {
  if (remoteApplying) return;
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (channel) channel.postMessage(state);
  render();

  clearTimeout(saveTimer);
  const delay = immediate ? 0 : 350;
  saveTimer = setTimeout(() => {
    if (usingFirebase && firebaseRef) writeFirebase(state);
  }, delay);
}

function writeFirebase(payload) {
  return set(firebaseRef, payload).catch(error => {
    setSyncStatus("error", "Could not save online", error.message);
  });
}

function money(value) {
  return INR.format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function memberName(id) {
  return state.members.find(member => member.id === id)?.name || "Unknown friend";
}

function memberOptions(selectedId = "") {
  return state.members.map(member => `
    <option value="${escapeHtml(member.id)}" ${member.id === selectedId ? "selected" : ""}>${escapeHtml(member.name)}</option>
  `).join("");
}

function calcOrderShares(order) {
  const items = order.items || [];
  const participants = [...new Set(items.map(item => item.memberId).filter(Boolean))];
  const rawItemTotal = items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1), 0);
  const finalTotal = Number(order.finalTotal) || rawItemTotal;
  const allItemsPriced = items.length > 0 && items.every(item => Number(item.price) > 0);
  const shares = Object.fromEntries(state.members.map(member => [member.id, 0]));

  if (!items.length || finalTotal <= 0) return { finalTotal: 0, rawItemTotal: 0, shares, participants };

  if (allItemsPriced && rawItemTotal > 0) {
    items.forEach(item => {
      const itemTotal = (Number(item.price) || 0) * (Number(item.qty) || 1);
      shares[item.memberId] = (shares[item.memberId] || 0) + (itemTotal / rawItemTotal) * finalTotal;
    });
  } else {
    const equalShare = participants.length ? finalTotal / participants.length : 0;
    participants.forEach(memberId => { shares[memberId] = equalShare; });
  }

  return { finalTotal, rawItemTotal, shares, participants };
}

function totals() {
  const perMember = Object.fromEntries(state.members.map(member => [member.id, {
    member,
    budget: Number(member.budget) || 0,
    paid: 0,
    share: 0,
    orderShare: 0,
    expenseShare: 0,
    balance: 0
  }]));

  for (const expense of state.expenses) {
    const amount = Number(expense.amount) || 0;
    const splitBetween = (expense.splitBetween || []).filter(id => perMember[id]);
    if (perMember[expense.paidBy]) perMember[expense.paidBy].paid += amount;
    const each = splitBetween.length ? amount / splitBetween.length : 0;
    splitBetween.forEach(id => {
      perMember[id].share += each;
      perMember[id].expenseShare += each;
    });
  }

  for (const order of state.orders) {
    const { finalTotal, shares } = calcOrderShares(order);
    if (perMember[order.paidBy]) perMember[order.paidBy].paid += finalTotal;
    Object.entries(shares).forEach(([id, amount]) => {
      if (perMember[id]) {
        perMember[id].share += amount;
        perMember[id].orderShare += amount;
      }
    });
  }

  Object.values(perMember).forEach(row => {
    row.balance = row.paid - row.share;
  });

  const totalBudget = Object.values(perMember).reduce((sum, row) => sum + row.budget, 0);
  const expenseTotal = state.expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const orderTotal = state.orders.reduce((sum, order) => sum + calcOrderShares(order).finalTotal, 0);
  const totalSpent = expenseTotal + orderTotal;

  return {
    perMember,
    totalBudget,
    expenseTotal,
    orderTotal,
    totalSpent,
    remaining: totalBudget - totalSpent
  };
}

function settlementRows(perMember) {
  const debtors = Object.values(perMember)
    .filter(row => row.balance < -0.5)
    .map(row => ({ id: row.member.id, name: row.member.name, amount: Math.abs(row.balance) }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = Object.values(perMember)
    .filter(row => row.balance > 0.5)
    .map(row => ({ id: row.member.id, name: row.member.name, amount: row.balance }))
    .sort((a, b) => b.amount - a.amount);

  const rows = [];
  let d = 0;
  let c = 0;

  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].amount, creditors[c].amount);
    rows.push({ from: debtors[d].name, to: creditors[c].name, amount });
    debtors[d].amount -= amount;
    creditors[c].amount -= amount;
    if (debtors[d].amount <= 0.5) d += 1;
    if (creditors[c].amount <= 0.5) c += 1;
  }

  return rows;
}

function render() {
  const summary = totals();
  appRoot.innerHTML = `
    ${renderDashboard(summary)}
    ${renderFriends(summary)}
    ${renderExpenseForm()}
    ${renderExpenses()}
    ${renderOrders()}
    ${renderSettlement(summary)}
    ${renderSettings()}
  `;
}

function renderDashboard(summary) {
  return `
    <section class="card span-12">
      <div class="card-body stats">
        <div class="stat"><small>Total group budget</small><strong>${money(summary.totalBudget)}</strong></div>
        <div class="stat"><small>Total spent</small><strong>${money(summary.totalSpent)}</strong></div>
        <div class="stat"><small>Remaining</small><strong class="${summary.remaining >= 0 ? "balance-positive" : "balance-negative"}">${money(summary.remaining)}</strong></div>
        <div class="stat"><small>Friends</small><strong>${state.members.length}</strong></div>
      </div>
    </section>
  `;
}

function renderFriends(summary) {
  const rows = state.members.map(member => {
    const row = summary.perMember[member.id];
    const balanceClass = row.balance > 0.5 ? "balance-positive" : row.balance < -0.5 ? "balance-negative" : "balance-neutral";
    return `
      <div class="friend-row">
        <div class="field">
          <label>Name</label>
          <input value="${escapeHtml(member.name)}" data-action="member-name" data-id="${escapeHtml(member.id)}" placeholder="Friend name" />
        </div>
        <div class="field">
          <label>Budget</label>
          <input type="number" min="0" value="${member.budget}" data-action="member-budget" data-id="${escapeHtml(member.id)}" />
        </div>
        <div class="friend-money"><small>Used</small><strong>${money(row.share)}</strong></div>
        <div class="friend-money"><small>Balance</small><strong class="${balanceClass}">${row.balance >= 0 ? "+" : ""}${money(row.balance)}</strong></div>
        <button class="btn danger small" data-action="remove-member" data-id="${escapeHtml(member.id)}">Remove</button>
      </div>
    `;
  }).join("");

  return `
    <section class="card span-12">
      <div class="card-header">
        <div>
          <h2>👬 Friends & budgets</h2>
          <p>Start with 7 friends. Rename anyone, update budgets, or add/remove friends anytime.</p>
        </div>
        <div class="toolbar">
          <button class="btn" data-action="add-member">+ Add friend</button>
        </div>
      </div>
      <div class="card-body friend-list">${rows}</div>
    </section>
  `;
}

function renderExpenseForm() {
  const splitChips = state.members.map(member => `
    <label class="chip checkbox-chip">
      <input type="checkbox" name="splitBetween" value="${escapeHtml(member.id)}" checked>
      <span>${escapeHtml(member.name)}</span>
    </label>
  `).join("");

  return `
    <section class="card span-7">
      <div class="card-header">
        <div>
          <h2>💸 Add expense</h2>
          <p>For hotels, fuel, cab, activities, parking, snacks — choose who paid and who shares it.</p>
        </div>
      </div>
      <div class="card-body">
        <form class="form-grid" id="expenseForm">
          <div class="field col-6">
            <label for="expenseTitle">Expense name</label>
            <input id="expenseTitle" name="title" required placeholder="Hotel booking, petrol, cab..." />
          </div>
          <div class="field col-3">
            <label for="expenseAmount">Amount</label>
            <input id="expenseAmount" name="amount" type="number" min="1" step="1" required placeholder="₹" />
          </div>
          <div class="field col-3">
            <label for="expenseDate">Date</label>
            <input id="expenseDate" name="date" type="date" value="${today()}" />
          </div>
          <div class="field col-4">
            <label for="paidBy">Paid by</label>
            <select id="paidBy" name="paidBy">${memberOptions(state.members[0]?.id)}</select>
          </div>
          <div class="field col-4">
            <label for="category">Category</label>
            <select id="category" name="category">
              <option>Travel</option>
              <option>Stay</option>
              <option>Food</option>
              <option>Adventure</option>
              <option>Shopping</option>
              <option>General</option>
            </select>
          </div>
          <div class="field col-4">
            <label>&nbsp;</label>
            <button class="btn" type="submit">Add expense</button>
          </div>
          <div class="field col-12">
            <span class="label">Split between</span>
            <div class="split-box">${splitChips}</div>
          </div>
        </form>
      </div>
    </section>
  `;
}

function renderExpenses() {
  const rows = [...state.expenses].reverse().map(expense => `
    <div class="expense-row">
      <div>
        <div class="expense-title">
          <strong>${escapeHtml(expense.title)}</strong>
          <span class="money-pill">${money(expense.amount)}</span>
        </div>
        <div class="expense-meta">
          <span class="chip">Paid by ${escapeHtml(memberName(expense.paidBy))}</span>
          <span class="chip">${escapeHtml(expense.category)}</span>
          <span class="chip">${escapeHtml(expense.date)}</span>
          <span class="chip">Split: ${(expense.splitBetween || []).map(memberName).map(escapeHtml).join(", ")}</span>
        </div>
      </div>
      <button class="btn danger small" data-action="delete-expense" data-id="${escapeHtml(expense.id)}">Delete</button>
    </div>
  `).join("");

  return `
    <section class="card span-5">
      <div class="card-header">
        <div>
          <h2>🧾 Expense log</h2>
          <p>Every update recalculates balances instantly.</p>
        </div>
      </div>
      <div class="card-body expense-list">
        ${rows || `<div class="empty">No expenses yet. Add the first one.</div>`}
      </div>
    </section>
  `;
}

function renderOrders() {
  const orderCards = state.orders.map(order => {
    const orderSummary = calcOrderShares(order);
    const itemRows = order.items.map(item => `
      <div class="item-row">
        <span><strong>${escapeHtml(memberName(item.memberId))}</strong></span>
        <span>${escapeHtml(item.name)}</span>
        <span>Qty ${Number(item.qty) || 1}</span>
        <span>${Number(item.price) ? money((Number(item.price) || 0) * (Number(item.qty) || 1)) : "No price"}</span>
        <button class="btn danger small" data-action="delete-order-item" data-order-id="${escapeHtml(order.id)}" data-id="${escapeHtml(item.id)}">Delete</button>
      </div>
    `).join("");

    const shareChips = Object.entries(orderSummary.shares)
      .filter(([, amount]) => amount > 0.5)
      .map(([id, amount]) => `<span class="chip">${escapeHtml(memberName(id))}: ${money(amount)}</span>`)
      .join("");

    return `
      <article class="order-card">
        <div class="order-top">
          <div>
            <h3>🍽️ ${escapeHtml(order.place)}</h3>
            <div class="order-summary">
              <span class="chip">Bill: ${money(orderSummary.finalTotal)}</span>
              <span class="chip">Paid by ${escapeHtml(memberName(order.paidBy))}</span>
              <span class="chip">${order.items.length} item${order.items.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          <button class="btn danger small" data-action="delete-order" data-id="${escapeHtml(order.id)}">Delete stop</button>
        </div>

        <div class="form-grid">
          <div class="field col-4">
            <label>Final order total</label>
            <input type="number" min="0" step="1" value="${order.finalTotal || ""}" data-action="order-total" data-id="${escapeHtml(order.id)}" placeholder="Enter final bill" />
          </div>
          <div class="field col-4">
            <label>Paid by</label>
            <select data-action="order-paid-by" data-id="${escapeHtml(order.id)}">${memberOptions(order.paidBy)}</select>
          </div>
          <div class="field col-4">
            <label>Place name</label>
            <input value="${escapeHtml(order.place)}" data-action="order-place" data-id="${escapeHtml(order.id)}" />
          </div>
        </div>

        <form class="form-grid" data-order-form="${escapeHtml(order.id)}">
          <div class="field col-3">
            <label>Friend</label>
            <select name="memberId">${memberOptions(state.members[0]?.id)}</select>
          </div>
          <div class="field col-4">
            <label>Item name</label>
            <input name="item" required placeholder="Burger, chai, momos..." />
          </div>
          <div class="field col-2">
            <label>Qty</label>
            <input name="qty" type="number" min="1" value="1" />
          </div>
          <div class="field col-2">
            <label>Price optional</label>
            <input name="price" type="number" min="0" step="1" placeholder="₹" />
          </div>
          <div class="field col-1">
            <label>&nbsp;</label>
            <button class="btn small" type="submit">Add</button>
          </div>
        </form>

        <div class="order-items">${itemRows || `<div class="empty">No items yet. Friends can add what they ordered.</div>`}</div>
        <div class="split-box">${shareChips || `<span class="chip">Add items and total to calculate shares</span>`}</div>
      </article>
    `;
  }).join("");

  return `
    <section class="card span-8">
      <div class="card-header">
        <div>
          <h2>🥘 Restaurant order board</h2>
          <p>Use this when you stop at a restaurant. Friends add item names, then you enter the final bill total.</p>
        </div>
        <div class="toolbar"><button class="btn" data-action="add-order">+ New stop</button></div>
      </div>
      <div class="card-body order-list">
        ${orderCards || `<div class="empty">No restaurant stops yet. Create one when you stop for food.</div>`}
      </div>
    </section>
  `;
}

function renderSettlement(summary) {
  const rows = settlementRows(summary.perMember).map(row => `
    <div class="settlement-row">
      <span><strong>${escapeHtml(row.from)}</strong> pays <strong>${escapeHtml(row.to)}</strong></span>
      <strong class="balance-negative">${money(row.amount)}</strong>
    </div>
  `).join("");

  return `
    <section class="card span-4">
      <div class="card-header">
        <div>
          <h2>🤝 Settlement</h2>
          <p>Simple who-pays-whom list based on expenses and restaurant orders.</p>
        </div>
      </div>
      <div class="card-body settlement-list">
        ${rows || `<div class="empty">All settled right now 🎉</div>`}
      </div>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="card span-12">
      <div class="card-header">
        <div>
          <h2>⚙️ Trip controls</h2>
          <p>Use room links for different trips. Example: <span class="chip">?room=trip-2026</span></p>
        </div>
        <div class="toolbar">
          <button class="btn secondary" data-action="download-json">Download backup</button>
          <button class="btn danger" data-action="reset-demo">Reset demo data</button>
        </div>
      </div>
      <div class="card-body">
        <p class="footer-note">
          Current room: <strong>${escapeHtml(ROOM_ID)}</strong>. Firebase config is ${hasFirebaseConfig() ? "filled, so this can sync between friends online." : "empty, so this is local demo mode until you add Firebase config in app.js."}
        </p>
      </div>
    </section>
  `;
}

function addMember() {
  state.members.push({ id: cryptoId(), name: `Friend ${state.members.length + 1}`, budget: 6000 });
  commit({ immediate: true });
}

function removeMember(id) {
  if (state.members.length <= 1) {
    alert("Keep at least one friend in the trip.");
    return;
  }
  state.members = state.members.filter(member => member.id !== id);
  const fallback = state.members[0]?.id || "";
  state.expenses = state.expenses.map(expense => ({
    ...expense,
    paidBy: expense.paidBy === id ? fallback : expense.paidBy,
    splitBetween: (expense.splitBetween || []).filter(memberId => memberId !== id)
  })).filter(expense => expense.splitBetween.length > 0);
  state.orders = state.orders.map(order => ({
    ...order,
    paidBy: order.paidBy === id ? fallback : order.paidBy,
    items: order.items.filter(item => item.memberId !== id)
  }));
  commit({ immediate: true });
}

function addExpense(form) {
  const formData = new FormData(form);
  const splitBetween = formData.getAll("splitBetween");
  if (!splitBetween.length) {
    alert("Select at least one friend to split the expense.");
    return;
  }
  state.expenses.push({
    id: cryptoId(),
    title: formData.get("title").trim(),
    amount: Number(formData.get("amount")) || 0,
    paidBy: formData.get("paidBy"),
    splitBetween,
    category: formData.get("category"),
    date: formData.get("date") || today()
  });
  form.reset();
  commit({ immediate: true });
}

function addOrder() {
  state.orders.unshift({
    id: cryptoId(),
    place: `Restaurant stop ${state.orders.length + 1}`,
    paidBy: state.members[0]?.id || "",
    finalTotal: 0,
    createdAt: new Date().toISOString(),
    items: []
  });
  commit({ immediate: true });
}

function addOrderItem(orderId, form) {
  const order = state.orders.find(entry => entry.id === orderId);
  if (!order) return;
  const formData = new FormData(form);
  order.items.push({
    id: cryptoId(),
    memberId: formData.get("memberId"),
    name: formData.get("item").trim(),
    qty: Number(formData.get("qty")) || 1,
    price: Number(formData.get("price")) || 0
  });
  form.reset();
  commit({ immediate: true });
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${ROOM_ID}-backup.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

appRoot.addEventListener("submit", event => {
  if (event.target.id === "expenseForm") {
    event.preventDefault();
    addExpense(event.target);
  }

  const orderId = event.target.dataset.orderForm;
  if (orderId) {
    event.preventDefault();
    addOrderItem(orderId, event.target);
  }
});

appRoot.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id, orderId } = button.dataset;

  if (action === "add-member") addMember();
  if (action === "remove-member") removeMember(id);
  if (action === "delete-expense") {
    state.expenses = state.expenses.filter(expense => expense.id !== id);
    commit({ immediate: true });
  }
  if (action === "add-order") addOrder();
  if (action === "delete-order") {
    state.orders = state.orders.filter(order => order.id !== id);
    commit({ immediate: true });
  }
  if (action === "delete-order-item") {
    const order = state.orders.find(entry => entry.id === orderId);
    if (order) order.items = order.items.filter(item => item.id !== id);
    commit({ immediate: true });
  }
  if (action === "download-json") downloadBackup();
  if (action === "reset-demo") {
    if (confirm("Reset this room to demo data?")) {
      state = defaultState();
      commit({ immediate: true });
    }
  }
});

appRoot.addEventListener("change", event => {
  const target = event.target;
  const { action, id } = target.dataset;
  if (!action) return;

  if (action === "member-name") {
    const member = state.members.find(entry => entry.id === id);
    if (member) member.name = target.value.trim() || "Friend";
  }
  if (action === "member-budget") {
    const member = state.members.find(entry => entry.id === id);
    if (member) member.budget = Number(target.value) || 0;
  }
  if (action === "order-total") {
    const order = state.orders.find(entry => entry.id === id);
    if (order) order.finalTotal = Number(target.value) || 0;
  }
  if (action === "order-paid-by") {
    const order = state.orders.find(entry => entry.id === id);
    if (order) order.paidBy = target.value;
  }
  if (action === "order-place") {
    const order = state.orders.find(entry => entry.id === id);
    if (order) order.place = target.value.trim() || "Restaurant stop";
  }

  commit();
});

initRealtime();
