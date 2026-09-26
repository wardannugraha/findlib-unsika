// ==============================================================================
// 📍 FINDLIB UNSIKA - KIOSK ON-SITE JAVASCRIPT (SEARCH, FILTER & SMART RACK LOCATE)
// ==============================================================================
// FindLib UNSIKA (Find your Library) - Terminal Navigasi Rak Buku & IoT
// Sistem Filter Popup Modal Terpadu (Multi-Category, Multi-Prodi, Custom Year)
// ==============================================================================

// State Filter Aktif Kiosk
let selectedKioskCategories = new Set();
let selectedKioskProdis = new Set();
let kioskYearFromVal = '';
let kioskYearToVal = '';
let currentKioskSearchQuery = '';

// Draft state di dalam Modal Filter
let tempKioskCategories = new Set();
let tempKioskProdis = new Set();
let tempKioskYearFrom = '';
let tempKioskYearTo = '';

// Data Store
let kioskBooks = [];
let rawKioskCategories = [];
let rawKioskProdis = [];
let countdownInterval = null;
let isRackVisible = true;

// Utility Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Buka / Tutup Panel Miniatur Rak Buku
function toggleVirtualRack(forceState) {
  if (typeof forceState === 'boolean') {
    isRackVisible = forceState;
  } else {
    isRackVisible = !isRackVisible;
  }

  const grid = document.getElementById('kioskMainGrid');
  const panel = document.getElementById('rackVisualizerPanel');
  const btnText = document.getElementById('toggleRackBtnText');

  if (isRackVisible) {
    if (grid) grid.classList.remove('rack-collapsed');
    if (panel) panel.classList.remove('hidden-panel');
    if (btnText) btnText.textContent = 'Sembunyikan Rak';
  } else {
    if (grid) grid.classList.add('rack-collapsed');
    if (panel) panel.classList.add('hidden-panel');
    if (btnText) btnText.textContent = 'Buka Miniatur Rak';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // 🔐 Auth Guard untuk Kiosk On-Site
  const token = localStorage.getItem('libnav_admin_token');

  if (!token) {
    window.location.href = '/login?redirect=/kiosk';
    return;
  }

  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    if (!data.authenticated) {
      localStorage.removeItem('libnav_admin_token');
      window.location.href = '/login?redirect=/kiosk';
      return;
    }
  } catch (err) {
    console.error('Kiosk Auth verification error:', err);
    window.location.href = '/login?redirect=/kiosk';
    return;
  }

  checkMqttStatus();
  initKioskModalBackdropEvents();
  initKioskSearchEvents();

  await Promise.all([
    loadKioskCategories(),
    loadKioskProdi()
  ]);

  loadKioskBooks();
});

// Modal Backdrop Click & ESC key handler
function initKioskModalBackdropEvents() {
  window.addEventListener('click', (e) => {
    const filterModal = document.getElementById('kioskFilterModal');
    const bookModal = document.getElementById('kioskBookDetailModal');

    if (e.target === filterModal) {
      closeKioskFilterModal();
    }
    if (e.target === bookModal) {
      closeKioskBookModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeKioskFilterModal();
      closeKioskBookModal();
    }
  });
}

// Search Events Listener
function initKioskSearchEvents() {
  const searchInput = document.getElementById('kioskSearchInput');
  const searchBtn = document.getElementById('kioskSearchBtn');

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      currentKioskSearchQuery = searchInput.value.trim();
      loadKioskBooks();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        currentKioskSearchQuery = searchInput.value.trim();
        loadKioskBooks();
      }
    });
  }

  const yf = document.getElementById('kioskFilterYearFrom');
  const yt = document.getElementById('kioskFilterYearTo');
  if (yf) yf.addEventListener('input', renderKioskYearPresets);
  if (yt) yt.addEventListener('input', renderKioskYearPresets);
}

