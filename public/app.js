/* ============================================
   DynAds - Dynamic Location-Aware Advertising
   Complete SPA Application
   ============================================ */

// Use relative API path so we can deploy behind a proxy or different host
const API = (window.API_BASE || '') + '/api';
const WS_URL = (window.WS_BASE || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host) + '/ws';
let token = localStorage.getItem('token');
let currentUser = null;
let currentSection = 'dashboard';

// ============ CORE UTILITIES ============

async function api(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${endpoint}`, opts);
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || data.message || 'Request failed');
    e.status = res.status;
    throw e;
  }
  return data;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: 'check_circle', error: 'error', info: 'info', warning: 'warning' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="material-icons">${icons[type] || 'info'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatNumber(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString();
}

function statusBadge(status) {
  if (!status) return '';
  const s = String(status).toLowerCase();
  const cls = s === 'active' ? 'active' : s === 'inactive' ? 'inactive' : s === 'maintenance' ? 'maintenance'
    : s === 'paused' ? 'paused' : s === 'completed' ? 'completed' : s === 'draft' ? 'draft'
    : s === 'displayed' ? 'displayed' : s === 'error' ? 'error' : 'inactive';
  return `<span class="badge badge-${cls}">${status}</span>`;
}

function showLoading() {
  return '<div class="spinner-wrap"><div class="spinner"></div></div>';
}

function emptyState(icon, title, desc) {
  return `<div class="empty-state"><span class="material-icons">${icon}</span><h3>${title}</h3><p>${desc}</p></div>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============ NAVIGATION ============

function navigate(section, id = null) {
  currentSection = section;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section);
  });
  const titles = {
    dashboard: 'Dashboard', trucks: 'Trucks', gps: 'GPS Tracking', neighborhoods: 'Neighborhoods',
    campaigns: 'Campaigns', headlines: 'Headlines', billboard: 'Billboard Display', analytics: 'Analytics',
    demographics: 'Demographics', 'ai-generator': 'AI Generator', 'ai-logs': 'AI Logs',
    geofences: 'Geofences', 'brand-safety': 'Brand Safety', 'weather-aware': 'Weather Headlines',
    heatmap: 'Heatmap', 'live-billboard': 'Live Billboard',
    'budget-allocate': 'Budget Allocator', 'demand-forecast': 'Demand Forecast',
    'dynamic-pricing': 'Dynamic Pricing',
    'route-arbitrage': 'Route Impression Arbitrage',
  };
  document.getElementById('topbar-title').textContent = titles[section] || section;
  const content = document.getElementById('content');
  content.innerHTML = showLoading();

  const renderers = {
    dashboard: renderDashboard,
    trucks: id ? () => renderTruckDetail(id) : renderTrucksList,
    gps: id ? () => renderGpsDetail(id) : renderGpsList,
    neighborhoods: id ? () => renderNeighborhoodDetail(id) : renderNeighborhoodsList,
    campaigns: id ? () => renderCampaignDetail(id) : renderCampaignsList,
    headlines: id ? () => renderHeadlineDetail(id) : renderHeadlinesList,
    billboard: renderBillboard,
    analytics: id ? () => renderAnalyticsDetail(id) : renderAnalyticsList,
    demographics: id ? () => renderDemographicDetail(id) : renderDemographicsList,
    'ai-generator': renderAiGenerator,
    'ai-logs': id ? () => renderAiLogDetail(id) : renderAiLogsList,
    geofences: renderGeofences,
    'brand-safety': renderBrandSafety,
    'weather-aware': renderWeatherAware,
    heatmap: renderHeatmap,
    'live-billboard': renderLiveBillboard,
    'budget-allocate': renderBudgetAllocate,
    'demand-forecast': renderDemandForecast,
    'dynamic-pricing': renderDynamicPricing,
    'route-arbitrage': renderRouteArbitrage,
  };

  const render = renderers[section];
  if (render) render();
  else content.innerHTML = emptyState('construction', 'Coming Soon', 'This section is under development.');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ============ LOGIN / AUTH ============

function showLogin() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function hideLogin() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

async function handleLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm"></div> Signing in...';
  try {
    const data = await api('/auth/login', 'POST', { email, password });
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user || { email };
    document.getElementById('user-name').textContent = currentUser.name || currentUser.email;
    hideLogin();
    navigate('dashboard');
    showToast('Welcome back!', 'success');
  } catch (err) {
    showToast(err.message || 'Login failed', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">login</span> Sign In';
  }
}

function quickLogin() {
  document.getElementById('login-email').value = 'admin@dynamicads.com';
  document.getElementById('login-password').value = 'password123';
  handleLogin();
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  showLogin();
}

async function checkAuth() {
  if (!token) { showLogin(); return; }
  try {
    const data = await api('/auth/me');
    currentUser = data.user || data;
    document.getElementById('user-name').textContent = currentUser.name || currentUser.email || 'Admin';
    hideLogin();
    navigate('dashboard');
  } catch {
    showLogin();
  }
}

// ============ MODAL ============

function renderModal(title, bodyHtml, onSave, saveLabel = 'Save') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  const footer = document.getElementById('modal-footer');
  footer.innerHTML = `
    <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" id="modal-save-btn">${saveLabel}</button>
  `;
  if (onSave) {
    document.getElementById('modal-save-btn').onclick = async () => {
      const btn = document.getElementById('modal-save-btn');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner spinner-sm"></div> Saving...';
      try { await onSave(); closeModal(); } catch (err) { showToast(err.message, 'error'); btn.disabled = false; btn.innerHTML = saveLabel; }
    };
  }
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function confirmAction(message, onConfirm) {
  renderModal('Confirm', `<p style="font-size:0.95rem;">${message}</p>`, async () => { await onConfirm(); }, 'Confirm');
}

// ============ DASHBOARD ============

