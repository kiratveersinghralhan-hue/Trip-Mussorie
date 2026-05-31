import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA0TPLn-m5aj6pwid9-z9OpNzyoihTx-sk",
  authDomain: "mussorie-trip.firebaseapp.com",
  projectId: "mussorie-trip",
  messagingSenderId: "1081829884180",
  appId: "1:1081829884180:web:0d65738cf59dc8e6d98201",
  measurementId: "G-J9NF5DH31T"
};

const APP_VERSION = "premium-firestore-nophotos-v3-keyboardfix";
const DEFAULT_TRIP_CODE = "mussorie-boys-trip";
const LOCAL_TRIP_KEY = "mussoorie.trip.code.premium";
const LOCAL_CACHE_KEY = "mussoorie.trip.cache.premium";
const LOCAL_SECTION_KEY = "mussoorie.trip.section.premium";
const DEFAULT_FRIENDS = ["Aarav", "Kabir", "Vivaan", "Reyansh", "Arjun", "Dhruv", "Ishaan"];

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const deviceId = getDeviceId();

let app;
let db;
let tripRef;
let unsubscribeTrip;
let saveTimer;
let toastTimer;
let isApplyingRemote = false;
let isRemoteReady = false;
let activeSection = localStorage.getItem(LOCAL_SECTION_KEY) || "overview";
if (!["overview", "friends", "expenses", "orders", "settings"].includes(activeSection)) activeSection = "overview";
let tripCode = getInitialTripCode();
let state = loadCache() || createDefaultState();

function createDefaultState() {
  const now = new Date().toISOString();
  return {
    trip: {
      title: "Mussoorie Boys Trip",
      destination: "Mussoorie, Uttarakhand"
    },
    friends: DEFAULT_FRIENDS.map((name, index) => ({
      id: makeId(),
      name,
      budget: index === 0 ? 3500 : 3000
    })),
    expenses: [],
    orders: {
      active: {
        id: makeId(),
        place: "Mall Road food stop",
        total: 0,
        items: [],
        createdAt: now
      }
    },
    meta: {
      version: APP_VERSION,
      updatedAt: now,
      updatedBy: deviceId
    }
  };
}

function normalizeState(raw) {
  const base = createDefaultState();
  const value = raw && typeof raw === "object" ? raw : {};
  const activeOrder = value.orders?.active || value.activeOrder || {};
  return {
    trip: {
      ...base.trip,
      ...(value.trip || {})
    },
    friends: normalizeFriends(value.friends, base.friends),
    expenses: Array.isArray(value.expenses) ? value.expenses.map(normalizeExpense) : [],
    orders: {
      active: {
        ...base.orders.active,
        ...activeOrder,
        total: Number(activeOrder.total || 0),
        items: Array.isArray(activeOrder.items) ? activeOrder.items.map(normalizeOrderItem) : []
      }
    },
    meta: {
      ...base.meta,
      ...(value.meta || {})
    }
  };
}

function normalizeFriends(friends, fallback) {
  const list = Array.isArray(friends) && friends.length ? friends : fallback;
  return list.map((friend, index) => ({
    id: friend.id || makeId(),
    name: String(friend.name || `Friend ${index + 1}`).trim() || `Friend ${index + 1}`,
    budget: Number(friend.budget || 0)
  }));
}

function normalizeExpense(expense) {
  return {
    id: expense.id || makeId(),
    title: String(expense.title || "Expense"),
    amount: Number(expense.amount || 0),
    paidBy: expense.paidBy || "",
    note: expense.note || "",
    createdAt: expense.createdAt || new Date().toISOString()
  };
}

