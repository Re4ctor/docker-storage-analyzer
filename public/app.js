const state = { report: null };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const socketInput = $('#socketInput');
const analyzeBtn = $('#analyzeBtn');
const resultsDiv = $('#results');
const errorContainer = $('#errorContainer');
const statsGrid = $('#statsGrid');
const pieChart = $('#pieChart');
const chartLegend = $('#chartLegend');
const imagesTable = $('#imagesTable tbody');
const containersTable = $('#containersTable tbody');
const volumesTable = $('#volumesTable tbody');
const recList = $('#recList');
const pruneBtn = $('#pruneBtn');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showError(msg) {
  errorContainer.innerHTML = `<div class="error-msg">${msg}</div>`;
}

function clearError() {
  errorContainer.innerHTML = '';
}

analyzeBtn.addEventListener('click', async () => {
  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = '<span class="spinner"></span>Analyzing...';
  clearError();
  resultsDiv.style.display = 'none';

  try {
    const socket = socketInput.value.trim() || '/var/run/docker.sock';
    const resp = await fetch(`/api/analyze?dockerSocket=${encodeURIComponent(socket)}`, { method: 'POST' });
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || 'Analysis failed');
    state.report = json.data;
    renderReport(json.data);
    resultsDiv.style.display = 'block';
  } catch (err) {
    showError(`Error: ${err.message}`);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze';
  }
});

function renderReport(report) {
  renderStats(report);
  renderPieChart(report);
  renderImages(report.images);
  renderContainers(report.containers);
  renderVolumes(report.volumes);
  renderRecommendations(report.recommendations);
}

function renderStats(report) {
  const imagesSize = report.images.reduce((s, i) => s + i.size, 0);
  const volumesSize = report.volumes.reduce((s, v) => s + v.size, 0);
  const containersSize = report.containers.reduce((s, c) => s + c.logSize + c.writableLayerSize, 0);
  const cacheSize = report.buildCache.reduce((s, e) => s + e.size, 0);

  statsGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Used</div>
      <div class="stat-value" style="color:var(--accent)">${formatBytes(report.totalUsed)}</div>
      <div class="stat-detail">across all categories</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Images</div>
      <div class="stat-value" style="color:#58a6ff">${formatBytes(imagesSize)}</div>
      <div class="stat-detail">${report.images.length} images</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Volumes</div>
      <div class="stat-value" style="color:#bc8cff">${formatBytes(volumesSize)}</div>
      <div class="stat-detail">${report.volumes.length} volumes</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Containers</div>
      <div class="stat-value" style="color:#3fb950">${formatBytes(containersSize)}</div>
      <div class="stat-detail">${report.containers.length} containers</div>
    </div>
  `;
}

function renderPieChart(report) {
  const imagesSize = report.images.reduce((s, i) => s + i.size, 0);
  const volumesSize = report.volumes.reduce((s, v) => s + v.size, 0);
  const containersSize = report.containers.reduce((s, c) => s + c.logSize + c.writableLayerSize, 0);
  const cacheSize = report.buildCache.reduce((s, e) => s + e.size, 0);
  const total = imagesSize + volumesSize + containersSize + cacheSize || 1;

  const slices = [
    { label: 'Images', value: imagesSize, color: '#58a6ff' },
    { label: 'Volumes', value: volumesSize, color: '#bc8cff' },
    { label: 'Containers', value: containersSize, color: '#3fb950' },
    { label: 'Build Cache', value: cacheSize, color: '#d29922' },
  ].filter(s => s.value > 0);

  const cx = 120, cy = 120, r = 100;
  let cumulative = 0;
  let paths = '';

  for (const slice of slices) {
    const angle = (slice.value / total) * 360;
    const startAngle = cumulative;
    const endAngle = cumulative + angle;
    cumulative += angle;

    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;

    paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${slice.color}" stroke="#0d1117" stroke-width="2"/>`;
  }

  pieChart.innerHTML = `<svg width="240" height="240" viewBox="0 0 240 240">${paths}<circle cx="${cx}" cy="${cy}" r="50" fill="#1c2333"/><text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="13" font-weight="700" fill="#e6edf3">${slices.length} cats</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="11" fill="#8b949e">${formatBytes(total)}</text></svg>`;

  const legendHtml = slices.map(s => `
    <div class="legend-item">
      <span class="legend-color" style="background:${s.color}"></span>
      <span>${s.label}</span>
      <span style="color:var(--text-secondary)">${formatBytes(s.value)} (${((s.value/total)*100).toFixed(1)}%)</span>
    </div>
  `).join('');
  chartLegend.innerHTML = legendHtml;
}

