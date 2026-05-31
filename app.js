const STORAGE_KEY = "tripSplit.mussoorie.clean.v1";
const CHANNEL_NAME = "tripSplitLocalSync";

const defaultFriends = [
  "Aarav",
  "Kabir",
  "Vivaan",
  "Reyansh",
  "Arjun",
  "Dhruv",
  "Ishaan"
];

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const blankState = () => ({
  trip: {
    title: "Mussoorie Boys Trip",
    destination: "Mussoorie, Uttarakhand"
  },
  activeTab: "dashboard",
  friends: defaultFriends.map((name, index) => ({
    id: makeId(),
    name,
    budget: 2500 + (index === 0 ? 500 : 0)
  })),
  expenses: [],
  orders: [
    {
      id: makeId(),
      place: "Mussoorie Cafe Stop",
      total: 0,
      createdAt: new Date().toISOString(),
      items: []
    }
  ],
  bills: []
});

let state = loadState();
let saveTimer;
let toastTimer;
let channel;

try {
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => {
    if (event.data?.type === "state-update") {
      state = event.data.state;
      render();
    }
  };
} catch (_) {
  channel = null;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return blankState();
    const parsed = JSON.parse(saved);
    if (!parsed.friends?.length) return blankState();
    return {
      ...blankState(),
      ...parsed,
      trip: { ...blankState().trip, ...(parsed.trip || {}) },
      friends: parsed.friends || [],
      expenses: parsed.expenses || [],
      orders: parsed.orders?.length ? parsed.orders : blankState().orders,
      bills: parsed.bills || []
    };
  } catch (error) {
    console.warn("Could not load saved trip data", error);
    return blankState();
  }
}

function persist({ silent = false } = {}) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      channel?.postMessage({ type: "state-update", state });
      if (!silent) showToast("Saved locally");
    } catch (error) {
      console.error(error);
      showToast("Storage full. Export backup or remove old bill photos.");
    }
  }, 120);
}

window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    state = JSON.parse(event.newValue);
    render();
  } catch (_) {}
});

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1900);
}

function formatMoney(value) {
  return money.format(Number(value || 0));
}

function friendById(id) {
  return state.friends.find((friend) => friend.id === id);
}

function getActiveOrder() {
  if (!state.orders.length) {
    state.orders.push({ id: makeId(), place: "New food stop", total: 0, createdAt: new Date().toISOString(), items: [] });
  }
  return state.orders[0];
}

function totals() {
  const totalBudget = state.friends.reduce((sum, friend) => sum + Number(friend.budget || 0), 0);
  const totalSpent = state.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const friendCount = state.friends.length;
  return {
    totalBudget,
    totalSpent,
    remaining: totalBudget - totalSpent,
    avg: friendCount ? totalSpent / friendCount : 0
  };
}

function calculateSettlements() {
  const balance = new Map(state.friends.map((friend) => [friend.id, 0]));

  state.expenses.forEach((expense) => {
    const amount = Number(expense.amount || 0);
    const splitWith = expense.splitWith?.length ? expense.splitWith : state.friends.map((friend) => friend.id);
    if (!amount || !expense.paidBy || !splitWith.length) return;
    balance.set(expense.paidBy, (balance.get(expense.paidBy) || 0) + amount);
    const share = amount / splitWith.length;
    splitWith.forEach((id) => balance.set(id, (balance.get(id) || 0) - share));
  });

  const debtors = [];
  const creditors = [];
  balance.forEach((value, id) => {
    const rounded = Math.round(value);
    if (rounded < 0) debtors.push({ id, amount: Math.abs(rounded) });
    if (rounded > 0) creditors.push({ id, amount: rounded });
  });

  const settlements = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const pay = Math.min(debtors[d].amount, creditors[c].amount);
    if (pay > 0) {
      settlements.push({ from: debtors[d].id, to: creditors[c].id, amount: pay });
    }
    debtors[d].amount -= pay;
    creditors[c].amount -= pay;
    if (debtors[d].amount <= 0) d += 1;
    if (creditors[c].amount <= 0) c += 1;
  }
  return settlements;
}

function render() {
  renderTripHeader();
  renderTabs();
  renderFriendOptions();
  renderDashboard();
  renderFriends();
  renderExpenses();
  renderOrders();
  renderBills();
}

function renderTripHeader() {
  $("#tripTitle").textContent = state.trip.title;
  $("#tripDestination").textContent = state.trip.destination;
}