function normalizeOrderItem(item) {
  return {
    id: item.id || makeId(),
    friendId: item.friendId || "",
    itemName: String(item.itemName || item.name || "Item"),
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function getInitialTripCode() {
  const params = new URLSearchParams(location.search);
  return sanitizeTripCode(params.get("trip") || localStorage.getItem(LOCAL_TRIP_KEY) || DEFAULT_TRIP_CODE);
}

function sanitizeTripCode(value) {
  return String(value || DEFAULT_TRIP_CODE)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54) || DEFAULT_TRIP_CODE;
}

function getDeviceId() {
  const key = "mussoorie.trip.device.id";
  let value = localStorage.getItem(key);
  if (!value) {
    value = makeId();
    localStorage.setItem(key, value);
  }
  return value;
}

function loadCache() {
  try {
    const cached = localStorage.getItem(LOCAL_CACHE_KEY);
    return cached ? normalizeState(JSON.parse(cached)) : null;
  } catch (error) {
    console.warn("Cache load failed", error);
    return null;
  }
}

function saveCache() {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Cache save failed", error);
  }
}

function updateUrl() {
  localStorage.setItem(LOCAL_TRIP_KEY, tripCode);
  const url = new URL(location.href);
  url.searchParams.set("trip", tripCode);
  history.replaceState({}, "", url);
  $("#tripCodeInput").value = tripCode;
  $("#shareLinkInput").value = url.href;
  $("#roomNameText").textContent = `Room: ${tripCode}`;
}

function initFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    connectTrip(tripCode);
  } catch (error) {
    console.error(error);
    setSyncStatus("Firebase error", "error");
    toast("Firebase config error. Check console.");
  }
}

async function connectTrip(code) {
  tripCode = sanitizeTripCode(code);
  updateUrl();
  unsubscribeTrip?.();
  isRemoteReady = false;
  setSyncStatus("Connecting…", "syncing");

  tripRef = doc(db, "trips", tripCode);

  try {
    const snapshot = await getDoc(tripRef);
    if (!snapshot.exists()) {
      await writeRemote(true);
    }
  } catch (error) {
    console.warn("Initial read/write failed", error);
    setSyncStatus("Check Firestore rules", "error");
    toast("Firestore is blocked. Enable Firestore and add rules from README.");
  }

  unsubscribeTrip = onSnapshot(tripRef, (snapshot) => {
    isApplyingRemote = true;
    if (snapshot.exists()) {
      state = normalizeState(snapshot.data());
      saveCache();
      setSyncStatus("Live synced", "live");
      isRemoteReady = true;
      render();
    }
    isApplyingRemote = false;
  }, (error) => {
    console.error(error);
    setSyncStatus("Sync blocked", "error");
    toast("Realtime sync blocked. Check Firestore rules.");
  });
}

async function writeRemote(force = false) {
  state.meta = {
    ...state.meta,
    version: APP_VERSION,
    updatedAt: new Date().toISOString(),
    updatedBy: deviceId
  };
  saveCache();

  if (!tripRef) return;
  if (!force && isApplyingRemote) return;

  try {
    await setDoc(tripRef, state, { merge: false });
    setSyncStatus("Live synced", "live");
  } catch (error) {
    console.error(error);
    setSyncStatus("Sync blocked", "error");
    toast("Could not save online. Check Firebase rules.");
  }
}

function queueSave(options = {}) {
  const shouldRender = options.render !== false;
  if (shouldRender) render();
  saveCache();
  if (isApplyingRemote) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeRemote(), options.delay ?? 420);
}

function setSyncStatus(text, mode) {
  const pill = $("#syncStatus");
  if (!pill) return;
  pill.textContent = text;
  pill.className = `sync-pill ${mode || "syncing"}`;
}

function render() {
  renderStaticFields();
  renderSections();
  renderMetrics();
  renderSelects();
  renderFriends();
  renderExpenses();
  renderOrders();
  renderShareLink();
}

function renderStaticFields() {
  if (document.activeElement !== $("#tripTitle")) $("#tripTitle").textContent = state.trip.title || "Mussoorie Boys Trip";
  if (document.activeElement !== $("#tripDestination")) $("#tripDestination").textContent = state.trip.destination || "Mussoorie, Uttarakhand";
  if (document.activeElement !== $("#orderPlace")) $("#orderPlace").value = state.orders.active.place || "";
  if (document.activeElement !== $("#orderTotal")) $("#orderTotal").value = state.orders.active.total || "";
  updateUrl();
}

