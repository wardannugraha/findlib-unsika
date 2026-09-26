// ==============================================================================
// 📚 FINDLIB UNSIKA - PUBLIC CATALOG JAVASCRIPT
// ==============================================================================
// FindLib UNSIKA (Find your Library) - Portal Pengunjung & Mahasiswa
// Sistem Filter Popup Modal Terpadu (Multi-Category, Multi-Prodi, Custom Year)
// ==============================================================================

let selectedCategories = new Set();
let selectedProdis = new Set();
let yearFromVal = '';
let yearToVal = '';
let currentSearchQuery = '';

// Draft state inside Modal
let tempCategories = new Set();
let tempProdis = new Set();
let tempYearFrom = '';
let tempYearTo = '';

let allBooks = [];
let rawCategories = [];
let rawProdis = [];

document.addEventListener('DOMContentLoaded', () => {
  initPublicCatalog();
});

async function initPublicCatalog() {
  await Promise.all([
    fetchCategories(),
    fetchProdis()
  ]);
  
  initSearchEvents();
  initModalBackdropEvents();
  loadBooks();
}

function initModalBackdropEvents() {
  window.addEventListener('click', (e) => {
    const filterModal = document.getElementById('catalogFilterModal');
    const bookModal = document.getElementById('bookDetailModal');

    if (e.target === filterModal) {
      closeFilterModal();
    }
    if (e.target === bookModal) {
      closeBookModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeFilterModal();
      closeBookModal();
    }
  });
}

function initSearchEvents() {
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');

  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      currentSearchQuery = searchInput.value.trim();
      loadBooks();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        currentSearchQuery = searchInput.value.trim();
        loadBooks();
      }
    });
  }

  const yf = document.getElementById('filterYearFrom');
  const yt = document.getElementById('filterYearTo');
  if (yf) yf.addEventListener('input', renderYearPresets);
  if (yt) yt.addEventListener('input', renderYearPresets);
}

// 1. Ambil Kategori dari Server
async function fetchCategories() {
  try {
    const res = await fetch('/api/categories');
    rawCategories = await res.json();
    renderCategoryChips();
  } catch (err) {
    console.error('Gagal memuat kategori:', err);
  }
}

// 2. Ambil Daftar Program Studi dari Server
async function fetchProdis() {
  try {
    const res = await fetch('/api/prodi');
    const data = await res.json();
    rawProdis = Array.isArray(data) ? data : (data.active || data.all || []);
    renderProdiChips();
  } catch (err) {
    console.error('Gagal memuat prodi:', err);
  }
}

// BUKA MODAL FILTER
function openFilterModal() {
  tempCategories = new Set(selectedCategories);
  tempProdis = new Set(selectedProdis);
  tempYearFrom = yearFromVal;
  tempYearTo = yearToVal;

  const yf = document.getElementById('filterYearFrom');
  if (yf) yf.value = tempYearFrom;

  const yt = document.getElementById('filterYearTo');
  if (yt) yt.value = tempYearTo;

  renderCategoryChips();
  renderProdiChips();
  renderYearPresets();

  const modal = document.getElementById('catalogFilterModal');
  if (modal) modal.classList.add('open');
}

// TUTUP MODAL FILTER
function closeFilterModal() {
  const modal = document.getElementById('catalogFilterModal');
  if (modal) modal.classList.remove('open');
}

// TERAPKAN FILTER DARI MODAL
function applyFilterModal() {
  const yf = document.getElementById('filterYearFrom');
  const yt = document.getElementById('filterYearTo');

  selectedCategories = new Set(tempCategories);
  selectedProdis = new Set(tempProdis);
  yearFromVal = yf ? yf.value.trim() : '';
  yearToVal = yt ? yt.value.trim() : '';

  closeFilterModal();
  loadBooks();
}

// RESET FILTER DARI DALAM MODAL
function resetAllFiltersFromModal() {
  tempCategories.clear();
  tempProdis.clear();
  
  const yf = document.getElementById('filterYearFrom');
  if (yf) yf.value = '';

  const yt = document.getElementById('filterYearTo');
  if (yt) yt.value = '';

  renderCategoryChips();
  renderProdiChips();
  renderYearPresets();
}

