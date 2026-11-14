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
  if (response.status === 204) return null;
  return response.json();
}

function toast(message) {
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  window.setTimeout(() => element.classList.remove("show"), 2800);
}

function initials(name) {
  return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("");
}

function customerRow(customer) {
  const percent = Math.round(customer.churn_probability * 100);
  const color = customer.risk === "High" ? "#fa788b" : customer.risk === "Medium" ? "#efb95f" : "#66d7b0";
  return `<tr>
    <td><div class="customer-cell"><div class="customer-avatar">${escapeHtml(initials(customer.name))}</div><div><div class="customer-name">${escapeHtml(customer.name)}</div><div class="customer-id">${escapeHtml(customer.id)}</div></div></div></td>
    <td><span class="risk-score"><span>${percent}%</span><span class="risk-track"><span style="width:${percent}%;background:${color}"></span></span></span></td>
    <td><span class="risk-badge ${escapeHtml(customer.risk)}">${escapeHtml(customer.risk)}</span></td>
    <td>${escapeHtml(customer.contract)}</td><td>${customer.tenure_months} mo</td><td>$${Number(customer.monthly_charges).toFixed(2)}</td>
    <td><button class="row-action" data-customer-id="${escapeHtml(customer.id)}" aria-label="View ${escapeHtml(customer.name)}">→</button></td>
  </tr>`;
}