function renderSections() {
  $$(".section").forEach((section) => {
    section.classList.toggle("active", section.dataset.section === activeSection);
  });
  $$(".bottom-nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === activeSection);
  });
  localStorage.setItem(LOCAL_SECTION_KEY, activeSection);
}

function renderMetrics() {
  const totalBudget = sum(state.friends.map((friend) => friend.budget));
  const totalSpent = sum(state.expenses.map((expense) => expense.amount));
  const balance = totalBudget - totalSpent;
  const itemCount = state.orders.active.items.length;
  const peopleCount = uniqueOrderPeople().length;

  $("#totalBudget").textContent = money.format(totalBudget);
  $("#totalSpent").textContent = money.format(totalSpent);
  $("#balanceAmount").textContent = money.format(balance);
  $("#friendCountText").textContent = `${state.friends.length} friends`;
  $("#expenseCountText").textContent = `${state.expenses.length} expenses`;
  $("#balanceHint").textContent = balance >= 0 ? "Still in budget" : "Over budget";
  $("#orderPeopleCount").textContent = String(peopleCount);
  $("#orderItemsCount").textContent = String(itemCount);
  $("#latestUpdateText").textContent = relativeTime(state.meta.updatedAt);
}

function renderSelects() {
  const options = state.friends.map((friend) => `<option value="${escapeHtml(friend.id)}">${escapeHtml(friend.name)}</option>`).join("");

  ["#quickExpensePaidBy", "#expensePaidBy", "#orderFriend"].forEach((selector) => {
    const select = $(selector);
    const current = select.value;
    select.innerHTML = options;
    if (state.friends.some((friend) => friend.id === current)) select.value = current;
  });
}

function renderFriends() {
  const container = $("#friendsList");
  const active = document.activeElement;
  const editingFriend = active && container.contains(active) && active.matches(".friend-name, .friend-budget");
  if (editingFriend) return;

  container.innerHTML = state.friends.map((friend, index) => `
    <article class="friend-card" data-id="${escapeHtml(friend.id)}">
      <div class="avatar-row">
        <span class="avatar">${escapeHtml(initials(friend.name))}</span>
        <div>
          <label>
            <span>Name</span>
            <input class="friend-name" value="${escapeAttr(friend.name)}" aria-label="Friend name ${index + 1}" autocomplete="off" />
          </label>
        </div>
      </div>
      <label>
        <span>Budget</span>
        <input class="friend-budget" type="number" min="0" step="1" value="${Number(friend.budget || 0)}" aria-label="Budget for ${escapeAttr(friend.name)}" inputmode="numeric" />
      </label>
      <div class="friend-actions">
        <button class="tiny-btn delete remove-friend" type="button">Remove</button>
      </div>
    </article>
  `).join("");

  container.querySelectorAll(".friend-card").forEach((card) => {
    const friend = state.friends.find((item) => item.id === card.dataset.id);
    const nameInput = card.querySelector(".friend-name");
    const budgetInput = card.querySelector(".friend-budget");

    nameInput.addEventListener("input", (event) => {
      friend.name = event.target.value || "Friend";
      card.querySelector(".avatar").textContent = initials(friend.name);
      queueSave({ render: false, delay: 700 });
    });
    nameInput.addEventListener("blur", () => {
      friend.name = nameInput.value.trim() || "Friend";
      queueSave({ delay: 120 });
    });

    budgetInput.addEventListener("input", (event) => {
      friend.budget = Number(event.target.value || 0);
      renderMetrics();
      queueSave({ render: false, delay: 700 });
    });
    budgetInput.addEventListener("blur", () => {
      friend.budget = Number(budgetInput.value || 0);
      queueSave({ delay: 120 });
    });

    card.querySelector(".remove-friend").addEventListener("click", () => removeFriend(friend.id));
  });
}