// Cek Status MQTT & Status Mode Demo IoT
async function checkMqttStatus() {
  try {
    const res = await fetch('/api/system-status');
    const data = await res.json();
    const pill = document.getElementById('mqttStatusPill');
    const text = document.getElementById('mqttStatusText');
    const demoPill = document.getElementById('kioskDemoPill');
    const demoText = document.getElementById('kioskDemoText');

    if (pill && text) {
      if (data.mqtt && data.mqtt.status === 'CONNECTED') {
        pill.style.background = 'rgba(16, 185, 129, 0.2)';
        pill.style.color = '#34D399';
        text.textContent = 'Rak LED Online';
      } else {
        pill.style.background = 'rgba(245, 158, 11, 0.2)';
        pill.style.color = '#FBBF24';
        text.textContent = 'Rak LED Siap';
      }
    }

    if (demoPill && data.demoMode && data.demoMode.enabled) {
      demoPill.style.display = 'inline-flex';
      if (demoText) demoText.textContent = `Mode Demo Rak (${data.demoMode.demoBooksCount} Buku)`;
    } else if (demoPill) {
      demoPill.style.display = 'none';
    }
  } catch (e) {
    const text = document.getElementById('mqttStatusText');
    if (text) text.textContent = 'Standby';
  }
}

// Ambil Kategori Dinamis
async function loadKioskCategories() {
  try {
    const res = await fetch('/api/categories');
    rawKioskCategories = await res.json();
    renderKioskCategoryChips();
  } catch (err) {
    console.error('Error load categories:', err);
  }
}

// Ambil Daftar Program Studi Dinamis
async function loadKioskProdi() {
  try {
    const res = await fetch('/api/prodi');
    const data = await res.json();
    rawKioskProdis = Array.isArray(data) ? data : (data.active || data.all || []);
    renderKioskProdiChips();
  } catch (err) {
    console.error('Error load prodi:', err);
  }
}

// BUKA MODAL FILTER KIOSK
function openKioskFilterModal() {
  tempKioskCategories = new Set(selectedKioskCategories);
  tempKioskProdis = new Set(selectedKioskProdis);
  tempKioskYearFrom = kioskYearFromVal;
  tempKioskYearTo = kioskYearToVal;

  const yf = document.getElementById('kioskFilterYearFrom');
  if (yf) yf.value = tempKioskYearFrom;

  const yt = document.getElementById('kioskFilterYearTo');
  if (yt) yt.value = tempKioskYearTo;

  renderKioskCategoryChips();
  renderKioskProdiChips();
  renderKioskYearPresets();

  const modal = document.getElementById('kioskFilterModal');
  if (modal) modal.classList.add('open');
}

// TUTUP MODAL FILTER KIOSK
function closeKioskFilterModal() {
  const modal = document.getElementById('kioskFilterModal');
  if (modal) modal.classList.remove('open');
}

// TERAPKAN FILTER DARI MODAL KIOSK
function applyKioskFilterModal() {
  const yf = document.getElementById('kioskFilterYearFrom');
  const yt = document.getElementById('kioskFilterYearTo');

  selectedKioskCategories = new Set(tempKioskCategories);
  selectedKioskProdis = new Set(tempKioskProdis);
  kioskYearFromVal = yf ? yf.value.trim() : '';
  kioskYearToVal = yt ? yt.value.trim() : '';

  closeKioskFilterModal();
  loadKioskBooks();
}

// RESET FILTER DARI DALAM MODAL KIOSK
function resetAllKioskFiltersFromModal() {
  tempKioskCategories.clear();
  tempKioskProdis.clear();

  const yf = document.getElementById('kioskFilterYearFrom');
  if (yf) yf.value = '';

  const yt = document.getElementById('kioskFilterYearTo');
  if (yt) yt.value = '';

  renderKioskCategoryChips();
  renderKioskProdiChips();
  renderKioskYearPresets();
}

// RESET SEMUA FILTER LENGKAP KIOSK
function resetAllKioskFilters() {
  selectedKioskCategories.clear();
  selectedKioskProdis.clear();
  tempKioskCategories.clear();
  tempKioskProdis.clear();
  kioskYearFromVal = '';
  kioskYearToVal = '';
  currentKioskSearchQuery = '';

  const searchInput = document.getElementById('kioskSearchInput');
  if (searchInput) searchInput.value = '';

  const yf = document.getElementById('kioskFilterYearFrom');
  if (yf) yf.value = '';

  const yt = document.getElementById('kioskFilterYearTo');
  if (yt) yt.value = '';

  renderKioskCategoryChips();
  renderKioskProdiChips();
  loadKioskBooks();
}