// RESET SEMUA FILTER LENGKAP
function resetAllFilters() {
  selectedCategories.clear();
  selectedProdis.clear();
  tempCategories.clear();
  tempProdis.clear();
  yearFromVal = '';
  yearToVal = '';
  currentSearchQuery = '';

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  const yf = document.getElementById('filterYearFrom');
  if (yf) yf.value = '';

  const yt = document.getElementById('filterYearTo');
  if (yt) yt.value = '';

  renderCategoryChips();
  renderProdiChips();
  loadBooks();
}

// Render Chip Kategori (Semua Kategori Termasuk Skripsi & Fiksi)
function renderCategoryChips(bookCounts = {}) {
  const container = document.getElementById('categoryCheckboxList');
  if (!container) return;

  if (rawCategories.length === 0) {
    container.innerHTML = '<div class="filter-empty-msg">Tidak ada kategori tersedia</div>';
    return;
  }

  container.innerHTML = rawCategories.map(cat => {
    const isChecked = tempCategories.has(cat.id);
    const count = bookCounts[cat.id] !== undefined ? bookCounts[cat.id] : '';
    const countBadge = count !== '' ? `<span class="chip-count-badge">${count}</span>` : '';

    return `
      <div class="filter-chip-card ${isChecked ? 'active' : ''}" onclick="toggleTempCategory('${cat.id}')">
        <span class="chip-checkbox-box"><i class="fa-solid fa-check"></i></span>
        <span class="chip-label" title="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</span>
        ${countBadge}
      </div>
    `;
  }).join('');
}

// Render Chip Prodi
function renderProdiChips(prodiCounts = {}) {
  const container = document.getElementById('prodiCheckboxList');
  if (!container) return;

  if (rawProdis.length === 0) {
    container.innerHTML = '<div class="filter-empty-msg">Tidak ada data program studi</div>';
    return;
  }

  container.innerHTML = rawProdis.map(p => {
    const isChecked = tempProdis.has(p);
    const count = prodiCounts[p] !== undefined ? prodiCounts[p] : '';
    const countBadge = count !== '' ? `<span class="chip-count-badge">${count}</span>` : '';

    return `
      <div class="filter-chip-card ${isChecked ? 'active' : ''}" onclick="toggleTempProdi('${escapeHtml(p)}')">
        <span class="chip-checkbox-box"><i class="fa-solid fa-check"></i></span>
        <span class="chip-label" title="${escapeHtml(p)}">${escapeHtml(p)}</span>
        ${countBadge}
      </div>
    `;
  }).join('');
}

// Toggle Kategori di dalam Modal
function toggleTempCategory(catId) {
  if (tempCategories.has(catId)) {
    tempCategories.delete(catId);
  } else {
    tempCategories.add(catId);
  }
  renderCategoryChips();
}

// Toggle Prodi di dalam Modal
function toggleTempProdi(prodiName) {
  if (tempProdis.has(prodiName)) {
    tempProdis.delete(prodiName);
  } else {
    tempProdis.add(prodiName);
  }
  renderProdiChips();
}

// Pilih Semua / Batal Semua Kategori
function toggleAllCategories() {
  const allSelected = rawCategories.every(c => tempCategories.has(c.id));

  if (allSelected) {
    tempCategories.clear();
  } else {
    rawCategories.forEach(c => tempCategories.add(c.id));
  }
  renderCategoryChips();
}

// Pilih Semua / Batal Semua Prodi
function toggleAllProdis() {
  const allSelected = rawProdis.every(p => tempProdis.has(p));

  if (allSelected) {
    tempProdis.clear();
  } else {
    rawProdis.forEach(p => tempProdis.add(p));
  }
  renderProdiChips();
}

