const STORAGE_KEY = "expense-tracker:expenses";

const form = document.getElementById("expense-form");
const tableBody = document.getElementById("expense-table-body");
const totalAmountEl = document.getElementById("total-amount");
const chartCanvas = document.getElementById("expense-chart");
const submitButton = document.getElementById("submit-btn");
const cancelEditButton = document.getElementById("cancel-edit-btn");
const chartStatusEl = document.getElementById("chart-status");

let expenses = [];
let chartInstance = null;
let editingId = null;

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

function loadExpenses() {
  try {
    const data = window.localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(validateExpenseShape)
      .map((expense) => ({
        ...expense,
        amount: Number(expense.amount),
      }))
      .sort((a, b) => {
        const aTime = new Date(a.date).getTime();
        const bTime = new Date(b.date).getTime();
        if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
          return 0;
        }
        return bTime - aTime;
      });
  } catch (error) {
    console.warn("Could not load expenses from localStorage", error);
    return [];
  }
}

function validateExpenseShape(expense) {
  return (
    expense &&
    typeof expense.id === "string" &&
    typeof expense.description === "string" &&
    typeof expense.category === "string" &&
    (typeof expense.amount === "number" || typeof expense.amount === "string") &&
    typeof expense.date === "string"
  );
}

function persistExpenses() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch (error) {
    console.error("Could not save expenses", error);
  }
}