// Render Chip Kategori Kiosk
function renderKioskCategoryChips() {
  const container = document.getElementById('kioskCategoryCheckboxList');
  if (!container) return;

  if (rawKioskCategories.length === 0) {
    container.innerHTML = '<div class="filter-empty-msg">Tidak ada kategori tersedia</div>';
    return;
  }

  container.innerHTML = rawKioskCategories.map(cat => {
    const isChecked = tempKioskCategories.has(cat.id);

    return `
      <div class="filter-chip-card ${isChecked ? 'active' : ''}" onclick="toggleTempKioskCategory('${cat.id}')">
        <span class="chip-checkbox-box"><i class="fa-solid fa-check"></i></span>
        <span class="chip-label" title="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</span>
      </div>
    `;
  }).join('');
}

// Render Chip Prodi Kiosk
function renderKioskProdiChips() {
  const container = document.getElementById('kioskProdiCheckboxList');
  if (!container) return;

  if (rawKioskProdis.length === 0) {
    container.innerHTML = '<div class="filter-empty-msg">Tidak ada data program studi</div>';
    return;
  }

  container.innerHTML = rawKioskProdis.map(p => {
    const isChecked = tempKioskProdis.has(p);

    return `
      <div class="filter-chip-card ${isChecked ? 'active' : ''}" onclick="toggleTempKioskProdi('${escapeHtml(p)}')">
        <span class="chip-checkbox-box"><i class="fa-solid fa-check"></i></span>
        <span class="chip-label" title="${escapeHtml(p)}">${escapeHtml(p)}</span>
      </div>
    `;
  }).join('');
}

// Toggle Kategori di dalam Modal Kiosk
function toggleTempKioskCategory(catId) {
  if (tempKioskCategories.has(catId)) {
    tempKioskCategories.delete(catId);
  } else {
    tempKioskCategories.add(catId);
  }
  renderKioskCategoryChips();
}

// Toggle Prodi di dalam Modal Kiosk
function toggleTempKioskProdi(prodiName) {
  if (tempKioskProdis.has(prodiName)) {
    tempKioskProdis.delete(prodiName);
  } else {
    tempKioskProdis.add(prodiName);
  }
  renderKioskProdiChips();
}

// Pilih Semua / Batal Semua Kategori Kiosk
function toggleAllKioskCategories() {
  const allSelected = rawKioskCategories.every(c => tempKioskCategories.has(c.id));

  if (allSelected) {
    tempKioskCategories.clear();
  } else {
    rawKioskCategories.forEach(c => tempKioskCategories.add(c.id));
  }
  renderKioskCategoryChips();
}

// Pilih Semua / Batal Semua Prodi Kiosk
function toggleAllKioskProdis() {
  const allSelected = rawKioskProdis.every(p => tempKioskProdis.has(p));

  if (allSelected) {
    tempKioskProdis.clear();
  } else {
    rawKioskProdis.forEach(p => tempKioskProdis.add(p));
  }
  renderKioskProdiChips();
}

// Render Dynamic Preset Tahun Kiosk berdasarkan Tahun Berjalan (new Date().getFullYear())
function renderKioskYearPresets() {
  const container = document.getElementById('kioskYearQuickPresets');
  if (!container) return;

  const currentYear = new Date().getFullYear();
  const yf = document.getElementById('kioskFilterYearFrom');
  const yt = document.getElementById('kioskFilterYearTo');
  if (yt && !yt.getAttribute('placeholder')) yt.setAttribute('placeholder', currentYear);

  const presets = [
    { label: 'Semua Tahun', from: null, to: null },
    { label: `Tahun ${currentYear}`, from: currentYear, to: currentYear },
    { label: '1 Tahun Terakhir', from: currentYear - 1, to: currentYear },
    { label: '3 Tahun Terakhir', from: currentYear - 3, to: currentYear },
    { label: '5 Tahun Terakhir', from: currentYear - 5, to: currentYear },
    { label: '10 Tahun Terakhir', from: currentYear - 10, to: currentYear }
  ];

  const currentFrom = yf ? yf.value.trim() : '';
  const currentTo = yt ? yt.value.trim() : '';

  container.innerHTML = presets.map(p => {
    let isActive = false;
    if (p.from === null && p.to === null) {
      isActive = !currentFrom && !currentTo;
    } else if (p.from !== null && p.to !== null) {
      isActive = String(p.from) === currentFrom && String(p.to) === currentTo;
    }

    const fromParam = p.from !== null ? p.from : 'null';
    const toParam = p.to !== null ? p.to : 'null';

    return `
      <button type="button" class="btn-preset-chip ${isActive ? 'active' : ''}" onclick="setKioskYearPreset(${fromParam}, ${toParam})">
        ${p.label}
      </button>
    `;
  }).join('');
}

