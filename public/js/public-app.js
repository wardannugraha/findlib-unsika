// ==============================================================================
// 📚 FINDLIB UNSIKA - PUBLIC CATALOG JAVASCRIPT
// ==============================================================================
// FindLib UNSIKA (Find your Library) - Khusus pengunjung publik/mahasiswa:
// Menampilkan info buku, ketersediaan stok, dan sinopsis.
// ==============================================================================

let currentCategory = 'ALL';
let allBooks = [];

document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadBooks();

  // Search Listeners
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');

  searchBtn.addEventListener('click', () => {
    loadBooks(searchInput.value.trim());
  });

  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      loadBooks(searchInput.value.trim());
    }
  });
});

// Ambil Kategori Dinamis
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();

    const select = document.getElementById('categorySelect');
    if (!select) return;

    let html = `<option value="ALL">📚 Semua Kategori</option>`;
    categories.forEach(cat => {
      html += `<option value="${cat.id}">${cat.name}</option>`;
    });

    select.innerHTML = html;
    select.value = currentCategory;
  } catch (err) {
    console.error('Gagal memuat kategori:', err);
  }
}

// Filter Kategori
function selectCategory(catId) {
  currentCategory = catId;
  const searchVal = document.getElementById('searchInput').value.trim();
  loadBooks(searchVal);
}

// Ambil Data Buku Publik
async function loadBooks(query = '') {
  const grid = document.getElementById('bookGrid');
  const countText = document.getElementById('bookCountText');
  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #64748B;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top: 10px;">Memuat koleksi...</p></div>';

  try {
    let url = `/api/books?category=${currentCategory}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;

    const res = await fetch(url);
    allBooks = await res.json();

    countText.textContent = `Menampilkan ${allBooks.length} buku`;

    if (allBooks.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; background: white; border-radius: 12px; border: 1px dashed #CBD5E1;">
          <i class="fa-solid fa-book-open fa-3x" style="color: #94A3B8; margin-bottom: 12px;"></i>
          <h3 style="color: #1E293B;">Buku tidak ditemukan</h3>
          <p style="color: #64748B; font-size: 0.9rem;">Coba gunakan kata kunci pencarian yang lain atau pilih kategori Semua.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = allBooks.map(book => {
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
              <button class="btn-secondary btn-card-detail-full" onclick="openBookModal('${book.id}')">
                <i class="fa-solid fa-circle-info"></i> Detail Buku
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Error memuat buku:', err);
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: red;">Gagal mengambil data dari server.</div>';
  }
}

// Buka Modal Detail & Sinopsis (Publik)
function openBookModal(bookId) {
  const book = allBooks.find(b => b.id === bookId);
  if (!book) return;

  document.getElementById('modalBookTitle').textContent = book.title;
  const modalBody = document.getElementById('modalBookBody');

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

    <div style="background: #F8FAFC; padding: 14px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #E2E8F0;">
      <h4 style="font-size: 0.9rem; color: #0B192C; margin-bottom: 4px;">
        <i class="fa-solid fa-circle-info" style="color: #0284C7;"></i> Informasi Lokasi Fisik di Perpustakaan:
      </h4>
      <p style="font-size: 0.83rem; color: #475569; line-height: 1.5;">
        Buku ini ditempatkan di <strong>${book.rack_name || 'Rak Koleksi Utama'}</strong>.
      </p>
      <p style="font-size: 0.78rem; color: #64748B; margin-top: 6px; font-style: italic;">
        *Untuk menyalakan lampu indikator navigasi presisi langsung di rak fisik, silakan gunakan terminal Kiosk yang tersedia di lantai perpustakaan UNSIKA.
      </p>
    </div>

    <div>
      <h4 style="font-size: 0.9rem; color: #0B192C; margin-bottom: 6px;"><i class="fa-solid fa-align-left"></i> Sinopsis / Deskripsi:</h4>
      <p style="font-size: 0.88rem; color: #475569; line-height: 1.6; text-align: justify;">
        ${book.synopsis || 'Belum ada sinopsis untuk buku ini.'}
      </p>
    </div>
  `;

  document.getElementById('bookDetailModal').classList.add('open');
}

function closeBookModal() {
  document.getElementById('bookDetailModal').classList.remove('open');
}
