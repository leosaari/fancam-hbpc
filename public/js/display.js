// ============================================
// HBPC FAN-CAM — Écran Géant (Diaporama)
// ============================================

(function () {
  const socket = io();

  // DOM
  const slidesContainer = document.getElementById('slides-container');
  const waitingScreen = document.getElementById('waiting-screen');
  const muteBtn = document.getElementById('mute-btn');
  const roarAudio = document.getElementById('roar-audio');

  let photos = [];
  let currentIndex = -1;
  let slideInterval = null;
  let isMuted = false;

  // ===== MUTE BUTTON =====
  muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
    muteBtn.style.cursor = 'pointer';
  });

  // Show cursor on mouse move, hide after 3s
  let cursorTimeout;
  document.addEventListener('mousemove', () => {
    document.body.style.cursor = 'default';
    clearTimeout(cursorTimeout);
    cursorTimeout = setTimeout(() => {
      document.body.style.cursor = 'none';
    }, 3000);
  });

  // ===== LOAD APPROVED PHOTOS =====
  async function loadPhotos() {
    try {
      const res = await fetch('/api/photos/approved');
      photos = await res.json();
      if (photos.length > 0) {
        waitingScreen.style.display = 'none';
        if (!slideInterval) startSlideshow();
      } else {
        waitingScreen.style.display = 'block';
      }
    } catch (err) {
      console.error('Load error:', err);
    }
  }

  // ===== SLIDESHOW ENGINE =====
  function startSlideshow() {
    showNextSlide();
    slideInterval = setInterval(showNextSlide, 5000);
  }

  function showNextSlide() {
    if (photos.length === 0) return;

    currentIndex = (currentIndex + 1) % photos.length;
    const photo = photos[currentIndex];

    // Create new slide
    const slide = document.createElement('div');
    slide.className = 'display-slide';
    slide.innerHTML = `
      <div class="display-photo-frame" style="animation: zoomFadeIn 0.8s ease forwards;">
        <img src="/uploads/${photo.filename}" alt="Fan photo">
        ${photo.pseudo ? `
          <div class="display-pseudo">
            <span>${escapeHtml(photo.pseudo)}</span>
          </div>
        ` : ''}
      </div>
    `;

    slidesContainer.appendChild(slide);

    // Trigger animation
    requestAnimationFrame(() => {
      slide.classList.add('active');
    });

    // Play roar sound
    if (!isMuted && roarAudio) {
      roarAudio.currentTime = 0;
      roarAudio.volume = 0.3;
      roarAudio.play().catch(() => {});
    }

    // Remove old slides after transition
    const allSlides = slidesContainer.querySelectorAll('.display-slide');
    if (allSlides.length > 2) {
      allSlides[0].remove();
    }

    // Fade out previous slide
    if (allSlides.length > 1) {
      setTimeout(() => {
        if (allSlides[0] && allSlides[0].parentNode) {
          allSlides[0].classList.remove('active');
        }
      }, 100);
    }
  }

  // ===== SOCKET: REAL-TIME =====
  socket.on('photo-approved', (photo) => {
    // Add to slideshow if not already present
    if (!photos.find(p => p.id === photo.id)) {
      photos.push(photo);
    }
    if (photos.length === 1) {
      waitingScreen.style.display = 'none';
      startSlideshow();
    }
  });

  socket.on('photo-rejected', (photo) => {
    photos = photos.filter(p => p.id !== photo.id);
    if (photos.length === 0) {
      waitingScreen.style.display = 'block';
      clearInterval(slideInterval);
      slideInterval = null;
      slidesContainer.innerHTML = '';
      currentIndex = -1;
    }
  });

  socket.on('photo-deleted', ({ id }) => {
    photos = photos.filter(p => p.id !== id);
    if (photos.length === 0) {
      waitingScreen.style.display = 'block';
      clearInterval(slideInterval);
      slideInterval = null;
      slidesContainer.innerHTML = '';
      currentIndex = -1;
    }
  });

  // Periodically refresh the full list (every 30s as backup)
  setInterval(loadPhotos, 30000);

  // ===== UTILS =====
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== INIT =====
  loadPhotos();
})();
