/**
 * ==============================================================================
 * FINDLIB UNSIKA - ADMIN DASHBOARD JAVASCRIPT
 * Find your Library • Universitas Singaperbangsa Karawang
 * ==============================================================================
 * Mengelola:
 * 1. Autentikasi & Guard Sesi Admin (Auto-verify token)
 * 2. Navigasi Sidebar Buka-Tutup (Koleksi Buku, Peminjaman, Terlambat, Mahasiswa)
 * 3. CRUD Koleksi Buku, Live Cover Preview & Tes Sinyal LED MQTT
 * 4. Transaksi Peminjaman Buku dengan Smart Auto-Fill NIM & Batas 7 Hari
 * 5. Fitur Perpanjangan Waktu (+7 Hari, Max 1x) & Pengembalian Buku
 * 6. Pemantauan Buku Terlambat (Highlight Merah & Tombol WhatsApp)
 * 7. Master Data Mahasiswa (Members CRUD)
 * ==============================================================================
 */

// Global State
let adminBooks = [];
let adminCategories = [];
let adminRacks = [];
let adminLoans = [];
let adminMembers = [];
let adminSettings = {};
let currentAdminSection = 'books';

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

// ==============================================================================
// 1. AUTH GUARD
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('libnav_admin_token');

  if (!token) {
    window.location.href = '/login';
    return;
  }

  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    if (!data.authenticated) {
      localStorage.removeItem('libnav_admin_token');
      window.location.href = '/login';
      return;
    }

    // Inisialisasi Data Admin & Pengaturan Sistem
    initAdminFilterBackdropEvents();
    await loadSettingsData();
    await loadAdminCategories();
    await loadAdminProdi();
    await loadAdminRacks();
    await loadAdminBooks();
    await loadLoansData();
    await loadMembersData();

  } catch (err) {
    console.error('Auth verification error:', err);
    window.location.href = '/login';
  }
});

