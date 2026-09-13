// ==============================================================================
// 📍 FINDLIB UNSIKA - KIOSK ON-SITE JAVASCRIPT (READ-ONLY SEARCH & LOCATE)
// ==============================================================================
// FindLib UNSIKA (Find your Library) - Terminal pencarian buku & penunjuk rak LED.
// ==============================================================================

let currentKioskCategory = 'ALL';
let kioskBooks = [];
let countdownInterval = null;
let isRackVisible = true;

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
  loadKioskCategories();
  loadKioskBooks();

  // Search Listeners
  const searchInput = document.getElementById('kioskSearchInput');
  const searchBtn = document.getElementById('kioskSearchBtn');

  searchBtn.addEventListener('click', () => {
    loadKioskBooks(searchInput.value.trim());
  });

  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      loadKioskBooks(searchInput.value.trim());
    }
  });
});

// Cek Status MQTT & Status Mode Demo IoT
async function checkMqttStatus() {
  try {
    const res = await fetch('/api/system-status');
    const data = await res.json();
    const pill = document.getElementById('mqttStatusPill');
    const text = document.getElementById('mqttStatusText');
    const demoPill = document.getElementById('kioskDemoPill');
    const demoText = document.getElementById('kioskDemoText');

    if (data.mqtt.status === 'CONNECTED') {
      pill.style.background = 'rgba(16, 185, 129, 0.2)';
      pill.style.color = '#34D399';
      text.textContent = 'Rak LED Online';
    } else {
      pill.style.background = 'rgba(245, 158, 11, 0.2)';
      pill.style.color = '#FBBF24';
      text.textContent = 'Rak LED Siap';
    }

    if (demoPill && data.demoMode && data.demoMode.enabled) {
      demoPill.style.display = 'inline-flex';
      if (demoText) demoText.textContent = `Mode Demo Rak (${data.demoMode.demoBooksCount} Buku)`;
    } else if (demoPill) {
      demoPill.style.display = 'none';
    }
  } catch (e) {
    document.getElementById('mqttStatusText').textContent = 'Standby';
  }
}

// Ambil Kategori Dinamis
async function loadKioskCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();

    const select = document.getElementById('kioskCategorySelect');
    if (!select) return;

    let html = `<option value="ALL">📚 Semua Kategori</option>`;
    categories.forEach(cat => {
      html += `<option value="${cat.id}">${cat.name}</option>`;
    });

    select.innerHTML = html;
    select.value = currentKioskCategory;
  } catch (err) {
    console.error('Error load categories:', err);
  }
}

function selectKioskCategory(catId) {
  currentKioskCategory = catId;
  const searchVal = document.getElementById('kioskSearchInput').value.trim();
  loadKioskBooks(searchVal);
}

// Ambil Buku untuk Kiosk
async function loadKioskBooks(query = '') {
  const grid = document.getElementById('kioskBookGrid');
  const countText = document.getElementById('kioskBookCount');
  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px; color: #64748B;"><i class="fa-solid fa-spinner fa-spin"></i> Memuat buku...</div>';

  try {
    let url = `/api/books?category=${currentKioskCategory}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;

    const res = await fetch(url);
    kioskBooks = await res.json();

    countText.textContent = `${kioskBooks.length} buku`;

    if (kioskBooks.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 30px; background: white; border-radius: 8px; color: #64748B;">Tidak ada buku yang cocok dengan pencarian Anda.</div>';
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
            
            <div class="book-meta-sub">
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

    statusBox.style.display = 'block';
    bookNameText.textContent = `"${book.title}" (Tingkat ${book.level_number}, Slot #${book.led_slot})`;

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
    timerText.textContent = remaining;

    countdownInterval = setInterval(() => {
      remaining--;
      timerText.textContent = remaining;

      if (remaining <= 0) {
        clearInterval(countdownInterval);
        resetVirtualRack();
        statusBox.style.display = 'none';
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