async function renderDashboard() {
  const content = document.getElementById('content');
  let trucks = [], campaigns = [], headlines = [], gps = [];
  try {
    [trucks, campaigns, headlines, gps] = await Promise.all([
      api('/trucks').catch(() => []),
      api('/campaigns').catch(() => []),
      api('/headlines').catch(() => []),
      api('/gps').catch(() => []),
    ]);
    if (trucks.data) trucks = trucks.data;
    if (campaigns.data) campaigns = campaigns.data;
    if (headlines.data) headlines = headlines.data;
    if (gps.data) gps = gps.data;
    if (!Array.isArray(trucks)) trucks = [];
    if (!Array.isArray(campaigns)) campaigns = [];
    if (!Array.isArray(headlines)) headlines = [];
    if (!Array.isArray(gps)) gps = [];
  } catch {}

  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions || c.total_impressions || 0), 0);

  content.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon primary"><span class="material-icons">local_shipping</span></div>
        <div class="stat-info"><div class="stat-value">${formatNumber(trucks.length)}</div><div class="stat-label">Total Trucks</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon success"><span class="material-icons">campaign</span></div>
        <div class="stat-info"><div class="stat-value">${formatNumber(activeCampaigns)}</div><div class="stat-label">Active Campaigns</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon warning"><span class="material-icons">visibility</span></div>
        <div class="stat-info"><div class="stat-value">${formatNumber(totalImpressions)}</div><div class="stat-label">Total Impressions</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon info"><span class="material-icons">auto_awesome</span></div>
        <div class="stat-info"><div class="stat-value">${formatNumber(headlines.length)}</div><div class="stat-label">Headlines Generated</div></div>
      </div>
    </div>
    <div class="quick-actions mb-6">
      <button class="btn btn-primary" onclick="navigate('ai-generator')"><span class="material-icons">auto_awesome</span> Generate New Headline</button>
      <button class="btn btn-success" onclick="showTruckForm()"><span class="material-icons">add</span> Add Truck</button>
      <button class="btn btn-warning" onclick="showCampaignForm()"><span class="material-icons">add</span> New Campaign</button>
    </div>
    <div class="dashboard-grid">
      <div class="card">
        <div class="card-header"><h3>Recent Headlines</h3></div>
        <div class="card-body">
          ${headlines.length === 0 ? '<p class="text-muted text-sm">No headlines yet</p>' :
            `<ul class="activity-list">${headlines.slice(-5).reverse().map(h => `
              <li class="activity-item" style="cursor:pointer" onclick="navigate('headlines', ${h.id})">
                <div class="activity-icon" style="background:var(--primary-glow);color:var(--primary-hover)"><span class="material-icons">title</span></div>
                <div><div class="activity-text">${escapeHtml(h.headline_text || h.content || 'Headline #' + h.id)}</div>
                <div class="activity-time">${formatDate(h.created_at)}</div></div>
              </li>`).join('')}</ul>`}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Recent GPS Updates</h3></div>
        <div class="card-body">
          ${gps.length === 0 ? '<p class="text-muted text-sm">No GPS data yet</p>' :
            `<ul class="activity-list">${gps.slice(-5).reverse().map(g => `
              <li class="activity-item" style="cursor:pointer" onclick="navigate('gps', ${g.id})">
                <div class="activity-icon" style="background:var(--success-bg);color:var(--success)"><span class="material-icons">gps_fixed</span></div>
                <div><div class="activity-text">Truck #${g.truck_id} - ${g.latitude ? g.latitude.toFixed(4) + ', ' + g.longitude.toFixed(4) : 'Location update'}</div>
                <div class="activity-time">${formatDate(g.timestamp || g.created_at)}</div></div>
              </li>`).join('')}</ul>`}
        </div>
      </div>
    </div>
  `;
}

// ============ TRUCKS ============

async function renderTrucksList() {
  const content = document.getElementById('content');
  try {
    let trucks = await api('/trucks');
    if (trucks.data) trucks = trucks.data;
    if (!Array.isArray(trucks)) trucks = [];

    content.innerHTML = `
      <div class="section-header">
        <h2>Trucks</h2>
        <div class="section-actions">
          <div class="search-input"><span class="material-icons">search</span><input type="text" placeholder="Search trucks..." oninput="filterTable(this, 'trucks-table')"></div>
          <button class="btn btn-primary" onclick="showTruckForm()"><span class="material-icons">add</span> Add Truck</button>
        </div>
      </div>
      <div class="card"><div class="card-body no-pad"><div class="table-wrap">
        <table id="trucks-table">
          <thead><tr><th>ID</th><th>Name</th><th>Plate Number</th><th>Status</th><th>Driver</th><th>Created</th></tr></thead>
          <tbody>${trucks.length === 0 ? '<tr><td colspan="6">' + emptyState('local_shipping', 'No Trucks', 'Add your first truck to get started.') + '</td></tr>' :
            trucks.map(t => `<tr onclick="navigate('trucks', ${t.id})">
              <td>${t.id}</td>
              <td><strong>${escapeHtml(t.name || t.truck_name || '-')}</strong></td>
              <td>${escapeHtml(t.plate_number || t.license_plate || '-')}</td>
              <td>${statusBadge(t.status || 'active')}</td>
              <td>${escapeHtml(t.driver_name || t.driver || '-')}</td>
              <td>${formatDateShort(t.created_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function renderTruckDetail(id) {
  const content = document.getElementById('content');
  try {
    const truck = await api(`/trucks/${id}`);
    const t = truck.data || truck;
    let gps = [];
    try { let g = await api(`/gps?truck_id=${id}`); gps = g.data || g || []; } catch {}
    if (!Array.isArray(gps)) gps = [];

    content.innerHTML = `
      <div class="detail-view">
        <div class="detail-header">
          <button class="btn-back" onclick="navigate('trucks')"><span class="material-icons">arrow_back</span></button>
          <h2>${escapeHtml(t.name || t.truck_name || 'Truck #' + t.id)}</h2>
          <div class="section-actions">
            <button class="btn btn-primary btn-sm" onclick='showTruckForm(${JSON.stringify(t)})'><span class="material-icons">edit</span> Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteTruck(${t.id})"><span class="material-icons">delete</span> Delete</button>
          </div>
        </div>
        <div class="detail-grid">
          <div class="card"><div class="card-body">
            <div class="detail-field"><div class="detail-field-label">ID</div><div class="detail-field-value">${t.id}</div></div>
            <div class="detail-field"><div class="detail-field-label">Name</div><div class="detail-field-value">${escapeHtml(t.name || t.truck_name || '-')}</div></div>
            <div class="detail-field"><div class="detail-field-label">Plate Number</div><div class="detail-field-value">${escapeHtml(t.plate_number || t.license_plate || '-')}</div></div>
            <div class="detail-field"><div class="detail-field-label">Status</div><div class="detail-field-value">${statusBadge(t.status || 'active')}</div></div>
            <div class="detail-field"><div class="detail-field-label">Driver</div><div class="detail-field-value">${escapeHtml(t.driver_name || t.driver || '-')}</div></div>
            <div class="detail-field"><div class="detail-field-label">Billboard Size</div><div class="detail-field-value">${escapeHtml(t.billboard_size || '-')}</div></div>
            <div class="detail-field"><div class="detail-field-label">Created</div><div class="detail-field-value">${formatDate(t.created_at)}</div></div>
            <div class="detail-field"><div class="detail-field-label">Updated</div><div class="detail-field-value">${formatDate(t.updated_at)}</div></div>
          </div></div>
          <div class="card"><div class="card-header"><h3>GPS History</h3></div><div class="card-body">
            ${gps.length === 0 ? '<p class="text-muted text-sm">No GPS data for this truck.</p>' :
              `<ul class="activity-list">${gps.slice(-10).reverse().map(g => `
                <li class="activity-item"><div class="activity-icon" style="background:var(--success-bg);color:var(--success)"><span class="material-icons">location_on</span></div>
                <div><div class="activity-text">${g.latitude ? Number(g.latitude).toFixed(5) + ', ' + Number(g.longitude).toFixed(5) : 'Position update'}${g.speed ? ' | ' + g.speed + ' mph' : ''}</div>
                <div class="activity-time">${formatDate(g.timestamp || g.created_at)}</div></div></li>
              `).join('')}</ul>`}
          </div></div>
        </div>
      </div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

function showTruckForm(truck = null) {
  const isEdit = !!truck;
  const html = `
    <div class="form-group"><label>Truck Name</label><input type="text" id="f-truck-name" value="${escapeHtml(truck?.name || truck?.truck_name || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Plate Number</label><input type="text" id="f-truck-plate" value="${escapeHtml(truck?.plate_number || truck?.license_plate || '')}"></div>
      <div class="form-group"><label>Status</label><select id="f-truck-status">
        <option value="active" ${truck?.status === 'active' ? 'selected' : ''}>Active</option>
        <option value="inactive" ${truck?.status === 'inactive' ? 'selected' : ''}>Inactive</option>
        <option value="maintenance" ${truck?.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
      </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Driver Name</label><input type="text" id="f-truck-driver" value="${escapeHtml(truck?.driver_name || truck?.driver || '')}"></div>
      <div class="form-group"><label>Billboard Size</label><input type="text" id="f-truck-billboard" value="${escapeHtml(truck?.billboard_size || '')}" placeholder="e.g. 10x20 ft"></div>
    </div>
  `;
  renderModal(isEdit ? 'Edit Truck' : 'Add Truck', html, async () => {
    const body = {
      name: document.getElementById('f-truck-name').value,
      truck_name: document.getElementById('f-truck-name').value,
      plate_number: document.getElementById('f-truck-plate').value,
      license_plate: document.getElementById('f-truck-plate').value,
      status: document.getElementById('f-truck-status').value,
      driver_name: document.getElementById('f-truck-driver').value,
      driver: document.getElementById('f-truck-driver').value,
      billboard_size: document.getElementById('f-truck-billboard').value,
    };
    if (isEdit) await api(`/trucks/${truck.id}`, 'PUT', body);
    else await api('/trucks', 'POST', body);
    showToast(isEdit ? 'Truck updated' : 'Truck created', 'success');
    navigate('trucks');
  });
}

async function deleteTruck(id) {
  confirmAction('Are you sure you want to delete this truck?', async () => {
    await api(`/trucks/${id}`, 'DELETE');
    showToast('Truck deleted', 'success');
    navigate('trucks');
  });
}

// ============ GPS TRACKING ============

async function renderGpsList() {
  const content = document.getElementById('content');
  try {
    let gps = await api('/gps');
    if (gps.data) gps = gps.data;
    if (!Array.isArray(gps)) gps = [];

    content.innerHTML = `
      <div class="section-header">
        <h2>GPS Tracking</h2>
        <div class="section-actions">
          <div class="search-input"><span class="material-icons">search</span><input type="text" placeholder="Search GPS..." oninput="filterTable(this, 'gps-table')"></div>
          <button class="btn btn-primary" onclick="showGpsForm()"><span class="material-icons">add</span> Add GPS Entry</button>
        </div>
      </div>
      <div class="card"><div class="card-body no-pad"><div class="table-wrap">
        <table id="gps-table">
          <thead><tr><th>ID</th><th>Truck ID</th><th>Latitude</th><th>Longitude</th><th>Speed</th><th>Heading</th><th>Timestamp</th></tr></thead>
          <tbody>${gps.length === 0 ? '<tr><td colspan="7">' + emptyState('gps_off', 'No GPS Data', 'No GPS tracking data recorded yet.') + '</td></tr>' :
            gps.map(g => `<tr onclick="navigate('gps', ${g.id})">
              <td>${g.id}</td>
              <td>Truck #${g.truck_id}</td>
              <td>${g.latitude ? Number(g.latitude).toFixed(5) : '-'}</td>
              <td>${g.longitude ? Number(g.longitude).toFixed(5) : '-'}</td>
              <td>${g.speed != null ? g.speed + ' mph' : '-'}</td>
              <td>${g.heading != null ? g.heading + '°' : '-'}</td>
              <td>${formatDate(g.timestamp || g.created_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function renderGpsDetail(id) {
  const content = document.getElementById('content');
  try {
    const gps = await api(`/gps/${id}`);
    const g = gps.data || gps;
    content.innerHTML = `
      <div class="detail-view">
        <div class="detail-header">
          <button class="btn-back" onclick="navigate('gps')"><span class="material-icons">arrow_back</span></button>
          <h2>GPS Entry #${g.id}</h2>
          <div class="section-actions">
            <button class="btn btn-primary btn-sm" onclick='showGpsForm(${JSON.stringify(g)})'><span class="material-icons">edit</span> Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteGps(${g.id})"><span class="material-icons">delete</span> Delete</button>
          </div>
        </div>
        <div class="card"><div class="card-body">
          <div class="detail-grid">
            <div>
              <div class="detail-field"><div class="detail-field-label">ID</div><div class="detail-field-value">${g.id}</div></div>
              <div class="detail-field"><div class="detail-field-label">Truck ID</div><div class="detail-field-value">${g.truck_id}</div></div>
              <div class="detail-field"><div class="detail-field-label">Latitude</div><div class="detail-field-value">${g.latitude || '-'}</div></div>
              <div class="detail-field"><div class="detail-field-label">Longitude</div><div class="detail-field-value">${g.longitude || '-'}</div></div>
            </div>
            <div>
              <div class="detail-field"><div class="detail-field-label">Speed</div><div class="detail-field-value">${g.speed != null ? g.speed + ' mph' : '-'}</div></div>
              <div class="detail-field"><div class="detail-field-label">Heading</div><div class="detail-field-value">${g.heading != null ? g.heading + '°' : '-'}</div></div>
              <div class="detail-field"><div class="detail-field-label">Neighborhood</div><div class="detail-field-value">${escapeHtml(g.neighborhood_name || g.neighborhood || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Timestamp</div><div class="detail-field-value">${formatDate(g.timestamp || g.created_at)}</div></div>
            </div>
          </div>
        </div></div>
      </div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

function showGpsForm(gps = null) {
  const isEdit = !!gps;
  const html = `
    <div class="form-row">
      <div class="form-group"><label>Truck ID</label><input type="number" id="f-gps-truck" value="${gps?.truck_id || ''}"></div>
      <div class="form-group"><label>Speed</label><input type="number" id="f-gps-speed" value="${gps?.speed || ''}" step="0.1"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Latitude</label><input type="number" id="f-gps-lat" value="${gps?.latitude || ''}" step="0.00001"></div>
      <div class="form-group"><label>Longitude</label><input type="number" id="f-gps-lng" value="${gps?.longitude || ''}" step="0.00001"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Heading</label><input type="number" id="f-gps-heading" value="${gps?.heading || ''}" step="1" min="0" max="360"></div>
      <div class="form-group"><label>Timestamp</label><input type="datetime-local" id="f-gps-ts" value="${gps?.timestamp ? new Date(gps.timestamp).toISOString().slice(0,16) : ''}"></div>
    </div>
  `;
  renderModal(isEdit ? 'Edit GPS Entry' : 'Add GPS Entry', html, async () => {
    const body = {
      truck_id: parseInt(document.getElementById('f-gps-truck').value),
      latitude: parseFloat(document.getElementById('f-gps-lat').value),
      longitude: parseFloat(document.getElementById('f-gps-lng').value),
      speed: parseFloat(document.getElementById('f-gps-speed').value) || 0,
      heading: parseFloat(document.getElementById('f-gps-heading').value) || 0,
      timestamp: document.getElementById('f-gps-ts').value || new Date().toISOString(),
    };
    if (isEdit) await api(`/gps/${gps.id}`, 'PUT', body);
    else await api('/gps', 'POST', body);
    showToast(isEdit ? 'GPS entry updated' : 'GPS entry created', 'success');
    navigate('gps');
  });
}

async function deleteGps(id) {
  confirmAction('Delete this GPS entry?', async () => {
    await api(`/gps/${id}`, 'DELETE');
    showToast('GPS entry deleted', 'success');
    navigate('gps');
  });
}

// ============ NEIGHBORHOODS ============

async function renderNeighborhoodsList() {
  const content = document.getElementById('content');
  try {
    let items = await api('/neighborhoods');
    if (items.data) items = items.data;
    if (!Array.isArray(items)) items = [];

    content.innerHTML = `
      <div class="section-header">
        <h2>Neighborhoods</h2>
        <div class="section-actions">
          <div class="search-input"><span class="material-icons">search</span><input type="text" placeholder="Search neighborhoods..." oninput="filterTable(this, 'neighborhoods-table')"></div>
          <button class="btn btn-primary" onclick="showNeighborhoodForm()"><span class="material-icons">add</span> Add Neighborhood</button>
        </div>
      </div>
      <div class="card"><div class="card-body no-pad"><div class="table-wrap">
        <table id="neighborhoods-table">
          <thead><tr><th>ID</th><th>Name</th><th>City</th><th>State</th><th>Population</th><th>Avg Income</th><th>Status</th></tr></thead>
          <tbody>${items.length === 0 ? '<tr><td colspan="7">' + emptyState('location_city', 'No Neighborhoods', 'Add neighborhoods to target ads.') + '</td></tr>' :
            items.map(n => `<tr onclick="navigate('neighborhoods', ${n.id})">
              <td>${n.id}</td>
              <td><strong>${escapeHtml(n.name || n.neighborhood_name || '-')}</strong></td>
              <td>${escapeHtml(n.city || '-')}</td>
              <td>${escapeHtml(n.state || '-')}</td>
              <td>${formatNumber(n.population)}</td>
              <td>${n.avg_income || n.average_income ? '$' + formatNumber(n.avg_income || n.average_income) : '-'}</td>
              <td>${statusBadge(n.status || 'active')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function renderNeighborhoodDetail(id) {
  const content = document.getElementById('content');
  try {
    const res = await api(`/neighborhoods/${id}`);
    const n = res.data || res;
    content.innerHTML = `
      <div class="detail-view">
        <div class="detail-header">
          <button class="btn-back" onclick="navigate('neighborhoods')"><span class="material-icons">arrow_back</span></button>
          <h2>${escapeHtml(n.name || n.neighborhood_name || 'Neighborhood #' + n.id)}</h2>
          <div class="section-actions">
            <button class="btn btn-primary btn-sm" onclick='showNeighborhoodForm(${JSON.stringify(n)})'><span class="material-icons">edit</span> Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteNeighborhood(${n.id})"><span class="material-icons">delete</span> Delete</button>
          </div>
        </div>
        <div class="card"><div class="card-body">
          <div class="detail-grid">
            <div>
              <div class="detail-field"><div class="detail-field-label">ID</div><div class="detail-field-value">${n.id}</div></div>
              <div class="detail-field"><div class="detail-field-label">Name</div><div class="detail-field-value">${escapeHtml(n.name || n.neighborhood_name || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">City</div><div class="detail-field-value">${escapeHtml(n.city || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">State</div><div class="detail-field-value">${escapeHtml(n.state || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Zip Code</div><div class="detail-field-value">${escapeHtml(n.zip_code || n.zipcode || '-')}</div></div>
            </div>
            <div>
              <div class="detail-field"><div class="detail-field-label">Population</div><div class="detail-field-value">${formatNumber(n.population)}</div></div>
              <div class="detail-field"><div class="detail-field-label">Avg Income</div><div class="detail-field-value">${n.avg_income || n.average_income ? '$' + formatNumber(n.avg_income || n.average_income) : '-'}</div></div>
              <div class="detail-field"><div class="detail-field-label">Avg Age</div><div class="detail-field-value">${n.avg_age || n.average_age || '-'}</div></div>
              <div class="detail-field"><div class="detail-field-label">Primary Demographic</div><div class="detail-field-value">${escapeHtml(n.primary_demographic || n.demographics || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Status</div><div class="detail-field-value">${statusBadge(n.status || 'active')}</div></div>
            </div>
          </div>
        </div></div>
      </div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

function showNeighborhoodForm(item = null) {
  const isEdit = !!item;
  const html = `
    <div class="form-group"><label>Name</label><input type="text" id="f-nh-name" value="${escapeHtml(item?.name || item?.neighborhood_name || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label>City</label><input type="text" id="f-nh-city" value="${escapeHtml(item?.city || '')}"></div>
      <div class="form-group"><label>State</label><input type="text" id="f-nh-state" value="${escapeHtml(item?.state || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Zip Code</label><input type="text" id="f-nh-zip" value="${escapeHtml(item?.zip_code || item?.zipcode || '')}"></div>
      <div class="form-group"><label>Population</label><input type="number" id="f-nh-pop" value="${item?.population || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Avg Income</label><input type="number" id="f-nh-income" value="${item?.avg_income || item?.average_income || ''}"></div>
      <div class="form-group"><label>Avg Age</label><input type="number" id="f-nh-age" value="${item?.avg_age || item?.average_age || ''}"></div>
    </div>
    <div class="form-group"><label>Primary Demographic</label><input type="text" id="f-nh-demo" value="${escapeHtml(item?.primary_demographic || item?.demographics || '')}"></div>
  `;
  renderModal(isEdit ? 'Edit Neighborhood' : 'Add Neighborhood', html, async () => {
    const body = {
      name: document.getElementById('f-nh-name').value,
      neighborhood_name: document.getElementById('f-nh-name').value,
      city: document.getElementById('f-nh-city').value,
      state: document.getElementById('f-nh-state').value,
      zip_code: document.getElementById('f-nh-zip').value,
      zipcode: document.getElementById('f-nh-zip').value,
      population: parseInt(document.getElementById('f-nh-pop').value) || 0,
      avg_income: parseInt(document.getElementById('f-nh-income').value) || 0,
      average_income: parseInt(document.getElementById('f-nh-income').value) || 0,
      avg_age: parseInt(document.getElementById('f-nh-age').value) || 0,
      average_age: parseInt(document.getElementById('f-nh-age').value) || 0,
      primary_demographic: document.getElementById('f-nh-demo').value,
      demographics: document.getElementById('f-nh-demo').value,
    };
    if (isEdit) await api(`/neighborhoods/${item.id}`, 'PUT', body);
    else await api('/neighborhoods', 'POST', body);
    showToast(isEdit ? 'Neighborhood updated' : 'Neighborhood created', 'success');
    navigate('neighborhoods');
  });
}

async function deleteNeighborhood(id) {
  confirmAction('Delete this neighborhood?', async () => {
    await api(`/neighborhoods/${id}`, 'DELETE');
    showToast('Neighborhood deleted', 'success');
    navigate('neighborhoods');
  });
}

// ============ CAMPAIGNS ============

async function renderCampaignsList() {
  const content = document.getElementById('content');
  try {
    let items = await api('/campaigns');
    if (items.data) items = items.data;
    if (!Array.isArray(items)) items = [];

    content.innerHTML = `
      <div class="section-header">
        <h2>Campaigns</h2>
        <div class="section-actions">
          <div class="search-input"><span class="material-icons">search</span><input type="text" placeholder="Search campaigns..." oninput="filterTable(this, 'campaigns-table')"></div>
          <button class="btn btn-primary" onclick="showCampaignForm()"><span class="material-icons">add</span> New Campaign</button>
        </div>
      </div>
      <div class="card"><div class="card-body no-pad"><div class="table-wrap">
        <table id="campaigns-table">
          <thead><tr><th>ID</th><th>Name</th><th>Client</th><th>Status</th><th>Budget</th><th>Impressions</th><th>Start</th><th>End</th></tr></thead>
          <tbody>${items.length === 0 ? '<tr><td colspan="8">' + emptyState('campaign', 'No Campaigns', 'Create your first campaign.') + '</td></tr>' :
            items.map(c => `<tr onclick="navigate('campaigns', ${c.id})">
              <td>${c.id}</td>
              <td><strong>${escapeHtml(c.name || c.campaign_name || '-')}</strong></td>
              <td>${escapeHtml(c.client || c.client_name || '-')}</td>
              <td>${statusBadge(c.status || 'draft')}</td>
              <td>${c.budget ? '$' + formatNumber(c.budget) : '-'}</td>
              <td>${formatNumber(c.impressions || c.total_impressions || 0)}</td>
              <td>${formatDateShort(c.start_date)}</td>
              <td>${formatDateShort(c.end_date)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function renderCampaignDetail(id) {
  const content = document.getElementById('content');
  try {
    const res = await api(`/campaigns/${id}`);
    const c = res.data || res;
    content.innerHTML = `
      <div class="detail-view">
        <div class="detail-header">
          <button class="btn-back" onclick="navigate('campaigns')"><span class="material-icons">arrow_back</span></button>
          <h2>${escapeHtml(c.name || c.campaign_name || 'Campaign #' + c.id)}</h2>
          <div class="section-actions">
            <button class="btn btn-primary btn-sm" onclick='showCampaignForm(${JSON.stringify(c)})'><span class="material-icons">edit</span> Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCampaign(${c.id})"><span class="material-icons">delete</span> Delete</button>
          </div>
        </div>
        <div class="card"><div class="card-body">
          <div class="detail-grid">
            <div>
              <div class="detail-field"><div class="detail-field-label">ID</div><div class="detail-field-value">${c.id}</div></div>
              <div class="detail-field"><div class="detail-field-label">Name</div><div class="detail-field-value">${escapeHtml(c.name || c.campaign_name || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Client</div><div class="detail-field-value">${escapeHtml(c.client || c.client_name || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Status</div><div class="detail-field-value">${statusBadge(c.status || 'draft')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Budget</div><div class="detail-field-value">${c.budget ? '$' + formatNumber(c.budget) : '-'}</div></div>
            </div>
            <div>
              <div class="detail-field"><div class="detail-field-label">Impressions</div><div class="detail-field-value">${formatNumber(c.impressions || c.total_impressions || 0)}</div></div>
              <div class="detail-field"><div class="detail-field-label">Start Date</div><div class="detail-field-value">${formatDateShort(c.start_date)}</div></div>
              <div class="detail-field"><div class="detail-field-label">End Date</div><div class="detail-field-value">${formatDateShort(c.end_date)}</div></div>
              <div class="detail-field"><div class="detail-field-label">Description</div><div class="detail-field-value">${escapeHtml(c.description || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Created</div><div class="detail-field-value">${formatDate(c.created_at)}</div></div>
            </div>
          </div>
        </div></div>
      </div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

function showCampaignForm(item = null) {
  const isEdit = !!item;
  const html = `
    <div class="form-group"><label>Campaign Name</label><input type="text" id="f-camp-name" value="${escapeHtml(item?.name || item?.campaign_name || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Client</label><input type="text" id="f-camp-client" value="${escapeHtml(item?.client || item?.client_name || '')}"></div>
      <div class="form-group"><label>Status</label><select id="f-camp-status">
        <option value="draft" ${item?.status === 'draft' ? 'selected' : ''}>Draft</option>
        <option value="active" ${item?.status === 'active' ? 'selected' : ''}>Active</option>
        <option value="paused" ${item?.status === 'paused' ? 'selected' : ''}>Paused</option>
        <option value="completed" ${item?.status === 'completed' ? 'selected' : ''}>Completed</option>
      </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Budget ($)</label><input type="number" id="f-camp-budget" value="${item?.budget || ''}"></div>
      <div class="form-group"><label>Target Impressions</label><input type="number" id="f-camp-impressions" value="${item?.impressions || item?.total_impressions || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Start Date</label><input type="date" id="f-camp-start" value="${item?.start_date ? item.start_date.slice(0, 10) : ''}"></div>
      <div class="form-group"><label>End Date</label><input type="date" id="f-camp-end" value="${item?.end_date ? item.end_date.slice(0, 10) : ''}"></div>
    </div>
    <div class="form-group"><label>Description</label><textarea id="f-camp-desc">${escapeHtml(item?.description || '')}</textarea></div>
  `;
  renderModal(isEdit ? 'Edit Campaign' : 'New Campaign', html, async () => {
    const body = {
      name: document.getElementById('f-camp-name').value,
      campaign_name: document.getElementById('f-camp-name').value,
      client: document.getElementById('f-camp-client').value,
      client_name: document.getElementById('f-camp-client').value,
      status: document.getElementById('f-camp-status').value,
      budget: parseFloat(document.getElementById('f-camp-budget').value) || 0,
      impressions: parseInt(document.getElementById('f-camp-impressions').value) || 0,
      total_impressions: parseInt(document.getElementById('f-camp-impressions').value) || 0,
      start_date: document.getElementById('f-camp-start').value,
      end_date: document.getElementById('f-camp-end').value,
      description: document.getElementById('f-camp-desc').value,
    };
    if (isEdit) await api(`/campaigns/${item.id}`, 'PUT', body);
    else await api('/campaigns', 'POST', body);
    showToast(isEdit ? 'Campaign updated' : 'Campaign created', 'success');
    navigate('campaigns');
  });
}

async function deleteCampaign(id) {
  confirmAction('Delete this campaign?', async () => {
    await api(`/campaigns/${id}`, 'DELETE');
    showToast('Campaign deleted', 'success');
    navigate('campaigns');
  });
}

// ============ HEADLINES ============

async function renderHeadlinesList() {
  const content = document.getElementById('content');
  try {
    let items = await api('/headlines');
    if (items.data) items = items.data;
    if (!Array.isArray(items)) items = [];

    content.innerHTML = `
      <div class="section-header">
        <h2>Headlines</h2>
        <div class="section-actions">
          <div class="search-input"><span class="material-icons">search</span><input type="text" placeholder="Search headlines..." oninput="filterTable(this, 'headlines-table')"></div>
          <button class="btn btn-primary" onclick="showHeadlineForm()"><span class="material-icons">add</span> Add Headline</button>
        </div>
      </div>
      <div class="card"><div class="card-body no-pad"><div class="table-wrap">
        <table id="headlines-table">
          <thead><tr><th>ID</th><th>Headline</th><th>Campaign</th><th>Neighborhood</th><th>Status</th><th>Score</th><th>Created</th></tr></thead>
          <tbody>${items.length === 0 ? '<tr><td colspan="7">' + emptyState('title', 'No Headlines', 'Generate headlines with AI or add them manually.') + '</td></tr>' :
            items.map(h => `<tr onclick="navigate('headlines', ${h.id})">
              <td>${h.id}</td>
              <td class="truncate"><strong>${escapeHtml(h.headline_text || h.content || h.text || '-')}</strong></td>
              <td>${h.campaign_id ? 'Campaign #' + h.campaign_id : '-'}</td>
              <td>${escapeHtml(h.neighborhood_name || (h.neighborhood_id ? 'Area #' + h.neighborhood_id : '-'))}</td>
              <td>${statusBadge(h.status || 'draft')}</td>
              <td>${h.confidence_score || h.score ? (h.confidence_score || h.score) + '%' : '-'}</td>
              <td>${formatDateShort(h.created_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function renderHeadlineDetail(id) {
  const content = document.getElementById('content');
  try {
    const res = await api(`/headlines/${id}`);
    const h = res.data || res;
    content.innerHTML = `
      <div class="detail-view">
        <div class="detail-header">
          <button class="btn-back" onclick="navigate('headlines')"><span class="material-icons">arrow_back</span></button>
          <h2>Headline #${h.id}</h2>
          <div class="section-actions">
            <button class="btn btn-primary btn-sm" onclick='showHeadlineForm(${JSON.stringify(h)})'><span class="material-icons">edit</span> Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteHeadline(${h.id})"><span class="material-icons">delete</span> Delete</button>
          </div>
        </div>
        <div class="card"><div class="card-body">
          <div class="billboard-preview mb-6">
            <div class="billboard-headline">${escapeHtml(h.headline_text || h.content || h.text || 'No headline text')}</div>
            <div class="billboard-meta">Headline #${h.id} ${h.campaign_id ? '| Campaign #' + h.campaign_id : ''}</div>
          </div>
          <div class="detail-grid">
            <div>
              <div class="detail-field"><div class="detail-field-label">Headline Text</div><div class="detail-field-value">${escapeHtml(h.headline_text || h.content || h.text || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Campaign ID</div><div class="detail-field-value">${h.campaign_id || '-'}</div></div>
              <div class="detail-field"><div class="detail-field-label">Neighborhood</div><div class="detail-field-value">${escapeHtml(h.neighborhood_name || (h.neighborhood_id ? '#' + h.neighborhood_id : '-'))}</div></div>
              <div class="detail-field"><div class="detail-field-label">Status</div><div class="detail-field-value">${statusBadge(h.status || 'draft')}</div></div>
            </div>
            <div>
              <div class="detail-field"><div class="detail-field-label">Confidence Score</div><div class="detail-field-value">${h.confidence_score || h.score || '-'}%</div></div>
              <div class="detail-field"><div class="detail-field-label">Target Audience</div><div class="detail-field-value">${escapeHtml(h.target_audience || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Emotional Appeal</div><div class="detail-field-value">${escapeHtml(h.emotional_appeal || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Style</div><div class="detail-field-value">${escapeHtml(h.style || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Created</div><div class="detail-field-value">${formatDate(h.created_at)}</div></div>
            </div>
          </div>
        </div></div>
      </div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

function showHeadlineForm(item = null) {
  const isEdit = !!item;
  const html = `
    <div class="form-group"><label>Headline Text</label><textarea id="f-hl-text" rows="3">${escapeHtml(item?.headline_text || item?.content || item?.text || '')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Campaign ID</label><input type="number" id="f-hl-campaign" value="${item?.campaign_id || ''}"></div>
      <div class="form-group"><label>Neighborhood ID</label><input type="number" id="f-hl-neighborhood" value="${item?.neighborhood_id || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Status</label><select id="f-hl-status">
        <option value="draft" ${item?.status === 'draft' ? 'selected' : ''}>Draft</option>
        <option value="active" ${item?.status === 'active' ? 'selected' : ''}>Active</option>
        <option value="displayed" ${item?.status === 'displayed' ? 'selected' : ''}>Displayed</option>
        <option value="paused" ${item?.status === 'paused' ? 'selected' : ''}>Paused</option>
      </select></div>
      <div class="form-group"><label>Confidence Score</label><input type="number" id="f-hl-score" value="${item?.confidence_score || item?.score || ''}" min="0" max="100"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Target Audience</label><input type="text" id="f-hl-audience" value="${escapeHtml(item?.target_audience || '')}"></div>
      <div class="form-group"><label>Emotional Appeal</label><input type="text" id="f-hl-appeal" value="${escapeHtml(item?.emotional_appeal || '')}"></div>
    </div>
  `;
  renderModal(isEdit ? 'Edit Headline' : 'Add Headline', html, async () => {
    const body = {
      headline_text: document.getElementById('f-hl-text').value,
      content: document.getElementById('f-hl-text').value,
      text: document.getElementById('f-hl-text').value,
      campaign_id: parseInt(document.getElementById('f-hl-campaign').value) || null,
      neighborhood_id: parseInt(document.getElementById('f-hl-neighborhood').value) || null,
      status: document.getElementById('f-hl-status').value,
      confidence_score: parseInt(document.getElementById('f-hl-score').value) || 0,
      score: parseInt(document.getElementById('f-hl-score').value) || 0,
      target_audience: document.getElementById('f-hl-audience').value,
      emotional_appeal: document.getElementById('f-hl-appeal').value,
    };
    if (isEdit) await api(`/headlines/${item.id}`, 'PUT', body);
    else await api('/headlines', 'POST', body);
    showToast(isEdit ? 'Headline updated' : 'Headline created', 'success');
    navigate('headlines');
  });
}

async function deleteHeadline(id) {
  confirmAction('Delete this headline?', async () => {
    await api(`/headlines/${id}`, 'DELETE');
    showToast('Headline deleted', 'success');
    navigate('headlines');
  });
}

// ============ BILLBOARD DISPLAY ============

async function renderBillboard() {
  const content = document.getElementById('content');
  try {
    let headlines = await api('/headlines');
    if (headlines.data) headlines = headlines.data;
    if (!Array.isArray(headlines)) headlines = [];
    const active = headlines.filter(h => h.status === 'active' || h.status === 'displayed');
    const current = active.length > 0 ? active[0] : (headlines.length > 0 ? headlines[headlines.length - 1] : null);

    content.innerHTML = `
      <div class="section-header">
        <h2>Billboard Display</h2>
        <div class="section-actions">
          <button class="btn btn-primary" onclick="navigate('ai-generator')"><span class="material-icons">auto_awesome</span> Generate New</button>
        </div>
      </div>
      ${current ? `
        <div class="billboard-preview mb-6">
          <div class="billboard-headline">${escapeHtml(current.headline_text || current.content || current.text || 'No active headline')}</div>
          <div class="billboard-meta">
            Campaign #${current.campaign_id || '-'} | ${current.neighborhood_name || 'Area #' + (current.neighborhood_id || '-')} | ${statusBadge(current.status)}
          </div>
        </div>` : `
        <div class="billboard-preview mb-6">
          <div class="billboard-headline" style="color:var(--text-dim)">No Active Headline</div>
          <div class="billboard-meta">Generate or activate a headline to display</div>
        </div>`}
      <h3 class="mb-4">All Headlines</h3>
      <div class="card"><div class="card-body no-pad"><div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Headline</th><th>Status</th><th>Score</th><th>Actions</th></tr></thead>
          <tbody>${headlines.length === 0 ? '<tr><td colspan="5">' + emptyState('tv', 'No Headlines', 'No headlines available for display.') + '</td></tr>' :
            headlines.map(h => `<tr>
              <td>${h.id}</td>
              <td class="truncate">${escapeHtml(h.headline_text || h.content || h.text || '-')}</td>
              <td>${statusBadge(h.status || 'draft')}</td>
              <td>${h.confidence_score || h.score || '-'}%</td>
              <td><button class="btn btn-success btn-sm" onclick="activateHeadline(${h.id})"><span class="material-icons">play_arrow</span> Display</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function activateHeadline(id) {
  try {
    await api(`/headlines/${id}`, 'PUT', { status: 'displayed' });
    showToast('Headline is now displayed!', 'success');
    navigate('billboard');
  } catch (err) { showToast(err.message, 'error'); }
}

// ============ ANALYTICS ============

async function renderAnalyticsList() {
  const content = document.getElementById('content');
  try {
    let items = await api('/analytics');
    if (items.data) items = items.data;
    if (!Array.isArray(items)) items = [];

    content.innerHTML = `
      <div class="section-header">
        <h2>Analytics</h2>
        <div class="section-actions">
          <div class="search-input"><span class="material-icons">search</span><input type="text" placeholder="Search analytics..." oninput="filterTable(this, 'analytics-table')"></div>
          <button class="btn btn-primary" onclick="showAnalyticsForm()"><span class="material-icons">add</span> Add Entry</button>
        </div>
      </div>
      <div class="card"><div class="card-body no-pad"><div class="table-wrap">
        <table id="analytics-table">
          <thead><tr><th>ID</th><th>Campaign</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Conversions</th><th>Date</th></tr></thead>
          <tbody>${items.length === 0 ? '<tr><td colspan="7">' + emptyState('analytics', 'No Analytics', 'Analytics data will appear here.') + '</td></tr>' :
            items.map(a => `<tr onclick="navigate('analytics', ${a.id})">
              <td>${a.id}</td>
              <td>${a.campaign_id ? 'Campaign #' + a.campaign_id : (escapeHtml(a.campaign_name || '-'))}</td>
              <td>${formatNumber(a.impressions || 0)}</td>
              <td>${formatNumber(a.clicks || 0)}</td>
              <td>${a.ctr ? a.ctr + '%' : (a.impressions && a.clicks ? ((a.clicks / a.impressions) * 100).toFixed(2) + '%' : '-')}</td>
              <td>${formatNumber(a.conversions || 0)}</td>
              <td>${formatDateShort(a.date || a.created_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function renderAnalyticsDetail(id) {
  const content = document.getElementById('content');
  try {
    const res = await api(`/analytics/${id}`);
    const a = res.data || res;
    content.innerHTML = `
      <div class="detail-view">
        <div class="detail-header">
          <button class="btn-back" onclick="navigate('analytics')"><span class="material-icons">arrow_back</span></button>
          <h2>Analytics Entry #${a.id}</h2>
          <div class="section-actions">
            <button class="btn btn-primary btn-sm" onclick='showAnalyticsForm(${JSON.stringify(a)})'><span class="material-icons">edit</span> Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteAnalytics(${a.id})"><span class="material-icons">delete</span> Delete</button>
          </div>
        </div>
        <div class="card"><div class="card-body">
          <div class="detail-grid">
            <div>
              <div class="detail-field"><div class="detail-field-label">ID</div><div class="detail-field-value">${a.id}</div></div>
              <div class="detail-field"><div class="detail-field-label">Campaign</div><div class="detail-field-value">${a.campaign_id ? 'Campaign #' + a.campaign_id : escapeHtml(a.campaign_name || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Impressions</div><div class="detail-field-value">${formatNumber(a.impressions || 0)}</div></div>
              <div class="detail-field"><div class="detail-field-label">Clicks</div><div class="detail-field-value">${formatNumber(a.clicks || 0)}</div></div>
            </div>
            <div>
              <div class="detail-field"><div class="detail-field-label">CTR</div><div class="detail-field-value">${a.ctr ? a.ctr + '%' : (a.impressions && a.clicks ? ((a.clicks / a.impressions) * 100).toFixed(2) + '%' : '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Conversions</div><div class="detail-field-value">${formatNumber(a.conversions || 0)}</div></div>
              <div class="detail-field"><div class="detail-field-label">Revenue</div><div class="detail-field-value">${a.revenue ? '$' + formatNumber(a.revenue) : '-'}</div></div>
              <div class="detail-field"><div class="detail-field-label">Date</div><div class="detail-field-value">${formatDate(a.date || a.created_at)}</div></div>
            </div>
          </div>
        </div></div>
      </div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

function showAnalyticsForm(item = null) {
  const isEdit = !!item;
  const html = `
    <div class="form-row">
      <div class="form-group"><label>Campaign ID</label><input type="number" id="f-an-campaign" value="${item?.campaign_id || ''}"></div>
      <div class="form-group"><label>Date</label><input type="date" id="f-an-date" value="${item?.date ? item.date.slice(0,10) : ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Impressions</label><input type="number" id="f-an-impressions" value="${item?.impressions || ''}"></div>
      <div class="form-group"><label>Clicks</label><input type="number" id="f-an-clicks" value="${item?.clicks || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Conversions</label><input type="number" id="f-an-conversions" value="${item?.conversions || ''}"></div>
      <div class="form-group"><label>Revenue ($)</label><input type="number" id="f-an-revenue" value="${item?.revenue || ''}" step="0.01"></div>
    </div>
  `;
  renderModal(isEdit ? 'Edit Analytics Entry' : 'Add Analytics Entry', html, async () => {
    const body = {
      campaign_id: parseInt(document.getElementById('f-an-campaign').value) || null,
      date: document.getElementById('f-an-date').value,
      impressions: parseInt(document.getElementById('f-an-impressions').value) || 0,
      clicks: parseInt(document.getElementById('f-an-clicks').value) || 0,
      conversions: parseInt(document.getElementById('f-an-conversions').value) || 0,
      revenue: parseFloat(document.getElementById('f-an-revenue').value) || 0,
    };
    if (isEdit) await api(`/analytics/${item.id}`, 'PUT', body);
    else await api('/analytics', 'POST', body);
    showToast(isEdit ? 'Analytics updated' : 'Analytics entry created', 'success');
    navigate('analytics');
  });
}

async function deleteAnalytics(id) {
  confirmAction('Delete this analytics entry?', async () => {
    await api(`/analytics/${id}`, 'DELETE');
    showToast('Analytics entry deleted', 'success');
    navigate('analytics');
  });
}

// ============ DEMOGRAPHICS ============

async function renderDemographicsList() {
  const content = document.getElementById('content');
  try {
    let items = await api('/demographics');
    if (items.data) items = items.data;
    if (!Array.isArray(items)) items = [];

    content.innerHTML = `
      <div class="section-header">
        <h2>Demographics</h2>
        <div class="section-actions">
          <div class="search-input"><span class="material-icons">search</span><input type="text" placeholder="Search demographics..." oninput="filterTable(this, 'demographics-table')"></div>
          <button class="btn btn-primary" onclick="showDemographicForm()"><span class="material-icons">add</span> Add Demographic</button>
        </div>
      </div>
      <div class="card"><div class="card-body no-pad"><div class="table-wrap">
        <table id="demographics-table">
          <thead><tr><th>ID</th><th>Neighborhood</th><th>Age Group</th><th>Income Level</th><th>Population</th><th>Interests</th></tr></thead>
          <tbody>${items.length === 0 ? '<tr><td colspan="6">' + emptyState('people', 'No Demographics', 'Add demographic data for targeting.') + '</td></tr>' :
            items.map(d => `<tr onclick="navigate('demographics', ${d.id})">
              <td>${d.id}</td>
              <td>${escapeHtml(d.neighborhood_name || (d.neighborhood_id ? 'Area #' + d.neighborhood_id : '-'))}</td>
              <td>${escapeHtml(d.age_group || d.age_range || '-')}</td>
              <td>${escapeHtml(d.income_level || d.income_bracket || '-')}</td>
              <td>${formatNumber(d.population || d.count || 0)}</td>
              <td class="truncate">${escapeHtml(d.interests || d.top_interests || '-')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function renderDemographicDetail(id) {
  const content = document.getElementById('content');
  try {
    const res = await api(`/demographics/${id}`);
    const d = res.data || res;
    content.innerHTML = `
      <div class="detail-view">
        <div class="detail-header">
          <button class="btn-back" onclick="navigate('demographics')"><span class="material-icons">arrow_back</span></button>
          <h2>Demographic #${d.id}</h2>
          <div class="section-actions">
            <button class="btn btn-primary btn-sm" onclick='showDemographicForm(${JSON.stringify(d)})'><span class="material-icons">edit</span> Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteDemographic(${d.id})"><span class="material-icons">delete</span> Delete</button>
          </div>
        </div>
        <div class="card"><div class="card-body">
          <div class="detail-grid">
            <div>
              <div class="detail-field"><div class="detail-field-label">ID</div><div class="detail-field-value">${d.id}</div></div>
              <div class="detail-field"><div class="detail-field-label">Neighborhood</div><div class="detail-field-value">${escapeHtml(d.neighborhood_name || (d.neighborhood_id ? '#' + d.neighborhood_id : '-'))}</div></div>
              <div class="detail-field"><div class="detail-field-label">Age Group</div><div class="detail-field-value">${escapeHtml(d.age_group || d.age_range || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Income Level</div><div class="detail-field-value">${escapeHtml(d.income_level || d.income_bracket || '-')}</div></div>
            </div>
            <div>
              <div class="detail-field"><div class="detail-field-label">Population</div><div class="detail-field-value">${formatNumber(d.population || d.count || 0)}</div></div>
              <div class="detail-field"><div class="detail-field-label">Education</div><div class="detail-field-value">${escapeHtml(d.education_level || d.education || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Interests</div><div class="detail-field-value">${escapeHtml(d.interests || d.top_interests || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Created</div><div class="detail-field-value">${formatDate(d.created_at)}</div></div>
            </div>
          </div>
        </div></div>
      </div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

function showDemographicForm(item = null) {
  const isEdit = !!item;
  const html = `
    <div class="form-row">
      <div class="form-group"><label>Neighborhood ID</label><input type="number" id="f-demo-nh" value="${item?.neighborhood_id || ''}"></div>
      <div class="form-group"><label>Age Group</label><input type="text" id="f-demo-age" value="${escapeHtml(item?.age_group || item?.age_range || '')}" placeholder="e.g. 25-34"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Income Level</label><input type="text" id="f-demo-income" value="${escapeHtml(item?.income_level || item?.income_bracket || '')}" placeholder="e.g. $50k-$75k"></div>
      <div class="form-group"><label>Population</label><input type="number" id="f-demo-pop" value="${item?.population || item?.count || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Education Level</label><input type="text" id="f-demo-edu" value="${escapeHtml(item?.education_level || item?.education || '')}"></div>
      <div class="form-group"><label>Interests</label><input type="text" id="f-demo-interests" value="${escapeHtml(item?.interests || item?.top_interests || '')}" placeholder="e.g. tech, food, fitness"></div>
    </div>
  `;
  renderModal(isEdit ? 'Edit Demographic' : 'Add Demographic', html, async () => {
    const body = {
      neighborhood_id: parseInt(document.getElementById('f-demo-nh').value) || null,
      age_group: document.getElementById('f-demo-age').value,
      age_range: document.getElementById('f-demo-age').value,
      income_level: document.getElementById('f-demo-income').value,
      income_bracket: document.getElementById('f-demo-income').value,
      population: parseInt(document.getElementById('f-demo-pop').value) || 0,
      count: parseInt(document.getElementById('f-demo-pop').value) || 0,
      education_level: document.getElementById('f-demo-edu').value,
      education: document.getElementById('f-demo-edu').value,
      interests: document.getElementById('f-demo-interests').value,
      top_interests: document.getElementById('f-demo-interests').value,
    };
    if (isEdit) await api(`/demographics/${item.id}`, 'PUT', body);
    else await api('/demographics', 'POST', body);
    showToast(isEdit ? 'Demographic updated' : 'Demographic created', 'success');
    navigate('demographics');
  });
}

async function deleteDemographic(id) {
  confirmAction('Delete this demographic entry?', async () => {
    await api(`/demographics/${id}`, 'DELETE');
    showToast('Demographic deleted', 'success');
    navigate('demographics');
  });
}

// ============ AI GENERATOR ============

async function renderAiGenerator() {
  const content = document.getElementById('content');

  // Load trucks, campaigns, neighborhoods for dropdowns
  let trucks = [], campaigns = [], neighborhoods = [];
  try {
    const [t, c, n] = await Promise.all([
      api('/trucks').catch(() => []),
      api('/campaigns').catch(() => []),
      api('/neighborhoods').catch(() => []),
    ]);
    trucks = (t.data || t || []);
    campaigns = (c.data || c || []);
    neighborhoods = (n.data || n || []);
    if (!Array.isArray(trucks)) trucks = [];
    if (!Array.isArray(campaigns)) campaigns = [];
    if (!Array.isArray(neighborhoods)) neighborhoods = [];
  } catch {}

  content.innerHTML = `
    <div class="section-header">
      <h2>AI Headline Generator</h2>
    </div>
    <div class="card mb-6"><div class="card-body">
      <div class="ai-form-grid">
        <div class="form-group">
          <label>Truck</label>
          <select id="ai-truck">
            <option value="">-- Select Truck --</option>
            ${trucks.map(t => `<option value="${t.id}">${escapeHtml(t.name || t.truck_name || 'Truck #' + t.id)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Campaign</label>
          <select id="ai-campaign">
            <option value="">-- Select Campaign --</option>
            ${campaigns.map(c => `<option value="${c.id}">${escapeHtml(c.name || c.campaign_name || 'Campaign #' + c.id)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Neighborhood</label>
          <select id="ai-neighborhood">
            <option value="">-- Select Neighborhood --</option>
            ${neighborhoods.map(n => `<option value="${n.id}">${escapeHtml(n.name || n.neighborhood_name || 'Area #' + n.id)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Style</label>
          <select id="ai-style">
            <option value="professional">Professional</option>
            <option value="witty">Witty</option>
            <option value="casual">Casual</option>
            <option value="bold">Bold</option>
            <option value="emotional">Emotional</option>
            <option value="humorous">Humorous</option>
          </select>
        </div>
        <div class="form-group">
          <label>Tone</label>
          <select id="ai-tone">
            <option value="friendly">Friendly</option>
            <option value="urgent">Urgent</option>
            <option value="luxury">Luxury</option>
            <option value="playful">Playful</option>
            <option value="authoritative">Authoritative</option>
            <option value="inspirational">Inspirational</option>
          </select>
        </div>
        <div class="form-group">
          <label>Number of Headlines</label>
          <select id="ai-count">
            <option value="3">3 Headlines</option>
            <option value="5">5 Headlines</option>
            <option value="1">1 Headline</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label>Custom Prompt (optional)</label>
          <textarea id="ai-prompt" placeholder="Add specific instructions for the AI... e.g., 'Focus on eco-friendly messaging for commuters'" rows="3"></textarea>
        </div>
      </div>
      <button class="btn btn-primary" id="ai-generate-btn" onclick="generateHeadlines()">
        <span class="material-icons">auto_awesome</span> Generate Headlines
      </button>
    </div></div>
    <div id="ai-results"></div>

    <div class="section-header" style="margin-top:32px">
      <h2>Route Performance Predictor (NEW)</h2>
    </div>
    <div class="card mb-6"><div class="card-body">
      <p class="text-secondary" style="margin-bottom:12px">Pick a campaign and one or more neighborhoods. AI predicts impressions, CTR, and conversions per stop.</p>
      <div class="ai-form-grid">
        <div class="form-group">
          <label>Campaign</label>
          <select id="rpp-campaign">
            <option value="">-- Select Campaign --</option>
            ${campaigns.map(c => `<option value="${c.id}">${escapeHtml(c.name || c.campaign_name || 'Campaign #' + c.id)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Hours per neighborhood</label>
          <input type="number" id="rpp-hours" value="2" min="1" max="12" />
        </div>
        <div class="form-group">
          <label>Day Part</label>
          <select id="rpp-daypart">
            <option value="morning">Morning</option>
            <option value="mid-day" selected>Mid-day</option>
            <option value="evening">Evening</option>
            <option value="late-night">Late-night</option>
          </select>
        </div>
        <div class="form-group full-width">
          <label>Neighborhoods (Ctrl/Cmd-click to multi-select)</label>
          <select id="rpp-neighborhoods" multiple size="6" style="height:auto">
            ${neighborhoods.map(n => `<option value="${n.id}">${escapeHtml(n.name || n.neighborhood_name || 'Area #' + n.id)}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn btn-primary" id="rpp-btn" onclick="runRoutePerformance()">
        <span class="material-icons">trending_up</span> Predict Performance
      </button>
    </div></div>
    <div id="rpp-results"></div>
  `;
}

async function runRoutePerformance() {
  const btn = document.getElementById('rpp-btn');
  const resultsDiv = document.getElementById('rpp-results');
  const campaign_id = parseInt(document.getElementById('rpp-campaign').value) || null;
  const hours_per_neighborhood = parseInt(document.getElementById('rpp-hours').value) || 2;
  const day_part = document.getElementById('rpp-daypart').value;
  const sel = document.getElementById('rpp-neighborhoods');
  const neighborhood_ids = Array.from(sel.selectedOptions).map(o => parseInt(o.value)).filter(Boolean);

  if (!campaign_id || neighborhood_ids.length === 0) {
    showToast('Pick a campaign and at least one neighborhood', 'warning');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm"></div> Predicting...';
  resultsDiv.innerHTML = showLoading();

  try {
    const res = await api('/ai/route-performance-predictor', 'POST', {
      campaign_id, neighborhood_ids, hours_per_neighborhood, day_part,
    });
    const p = res.predictions || {};
    const totals = p.totals || {};
    const rows = (p.per_neighborhood || []).map(n => `
      <tr>
        <td>${escapeHtml(n.neighborhood_name)}</td>
        <td>${formatNumber(n.expected_impressions)}</td>
        <td>${(n.expected_ctr_pct ?? 0).toFixed(2)}%</td>
        <td>${formatNumber(n.expected_conversions)}</td>
        <td>${escapeHtml(n.confidence || '-')}</td>
        <td class="text-secondary">${escapeHtml(n.rationale || '')}</td>
      </tr>`).join('');
    resultsDiv.innerHTML = `
      <h3 class="mb-4">Predicted Performance</h3>
      <div class="card mb-4"><div class="card-body">
        <div class="ai-meta">
          <div class="ai-meta-item"><span class="material-icons">visibility</span><span>Total Impressions: <b>${formatNumber(totals.expected_impressions)}</b></span></div>
          <div class="ai-meta-item"><span class="material-icons">touch_app</span><span>Avg CTR: <b>${(totals.expected_ctr_pct ?? 0).toFixed(2)}%</b></span></div>
          <div class="ai-meta-item"><span class="material-icons">shopping_cart</span><span>Conversions: <b>${formatNumber(totals.expected_conversions)}</b></span></div>
          <div class="ai-meta-item"><span class="material-icons">timer</span><span>Latency: ${res.latency_ms}ms</span></div>
        </div>
      </div></div>
      <div class="card"><div class="card-body" style="overflow:auto">
        <table class="table">
          <thead><tr>
            <th>Neighborhood</th><th>Impressions</th><th>CTR</th><th>Conversions</th><th>Confidence</th><th>Rationale</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${(p.recommended_optimizations || []).length ? `
          <h4 style="margin-top:16px">Recommended Optimizations</h4>
          <ul>${(p.recommended_optimizations || []).map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>` : ''}
      </div></div>
    `;
    showToast('Performance prediction generated', 'success');
  } catch (err) {
    resultsDiv.innerHTML = `<div class="card"><div class="card-body">${emptyState('error', 'Prediction Failed', err.message)}</div></div>`;
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">trending_up</span> Predict Performance';
  }
}

async function generateHeadlines() {
  const btn = document.getElementById('ai-generate-btn');
  const resultsDiv = document.getElementById('ai-results');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm"></div> Generating...';
  resultsDiv.innerHTML = showLoading();

  const body = {
    truck_id: parseInt(document.getElementById('ai-truck').value) || undefined,
    campaign_id: parseInt(document.getElementById('ai-campaign').value) || undefined,
    neighborhood_id: parseInt(document.getElementById('ai-neighborhood').value) || undefined,
    style: document.getElementById('ai-style').value,
    tone: document.getElementById('ai-tone').value,
    count: parseInt(document.getElementById('ai-count').value) || 3,
    custom_prompt: document.getElementById('ai-prompt').value || undefined,
  };

  try {
    const res = await api('/ai/generate', 'POST', body);
    const data = res.data || res;
    let headlines = data.headlines || data.results || data.options || [];

    // If raw text response, try to parse it
    if (typeof data === 'string' || (data.text && !headlines.length)) {
      const text = data.text || data;
      const lines = String(text).split('\n').filter(l => l.trim());
      headlines = lines.map((line, i) => ({
        headline_text: line.replace(/^\d+[\.\)]\s*/, '').replace(/^[-*]\s*/, ''),
        confidence_score: Math.floor(Math.random() * 25 + 70),
        target_audience: 'General',
        emotional_appeal: body.tone,
      }));
    }

    if (!Array.isArray(headlines)) headlines = [headlines];
    if (headlines.length === 0 && data.headline_text) headlines = [data];

    resultsDiv.innerHTML = `
      <h3 class="mb-4">Generated Headlines</h3>
      ${headlines.map((h, i) => {
        const score = h.confidence_score || h.score || h.confidence || Math.floor(Math.random() * 25 + 70);
        const scoreClass = score >= 80 ? 'high' : score >= 60 ? 'mid' : 'low';
        const text = h.headline_text || h.text || h.content || h.headline || 'Generated headline';
        const audience = h.target_audience || h.audience || 'General';
        const appeal = h.emotional_appeal || h.appeal || h.emotion || body.tone;
        return `
          <div class="ai-result-card">
            <div class="ai-headline-text">${escapeHtml(text)}</div>
            <div class="ai-tags">
              <span class="ai-tag ai-tag-audience"><span class="material-icons" style="font-size:12px;vertical-align:middle;margin-right:4px;">people</span>${escapeHtml(audience)}</span>
              <span class="ai-tag ai-tag-appeal"><span class="material-icons" style="font-size:12px;vertical-align:middle;margin-right:4px;">favorite</span>${escapeHtml(appeal)}</span>
            </div>
            <div class="confidence-bar-wrap">
              <div class="confidence-label"><span>Confidence Score</span><span>${score}%</span></div>
              <div class="confidence-bar"><div class="confidence-fill confidence-${scoreClass}" style="width:${score}%"></div></div>
            </div>
            <button class="btn btn-success btn-sm" onclick="saveAiHeadline('${escapeHtml(text).replace(/'/g, "\\'")}', ${score}, '${escapeHtml(audience)}', '${escapeHtml(appeal)}')">
              <span class="material-icons">check</span> Use This Headline
            </button>
          </div>`;
      }).join('')}
      <div class="ai-meta">
        <div class="ai-meta-item"><span class="material-icons">psychology</span><span>Model: ${escapeHtml(data.model || data.model_used || 'GPT-4')}</span></div>
        <div class="ai-meta-item"><span class="material-icons">timer</span><span>Latency: ${data.latency || data.response_time || data.processing_time || 'N/A'}ms</span></div>
        <div class="ai-meta-item"><span class="material-icons">data_usage</span><span>Tokens: ${data.tokens_used || data.total_tokens || data.usage?.total_tokens || 'N/A'}</span></div>
        <div class="ai-meta-item"><span class="material-icons">description</span><span>Style: ${body.style} | Tone: ${body.tone}</span></div>
      </div>
    `;
    showToast('Headlines generated successfully!', 'success');
  } catch (err) {
    resultsDiv.innerHTML = `<div class="card"><div class="card-body">${emptyState('error', 'Generation Failed', err.message)}</div></div>`;
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">auto_awesome</span> Generate Headlines';
  }
}

async function saveAiHeadline(text, score, audience, appeal) {
  try {
    const campaignId = document.getElementById('ai-campaign')?.value;
    const neighborhoodId = document.getElementById('ai-neighborhood')?.value;
    await api('/headlines', 'POST', {
      headline_text: text,
      content: text,
      text: text,
      confidence_score: score,
      score: score,
      target_audience: audience,
      emotional_appeal: appeal,
      campaign_id: parseInt(campaignId) || null,
      neighborhood_id: parseInt(neighborhoodId) || null,
      status: 'active',
      style: document.getElementById('ai-style')?.value || '',
    });
    showToast('Headline saved and activated!', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

// ============ AI LOGS ============

async function renderAiLogsList() {
  const content = document.getElementById('content');
  try {
    let items = await api('/ai/logs');
    if (items.data) items = items.data;
    if (!Array.isArray(items)) items = [];

    content.innerHTML = `
      <div class="section-header">
        <h2>AI Logs</h2>
        <div class="section-actions">
          <div class="search-input"><span class="material-icons">search</span><input type="text" placeholder="Search logs..." oninput="filterTable(this, 'ailogs-table')"></div>
        </div>
      </div>
      <div class="card"><div class="card-body no-pad"><div class="table-wrap">
        <table id="ailogs-table">
          <thead><tr><th>ID</th><th>Model</th><th>Prompt</th><th>Tokens</th><th>Latency</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>${items.length === 0 ? '<tr><td colspan="7">' + emptyState('history', 'No AI Logs', 'AI generation logs will appear here.') + '</td></tr>' :
            items.map(l => `<tr onclick="navigate('ai-logs', ${l.id})">
              <td>${l.id}</td>
              <td>${escapeHtml(l.model || l.model_used || '-')}</td>
              <td class="truncate">${escapeHtml(l.prompt || l.input_prompt || '-')}</td>
              <td>${formatNumber(l.tokens_used || l.total_tokens || 0)}</td>
              <td>${l.latency || l.response_time || '-'}ms</td>
              <td>${statusBadge(l.status || 'completed')}</td>
              <td>${formatDateShort(l.created_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div></div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function renderAiLogDetail(id) {
  const content = document.getElementById('content');
  try {
    const res = await api(`/ai/logs/${id}`);
    const l = res.data || res;
    content.innerHTML = `
      <div class="detail-view">
        <div class="detail-header">
          <button class="btn-back" onclick="navigate('ai-logs')"><span class="material-icons">arrow_back</span></button>
          <h2>AI Log #${l.id}</h2>
          <div class="section-actions">
            <button class="btn btn-danger btn-sm" onclick="deleteAiLog(${l.id})"><span class="material-icons">delete</span> Delete</button>
          </div>
        </div>
        <div class="card"><div class="card-body">
          <div class="detail-grid">
            <div>
              <div class="detail-field"><div class="detail-field-label">ID</div><div class="detail-field-value">${l.id}</div></div>
              <div class="detail-field"><div class="detail-field-label">Model</div><div class="detail-field-value">${escapeHtml(l.model || l.model_used || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Tokens Used</div><div class="detail-field-value">${formatNumber(l.tokens_used || l.total_tokens || 0)}</div></div>
              <div class="detail-field"><div class="detail-field-label">Latency</div><div class="detail-field-value">${l.latency || l.response_time || '-'}ms</div></div>
              <div class="detail-field"><div class="detail-field-label">Status</div><div class="detail-field-value">${statusBadge(l.status || 'completed')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Created</div><div class="detail-field-value">${formatDate(l.created_at)}</div></div>
            </div>
            <div>
              <div class="detail-field"><div class="detail-field-label">Prompt</div><div class="detail-field-value" style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(l.prompt || l.input_prompt || '-')}</div></div>
              <div class="detail-field"><div class="detail-field-label">Response</div><div class="detail-field-value" style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(l.response || l.output || l.result || '-')}</div></div>
            </div>
          </div>
        </div></div>
      </div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function deleteAiLog(id) {
  confirmAction('Delete this AI log entry?', async () => {
    await api(`/ai/logs/${id}`, 'DELETE');
    showToast('AI log deleted', 'success');
    navigate('ai-logs');
  });
}

// ============ FORGOT / CHANGE PASSWORD ============

function showForgotPassword() {
  renderModal('Forgot Password',
    `<form id="forgot-form" onsubmit="event.preventDefault();">
      <p style="margin-bottom:1rem;font-size:0.9rem;color:var(--text-muted,#6b7280);">Enter your email and we will issue a reset token (in dev, returned in the response).</p>
      <div class="form-group"><label>Email</label><input type="email" id="forgot-email" required></div>
      <div id="forgot-result" style="display:none;margin-top:1rem;padding:0.75rem;background:#f3f4f6;border-radius:6px;font-family:monospace;font-size:0.85rem;word-break:break-all;"></div>
    </form>`,
    async () => {
      const email = document.getElementById('forgot-email').value;
      const r = await api('/auth/forgot-password', 'POST', { email });
      if (r.reset_token) {
        const out = document.getElementById('forgot-result');
        out.style.display = 'block';
        out.innerHTML = '<strong>Reset token (copy):</strong><br>' + r.reset_token + '<br><br>Use it on the reset password page.';
        showToast('Reset token generated', 'success');
        // Auto-show reset modal next
        setTimeout(() => showResetPassword(r.reset_token), 1500);
        throw new Error('keep-modal'); // prevents close
      } else {
        showToast(r.message || 'Done', 'success');
      }
    }, 'Send Reset');
}

function showResetPassword(prefilledToken = '') {
  renderModal('Reset Password',
    `<form id="reset-form" onsubmit="event.preventDefault();">
      <div class="form-group"><label>Reset Token</label><input type="text" id="reset-token" value="${escapeHtml(prefilledToken)}" required></div>
      <div class="form-group"><label>New Password (min 6 chars)</label><input type="password" id="reset-pw" minlength="6" required></div>
    </form>`,
    async () => {
      const token = document.getElementById('reset-token').value;
      const new_password = document.getElementById('reset-pw').value;
      await api('/auth/reset-password', 'POST', { token, new_password });
      showToast('Password reset successful. Please sign in.', 'success');
    }, 'Reset Password');
}

function showChangePassword() {
  renderModal('Change Password',
    `<form id="cp-form" onsubmit="event.preventDefault();">
      <div class="form-group"><label>Current Password</label><input type="password" id="cp-cur" required></div>
      <div class="form-group"><label>New Password (min 6 chars)</label><input type="password" id="cp-new" minlength="6" required></div>
    </form>`,
    async () => {
      const current_password = document.getElementById('cp-cur').value;
      const new_password = document.getElementById('cp-new').value;
      await api('/auth/change-password', 'POST', { current_password, new_password });
      showToast('Password updated', 'success');
    }, 'Update Password');
}

// ============ GEOFENCES ============

async function renderGeofences() {
  const content = document.getElementById('content');
  try {
    const [g, n] = await Promise.all([api('/geofences'), api('/neighborhoods')]);
    const items = (g.data || g) || [];
    const neighborhoods = (n.data || n) || [];
    content.innerHTML = `
      <div class="section-header">
        <h2>Geofences (${items.length})</h2>
        <button class="btn btn-primary" onclick="showGeofenceForm(null, ${JSON.stringify(neighborhoods).replace(/"/g, '&quot;')})">
          <span class="material-icons">add</span> New Geofence
        </button>
      </div>
      <div class="card"><div class="card-body">
        ${items.length === 0 ? emptyState('my_location', 'No geofences', 'Create a geofence to auto-trigger headlines when trucks enter a zone.') : `
        <table class="data-table"><thead><tr>
          <th>ID</th><th>Name</th><th>Neighborhood</th><th>Center</th><th>Radius (m)</th><th>Auto-Gen</th><th>Last Triggered</th><th></th>
        </tr></thead><tbody>
          ${items.map(it => `<tr>
            <td>${it.id}</td>
            <td>${escapeHtml(it.name || '-')}</td>
            <td>${escapeHtml(it.neighborhood_name || '-')}</td>
            <td>${it.center_latitude}, ${it.center_longitude}</td>
            <td>${it.radius_meters}</td>
            <td>${it.auto_generate ? 'Yes' : 'No'}</td>
            <td>${formatDate(it.last_triggered_at)}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteGeofence(${it.id})">Delete</button></td>
          </tr>`).join('')}
        </tbody></table>`}
      </div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

function showGeofenceForm(_id, neighborhoods) {
  const opts = (neighborhoods || []).map(n => `<option value="${n.id}">${escapeHtml(n.name)}</option>`).join('');
  renderModal('New Geofence',
    `<form id="gf-form" onsubmit="event.preventDefault();">
      <div class="form-group"><label>Name</label><input id="gf-name" type="text"></div>
      <div class="form-group"><label>Neighborhood</label><select id="gf-nb" required>${opts}</select></div>
      <div class="form-group"><label>Center Latitude</label><input id="gf-lat" type="number" step="0.000001" required></div>
      <div class="form-group"><label>Center Longitude</label><input id="gf-lng" type="number" step="0.000001" required></div>
      <div class="form-group"><label>Radius (meters)</label><input id="gf-rad" type="number" value="500"></div>
      <div class="form-group"><label><input id="gf-auto" type="checkbox" checked> Auto-generate AI on entry</label></div>
    </form>`,
    async () => {
      await api('/geofences', 'POST', {
        neighborhood_id: parseInt(document.getElementById('gf-nb').value),
        name: document.getElementById('gf-name').value,
        center_latitude: parseFloat(document.getElementById('gf-lat').value),
        center_longitude: parseFloat(document.getElementById('gf-lng').value),
        radius_meters: parseInt(document.getElementById('gf-rad').value) || 500,
        auto_generate: document.getElementById('gf-auto').checked,
      });
      showToast('Geofence created', 'success');
      navigate('geofences');
    }, 'Save');
}

async function deleteGeofence(id) {
  confirmAction('Delete this geofence?', async () => {
    await api(`/geofences/${id}`, 'DELETE');
    showToast('Geofence deleted', 'success');
    navigate('geofences');
  });
}

// ============ BRAND SAFETY ============

async function renderBrandSafety() {
  const content = document.getElementById('content');
  try {
    const [headlinesRes, scoresRes] = await Promise.all([
      api('/headlines'),
      api('/ai-extra/brand-safety/scores').catch(() => ({ data: [] })),
    ]);
    const headlines = (headlinesRes.data || headlinesRes) || [];
    const scores = (scoresRes.data || scoresRes) || [];
    content.innerHTML = `
      <div class="section-header">
        <h2>Brand Safety</h2>
      </div>
      <div class="card"><div class="card-header"><h3>Run Classifier</h3></div><div class="card-body">
        <form id="bs-form" onsubmit="event.preventDefault();">
          <div class="form-group"><label>Headline (or paste text)</label>
            <select id="bs-headline" onchange="document.getElementById('bs-text').value = this.options[this.selectedIndex].dataset.text || ''">
              <option value="">-- Select existing headline --</option>
              ${headlines.map(h => `<option value="${h.id}" data-text="${escapeHtml(h.headline_text)}">${escapeHtml((h.headline_text || '').slice(0,80))}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Headline text</label><textarea id="bs-text" rows="3" required></textarea></div>
          <button type="submit" class="btn btn-primary" onclick="runBrandSafety()"><span class="material-icons">verified_user</span> Evaluate</button>
        </form>
        <div id="bs-result" style="margin-top:1rem;"></div>
      </div></div>
      <div class="card mt-6"><div class="card-header"><h3>Recent Scores</h3></div><div class="card-body">
        ${scores.length === 0 ? '<p class="text-muted">No evaluations yet.</p>' : `
        <table class="data-table"><thead><tr>
          <th>ID</th><th>Headline</th><th>Score</th><th>Risk</th><th>When</th>
        </tr></thead><tbody>
          ${scores.map(s => `<tr>
            <td>${s.id}</td>
            <td>${escapeHtml((s.headline_text || '').slice(0, 60))}</td>
            <td>${s.overall_score ?? '-'}</td>
            <td>${statusBadge(s.risk_level)}</td>
            <td>${formatDate(s.created_at)}</td>
          </tr>`).join('')}
        </tbody></table>`}
      </div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function runBrandSafety() {
  const sel = document.getElementById('bs-headline');
  const headline_id = sel && sel.value ? parseInt(sel.value) : null;
  const headline_text = document.getElementById('bs-text').value;
  if (!headline_text) { showToast('Provide headline text', 'error'); return; }
  const out = document.getElementById('bs-result');
  out.innerHTML = '<div class="spinner"></div>';
  try {
    const r = await api('/ai-extra/brand-safety', 'POST', headline_id ? { headline_id } : { headline_text });
    const ev = r.evaluation || {};
    const risk = ev.risk_level || '-';
    const issues = (ev.issues || []).map(i => `<li><strong>${escapeHtml(i.severity || '')}:</strong> ${escapeHtml(i.violation || '')}</li>`).join('');
    const recs = (ev.recommended_changes || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');
    out.innerHTML = `
      <div class="card"><div class="card-body">
        <h4>Score: ${ev.overall_score || '-'} / 100</h4>
        <p>Risk: ${statusBadge(risk)} &nbsp; Passed: ${ev.passed ? 'Yes' : 'No'}</p>
        <p><strong>Rationale:</strong> ${escapeHtml(ev.rationale || '-')}</p>
        ${issues ? `<h5>Issues</h5><ul>${issues}</ul>` : ''}
        ${recs ? `<h5>Recommended changes</h5><ul>${recs}</ul>` : ''}
      </div></div>`;
    showToast('Evaluation complete', 'success');
  } catch (err) {
    out.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

// ============ WEATHER-AWARE ============

async function renderWeatherAware() {
  const content = document.getElementById('content');
  try {
    const [n, c] = await Promise.all([api('/neighborhoods'), api('/campaigns')]);
    const neighborhoods = (n.data || n) || [];
    const campaigns = (c.data || c) || [];
    content.innerHTML = `
      <div class="section-header"><h2>Weather/Event-Aware Headlines</h2></div>
      <div class="card"><div class="card-body">
        <form id="wa-form" onsubmit="event.preventDefault();">
          <div class="form-group"><label>Neighborhood</label>
            <select id="wa-nb" required>${neighborhoods.map(n => `<option value="${n.id}">${escapeHtml(n.name)}</option>`).join('')}</select></div>
          <div class="form-group"><label>Campaign</label>
            <select id="wa-c" required>${campaigns.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
          <div class="form-group"><label>Local Event (optional)</label><input id="wa-evt" placeholder="e.g. street fair tonight"></div>
          <button type="submit" class="btn btn-primary" onclick="runWeatherAware()"><span class="material-icons">cloud</span> Generate</button>
        </form>
        <div id="wa-result" style="margin-top:1rem;"></div>
      </div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function runWeatherAware() {
  const out = document.getElementById('wa-result');
  out.innerHTML = '<div class="spinner"></div>';
  try {
    const r = await api('/ai-extra/weather-aware', 'POST', {
      neighborhood_id: parseInt(document.getElementById('wa-nb').value),
      campaign_id: parseInt(document.getElementById('wa-c').value),
      event: document.getElementById('wa-evt').value || undefined,
    });
    const heads = (r.headlines || []).map(h => `<li><strong>${escapeHtml(h.headline)}</strong><br><small>${escapeHtml(h.weather_hook || '')} (urgency: ${escapeHtml(h.urgency || '')})</small></li>`).join('');
    out.innerHTML = `
      <div class="card"><div class="card-body">
        <p><strong>Weather:</strong> ${escapeHtml(r.weather || '-')}</p>
        <ul>${heads}</ul>
      </div></div>`;
    showToast('Generated', 'success');
  } catch (err) {
    out.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
  }
}

// ============ HEATMAP ============

async function renderHeatmap() {
  const content = document.getElementById('content');
  try {
    const r = await api('/ai-extra/heatmap');
    const points = r.points || [];
    if (points.length === 0) {
      content.innerHTML = emptyState('grid_on', 'No data yet', 'Add neighborhoods and analytics to see the heatmap.');
      return;
    }
    const max = Math.max(...points.map(p => p.impressions || 0)) || 1;
    content.innerHTML = `
      <div class="section-header"><h2>Impressions x Demographics Heatmap</h2></div>
      <div class="card"><div class="card-body">
        <p class="text-muted">Color intensity = impressions weighted by neighborhood income (proxy for ROI).</p>
        <table class="data-table"><thead><tr>
          <th>Neighborhood</th><th>Lat/Lng</th><th>Impressions</th><th>Median Income</th><th>Median Age</th><th>Heat</th>
        </tr></thead><tbody>
          ${points.map(p => {
            const intensity = Math.round((p.intensity || 0) * 100);
            const bg = `rgba(239, 68, 68, ${(p.intensity || 0).toFixed(2)})`;
            return `<tr>
              <td>${escapeHtml(p.name)}</td>
              <td>${p.lat ?? '-'}, ${p.lng ?? '-'}</td>
              <td>${formatNumber(p.impressions)}</td>
              <td>${p.median_income ? '$' + formatNumber(p.median_income) : '-'}</td>
              <td>${p.median_age || '-'}</td>
              <td><div style="height:24px;background:${bg};border-radius:4px;text-align:center;font-size:0.75rem;color:#fff;line-height:24px;">${intensity}%</div></td>
            </tr>`;
          }).join('')}
        </tbody></table>
      </div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

// ============ LIVE BILLBOARD (WebSocket) ============

let liveSocket = null;
const liveLog = [];

function renderLiveBillboard() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="section-header"><h2>Live Billboard Stream</h2></div>
    <div class="card"><div class="card-body">
      <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;">
        <input id="lb-truck" type="number" placeholder="Truck ID to subscribe" style="max-width:200px;">
        <button class="btn btn-primary" onclick="liveSubscribe()">Subscribe</button>
        <button class="btn btn-outline" onclick="liveDisconnect()">Disconnect</button>
        <span id="lb-status" class="badge">Disconnected</span>
      </div>
      <div style="margin-bottom:1rem;display:flex;gap:0.5rem;align-items:center;">
        <input id="lb-dispatch-truck" type="number" placeholder="Truck ID for dispatch" style="max-width:200px;">
        <input id="lb-dispatch-headline" type="number" placeholder="Headline ID (optional)" style="max-width:200px;">
        <button class="btn btn-success" onclick="liveDispatch()"><span class="material-icons">live_tv</span> Dispatch Best Headline</button>
      </div>
      <div id="lb-log" style="background:#0a0a0a;color:#0f0;padding:1rem;border-radius:6px;height:400px;overflow:auto;font-family:monospace;font-size:0.85rem;"></div>
    </div></div>`;
}

function liveSubscribe() {
  const truckId = document.getElementById('lb-truck').value;
  if (liveSocket) { try { liveSocket.close(); } catch {} liveSocket = null; }
  try {
    liveSocket = new WebSocket(WS_URL);
  } catch (e) {
    showToast('WS connect failed: ' + e.message, 'error'); return;
  }
  liveSocket.onopen = () => {
    document.getElementById('lb-status').textContent = 'Connected';
    document.getElementById('lb-status').className = 'badge badge-active';
    if (truckId) liveSocket.send(JSON.stringify({ action: 'subscribe', channel: `truck:${truckId}` }));
    liveSocket.send(JSON.stringify({ action: 'subscribe', channel: 'all' }));
    appendLive(`[connected] subscribed to truck:${truckId || 'all'}`);
  };
  liveSocket.onmessage = (ev) => {
    try { appendLive(ev.data); } catch {}
  };
  liveSocket.onclose = () => {
    document.getElementById('lb-status').textContent = 'Disconnected';
    document.getElementById('lb-status').className = 'badge';
    appendLive('[disconnected]');
  };
  liveSocket.onerror = (e) => { appendLive('[error] ' + (e.message || 'ws error')); };
}

function liveDisconnect() {
  if (liveSocket) { try { liveSocket.close(); } catch {} liveSocket = null; }
}

async function liveDispatch() {
  const truck_id = parseInt(document.getElementById('lb-dispatch-truck').value);
  const hid = document.getElementById('lb-dispatch-headline').value;
  const headline_id = hid ? parseInt(hid) : undefined;
  if (!truck_id) { showToast('truck_id required', 'error'); return; }
  try {
    const r = await api('/ai-extra/live-dispatch', 'POST', { truck_id, headline_id });
    showToast('Dispatched headline #' + (r.headline?.id || ''), 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

function appendLive(text) {
  const el = document.getElementById('lb-log');
  if (!el) return;
  const line = document.createElement('div');
  line.textContent = `${new Date().toLocaleTimeString()} ${text}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  liveLog.push(text);
  if (liveLog.length > 500) liveLog.splice(0, liveLog.length - 500);
}

// ============ BUDGET ALLOCATE ============

async function renderBudgetAllocate() {
  const content = document.getElementById('content');
  try {
    const [c, n] = await Promise.all([api('/campaigns'), api('/neighborhoods')]);
    const campaigns = (c.data || c) || [];
    const neighborhoods = (n.data || n) || [];
    content.innerHTML = `
      <div class="section-header"><h2>AI Budget Allocator</h2></div>
      <div class="card"><div class="card-body">
        <form id="ba-form" onsubmit="event.preventDefault(); runBudgetAllocate();">
          <div class="form-group"><label>Campaign (optional)</label>
            <select id="ba-c"><option value="">-- none --</option>${campaigns.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
          <div class="form-group"><label>Total Budget (USD)</label>
            <input type="number" id="ba-total" min="1" step="1" value="10000" required></div>
          <div class="form-group"><label>Limit Neighborhoods (optional, comma-sep IDs)</label>
            <input id="ba-nbs" placeholder="e.g. 1,2,3"></div>
          <button type="submit" class="btn btn-primary"><span class="material-icons">payments</span> Allocate</button>
        </form>
        <div id="ba-result" style="margin-top:1rem;"></div>
        <p class="text-muted" style="margin-top:0.5rem;font-size:0.85rem;">Available neighborhoods: ${neighborhoods.length}</p>
      </div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function runBudgetAllocate() {
  const out = document.getElementById('ba-result');
  out.innerHTML = '<div class="spinner"></div>';
  try {
    const cid = document.getElementById('ba-c').value;
    const total = parseFloat(document.getElementById('ba-total').value);
    const ids = (document.getElementById('ba-nbs').value || '')
      .split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    const body = { total_budget: total };
    if (cid) body.campaign_id = parseInt(cid);
    if (ids.length > 0) body.neighborhood_ids = ids;
    const r = await api('/ai/budget-allocate', 'POST', body);
    const a = r.allocation || {};
    const rows = (a.per_neighborhood || []).map(p => `<tr>
      <td>${p.neighborhood_id}</td><td>${escapeHtml(p.neighborhood_name || '')}</td>
      <td>$${formatNumber(p.allocated_usd || 0)}</td><td>${(p.share_pct || 0).toFixed(1)}%</td>
      <td>${escapeHtml(p.rationale || '')}</td>
    </tr>`).join('');
    out.innerHTML = `
      <div class="card"><div class="card-body">
        <p><strong>Strategy:</strong> ${escapeHtml(a.strategy_summary || '-')}</p>
        <p><strong>Totals:</strong> Allocated $${formatNumber((a.totals || {}).allocated_usd || 0)} / Unallocated $${formatNumber((a.totals || {}).unallocated_usd || 0)}</p>
        <table class="data-table"><thead><tr><th>NB ID</th><th>Name</th><th>Allocated</th><th>Share</th><th>Rationale</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No allocation</td></tr>'}</tbody></table>
      </div></div>`;
    showToast('Allocation generated', 'success');
  } catch (err) {
    if (err.status === 503) {
      out.innerHTML = `<div class="alert alert-error">AI service is unavailable (missing OPENROUTER_API_KEY).</div>`;
    } else {
      out.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }
}

// ============ DEMAND FORECAST ============

async function renderDemandForecast() {
  const content = document.getElementById('content');
  try {
    const n = await api('/neighborhoods');
    const neighborhoods = (n.data || n) || [];
    content.innerHTML = `
      <div class="section-header"><h2>AI Demand Forecast</h2></div>
      <div class="card"><div class="card-body">
        <form id="df-form" onsubmit="event.preventDefault(); runDemandForecast();">
          <div class="form-group"><label>Neighborhood (optional)</label>
            <select id="df-nb"><option value="">-- all (sample) --</option>${neighborhoods.map(n => `<option value="${n.id}">${escapeHtml(n.name)}</option>`).join('')}</select></div>
          <div class="form-group"><label>Horizon (hours)</label>
            <input type="number" id="df-h" min="1" max="168" value="24"></div>
          <button type="submit" class="btn btn-primary"><span class="material-icons">trending_up</span> Forecast</button>
        </form>
        <div id="df-result" style="margin-top:1rem;"></div>
      </div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function runDemandForecast() {
  const out = document.getElementById('df-result');
  out.innerHTML = '<div class="spinner"></div>';
  try {
    const nb = document.getElementById('df-nb').value;
    const h = parseInt(document.getElementById('df-h').value) || 24;
    const body = { horizon_hours: h };
    if (nb) body.neighborhood_id = parseInt(nb);
    const r = await api('/ai/demand-forecast', 'POST', body);
    const f = r.forecast || {};
    const rows = (f.per_neighborhood || []).map(p => `<tr>
      <td>${p.neighborhood_id}</td><td>${escapeHtml(p.neighborhood_name || '')}</td>
      <td>${p.expected_traffic_index ?? '-'}</td>
      <td>${formatNumber(p.expected_impressions || 0)}</td>
      <td>${escapeHtml(p.peak_window || '')}</td>
      <td>${escapeHtml(p.confidence || '')}</td>
    </tr>`).join('');
    out.innerHTML = `
      <div class="card"><div class="card-body">
        <p><strong>Horizon:</strong> ${f.horizon_hours || h}h</p>
        <p><strong>Notes:</strong> ${escapeHtml(f.global_notes || '-')}</p>
        <table class="data-table"><thead><tr><th>NB ID</th><th>Name</th><th>Traffic Idx</th><th>Impressions</th><th>Peak</th><th>Conf.</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">No forecast</td></tr>'}</tbody></table>
      </div></div>`;
    showToast('Forecast generated', 'success');
  } catch (err) {
    if (err.status === 503) {
      out.innerHTML = `<div class="alert alert-error">AI service is unavailable (missing OPENROUTER_API_KEY).</div>`;
    } else {
      out.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }
}

// ============ DYNAMIC PRICING ============

async function renderDynamicPricing() {
  const content = document.getElementById('content');
  try {
    const [c, n] = await Promise.all([api('/campaigns'), api('/neighborhoods')]);
    const campaigns = (c.data || c) || [];
    const neighborhoods = (n.data || n) || [];
    content.innerHTML = `
      <div class="section-header"><h2>AI Dynamic Pricing</h2></div>
      <div class="card"><div class="card-body">
        <form id="dp-form" onsubmit="event.preventDefault(); runDynamicPricing();">
          <div class="form-group"><label>Campaign (optional)</label>
            <select id="dp-c"><option value="">-- none --</option>${campaigns.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
          <div class="form-group"><label>Neighborhood (optional)</label>
            <select id="dp-nb"><option value="">-- none --</option>${neighborhoods.map(n => `<option value="${n.id}">${escapeHtml(n.name)}</option>`).join('')}</select></div>
          <div class="form-group"><label>Base CPM (USD)</label>
            <input type="number" id="dp-base" min="0.01" step="0.01" value="5.00"></div>
          <div class="form-group"><label>Time Window</label>
            <input id="dp-tw" placeholder="e.g. Fri 17:00-20:00"></div>
          <button type="submit" class="btn btn-primary"><span class="material-icons">price_change</span> Recommend</button>
        </form>
        <div id="dp-result" style="margin-top:1rem;"></div>
      </div></div>`;
  } catch (err) { content.innerHTML = emptyState('error', 'Error', err.message); }
}

async function runDynamicPricing() {
  const out = document.getElementById('dp-result');
  out.innerHTML = '<div class="spinner"></div>';
  try {
    const cid = document.getElementById('dp-c').value;
    const nb = document.getElementById('dp-nb').value;
    const base = parseFloat(document.getElementById('dp-base').value) || 5.0;
    const tw = document.getElementById('dp-tw').value || '';
    const body = { base_cpm: base, time_window: tw };
    if (cid) body.campaign_id = parseInt(cid);
    if (nb) body.neighborhood_id = parseInt(nb);
    const r = await api('/ai/dynamic-pricing', 'POST', body);
    const a = r.recommendation || {};
    const factors = (a.factors || []).map(f => `<tr><td>${escapeHtml(f.name||'')}</td><td>${(f.weight ?? 0)}</td><td>${escapeHtml(f.direction||'')}</td></tr>`).join('');
    out.innerHTML = `
      <div class="card"><div class="card-body">
        <p><strong>Effective CPM:</strong> $${(a.effective_cpm ?? 0).toFixed ? a.effective_cpm.toFixed(2) : a.effective_cpm} (multiplier ${a.multiplier ?? '-'}x of base $${(r.base_cpm ?? base).toFixed(2)})</p>
        <p><strong>Demand:</strong> ${escapeHtml(a.demand_signal||'-')} · <strong>Supply:</strong> ${escapeHtml(a.supply_signal||'-')} · <strong>Confidence:</strong> ${escapeHtml(a.confidence||'-')}</p>
        <p><strong>Rationale:</strong> ${escapeHtml(a.rationale||'-')}</p>
        ${factors ? `<table class="data-table"><thead><tr><th>Factor</th><th>Weight</th><th>Direction</th></tr></thead><tbody>${factors}</tbody></table>` : ''}
      </div></div>`;
    showToast('Pricing recommendation ready', 'success');
  } catch (err) {
    if (err.status === 503) {
      out.innerHTML = `<div class="alert alert-error">AI service is unavailable (missing OPENROUTER_API_KEY).</div>`;
    } else {
      out.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }
}

async function renderRouteArbitrage() {
  const content = document.getElementById('content');
  try {
    const data = await api('/route-impression-arbitrage');
    const cards = Object.entries(data.summary || {}).map(([k, v]) => `<div class="stat-card"><div class="stat-label">${escapeHtml(k.replaceAll('_', ' '))}</div><div class="stat-value">${escapeHtml(v)}</div></div>`).join('');
    const rows = (data.routes || []).map(r => `<tr><td>${escapeHtml(r.route)}</td><td>$${escapeHtml(r.cpm)}</td><td>${formatNumber(r.impressions)}</td><td>${escapeHtml(r.action)}</td></tr>`).join('');
    content.innerHTML = `<div class="section-header"><h2>Route Impression Arbitrage</h2></div><div class="stats-grid">${cards}</div><div class="card"><div class="card-body"><table class="data-table"><thead><tr><th>Route</th><th>CPM</th><th>Impressions</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  } catch (err) {
    content.innerHTML = emptyState('error', 'Error', err.message);
  }
}

// ============ TABLE FILTER ============

function filterTable(input, tableId) {
  const query = input.value.toLowerCase();
  const table = document.getElementById(tableId);
  if (!table) return;
  const rows = table.querySelectorAll('tbody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
}

// ============ INIT ============

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();

  // Close sidebar on nav click (mobile)
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('sidebar').classList.remove('open');
    });
  });
});
