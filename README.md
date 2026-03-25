# 🦁 HBPC Fan-Cam — Mi-Temps Interactive

Fan-Cam interactive pour le **HBPC — Handball Plan de Cuques** (D1 féminine).

Les spectateurs scannent un QR code, se prennent en photo, et les meilleures apparaissent sur l'écran géant du Palais des Sports pendant la mi-temps.

## Lancement

```bash
git clone https://github.com/leosaari/fancam-hbpc.git
cd fancam-hbpc
npm install
npm start
```

## URLs

| Interface | URL |
|-----------|-----|
| Fan (mobile) | `http://localhost:3000` |
| Admin | `http://localhost:3000/admin?pass=hbpc2026` |
| Écran Géant | `http://localhost:3000/display` |

## Stack

- Node.js + Express
- Socket.io (temps réel)
- SQLite (better-sqlite3)
- HTML/CSS/JS vanilla