async function initCustomers() {
  const rows = $("#directory-rows");
  try {
    const customers = await request("/api/customers?limit=240");
    const update = () => {
      const search = $("#directory-search").value.trim().toLowerCase();
      const risk = $("#directory-risk").value;
      const filtered = customers.filter((customer) =>
        (risk === "All" || customer.risk === risk)
        && (!search || customer.name.toLowerCase().includes(search) || customer.id.toLowerCase().includes(search))
      );
      $("#customer-total").textContent = filtered.length.toLocaleString();
      $("#directory-count").textContent = filtered.length;
      $("#directory-summary").textContent = `Showing ${filtered.length} of ${customers.length} customers`;
      $("#customer-high").textContent = filtered.filter((customer) => customer.risk === "High").length.toLocaleString();
      const atRisk = filtered.filter((customer) => customer.risk !== "Low");
      $("#customer-revenue").textContent = `$${atRisk.reduce((sum, customer) => sum + customer.monthly_charges, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
      const averageTenure = filtered.length
        ? filtered.reduce((sum, customer) => sum + customer.tenure_months, 0) / filtered.length
        : 0;
      $("#customer-tenure").textContent = `${averageTenure.toFixed(1)} mo`;
      rows.innerHTML = filtered.length
        ? filtered.map(customerRow).join("")
        : '<tr><td class="empty-cell" colspan="7">No customers match your search or risk filter.</td></tr>';
      $("#customer-export").onclick = () => {
        const columns = ["id", "name", "churn_probability", "risk", "contract", "tenure_months", "monthly_charges"];
        const csv = [columns.join(","), ...filtered.map((customer) =>
          columns.map((column) => {
            const value = column === "churn_probability"
              ? `${Math.round(customer[column] * 100)}%`
              : customer[column];
            return `"${String(value).replaceAll('"', '""')}"`;
          }).join(",")
        )].join("\n");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        link.download = "signal-customer-segment.csv";
        link.click();
        URL.revokeObjectURL(link.href);
        toast(`Exported ${filtered.length} customers`);
      };
    };

    $("#directory-search").addEventListener("input", update);
    $("#directory-risk").addEventListener("change", update);
    rows.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-customer-id]");
      if (!button) return;
      button.disabled = true;
      try {
        const customer = await request(`/api/customers/${encodeURIComponent(button.dataset.customerId)}`);
        const percent = Math.round(customer.churn_probability * 100);
        $("#customer-detail").innerHTML = `
          <div class="detail-profile"><div class="detail-avatar">${escapeHtml(initials(customer.name))}</div><div><div class="eyebrow"><span class="eyebrow-line"></span> CUSTOMER PROFILE</div><h2>${escapeHtml(customer.name)}</h2><p>${escapeHtml(customer.id)} · ${customer.tenure_months} months with us</p></div><span class="risk-badge ${escapeHtml(customer.risk)}">${escapeHtml(customer.risk)} risk</span></div>
          <div class="detail-score"><div><span>Predicted churn probability</span><strong>${percent}%</strong></div><div class="risk-track"><span style="width:${percent}%;background:${customer.risk === "High" ? "#fa788b" : customer.risk === "Medium" ? "#efb95f" : "#66d7b0"}"></span></div></div>
          <div class="detail-facts"><div><span>Contract</span><strong>${escapeHtml(customer.contract)}</strong></div><div><span>Monthly charges</span><strong>$${Number(customer.monthly_charges).toFixed(2)}</strong></div><div><span>Internet</span><strong>${escapeHtml(customer.internet_service)}</strong></div><div><span>Payment method</span><strong>${escapeHtml(customer.payment_method)}</strong></div></div>
          <div class="detail-recommendations"><h3>Suggested retention actions</h3><ul>${customer.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
        $("#customer-detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
      }
    });
    update();
  } catch (error) {
    rows.innerHTML = `<tr><td class="empty-cell" colspan="7">Unable to load customers: ${escapeHtml(error.message)}</td></tr>`;
    $("#directory-summary").textContent = "Customer directory unavailable";
  }
}

async function initInsights() {
  try {
    const model = await request("/api/model");
    $("#model-algorithm").textContent = model.algorithm;
    $("#model-version").textContent = `Version ${model.version}`;
    $("#model-rows").textContent = model.training_rows.toLocaleString();
    $("#model-features").textContent = model.features;
    $("#model-status").textContent = model.status;
    $("#model-trees").textContent = `${model.trees} decision trees`;
    $("#about-estimator").textContent = model.algorithm;
    $("#about-trees").textContent = model.trees;
    $("#about-source").textContent = model.data_type;
    $("#about-rows").textContent = model.training_rows.toLocaleString();
    $("#insights-footer").textContent = `${model.name} · ${model.version}`;
    const maximum = Math.max(...model.top_features.map((feature) => feature.importance));
    $("#feature-list").innerHTML = model.top_features.map((feature) => {
      const share = (feature.importance * 100).toFixed(1);
      const width = maximum ? feature.importance / maximum * 100 : 0;
      return `<div class="feature-row"><div class="feature-label"><strong>${escapeHtml(feature.name)}</strong><span>${share}%</span></div><div class="feature-track"><span style="width:${width.toFixed(1)}%"></span></div></div>`;
    }).join("");
  } catch (error) {
    $("#feature-list").innerHTML = `<p class="error-message">Unable to load model insights: ${escapeHtml(error.message)}</p>`;
  }

  $("#insight-score-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#insight-score-submit");
    const result = $("#insight-prediction");
    button.disabled = true;
    button.textContent = "Scoring…";
    result.classList.remove("visible");
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
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
      result.innerHTML = `<h3>Prediction failed</h3><p>${escapeHtml(error.message)}</p>`;
      result.classList.add("visible");
    } finally {
      button.disabled = false;
      button.innerHTML = 'Run prediction <span>→</span>';
    }
  });
}

function renderCampaigns(campaigns) {
  const rows = $("#campaign-rows");
  const active = campaigns.filter((campaign) => campaign.status === "Active");
  $("#campaign-total").textContent = campaigns.length;
  $("#campaign-count").textContent = campaigns.length;
  $("#campaign-active").textContent = active.length;
  $("#campaign-drafts").textContent = campaigns.filter((campaign) => campaign.status === "Draft").length;
  $("#campaign-reach").textContent = active.reduce((sum, campaign) => sum + campaign.audience_size, 0).toLocaleString();
  $("#campaign-empty").hidden = campaigns.length > 0;
  rows.innerHTML = campaigns.length ? campaigns.map((campaign) => {
    const created = new Date(campaign.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return `<tr>
      <td><div class="campaign-name">${escapeHtml(campaign.name)}</div><div class="campaign-offer">${escapeHtml(campaign.offer)}</div></td>
      <td><span class="risk-badge ${campaign.audience === "All" ? "Low" : escapeHtml(campaign.audience)}">${escapeHtml(campaign.audience)}</span></td>
      <td>${escapeHtml(campaign.channel)}</td><td>${campaign.audience_size.toLocaleString()}</td>
      <td><select class="campaign-status-select ${escapeHtml(campaign.status)}" data-status-id="${campaign.id}" aria-label="Update status for ${escapeHtml(campaign.name)}"><option ${campaign.status === "Draft" ? "selected" : ""}>Draft</option><option ${campaign.status === "Active" ? "selected" : ""}>Active</option><option ${campaign.status === "Completed" ? "selected" : ""}>Completed</option></select></td>
      <td>${escapeHtml(created)}</td><td><button class="row-action campaign-delete" data-delete-id="${campaign.id}" aria-label="Delete ${escapeHtml(campaign.name)}">×</button></td>
    </tr>`;
  }).join("") : "";
}

async function initCampaigns() {
  const form = $("#campaign-form");
  const audienceSelect = form.elements.audience;
  let audienceSizes = {};
  const refresh = async () => {
    const campaigns = await request("/api/campaigns");
    renderCampaigns(campaigns);
  };
  try {
    const dashboard = await request("/api/dashboard");
    audienceSizes = {
      High: dashboard.risk_distribution.High,
      Medium: dashboard.risk_distribution.Medium,
      Low: dashboard.risk_distribution.Low,
      All: dashboard.total_customers,
    };
    const updateEstimate = () => {
      $("#audience-estimate").textContent = `Estimated reach: ${audienceSizes[audienceSelect.value].toLocaleString()} customers`;
    };
    audienceSelect.addEventListener("change", updateEstimate);
    updateEstimate();
    await refresh();
  } catch (error) {
    $("#campaign-rows").innerHTML = `<tr><td class="empty-cell" colspan="7">Unable to load campaign data: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#campaign-submit");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const campaign = await request("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      form.reset();
      $("#audience-estimate").textContent = `Estimated reach: ${audienceSizes.High.toLocaleString()} customers`;
      await refresh();
      toast(`Saved "${campaign.name}" as a draft`);
    } catch (error) {
      toast(`Couldn't save campaign: ${error.message}`);
    } finally {
      button.disabled = false;
      button.innerHTML = 'Save as draft <span>→</span>';
    }
  });

  $("#campaign-rows").addEventListener("change", async (event) => {
    const select = event.target.closest("[data-status-id]");
    if (!select) return;
    select.disabled = true;
    try {
      await request(`/api/campaigns/${select.dataset.statusId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: select.value }),
      });
      await refresh();
      toast(`Campaign marked ${select.value.toLowerCase()}`);
    } catch (error) {
      toast(`Couldn't update campaign: ${error.message}`);
      await refresh();
    }
  });

  $("#campaign-rows").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-id]");
    if (!button) return;
    const campaignName = button.closest("tr").querySelector(".campaign-name").textContent;
    if (!window.confirm(`Delete "${campaignName}"? This cannot be undone.`)) return;
    button.disabled = true;
    try {
      await request(`/api/campaigns/${button.dataset.deleteId}`, { method: "DELETE" });
      await refresh();
      toast("Campaign deleted");
    } catch (error) {
      toast(`Couldn't delete campaign: ${error.message}`);
      await refresh();
    }
  });

  $("#campaign-refresh").addEventListener("click", async () => {
    try {
      await refresh();
      toast("Campaign list refreshed");
    } catch (error) {
      toast(`Couldn't refresh campaigns: ${error.message}`);
    }
  });
  $("#campaign-create-shortcut").addEventListener("click", () => {
    form.elements.name.focus();
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

const page = document.body.dataset.page;
if (page === "customers") initCustomers();
if (page === "insights") initInsights();
if (page === "campaigns") initCampaigns();
