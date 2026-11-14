const state = {
  dashboard: null,
  customers: [],
  visibleCustomers: [],
  showAll: false,
};

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${response.status})`);
  }
  return response.json();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function renderDashboard(data) {
  state.dashboard = data;
  $("#total-customers").textContent = data.total_customers.toLocaleString();
  $("#nav-count").textContent = data.total_customers;
  $("#high-risk").textContent = data.high_risk.toLocaleString();
  $("#high-risk-rate").textContent = `${Math.round(data.high_risk / data.total_customers * 100)}% of base`;
  $("#average-risk").innerHTML = `${Math.round(data.average_risk * 100)}<small>%</small>`;
  $("#chart-current").textContent = `${(data.average_risk * 100).toFixed(1)}%`;
  $("#retention-opportunity").textContent = data.retention_opportunity.toLocaleString();
  $("#donut-total").textContent = data.total_customers.toLocaleString();
  $("#legend-high").textContent = data.risk_distribution.High;
  $("#legend-medium").textContent = data.risk_distribution.Medium;
  $("#legend-low").textContent = data.risk_distribution.Low;
  $("#attention-count").textContent = data.at_risk.toLocaleString();
  $("#model-footer").textContent = `${data.model.name} · Demo model ${data.model.version}`;
  const { High, Medium, Low } = data.risk_distribution;
  const high = High / data.total_customers * 360;
  const medium = Medium / data.total_customers * 360;
  $("#risk-donut").style.background = `conic-gradient(#fa788b 0deg ${high}deg, #efb95f ${high}deg ${high + medium}deg, #66d7b0 ${high + medium}deg 360deg)`;
  drawTrend(data.trend);
}

function drawTrend(trend) {
  const canvas = $("#trend-chart");
  const bounds = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, bounds.width * scale);
  canvas.height = Math.max(1, bounds.height * scale);
  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  const width = bounds.width;
  const height = bounds.height;
  const padding = { left: 28, right: 9, top: 8, bottom: 21 };
  const values = trend.map((item) => item.rate);
  const minimum = Math.floor((Math.min(...values) - 2) / 5) * 5;
  const maximum = Math.ceil((Math.max(...values) + 2) / 5) * 5;
  const x = (index) => padding.left + index * (width - padding.left - padding.right) / (values.length - 1);
  const y = (value) => padding.top + (maximum - value) * (height - padding.top - padding.bottom) / (maximum - minimum);

  context.font = "9px DM Sans, sans-serif";
  context.textBaseline = "middle";
  for (let tick = minimum; tick <= maximum; tick += 5) {
    const position = y(tick);
    context.beginPath();
    context.strokeStyle = "#2a2e3b";
    context.setLineDash([3, 4]);
    context.moveTo(padding.left, position);
    context.lineTo(width - padding.right, position);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "#83899a";
    context.textAlign = "right";
    context.fillText(`${tick}%`, padding.left - 7, position);
  }
  trend.forEach((point, index) => {
    context.fillStyle = "#83899a";
    context.textAlign = "center";
    context.fillText(point.month, x(index), height - 7);
  });

  const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, "rgba(160, 132, 246, .22)");
  gradient.addColorStop(1, "rgba(160, 132, 246, 0)");
  context.beginPath();
  values.forEach((value, index) => index ? context.lineTo(x(index), y(value)) : context.moveTo(x(index), y(value)));
  context.lineTo(x(values.length - 1), height - padding.bottom);
  context.lineTo(x(0), height - padding.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  values.forEach((value, index) => index ? context.lineTo(x(index), y(value)) : context.moveTo(x(index), y(value)));
  context.strokeStyle = "#a58cf5";
  context.lineWidth = 2;
  context.lineJoin = "round";
  context.stroke();
  values.forEach((value, index) => {
    context.beginPath();
    context.arc(x(index), y(value), index === values.length - 1 ? 3.5 : 2.5, 0, Math.PI * 2);
    context.fillStyle = index === values.length - 1 ? "#b6a3ff" : "#8770d5";
    context.fill();
  });
}

function renderCustomers(customers) {
  state.customers = customers;
  applyCustomerFilters();
}