// ==============================================================================
// 0. CUSTOM POPUP & NOTIFICATION SYSTEM (SWEETALERT2 INTEGRATION)
// ==============================================================================
function formatIndonesianDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return `${days[date.getDay()]}, ${String(date.getDate()).padStart(2, '0')} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

const Toast = (typeof Swal !== 'undefined') ? Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  backdrop: false,
  showClass: {
    popup: 'swal2-noanimation'
  },
  hideClass: {
    popup: ''
  },
  customClass: {
    popup: 'libnav-toast-popup'
  },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
}) : null;

function notifyToast(icon, title) {
  if (Toast) {
    Toast.fire({ icon, title });
  } else {
    alert(title);
  }
}

function showModalAlert({ title, html, text, icon = 'info', confirmText = 'Tutup' }) {
  if (typeof Swal !== 'undefined') {
    return Swal.fire({
      title,
      html: html || text,
      icon,
      confirmButtonText: confirmText,
      customClass: {
        popup: 'libnav-popup',
        title: 'libnav-popup-title',
        htmlContainer: 'libnav-popup-body',
        confirmButton: icon === 'error' ? 'btn-swal-confirm btn-swal-danger' : 'btn-swal-confirm'
      },
      buttonsStyling: false
    });
  } else {
    alert(text || title);
  }
}

async function showModalConfirm({ title, html, text, icon = 'warning', confirmText = 'Ya, Lanjutkan', cancelText = 'Batal', isDanger = false }) {
  if (typeof Swal !== 'undefined') {
    const result = await Swal.fire({
      title,
      html: html || text,
      icon,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      customClass: {
        popup: 'libnav-popup',
        title: 'libnav-popup-title',
        htmlContainer: 'libnav-popup-body',
        confirmButton: isDanger ? 'btn-swal-confirm btn-swal-danger' : 'btn-swal-confirm',
        cancelButton: 'btn-swal-cancel'
      },
      buttonsStyling: false,
      focusCancel: true
    });
    return result.isConfirmed;
  } else {
    return confirm(text || title);
  }
}

// Modal Khusus Peminjaman Berhasil (Menampilkan Batas Pengembalian / Jatuh Tempo)
function showLoanSuccessModal(data) {
  const dueDateFormatted = formatIndonesianDate(data.due_date);
  const borrowDateFormatted = formatIndonesianDate(data.borrow_date);

  const html = `
    <div class="loan-success-box">
      <div class="loan-due-highlight">
        <div class="loan-due-title">
          <i class="fa-solid fa-calendar-check fa-lg"></i> Batas Terakhir Pengembalian
        </div>
        <div class="loan-due-date">${dueDateFormatted}</div>
        <div class="loan-due-sub"><i class="fa-solid fa-hourglass-half"></i> Maksimal 7 Hari Kalender</div>
      </div>

      <div class="loan-details-table">
        <div class="loan-detail-row">
          <span class="loan-detail-label"><i class="fa-solid fa-barcode"></i> Kode Pinjam</span>
          <span class="loan-detail-val" style="font-family: monospace; color: #0284C7;">${data.loan_id || '-'}</span>
        </div>
        <div class="loan-detail-row">
          <span class="loan-detail-label"><i class="fa-solid fa-book"></i> Judul Buku</span>
          <span class="loan-detail-val">${data.book_title || '-'}</span>
        </div>
        <div class="loan-detail-row">
          <span class="loan-detail-label"><i class="fa-solid fa-user-graduate"></i> Peminjam</span>
          <span class="loan-detail-val">${data.member_name} (${data.member_nim})</span>
        </div>
        <div class="loan-detail-row">
          <span class="loan-detail-label"><i class="fa-regular fa-clock"></i> Tgl Pinjam</span>
          <span class="loan-detail-val">${borrowDateFormatted}</span>
        </div>
      </div>

      <div class="librarian-tip-box">
        <i class="fa-solid fa-bullhorn fa-lg" style="margin-top: 2px; color: #059669;"></i>
        <div>
          <strong>Pesan untuk Pustakawan:</strong><br>
          Sampaikan langsung kepada peminjam bahwa batas waktu pengembalian adalah <strong>${dueDateFormatted}</strong>.
        </div>
      </div>
    </div>
  `;

  if (typeof Swal !== 'undefined') {
    return Swal.fire({
      title: 'Peminjaman Berhasil Disimpan! 🎉',
      html: html,
      icon: 'success',
      confirmButtonText: '<i class="fa-solid fa-check"></i> Selesai & Tutup',
      customClass: {
        popup: 'libnav-popup',
        title: 'libnav-popup-title',
        htmlContainer: 'libnav-popup-body',
        confirmButton: 'btn-swal-confirm btn-swal-success'
      },
      buttonsStyling: false
    });
  } else {
    alert(`Peminjaman Berhasil!\nBatas Pengembalian: ${dueDateFormatted}\nBuku: ${data.book_title}`);
  }
}

// Modal Khusus Perpanjangan Berhasil
function showExtendSuccessModal(data) {
  const dueDateFormatted = formatIndonesianDate(data.due_date);

  const html = `
    <div class="loan-success-box">
      <div class="loan-due-highlight extended">
        <div class="loan-due-title extended">
          <i class="fa-solid fa-calendar-plus fa-lg"></i> Batas Pengembalian Baru (+7 Hari)
        </div>
        <div class="loan-due-date extended">${dueDateFormatted}</div>
        <div class="loan-due-sub extended"><i class="fa-solid fa-circle-check"></i> Perpanjangan 1x Telah Digunakan</div>
      </div>

      <div class="loan-details-table">
        <div class="loan-detail-row">
          <span class="loan-detail-label"><i class="fa-solid fa-barcode"></i> ID Pinjam</span>
          <span class="loan-detail-val" style="font-family: monospace; color: #0284C7;">${data.loan_id || '-'}</span>
        </div>
        <div class="loan-detail-row">
          <span class="loan-detail-label"><i class="fa-solid fa-book"></i> Buku</span>
          <span class="loan-detail-val">${data.book_title || '-'}</span>
        </div>
        <div class="loan-detail-row">
          <span class="loan-detail-label"><i class="fa-solid fa-user-graduate"></i> Peminjam</span>
          <span class="loan-detail-val">${data.member_name || '-'}</span>
        </div>
      </div>

      <div class="librarian-tip-box">
        <i class="fa-solid fa-circle-info fa-lg" style="margin-top: 2px; color: #0284C7;"></i>
        <div>
          Buku ini telah mencapai batas perpanjangan maksimal (1 kali). Pengembalian wajib dilakukan tepat waktu.
        </div>
      </div>
    </div>
  `;

  if (typeof Swal !== 'undefined') {
    return Swal.fire({
      title: 'Perpanjangan Berhasil! 📅',
      html: html,
      icon: 'success',
      confirmButtonText: 'Tutup',
      customClass: {
        popup: 'libnav-popup',
        title: 'libnav-popup-title',
        htmlContainer: 'libnav-popup-body',
        confirmButton: 'btn-swal-confirm'
      },
      buttonsStyling: false
    });
  } else {
    alert(`Perpanjangan Berhasil!\nBatas Baru: ${dueDateFormatted}`);
  }
}

// Modal Sinyal Tes LED IoT
function showTestLocateModal(data) {
  const html = `
    <div class="iot-signal-card">
      <div class="iot-signal-row">
        <span style="color: #94A3B8;">📖 Judul:</span>
        <strong style="color: #FFFFFF;">${data.title}</strong>
      </div>
      <div class="iot-signal-row">
        <span style="color: #94A3B8;">📶 Tingkat Rak:</span>
        <strong style="color: #38BDF8;">Tingkat ${data.rack_level}</strong>
      </div>
      <div class="iot-signal-row">
        <span style="color: #94A3B8;">💡 Slot Target LED:</span>
        <strong style="color: #FCD34D;">Slot #${data.led_target}</strong>
      </div>
      <div class="iot-signal-row">
        <span style="color: #94A3B8;">🎨 Warna LED:</span>
        <span style="display: inline-flex; align-items: center; gap: 6px; color: #FFFFFF;">
          <span style="width: 12px; height: 12px; border-radius: 50%; background: ${data.color_hex}; display: inline-block; border: 1px solid #FFFFFF;"></span>
          ${data.color_hex}
        </span>
      </div>
      <div class="iot-signal-row">
        <span style="color: #94A3B8;">📡 Topik MQTT:</span>
        <span style="color: #34D399; font-size: 0.78rem;">libnav/unsika/rak/led</span>
      </div>
    </div>
  `;

  showModalAlert({
    title: '📡 Sinyal Tes LED Terkirim!',
    html: html,
    icon: 'success',
    confirmText: 'Tutup'
  });
}

async function handleLogout() {
  const confirmed = await showModalConfirm({
    title: 'Konfirmasi Keluar',
    text: 'Apakah Anda yakin ingin keluar dari Dashboard Admin?',
    icon: 'question',
    confirmText: '<i class="fa-solid fa-arrow-right-from-bracket"></i> Keluar Sekarang',
    cancelText: 'Batal',
    isDanger: true
  });

  if (confirmed) {
    localStorage.removeItem('libnav_admin_token');
    window.location.href = '/login';
  }
}

// ==============================================================================
// 2. SIDEBAR NAVIGATION & TOGGLE (DESKTOP & MOBILE DRAWER)
// ==============================================================================
function toggleAdminSidebar(forceState) {
  const sidebar = document.getElementById('adminSidebar');
  const backdrop = document.getElementById('sidebarMobileBackdrop');
  if (!sidebar) return;

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    if (typeof forceState === 'boolean') {
      if (forceState) {
        sidebar.classList.add('mobile-open');
        if (backdrop) backdrop.classList.add('active');
      } else {
        sidebar.classList.remove('mobile-open');
        if (backdrop) backdrop.classList.remove('active');
      }
    } else {
      sidebar.classList.toggle('mobile-open');
      if (backdrop) backdrop.classList.toggle('active');
    }
  } else {
    if (typeof forceState === 'boolean') {
      if (forceState) sidebar.classList.remove('collapsed');
      else sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  }
}

// Shortcut keyboard Ctrl + B untuk toggle sidebar
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    toggleAdminSidebar();
  }
});

function switchAdminSection(sectionName) {
  currentAdminSection = sectionName;

  // Tutup mobile sidebar otomatis saat item menu diklik di HP
  if (window.innerWidth <= 768) {
    toggleAdminSidebar(false);
  }

  // Update Nav Active State
  const navItems = document.querySelectorAll('.sidebar-nav-item');
  navItems.forEach(el => el.classList.remove('active'));

  // Update Section Active State
  const sections = document.querySelectorAll('.admin-view-section');
  sections.forEach(el => el.classList.remove('active'));

  const titleMap = {
    'books': 'Manajemen Koleksi Buku',
    'loans': 'Peminjaman Buku & Sirkulasi',
    'overdue': 'Daftar Buku Terlambat',
    'members': 'Master Data Mahasiswa',
    'settings': 'Konfigurasi Sistem Perpustakaan'
  };

  const navIdMap = {
    'books': 'navItemBooks',
    'loans': 'navItemLoans',
    'overdue': 'navItemOverdue',
    'members': 'navItemMembers',
    'settings': 'navItemSettings'
  };

  const sectionIdMap = {
    'books': 'sectionBooks',
    'loans': 'sectionLoans',
    'overdue': 'sectionOverdue',
    'members': 'sectionMembers',
    'settings': 'sectionSettings'
  };

  if (document.getElementById(navIdMap[sectionName])) {
    document.getElementById(navIdMap[sectionName]).classList.add('active');
  }

  if (document.getElementById(sectionIdMap[sectionName])) {
    document.getElementById(sectionIdMap[sectionName]).classList.add('active');
  }

  document.getElementById('adminTopTitle').textContent = titleMap[sectionName] || 'Dashboard Admin';

  if (sectionName === 'loans') loadLoansData();
  if (sectionName === 'overdue') loadLoansData();
  if (sectionName === 'members') loadMembersData();
  if (sectionName === 'books') loadAdminBooks();
  if (sectionName === 'settings') loadSettingsData();
}

// ==============================================================================
// 3. STATISTIK SISTEM & MODE DEMO IOT
// ==============================================================================
let currentBookFilterTab = 'all'; // 'all' | 'demo' | 'general'
let isDemoModeActive = false;

function updateDemoModeUI(enabled, demoCount, totalCount) {
  const btn = document.getElementById('btnToggleDemoMode');
  const text = document.getElementById('demoModeText');
  const indicator = document.getElementById('demoModeIndicator');
  const icon = document.getElementById('demoModeIcon');
  if (!btn) return;

  isDemoModeActive = !!enabled;

  if (icon) {
    icon.className = 'fa-solid fa-microchip';
  }

  if (isDemoModeActive) {
    btn.className = 'badge-demo-toggle on';
    if (text) text.textContent = `AKTIF (${demoCount || 0} Buku Demo)`;
    if (indicator) indicator.style.background = '#16A34A';
    if (icon) icon.style.color = '#16A34A';
  } else {
    btn.className = 'badge-demo-toggle off';
    if (text) text.textContent = `OFF (Semua Buku)`;
    if (indicator) indicator.style.background = '#94A3B8';
    if (icon) icon.style.color = '#64748B';
  }
}

async function handleToggleDemoMode() {
  const btn = document.getElementById('btnToggleDemoMode');
  const text = document.getElementById('demoModeText');
  const icon = document.getElementById('demoModeIcon');

  // Berikan feedback visual instan (Logo spinner berputar)
  const prevIconClass = icon ? icon.className : 'fa-solid fa-microchip';
  const prevIconColor = icon ? icon.style.color : '';
  const prevText = text ? text.textContent : '';

  if (btn) btn.disabled = true;
  if (icon) {
    icon.className = 'fa-solid fa-spinner fa-spin';
    icon.style.color = '#0284C7';
  }
  if (text) text.textContent = 'Memproses...';

  try {
    const res = await fetch('/api/settings/toggle-demo-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (data.success) {
      notifyToast(data.demo_mode_enabled ? 'success' : 'info', data.message);
      await Promise.all([
        loadAdminBooks(),
        loadSystemStatus()
      ]);
    } else {
      throw new Error(data.message || 'Gagal mengubah status mode demo.');
    }
  } catch (err) {
    console.error('Error toggle demo mode:', err);
    if (icon) icon.className = prevIconClass;
    if (icon) icon.style.color = prevIconColor;
    if (text) text.textContent = prevText;
    showModalAlert({
      title: 'Gagal Mengubah Mode Demo',
      text: err.message || 'Terjadi kesalahan saat mengubah status mode demo.',
      icon: 'error'
    });
    await loadSystemStatus();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function setBookFilterTab(tab) {
  currentBookFilterTab = tab;

  const tabs = {
    'all': 'tabBookAll',
    'demo': 'tabBookDemo',
    'general': 'tabBookGeneral'
  };

  Object.entries(tabs).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) {
      if (key === tab) el.classList.add('active');
      else el.classList.remove('active');
    }
  });

  const searchInput = document.getElementById('adminSearchInput');
  const query = searchInput ? searchInput.value : '';
  filterAdminTable(query);
}

function getFilteredBooks() {
  if (currentBookFilterTab === 'demo') {
    return adminBooks.filter(b => b.is_demo === true);
  } else if (currentBookFilterTab === 'general') {
    return adminBooks.filter(b => b.is_demo !== true);
  }
  return adminBooks;
}

async function loadSystemStatus() {
  try {
    const res = await fetch('/api/system-status');
    const data = await res.json();

    document.getElementById('statTotalBooks').textContent = `${data.stats.totalTitles || 0} Judul`;
    document.getElementById('statTotalStock').textContent = `${data.stats.totalStock || 0} Buku`;
    document.getElementById('statAvailableStock').textContent = `${data.stats.availableStock || 0} Buku`;
    document.getElementById('statBorrowedStock').textContent = `${data.stats.borrowedCount || 0} Buku`;

    if (data.demoMode) {
      updateDemoModeUI(data.demoMode.enabled, data.demoMode.demoBooksCount, data.demoMode.totalBooksCount);
    }
  } catch (err) {
    console.error('Error load system status:', err);
  }
}

// ==============================================================================
// 4. MANAJEMEN KOLEKSI BUKU & MASTER PRODI
// ==============================================================================
let adminProdiList = [];

// State Multi-Filter Admin
let selectedAdminCategories = new Set();
let selectedAdminProdis = new Set();
let adminYearFromVal = '';
let adminYearToVal = '';

// Draft State dalam Modal Filter Admin
let tempAdminCategories = new Set();
let tempAdminProdis = new Set();
let tempAdminYearFrom = '';
let tempAdminYearTo = '';

function initAdminFilterBackdropEvents() {
  window.addEventListener('click', (e) => {
    const filterModal = document.getElementById('adminFilterModal');
    if (e.target === filterModal) {
      closeAdminFilterModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const filterModal = document.getElementById('adminFilterModal');
      if (filterModal && filterModal.classList.contains('open')) {
        closeAdminFilterModal();
      }
    }
  });

  const yf = document.getElementById('adminFilterYearFrom');
  const yt = document.getElementById('adminFilterYearTo');
  if (yf) yf.addEventListener('input', renderAdminYearPresets);
  if (yt) yt.addEventListener('input', renderAdminYearPresets);
}

// BUKA MODAL FILTER ADMIN
function openAdminFilterModal() {
  tempAdminCategories = new Set(selectedAdminCategories);
  tempAdminProdis = new Set(selectedAdminProdis);
  tempAdminYearFrom = adminYearFromVal;
  tempAdminYearTo = adminYearToVal;

  const yf = document.getElementById('adminFilterYearFrom');
  if (yf) yf.value = tempAdminYearFrom;

  const yt = document.getElementById('adminFilterYearTo');
  if (yt) yt.value = tempAdminYearTo;

  renderAdminCategoryChips();
  renderAdminProdiChips();
  renderAdminYearPresets();

  const modal = document.getElementById('adminFilterModal');
  if (modal) modal.classList.add('open');
}

// TUTUP MODAL FILTER ADMIN
function closeAdminFilterModal() {
  const modal = document.getElementById('adminFilterModal');
  if (modal) modal.classList.remove('open');
}

// TERAPKAN FILTER DARI MODAL ADMIN
function applyAdminFilterModal() {
  const yf = document.getElementById('adminFilterYearFrom');
  const yt = document.getElementById('adminFilterYearTo');

  selectedAdminCategories = new Set(tempAdminCategories);
  selectedAdminProdis = new Set(tempAdminProdis);
  adminYearFromVal = yf ? yf.value.trim() : '';
  adminYearToVal = yt ? yt.value.trim() : '';

  closeAdminFilterModal();
  filterAdminTable();
}

// RESET FILTER DARI DALAM MODAL ADMIN
function resetAllAdminFiltersFromModal() {
  tempAdminCategories.clear();
  tempAdminProdis.clear();

  const yf = document.getElementById('adminFilterYearFrom');
  if (yf) yf.value = '';

  const yt = document.getElementById('adminFilterYearTo');
  if (yt) yt.value = '';

  renderAdminCategoryChips();
  renderAdminProdiChips();
  renderAdminYearPresets();
}

// RESET SEMUA FILTER LENGKAP ADMIN
function resetAllAdminFilters() {
  selectedAdminCategories.clear();
  selectedAdminProdis.clear();
  tempAdminCategories.clear();
  tempAdminProdis.clear();
  adminYearFromVal = '';
  adminYearToVal = '';

  const searchInput = document.getElementById('adminSearchInput');
  if (searchInput) searchInput.value = '';

  const yf = document.getElementById('adminFilterYearFrom');
  if (yf) yf.value = '';

  const yt = document.getElementById('adminFilterYearTo');
  if (yt) yt.value = '';

  renderAdminCategoryChips();
  renderAdminProdiChips();
  filterAdminTable();
}

// Render Chip Kategori Admin
function renderAdminCategoryChips() {
  const container = document.getElementById('adminCategoryCheckboxList');
  if (!container) return;

  if (adminCategories.length === 0) {
    container.innerHTML = '<div class="filter-empty-msg">Tidak ada kategori tersedia</div>';
    return;
  }

  container.innerHTML = adminCategories.map(cat => {
    const isChecked = tempAdminCategories.has(cat.id);

    return `
      <div class="filter-chip-card ${isChecked ? 'active' : ''}" onclick="toggleTempAdminCategory('${cat.id}')">
        <span class="chip-checkbox-box"><i class="fa-solid fa-check"></i></span>
        <span class="chip-label" title="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</span>
      </div>
    `;
  }).join('');
}

// Render Chip Prodi Admin
function renderAdminProdiChips() {
  const container = document.getElementById('adminProdiCheckboxList');
  if (!container) return;

  if (adminProdiList.length === 0) {
    container.innerHTML = '<div class="filter-empty-msg">Tidak ada data program studi</div>';
    return;
  }

  container.innerHTML = adminProdiList.map(p => {
    const isChecked = tempAdminProdis.has(p);

    return `
      <div class="filter-chip-card ${isChecked ? 'active' : ''}" onclick="toggleTempAdminProdi('${escapeHtml(p)}')">
        <span class="chip-checkbox-box"><i class="fa-solid fa-check"></i></span>
        <span class="chip-label" title="${escapeHtml(p)}">${escapeHtml(p)}</span>
      </div>
    `;
  }).join('');
}

// Toggle Kategori di dalam Modal Admin
function toggleTempAdminCategory(catId) {
  if (tempAdminCategories.has(catId)) {
    tempAdminCategories.delete(catId);
  } else {
    tempAdminCategories.add(catId);
  }
  renderAdminCategoryChips();
}

// Toggle Prodi di dalam Modal Admin
function toggleTempAdminProdi(prodiName) {
  if (tempAdminProdis.has(prodiName)) {
    tempAdminProdis.delete(prodiName);
  } else {
    tempAdminProdis.add(prodiName);
  }
  renderAdminProdiChips();
}

// Pilih Semua / Batal Semua Kategori Admin
function toggleAllAdminCategories() {
  const allSelected = adminCategories.every(c => tempAdminCategories.has(c.id));

  if (allSelected) {
    tempAdminCategories.clear();
  } else {
    adminCategories.forEach(c => tempAdminCategories.add(c.id));
  }
  renderAdminCategoryChips();
}

// Pilih Semua / Batal Semua Prodi Admin
function toggleAllAdminProdis() {
  const allSelected = adminProdiList.every(p => tempAdminProdis.has(p));

  if (allSelected) {
    tempAdminProdis.clear();
  } else {
    adminProdiList.forEach(p => tempAdminProdis.add(p));
  }
  renderAdminProdiChips();
}

// Render Dynamic Preset Tahun Admin (Berdasarkan new Date().getFullYear())
function renderAdminYearPresets() {
  const container = document.getElementById('adminYearQuickPresets');
  if (!container) return;

  const currentYear = new Date().getFullYear();
  const yf = document.getElementById('adminFilterYearFrom');
  const yt = document.getElementById('adminFilterYearTo');
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
      <button type="button" class="btn-preset-chip ${isActive ? 'active' : ''}" onclick="setAdminYearPreset(${fromParam}, ${toParam})">
        ${p.label}
      </button>
    `;
  }).join('');
}

