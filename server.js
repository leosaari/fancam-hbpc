const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { initDatabase } = require('./db/init');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = initDatabase();

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer config — store in memory for processing with sharp
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images sont acceptées.'));
    }
  }
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.json());

// Admin auth middleware
function adminAuth(req, res, next) {
  if (req.query.pass === 'hbpc2026') {
    return next();
  }
  return res.status(401).json({ error: 'Accès non autorisé' });
}

// ==================== API ROUTES ====================

// POST /api/photos — Upload a photo
app.post('/api/photos', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }

    const pseudo = (req.body.pseudo || '').trim().substring(0, 20);
    const filename = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const filepath = path.join(UPLOADS_DIR, filename);

    // Process image with sharp: resize, compress, add HBPC watermark overlay
    await sharp(req.file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(filepath);

    const stmt = db.prepare('INSERT INTO photos (pseudo, filename) VALUES (?, ?)');
    const result = stmt.run(pseudo, filename);

    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(result.lastInsertRowid);

    // Notify all clients about the new photo count
    const countRow = db.prepare('SELECT COUNT(*) as count FROM photos').get();
    io.emit('photo-count', countRow.count);

    // Notify admin of new photo
    io.emit('new-photo', photo);

    res.json({ success: true, photo });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'upload.' });
  }
});

// GET /api/photos — All photos (admin)
app.get('/api/photos', adminAuth, (req, res) => {
  const photos = db.prepare('SELECT * FROM photos ORDER BY created_at DESC').all();
  res.json(photos);
});

// GET /api/photos/approved — Approved photos (display)
app.get('/api/photos/approved', (req, res) => {
  const photos = db.prepare(
    'SELECT * FROM photos WHERE status = ? ORDER BY favorite DESC, created_at DESC'
  ).all('approved');
  res.json(photos);
});

// GET /api/photos/count — Photo count (public)
app.get('/api/photos/count', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) as count FROM photos').get();
  res.json({ count: row.count });
});

// PATCH /api/photos/:id — Approve/reject/favorite
app.patch('/api/photos/:id', adminAuth, (req, res) => {
  const { id } = req.params;
  const { status, favorite } = req.body;

  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  if (!photo) {
    return res.status(404).json({ error: 'Photo non trouvée.' });
  }

  if (status) {
    db.prepare('UPDATE photos SET status = ? WHERE id = ?').run(status, id);
  }

  if (favorite !== undefined) {
    db.prepare('UPDATE photos SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id);
  }

  const updated = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);

  // Notify display screens of updates
  if (status === 'approved') {
    io.emit('photo-approved', updated);
  }
  if (status === 'rejected') {
    io.emit('photo-rejected', updated);
  }
  io.emit('photo-updated', updated);

  res.json(updated);
});

// DELETE /api/photos/:id — Delete photo
app.delete('/api/photos/:id', adminAuth, (req, res) => {
  const { id } = req.params;

  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  if (!photo) {
    return res.status(404).json({ error: 'Photo non trouvée.' });
  }

  // Delete file
  const filepath = path.join(UPLOADS_DIR, photo.filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }

  db.prepare('DELETE FROM photos WHERE id = ?').run(id);

  const countRow = db.prepare('SELECT COUNT(*) as count FROM photos').get();
  io.emit('photo-count', countRow.count);
  io.emit('photo-deleted', { id: parseInt(id) });

  res.json({ success: true });
});

// ==================== HEALTH CHECK (keep alive on Render) ====================

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: Date.now() });
});

// Self-ping every 14 minutes to prevent Render free tier from sleeping
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    const url = `${process.env.RENDER_EXTERNAL_URL}/health`;
    fetch(url).then(() => console.log('Keep-alive ping sent')).catch(() => {});
  }, 14 * 60 * 1000); // 14 minutes
}

// ==================== PAGE ROUTES ====================

app.get('/admin', (req, res) => {
  if (req.query.pass !== 'hbpc2026') {
    return res.status(401).send(`
      <!DOCTYPE html>
      <html><head><title>HBPC - Accès refusé</title>
      <style>body{background:#0a0a0a;color:#FFD700;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;margin:0;}
      h1{text-transform:uppercase;letter-spacing:2px;}</style></head>
      <body><h1>🔒 Accès non autorisé</h1></body></html>
    `);
  }
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
  console.log('Client connecté:', socket.id);

  // Send current photo count on connection
  const countRow = db.prepare('SELECT COUNT(*) as count FROM photos').get();
  socket.emit('photo-count', countRow.count);

  socket.on('disconnect', () => {
    console.log('Client déconnecté:', socket.id);
  });
});

// ==================== START ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║          🦁 HBPC FAN-CAM SERVER 🦁              ║
  ╠══════════════════════════════════════════════════╣
  ║                                                  ║
  ║  Interface Fan :  http://localhost:${PORT}           ║
  ║  Admin :          http://localhost:${PORT}/admin?pass=hbpc2026  ║
  ║  Écran Géant :    http://localhost:${PORT}/display   ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
  `);
});