function applyCustomerFilters() {
  const search = $("#customer-search").value.trim().toLowerCase();
  const risk = $("#risk-filter").value;
  const filtered = state.customers.filter((customer) =>
    (risk === "All" || customer.risk === risk)
    && (!search || customer.name.toLowerCase().includes(search) || customer.id.toLowerCase().includes(search))
  );
  state.visibleCustomers = filtered;
  const rows = state.showAll ? filtered : filtered.slice(0, 7);
  $("#watch-count").textContent = filtered.length;
  $("#table-summary").textContent = filtered.length
    ? `Showing ${rows.length} of ${filtered.length} customers`
    : "No customers match your filters";
  $("#view-all").innerHTML = state.showAll ? 'Show less <span>↑</span>' : 'View all customers <span>→</span>';
  $("#customer-rows").innerHTML = rows.length ? rows.map((customer) => {
    const percent = Math.round(customer.churn_probability * 100);
    const initials = customer.name.split(" ").map((part) => part[0]).slice(0, 2).join("");
    return `<tr>
      <td><div class="customer-cell"><div class="customer-avatar">${escapeHtml(initials)}</div><div><div class="customer-name">${escapeHtml(customer.name)}</div><div class="customer-id">${escapeHtml(customer.id)}</div></div></div></td>
      <td><span class="risk-score"><span>${percent}%</span><span class="risk-track"><span style="width:${percent}%;background:${customer.risk === "High" ? "#fa788b" : customer.risk === "Medium" ? "#efb95f" : "#66d7b0"}"></span></span></span></td>
      <td><span class="risk-badge ${escapeHtml(customer.risk)}">${escapeHtml(customer.risk)}</span></td>
      <td>${escapeHtml(customer.contract)}</td><td>${customer.tenure_months} mo</td><td>$${Number(customer.monthly_charges).toFixed(2)}</td>
      <td><button class="row-action" data-customer-id="${escapeHtml(customer.id)}" aria-label="View ${escapeHtml(customer.name)} recommendations">→</button></td>
    </tr>`;
  }).join("") : '<tr><td class="empty-cell" colspan="7">No customers found. Try another name or risk level.</td></tr>';
}

function openModal() {
  $("#score-modal").classList.add("open");
  $("#score-modal").setAttribute("aria-hidden", "false");
  $("#score-form").elements.tenure_months.focus();
}

function closeModal() {
  $("#score-modal").classList.remove("open");
  $("#score-modal").setAttribute("aria-hidden", "true");
}

function exportCsv() {
  const columns = ["id", "name", "churn_probability", "risk", "contract", "tenure_months", "monthly_charges"];
  const csv = [columns.join(","), ...state.visibleCustomers.map((row) =>
    columns.map((column) => `"${String(column === "churn_probability" ? `${Math.round(row[column] * 100)}%` : row[column]).replaceAll('"', '""')}"`).join(",")
  )].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "signal-customer-risk.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`Exported ${state.visibleCustomers.length} customers`);
}

async function submitScore(event) {
  event.preventDefault();
  const button = $("#score-submit");
  const result = $("#prediction-result");
  button.disabled = true;
  button.textContent = "Scoring…";
  result.classList.remove("visible");
  try {
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    payload.tenure_months = Number(payload.tenure_months);
    payload.monthly_charges = Number(payload.monthly_charges);
    const prediction = await request("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    result.innerHTML = `<h3>Prediction result</h3><div class="result-score"><strong>${Math.round(prediction.probability * 100)}% <span class="risk-badge ${escapeHtml(prediction.risk)}">${escapeHtml(prediction.risk)} risk</span></strong></div><p>Suggested next steps</p><ul>${prediction.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
    result.classList.add("visible");
  } catch (error) {
    result.innerHTML = `<h3>Couldn't score customer</h3><p>${escapeHtml(error.message)}</p>`;
    result.classList.add("visible");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Calculate risk <span>→</span>';
  }
}

async function showRecommendations(customerId) {
  try {
    const customer = await request(`/api/customers/${encodeURIComponent(customerId)}`);
    const tips = customer.recommendations.map((tip) => `• ${tip}`).join("\n");
    showToast(`${customer.name} · ${Math.round(customer.churn_probability * 100)}% risk`);
    window.alert(`${customer.name} (${customer.risk} risk)\n\nRecommended actions:\n${tips}`);
  } catch (error) {
    showToast(error.message);
  }
}

async function initialize() {
  try {
    const [dashboard, customers] = await Promise.all([
      request("/api/dashboard"),
      request("/api/customers?limit=240"),
    ]);
    renderDashboard(dashboard);
    renderCustomers(customers);
    window.addEventListener("resize", () => state.dashboard && drawTrend(state.dashboard.trend));
  } catch (error) {
    $("#customer-rows").innerHTML = `<tr><td class="empty-cell" colspan="7">Unable to load the dashboard: ${escapeHtml(error.message)}. Refresh to try again.</td></tr>`;
    $("#table-summary").textContent = "Dashboard unavailable";
  }
}

$("#open-score").addEventListener("click", openModal);
$("#close-score").addEventListener("click", closeModal);
$("#score-modal").addEventListener("click", (event) => {
  if (event.target === $("#score-modal")) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});
$("#score-form").addEventListener("submit", submitScore);
$("#customer-search").addEventListener("input", applyCustomerFilters);
$("#risk-filter").addEventListener("change", applyCustomerFilters);
$("#view-all").addEventListener("click", () => {
  state.showAll = !state.showAll;
  applyCustomerFilters();
});
$("#export-csv").addEventListener("click", exportCsv);
$("#dismiss-notice").addEventListener("click", () => $("#demo-notice").remove());
$("#customer-rows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-customer-id]");
  if (button) showRecommendations(button.dataset.customerId);
});
$("#risk-donut").addEventListener("click", () => {
  $("#risk-filter").value = "High";
  applyCustomerFilters();
  $("#customers").scrollIntoView({ behavior: "smooth" });
});
initialize();