// Quick Preset Tahun Admin
function setAdminYearPreset(from, to) {
  const yf = document.getElementById('adminFilterYearFrom');
  const yt = document.getElementById('adminFilterYearTo');
  if (yf) yf.value = from !== null && from !== undefined ? from : '';
  if (yt) yt.value = to !== null && to !== undefined ? to : '';

  renderAdminYearPresets();
}

// Update Indikator Angka Filter Aktif pada Tombol "Filter Koleksi" Admin
function updateAdminFilterActiveBadge() {
  let activeCount = 0;
  activeCount += selectedAdminCategories.size;
  activeCount += selectedAdminProdis.size;
  if (adminYearFromVal || adminYearToVal) activeCount += 1;

  const badge = document.getElementById('adminFilterIndicatorBadge');
  const btn = document.getElementById('btnAdminFilterModal');

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

// Render Active Filter Pills Admin (Tags di atas tabel)
function renderAdminActiveFilterPills() {
  const container = document.getElementById('adminActiveFilterPills');
  if (!container) return;

  const pills = [];
  const searchInput = document.getElementById('adminSearchInput');
  const q = searchInput ? searchInput.value.trim() : '';

  // Query search pill
  if (q) {
    pills.push(`
      <span class="filter-pill">
        <i class="fa-solid fa-magnifying-glass"></i> "${escapeHtml(q)}"
        <button type="button" class="pill-remove-btn" onclick="clearAdminSearchFilter()" title="Hapus kata kunci">&times;</button>
      </span>
    `);
  }

  // Category pills
  selectedAdminCategories.forEach(catId => {
    const catObj = adminCategories.find(c => c.id === catId);
    const catName = catObj ? catObj.name : catId;
    pills.push(`
      <span class="filter-pill category-pill">
        <i class="fa-solid fa-tag"></i> ${escapeHtml(catName)}
        <button type="button" class="pill-remove-btn" onclick="removeAdminCategoryFilter('${catId}')" title="Hapus filter kategori">&times;</button>
      </span>
    `);
  });

  // Prodi pills
  selectedAdminProdis.forEach(prodi => {
    pills.push(`
      <span class="filter-pill prodi-pill">
        <i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(prodi)}
        <button type="button" class="pill-remove-btn" onclick="removeAdminProdiFilter('${escapeHtml(prodi)}')" title="Hapus filter prodi">&times;</button>
      </span>
    `);
  });

  // Year Range pill
  if (adminYearFromVal || adminYearToVal) {
    let yearLabel = '';
    if (adminYearFromVal && adminYearToVal) {
      if (adminYearFromVal === adminYearToVal) {
        yearLabel = `${adminYearFromVal}`;
      } else {
        yearLabel = `${adminYearFromVal} - ${adminYearToVal}`;
      }
    } else if (adminYearFromVal) {
      yearLabel = `≥ ${adminYearFromVal}`;
    } else if (adminYearToVal) {
      yearLabel = `≤ ${adminYearToVal}`;
    }
    pills.push(`
      <span class="filter-pill year-pill">
        <i class="fa-regular fa-calendar"></i> Tahun: ${yearLabel}
        <button type="button" class="pill-remove-btn" onclick="clearAdminYearFilter()" title="Hapus filter tahun">&times;</button>
      </span>
    `);
  }

  if (pills.length > 0) {
    container.innerHTML = `
      <div class="active-pills-list">
        <span class="active-pills-label"><i class="fa-solid fa-filter"></i> Filter Aktif:</span>
        ${pills.join('')}
      </div>
      <button type="button" class="btn-clear-all-pills" onclick="resetAllAdminFilters()">
        <i class="fa-solid fa-rotate-left"></i> Reset Filter
      </button>
    `;
    container.style.display = 'flex';
  } else {
    container.innerHTML = '';
    container.style.display = 'none';
  }
}

function removeAdminCategoryFilter(catId) {
  selectedAdminCategories.delete(catId);
  tempAdminCategories.delete(catId);
  filterAdminTable();
}

function removeAdminProdiFilter(prodiName) {
  selectedAdminProdis.delete(prodiName);
  tempAdminProdis.delete(prodiName);
  filterAdminTable();
}

function clearAdminSearchFilter() {
  const searchInput = document.getElementById('adminSearchInput');
  if (searchInput) searchInput.value = '';
  filterAdminTable();
}

function clearAdminYearFilter() {
  adminYearFromVal = '';
  adminYearToVal = '';
  tempAdminYearFrom = '';
  tempAdminYearTo = '';
  const yf = document.getElementById('adminFilterYearFrom');
  if (yf) yf.value = '';
  const yt = document.getElementById('adminFilterYearTo');
  if (yt) yt.value = '';
  filterAdminTable();
}

async function loadAdminCategories() {
  try {
    const res = await fetch('/api/categories');
    adminCategories = await res.json();

    const select = document.getElementById('bookCategory');
    if (select) {
      select.innerHTML = '<option value="">-- Pilih Kategori --</option>' + 
        adminCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    renderAdminCategoryChips();
  } catch (err) {
    console.error('Error load categories:', err);
  }
}

async function loadAdminProdi() {
  try {
    const res = await fetch('/api/prodi');
    const data = await res.json();
    adminProdiList = Array.isArray(data) ? data : (data.all || []);

    const dataList = document.getElementById('prodiDataList');
    if (dataList) {
      dataList.innerHTML = adminProdiList.map(p => `<option value="${p}">`).join('');
    }

    renderAdminProdiChips();
  } catch (err) {
    console.error('Error load prodi:', err);
  }
}

async function loadAdminRacks() {
  try {
    const res = await fetch('/api/racks');
    adminRacks = await res.json();

    const select = document.getElementById('bookRack');
    if (select) {
      select.innerHTML = '<option value="">-- Pilih Rak & Tingkat --</option>' + 
        adminRacks.map(r => `<option value="${r.id}">${r.rack_name} (Tingkat ${r.level_number})</option>`).join('');
    }
  } catch (err) {
    console.error('Error load racks:', err);
  }
}

async function loadAdminBooks() {
  const tbody = document.getElementById('adminBookTableBody');

  try {
    const res = await fetch('/api/books?all=true');
    adminBooks = await res.json();

    // Hitung counter tab
    const demoBooks = adminBooks.filter(b => b.is_demo === true);
    const generalBooks = adminBooks.filter(b => b.is_demo !== true);

    const cAll = document.getElementById('countTabAll');
    const cDemo = document.getElementById('countTabDemo');
    const cGen = document.getElementById('countTabGeneral');

    if (cAll) cAll.textContent = adminBooks.length;
    if (cDemo) cDemo.textContent = demoBooks.length;
    if (cGen) cGen.textContent = generalBooks.length;

    filterAdminTable();
    loadSystemStatus();
  } catch (err) {
    console.error('Error load books:', err);
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="color: red; text-align: center;">Gagal mengambil data buku dari server.</td></tr>';
  }
}

function renderAdminTable(books) {
  const tbody = document.getElementById('adminBookTableBody');
  if (!tbody) return;

  if (books.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: #64748B;">Tidak ada buku yang cocok dengan filter atau pencarian.</td></tr>';
    return;
  }

  tbody.innerHTML = books.map(b => {
    return `
      <tr>
        <td>
          <img class="table-cover-thumb" src="${b.cover_url || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80'}" alt="${b.title}" onerror="this.src='https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500&q=80'">
        </td>
        <td>
          <strong>${b.id}</strong>
          ${b.isbn ? `<div style="font-size: 0.75rem; color: #64748B;">ISBN: ${b.isbn}</div>` : ''}
          <div style="margin-top: 4px;">
            ${b.is_demo 
              ? `<span class="badge-is-demo" title="Buku peraga demonstrasi miniatur rak IoT"><i class="fa-solid fa-star" style="color: #F59E0B;"></i> Demo IoT</span>` 
              : `<span class="badge-is-general" title="Buku katalog umum perpustakaan"><i class="fa-solid fa-book-bookmark"></i> Umum</span>`}
          </div>
        </td>
        <td>
          <div style="font-weight: 700; color: #0B192C;">${b.title}</div>
          <div style="font-size: 0.8rem; color: #64748B;">Penulis: ${b.author} ${b.publish_year ? `(${b.publish_year})` : ''}</div>
          ${b.prodi ? `<div style="margin-top: 5px;"><span class="badge-prodi"><i class="fa-solid fa-graduation-cap"></i> ${b.prodi}</span></div>` : ''}
        </td>
        <td>
          <span class="table-badge-category" style="background-color: ${b.color_hex || '#0284C7'};">
            ${b.category_name || 'Umum'}
          </span>
        </td>
        <td>
          <div style="font-weight: 600;">${b.rack_name || 'Rak Utama'}</div>
          <div style="font-size: 0.78rem; color: #0284C7; font-weight: 700;">Tingkat ${b.level_number || 1} &bull; LED #${b.led_slot}</div>
        </td>
        <td>
          <div style="font-weight: 700; color: #1E293B;">${b.available_stock || 1} dari ${b.total_stock || 1} Buku</div>
          <span style="font-size: 0.75rem; color: ${(b.available_stock || 0) > 0 ? '#10B981' : '#EF4444'}; font-weight: 700;">
            ${(b.available_stock || 0) > 0 ? 'Tersedia' : 'Sedang Habis'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-secondary" style="padding: 6px 10px; font-size: 0.78rem;" title="Test Sinyal LED" onclick="testLocateBook('${b.id}')">
              <i class="fa-solid fa-lightbulb" style="color: #F59E0B;"></i>
            </button>
            <button class="btn-secondary" style="padding: 6px 10px; font-size: 0.78rem;" title="Edit Buku" onclick="openEditBookModal('${b.id}')">
              <i class="fa-solid fa-pen-to-square" style="color: #0284C7;"></i>
            </button>
            <button class="btn-secondary" style="padding: 6px 10px; font-size: 0.78rem;" title="Hapus Buku" onclick="deleteBook('${b.id}', '${b.title.replace(/'/g, "\\'")}')">
              <i class="fa-solid fa-trash" style="color: #EF4444;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterAdminTable() {
  const baseBooks = getFilteredBooks();
  const searchInput = document.getElementById('adminSearchInput');

  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';

  updateAdminFilterActiveBadge();
  renderAdminActiveFilterPills();

  let filtered = baseBooks;

  // 1. Filter Search Text
  if (q) {
    filtered = filtered.filter(b => 
      b.title.toLowerCase().includes(q) ||
      b.author.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q) ||
      (b.isbn && b.isbn.toLowerCase().includes(q)) ||
      (b.prodi && b.prodi.toLowerCase().includes(q)) ||
      (b.category_name && b.category_name.toLowerCase().includes(q))
    );
  }

  // 2. Multi-Kategori & Multi-Prodi (Smart Scoping seperti Publik & Kiosk)
  if (selectedAdminCategories.size > 0 || selectedAdminProdis.size > 0) {
    const catArray = Array.from(selectedAdminCategories);
    const prodiArray = Array.from(selectedAdminProdis);
    const nonSkripsiCats = catArray.filter(c => !c.toLowerCase().includes('skripsi'));
    const hasSkripsi = catArray.some(c => c.toLowerCase().includes('skripsi'));

    filtered = filtered.filter(b => {
      if (prodiArray.length > 0) {
        const matchProdi = b.prodi && prodiArray.includes(b.prodi);
        const matchNonSkripsi = nonSkripsiCats.includes(b.category_id);
        return matchProdi || matchNonSkripsi;
      } else if (catArray.length > 0) {
        return catArray.includes(b.category_id);
      }
      return true;
    });
  }

  // 3. Filter Rentang Tahun
  if (adminYearFromVal) {
    const yf = parseInt(adminYearFromVal, 10);
    if (!isNaN(yf)) {
      filtered = filtered.filter(b => b.publish_year && b.publish_year >= yf);
    }
  }

  if (adminYearToVal) {
    const yt = parseInt(adminYearToVal, 10);
    if (!isNaN(yt)) {
      filtered = filtered.filter(b => b.publish_year && b.publish_year <= yt);
    }
  }

  renderAdminTable(filtered);
}

// Generate ID Buku Otomatis
function generateAutoBookId() {
  const categorySelect = document.getElementById('bookCategory');
  const selectedCat = categorySelect ? categorySelect.value : '';
  
  let prefix = 'BK';
  if (selectedCat === 'CAT-SKRIPSI' || selectedCat.toLowerCase().includes('skripsi')) {
    prefix = 'TA';
  }

  let maxNum = 0;
  adminBooks.forEach(b => {
    if (b.id && b.id.startsWith(prefix + '-')) {
      const parts = b.id.split('-');
      const num = parseInt(parts[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });

  const nextNum = String(maxNum + 1).padStart(3, '0');
  const generatedId = `${prefix}-${nextNum}`;
  document.getElementById('bookId').value = generatedId;
}

// ==============================================================================
// 4.1 SMART CONDITIONAL FIELD & SEARCHABLE COMBOBOX LOGIC (PRODI)
// ==============================================================================
function isCategorySkripsi(catId) {
  if (!catId) return false;
  if (catId === 'CAT-SKRIPSI') return true;
  const cat = adminCategories.find(c => c.id === catId);
  if (!cat) return false;
  const name = cat.name.toLowerCase();
  return name.includes('skripsi') || name.includes('tugas akhir') || name.includes('thesis') || name.includes('ta');
}

function onAdminCategoryChange() {
  const catSelect = document.getElementById('bookCategory');
  const selCat = catSelect ? catSelect.value : '';
  const isSkripsi = isCategorySkripsi(selCat);
  const prodiGroup = document.getElementById('prodiFormGroup');

  if (prodiGroup) {
    prodiGroup.style.display = isSkripsi ? 'block' : 'none';
    if (!isSkripsi) {
      document.getElementById('bookProdi').value = '';
      const sInp = document.getElementById('prodiSearchInput');
      if (sInp) sInp.value = '';
    }
  }

  if (document.getElementById('formMode').value === 'ADD') {
    generateAutoBookId();
  }
}

function openProdiDropdown() {
  const dropdown = document.getElementById('prodiDropdownMenu');
  const input = document.getElementById('prodiSearchInput');
  if (dropdown) {
    renderProdiDropdown(input ? input.value : '');
    dropdown.style.display = 'block';
  }
}

function closeProdiDropdown() {
  const dropdown = document.getElementById('prodiDropdownMenu');
  if (dropdown) dropdown.style.display = 'none';
}

function handleProdiSearch(query) {
  openProdiDropdown();
  renderProdiDropdown(query);
  document.getElementById('bookProdi').value = query.trim();
}

function renderProdiDropdown(query = '') {
  const dropdown = document.getElementById('prodiDropdownMenu');
  if (!dropdown) return;

  const q = (query || '').trim().toLowerCase();
  const currentVal = document.getElementById('bookProdi').value;

  const matches = adminProdiList.filter(p => p.toLowerCase().includes(q));
  const exactMatch = adminProdiList.some(p => p.toLowerCase() === q);

  let html = '';

  if (matches.length > 0) {
    html += matches.map(p => {
      const isSelected = p === currentVal;
      return `
        <div class="combobox-item ${isSelected ? 'selected' : ''}" onclick="selectProdi('${p.replace(/'/g, "\\'")}')">
          <span><i class="fa-solid fa-graduation-cap" style="color: #3B82F6; margin-right: 6px;"></i> ${p}</span>
          ${isSelected ? '<i class="fa-solid fa-check" style="color: #1E40AF;"></i>' : ''}
        </div>
      `;
    }).join('');
  } else if (!q) {
    html += `<div class="combobox-item empty-msg">Belum ada data prodi. Ketik untuk menambah baru.</div>`;
  }

  // Opsi Tambah Baru jika user mengetik prodi yang belum ada di daftar
  if (q && !exactMatch) {
    const raw = (document.getElementById('prodiSearchInput').value || '').trim();
    html += `
      <div class="combobox-item add-new" onclick="selectProdi('${raw.replace(/'/g, "\\'")}')">
        <span><i class="fa-solid fa-circle-plus"></i> Tambah Baru: "<strong>${raw}</strong>"</span>
      </div>
    `;
  }

  dropdown.innerHTML = html;
}

function selectProdi(prodiName) {
  const clean = prodiName.trim();
  document.getElementById('bookProdi').value = clean;
  const input = document.getElementById('prodiSearchInput');
  if (input) input.value = clean;

  if (clean && !adminProdiList.includes(clean)) {
    adminProdiList.push(clean);
    adminProdiList.sort((a, b) => a.localeCompare(b));
    const filterProdi = document.getElementById('adminFilterProdi');
    if (filterProdi) {
      filterProdi.innerHTML = '<option value="ALL">Semua Prodi</option>' + 
        adminProdiList.map(p => `<option value="${p}">${p}</option>`).join('');
    }
  }

  closeProdiDropdown();
}

function handleProdiKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const dropdown = document.getElementById('prodiDropdownMenu');
    const firstItem = dropdown ? dropdown.querySelector('.combobox-item:not(.empty-msg)') : null;
    if (firstItem) {
      firstItem.click();
    } else {
      const input = document.getElementById('prodiSearchInput');
      if (input && input.value.trim()) {
        selectProdi(input.value.trim());
      }
    }
  } else if (e.key === 'Escape') {
    closeProdiDropdown();
  }
}

// Tutup dropdown combobox saat klik di luar area
document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('prodiComboboxWrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    closeProdiDropdown();
  }
});

function previewCoverImage(url) {
  const box = document.getElementById('coverPreviewBox');
  const btnRemove = document.getElementById('btnRemoveCover');
  if (url && url.trim().length > 0) {
    box.innerHTML = `<img src="${url.trim()}" alt="Preview" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.parentElement.innerHTML='<span style=\\'font-size:0.72rem; color:#EF4444; padding:4px; text-align:center;\\'>Gambar Rusak</span>'">`;
    if (btnRemove) btnRemove.style.display = 'inline-flex';
  } else {
    box.innerHTML = `<span style="font-size: 0.72rem; color: #94A3B8; text-align: center; padding: 4px;">No Cover</span>`;
    if (btnRemove) btnRemove.style.display = 'none';
  }
}

async function handleCoverFileUpload(file) {
  if (!file) return;

  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    notifyToast('error', 'Format file tidak didukung! Harap unggah JPG, PNG, atau WebP.');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    notifyToast('error', 'Ukuran gambar melebihi 5 MB. Harap perkecil ukuran file.');
    return;
  }

  const statusEl = document.getElementById('coverUploadStatus');
  const bookId = document.getElementById('bookId').value.trim() || 'book';

  statusEl.innerHTML = `<span style="color: #0284C7;"><i class="fa-solid fa-spinner fa-spin"></i> Mengunggah ke Cloudinary...</span>`;

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'covers');
    formData.append('prefix', `cover_${bookId}`);

    const res = await fetch('/api/upload/image', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Gagal upload file');
    }

    // Set values
    document.getElementById('bookCoverUrl').value = data.url;
    document.getElementById('bookCoverPublicId').value = data.public_id;
    const manualInput = document.getElementById('manualCoverUrlInput');
    if (manualInput) manualInput.value = data.url;

    previewCoverImage(data.url);
    statusEl.innerHTML = `<span style="color: #10B981;"><i class="fa-solid fa-circle-check"></i> Cover berhasil diunggah (${data.format.toUpperCase()}, ${(data.bytes / 1024).toFixed(0)} KB)</span>`;
    notifyToast('success', 'Gambar sampul berhasil diunggah ke Cloudinary!');
  } catch (err) {
    console.error('Upload cover error:', err);
    statusEl.innerHTML = `<span style="color: #EF4444;"><i class="fa-solid fa-circle-xmark"></i> ${err.message || 'Gagal upload'}</span>`;
    notifyToast('error', `Gagal upload gambar: ${err.message}`);
  }
}