function renderTabs() {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.activeTab));
  $$(".panel").forEach((panel) => panel.classList.remove("active"));
  $(`#${state.activeTab}Panel`)?.classList.add("active");
}

function renderFriendOptions() {
  const options = state.friends.map((friend) => `<option value="${friend.id}">${escapeHtml(friend.name)}</option>`).join("");
  ["#quickExpensePaidBy", "#expensePaidBy", "#orderFriend"].forEach((selector) => {
    const element = $(selector);
    const current = element.value;
    element.innerHTML = options;
    if (state.friends.some((friend) => friend.id === current)) element.value = current;
  });

  const split = $("#splitWithList");
  split.innerHTML = state.friends.map((friend) => `
    <label class="check-pill">
      <input type="checkbox" value="${friend.id}" checked />
      ${escapeHtml(friend.name)}
    </label>
  `).join("");
}

function renderDashboard() {
  const tripTotals = totals();
  $("#totalBudget").textContent = formatMoney(tripTotals.totalBudget);
  $("#totalSpent").textContent = formatMoney(tripTotals.totalSpent);
  $("#remainingBudget").textContent = formatMoney(tripTotals.remaining);
  $("#perPersonAvg").textContent = formatMoney(tripTotals.avg);
  $("#friendCountText").textContent = `${state.friends.length} friends`;
  $("#remainingHint").textContent = tripTotals.remaining >= 0 ? "Safe to spend" : "Over budget";

  const settlements = calculateSettlements();
  const list = $("#settlementList");
  list.innerHTML = settlements.map((item) => {
    const from = friendById(item.from)?.name || "Someone";
    const to = friendById(item.to)?.name || "Someone";
    return `
      <div class="list-item">
        <div class="item-top">
          <div>
            <div class="item-title">${escapeHtml(from)} → ${escapeHtml(to)}</div>
            <div class="item-meta">Final settlement</div>
          </div>
          <div class="money">${formatMoney(item.amount)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderFriends() {
  const list = $("#friendsList");
  list.innerHTML = state.friends.map((friend, index) => `
    <article class="friend-card" data-id="${friend.id}">
      <div class="friend-top">
        <div class="avatar">${escapeHtml(friend.name.charAt(0) || "F")}</div>
        <button class="icon-btn remove-friend" title="Remove friend" type="button">×</button>
      </div>
      <label>
        Name
        <input class="friend-name" value="${escapeAttr(friend.name)}" />
      </label>
      <label style="margin-top: 12px;">
        Budget
        <input class="friend-budget" type="number" min="0" step="1" value="${Number(friend.budget || 0)}" />
      </label>
      <p class="item-meta" style="margin-top: 12px;">Friend ${index + 1}</p>
    </article>
  `).join("");
}

function renderExpenses() {
  const list = $("#expensesList");
  list.innerHTML = state.expenses.slice().reverse().map((expense) => {
    const paidBy = friendById(expense.paidBy)?.name || "Unknown";
    const splitNames = (expense.splitWith || []).map((id) => friendById(id)?.name).filter(Boolean);
    const bill = expense.billId ? state.bills.find((item) => item.id === expense.billId) : null;
    return `
      <div class="list-item" data-id="${expense.id}">
        <div class="item-top">
          <div>
            <div class="item-title">${escapeHtml(expense.title)}</div>
            <div class="item-meta">Paid by ${escapeHtml(paidBy)} · Split ${splitNames.length ? `between ${escapeHtml(splitNames.join(", "))}` : "equally"}</div>
          </div>
          <div class="money">${formatMoney(expense.amount)}</div>
        </div>
        <div class="item-top">
          ${bill ? `<button class="receipt-link open-bill" data-bill="${bill.id}" type="button">📸 View bill</button>` : `<span class="item-meta">No bill attached</span>`}
          <button class="icon-btn remove-expense" title="Delete expense" type="button">×</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderOrders() {
  const order = getActiveOrder();
  $("#orderPlace").value = order.place || "";
  $("#orderTotal").value = order.total || "";
  $("#orderTitle").textContent = order.place || "Current order";

  const orderers = [...new Set(order.items.map((item) => item.friendId))];
  const split = Number(order.total || 0) && orderers.length ? Number(order.total) / orderers.length : 0;
  $("#orderSplitText").textContent = orderers.length
    ? `${orderers.length} people ordered${split ? ` · ${formatMoney(split)} each` : ""}`
    : "Add item names from friends.";

  const list = $("#orderItemsList");
  list.innerHTML = order.items.map((item) => {
    const friend = friendById(item.friendId)?.name || "Friend";
    return `
      <div class="list-item" data-id="${item.id}">
        <div class="item-top">
          <div>
            <div class="item-title">${escapeHtml(item.name)}</div>
            <div class="item-meta">${escapeHtml(friend)}</div>
          </div>
          <button class="icon-btn remove-order-item" title="Remove item" type="button">×</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderBills() {
  const list = $("#billsList");
  list.innerHTML = state.bills.slice().reverse().map((bill) => `
    <article class="bill-card" data-id="${bill.id}">
      <img src="${bill.image}" alt="${escapeAttr(bill.title)}" loading="lazy" />
      <div class="bill-body">
        <strong>${escapeHtml(bill.title)}</strong>
        <div class="item-meta">${bill.amount ? formatMoney(bill.amount) : "Amount not added"}</div>
        <div class="bill-actions">
          <button class="secondary-btn small view-bill" type="button">View</button>
          <button class="danger-btn small remove-bill" type="button">Delete</button>
        </div>
      </div>
    </article>
  `).join("");
}

async function addExpenseFromForm({ titleInput, amountInput, paidByInput, fileInput, splitIds }) {
  const title = titleInput.value.trim();
  const amount = Number(amountInput.value);
  const paidBy = paidByInput.value;
  if (!title || !amount || !paidBy) return;

  let billId = "";
  const file = fileInput?.files?.[0];
  if (file) {
    const image = await compressImage(file);
    const bill = {
      id: makeId(),
      title: `${title} bill`,
      amount,
      image,
      createdAt: new Date().toISOString()
    };
    state.bills.push(bill);
    billId = bill.id;
    fileInput.value = "";
  }

  state.expenses.push({
    id: makeId(),
    title,
    amount,
    paidBy,
    splitWith: splitIds?.length ? splitIds : state.friends.map((friend) => friend.id),
    billId,
    createdAt: new Date().toISOString()
  });
  titleInput.value = "";
  amountInput.value = "";
  persist();
  render();
}

async function compressImage(file) {
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxSize = 1400;
  const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * ratio);
  canvas.height = Math.round(image.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.74);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function openBill(id) {
  const bill = state.bills.find((item) => item.id === id);
  if (!bill) return;
  const win = window.open("", "_blank");
  if (!win) {
    showToast("Popup blocked. Allow popups to view bill.");
    return;
  }
  win.document.write(`
    <!DOCTYPE html>
    <html><head><title>${escapeHtml(bill.title)}</title><meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>body{margin:0;font-family:system-ui;background:#111;color:#fff;display:grid;gap:14px;place-items:center;min-height:100vh;padding:18px}img{max-width:min(100%,900px);max-height:82vh;border-radius:18px;background:#222}h1{font-size:20px;margin:0}.meta{opacity:.75}</style>
    </head><body><h1>${escapeHtml(bill.title)}</h1><div class="meta">${bill.amount ? formatMoney(bill.amount) : "Bill photo"}</div><img src="${bill.image}" alt="${escapeAttr(bill.title)}" /></body></html>
  `);
  win.document.close();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "mussoorie-trip-backup.json";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Backup exported");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function bindEvents() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeTab = tab.dataset.tab;
      persist({ silent: true });
      renderTabs();
    });
  });

  $("#tripTitle").addEventListener("blur", (event) => {
    state.trip.title = event.target.textContent.trim() || "Mussoorie Boys Trip";
    persist();
  });

  $("#tripDestination").addEventListener("blur", (event) => {
    state.trip.destination = event.target.textContent.trim() || "Mussoorie, Uttarakhand";
    persist();
  });

  $("#exportBtn").addEventListener("click", exportData);

  $("#addFriendBtn").addEventListener("click", () => {
    state.friends.push({ id: makeId(), name: `Friend ${state.friends.length + 1}`, budget: 2500 });
    persist();
    render();
  });

  $("#friendsList").addEventListener("input", (event) => {
    const card = event.target.closest(".friend-card");
    if (!card) return;
    const friend = friendById(card.dataset.id);
    if (!friend) return;
    if (event.target.classList.contains("friend-name")) friend.name = event.target.value;
    if (event.target.classList.contains("friend-budget")) friend.budget = Number(event.target.value || 0);
    persist({ silent: true });
    renderFriendOptions();
    renderDashboard();
  });

  $("#friendsList").addEventListener("click", (event) => {
    if (!event.target.classList.contains("remove-friend")) return;
    const card = event.target.closest(".friend-card");
    if (state.friends.length <= 1) {
      showToast("Keep at least one friend");
      return;
    }
    const id = card.dataset.id;
    state.friends = state.friends.filter((friend) => friend.id !== id);
    state.expenses = state.expenses.map((expense) => ({
      ...expense,
      splitWith: (expense.splitWith || []).filter((friendId) => friendId !== id)
    })).filter((expense) => expense.paidBy !== id);
    state.orders.forEach((order) => {
      order.items = order.items.filter((item) => item.friendId !== id);
    });
    persist();
    render();
  });

  $("#quickExpenseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await addExpenseFromForm({
      titleInput: $("#quickExpenseTitle"),
      amountInput: $("#quickExpenseAmount"),
      paidByInput: $("#quickExpensePaidBy"),
      fileInput: $("#quickExpenseBill"),
      splitIds: state.friends.map((friend) => friend.id)
    });
  });

  $("#expenseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const splitIds = $$("#splitWithList input:checked").map((input) => input.value);
    await addExpenseFromForm({
      titleInput: $("#expenseTitle"),
      amountInput: $("#expenseAmount"),
      paidByInput: $("#expensePaidBy"),
      fileInput: $("#expenseBill"),
      splitIds
    });
  });

  $("#clearExpensesBtn").addEventListener("click", () => {
    if (!state.expenses.length) return;
    if (!confirm("Clear all expenses?")) return;
    state.expenses = [];
    persist();
    render();
  });

  $("#expensesList").addEventListener("click", (event) => {
    const row = event.target.closest(".list-item");
    if (!row) return;
    if (event.target.classList.contains("remove-expense")) {
      state.expenses = state.expenses.filter((expense) => expense.id !== row.dataset.id);
      persist();
      render();
    }
    if (event.target.classList.contains("open-bill")) {
      openBill(event.target.dataset.bill);
    }
  });

  $("#newOrderBtn").addEventListener("click", () => {
    state.orders.unshift({ id: makeId(), place: "New food stop", total: 0, createdAt: new Date().toISOString(), items: [] });
    persist();
    render();
    showToast("New order started");
  });

  $("#orderPlace").addEventListener("input", (event) => {
    getActiveOrder().place = event.target.value;
    persist({ silent: true });
    $("#orderTitle").textContent = event.target.value || "Current order";
  });

  $("#addOrderItemBtn").addEventListener("click", () => {
    const name = $("#orderItem").value.trim();
    const friendId = $("#orderFriend").value;
    if (!name || !friendId) return;
    getActiveOrder().items.push({ id: makeId(), friendId, name, createdAt: new Date().toISOString() });
    $("#orderItem").value = "";
    persist();
    renderOrders();
  });

  $("#saveOrderTotalBtn").addEventListener("click", () => {
    getActiveOrder().total = Number($("#orderTotal").value || 0);
    persist();
    renderOrders();
  });

  $("#orderItemsList").addEventListener("click", (event) => {
    if (!event.target.classList.contains("remove-order-item")) return;
    const id = event.target.closest(".list-item").dataset.id;
    const order = getActiveOrder();
    order.items = order.items.filter((item) => item.id !== id);
    persist();
    renderOrders();
  });

  $("#billForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = $("#billPhoto").files?.[0];
    const title = $("#billTitle").value.trim();
    if (!file || !title) return;
    try {
      const image = await compressImage(file);
      state.bills.push({
        id: makeId(),
        title,
        amount: Number($("#billAmount").value || 0),
        image,
        createdAt: new Date().toISOString()
      });
      event.target.reset();
      persist();
      renderBills();
      showToast("Bill saved");
    } catch (error) {
      console.error(error);
      showToast("Could not save this image");
    }
  });

  $("#billsList").addEventListener("click", (event) => {
    const card = event.target.closest(".bill-card");
    if (!card) return;
    if (event.target.classList.contains("view-bill")) openBill(card.dataset.id);
    if (event.target.classList.contains("remove-bill")) {
      state.bills = state.bills.filter((bill) => bill.id !== card.dataset.id);
      state.expenses = state.expenses.map((expense) => expense.billId === card.dataset.id ? { ...expense, billId: "" } : expense);
      persist();
      render();
    }
  });

  $("#clearBillsBtn").addEventListener("click", () => {
    if (!state.bills.length) return;
    if (!confirm("Clear all saved bill photos?")) return;
    state.bills = [];
    state.expenses = state.expenses.map((expense) => ({ ...expense, billId: "" }));
    persist();
    render();
  });
}

bindEvents();
render();
persist({ silent: true });
