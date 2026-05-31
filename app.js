import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA0TPLn-m5aj6pwid9-z9OpNzyoihTx-sk",
  authDomain: "mussorie-trip.firebaseapp.com",
  projectId: "mussorie-trip",
  storageBucket: "mussorie-trip.firebasestorage.app",
  messagingSenderId: "1081829884180",
  appId: "1:1081829884180:web:0d65738cf59dc8e6d98201",
  measurementId: "G-J9NF5DH31T"
};

const DEFAULT_TRIP_CODE = "mussorie-boys-trip";

const defaultFriends = [
  { id: uid(), name: "Kabir", budget: 0 },
  { id: uid(), name: "Arjun", budget: 0 },
  { id: uid(), name: "Rohan", budget: 0 },
  { id: uid(), name: "Aryan", budget: 0 },
  { id: uid(), name: "Vansh", budget: 0 },
  { id: uid(), name: "Dev", budget: 0 },
  { id: uid(), name: "Aman", budget: 0 }
];

let app;
let db;
let tripRef;
let unsubscribe = null;
let currentTripCode = "";
let activeTab = "home";
let isAdmin = false;

let state = {
  adminPin: "",
  friends: [],
  expenses: [],
  orders: [],
  orderTotal: 0
};

let friendsDraft = null;
let friendsDirty = false;
let remoteWaiting = false;
let editingExpenseId = "";
let editingOrderId = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const syncStatus = $("#syncStatus");
const tripCodeInput = $("#tripCodeInput");

init();

async function init() {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  const code = getTripCodeFromUrl() || localStorage.getItem("mussoorieTripCode") || DEFAULT_TRIP_CODE;
  tripCodeInput.value = code;
  bindStaticEvents();
  await joinTrip(code);
}

function bindStaticEvents() {
  $("#joinTripBtn").addEventListener("click", () => {
    const code = cleanTripCode(tripCodeInput.value);
    if (!code) return toast("Enter a trip code.");
    joinTrip(code);
  });

  $("#copyLinkBtn").addEventListener("click", async () => {
    const code = cleanTripCode(tripCodeInput.value) || DEFAULT_TRIP_CODE;
    const url = new URL(window.location.href);
    url.searchParams.set("trip", code);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast("Friend link copied.");
    } catch {
      prompt("Copy this link:", url.toString());
    }
  });

  $("#adminUnlockBtn").addEventListener("click", handleAdminUnlock);
  $("#adminLockBtn").addEventListener("click", lockAdmin);
  $("#adminPinInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleAdminUnlock();
  });

  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  $$("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.go));
  });

  $("#addFriendBtn").addEventListener("click", addDraftFriend);
  $("#saveFriendsBtn").addEventListener("click", saveFriends);

  $("#expenseForm").addEventListener("submit", saveExpenseFromForm);
  $("#cancelExpenseEditBtn").addEventListener("click", resetExpenseForm);

  $("#orderForm").addEventListener("submit", saveOrderFromForm);
  $("#cancelOrderEditBtn").addEventListener("click", resetOrderForm);
  $("#saveOrderTotalBtn").addEventListener("click", saveOrderTotal);
  $("#clearOrderBtn").addEventListener("click", clearOrders);
  $("#exportDataBtn").addEventListener("click", exportTripData);
  $("#importDataInput").addEventListener("change", importTripData);
}