// Render Dynamic Preset Tahun berdasarkan Tahun Berjalan (new Date().getFullYear())
function renderYearPresets() {
  const container = document.getElementById('yearQuickPresets');
  if (!container) return;

  const currentYear = new Date().getFullYear();
  const yf = document.getElementById('filterYearFrom');
  const yt = document.getElementById('filterYearTo');
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
      <button type="button" class="btn-preset-chip ${isActive ? 'active' : ''}" onclick="setYearPreset(${fromParam}, ${toParam})">
        ${p.label}
      </button>
    `;
  }).join('');
}

// Quick Preset Tahun
function setYearPreset(from, to) {
  const yf = document.getElementById('filterYearFrom');
  const yt = document.getElementById('filterYearTo');
  if (yf) yf.value = from !== null && from !== undefined ? from : '';
  if (yt) yt.value = to !== null && to !== undefined ? to : '';

  renderYearPresets();
}

// Update Indikator Angka Filter Aktif pada Tombol "Filter Koleksi"
function updateFilterActiveBadge() {
  let activeCount = 0;
  activeCount += selectedCategories.size;
  activeCount += selectedProdis.size;
  if (yearFromVal || yearToVal) activeCount += 1;

  const badge = document.getElementById('filterIndicatorBadge');
  const btn = document.getElementById('btnOpenFilterModal');

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

// Render Active Filter Pills (Tags di atas katalog)
function renderActiveFilterPills() {
  const container = document.getElementById('activeFilterPills');
  if (!container) return;

  const pills = [];

  // Query search pill
  if (currentSearchQuery) {
    pills.push(`
      <span class="filter-pill">
        <i class="fa-solid fa-magnifying-glass"></i> "${escapeHtml(currentSearchQuery)}"
        <button type="button" class="pill-remove-btn" onclick="clearSearchFilter()" title="Hapus kata kunci">&times;</button>
      </span>
    `);
  }

  // Category pills (Fiksi, Skripsi, Teknologi, dsb)
  selectedCategories.forEach(catId => {
    const catObj = rawCategories.find(c => c.id === catId);
    const catName = catObj ? catObj.name : catId;
    pills.push(`
      <span class="filter-pill category-pill">
        <i class="fa-solid fa-tag"></i> ${escapeHtml(catName)}
        <button type="button" class="pill-remove-btn" onclick="removeCategoryFilter('${catId}')" title="Hapus filter kategori">&times;</button>
      </span>
    `);
  });

  // Prodi pills
  selectedProdis.forEach(prodi => {
    pills.push(`
      <span class="filter-pill prodi-pill">
        <i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(prodi)}
        <button type="button" class="pill-remove-btn" onclick="removeProdiFilter('${escapeHtml(prodi)}')" title="Hapus filter prodi">&times;</button>
      </span>
    `);
  });

  // Year Range pill
  if (yearFromVal || yearToVal) {
    let yearLabel = '';
    if (yearFromVal && yearToVal) {
      if (yearFromVal === yearToVal) {
        yearLabel = `${yearFromVal}`;
      } else {
        yearLabel = `${yearFromVal} - ${yearToVal}`;
      }
    } else if (yearFromVal) {
      yearLabel = `≥ ${yearFromVal}`;
    } else if (yearToVal) {
      yearLabel = `≤ ${yearToVal}`;
    }
    pills.push(`
      <span class="filter-pill year-pill">
        <i class="fa-regular fa-calendar"></i> Tahun: ${yearLabel}
        <button type="button" class="pill-remove-btn" onclick="clearYearFilter()" title="Hapus filter tahun">&times;</button>
      </span>
    `);
  }

  if (pills.length > 0) {
    container.innerHTML = `
      <div class="active-pills-list">
        <span class="active-pills-label"><i class="fa-solid fa-filter"></i> Filter Aktif:</span>
        ${pills.join('')}
      </div>
      <button type="button" class="btn-clear-all-pills" onclick="resetAllFilters()">
        <i class="fa-solid fa-rotate-left"></i> Reset Filter
      </button>
    `;
    container.style.display = 'flex';
  } else {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

function removeCategoryFilter(catId) {
  selectedCategories.delete(catId);
  tempCategories.delete(catId);
  loadBooks();
}

function removeProdiFilter(prodiName) {
  selectedProdis.delete(prodiName);
  tempProdis.delete(prodiName);
  loadBooks();
}

function clearSearchFilter() {
  currentSearchQuery = '';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';
  loadBooks();
}

function clearYearFilter() {
  yearFromVal = '';
  yearToVal = '';
  tempYearFrom = '';
  tempYearTo = '';
  const yf = document.getElementById('filterYearFrom');
  if (yf) yf.value = '';
  const yt = document.getElementById('filterYearTo');
  if (yt) yt.value = '';
  loadBooks();
}

// 3. Ambil Data Buku Berdasarkan Filter Aktif
async function loadBooks() {
  const grid = document.getElementById('bookGrid');
  const countText = document.getElementById('bookCountText');
  
  if (grid) {
    grid.innerHTML = `
      <div class="catalog-loading-state">
        <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
        <p>Memuat koleksi buku...</p>
      </div>
    `;
  }

  try {
    const params = new URLSearchParams();

    if (selectedCategories.size > 0) {
      params.append('categories', Array.from(selectedCategories).join(','));
    }
    if (selectedProdis.size > 0) {
      params.append('prodis', Array.from(selectedProdis).join(','));
    }
    if (yearFromVal) {
      params.append('year_from', yearFromVal);
    }
    if (yearToVal) {
      params.append('year_to', yearToVal);
    }
    if (currentSearchQuery) {
      params.append('q', currentSearchQuery);
    }

    const queryString = params.toString();
    const url = queryString ? `/api/books?${queryString}` : '/api/books';

    const res = await fetch(url);
    allBooks = await res.json();

    // Hitung aggregat jumlah buku per kategori & prodi untuk chip modal
    calculateAndRenderFacetCounts(allBooks);

    // Update active filter badge & pills UI
    updateFilterActiveBadge();
    renderActiveFilterPills();

    // Update summary text
    if (countText) {
      countText.textContent = `Menampilkan ${allBooks.length} buku`;
    }

    // Render Cards
    if (!grid) return;

    if (allBooks.length === 0) {
      grid.innerHTML = `
        <div class="catalog-empty-state">
          <div class="empty-icon-wrap">
            <i class="fa-solid fa-book-open fa-3x"></i>
          </div>
          <h3>Buku tidak ditemukan</h3>
          <p>Coba gunakan kata kunci lain atau sesuaikan filter kategori, prodi, dan rentang tahun terbit.</p>
          <button type="button" class="btn-reset-filters-inline" onclick="resetAllFilters()">
            <i class="fa-solid fa-rotate-left"></i> Reset Filter
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = allBooks.map(book => {
      const isAvailable = (book.available_stock || 0) > 0;
      const stockBadge = isAvailable
        ? `<span class="badge-stock-pill available"><i class="fa-solid fa-check"></i> Tersedia (${book.available_stock})</span>`
        : `<span class="badge-stock-pill out"><i class="fa-solid fa-xmark"></i> Habis Dipinjam</span>`;

      const coverSrc = book.cover_url || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80';

      return `
        <div class="book-card">
          <div class="book-cover-wrap">
            <img class="book-cover-img" src="${coverSrc}" alt="${escapeHtml(book.title)}" onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80'">
            <span class="badge-category" style="background-color: ${book.color_hex || '#0284C7'};">
              ${escapeHtml(book.category_name || 'Umum')}
            </span>
          </div>
          <div class="book-info">
            <div class="book-code">${escapeHtml(book.id)} ${book.isbn ? `• ${escapeHtml(book.isbn)}` : ''}</div>
            <h3 class="book-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h3>
            <div class="book-author"><i class="fa-solid fa-user-pen"></i> ${escapeHtml(book.author || '-')}</div>
            
            ${book.prodi ? `
              <div style="margin-top: 6px;">
                <span class="badge-prodi"><i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(book.prodi)}</span>
              </div>
            ` : ''}

            <div class="book-meta-sub" style="margin-top: 6px;">
              ${book.publisher ? `<span>${escapeHtml(book.publisher)}</span>` : ''} 
              ${book.publish_year ? `<span>(${escapeHtml(book.publish_year)})</span>` : ''}
            </div>

            <div class="book-card-footer">
              <div class="book-stock-row">
                <span class="stock-label"><i class="fa-solid fa-cubes-stacked"></i> Stok:</span>
                ${stockBadge}
              </div>
              <button class="btn-secondary btn-card-detail-full" onclick="openBookModal('${escapeHtml(book.id)}')">
                <i class="fa-solid fa-circle-info"></i> Detail Buku
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Error memuat buku:', err);
    if (grid) {
      grid.innerHTML = `
        <div class="catalog-error-state">
          <i class="fa-solid fa-triangle-exclamation fa-2x"></i>
          <p>Gagal mengambil data katalog dari server.</p>
        </div>
      `;
    }
  }
}

// Hitung jumlah item per kategori dan prodi
function calculateAndRenderFacetCounts(books) {
  const catCounts = {};
  const prodiCounts = {};

  books.forEach(b => {
    if (b.category_id) {
      catCounts[b.category_id] = (catCounts[b.category_id] || 0) + 1;
    }
    if (b.prodi) {
      prodiCounts[b.prodi] = (prodiCounts[b.prodi] || 0) + 1;
    }
  });

  renderCategoryChips(catCounts);
  renderProdiChips(prodiCounts);
}

// Buka Modal Detail & Sinopsis (Publik)
function openBookModal(bookId) {
  const book = allBooks.find(b => b.id === bookId);
  if (!book) return;

  const titleElem = document.getElementById('modalBookTitle');
  if (titleElem) titleElem.textContent = book.title;

  const modalBody = document.getElementById('modalBookBody');
  if (!modalBody) return;

  const isAvailable = (book.available_stock || 0) > 0;
  const stockText = isAvailable 
    ? `<span style="color: #10B981; font-weight: 700;">Tersedia (${book.available_stock} dari ${book.total_stock || 1} Buku)</span>`
    : `<span style="color: #EF4444; font-weight: 700;">Sedang Dipinjam Semua (${book.borrowed_count || 0} Buku Dipinjam)</span>`;

  const coverSrc = book.cover_url || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80';

  modalBody.innerHTML = `
    <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
      <img src="${coverSrc}" style="width: 120px; height: 170px; object-fit: cover; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" alt="${escapeHtml(book.title)}">
      <div style="flex: 1; min-width: 200px;">
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">Kode Buku: <strong>${escapeHtml(book.id)}</strong></p>
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">ISBN: <strong>${escapeHtml(book.isbn || '-')}</strong></p>
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">Penulis: <strong>${escapeHtml(book.author || '-')}</strong></p>
        ${book.prodi ? `<p style="font-size: 0.85rem; color: #1E40AF; margin-bottom: 4px;">Program Studi: <strong class="badge-prodi"><i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(book.prodi)}</strong></p>` : ''}
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">Penerbit: <strong>${escapeHtml(book.publisher || '-')} ${book.publish_year ? `(${escapeHtml(book.publish_year)})` : ''}</strong></p>
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">Halaman: <strong>${book.page_count ? book.page_count + ' Halaman' : '-'}</strong></p>
        <p style="font-size: 0.85rem; color: #64748B; margin-bottom: 4px;">Kategori: <strong style="color: ${book.color_hex || '#0284C7'};">${escapeHtml(book.category_name || 'Umum')}</strong></p>
        <p style="font-size: 0.85rem; margin-top: 8px;">Status Ketersediaan: ${stockText}</p>
      </div>
    </div>

    <div style="background: #F8FAFC; padding: 14px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #E2E8F0;">
      <h4 style="font-size: 0.9rem; color: #0B192C; margin-bottom: 4px;">
        <i class="fa-solid fa-circle-info" style="color: #0284C7;"></i> Informasi Lokasi Fisik di Perpustakaan:
      </h4>
      <p style="font-size: 0.83rem; color: #475569; line-height: 1.5;">
        Buku ini ditempatkan di <strong>${escapeHtml(book.rack_name || 'Rak Koleksi Utama')}</strong>.
      </p>
      <p style="font-size: 0.78rem; color: #64748B; margin-top: 6px; font-style: italic;">
        *Untuk menyalakan lampu indikator navigasi presisi langsung di rak fisik, silakan gunakan terminal Kiosk yang tersedia di lantai perpustakaan UNSIKA.
      </p>
    </div>

    <div>
      <h4 style="font-size: 0.9rem; color: #0B192C; margin-bottom: 6px;"><i class="fa-solid fa-align-left"></i> Sinopsis / Deskripsi:</h4>
      <p style="font-size: 0.88rem; color: #475569; line-height: 1.6; text-align: justify;">
        ${escapeHtml(book.synopsis || 'Belum ada sinopsis untuk buku ini.')}
      </p>
    </div>
  `;

  const modal = document.getElementById('bookDetailModal');
  if (modal) modal.classList.add('open');
}

function closeBookModal() {
  const modal = document.getElementById('bookDetailModal');
  if (modal) modal.classList.remove('open');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}




