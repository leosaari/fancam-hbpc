// ============================================
// HBPC FAN-CAM — Interface Fan (Mobile Premium)
// ============================================

(function () {
  const socket = io();

  // DOM Elements
  const captureArea = document.getElementById('capture-area');
  const capturePlaceholder = document.getElementById('capture-placeholder');
  const btnCamera = document.getElementById('btn-camera');
  const btnGallery = document.getElementById('btn-gallery');
  const btnChange = document.getElementById('btn-change');
  const inputCamera = document.getElementById('input-camera');
  const inputGallery = document.getElementById('input-gallery');
  const previewImg = document.getElementById('preview-img');
  const pseudoInput = document.getElementById('pseudo-input');
  const charCount = document.getElementById('char-count');
  const btnSubmit = document.getElementById('btn-submit');
  const formSection = document.getElementById('form-section');
  const successSection = document.getElementById('success-section');
  const photoCountEl = document.getElementById('photo-count');

  let selectedFile = null;

  // ===== ANIMATED BACKGROUND PARTICLES =====
  function createParticles() {
    const container = document.getElementById('bg-particles');
    if (!container) return;
    const count = 20;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'bg-particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.width = (Math.random() * 3 + 1) + 'px';
      particle.style.height = particle.style.width;
      particle.style.animationDuration = (Math.random() * 8 + 6) + 's';
      particle.style.animationDelay = (Math.random() * 10) + 's';
      container.appendChild(particle);
    }
  }
  createParticles();

  // ===== CHECK IF ALREADY SUBMITTED =====
  if (localStorage.getItem('hbpc_fancam_submitted')) {
    showSuccess();
  }

  // ===== SOCKET: PHOTO COUNT =====
  socket.on('photo-count', (count) => {
    animateCounter(photoCountEl, count);
  });

  function animateCounter(el, target) {
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;
    const diff = target - current;
    const steps = Math.min(Math.abs(diff), 20);
    const increment = diff / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      el.textContent = Math.round(current + increment * step);
      if (step >= steps) {
        el.textContent = target;
        clearInterval(timer);
      }
    }, 40);
  }

  // ===== CHARACTER COUNTER =====
  pseudoInput.addEventListener('input', () => {
    charCount.textContent = pseudoInput.value.length;
  });

  // ===== CAMERA / GALLERY BUTTONS =====
  btnCamera.addEventListener('click', (e) => {
    e.stopPropagation();
    inputCamera.click();
  });

  btnGallery.addEventListener('click', (e) => {
    e.stopPropagation();
    inputGallery.click();
  });

  btnChange.addEventListener('click', (e) => {
    e.stopPropagation();
    inputGallery.click();
  });

  captureArea.addEventListener('click', () => {
    if (!selectedFile) {
      inputGallery.click();
    }
  });

  // ===== FILE SELECTION =====
  inputCamera.addEventListener('change', handleFileSelect);
  inputGallery.addEventListener('change', handleFileSelect);

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Seules les images sont acceptées.', true);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image trop lourde (max 5MB).', true);
      return;
    }

    selectedFile = file;
    displayPreview(file);
    btnSubmit.disabled = false;
  }

  function displayPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewImg.style.display = 'block';
      captureArea.classList.add('has-image');
      capturePlaceholder.style.display = 'none';
      btnChange.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  // ===== COMPRESS IMAGE =====
  function compressImage(file) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;
        const MAX_WIDTH = 1200;

        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => resolve(blob),
          'image/jpeg',
          0.8
        );
      };

      img.src = URL.createObjectURL(file);
    });
  }

  // ===== SUBMIT =====
  btnSubmit.addEventListener('click', async () => {
    if (!selectedFile) return;

    btnSubmit.disabled = true;
    const textEl = btnSubmit.querySelector('.fan-submit-text');
    const loadingEl = btnSubmit.querySelector('.fan-submit-loading');
    textEl.style.display = 'none';
    loadingEl.style.display = 'flex';

    try {
      const compressed = await compressImage(selectedFile);

      const formData = new FormData();
      formData.append('image', compressed, 'photo.jpg');
      formData.append('pseudo', pseudoInput.value.trim());

      const response = await fetch('/api/photos', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('hbpc_fancam_submitted', 'true');
        showSuccess();
      } else {
        throw new Error(data.error || 'Erreur inconnue');
      }
    } catch (err) {
      console.error('Submit error:', err);
      showToast('Erreur lors de l\'envoi. Réessaie !', true);
      btnSubmit.disabled = false;
      textEl.style.display = 'flex';
      loadingEl.style.display = 'none';
    }
  });

  // ===== SUCCESS SCREEN =====
  function showSuccess() {
    formSection.style.display = 'none';
    successSection.style.display = 'block';
  }

  // ===== TOAST =====
  function showToast(message, isError = false) {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'toast' + (isError ? ' error' : '');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
})();
