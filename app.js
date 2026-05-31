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
let activeTab = "home";

let state = {
  friends: [],
  expenses: [],
  orders: [],
  orderTotal: 0
};

let friendsDraft = null;
let friendsDirty = false;
let remoteWaiting = false;

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

  $$(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  $$("[data-go]").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.go));
  });

  $("#addFriendBtn").addEventListener("click", addDraftFriend);
  $("#saveFriendsBtn").addEventListener("click", saveFriends);

  $("#expenseForm").addEventListener("submit", addExpense);
  $("#orderForm").addEventListener("submit", addOrder);
  $("#saveOrderTotalBtn").addEventListener("click", saveOrderTotal);
  $("#clearOrderBtn").addEventListener("click", clearOrders);
}

async function joinTrip(rawCode) {
  const code = cleanTripCode(rawCode);
  if (!code) return;

  if (unsubscribe) unsubscribe();

  localStorage.setItem("mussoorieTripCode", code);
  tripCodeInput.value = code;

  const url = new URL(window.location.href);
  url.searchParams.set("trip", code);
  history.replaceState(null, "", url.toString());

  setStatus("Connecting…");
  tripRef = doc(db, "trips", code);

  const snap = await getDoc(tripRef);
  if (!snap.exists()) {
    await setDoc(tripRef, {
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
      setStatus("Live");

      if (activeTab === "friends" && friendsDirty) {
        remoteWaiting = true;
        showFriendNote("Live updates are paused while you edit. Tap Save changes to sync.");
        renderEverythingExceptFriendEditor();
        return;
      }

      remoteWaiting = false;
      friendsDraft = null;
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
    friends: Array.isArray(data.friends) ? data.friends : [],
    expenses: Array.isArray(data.expenses) ? data.expenses : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    orderTotal: Number(data.orderTotal || 0)
  };
}

function renderAll() {
  renderOverview();
  renderFriendEditor();
  renderExpenseForm();
  renderExpenseList();
  renderOrderForm();
  renderOrderList();
}

function renderEverythingExceptFriendEditor() {
  renderOverview();
  renderExpenseForm();
  renderExpenseList();
  renderOrderForm();
  renderOrderList();
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
    chips.innerHTML = `<div class="empty">No friends yet. Add your squad.</div>`;
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
  if (!friendsDraft || !friendsDirty) {
    friendsDraft = cloneFriends(state.friends);
  }

  const editor = $("#friendsEditor");
  editor.innerHTML = "";

  if (!friendsDraft.length) {
    editor.innerHTML = `<div class="empty">No friends. Tap + Friend.</div>`;
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

function addDraftFriend() {
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
  saveBtn.textContent = friendsDirty ? "Save changes" : "Saved";
  saveBtn.disabled = !friendsDirty;
}

async function saveFriends() {
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

  await updateTrip({
    friends: cleaned
  });

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

function renderExpenseForm() {
  fillFriendSelect($("#expensePaidBy"));
  renderSplitList();
}

function renderSplitList() {
  const splitList = $("#splitList");
  splitList.innerHTML = "";

  if (!state.friends.length) {
    splitList.innerHTML = `<div class="empty">Add friends first.</div>`;
    return;
  }

  state.friends.forEach((friend) => {
    const label = document.createElement("label");
    label.className = "check-pill";
    label.innerHTML = `
      <input type="checkbox" value="${escapeAttr(friend.id)}" checked />
      ${escapeHtml(friend.name || "Friend")}
    `;
    splitList.appendChild(label);
  });
}

async function addExpense(event) {
  event.preventDefault();

  const title = $("#expenseTitle").value.trim();
  const amount = toNumber($("#expenseAmount").value);
  const paidBy = $("#expensePaidBy").value;
  const splitWith = $$("#splitList input:checked").map((input) => input.value);

  if (!title || amount <= 0 || !paidBy) return toast("Fill expense details.");
  if (!splitWith.length) return toast("Select at least one person.");

  const expense = {
    id: uid(),
    title,
    amount,
    paidBy,
    splitWith,
    createdAt: Date.now()
  };

  await updateTrip({
    expenses: [...state.expenses, expense]
  });

  event.target.reset();
  renderExpenseForm();
  toast("Expense added.");
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
    row.className = "list-item";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(expense.title || "Expense")}</strong>
        <span>Paid by ${escapeHtml(friendName(expense.paidBy))} • Split ${expense.splitWith?.length || 0} ways</span>
      </div>
      <div class="amount">${money(expense.amount)}</div>
    `;
    list.appendChild(row);
  });
}

function renderOrderForm() {
  fillFriendSelect($("#orderFriend"));

  if (document.activeElement !== $("#orderTotalInput")) {
    $("#orderTotalInput").value = state.orderTotal || "";
  }

  updateOrderSplitText();
}

async function addOrder(event) {
  event.preventDefault();

  const friendId = $("#orderFriend").value;
  const item = $("#orderItem").value.trim();
  const price = toNumber($("#orderPrice").value);

  if (!friendId || !item) return toast("Select friend and item.");

  const order = {
    id: uid(),
    friendId,
    item,
    price,
    createdAt: Date.now()
  };

  await updateTrip({
    orders: [...state.orders, order]
  });

  event.target.reset();
  renderOrderForm();
  toast("Order item added.");
}

async function saveOrderTotal() {
  const total = Math.max(0, toNumber($("#orderTotalInput").value));
  await updateTrip({ orderTotal: total });
  toast("Order total saved.");
}

async function clearOrders() {
  if (!confirm("Clear all order items and total?")) return;
  await updateTrip({ orders: [], orderTotal: 0 });
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
    row.className = "list-item";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(order.item || "Item")}</strong>
        <span>${escapeHtml(friendName(order.friendId))}</span>
      </div>
      <div class="amount">${order.price ? money(order.price) : "—"}</div>
    `;
    list.appendChild(row);
  });

  updateOrderSplitText();
}

function updateOrderSplitText() {
  const people = new Set(state.orders.map((order) => order.friendId)).size;
  const total = toNumber(state.orderTotal);
  const text = $("#orderSplitText");

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

function fillFriendSelect(select) {
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

function setActiveTab(tab) {
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
  } else if (friendsDirty) {
    showFriendNote("Your friend edits are still local. Go back and tap Save changes.");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function updateTrip(patch) {
  if (!tripRef) return;
  await updateDoc(tripRef, {
    ...patch,
    updatedAt: serverTimestamp()
  });
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
  setTimeout(() => setStatus("Live"), 1300);
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
