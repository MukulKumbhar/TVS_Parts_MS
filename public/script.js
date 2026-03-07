// ─── public/script.js ────────────────────────────────────────────────────────
// Full frontend logic — TVS Parts Management System
// ─────────────────────────────────────────────────────────────────────────────

// ── Config ────────────────────────────────────────────────────────────────────
const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : 'https://tvs-parts-ms.onrender.com'; // ← Replace with your Render URL

// ── Auth Guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('tvs_token');
const user  = JSON.parse(localStorage.getItem('tvs_user') || 'null');
if (!token || !user) window.location.href = '/login.html';

// ── Init User UI ──────────────────────────────────────────────────────────────
document.getElementById('user-name').textContent  = user?.name   || 'User';
document.getElementById('user-role').textContent  = user?.role   || 'staff';
document.getElementById('user-avatar').textContent= (user?.name  || 'U')[0].toUpperCase();
document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
document.getElementById('report-date').value      = new Date().toISOString().split('T')[0];
document.getElementById('bills-date-filter').value= new Date().toISOString().split('T')[0];

// Safe Lucide wrapper — never crashes if CDN is slow
function initIcons() {
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Init after DOM load
document.addEventListener('DOMContentLoaded', () => {
  initIcons();
  showPage('dashboard');
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function logout() {
  if (!confirm('Log out?')) return;
  localStorage.clear();
  window.location.href = '/login.html';
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

const fmt  = n => '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = n => parseInt(n || 0).toLocaleString('en-IN');

// Replace all lucide.createIcons() calls safely
function initIcons(node) {
  if (typeof lucide === 'undefined') return;
  node ? lucide.createIcons({ nodes: [node] }) : lucide.createIcons();
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Toast notifications
function toast(msg, type = 'success') {
  const c  = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : 'x-circle'}"></i><span>${msg}</span>`;
  c.appendChild(el);
  initIcons(el);
  setTimeout(() => el.remove(), 3500);
}

// API helper — always sends JWT
async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  if (res.status === 401) { localStorage.clear(); window.location.href = '/login.html'; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Confirm dialog
const confirmDialog = msg => window.confirm(msg);

// ── Page Navigation ───────────────────────────────────────────────────────────
const pageLoaders = {
  dashboard: loadDashboard,
  bikes:     loadBikes,
  parts:     loadParts,
  billing:   initBilling,
  bills:     loadBills,
  lowstock:  loadLowStock,
  reports:   loadReport,
  search:    () => document.getElementById('finder-input').focus()
};

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === name);
  });
  document.getElementById(`page-${name}`)?.classList.remove('hidden');
  document.getElementById('sidebar').classList.remove('open');
  pageLoaders[name]?.();
  initIcons();
}

// Modal helpers
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); initIcons(); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
let chartTrend = null, chartMonthly = null;

async function loadDashboard() {
  try {
    const [stats, recent, trend, monthly] = await Promise.all([
      api('/api/sales/today'),
      api('/api/sales/recent-bills'),
      api('/api/sales/trend?days=7'),
      api('/api/sales/monthly')
    ]);

    // Animated count-up
    animateCount('stat-sales', stats.total_sales, true);
    animateCount('stat-bills', stats.bill_count);
    animateCount('stat-stock', stats.total_stock);
    animateCount('stat-low',   stats.low_stock_count);
    document.getElementById('low-badge').textContent = stats.low_stock_count;

    // Recent bills table
    const tbody = document.getElementById('recent-bills-body');
    tbody.innerHTML = recent.length ? recent.map(b => `
      <tr>
        <td><span class="badge badge-blue">${b.bill_number}</span></td>
        <td>${b.customer_name}</td>
        <td>${b.item_count}</td>
        <td><b>${fmt(b.total)}</b></td>
        <td>${new Date(b.created_at).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}</td>
      </tr>`).join('') : `<tr><td colspan="5" class="loading-cell">No bills today yet</td></tr>`;

    // Charts
    renderTrendChart(trend);
    renderMonthlyChart(monthly);
    initIcons();
  } catch (e) {
    toast('Failed to load dashboard: ' + e.message, 'error');
  }
}