function toggleManualCoverUrl() {
  const wrapper = document.getElementById('manualCoverUrlWrapper');
  if (wrapper) {
    const isHidden = wrapper.style.display === 'none';
    wrapper.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      const input = document.getElementById('manualCoverUrlInput');
      if (input) input.focus();
    }
  }
}

function applyManualCoverUrl(url) {
  document.getElementById('bookCoverUrl').value = url.trim();
  // Jika input manual URL luar, kosongkan public_id agar tidak memicu delete Cloudinary yang salah
  document.getElementById('bookCoverPublicId').value = '';
  previewCoverImage(url);
  const statusEl = document.getElementById('coverUploadStatus');
  if (statusEl) {
    statusEl.innerHTML = url.trim().length > 0 
      ? `<span style="color: #0284C7;"><i class="fa-solid fa-link"></i> Menggunakan URL eksternal</span>`
      : `Format JPG, PNG, atau WebP (Maks. 5 MB). Atau drag & drop file ke area ini.`;
  }
}

function removeCoverImage() {
  document.getElementById('bookCoverUrl').value = '';
  document.getElementById('bookCoverPublicId').value = '';
  const fileInput = document.getElementById('bookCoverFileInput');
  if (fileInput) fileInput.value = '';
  const manualInput = document.getElementById('manualCoverUrlInput');
  if (manualInput) manualInput.value = '';
  const statusEl = document.getElementById('coverUploadStatus');
  if (statusEl) statusEl.innerHTML = `Format JPG, PNG, atau WebP (Maks. 5 MB). Atau drag & drop file ke area ini.`;
  previewCoverImage('');
}