function renderImages(images) {
  if (!images.length) {
    imagesTable.innerHTML = '<tr><td colspan="4" style="color:var(--text-secondary)">No images found.</td></tr>';
    return;
  }
  imagesTable.innerHTML = images.slice(0, 50).map(img => `
    <tr>
      <td>${img.repoTag}</td>
      <td>${formatBytes(img.size)}</td>
      <td>${formatDate(img.created)}</td>
      <td>${img.containersCount}</td>
    </tr>
  `).join('');
}

function renderContainers(containers) {
  if (!containers.length) {
    containersTable.innerHTML = '<tr><td colspan="5" style="color:var(--text-secondary)">No containers found.</td></tr>';
    return;
  }
  containersTable.innerHTML = containers.slice(0, 50).map(c => `
    <tr>
      <td>${c.name}</td>
      <td>${c.image}</td>
      <td>${c.status}</td>
      <td>${formatBytes(c.logSize)}</td>
      <td>${formatBytes(c.writableLayerSize)}</td>
    </tr>
  `).join('');
}

function renderVolumes(volumes) {
  if (!volumes.length) {
    volumesTable.innerHTML = '<tr><td colspan="4" style="color:var(--text-secondary)">No volumes found.</td></tr>';
    return;
  }
  volumesTable.innerHTML = volumes.slice(0, 50).map(v => `
    <tr>
      <td>${v.name}</td>
      <td>${formatBytes(v.size)}</td>
      <td>${v.containers.length || 0}</td>
      <td>${v.driver}</td>
    </tr>
  `).join('');
}

function renderRecommendations(recommendations) {
  if (!recommendations.length) {
    recList.innerHTML = '<div style="color:var(--green);padding:12px">Everything looks clean — no recommendations.</div>';
    pruneBtn.disabled = true;
    return;
  }

  recList.innerHTML = recommendations.map((rec, i) => `
    <div class="rec-card">
      <input type="checkbox" id="rec-${i}" data-index="${i}" checked />
      <label for="rec-${i}">
        <div class="rec-action">${rec.description}</div>
        <div class="rec-desc">${rec.action} | ${rec.command || 'N/A'}</div>
      </label>
      <span class="rec-size">${formatBytes(rec.estimatedSpace)}</span>
    </div>
  `).join('');

  pruneBtn.disabled = false;
  recList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const anyChecked = !!recList.querySelector('input[type="checkbox"]:checked');
      pruneBtn.disabled = !anyChecked;
    });
  });
}

pruneBtn.addEventListener('click', async () => {
  const checkedBoxes = recList.querySelectorAll('input[type="checkbox"]:checked');
  if (!checkedBoxes.length) return;

  pruneBtn.disabled = true;
  pruneBtn.textContent = 'Pruning...';

  for (const cb of checkedBoxes) {
    const idx = parseInt(cb.dataset.index);
    const rec = state.report.recommendations[idx];
    try {
      const resp = await fetch('/api/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: rec.category, ids: rec.items }),
      });
      const json = await resp.json();
      if (json.success) {
        cb.parentElement.style.opacity = '0.4';
        cb.disabled = true;
      }
    } catch (err) {
      showError(`Prune failed for ${rec.action}: ${err.message}`);
    }
  }

  pruneBtn.textContent = 'Prune Selected';
  const remaining = recList.querySelectorAll('input[type="checkbox"]:not(:disabled):checked');
  pruneBtn.disabled = !remaining.length;
});