function animateCount(id, target, isCurrency = false) {
  const el   = document.getElementById(id);
  const dur  = 1000;
  const steps= 40;
  let   cur  = 0;
  const inc  = target / steps;
  const iv   = setInterval(() => {
    cur = Math.min(cur + inc, target);
    el.textContent = isCurrency ? fmt(cur) : fmtN(Math.round(cur));
    if (cur >= target) clearInterval(iv);
  }, dur / steps);
}

function renderTrendChart(data) {
  const ctx = document.getElementById('chart-trend').getContext('2d');
  if (chartTrend) chartTrend.destroy();
  chartTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => new Date(d.date).toLocaleDateString('en-IN', { month:'short', day:'numeric' })),
      datasets: [{
        label: 'Sales (₹)',
        data: data.map(d => parseFloat(d.total_sales)),
        borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,0.1)',
        borderWidth: 3, pointRadius: 5, pointBackgroundColor: '#2563EB', fill: true, tension: 0.4
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₹'+v.toLocaleString('en-IN') } } } }
  });
}

function renderMonthlyChart(data) {
  const ctx = document.getElementById('chart-monthly').getContext('2d');
  if (chartMonthly) chartMonthly.destroy();
  chartMonthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.month),
      datasets: [{
        label: 'Monthly Sales (₹)',
        data: data.map(d => parseFloat(d.total_sales)),
        backgroundColor: data.map((_, i) => i % 2 === 0 ? 'rgba(37,99,235,0.7)' : 'rgba(124,58,237,0.7)'),
        borderRadius: 8
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₹'+v.toLocaleString('en-IN') } } } }
  });
}

// ── BIKES ─────────────────────────────────────────────────────────────────────
let allBikes = [];

async function loadBikes() {
  try {
    allBikes = await api('/api/bikes');
    renderBikes(allBikes);
    // initIcons() is called inside renderBikes already
  } catch (e) { toast(e.message, 'error'); }
}

function renderBikes(bikes) {
  const tb = document.getElementById('bikes-body');
  tb.innerHTML = bikes.length ? bikes.map(b => `
    <tr>
      <td><b>${b.name}</b></td>
      <td>${b.company}</td>
      <td>${b.model || '-'}</td>
      <td>${b.year  || '-'}</td>
      <td>${b.cc ? b.cc + 'cc' : '-'}</td>
      <td><span class="badge badge-blue">${b.part_count || 0} parts</span></td>
      <td>
        <button class="btn-icon edit"   onclick="openBikeModal(${b.bike_id})"><i data-lucide="pencil"></i></button>
        <button class="btn-icon delete" onclick="deleteBike(${b.bike_id})"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`).join('') : '<tr><td colspan="7" class="loading-cell">No bikes added yet</td></tr>';
  lucide.createIcons();
}

function filterBikes(q) {
  const f = q.toLowerCase();
  renderBikes(allBikes.filter(b =>
    b.name.toLowerCase().includes(f) || b.company.toLowerCase().includes(f) || (b.model || '').toLowerCase().includes(f)
  ));
}

async function openBikeModal(id = null) {
  // Clear fields
  ['bike-id','bike-name','bike-company','bike-model','bike-year','bike-cc','bike-notes'].forEach(f => {
    const el = document.getElementById(f); if (el) el.value = '';
  });
  document.getElementById('bike-modal-title').textContent = id ? 'Edit Bike' : 'Add Bike';

  if (id) {
    try {
      const b = await api(`/api/bikes/${id}`);
      document.getElementById('bike-id').value      = b.bike_id;
      document.getElementById('bike-name').value    = b.name;
      document.getElementById('bike-company').value = b.company;
      document.getElementById('bike-model').value   = b.model || '';
      document.getElementById('bike-year').value    = b.year  || '';
      document.getElementById('bike-cc').value      = b.cc    || '';
      document.getElementById('bike-notes').value   = b.notes || '';
    } catch (e) { toast(e.message, 'error'); return; }
  }
  openModal('modal-bike');
}