function renderExpenses() {
  if (!expenses.length) {
    tableBody.innerHTML =
      '<tr class="empty"><td colspan="5">No expenses yet. Add your first entry above!</td></tr>';
    return;
  }

  const rows = expenses
    .map((expense) => {
      const formattedAmount = currencyFormatter.format(expense.amount);
      const formattedDate = formatDate(expense.date);
      return `
        <tr data-id="${expense.id}">
          <td>${escapeHtml(expense.description)}</td>
          <td>${escapeHtml(expense.category)}</td>
          <td>${formattedAmount}</td>
          <td>${formattedDate}</td>
          <td class="actions">
            <button class="edit-btn" type="button" data-action="edit">Edit</button>
            <button class="delete-btn" type="button" data-action="delete">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");

  tableBody.innerHTML = rows;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function updateTotal() {
  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  totalAmountEl.textContent = currencyFormatter.format(total);
}

function updateChart() {
  if (!chartCanvas) {
    return;
  }

  if (!window.Chart) {
    if (chartStatusEl) {
      chartStatusEl.textContent = "Connect to the internet to see the category breakdown chart.";
    }
    return;
  }

  const totalsByCategory = expenses.reduce((acc, expense) => {
    const key = expense.category.trim() || "Uncategorized";
    acc[key] = (acc[key] ?? 0) + Number(expense.amount || 0);
    return acc;
  }, {});

  const categories = Object.keys(totalsByCategory);
  const values = Object.values(totalsByCategory);

  if (!categories.length) {
    if (chartStatusEl) {
      chartStatusEl.textContent = "Add expenses to see the category breakdown chart.";
    }
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  if (chartStatusEl) {
    chartStatusEl.textContent = "Category totals update automatically.";
  }

  const colors = generatePalette(categories.length);

  if (chartInstance) {
    chartInstance.data.labels = categories;
    chartInstance.data.datasets[0].data = values;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update();
    return;
  }

  chartInstance = new Chart(chartCanvas, {
    type: "pie",
    data: {
      labels: categories,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              const category = context.label || "";
              const value = context.parsed || 0;
              const dataset = context.chart.data.datasets?.[context.datasetIndex] ?? { data: [] };
              const datasetValues = Array.isArray(dataset.data) ? dataset.data : [];
              const percentage = calculatePercentage(value, datasetValues);
              return `${category}: ${currencyFormatter.format(value)} (${percentage}%)`;
            },
          },
        },
      },
    },
  });
}

function calculatePercentage(value, values) {
  const total = values.reduce((sum, current) => sum + current, 0);
  if (!total) return 0;
  return ((value / total) * 100).toFixed(1);
}

function generatePalette(count) {
  const palette = [
    "#536dfe",
    "#4caf50",
    "#ff9800",
    "#e91e63",
    "#9c27b0",
    "#009688",
    "#ff5722",
    "#3f51b5",
    "#8bc34a",
    "#ffc107",
  ];

  if (count <= palette.length) {
    return palette.slice(0, count);
  }

  const extended = [...palette];
  for (let i = palette.length; i < count; i += 1) {
    extended.push(shadeColor(palette[i % palette.length], (i / count) * 0.4));
  }
  return extended;
}

function shadeColor(color, percent) {
  const num = parseInt(color.replace("#", ""), 16);
  const r = (num >> 16) + Math.round(255 * percent);
  const g = ((num >> 8) & 0x00ff) + Math.round(255 * percent);
  const b = (num & 0x0000ff) + Math.round(255 * percent);
  return `#${(
    0x1000000 +
    (Math.min(r, 255) << 16) +
    (Math.min(g, 255) << 8) +
    Math.min(b, 255)
  )
    .toString(16)
    .slice(1)}`;
}

function addExpense(expense) {
  expenses = [expense, ...expenses];
  sortExpenses();
  persistExpenses();
  refreshUI();
}

function deleteExpense(id) {
  expenses = expenses.filter((expense) => expense.id !== id);
  if (editingId === id) {
    exitEditMode();
  }
  persistExpenses();
  refreshUI();
}

function updateExpense(updatedExpense) {
  expenses = expenses.map((expense) => (expense.id === updatedExpense.id ? { ...expense, ...updatedExpense } : expense));
  sortExpenses();
  persistExpenses();
  refreshUI();
}

function refreshUI() {
  renderExpenses();
  applyEditingHighlight();
  updateTotal();
  updateChart();
}

function handleFormSubmit(event) {
  event.preventDefault();
  const formData = new FormData(form);
  const description = (formData.get("description") || "").toString().trim();
  const category = (formData.get("category") || "").toString().trim();
  const amountRaw = formData.get("amount");
  const date = (formData.get("date") || "").toString();

  const amount = Number(amountRaw);

  if (!description || !category || !date || Number.isNaN(amount) || amount <= 0) {
    form.reportValidity();
    return;
  }

  if (editingId) {
    updateExpense({
      id: editingId,
      description,
      category,
      amount: roundToTwo(amount),
      date,
    });
    exitEditMode();
    return;
  }

  const expense = {
    id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `exp-${Date.now()}`,
    description,
    category,
    amount: roundToTwo(amount),
    date,
  };

  addExpense(expense);
  resetForm();
}

function roundToTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function descriptionInput() {
  return form.querySelector("#description");
}

function setDefaultDate() {
  const dateField = form.querySelector("#date");
  if (dateField && !dateField.value) {
    dateField.valueAsDate = new Date();
  }
}

function fillFormWithExpense(expense) {
  const descriptionField = descriptionInput();
  const categoryField = form.querySelector("#category");
  const amountField = form.querySelector("#amount");
  const dateField = form.querySelector("#date");

  if (descriptionField) {
    descriptionField.value = expense.description;
  }
  if (categoryField instanceof HTMLInputElement) {
    categoryField.value = expense.category;
  }
  if (amountField instanceof HTMLInputElement) {
    amountField.value = expense.amount.toString();
  }
  if (dateField instanceof HTMLInputElement) {
    dateField.value = formatDateForInput(expense.date);
  }
}

function formatDateForInput(value) {
  if (!value) return "";
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

function setupEventListeners() {
  form.addEventListener("submit", handleFormSubmit);

  tableBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    if (target.dataset.action === "delete") {
      const row = target.closest("tr[data-id]");
      if (!row) return;
      deleteExpense(row.dataset.id);
      return;
    }

    if (target.dataset.action === "edit") {
      const row = target.closest("tr[data-id]");
      if (!row) return;
      const expense = expenses.find((item) => item.id === row.dataset.id);
      if (!expense) return;
      enterEditMode(expense);
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      expenses = loadExpenses();
      refreshUI();
    }
  });

  if (cancelEditButton) {
    cancelEditButton.addEventListener("click", () => exitEditMode());
  }
}

function init() {
  expenses = loadExpenses();
  setDefaultDate();
  refreshUI();
  setupEventListeners();
}

function resetForm() {
  form.reset();
  setDefaultDate();
  const firstField = descriptionInput();
  if (firstField) {
    firstField.focus();
  }
}

function enterEditMode(expense) {
  editingId = expense.id;
  fillFormWithExpense(expense);
  if (submitButton) {
    submitButton.textContent = "Update Expense";
  }
  if (cancelEditButton) {
    cancelEditButton.hidden = false;
  }
  applyEditingHighlight();
  const firstField = descriptionInput();
  if (firstField) {
    firstField.focus();
    firstField.select();
  }
}

function exitEditMode() {
  editingId = null;
  if (submitButton) {
    submitButton.textContent = "Add Expense";
  }
  if (cancelEditButton) {
    cancelEditButton.hidden = true;
  }
  resetForm();
  applyEditingHighlight();
}

function applyEditingHighlight() {
  tableBody.querySelectorAll("tr[data-id]").forEach((row) => {
    row.classList.toggle("editing", Boolean(editingId) && row.dataset.id === editingId);
  });
}

function sortExpenses() {
  expenses.sort((a, b) => {
    const aTime = new Date(a.date).getTime();
    const bTime = new Date(b.date).getTime();
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return bTime - aTime;
  });
}

init();
