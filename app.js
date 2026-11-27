const CART_KEY = "techhub.checkout.cart";
const ORDERS_KEY = "techhub.checkout.orders";
const DEFAULT_CART = [
  { id: "poco-x8-pro", name: "Poco X8 Pro", detail: "Smartphone", price: 17099, quantity: 1, selected: true },
  { id: "poco-x8-pro-max", name: "Poco X8 Pro Max", detail: "Smartphone", price: 25999, quantity: 1, selected: true }
];

const form = document.querySelector("#checkout-form");
const cartItems = document.querySelector("#cart-items");
const cartEmptyMessage = document.querySelector("#cart-empty-message");
const notice = document.querySelector("#notice");
const confirmation = document.querySelector("#confirmation");
const confirmationMessage = document.querySelector("#confirmation-message");
const placeOrderButton = document.querySelector(".place-order-button");
const canSubmitOrders = window.location.protocol !== "file:";
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function readStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch (error) {
    console.error(`Unable to read ${key} from local storage.`, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Unable to save ${key} to local storage.`, error);
    return false;
  }
}

const storedCart = readStorage(CART_KEY, DEFAULT_CART);
const defaultItems = new Map(DEFAULT_CART.map((item) => [item.id, item]));
const validStoredCart = Array.isArray(storedCart)
  ? storedCart
    .filter((item) => item && defaultItems.has(item.id)
      && Number.isInteger(item.quantity) && item.quantity >= 0)
    .map((item) => ({
      ...defaultItems.get(item.id),
      quantity: item.quantity,
      selected: item.selected !== false
    }))
  : null;
let cart = validStoredCart && validStoredCart.length > 0
  ? validStoredCart
  : Array.isArray(storedCart) && storedCart.length === 0
    ? DEFAULT_CART.map((item) => ({ ...item, quantity: 0 }))
    : DEFAULT_CART.map((item) => ({ ...item }));

const storedOrders = readStorage(ORDERS_KEY, []);
let orders = Array.isArray(storedOrders) ? storedOrders : [];

function getSelectedItems() {
  return cart.filter((item) => item.selected && item.quantity > 0);
}

function getSubtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
}

function renderTotals() {
  const selectedItems = getSelectedItems();
  const quantity = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = getSubtotal(selectedItems);
  document.querySelector("#item-count").textContent = String(quantity);
  document.querySelector("#subtotal").textContent = peso.format(subtotal);
  document.querySelector("#total").textContent = peso.format(subtotal);
  const hasSelectedItems = selectedItems.length > 0;
  cartEmptyMessage.hidden = cart.some((item) => item.quantity > 0);
  placeOrderButton.disabled = !hasSelectedItems || !canSubmitOrders;
}

function createQuantityButton(label, action, itemId) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = itemId;
  button.setAttribute("aria-label", `${action === "increase" ? "Increase" : "Decrease"} item quantity`);
  return button;
}

function renderCart() {
  cartItems.replaceChildren();

  if (cart.length === 0) {
    const emptyMessage = document.createElement("li");
    emptyMessage.textContent = "Your cart is empty.";
    cartItems.append(emptyMessage);
    renderTotals();
    return;
  }

  cart.forEach((item) => {
    const row = document.createElement("li");
    const selectionLabel = document.createElement("label");
    const checkbox = document.createElement("input");
    const detail = document.createElement("p");
    const quantityControls = document.createElement("span");
    const quantity = document.createElement("span");

    checkbox.type = "checkbox";
    checkbox.checked = item.selected;
    checkbox.setAttribute("aria-label", `Include ${item.name} in this order`);
    checkbox.addEventListener("change", () => {
      item.selected = checkbox.checked;
      if (!writeStorage(CART_KEY, cart)) showNotice("Your selection could not be saved on this device.");
      renderTotals();
    });

    selectionLabel.append(checkbox, ` ${item.name}`);
    detail.textContent = `${item.detail} - ${peso.format(item.price)} each`;
    quantity.textContent = ` Quantity: ${item.quantity} `;
    const decreaseButton = createQuantityButton("-", "decrease", item.id);
    decreaseButton.disabled = item.quantity === 0;
    quantityControls.append(
      decreaseButton,
      quantity,
      createQuantityButton("+", "increase", item.id)
    );
    row.append(selectionLabel, detail, quantityControls);
    cartItems.append(row);
  });

  renderTotals();
}

function updateCart(itemId, action) {
  cart = cart.map((item) => {
    if (item.id !== itemId) return item;
    return { ...item, quantity: action === "increase" ? item.quantity + 1 : Math.max(0, item.quantity - 1) };
  });

  if (!writeStorage(CART_KEY, cart)) showNotice("Your cart changes could not be saved on this device.");
  renderCart();
}

function renderOrders() {
  const history = document.querySelector("#order-history");
  history.replaceChildren();

  if (orders.length === 0) {
    const emptyMessage = document.createElement("li");
    emptyMessage.textContent = "Your placed orders will appear here.";
    history.append(emptyMessage);
    return;
  }

  orders.slice().reverse().forEach((order) => {
    const row = document.createElement("li");
    row.textContent = `${order.id} - ${order.date} - ${peso.format(order.total)} - ${order.paymentStatus}`;
    history.append(row);
  });
}

cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (button) updateCart(button.dataset.id, button.dataset.action);
});

form.addEventListener("input", () => {
  if (canSubmitOrders) notice.hidden = true;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  notice.hidden = true;

  if (!canSubmitOrders) {
    showNotice("Start Apache in XAMPP and open http://localhost/TechHub-Ecommerce/checkout.html to save orders.");
    return;
  }

  if (cart.length === 0) {
    showNotice("Your cart is empty. Add an item before placing an order.");
    return;
  }

  const selectedItems = getSelectedItems();
  if (selectedItems.length === 0) {
    showNotice("Select at least one item before placing an order.");
    return;
  }

  const data = new FormData(form);
  placeOrderButton.disabled = true;

  try {
    const response = await fetch("save-order.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: data.get("firstName"),
        lastName: data.get("lastName"),
        email: data.get("email"),
        phone: data.get("phone"),
        address: data.get("address"),
        city: data.get("city"),
        postalCode: data.get("postalCode"),
        paymentMethod: data.get("paymentMethod"),
        items: selectedItems.map(({ id, quantity }) => ({ id, quantity }))
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `The order could not be saved (HTTP ${response.status}).`);
    if (!result.order) throw new Error("The server response did not include the saved order.");

    const order = result.order;
    orders = [...orders, order];
    const ordersSaved = writeStorage(ORDERS_KEY, orders);
    const orderedItemIds = new Set(order.items.map((item) => item.id));
    cart = cart.map((item) => orderedItemIds.has(item.id) ? { ...item, quantity: 0 } : item);
    const cartSaved = writeStorage(CART_KEY, cart);

    renderCart();
    renderOrders();
    confirmationMessage.textContent = `Thanks, ${order.customer}. Order ${order.id} includes ${order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")} for ${peso.format(order.total)}. ${order.paymentStatus}. Saved to the server JSON file.`;
    confirmation.hidden = false;
    form.reset();

    if (!ordersSaved || !cartSaved) {
      showNotice("The order was saved to the server JSON file, but browser history or cart changes could not be saved.");
    }
    document.querySelector("#orders").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    console.error("Unable to submit checkout order.", error);
    showNotice(error instanceof Error ? error.message : "The order could not be saved. Try again.");
  } finally {
    renderTotals();
  }
});

renderCart();
renderOrders();
if (!canSubmitOrders) {
  showNotice("Start Apache in XAMPP and open http://localhost/TechHub-Ecommerce/checkout.html to save orders.");
}