async function joinTrip(rawCode) {
  const code = cleanTripCode(rawCode);
  if (!code) return;

  if (unsubscribe) unsubscribe();

  currentTripCode = code;
  localStorage.setItem("mussoorieTripCode", code);
  tripCodeInput.value = code;
  isAdmin = false;
  friendsDraft = null;
  friendsDirty = false;
  editingExpenseId = "";
  editingOrderId = "";
  resetExpenseForm(false);
  resetOrderForm(false);

  const url = new URL(window.location.href);
  url.searchParams.set("trip", code);
  history.replaceState(null, "", url.toString());

  setStatus("Connecting…");
  tripRef = doc(db, "trips", code);

  const snap = await getDoc(tripRef);
  if (!snap.exists()) {
    await setDoc(tripRef, {
      adminPin: "",
      friends: defaultFriends,
      expenses: [],
      orders: [],
      orderTotal: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  unsubscribe = onSnapshot(
    tripRef,
    (snapshot) => {
      const data = snapshot.data() || {};
      state = normalizeState(data);
      syncAdminFromLocal();
      setStatus("Live");
      renderAll();
    },
    (error) => {
      console.error(error);
      setStatus("Check rules");
      toast("Firebase rules need to allow read/write.");
    }
  );
}

function normalizeState(data) {
  return {
    adminPin: String(data.adminPin || ""),
    friends: Array.isArray(data.friends) ? data.friends : [],
    expenses: Array.isArray(data.expenses) ? data.expenses : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    orderTotal: Number(data.orderTotal || 0)
  };
}

function renderAll() {
  renderAdminUI();
  renderOverview();

  if (!(activeTab === "friends" && friendsDirty && isAdmin)) {
    renderFriendEditor();
  } else {
    renderEverythingExceptFriendEditor();
    showFriendNote("Editing locally. Tap Save changes when done.");
  }

  if (!isActiveInside("#expenseForm")) renderExpenseForm();
  renderExpenseList();

  if (!isActiveInside("#orderForm")) renderOrderForm();
  renderOrderList();
}

function renderEverythingExceptFriendEditor() {
  renderOverview();
  renderExpenseList();
  renderOrderList();
}

function renderAdminUI() {
  document.body.classList.toggle("admin-mode", isAdmin);

  const title = $("#adminStateTitle");
  const text = $("#adminStateText");
  const input = $("#adminPinInput");
  const unlockBtn = $("#adminUnlockBtn");
  const lockBtn = $("#adminLockBtn");

  if (!state.adminPin) {
    title.textContent = "Set admin PIN";
    text.textContent = "First admin should set a PIN before sharing the link.";
    input.classList.remove("hidden");
    unlockBtn.classList.remove("hidden");
    lockBtn.classList.add("hidden");
    unlockBtn.textContent = "Set PIN";
    input.placeholder = "Create PIN";
    return;
  }

  if (isAdmin) {
    title.textContent = "Admin mode active";
    text.textContent = "You can edit friends, budgets, expenses, and orders.";
    input.classList.add("hidden");
    unlockBtn.classList.add("hidden");
    lockBtn.classList.remove("hidden");
  } else {
    title.textContent = "Viewer mode";
    text.textContent = "Friends can view live updates. Only admin can change data.";
    input.classList.remove("hidden");
    unlockBtn.classList.remove("hidden");
    lockBtn.classList.add("hidden");
    unlockBtn.textContent = "Unlock";
    input.placeholder = "Admin PIN";
  }
}

async function handleAdminUnlock() {
  const input = $("#adminPinInput");
  const pin = String(input.value || "").trim();

  if (pin.length < 4) return toast("PIN should be at least 4 digits.");

  if (!state.adminPin) {
    await updateTrip({ adminPin: pin }, { allowWithoutAdmin: true });
    localStorage.setItem(adminStorageKey(), pin);
    isAdmin = true;
    input.value = "";
    toast("Admin PIN set.");
    renderAll();
    return;
  }

  if (pin === state.adminPin) {
    localStorage.setItem(adminStorageKey(), pin);
    isAdmin = true;
    input.value = "";
    toast("Admin unlocked.");
    renderAll();
  } else {
    toast("Wrong admin PIN.");
  }
}

function lockAdmin() {
  localStorage.removeItem(adminStorageKey());
  isAdmin = false;
  friendsDraft = null;
  friendsDirty = false;
  editingExpenseId = "";
  editingOrderId = "";
  resetExpenseForm(false);
  resetOrderForm(false);
  toast("Admin locked.");
  renderAll();
}

function syncAdminFromLocal() {
  const savedPin = localStorage.getItem(adminStorageKey());
  isAdmin = Boolean(state.adminPin && savedPin === state.adminPin);
}

function renderOverview() {
  const totalBudget = state.friends.reduce((sum, f) => sum + toNumber(f.budget), 0);
  const totalSpent = state.expenses.reduce((sum, e) => sum + toNumber(e.amount), 0);
  const remaining = totalBudget - totalSpent;

  $("#totalBudget").textContent = money(totalBudget);
  $("#totalSpent").textContent = money(totalSpent);
  $("#remainingBudget").textContent = money(remaining);
  $("#friendCount").textContent = state.friends.length;

  const chips = $("#friendChips");
  chips.innerHTML = "";
  if (!state.friends.length) {
    chips.innerHTML = `<div class="empty">No friends yet. Admin can add the squad.</div>`;
  } else {
    state.friends.forEach((friend) => {
      const chip = document.createElement("div");
      chip.className = "friend-chip";
      chip.innerHTML = `<span>${initial(friend.name)}</span>${escapeHtml(friend.name || "Friend")}`;
      chips.appendChild(chip);
    });
  }

  const recent = [...state.expenses]
    .slice(-4)
    .reverse()
    .map((e) => ({
      title: e.title,
      meta: `Paid by ${friendName(e.paidBy)}`,
      amount: money(e.amount)
    }));

  const activity = $("#recentActivity");
  activity.innerHTML = "";
  if (!recent.length) {
    activity.innerHTML = `<div class="empty">No expenses yet.</div>`;
  } else {
    recent.forEach((item) => {
      const row = document.createElement("div");
      row.className = "activity-item";
      row.innerHTML = `
        <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.meta)}</span></div>
        <div class="amount">${item.amount}</div>
      `;
      activity.appendChild(row);
    });
  }
}

function renderFriendEditor() {
  if (activeTab !== "friends") return;

  if (!isAdmin) {
    hideFriendNote();
    friendsDraft = null;
    friendsDirty = false;
    renderFriendsReadOnly();
    return;
  }

  if (!friendsDraft || !friendsDirty) {
    friendsDraft = cloneFriends(state.friends);
  }

  const editor = $("#friendsEditor");
  editor.innerHTML = "";

  if (!friendsDraft.length) {
    editor.innerHTML = `<div class="empty">No friends. Tap + Friend.</div>`;
    updateFriendSaveButton();
    return;
  }

  const template = $("#friendRowTemplate");
  friendsDraft.forEach((friend, index) => {
    const row = template.content.firstElementChild.cloneNode(true);
    const avatar = row.querySelector(".avatar");
    const nameInput = row.querySelector(".friend-name-input");
    const budgetInput = row.querySelector(".friend-budget-input");
    const removeBtn = row.querySelector(".remove-friend-btn");

    avatar.textContent = initial(friend.name);
    nameInput.value = friend.name || "";
    budgetInput.value = toNumber(friend.budget);

    nameInput.addEventListener("input", () => {
      friendsDraft[index].name = nameInput.value;
      avatar.textContent = initial(nameInput.value);
      markFriendsDirty();
    });

    budgetInput.addEventListener("input", () => {
      friendsDraft[index].budget = toNumber(budgetInput.value);
      markFriendsDirty();
    });

    removeBtn.addEventListener("click", () => {
      friendsDraft.splice(index, 1);
      markFriendsDirty();
      renderFriendEditor();
    });

    editor.appendChild(row);
  });

  updateFriendSaveButton();
  if (!remoteWaiting && !friendsDirty) hideFriendNote();
}

function renderFriendsReadOnly() {
  const editor = $("#friendsEditor");
  editor.innerHTML = "";

  if (!state.friends.length) {
    editor.innerHTML = `<div class="empty">No friends yet.</div>`;
    return;
  }

  state.friends.forEach((friend) => {
    const card = document.createElement("article");
    card.className = "friend-view-card";
    card.innerHTML = `
      <div class="avatar">${initial(friend.name)}</div>
      <div>
        <strong>${escapeHtml(friend.name || "Friend")}</strong>
        <span>Budget ${money(friend.budget)}</span>
      </div>
    `;
    editor.appendChild(card);
  });
}

function addDraftFriend() {
  if (!requireAdmin()) return;
  if (!friendsDraft) friendsDraft = cloneFriends(state.friends);
  friendsDraft.unshift({ id: uid(), name: "Friend", budget: 0 });
  markFriendsDirty();
  renderFriendEditor();
  requestAnimationFrame(() => {
    const firstInput = $(".friend-name-input");
    if (firstInput) firstInput.focus();
  });
}

function markFriendsDirty() {
  friendsDirty = true;
  remoteWaiting = false;
  showFriendNote("Editing locally. Tap Save changes when done.");
  updateFriendSaveButton();
}

function updateFriendSaveButton() {
  const saveBtn = $("#saveFriendsBtn");
  if (!saveBtn) return;
  saveBtn.textContent = friendsDirty ? "Save changes" : "Saved";
  saveBtn.disabled = !friendsDirty;
}

async function saveFriends() {
  if (!requireAdmin()) return;
  if (!friendsDraft) return;

  const cleaned = friendsDraft
    .map((friend) => ({
      id: friend.id || uid(),
      name: String(friend.name || "Friend").trim() || "Friend",
      budget: Math.max(0, toNumber(friend.budget))
    }))
    .filter((friend) => friend.name);

  $("#saveFriendsBtn").textContent = "Saving…";
  $("#saveFriendsBtn").disabled = true;

  await updateTrip({ friends: cleaned });

  state.friends = cleaned;
  friendsDirty = false;
  friendsDraft = null;
  remoteWaiting = false;
  showFriendNote("Saved. Friends will see it live.");
  renderAll();

  setTimeout(() => {
    if (!friendsDirty) hideFriendNote();
  }, 1400);
}

function renderExpenseForm(selectedSplit = null) {
  if (!isAdmin) return;
  fillFriendSelect($("#expensePaidBy"));
  renderSplitList(selectedSplit);
  updateExpenseFormButtons();
}

function renderSplitList(selectedSplit = null) {
  const splitList = $("#splitList");
  if (!splitList) return;
  splitList.innerHTML = "";

  if (!state.friends.length) {
    splitList.innerHTML = `<div class="empty">Add friends first.</div>`;
    return;
  }

  const selected = Array.isArray(selectedSplit) ? new Set(selectedSplit) : null;

  state.friends.forEach((friend) => {
    const checked = selected ? selected.has(friend.id) : true;
    const label = document.createElement("label");
    label.className = "check-pill";
    label.innerHTML = `
      <input type="checkbox" value="${escapeAttr(friend.id)}" ${checked ? "checked" : ""} />
      ${escapeHtml(friend.name || "Friend")}
    `;
    splitList.appendChild(label);
  });
}

async function saveExpenseFromForm(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  const title = $("#expenseTitle").value.trim();
  const amount = toNumber($("#expenseAmount").value);
  const paidBy = $("#expensePaidBy").value;
  const splitWith = $$("#splitList input:checked").map((input) => input.value);

  if (!title || amount <= 0 || !paidBy) return toast("Fill expense details.");
  if (!splitWith.length) return toast("Select at least one person.");

  const expense = {
    id: editingExpenseId || uid(),
    title,
    amount,
    paidBy,
    splitWith,
    createdAt: state.expenses.find((item) => item.id === editingExpenseId)?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  const nextExpenses = editingExpenseId
    ? state.expenses.map((item) => (item.id === editingExpenseId ? expense : item))
    : [...state.expenses, expense];

  await updateTrip({ expenses: nextExpenses });
  resetExpenseForm();
  toast(editingExpenseId ? "Expense saved." : "Expense added.");
}

function startEditExpense(id) {
  if (!requireAdmin()) return;
  const expense = state.expenses.find((item) => item.id === id);
  if (!expense) return;

  setActiveTab("spend", { keepScroll: true });
  editingExpenseId = id;
  $("#editingExpenseId").value = id;
  renderExpenseForm(expense.splitWith || []);
  $("#expenseTitle").value = expense.title || "";
  $("#expenseAmount").value = toNumber(expense.amount) || "";
  $("#expensePaidBy").value = expense.paidBy || "";
  updateExpenseFormButtons();
  $("#expenseTitle").focus();
  $("#expenseForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteExpense(id) {
  if (!requireAdmin()) return;
  const expense = state.expenses.find((item) => item.id === id);
  if (!expense) return;
  if (!confirm(`Delete expense "${expense.title || "Expense"}"?`)) return;
  await updateTrip({ expenses: state.expenses.filter((item) => item.id !== id) });
  if (editingExpenseId === id) resetExpenseForm();
  toast("Expense deleted.");
}

function resetExpenseForm(render = true) {
  editingExpenseId = "";
  const form = $("#expenseForm");
  if (form) form.reset();
  const hidden = $("#editingExpenseId");
  if (hidden) hidden.value = "";
  if (render) renderExpenseForm();
  updateExpenseFormButtons();
}

function updateExpenseFormButtons() {
  const title = $("#expenseSectionTitle");
  const submit = $("#expenseSubmitBtn");
  const cancel = $("#cancelExpenseEditBtn");
  if (!submit || !cancel || !title) return;

  if (editingExpenseId) {
    title.textContent = "Edit expense";
    submit.textContent = "Save expense";
    cancel.classList.remove("hidden");
  } else {
    title.textContent = "Add expense";
    submit.textContent = "Add expense";
    cancel.classList.add("hidden");
  }
}

function renderExpenseList() {
  const list = $("#expenseList");
  list.innerHTML = "";

  if (!state.expenses.length) {
    list.innerHTML = `<div class="empty">No expenses added yet.</div>`;
    return;
  }

  [...state.expenses].reverse().forEach((expense) => {
    const row = document.createElement("div");
    row.className = "list-item editable-item";
    row.innerHTML = `
      <div class="item-main">
        <strong>${escapeHtml(expense.title || "Expense")}</strong>
        <span>Paid by ${escapeHtml(friendName(expense.paidBy))} • Split ${expense.splitWith?.length || 0} ways</span>
      </div>
      <div class="item-side">
        <div class="amount">${money(expense.amount)}</div>
        <div class="item-actions admin-only">
          <button class="mini-btn edit-expense-btn" type="button">Edit</button>
          <button class="danger-lite delete-expense-btn" type="button">Delete</button>
        </div>
      </div>
    `;
    row.querySelector(".edit-expense-btn")?.addEventListener("click", () => startEditExpense(expense.id));
    row.querySelector(".delete-expense-btn")?.addEventListener("click", () => deleteExpense(expense.id));
    list.appendChild(row);
  });
}

function renderOrderForm() {
  if (!isAdmin) return;
  fillFriendSelect($("#orderFriend"));

  if (document.activeElement !== $("#orderTotalInput")) {
    $("#orderTotalInput").value = state.orderTotal || "";
  }

  updateOrderFormButtons();
  updateOrderSplitText();
}

async function saveOrderFromForm(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  const friendId = $("#orderFriend").value;
  const item = $("#orderItem").value.trim();
  const price = toNumber($("#orderPrice").value);

  if (!friendId || !item) return toast("Select friend and item.");

  const order = {
    id: editingOrderId || uid(),
    friendId,
    item,
    price,
    createdAt: state.orders.find((old) => old.id === editingOrderId)?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  const nextOrders = editingOrderId
    ? state.orders.map((old) => (old.id === editingOrderId ? order : old))
    : [...state.orders, order];

  await updateTrip({ orders: nextOrders });
  resetOrderForm();
  toast(editingOrderId ? "Order item saved." : "Order item added.");
}

function startEditOrder(id) {
  if (!requireAdmin()) return;
  const order = state.orders.find((item) => item.id === id);
  if (!order) return;

  setActiveTab("orders", { keepScroll: true });
  editingOrderId = id;
  $("#editingOrderId").value = id;
  renderOrderForm();
  $("#orderFriend").value = order.friendId || "";
  $("#orderItem").value = order.item || "";
  $("#orderPrice").value = toNumber(order.price) || "";
  updateOrderFormButtons();
  $("#orderItem").focus();
  $("#orderForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteOrder(id) {
  if (!requireAdmin()) return;
  const order = state.orders.find((item) => item.id === id);
  if (!order) return;
  if (!confirm(`Delete order item "${order.item || "Item"}"?`)) return;
  await updateTrip({ orders: state.orders.filter((item) => item.id !== id) });
  if (editingOrderId === id) resetOrderForm();
  toast("Order item deleted.");
}

function resetOrderForm(render = true) {
  editingOrderId = "";
  const form = $("#orderForm");
  if (form) form.reset();
  const hidden = $("#editingOrderId");
  if (hidden) hidden.value = "";
  if (render) renderOrderForm();
  updateOrderFormButtons();
}

function updateOrderFormButtons() {
  const submit = $("#orderSubmitBtn");
  const cancel = $("#cancelOrderEditBtn");
  if (!submit || !cancel) return;

  if (editingOrderId) {
    submit.textContent = "Save order item";
    cancel.classList.remove("hidden");
  } else {
    submit.textContent = "Add order item";
    cancel.classList.add("hidden");
  }
}

async function saveOrderTotal() {
  if (!requireAdmin()) return;
  const total = Math.max(0, toNumber($("#orderTotalInput").value));
  await updateTrip({ orderTotal: total });
  toast("Order total saved.");
}

async function clearOrders() {
  if (!requireAdmin()) return;
  if (!confirm("Clear all order items and total?")) return;
  await updateTrip({ orders: [], orderTotal: 0 });
  resetOrderForm();
  toast("Order cleared.");
}

function renderOrderList() {
  const list = $("#orderList");
  list.innerHTML = "";

  if (!state.orders.length) {
    list.innerHTML = `<div class="empty">No order items yet.</div>`;
    updateOrderSplitText();
    return;
  }

  [...state.orders].reverse().forEach((order) => {
    const row = document.createElement("div");
    row.className = "list-item editable-item";
    row.innerHTML = `
      <div class="item-main">
        <strong>${escapeHtml(order.item || "Item")}</strong>
        <span>${escapeHtml(friendName(order.friendId))}</span>
      </div>
      <div class="item-side">
        <div class="amount">${order.price ? money(order.price) : "—"}</div>
        <div class="item-actions admin-only">
          <button class="mini-btn edit-order-btn" type="button">Edit</button>
          <button class="danger-lite delete-order-btn" type="button">Delete</button>
        </div>
      </div>
    `;
    row.querySelector(".edit-order-btn")?.addEventListener("click", () => startEditOrder(order.id));
    row.querySelector(".delete-order-btn")?.addEventListener("click", () => deleteOrder(order.id));
    list.appendChild(row);
  });

  updateOrderSplitText();
}

function updateOrderSplitText() {
  const people = new Set(state.orders.map((order) => order.friendId)).size;
  const total = toNumber(state.orderTotal);
  const text = $("#orderSplitText");
  const totalView = $("#orderTotalView");

  if (totalView) {
    totalView.textContent = total > 0 ? `Final total: ${money(total)}` : "No final total yet.";
  }

  if (!text) return;

  if (!state.orders.length) {
    text.textContent = "Add items to calculate food split.";
    return;
  }

  if (total > 0 && people > 0) {
    text.textContent = `${people} people ordered. Split is about ${money(total / people)} each.`;
  } else {
    text.textContent = `${people} people ordered. Enter final total to show per-person split.`;
  }
}


function exportTripData() {
  if (!requireAdmin()) return;
  const payload = {
    version: 2,
    tripCode: currentTripCode,
    exportedAt: new Date().toISOString(),
    data: {
      friends: state.friends,
      expenses: state.expenses,
      orders: state.orders,
      orderTotal: state.orderTotal
    }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentTripCode || "trip"}-backup.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Backup downloaded.");
}

async function importTripData(event) {
  if (!requireAdmin()) return;
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const data = parsed.data || parsed;
    const next = normalizeState({
      adminPin: state.adminPin,
      friends: Array.isArray(data.friends) ? data.friends : state.friends,
      expenses: Array.isArray(data.expenses) ? data.expenses : state.expenses,
      orders: Array.isArray(data.orders) ? data.orders : state.orders,
      orderTotal: Number(data.orderTotal || 0)
    });

    if (!confirm("Import this backup and replace current trip data?")) return;
    await updateTrip({
      friends: next.friends,
      expenses: next.expenses,
      orders: next.orders,
      orderTotal: next.orderTotal
    });
    toast("Backup restored.");
  } catch (error) {
    console.error(error);
    toast("Could not import this file.");
  }
}

function fillFriendSelect(select) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = "";

  if (!state.friends.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Add friends first";
    select.appendChild(option);
    return;
  }

  state.friends.forEach((friend) => {
    const option = document.createElement("option");
    option.value = friend.id;
    option.textContent = friend.name || "Friend";
    select.appendChild(option);
  });

  if (state.friends.some((friend) => friend.id === current)) {
    select.value = current;
  }
}

function setActiveTab(tab, options = {}) {
  activeTab = tab;

  $$(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  $$(".tab-panel").forEach((panel) => {
    panel.classList.remove("active");
  });

  $(`#${tab}Panel`).classList.add("active");

  if (tab === "friends") {
    if (!friendsDirty) friendsDraft = cloneFriends(state.friends);
    renderFriendEditor();
  } else if (friendsDirty && isAdmin) {
    showFriendNote("Your friend edits are still local. Go back and tap Save changes.");
  }

  if (tab === "spend") {
    renderExpenseForm();
    renderExpenseList();
  }

  if (tab === "orders") {
    renderOrderForm();
    renderOrderList();
  }

  if (!options.keepScroll) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

async function updateTrip(patch, options = {}) {
  if (!tripRef) return;
  if (!options.allowWithoutAdmin && !isAdmin) {
    toast("Admin only.");
    throw new Error("Admin only");
  }

  await updateDoc(tripRef, {
    ...patch,
    updatedAt: serverTimestamp()
  });
}

function requireAdmin() {
  if (isAdmin) return true;
  toast("Unlock admin mode first.");
  return false;
}

function showFriendNote(message) {
  const note = $("#friendEditNote");
  note.textContent = message;
  note.classList.remove("hidden");
}

function hideFriendNote() {
  $("#friendEditNote").classList.add("hidden");
}

function setStatus(text) {
  syncStatus.textContent = text;
}

function toast(message) {
  setStatus(message);
  setTimeout(() => setStatus("Live"), 1400);
}

function isActiveInside(selector) {
  const root = $(selector);
  return Boolean(root && document.activeElement && root.contains(document.activeElement));
}

function getTripCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return cleanTripCode(params.get("trip") || "");
}

function cleanTripCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function adminStorageKey() {
  return `mussoorieAdmin:${currentTripCode}`;
}

function cloneFriends(friends) {
  return friends.map((friend) => ({
    id: friend.id || uid(),
    name: friend.name || "Friend",
    budget: toNumber(friend.budget)
  }));
}

function friendName(id) {
  return state.friends.find((friend) => friend.id === id)?.name || "Someone";
}

function initial(name) {
  return String(name || "F").trim().charAt(0).toUpperCase() || "F";
}

function money(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(toNumber(value));
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