async function saveBike() {
  const id = document.getElementById('bike-id').value;
  const body = {
    name:    document.getElementById('bike-name').value.trim(),
    company: document.getElementById('bike-company').value.trim(),
    model:   document.getElementById('bike-model').value.trim(),
    year:    document.getElementById('bike-year').value,
    cc:      document.getElementById('bike-cc').value,
    notes:   document.getElementById('bike-notes').value
  };
  if (!body.name || !body.company) return toast('Name and Company required', 'error');
  try {
    if (id) await api(`/api/bikes/${id}`, 'PUT', body);
    else    await api('/api/bikes', 'POST', body);
    toast(id ? 'Bike updated!' : 'Bike added!');
    closeModal('modal-bike');
    loadBikes();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteBike(id) {
  if (!confirmDialog('Delete this bike? Parts linked to it will remain.')) return;
  try { await api(`/api/bikes/${id}`, 'DELETE'); toast('Bike deleted.'); loadBikes(); }
  catch (e) { toast(e.message, 'error'); }
}

// ── PARTS ─────────────────────────────────────────────────────────────────────
let partsPage = 1;

async function loadParts() {
  const search   = document.getElementById('parts-search')?.value?.trim() || '';
  const bike_id  = document.getElementById('parts-bike-filter')?.value || '';
  const cat_id   = document.getElementById('parts-cat-filter')?.value  || '';
  const params   = new URLSearchParams({ page: partsPage, search, bike_id, cat_id });

  document.getElementById('parts-body').innerHTML = '<tr><td colspan="7" class="loading-cell"><div class="skeleton" style="width:200px;height:16px"></div></td></tr>';
  try {
    const data = await api(`/api/parts?${params}`);
    renderParts(data.parts);
    renderPagination(data.page, data.pages);
    await populatePartFilters();
    initIcons();
  } catch (e) { toast(e.message, 'error'); }
}

function renderParts(parts) {
  const tb = document.getElementById('parts-body');
  tb.innerHTML = parts.length ? parts.map(p => {
    const isLow  = p.quantity <= p.min_quantity;
    const isZero = p.quantity === 0;
    const qtyBadge = isZero ? `<span class="badge badge-red">${p.quantity}</span>`
                   : isLow  ? `<span class="badge badge-amber">${p.quantity}</span>`
                             : `<span class="badge badge-green">${p.quantity}</span>`;
    const loc = [p.rack, p.shelf, p.box].filter(Boolean).join(' › ') || '-';
    return `<tr>
      <td><b>${p.name}</b>${p.subcategory ? `<br><small class="badge badge-blue">${p.subcategory}</small>` : ''}</td>
      <td>${p.part_number || '-'}</td>
      <td>${p.bike_name || '-'}</td>
      <td><code>${loc}</code></td>
      <td>${qtyBadge}</td>
      <td>${fmt(p.price)}</td>
      <td style="display:flex;gap:4px">
        <button class="btn-icon edit"   onclick="openPartModal(${p.part_id})"><i data-lucide="pencil"></i></button>
        <button class="btn-icon edit"   onclick="openQtyModal(${p.part_id},'${p.name}',${p.quantity})" title="Quick Qty"><i data-lucide="hash"></i></button>
        <button class="btn-icon delete" onclick="deletePart(${p.part_id})"><i data-lucide="trash-2"></i></button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="loading-cell">No parts found</td></tr>';
  initIcons();
}

function renderPagination(cur, total) {
  const pg = document.getElementById('parts-pagination');
  if (total <= 1) { pg.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - cur) <= 2)
      html += `<button class="page-btn ${i === cur ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
    else if (Math.abs(i - cur) === 3)
      html += `<span style="color:var(--text-m)">…</span>`;
  }
  pg.innerHTML = html;
}

function goPage(p) { partsPage = p; loadParts(); }

async function populatePartFilters() {
  if (document.getElementById('parts-bike-filter').children.length > 1) return; // Already loaded
  try {
    const [bikes, cats] = await Promise.all([ api('/api/bikes'), api('/api/parts/categories') ]);
    const bf = document.getElementById('parts-bike-filter');
    const cf = document.getElementById('parts-cat-filter');
    bikes.forEach(b => { const o = new Option(b.name, b.bike_id); bf.appendChild(o); });
    cats.forEach(c =>  { const o = new Option(c.name, c.cat_id);  cf.appendChild(o); });

    // Also populate bike + cat dropdowns in Add Part modal
    const pb = document.getElementById('part-bike');
    const pc = document.getElementById('part-category');
    pb.innerHTML = '<option value="">Select Bike</option>';
    pc.innerHTML = '<option value="">Select Category</option>';
    bikes.forEach(b => pb.appendChild(new Option(b.name, b.bike_id)));
    cats.forEach(c  => pc.appendChild(new Option(c.name, c.cat_id)));
  } catch {}
}

async function openPartModal(id = null) {
  // Clear all part fields
  ['part-id','part-name','part-number','part-subcategory','part-rack','part-shelf',
   'part-box','part-qty','part-minqty','part-price','part-supplier','part-notes'].forEach(f => {
    const el = document.getElementById(f); if (el) el.value = '';
  });
  document.getElementById('part-bike').value     = '';
  document.getElementById('part-category').value = '';
  document.getElementById('part-modal-title').textContent = id ? 'Edit Part' : 'Add Part';
  await populatePartFilters();

  if (id) {
    try {
      const p = await api(`/api/parts/${id}`);
      document.getElementById('part-id').value          = p.part_id;
      document.getElementById('part-name').value        = p.name;
      document.getElementById('part-number').value      = p.part_number || '';
      document.getElementById('part-bike').value        = p.bike_id || '';
      document.getElementById('part-category').value    = p.category_id || '';
      document.getElementById('part-subcategory').value = p.subcategory || '';
      document.getElementById('part-rack').value        = p.rack || '';
      document.getElementById('part-shelf').value       = p.shelf || '';
      document.getElementById('part-box').value         = p.box || '';
      document.getElementById('part-qty').value         = p.quantity;
      document.getElementById('part-minqty').value      = p.min_quantity;
      document.getElementById('part-price').value       = p.price;
      document.getElementById('part-supplier').value    = p.supplier || '';
      document.getElementById('part-notes').value       = p.notes || '';
    } catch (e) { toast(e.message, 'error'); return; }
  }
  openModal('modal-part');
}

async function savePart() {
  const id   = document.getElementById('part-id').value;
  const body = {
    name:        document.getElementById('part-name').value.trim(),
    part_number: document.getElementById('part-number').value.trim(),
    bike_id:     document.getElementById('part-bike').value || null,
    category_id: document.getElementById('part-category').value || null,
    subcategory: document.getElementById('part-subcategory').value.trim(),
    rack:        document.getElementById('part-rack').value.trim(),
    shelf:       document.getElementById('part-shelf').value.trim(),
    box:         document.getElementById('part-box').value.trim(),
    quantity:    document.getElementById('part-qty').value,
    min_quantity:document.getElementById('part-minqty').value,
    price:       document.getElementById('part-price').value,
    supplier:    document.getElementById('part-supplier').value.trim(),
    notes:       document.getElementById('part-notes').value
  };
  if (!body.name) return toast('Part name is required', 'error');
  try {
    if (id) await api(`/api/parts/${id}`, 'PUT', body);
    else    await api('/api/parts', 'POST', body);
    toast(id ? 'Part updated!' : 'Part added!');
    closeModal('modal-part');
    loadParts();
  } catch (e) { toast(e.message, 'error'); }
}

function openQtyModal(id, name, cur) {
  document.getElementById('qty-part-id').value  = id;
  document.getElementById('qty-part-name').textContent = name;
  document.getElementById('qty-value').value    = cur;
  openModal('modal-qty');
}

async function saveQty() {
  const id  = document.getElementById('qty-part-id').value;
  const qty = document.getElementById('qty-value').value;
  try {
    await api(`/api/parts/${id}/qty`, 'PATCH', { quantity: qty });
    toast('Quantity updated!');
    closeModal('modal-qty');
    loadParts();
  } catch (e) { toast(e.message, 'error'); }
}

async function deletePart(id) {
  if (!confirmDialog('Delete this part permanently?')) return;
  try { await api(`/api/parts/${id}`, 'DELETE'); toast('Part deleted.'); loadParts(); }
  catch (e) { toast(e.message, 'error'); }
}

// ── BILLING ───────────────────────────────────────────────────────────────────
let billItems = [];

function initBilling() {
  billItems = [];
  document.getElementById('bill-customer').value = '';
  document.getElementById('bill-phone').value    = '';
  document.getElementById('bill-part-search').value = '';
  renderBillItems();
}

let billSearchDebounce;
async function searchBillParts(q) {
  const dd = document.getElementById('bill-part-dropdown');
  clearTimeout(billSearchDebounce);
  if (!q.trim()) { dd.style.display = 'none'; return; }
  billSearchDebounce = setTimeout(async () => {
    try {
      const parts = await api(`/api/parts/search?q=${encodeURIComponent(q)}`);
      dd.innerHTML = parts.length
        ? parts.map(p => `
          <div class="dropdown-item" onclick="addToBill(${p.part_id},'${p.name.replace(/'/g,"\\'")}','${p.part_number || ''}',${p.price},${p.quantity})">
            <div class="dropdown-item-name">${p.name}</div>
            <div class="dropdown-item-meta">${p.part_number || ''} | Stock: ${p.quantity} | ${fmt(p.price)}</div>
          </div>`)
          .join('')
        : '<div class="dropdown-item dropdown-item-meta">No results found</div>';
      dd.style.display = 'block';
    } catch {}
  }, 300);
}

document.addEventListener('click', e => {
  if (!e.target.closest('#bill-part-search') && !e.target.closest('#bill-part-dropdown'))
    document.getElementById('bill-part-dropdown').style.display = 'none';
});

function addToBill(id, name, partNum, price, stock) {
  const existing = billItems.find(i => i.part_id === id);
  if (existing) {
    if (existing.quantity >= stock) return toast('Not enough stock', 'error');
    existing.quantity++;
    existing.total = existing.quantity * existing.price;
  } else {
    if (stock < 1) return toast('Out of stock', 'error');
    billItems.push({ part_id: id, part_name: name, part_num: partNum, price, quantity: 1, total: price, stock });
  }
  document.getElementById('bill-part-search').value = '';
  document.getElementById('bill-part-dropdown').style.display = 'none';
  renderBillItems();
}

function updateBillItem(idx, field, val) {
  const item = billItems[idx];
  if (!item) return;
  if (field === 'qty') {
    const q = Math.max(1, Math.min(parseInt(val) || 1, item.stock));
    item.quantity = q;
  } else if (field === 'price') {
    item.price = Math.max(0, parseFloat(val) || 0);
  }
  item.total = item.quantity * item.price;
  updateBillTotal();
}

function removeBillItem(idx) { billItems.splice(idx, 1); renderBillItems(); }

function clearBill() { if (confirmDialog('Clear all items?')) initBilling(); }

function renderBillItems() {
  const tb = document.getElementById('bill-items-body');
  if (!billItems.length) {
    tb.innerHTML = '<tr><td colspan="5" class="loading-cell">No items added yet</td></tr>';
    updateBillTotal(); return;
  }
  tb.innerHTML = billItems.map((it, i) => `
    <tr>
      <td><b>${it.part_name}</b><br><small>${it.part_num || ''}</small></td>
      <td><input type="number" value="${it.quantity}" min="1" max="${it.stock}" style="width:60px;padding:4px 8px;border:1.5px solid var(--border);border-radius:6px"
           onchange="updateBillItem(${i},'qty',this.value);renderBillItems()"/></td>
      <td><input type="number" value="${it.price}" min="0" step="0.01" style="width:90px;padding:4px 8px;border:1.5px solid var(--border);border-radius:6px"
           onchange="updateBillItem(${i},'price',this.value);renderBillItems()"/></td>
      <td><b>${fmt(it.total)}</b></td>
      <td><button class="btn-icon delete" onclick="removeBillItem(${i})"><i data-lucide="x"></i></button></td>
    </tr>`).join('');
  updateBillTotal();
  initIcons();
}

function updateBillTotal() {
  const total = billItems.reduce((s, i) => s + i.total, 0);
  document.getElementById('bill-total').textContent = fmt(total);
}

async function submitBill() {
  if (!billItems.length) return toast('Add at least one part', 'error');
  const body = {
    customer_name: document.getElementById('bill-customer').value.trim() || 'Walk-in',
    phone:         document.getElementById('bill-phone').value.trim(),
    items: billItems.map(i => ({
      part_id: i.part_id, part_name: i.part_name, part_num: i.part_num,
      quantity: i.quantity, price: i.price
    }))
  };
  try {
    const bill = await api('/api/billing', 'POST', body);
    toast('Bill created successfully!');
    printInvoice(bill);
    initBilling();
  } catch (e) { toast(e.message, 'error'); }
}

// ── BILL HISTORY ──────────────────────────────────────────────────────────────
async function loadBills() {
  const date = document.getElementById('bills-date-filter').value;
  try {
    const bills = await api(`/api/billing?date=${date}`);
    const tb    = document.getElementById('bills-body');
    tb.innerHTML = bills.length ? bills.map(b => `
      <tr>
        <td><span class="badge badge-blue">${b.bill_number}</span></td>
        <td>${b.date}</td>
        <td>${b.customer_name}</td>
        <td>${b.phone || '-'}</td>
        <td>${b.item_count}</td>
        <td><b>${fmt(b.total)}</b></td>
        <td style="display:flex;gap:4px">
          <button class="btn-icon edit"   onclick="viewBill(${b.bill_id})"    title="View">👁️</button>
          <button class="btn-icon edit"   onclick="reprintBill(${b.bill_id})" title="Print">🖨️</button>
          <button class="btn-icon delete" onclick="deleteBill(${b.bill_id})"  title="Delete">🗑️</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="7" class="loading-cell">No bills for this date</td></tr>';
    initIcons();
  } catch (e) { toast(e.message, 'error'); }
}

async function viewBill(id) {
  try {
    const bill = await api(`/api/billing/${id}`);
    document.getElementById('bill-detail-title').textContent = `Bill ${bill.bill_number}`;
    document.getElementById('bill-detail-content').innerHTML = `
      <div style="padding:1.25rem">
        <p><b>Customer:</b> ${bill.customer_name} | <b>Phone:</b> ${bill.phone || '-'}</p>
        <p><b>Date:</b> ${bill.date} | <b>Staff:</b> ${bill.created_by_name || '-'}</p>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Part</th><th>Part No.</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>${bill.items.map(i => `
            <tr><td>${i.part_name}</td><td>${i.part_num||'-'}</td>
                <td>${i.quantity}</td><td>${fmt(i.price)}</td><td>${fmt(i.total)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:1rem;text-align:right;font-size:1.1rem;font-weight:800">Grand Total: ${fmt(bill.total)}</div>`;
    openModal('modal-bill-detail');
    window._currentBillForPrint = bill;
  } catch (e) { toast(e.message, 'error'); }
}

function printBillDetail() {
  if (window._currentBillForPrint) printInvoice(window._currentBillForPrint);
}

async function reprintBill(id) {
  try { const bill = await api(`/api/billing/${id}`); printInvoice(bill); }
  catch (e) { toast(e.message, 'error'); }
}

async function deleteBill(id) {
  if (!confirmDialog('Delete this bill? Stock will be restored.')) return;
  try {
    await api(`/api/billing/${id}`, 'DELETE');
    toast('Bill deleted & stock restored.');
    loadBills();
  } catch (e) { toast(e.message, 'error'); }
}

// ── LOW STOCK ─────────────────────────────────────────────────────────────────
async function loadLowStock() {
  try {
    const parts = await api('/api/parts/low-stock');
    const tb    = document.getElementById('lowstock-body');
    tb.innerHTML = parts.length ? parts.map(p => {
      const cls = p.quantity === 0 ? 'badge-red' : 'badge-amber';
      const loc = [p.rack, p.shelf, p.box].filter(Boolean).join(' › ') || '-';
      return `<tr>
        <td><b>${p.name}</b></td>
        <td><code>${loc}</code></td>
        <td><span class="badge ${cls}">${p.quantity}</span></td>
        <td>${p.min_quantity}</td>
        <td>${p.supplier || '-'}</td>
        <td><button class="btn-sm btn-primary" onclick="openQtyModal(${p.part_id},'${p.name.replace(/'/g,"\\'")}',${p.quantity})">
          # Update Qty</button></td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="loading-cell" style="color:var(--green)">✅ All parts are adequately stocked!</td></tr>';
    initIcons();
  } catch (e) { toast(e.message, 'error'); }
}

// ── REPORTS ───────────────────────────────────────────────────────────────────
async function loadReport() {
  const date = document.getElementById('report-date').value;
  if (!date) return;
  try {
    const data = await api(`/api/sales/report/${date}`);
    animateCount('rep-sales', data.summary.total_sales, true);
    animateCount('rep-bills', data.summary.bill_count);
    animateCount('rep-items', data.summary.items_sold);

    const tb = document.getElementById('report-body');
    tb.innerHTML = data.bills.length ? data.bills.map(b => `
      <tr>
        <td><span class="badge badge-blue">${b.bill_number}</span></td>
        <td>${b.customer_name}</td>
        <td>${b.item_count}</td>
        <td><b>${fmt(b.total)}</b></td>
        <td>${b.created_by_name || '-'}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="loading-cell">No bills for this date</td></tr>';
    initIcons();
  } catch (e) { toast(e.message, 'error'); }
}

function printReport() { window.print(); }

// ── PART FINDER ───────────────────────────────────────────────────────────────
async function runFinder() {
  const q   = document.getElementById('finder-input').value.trim();
  const res = document.getElementById('finder-results');
  if (!q) { res.innerHTML = ''; return; }
  try {
    const parts = await api(`/api/parts/search?q=${encodeURIComponent(q)}`);
    res.innerHTML = parts.length ? parts.map(p => {
      const loc = [p.category_name, p.subcategory, p.rack, p.shelf, p.box].filter(Boolean).join(' › ');
      const stockCls = p.quantity === 0 ? 'badge-red' : p.quantity <= p.min_quantity ? 'badge-amber' : 'badge-green';
      return `<div class="finder-card">
        <div>
          <div style="font-weight:700;color:var(--text-h)">${p.name}</div>
          <div class="finder-card-loc">${loc || 'No location set'}</div>
          ${p.part_number ? `<div style="font-size:.75rem;color:var(--text-m)">Part#: ${p.part_number}</div>` : ''}
        </div>
        <div class="finder-card-right">
          <div class="finder-qty"><span class="badge ${stockCls}">${p.quantity}</span></div>
          <div class="finder-price">${fmt(p.price)}</div>
        </div>
      </div>`;
    }).join('') : '<div style="text-align:center;color:var(--text-m);padding:2rem">No parts found for "' + q + '"</div>';
  } catch (e) { toast(e.message, 'error'); }
}

// ── PRINT INVOICE ─────────────────────────────────────────────────────────────
function printInvoice(bill) {
  const items = bill.items || [];
  const html  = `
    <div id="invoice-print" style="display:block">
      <div class="inv-header">
        <div>
          <div class="inv-shop-name">TVS Authorized Spare Parts</div>
          <div class="inv-shop-info">Your Shop Address, City — Phone: 9999999999</div>
          <div class="inv-shop-info">GSTIN: XXXXXXXXXXXXXXXXX</div>
        </div>
        <div class="inv-bill-info">
          <div><b>Bill No:</b> ${bill.bill_number}</div>
          <div><b>Date:</b> ${bill.date}</div>
          <div><b>Time:</b> ${new Date(bill.created_at).toLocaleTimeString('en-IN')}</div>
        </div>
      </div>
      <hr class="inv-divider"/>
      <div><b>Customer:</b> ${bill.customer_name} &nbsp;|&nbsp; <b>Phone:</b> ${bill.phone || '-'}</div>
      <hr class="inv-divider"/>
      <table class="inv-table">
        <thead><tr><th>#</th><th>Part Name</th><th>Part No.</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
        <tbody>
          ${items.map((it, i) => `<tr>
            <td>${i + 1}</td><td>${it.part_name}</td><td>${it.part_num || '-'}</td>
            <td>${it.quantity}</td><td>${fmt(it.price)}</td><td>${fmt(it.total)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="inv-total">Grand Total: ${fmt(bill.total)}</div>
      <div class="inv-terms">* Goods once sold will not be returned. Warranty as per manufacturer terms.</div>
      <div class="inv-sigs">
        <div class="inv-sig-box">Customer Signature</div>
        <div class="inv-sig-box">Cashier</div>
        <div class="inv-sig-box">Manager</div>
      </div>
    </div>`;

  const orig = document.body.innerHTML;
  document.body.innerHTML = html;
  window.print();
  document.body.innerHTML = orig;
  initIcons();
  showPage('billing');
}