function renderExpenses() {
  const list = $("#expensesList");
  $("#expenseCountPill").textContent = String(state.expenses.length);
  if (!state.expenses.length) {
    list.innerHTML = `<div class="empty-state">No expenses yet.<br>Add petrol, hotel, snacks or tickets.</div>`;
    return;
  }

  list.innerHTML = state.expenses.slice().sort(byNewest).map((expense) => {
    const paidBy = friendName(expense.paidBy) || "Not selected";
    return `
      <article class="item-card">
        <div class="item-top">
          <div>
            <strong>${escapeHtml(expense.title)}</strong>
            <div class="item-meta">${escapeHtml(paidBy)} • ${formatDate(expense.createdAt)}</div>
            ${expense.note ? `<div class="item-meta">${escapeHtml(expense.note)}</div>` : ""}
          </div>
          <span class="amount">${money.format(expense.amount)}</span>
        </div>
        <div class="item-actions">
          <button class="tiny-btn delete" data-delete-expense="${escapeAttr(expense.id)}" type="button">Delete</button>
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-delete-expense]").forEach((button) => {
    button.addEventListener("click", () => {
      state.expenses = state.expenses.filter((expense) => expense.id !== button.dataset.deleteExpense);
      queueSave();
    });
  });
}

function renderOrders() {
  const order = state.orders.active;
  const list = $("#orderItemsList");
  const items = order.items || [];
  const people = uniqueOrderPeople();
  const split = people.length ? Number(order.total || 0) / people.length : 0;

  $("#orderCountPill").textContent = String(items.length);
  $("#orderSplitAmount").textContent = money.format(split);
  $("#orderSplitHint").textContent = people.length ? `${people.length} people in this order` : "Add orders first";

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">No food items yet.<br>Friends can add Maggi, momos, drinks, anything.</div>`;
    return;
  }

  list.innerHTML = items.slice().sort(byOldest).map((item) => `
    <article class="item-card">
      <div class="item-top">
        <div>
          <strong>${escapeHtml(item.itemName)}</strong>
          <div class="item-meta">${escapeHtml(friendName(item.friendId) || "Friend")} • ${formatDate(item.createdAt)}</div>
        </div>
        <button class="tiny-btn delete" data-delete-order-item="${escapeAttr(item.id)}" type="button">Delete</button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-delete-order-item]").forEach((button) => {
    button.addEventListener("click", () => {
      state.orders.active.items = state.orders.active.items.filter((item) => item.id !== button.dataset.deleteOrderItem);
      queueSave();
    });
  });
}

function renderShareLink() {
  const url = new URL(location.href);
  url.searchParams.set("trip", tripCode);
  $("#shareLinkInput").value = url.href;
}

function bindEvents() {
  $$(".bottom-nav button").forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.nav));
  });

  $("#heroExpenseBtn").addEventListener("click", () => {
    showSection("overview");
    $("#quickExpenseTitle").focus();
  });

  $("#tripTitle").addEventListener("input", (event) => {
    state.trip.title = event.target.textContent.trim() || "Mussoorie Boys Trip";
    queueSave();
  });
  $("#tripDestination").addEventListener("input", (event) => {
    state.trip.destination = event.target.textContent.trim() || "Mussoorie, Uttarakhand";
    queueSave();
  });

  $("#joinTripBtn").addEventListener("click", () => connectTrip($("#tripCodeInput").value));
  $("#tripCodeInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") connectTrip(event.target.value);
  });
  ["#copyLinkBtn", "#copyLinkBtn2"].forEach((selector) => {
    $(selector).addEventListener("click", copyFriendLink);
  });

  $("#addFriendBtn").addEventListener("click", () => {
    state.friends.push({ id: makeId(), name: `Friend ${state.friends.length + 1}`, budget: 3000 });
    queueSave();
    toast("Friend added");
  });

  $("#quickExpenseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await addExpenseFromForm({
      title: $("#quickExpenseTitle").value,
      amount: $("#quickExpenseAmount").value,
      paidBy: $("#quickExpensePaidBy").value,
      note: ""
    });
    event.target.reset();
    renderSelects();
  });

  $("#expenseForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await addExpenseFromForm({
      title: $("#expenseTitle").value,
      amount: $("#expenseAmount").value,
      paidBy: $("#expensePaidBy").value,
      note: $("#expenseNote").value
    });
    event.target.reset();
    renderSelects();
  });

  $("#clearExpensesBtn").addEventListener("click", () => {
    if (!state.expenses.length) return;
    if (confirm("Clear all expenses from this trip?")) {
      state.expenses = [];
      queueSave();
      toast("Expenses cleared");
    }
  });

  $("#orderPlace").addEventListener("input", (event) => {
    state.orders.active.place = event.target.value;
    queueSave();
  });
  $("#orderTotal").addEventListener("input", (event) => {
    state.orders.active.total = Number(event.target.value || 0);
    queueSave();
  });
  $("#orderItemForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.orders.active.items.push({
      id: makeId(),
      friendId: $("#orderFriend").value,
      itemName: $("#orderItemName").value.trim(),
      createdAt: new Date().toISOString()
    });
    $("#orderItemName").value = "";
    queueSave();
    toast("Order item added");
  });
  $("#newOrderBtn").addEventListener("click", () => {
    if (state.orders.active.items.length && !confirm("Start a new food stop and clear current order items?")) return;
    state.orders.active = {
      id: makeId(),
      place: "New food stop",
      total: 0,
      items: [],
      createdAt: new Date().toISOString()
    };
    queueSave();
    toast("New food stop ready");
  });


  $("#exportBtn").addEventListener("click", exportBackup);
  $("#resetTripBtn").addEventListener("click", () => {
    if (confirm("Reset this trip room for everyone using this code?")) {
      state = createDefaultState();
      queueSave();
      toast("Trip reset");
    }
  });
}

function showSection(section) {
  if (!["overview", "friends", "expenses", "orders", "settings"].includes(section)) section = "overview";
  activeSection = section;
  renderSections();
  const target = $(`#${section}Section`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function addExpenseFromForm({ title, amount, paidBy, note }) {
  const trimmedTitle = String(title || "").trim();
  const numericAmount = Number(amount || 0);
  if (!trimmedTitle || numericAmount <= 0) return toast("Add expense title and amount");

  const expense = {
    id: makeId(),
    title: trimmedTitle,
    amount: numericAmount,
    paidBy,
    note: String(note || "").trim(),
    createdAt: new Date().toISOString()
  };

  state.expenses.push(expense);
  queueSave();
  toast("Expense saved");
}

function removeFriend(id) {
  if (state.friends.length <= 1) return toast("Keep at least one friend");
  state.friends = state.friends.filter((friend) => friend.id !== id);
  state.expenses = state.expenses.map((expense) => expense.paidBy === id ? { ...expense, paidBy: "" } : expense);
  state.orders.active.items = state.orders.active.items.filter((item) => item.friendId !== id);
  queueSave();
  toast("Friend removed");
}

function uniqueOrderPeople() {
  return [...new Set((state.orders.active.items || []).map((item) => item.friendId).filter(Boolean))];
}

function friendName(id) {
  return state.friends.find((friend) => friend.id === id)?.name || "";
}

function sum(numbers) {
  return numbers.reduce((total, value) => total + Number(value || 0), 0);
}

function byNewest(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function byOldest(a, b) {
  return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
}

function initials(name) {
  return String(name || "F")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "F";
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch (_) {
    return "Now";
  }
}

function relativeTime(value) {
  if (!value) return "Now";
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff) || diff < 45000) return "Now";
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

async function copyFriendLink() {
  const url = new URL(location.href);
  url.searchParams.set("trip", tripCode);
  try {
    await navigator.clipboard.writeText(url.href);
    toast("Friend link copied");
  } catch (_) {
    $("#shareLinkInput").select();
    document.execCommand("copy");
    toast("Friend link copied");
  }
}

function exportBackup() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${tripCode}-backup.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast("Backup downloaded");
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2600);
}

function boot() {
  bindEvents();
  render();
  initFirebase();
  setInterval(() => renderMetrics(), 60000);
}

boot();
