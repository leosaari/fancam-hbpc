// ============================================
// HBPC FAN-CAM — Interface Admin / Modération
// ============================================

(function () {
  const socket = io();

  // Get pass from URL
  const urlParams = new URLSearchParams(window.location.search);
  const pass = urlParams.get('pass');

  // DOM
  const photoGrid = document.getElementById('photo-grid');
  const emptyState = document.getElementById('empty-state');
  const statTotal = document.getElementById('stat-total');
  const statPending = document.getElementById('stat-pending');
  const statApproved = document.getElementById('stat-approved');
  const statRejected = document.getElementById('stat-rejected');
  const filterTabs = document.querySelectorAll('.filter-tab');

  let photos = [];
  let currentFilter = 'all';

  // ===== LOAD PHOTOS =====
  async function loadPhotos() {
    try {
      const res = await fetch(`/api/photos?pass=${pass}`);
      if (!res.ok) throw new Error('Unauthorized');
      photos = await res.json();
      updateStats();
      renderGrid();
    } catch (err) {
      console.error('Load error:', err);
    }
  }

  // ===== UPDATE STATS =====
  function updateStats() {
    statTotal.textContent = photos.length;
    statPending.textContent = photos.filter(p => p.status === 'pending').length;
    statApproved.textContent = photos.filter(p => p.status === 'approved').length;
    statRejected.textContent = photos.filter(p => p.status === 'rejected').length;
  }

  // ===== RENDER GRID =====
  function renderGrid() {
    const filtered = currentFilter === 'all'
      ? photos
      : photos.filter(p => p.status === currentFilter);

    if (filtered.length === 0) {
      photoGrid.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    photoGrid.innerHTML = filtered.map(photo => `
      <div class="photo-card status-${photo.status}" data-id="${photo.id}">
        <img src="/uploads/${photo.filename}" alt="Fan photo" loading="lazy">
        <div class="photo-card-info">
          <div class="photo-card-pseudo">${photo.pseudo || 'Anonyme'}</div>
          <div class="photo-card-date">${new Date(photo.created_at).toLocaleString('fr-FR')}</div>
          <div class="photo-card-status ${photo.status}">
            ${photo.status === 'pending' ? '⏳ En attente' : photo.status === 'approved' ? '✅ Approuvée' : '❌ Rejetée'}
            ${photo.favorite ? ' ⭐' : ''}
          </div>
          <div class="photo-card-actions">
            ${photo.status !== 'approved' ? `<button class="btn btn--success btn--small" onclick="approvePhoto(${photo.id})">✅ Approuver</button>` : ''}
            ${photo.status !== 'rejected' ? `<button class="btn btn--danger btn--small" onclick="rejectPhoto(${photo.id})">❌ Rejeter</button>` : ''}
            <button class="btn btn--outline btn--small" onclick="toggleFavorite(${photo.id}, ${photo.favorite ? 0 : 1})">${photo.favorite ? '⭐ Retirer ❤️' : '⭐ Coup de cœur'}</button>
            <button class="btn btn--danger btn--small" onclick="deletePhoto(${photo.id})">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  // ===== API CALLS =====
  window.approvePhoto = async (id) => {
    await patchPhoto(id, { status: 'approved' });
  };

  window.rejectPhoto = async (id) => {
    await patchPhoto(id, { status: 'rejected' });
  };

  window.toggleFavorite = async (id, value) => {
    await patchPhoto(id, { favorite: value });
  };

  window.deletePhoto = async (id) => {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      await fetch(`/api/photos/${id}?pass=${pass}`, { method: 'DELETE' });
      photos = photos.filter(p => p.id !== id);
      updateStats();
      renderGrid();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  async function patchPhoto(id, body) {
    try {
      const res = await fetch(`/api/photos/${id}?pass=${pass}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const updated = await res.json();

      // Update local array
      const idx = photos.findIndex(p => p.id === id);
      if (idx !== -1) photos[idx] = updated;

      updateStats();
      renderGrid();
    } catch (err) {
      console.error('Patch error:', err);
    }
  }

  // ===== FILTER TABS =====
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderGrid();
    });
  });

  // ===== SOCKET: REAL-TIME UPDATES =====
  socket.on('new-photo', (photo) => {
    photos.unshift(photo);
    updateStats();
    renderGrid();
    showToast(`Nouvelle photo de ${photo.pseudo || 'Anonyme'} !`);
  });

  socket.on('photo-deleted', ({ id }) => {
    photos = photos.filter(p => p.id !== id);
    updateStats();
    renderGrid();
  });

  // ===== TOAST =====
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ===== INIT =====
  loadPhotos();
})();