// Quick Preset Tahun Kiosk
function setKioskYearPreset(from, to) {
  const yf = document.getElementById('kioskFilterYearFrom');
  const yt = document.getElementById('kioskFilterYearTo');
  if (yf) yf.value = from !== null && from !== undefined ? from : '';
  if (yt) yt.value = to !== null && to !== undefined ? to : '';

  renderKioskYearPresets();
}

// Update Indikator Angka Filter Aktif pada Tombol "Filter Koleksi" Kiosk
function updateKioskFilterActiveBadge() {
  let activeCount = 0;
  activeCount += selectedKioskCategories.size;
  activeCount += selectedKioskProdis.size;
  if (kioskYearFromVal || kioskYearToVal) activeCount += 1;

  const badge = document.getElementById('kioskFilterIndicatorBadge');
  const btn = document.getElementById('btnKioskFilterModal');

  if (badge && btn) {
    if (activeCount > 0) {
      badge.textContent = activeCount;
      badge.style.display = 'inline-flex';
      btn.classList.add('has-active-filters');
    } else {
      badge.style.display = 'none';
      btn.classList.remove('has-active-filters');
    }
  }
}

// Render Active Filter Pills Kiosk (Tags di atas katalog)
function renderKioskActiveFilterPills() {
  const container = document.getElementById('kioskActiveFilterPills');
  if (!container) return;

  const pills = [];

  // Query search pill
  if (currentKioskSearchQuery) {
    pills.push(`
      <span class="filter-pill">
        <i class="fa-solid fa-magnifying-glass"></i> "${escapeHtml(currentKioskSearchQuery)}"
        <button type="button" class="pill-remove-btn" onclick="clearKioskSearchFilter()" title="Hapus kata kunci">&times;</button>
      </span>
    `);
  }

  // Category pills
  selectedKioskCategories.forEach(catId => {
    const catObj = rawKioskCategories.find(c => c.id === catId);
    const catName = catObj ? catObj.name : catId;
    pills.push(`
      <span class="filter-pill category-pill">
        <i class="fa-solid fa-tag"></i> ${escapeHtml(catName)}
        <button type="button" class="pill-remove-btn" onclick="removeKioskCategoryFilter('${catId}')" title="Hapus filter kategori">&times;</button>
      </span>
    `);
  });

  // Prodi pills
  selectedKioskProdis.forEach(prodi => {
    pills.push(`
      <span class="filter-pill prodi-pill">
        <i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(prodi)}
        <button type="button" class="pill-remove-btn" onclick="removeKioskProdiFilter('${escapeHtml(prodi)}')" title="Hapus filter prodi">&times;</button>
      </span>
    `);
  });

  // Year Range pill
  if (kioskYearFromVal || kioskYearToVal) {
    let yearLabel = '';
    if (kioskYearFromVal && kioskYearToVal) {
      if (kioskYearFromVal === kioskYearToVal) {
        yearLabel = `${kioskYearFromVal}`;
      } else {
        yearLabel = `${kioskYearFromVal} - ${kioskYearToVal}`;
      }
    } else if (kioskYearFromVal) {
      yearLabel = `≥ ${kioskYearFromVal}`;
    } else if (kioskYearToVal) {
      yearLabel = `≤ ${kioskYearToVal}`;
    }
    pills.push(`
      <span class="filter-pill year-pill">
        <i class="fa-regular fa-calendar"></i> Tahun: ${yearLabel}
        <button type="button" class="pill-remove-btn" onclick="clearKioskYearFilter()" title="Hapus filter tahun">&times;</button>
      </span>
    `);
  }

  if (pills.length > 0) {
    container.innerHTML = `
      <div class="active-pills-list">
        <span class="active-pills-label"><i class="fa-solid fa-filter"></i> Filter Aktif:</span>
        ${pills.join('')}
      </div>
      <button type="button" class="btn-clear-all-pills" onclick="resetAllKioskFilters()">
        <i class="fa-solid fa-rotate-left"></i> Reset Filter
      </button>
    `;
    container.style.display = 'flex';
  } else {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

function removeKioskCategoryFilter(catId) {
  selectedKioskCategories.delete(catId);
  tempKioskCategories.delete(catId);
  loadKioskBooks();
}

function removeKioskProdiFilter(prodiName) {
  selectedKioskProdis.delete(prodiName);
  tempKioskProdis.delete(prodiName);
  loadKioskBooks();
}

function clearKioskSearchFilter() {
  currentKioskSearchQuery = '';
  const searchInput = document.getElementById('kioskSearchInput');
  if (searchInput) searchInput.value = '';
  loadKioskBooks();
}

function clearKioskYearFilter() {
  kioskYearFromVal = '';
  kioskYearToVal = '';
  tempKioskYearFrom = '';
  tempKioskYearTo = '';
  const yf = document.getElementById('kioskFilterYearFrom');
  if (yf) yf.value = '';
  const yt = document.getElementById('kioskFilterYearTo');
  if (yt) yt.value = '';
  loadKioskBooks();
}

// Ambil Buku untuk Kiosk
async function loadKioskBooks(query = null) {
  const grid = document.getElementById('kioskBookGrid');
  const countText = document.getElementById('kioskBookCount');

  if (query !== null) {
    currentKioskSearchQuery = query;
  }

  updateKioskFilterActiveBadge();
  renderKioskActiveFilterPills();

  if (grid) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: #64748B;"><i class="fa-solid fa-spinner fa-spin"></i> Memuat buku...</div>';
  }

  try {
    const params = new URLSearchParams();

    if (selectedKioskCategories.size > 0) {
      params.append('categories', Array.from(selectedKioskCategories).join(','));
    }
    if (selectedKioskProdis.size > 0) {
      params.append('prodis', Array.from(selectedKioskProdis).join(','));
    }
    if (kioskYearFromVal) {
      params.append('year_from', kioskYearFromVal);
    }
    if (kioskYearToVal) {
      params.append('year_to', kioskYearToVal);
    }
    if (currentKioskSearchQuery) {
      params.append('q', currentKioskSearchQuery);
    }

    const queryString = params.toString();
    const url = `/api/books${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url);
    kioskBooks = await res.json();

    if (countText) {
      countText.textContent = `${kioskBooks.length} buku`;
    }

    if (kioskBooks.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; background: white; border-radius: var(--radius-lg); border: 1px dashed var(--border-medium); color: var(--text-muted);">
          <i class="fa-solid fa-book-open" style="font-size: 2rem; color: #CBD5E1; margin-bottom: 12px; display: block;"></i>
          <h4 style="font-size: 1rem; color: var(--text-primary); margin-bottom: 4px;">Tidak ada koleksi ditemukan</h4>
          <p style="font-size: 0.85rem;">Coba sesuaikan kata kunci, kategori, atau rentang tahun pada filter.</p>
          <button type="button" class="btn-secondary" style="margin-top: 14px;" onclick="resetAllKioskFilters()">
            <i class="fa-solid fa-rotate-left"></i> Reset Filter
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = kioskBooks.map(book => {
      const isAvailable = (book.available_stock || 0) > 0;
      const stockBadge = isAvailable
        ? `<span class="badge-stock-pill available"><i class="fa-solid fa-check"></i> Tersedia (${book.available_stock})</span>`
        : `<span class="badge-stock-pill out"><i class="fa-solid fa-xmark"></i> Habis Dipinjam</span>`;

      return `
        <div class="book-card">
          <div class="book-cover-wrap">
            <img class="book-cover-img" src="${book.cover_url || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80'}" alt="${book.title}" onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80'">
            <span class="badge-category" style="background-color: ${book.color_hex || '#0284C7'};">
              ${book.category_name || 'Umum'}
            </span>
          </div>
          <div class="book-info">
            <div class="book-code">${book.id} ${book.isbn ? `• ${book.isbn}` : ''}</div>
            <h3 class="book-title" title="${book.title}">${book.title}</h3>
            <div class="book-author"><i class="fa-solid fa-user-pen"></i> ${book.author}</div>
            
            ${book.prodi ? `
              <div style="margin-top: 6px;">
                <span class="badge-prodi"><i class="fa-solid fa-graduation-cap"></i> ${book.prodi}</span>
              </div>
            ` : ''}

            <div class="book-meta-sub" style="margin-top: 6px;">
              ${book.publisher ? `<span>${book.publisher}</span>` : ''} 
              ${book.publish_year ? `<span>(${book.publish_year})</span>` : ''}
            </div>

            <div class="book-card-footer">
              <div class="book-stock-row">
                <span class="stock-label"><i class="fa-solid fa-cubes-stacked"></i> Stok:</span>
                ${stockBadge}
              </div>
              <div class="book-card-actions">
                <button class="btn-secondary btn-card-detail" onclick="openKioskBookModal('${book.id}')">
                  <i class="fa-solid fa-circle-info"></i> Detail
                </button>
                <button class="btn-primary btn-card-locate" onclick="triggerLocateBook('${book.id}')">
                  <i class="fa-solid fa-lightbulb"></i> Nyalakan
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Error load kiosk books:', err);
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: red;">Gagal memuat buku.</div>';
  }
}

// BUKA MODAL DETAIL & SINOPSIS DI KIOSK
function openKioskBookModal(bookId) {
  const book = kioskBooks.find(b => b.id === bookId);
  if (!book) return;

  document.getElementById('kioskModalBookTitle').textContent = book.title;
  const modalBody = document.getElementById('kioskModalBookBody');
  const modalFooter = document.getElementById('kioskModalBookFooter');

  const isAvailable = (book.available_stock || 0) > 0;
  const stockText = isAvailable 
    ? `<span style="color: #10B981; font-weight: 700;">Tersedia (${book.available_stock} dari ${book.total_stock || 1} Buku)</span>`
    : `<span style="color: #EF4444; font-weight: 700;">Sedang Dipinjam Semua (${book.borrowed_count || 0} Buku Dipinjam)</span>`;

  modalBody.innerHTML = `
    <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
      <img src="${book.cover_url || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80'}" style="width: 120px; height: 170px; object-fit: cover; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" alt="${book.title}">
      <div style="flex: 1; min-width: 200px;">
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">Kode Buku: <strong>${book.id}</strong></p>
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">ISBN: <strong>${book.isbn || '-'}</strong></p>
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">Penulis: <strong>${book.author}</strong></p>
        ${book.prodi ? `<p style="font-size: 0.85rem; color: #1E40AF; margin-bottom: 4px;">Program Studi: <strong class="badge-prodi"><i class="fa-solid fa-graduation-cap"></i> ${book.prodi}</strong></p>` : ''}
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">Penerbit: <strong>${book.publisher || '-'} ${book.publish_year ? `(${book.publish_year})` : ''}</strong></p>
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">Halaman: <strong>${book.page_count ? book.page_count + ' Halaman' : '-'}</strong></p>
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">Kategori: <strong style="color: ${book.color_hex};">${book.category_name || 'Umum'}</strong></p>
        <p style="font-size: 0.85rem; margin-top: 8px;">Status Ketersediaan: ${stockText}</p>
      </div>
    </div>

    <!-- KIOSK RACK LOCATION INFO BOX (READ-ONLY CLEAN INFO) -->
    <div style="background: #F0FDF4; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1.5px solid #BBF7D0;">
      <h4 style="font-size: 0.9rem; color: #166534; margin-bottom: 4px;">
        <i class="fa-solid fa-map-pin" style="color: #10B981;"></i> Posisi Buku di Rak Perpustakaan:
      </h4>
      <div style="font-size: 0.88rem; color: #15803D; font-weight: 600;">
        ${book.rack_name || 'Rak Koleksi Utama'} &bull; Tingkat ${book.level_number || 1} &bull; <span style="color: #0284C7; font-weight: 800;">Slot LED #${book.led_slot}</span>
      </div>
    </div>

    <div>
      <h4 style="font-size: 0.9rem; color: #0B192C; margin-bottom: 6px;"><i class="fa-solid fa-align-left"></i> Sinopsis / Deskripsi:</h4>
      <p style="font-size: 0.88rem; color: #475569; line-height: 1.6; text-align: justify;">
        ${book.synopsis || 'Belum ada sinopsis untuk buku ini.'}
      </p>
    </div>
  `;

  modalFooter.innerHTML = `
    <button class="btn-secondary" onclick="closeKioskBookModal()">Tutup</button>
    <button class="btn-primary" style="background: linear-gradient(135deg, #0284C7, #0369A1);" onclick="triggerLocateFromModal('${book.id}')">
      <i class="fa-solid fa-lightbulb"></i> Cari & Nyalakan Lampu di Rak
    </button>
  `;

  document.getElementById('kioskBookDetailModal').classList.add('open');
}

function closeKioskBookModal() {
  document.getElementById('kioskBookDetailModal').classList.remove('open');
}

function triggerLocateFromModal(bookId) {
  closeKioskBookModal();
  triggerLocateBook(bookId);
}

// TRIGGER LOCATE & ANIMATE VIRTUAL RACK
async function triggerLocateBook(bookId) {
  // Jika panel miniatur rak sedang tertutup, buka otomatis
  if (!isRackVisible) {
    toggleVirtualRack(true);
  }
  try {
    const res = await fetch(`/api/locate/${bookId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await res.json();

    if (!result.success) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'Gagal Menyalakan Rak',
          text: result.error || 'Terjadi gangguan saat mengirim perintah ke lampu rak.',
          icon: 'error',
          confirmButtonText: 'Tutup',
          customClass: {
            popup: 'libnav-popup',
            title: 'libnav-popup-title',
            htmlContainer: 'libnav-popup-body',
            confirmButton: 'btn-swal-confirm btn-swal-danger'
          },
          buttonsStyling: false
        });
      } else {
        alert('Gagal menyalakan rak: ' + (result.error || 'Unknown error'));
      }
      return;
    }

    const payload = result.payload;
    const book = result.book;

    // Reset Animasi Sebelumnya
    resetVirtualRack();
    if (countdownInterval) clearInterval(countdownInterval);

    // Jalankan Animasi 2-Tahap pada Virtual Rack
    const targetTierId = `tier-${payload.rack_level}`;
    const targetNodeId = `led-node-${payload.led_target}`;
    const tierElem = document.getElementById(targetTierId);
    const nodeElem = document.getElementById(targetNodeId);

    const statusBox = document.getElementById('activeStatusBox');
    const bookNameText = document.getElementById('activeBookName');
    const timerText = document.getElementById('countdownTimer');

    if (statusBox) statusBox.style.display = 'block';
    if (bookNameText) bookNameText.textContent = `"${book.title}" (Tingkat ${book.level_number}, Slot #${book.led_slot})`;

    // Tahap 1: Highlight Baris / Zona
    if (tierElem) {
      tierElem.classList.add('tier-highlighted');
      tierElem.style.borderColor = payload.color_hex;
    }

    // Tahap 2: Sorot Titik Presisi (Target LED Berkedip)
    if (nodeElem) {
      nodeElem.classList.add('active-target');
      nodeElem.style.backgroundColor = payload.color_hex;
      nodeElem.style.borderColor = '#FFFFFF';
      nodeElem.style.boxShadow = `0 0 16px ${payload.color_hex}`;
    }

    // Tahap 3: Countdown Timer
    let remaining = payload.duration_seconds || 15;
    if (timerText) timerText.textContent = remaining;

    countdownInterval = setInterval(() => {
      remaining--;
      if (timerText) timerText.textContent = remaining;

      if (remaining <= 0) {
        clearInterval(countdownInterval);
        resetVirtualRack();
        if (statusBox) statusBox.style.display = 'none';
      }
    }, 1000);

  } catch (err) {
    console.error('Error saat trigger locate:', err);
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Gangguan Jaringan',
        text: 'Terjadi kesalahan koneksi ke server perpustakaan.',
        icon: 'error',
        confirmButtonText: 'Tutup',
        customClass: {
          popup: 'libnav-popup',
          title: 'libnav-popup-title',
          htmlContainer: 'libnav-popup-body',
          confirmButton: 'btn-swal-confirm btn-swal-danger'
        },
        buttonsStyling: false
      });
    } else {
      alert('Terjadi kesalahan koneksi ke server.');
    }
  }
}

function resetVirtualRack() {
  document.querySelectorAll('.rack-tier').forEach(tier => {
    tier.classList.remove('tier-highlighted');
    tier.style.borderColor = '';
  });

  document.querySelectorAll('.led-node').forEach(node => {
    node.classList.remove('active-target');
    node.style.backgroundColor = '';
    node.style.borderColor = '';
    node.style.boxShadow = '';
  });
}