// Setup Drag & Drop untuk Cover Dropzone saat DOM siap
document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('coverDropZone');
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#0284C7';
        dropZone.style.background = '#F0F9FF';
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.borderColor = '#CBD5E1';
        dropZone.style.background = '#F8FAFC';
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        handleCoverFileUpload(files[0]);
      }
    }, false);
  }
});

function openAddBookModal() {
  document.getElementById('formMode').value = 'ADD';
  document.getElementById('bookModalTitle').textContent = 'Tambah Koleksi Buku Baru';
  document.getElementById('bookForm').reset();
  document.getElementById('bookId').readOnly = false;
  document.getElementById('bookIsDemo').checked = true;
  document.getElementById('bookProdi').value = '';
  const searchInput = document.getElementById('prodiSearchInput');
  if (searchInput) searchInput.value = '';
  onAdminCategoryChange();

  // Reset Cover Upload State
  document.getElementById('bookCoverUrl').value = '';
  document.getElementById('bookCoverPublicId').value = '';
  const fileInput = document.getElementById('bookCoverFileInput');
  if (fileInput) fileInput.value = '';
  const manualInput = document.getElementById('manualCoverUrlInput');
  if (manualInput) manualInput.value = '';
  const manualWrapper = document.getElementById('manualCoverUrlWrapper');
  if (manualWrapper) manualWrapper.style.display = 'none';
  const statusEl = document.getElementById('coverUploadStatus');
  if (statusEl) statusEl.innerHTML = `Format JPG, PNG, atau WebP (Maks. 5 MB). Atau drag & drop file ke area ini.`;
  previewCoverImage('');

  document.getElementById('bookFormModal').classList.add('open');
}

function openEditBookModal(bookId) {
  const book = adminBooks.find(b => b.id === bookId);
  if (!book) return;

  document.getElementById('formMode').value = 'EDIT';
  document.getElementById('bookModalTitle').textContent = `Edit Data Buku: ${book.title}`;
  
  document.getElementById('bookId').value = book.id;
  document.getElementById('bookId').readOnly = true;
  document.getElementById('bookIsbn').value = book.isbn || '';
  document.getElementById('bookTitle').value = book.title;
  document.getElementById('bookAuthor').value = book.author;
  document.getElementById('bookPublisher').value = book.publisher || '';
  document.getElementById('bookYear').value = book.publish_year || '';
  document.getElementById('bookPages').value = book.page_count || '';
  document.getElementById('bookCategory').value = book.category_id;
  document.getElementById('bookRack').value = book.rack_id;
  document.getElementById('bookLedSlot').value = book.led_slot;
  document.getElementById('bookStock').value = book.total_stock || 1;
  document.getElementById('bookCoverUrl').value = book.cover_url || '';
  document.getElementById('bookCoverPublicId').value = book.cover_public_id || '';
  document.getElementById('bookSynopsis').value = book.synopsis || '';
  document.getElementById('bookIsDemo').checked = (book.is_demo === true);

  const manualInput = document.getElementById('manualCoverUrlInput');
  if (manualInput) manualInput.value = book.cover_url || '';
  const manualWrapper = document.getElementById('manualCoverUrlWrapper');
  if (manualWrapper) manualWrapper.style.display = 'none';

  const statusEl = document.getElementById('coverUploadStatus');
  if (statusEl) {
    if (book.cover_public_id) {
      statusEl.innerHTML = `<span style="color: #10B981;"><i class="fa-solid fa-cloud"></i> Tersimpan di Cloudinary CDN</span>`;
    } else if (book.cover_url) {
      statusEl.innerHTML = `<span style="color: #64748B;"><i class="fa-solid fa-link"></i> URL Eksternal</span>`;
    } else {
      statusEl.innerHTML = `Format JPG, PNG, atau WebP (Maks. 5 MB). Atau drag & drop file ke area ini.`;
    }
  }

  // Set Program Studi & visibility
  onAdminCategoryChange();
  const prodiVal = book.prodi || '';
  document.getElementById('bookProdi').value = prodiVal;
  const searchInput = document.getElementById('prodiSearchInput');
  if (searchInput) searchInput.value = prodiVal;

  previewCoverImage(book.cover_url);
  document.getElementById('bookFormModal').classList.add('open');
}

function closeBookFormModal() {
  document.getElementById('bookFormModal').classList.remove('open');
}

async function handleSaveBook(e) {
  e.preventDefault();
  const mode = document.getElementById('formMode').value;
  const categoryId = document.getElementById('bookCategory').value;
  const prodiInput = document.getElementById('bookProdi');
  const prodiVal = prodiInput ? prodiInput.value.trim() : '';

  const payload = {
    id: document.getElementById('bookId').value.trim(),
    isbn: document.getElementById('bookIsbn').value.trim(),
    title: document.getElementById('bookTitle').value.trim(),
    author: document.getElementById('bookAuthor').value.trim(),
    publisher: document.getElementById('bookPublisher').value.trim(),
    publish_year: parseInt(document.getElementById('bookYear').value, 10) || null,
    page_count: parseInt(document.getElementById('bookPages').value, 10) || null,
    category_id: categoryId,
    prodi: isCategorySkripsi(categoryId) ? prodiVal : null,
    rack_id: document.getElementById('bookRack').value,
    led_slot: parseInt(document.getElementById('bookLedSlot').value, 10),
    is_demo: document.getElementById('bookIsDemo').checked,
    total_stock: parseInt(document.getElementById('bookStock').value, 10) || 1,
    cover_url: document.getElementById('bookCoverUrl').value.trim(),
    cover_public_id: document.getElementById('bookCoverPublicId').value.trim(),
    synopsis: document.getElementById('bookSynopsis').value.trim()
  };

  try {
    let url = '/api/books';
    let method = 'POST';

    if (mode === 'EDIT') {
      url = `/api/books/${payload.id}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) {
      showModalAlert({
        title: 'Gagal Menyimpan Buku',
        text: result.error || 'Terjadi kesalahan saat menyimpan data buku.',
        icon: 'error'
      });
      return;
    }

    notifyToast('success', result.message || 'Data buku berhasil disimpan!');
    closeBookFormModal();
    loadAdminBooks();
  } catch (err) {
    console.error('Error save book:', err);
    showModalAlert({
      title: 'Kesalahan Koneksi',
      text: 'Terjadi kesalahan koneksi saat menyimpan buku.',
      icon: 'error'
    });
  }
}

async function deleteBook(bookId, title) {
  const confirmed = await showModalConfirm({
    title: 'Hapus Koleksi Buku?',
    html: `Apakah Anda yakin ingin menghapus buku <strong>"${title}"</strong> (Kode: <code>${bookId}</code>) dari database?`,
    icon: 'warning',
    confirmText: '<i class="fa-solid fa-trash"></i> Ya, Hapus',
    cancelText: 'Batal',
    isDanger: true
  });

  if (confirmed) {
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: 'DELETE' });
      const result = await res.json();
      notifyToast('success', result.message || 'Buku berhasil dihapus!');
      loadAdminBooks();
    } catch (err) {
      console.error('Error delete book:', err);
      showModalAlert({
        title: 'Gagal Menghapus',
        text: 'Terjadi kesalahan saat menghapus buku.',
        icon: 'error'
      });
    }
  }
}

async function testLocateBook(bookId) {
  try {
    const res = await fetch(`/api/books/${bookId}/locate`, { method: 'POST' });
    const result = await res.json();
    if (!res.ok) {
      showModalAlert({
        title: 'Gagal Tes LED',
        text: result.error || 'Gagal mengirim sinyal tes LED.',
        icon: 'error'
      });
      return;
    }
    showTestLocateModal(result.data);
  } catch (err) {
    console.error('Error test locate:', err);
    showModalAlert({
      title: 'Gagal Tes LED',
      text: 'Gagal mengirim sinyal tes LED ke broker MQTT.',
      icon: 'error'
    });
  }
}

// Helper Set Warna Kategori
function setCategoryColor(hex) {
  if (!hex.startsWith('#')) hex = '#' + hex;
  document.getElementById('catColorHex').value = hex.toUpperCase();
  document.getElementById('catColorPicker').value = hex;
}

// Modal Kategori
function openCategoryModal() {
  document.getElementById('categoryForm').reset();
  setCategoryColor('#0284C7');

  const countBadge = document.getElementById('existingCatCount');
  if (countBadge) countBadge.textContent = `${adminCategories.length} Kategori`;

  const listContainer = document.getElementById('existingCategoriesList');
  if (listContainer) {
    if (adminCategories.length === 0) {
      listContainer.innerHTML = '<span style="font-size: 0.8rem; color: #94A3B8; text-align: center; padding: 12px;">Belum ada kategori yang terdaftar.</span>';
    } else {
      listContainer.innerHTML = adminCategories.map(c => `
        <div class="category-card-item">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${c.color_hex || '#0284C7'}; display: inline-block; flex-shrink: 0; box-shadow: 0 0 4px ${c.color_hex || '#0284C7'};"></span>
            <div>
              <div style="font-weight: 700; color: #0F172A; font-size: 0.84rem;">${c.name}</div>
              ${c.description ? `<div style="font-size: 0.72rem; color: #64748B;">${c.description}</div>` : ''}
            </div>
          </div>
          <span class="table-badge-category" style="background-color: ${c.color_hex || '#0284C7'}; padding: 3px 10px; font-size: 0.72rem; border-radius: 6px;">
            ${c.id}
          </span>
        </div>
      `).join('');
    }
  }

  document.getElementById('categoryModal').classList.add('open');
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('open');
}

async function handleSaveCategory(e) {
  e.preventDefault();
  const payload = {
    id: document.getElementById('catId').value.trim(),
    name: document.getElementById('catName').value.trim(),
    color_hex: document.getElementById('catColorHex').value.trim(),
    description: document.getElementById('catDesc').value.trim()
  };

  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) {
      showModalAlert({
        title: 'Gagal Menyimpan Kategori',
        text: result.error || 'Gagal menyimpan kategori.',
        icon: 'error'
      });
      return;
    }

    notifyToast('success', 'Kategori baru berhasil disimpan!');
    closeCategoryModal();
    loadAdminCategories();
  } catch (err) {
    console.error('Error save category:', err);
    showModalAlert({
      title: 'Kesalahan Server',
      text: 'Terjadi kesalahan saat menyimpan kategori.',
      icon: 'error'
    });
  }
}

// ==============================================================================
// 5. MODUL PEMINJAMAN BUKU & SIRKULASI
// ==============================================================================
async function loadLoansData() {
  const statusFilter = document.getElementById('loanFilterStatus') ? document.getElementById('loanFilterStatus').value : 'ACTIVE';
  
  try {
    const res = await fetch(`/api/loans?status=${statusFilter}`);
    adminLoans = await res.json();
    renderLoansTable(adminLoans);

    // Ambil daftar overdue secara khusus untuk badge sidebar & section overdue
    const overdueRes = await fetch('/api/loans?status=OVERDUE');
    const overdueLoans = await overdueRes.json();
    
    document.getElementById('sidebarOverdueCount').textContent = overdueLoans.length;
    document.getElementById('overdueBannerCount').textContent = `${overdueLoans.length} Buku Terlambat`;
    renderOverdueTable(overdueLoans);

  } catch (err) {
    console.error('Error load loans:', err);
  }
}

function renderLoansTable(loans) {
  const tbody = document.getElementById('loanTableBody');
  if (!tbody) return;

  if (loans.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: #64748B;">Tidak ada transaksi peminjaman pada filter ini.</td></tr>';
    return;
  }

  tbody.innerHTML = loans.map(l => {
    const isOverdue = l.calculated_status === 'OVERDUE';
    const isExtended = l.calculated_status === 'EXTENDED';
    const isReturned = l.calculated_status === 'RETURNED';

    let statusBadge = `<span class="badge-active-loan"><i class="fa-solid fa-clock"></i> Aktif Pinjam</span>`;
    if (isOverdue) {
      statusBadge = `<span class="badge-overdue"><i class="fa-solid fa-triangle-exclamation"></i> Terlambat ${l.days_overdue} Hari</span>`;
    } else if (isExtended) {
      statusBadge = `<span class="badge-extended-loan"><i class="fa-solid fa-arrows-rotate"></i> Diperpanjang</span>`;
    } else if (isReturned) {
      statusBadge = `<span class="badge-returned-loan"><i class="fa-solid fa-check"></i> Dikembalikan (${l.return_date})</span>`;
    }

    const rowClass = isOverdue ? 'class="table-row-overdue"' : '';

    return `
      <tr ${rowClass}>
        <td><strong>${l.id}</strong></td>
        <td>
          <div style="font-weight: 700; color: #0B192C;">${l.member_name}</div>
          <div style="font-size: 0.78rem; color: #64748B;">NIM: ${l.member_nim} &bull; ${l.member_prodi}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: #0284C7;">${l.book_title}</div>
          <div style="font-size: 0.75rem; color: #64748B;">Tingkat ${l.level_number || 1} &bull; LED #${l.led_slot}</div>
        </td>
        <td><span style="font-size: 0.85rem; color: #475569;">${l.borrow_date}</span></td>
        <td>
          <strong style="color: ${isOverdue ? '#EF4444' : '#1E293B'}; font-size: 0.88rem;">${l.due_date}</strong>
        </td>
        <td>${statusBadge}</td>
        <td>
          ${!isReturned ? `
            <div style="display: flex; gap: 6px;">
              ${!isOverdue && (l.extension_count || 0) < 1 ? `
                <button class="btn-extend" onclick="extendLoan('${l.id}')" title="Perpanjang 7 Hari (Max 1x)">
                  <i class="fa-solid fa-clock-rotate-left"></i> +7 Hari
                </button>
              ` : ''}
              <button class="btn-return" onclick="returnLoan('${l.id}', '${l.book_title.replace(/'/g, "\\'")}')" title="Kembalikan Buku ke Rak">
                <i class="fa-solid fa-circle-check"></i> Kembalikan
              </button>
            </div>
          ` : '<span style="font-size: 0.78rem; color: #94A3B8;">Selesai</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function filterLoanTable(query) {
  if (!query) {
    renderLoansTable(adminLoans);
    return;
  }

  const q = query.toLowerCase();
  const filtered = adminLoans.filter(l => 
    l.member_name.toLowerCase().includes(q) ||
    l.member_nim.toLowerCase().includes(q) ||
    l.book_title.toLowerCase().includes(q) ||
    l.id.toLowerCase().includes(q)
  );

  renderLoansTable(filtered);
}

// Render Tabel Khusus Buku Terlambat (Overdue)
function renderOverdueTable(overdueLoans) {
  const tbody = document.getElementById('overdueTableBody');
  if (!tbody) return;

  if (overdueLoans.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 24px; color: #10B981; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> Luar biasa! Tidak ada mahasiswa yang terlambat mengembalikan buku saat ini.</td></tr>';
    return;
  }

  const finePerDay = parseInt(adminSettings.fine_per_day || '1000', 10);
  const libraryName = adminSettings.library_name || 'UPT Perpustakaan UNSIKA';
  const libraryHours = adminSettings.library_hours || 'Senin - Jumat: 08.00 - 16.00 WIB';
  let defaultTemplate = adminSettings.wa_overdue_template || 'Halo {nama} (NIM: {nim}), kami dari {nama_perpus} menginformasikan bahwa peminjaman buku "{judul}" telah melewati batas pengembalian pada tanggal {tanggal_tempo} (Terlambat {hari_terlambat} hari). Estimasi denda: {denda}. Layanan sirkulasi buka: {jam_buka}. Mohon segera mengembalikan buku tersebut ke perpustakaan. Terima kasih.';

  tbody.innerHTML = overdueLoans.map(l => {
    const rawPhone = (l.member_phone || '').replace(/[^0-9]/g, '');
    const waPhone = rawPhone.startsWith('0') ? '62' + rawPhone.slice(1) : rawPhone;

    const totalFine = (l.days_overdue || 0) * finePerDay;
    const fineFormatted = totalFine > 0 ? `Rp ${totalFine.toLocaleString('id-ID')}` : 'Rp 0';

    const msgText = defaultTemplate
      .replace(/{nama}/g, l.member_name || '')
      .replace(/{nim}/g, l.member_nim || '')
      .replace(/{judul}/g, l.book_title || '')
      .replace(/{tanggal_tempo}/g, l.due_date || '')
      .replace(/{hari_terlambat}/g, l.days_overdue || '0')
      .replace(/{denda}/g, fineFormatted)
      .replace(/{jam_buka}/g, libraryHours)
      .replace(/{nama_perpus}/g, libraryName)
      .replace(/{kode_pinjam}/g, l.id || '')
      .replace(/{tanggal_pinjam}/g, l.borrow_date || '');

    const waMessage = encodeURIComponent(msgText);
    const waLink = `https://wa.me/${waPhone}?text=${waMessage}`;

    return `
      <tr class="table-row-overdue">
        <td><strong>${l.id}</strong></td>
        <td>
          <div style="font-weight: 700; color: #991B1B;">${l.member_name}</div>
          <div style="font-size: 0.78rem; color: #7F1D1D;">NIM: ${l.member_nim}</div>
        </td>
        <td>${l.member_prodi}</td>
        <td>
          <div style="font-weight: 600;">${l.book_title}</div>
          <div style="font-size: 0.75rem; color: #64748B;">Slot LED #${l.led_slot}</div>
        </td>
        <td><strong style="color: #991B1B;">${l.due_date}</strong></td>
        <td>
          <span class="badge-overdue">
            <i class="fa-solid fa-triangle-exclamation"></i> Terlambat ${l.days_overdue} Hari
          </span>
          ${totalFine > 0 ? `<div style="font-size: 0.75rem; color: #B91C1C; margin-top: 4px; font-weight: 700;">Denda: ${fineFormatted}</div>` : ''}
        </td>
        <td>
          <div style="display: flex; gap: 8px; align-items: center;">
            ${waPhone ? `
              <a href="${waLink}" target="_blank" class="btn-whatsapp" title="Kirim Pengingat WhatsApp Sesuai Template">
                <i class="fa-brands fa-whatsapp"></i> Chat WA
              </a>
            ` : ''}
            <button class="btn-return" onclick="returnLoan('${l.id}', '${l.book_title.replace(/'/g, "\\'")}')" title="Kembalikan Buku">
              <i class="fa-solid fa-circle-check"></i> Kembalikan
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Modal Form Pinjam Buku Baru
function openCreateLoanModal() {
  document.getElementById('loanForm').reset();

  const defaultDays = parseInt(adminSettings.default_loan_days || '7', 10);
  const today = new Date();
  const due = new Date();
  due.setDate(today.getDate() + defaultDays);

  const durationLabel = document.getElementById('loanModalDurationLabel');
  if (durationLabel) durationLabel.textContent = `${defaultDays} Hari`;

  document.getElementById('loanBorrowDate').value = today.toISOString().split('T')[0];
  document.getElementById('loanDueDate').value = `${due.toISOString().split('T')[0]} (${defaultDays} Hari)`;
  document.getElementById('nimLookupStatus').innerHTML = '<span style="color: #64748B;">Masukkan NIM mahasiswa untuk auto-fill data otomatis.</span>';

  // Isi dropdown buku yang tersedia saja (stok > 0)
  const bookSelect = document.getElementById('loanBookSelect');
  const availableBooks = adminBooks.filter(b => (b.available_stock || 0) > 0);

  if (availableBooks.length === 0) {
    bookSelect.innerHTML = '<option value="">Semua buku sedang habis dipinjam!</option>';
  } else {
    bookSelect.innerHTML = '<option value="">-- Pilih Buku yang Tersedia --</option>' + 
      availableBooks.map(b => `<option value="${b.id}">${b.title} (Sisa: ${b.available_stock} Buku • Rak T${b.level_number || 1})</option>`).join('');
  }

  document.getElementById('loanModal').classList.add('open');
}

function closeLoanModal() {
  document.getElementById('loanModal').classList.remove('open');
}

// Smart Auto-Fill NIM Mahasiswa
async function lookupMemberByNim(nim) {
  const statusBox = document.getElementById('nimLookupStatus');
  const cleanNim = nim.trim();

  if (cleanNim.length < 4) {
    statusBox.innerHTML = '<span style="color: #64748B;">Masukkan NIM mahasiswa untuk auto-fill data otomatis.</span>';
    return;
  }

  try {
    const res = await fetch(`/api/members/${encodeURIComponent(cleanNim)}`);
    if (res.ok) {
      const member = await res.json();
      document.getElementById('loanMemberName').value = member.name || '';
      document.getElementById('loanMemberProdi').value = member.prodi || '';
      document.getElementById('loanMemberPhone').value = member.phone || '';
      statusBox.innerHTML = `<span style="color: #10B981; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Mahasiswa Terdaftar: ${member.name} (${member.prodi})</span>`;
    } else {
      statusBox.innerHTML = `<span style="color: #F59E0B; font-weight: 600;"><i class="fa-solid fa-user-plus"></i> Mahasiswa baru belum terdaftar! Silakan lengkapi nama & no HP di bawah.</span>`;
    }
  } catch (err) {
    console.error('Error lookup NIM:', err);
  }
}

async function handleSaveLoan(e) {
  e.preventDefault();

  const payload = {
    member_nim: document.getElementById('loanMemberNim').value.trim(),
    member_name: document.getElementById('loanMemberName').value.trim(),
    member_prodi: document.getElementById('loanMemberProdi').value.trim(),
    member_phone: document.getElementById('loanMemberPhone').value.trim(),
    book_id: document.getElementById('loanBookSelect').value,
    notes: document.getElementById('loanNotes').value.trim()
  };

  try {
    const res = await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) {
      showModalAlert({
        title: 'Gagal Membuat Peminjaman',
        text: result.error || 'Gagal membuat transaksi peminjaman.',
        icon: 'error'
      });
      return;
    }

    closeLoanModal();
    loadLoansData();
    loadAdminBooks();
    loadMembersData();

    // Tampilkan popup lengkap beserta tanggal jatuh tempo untuk pustakawan
    if (result.data) {
      showLoanSuccessModal(result.data);
    } else {
      notifyToast('success', result.message || 'Peminjaman berhasil disimpan!');
    }
  } catch (err) {
    console.error('Error save loan:', err);
    showModalAlert({
      title: 'Kesalahan Sistem',
      text: 'Terjadi kesalahan saat memproses peminjaman.',
      icon: 'error'
    });
  }
}

async function extendLoan(loanId) {
  const confirmed = await showModalConfirm({
    title: 'Perpanjang Peminjaman Buku?',
    html: 'Perpanjang masa peminjaman buku ini selama <strong>7 hari ke depan</strong>?<br><small style="color: #64748B;">(Maksimal perpanjangan hanya 1 kali)</small>',
    icon: 'question',
    confirmText: '<i class="fa-solid fa-calendar-plus"></i> Ya, Perpanjang',
    cancelText: 'Batal'
  });

  if (confirmed) {
    try {
      const res = await fetch(`/api/loans/${loanId}/extend`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) {
        showModalAlert({
          title: 'Gagal Perpanjang',
          text: result.error || 'Gagal memperpanjang peminjaman.',
          icon: 'error'
        });
        return;
      }
      loadLoansData();
      if (result.data) {
        showExtendSuccessModal(result.data);
      } else {
        notifyToast('success', result.message || 'Peminjaman berhasil diperpanjang 7 hari!');
      }
    } catch (err) {
      console.error('Error extend loan:', err);
      showModalAlert({
        title: 'Gagal Perpanjang',
        text: 'Gagal memperpanjang masa peminjaman.',
        icon: 'error'
      });
    }
  }
}

async function returnLoan(loanId, bookTitle) {
  const confirmed = await showModalConfirm({
    title: 'Konfirmasi Pengembalian Buku',
    html: `Konfirmasi pengembalian buku <strong>"${bookTitle}"</strong>?<br><small style="color: #10B981; font-weight: 600;">Stok buku di rak akan otomatis bertambah kembali.</small>`,
    icon: 'question',
    confirmText: '<i class="fa-solid fa-check"></i> Ya, Sudah Dikembalikan',
    cancelText: 'Batal'
  });

  if (confirmed) {
    try {
      const res = await fetch(`/api/loans/${loanId}/return`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) {
        showModalAlert({
          title: 'Gagal Pengembalian',
          text: result.error || 'Gagal memproses pengembalian.',
          icon: 'error'
        });
        return;
      }
      notifyToast('success', result.message || 'Buku berhasil dikembalikan!');
      loadLoansData();
      loadAdminBooks();
    } catch (err) {
      console.error('Error return loan:', err);
      showModalAlert({
        title: 'Gagal Pengembalian',
        text: 'Gagal memproses pengembalian buku.',
        icon: 'error'
      });
    }
  }
}

// ==============================================================================
// 6. MASTER DATA MAHASISWA (MEMBERS)
// ==============================================================================
async function loadMembersData() {
  try {
    const res = await fetch('/api/members');
    adminMembers = await res.json();
    renderMembersTable(adminMembers);
  } catch (err) {
    console.error('Error load members:', err);
  }
}

function renderMembersTable(members) {
  const tbody = document.getElementById('memberTableBody');
  if (!tbody) return;

  if (members.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 24px; color: #64748B;">Belum ada anggota mahasiswa terdaftar.</td></tr>';
    return;
  }

  tbody.innerHTML = members.map(m => {
    const rawPhone = (m.phone || '').replace(/[^0-9]/g, '');
    const waPhone = rawPhone.startsWith('0') ? '62' + rawPhone.slice(1) : rawPhone;
    const waLink = `https://wa.me/${waPhone}`;

    return `
      <tr>
        <td><strong>${m.nim}</strong></td>
        <td>
          <div style="font-weight: 700; color: #0B192C;">${m.name}</div>
        </td>
        <td>${m.prodi}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>${m.phone}</span>
            ${waPhone ? `
              <a href="${waLink}" target="_blank" style="color: #25D366;" title="Kirim Pesan WhatsApp">
                <i class="fa-brands fa-whatsapp"></i>
              </a>
            ` : ''}
          </div>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-secondary" style="padding: 6px 10px; font-size: 0.78rem;" title="Edit Mahasiswa" onclick="openEditMemberModal('${m.nim}')">
              <i class="fa-solid fa-pen-to-square" style="color: #0284C7;"></i>
            </button>
            <button class="btn-secondary" style="padding: 6px 10px; font-size: 0.78rem;" title="Hapus Mahasiswa" onclick="deleteMember('${m.nim}', '${m.name.replace(/'/g, "\\'")}')">
              <i class="fa-solid fa-trash" style="color: #EF4444;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterMemberTable(query) {
  if (!query) {
    renderMembersTable(adminMembers);
    return;
  }

  const q = query.toLowerCase();
  const filtered = adminMembers.filter(m => 
    m.name.toLowerCase().includes(q) ||
    m.nim.toLowerCase().includes(q) ||
    m.prodi.toLowerCase().includes(q)
  );

  renderMembersTable(filtered);
}

function openAddMemberModal() {
  document.getElementById('memberModalTitle').textContent = 'Tambah Anggota Mahasiswa';
  document.getElementById('memberForm').reset();
  document.getElementById('memberNim').readOnly = false;
  document.getElementById('memberModal').classList.add('open');
}

function openEditMemberModal(nim) {
  const member = adminMembers.find(m => m.nim === nim);
  if (!member) return;

  document.getElementById('memberModalTitle').textContent = `Edit Data Mahasiswa: ${member.name}`;
  document.getElementById('memberNim').value = member.nim;
  document.getElementById('memberNim').readOnly = true;
  document.getElementById('memberName').value = member.name;
  document.getElementById('memberProdi').value = member.prodi;
  document.getElementById('memberPhone').value = member.phone;

  document.getElementById('memberModal').classList.add('open');
}

function closeMemberModal() {
  document.getElementById('memberModal').classList.remove('open');
}

async function handleSaveMember(e) {
  e.preventDefault();

  const payload = {
    nim: document.getElementById('memberNim').value.trim(),
    name: document.getElementById('memberName').value.trim(),
    prodi: document.getElementById('memberProdi').value.trim(),
    phone: document.getElementById('memberPhone').value.trim()
  };

  try {
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) {
      showModalAlert({
        title: 'Gagal Menyimpan Mahasiswa',
        text: result.error || 'Gagal menyimpan data mahasiswa.',
        icon: 'error'
      });
      return;
    }

    notifyToast('success', 'Data mahasiswa berhasil disimpan!');
    closeMemberModal();
    loadMembersData();
  } catch (err) {
    console.error('Error save member:', err);
    showModalAlert({
      title: 'Kesalahan Sistem',
      text: 'Terjadi kesalahan saat menyimpan data mahasiswa.',
      icon: 'error'
    });
  }
}

async function deleteMember(nim, name) {
  const confirmed = await showModalConfirm({
    title: 'Hapus Data Mahasiswa?',
    html: `Apakah Anda yakin ingin menghapus data mahasiswa <strong>"${name}"</strong> (NIM: <code>${nim}</code>)?`,
    icon: 'warning',
    confirmText: '<i class="fa-solid fa-trash"></i> Ya, Hapus',
    cancelText: 'Batal',
    isDanger: true
  });

  if (confirmed) {
    try {
      const res = await fetch(`/api/members/${nim}`, { method: 'DELETE' });
      const result = await res.json();
      notifyToast('success', result.message || 'Mahasiswa berhasil dihapus.');
      loadMembersData();
    } catch (err) {
      console.error('Error delete member:', err);
      showModalAlert({
        title: 'Gagal Menghapus',
        text: 'Gagal menghapus data mahasiswa.',
        icon: 'error'
      });
    }
  }
}

// ==============================================================================
// 7. MODUL PENGATURAN SISTEM PERPUSTAKAAN (APP SETTINGS)
// ==============================================================================
let activeWaTemplateTarget = 'settingWaOverdueTemplate';

function setWaTemplateFocus(targetId) {
  activeWaTemplateTarget = targetId;
}

function insertWaPlaceholder(placeholder) {
  const targetId = activeWaTemplateTarget || 'settingWaOverdueTemplate';
  const targetTextarea = document.getElementById(targetId);
  if (!targetTextarea) return;

  const startPos = targetTextarea.selectionStart !== undefined ? targetTextarea.selectionStart : targetTextarea.value.length;
  const endPos = targetTextarea.selectionEnd !== undefined ? targetTextarea.selectionEnd : targetTextarea.value.length;
  const originalText = targetTextarea.value;

  // Sisipkan variabel placeholder di posisi kursor aktif
  targetTextarea.value = originalText.substring(0, startPos) + placeholder + originalText.substring(endPos);

  // Tempatkan kursor tepat setelah teks placeholder yang disisipkan
  const newCursorPos = startPos + placeholder.length;
  targetTextarea.focus();
  targetTextarea.setSelectionRange(newCursorPos, newCursorPos);

  const targetLabel = targetId === 'settingWaOverdueTemplate' ? 'Template Terlambat' : 'Template Bukti Pinjam';
  notifyToast('info', `Variabel ${placeholder} berhasil disisipkan ke ${targetLabel}`);
}

async function loadSettingsData() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return;

    adminSettings = await res.json();

    // Isi Nilai ke Form Settings
    const setVal = (id, val) => {
      const elem = document.getElementById(id);
      if (elem && val !== undefined) elem.value = val;
    };

    setVal('settingDefaultLoanDays', adminSettings.default_loan_days || 7);
    setVal('settingExtensionDays', adminSettings.extension_days || 7);
    setVal('settingMaxExtensionCount', adminSettings.max_extension_count || 1);
    setVal('settingMaxBooksPerMember', adminSettings.max_books_per_member || 3);
    setVal('settingFinePerDay', adminSettings.fine_per_day || 1000);
    setVal('settingLedDurationSeconds', adminSettings.led_duration_seconds || 15);
    setVal('settingLibraryName', adminSettings.library_name || 'UPT Perpustakaan UNSIKA');
    setVal('settingLibraryHours', adminSettings.library_hours || 'Senin - Jumat: 08.00 - 16.00 WIB');
    setVal('settingLibraryHotline', adminSettings.library_hotline || '');
    setVal('settingWaOverdueTemplate', adminSettings.wa_overdue_template || '');
    setVal('settingWaReceiptTemplate', adminSettings.wa_loan_receipt_template || '');

  } catch (err) {
    console.error('Error load settings:', err);
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();

  const payload = {
    default_loan_days: document.getElementById('settingDefaultLoanDays').value.trim(),
    extension_days: document.getElementById('settingExtensionDays').value.trim(),
    max_extension_count: document.getElementById('settingMaxExtensionCount').value.trim(),
    max_books_per_member: document.getElementById('settingMaxBooksPerMember').value.trim(),
    fine_per_day: document.getElementById('settingFinePerDay').value.trim(),
    led_duration_seconds: document.getElementById('settingLedDurationSeconds').value.trim(),
    library_name: document.getElementById('settingLibraryName').value.trim(),
    library_hours: document.getElementById('settingLibraryHours').value.trim(),
    library_hotline: document.getElementById('settingLibraryHotline').value.trim(),
    wa_overdue_template: document.getElementById('settingWaOverdueTemplate').value.trim(),
    wa_loan_receipt_template: document.getElementById('settingWaReceiptTemplate').value.trim()
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) {
      showModalAlert({
        title: 'Gagal Menyimpan Pengaturan',
        text: result.error || 'Gagal memperbarui pengaturan sistem.',
        icon: 'error'
      });
      return;
    }

    adminSettings = result.settings || payload;
    notifyToast('success', result.message || 'Pengaturan berhasil diperbarui!');
    
    // Perbarui tabel overdue jika sedang aktif
    loadLoansData();
  } catch (err) {
    console.error('Error save settings:', err);
    showModalAlert({
      title: 'Kesalahan Sistem',
      text: 'Terjadi kesalahan saat menyimpan pengaturan.',
      icon: 'error'
    });
  }
}

async function handleResetSettings() {
  const confirmed = await showModalConfirm({
    title: 'Reset Pengaturan ke Default?',
    text: 'Seluruh durasi peminjaman, parameter IoT, dan template WhatsApp akan dikembalikan ke nilai standar awal perpustakaan.',
    icon: 'warning',
    confirmText: '<i class="fa-solid fa-rotate-left"></i> Ya, Reset Standar',
    cancelText: 'Batal',
    isDanger: true
  });

  if (confirmed) {
    try {
      const res = await fetch('/api/settings/reset', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) {
        showModalAlert({
          title: 'Gagal Reset',
          text: result.error || 'Gagal mengembalikan pengaturan ke awal.',
          icon: 'error'
        });
        return;
      }

      adminSettings = result.settings;
      await loadSettingsData();
      notifyToast('success', result.message || 'Pengaturan berhasil direset!');
      loadLoansData();
    } catch (err) {
      console.error('Error reset settings:', err);
      showModalAlert({
        title: 'Kesalahan Sistem',
        text: 'Terjadi kesalahan saat mereset pengaturan.',
        icon: 'error'
      });
    }
  }
}

