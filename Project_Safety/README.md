# 🛡️ ZENSAFE – AI-Powered Smart Safety Navigation

A full-stack, deployment-ready safety navigation web app with real-time fear scoring, SOS alerts, guardian tracking, and a community safety map.

---

## 🚀 Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Start server
npm start

# App runs at:
# http://localhost:3000
```

For hot-reloading during development:
```bash
npm run dev   # uses nodemon
```

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express 4 |
| Database | lowdb (JSON file, zero config) |
| Frontend | HTML5 + Vanilla JS + CSS3 |
| Maps | Leaflet.js + OpenStreetMap |
| Heatmap | Leaflet.heat |
| Fonts | Inter + Space Grotesk |
| Icons | FontAwesome 6 |

---

## 🗂️ Project Structure

```
Project_Safety/           ← Root
├── server.js             ← Express server
├── db.js                 ← Database layer (lowdb)
├── package.json
├── .env                  ← Environment config
├── .env.example          ← Config template
├── Procfile              ← Heroku/Railway deploy
├── routes/
│   ├── reports.js        ← Incident reports API
│   ├── contacts.js       ← Guardian contacts API
│   ├── alerts.js         ← Alert log API
│   ├── sos.js            ← SOS events API
│   └── location.js       ← Location tracking API
├── data/
│   └── db.json           ← Auto-generated database file
└── Project_Safety/       ← Frontend
    ├── index.html
    ├── style.css
    ├── script.js
    ├── guardian.html
    ├── sos.html
    ├── report.html
    └── contacts.html
```

---

## 🌐 REST API Reference

### Health
```
GET /api/health
```

### Incident Reports
```
GET    /api/reports          → Get all reports
POST   /api/reports          → Create report { lat, lng, type, description }
DELETE /api/reports/:id      → Delete report
DELETE /api/reports/all      → Clear all reports
```

### Guardian Contacts
```
GET    /api/contacts         → Get all contacts
POST   /api/contacts         → Add contact { name, phone }
DELETE /api/contacts/:id     → Remove contact
```

### Alert Log
```
GET    /api/alerts           → Get last 50 alerts
POST   /api/alerts           → Log alert { type, msg, time }
DELETE /api/alerts           → Clear all alerts
```

### SOS Events
```
GET  /api/sos               → Get SOS history
POST /api/sos               → Record SOS { lat, lng, contacts_notified }
```

### Location
```
GET  /api/location          → Get last known location
PUT  /api/location          → Update { lat, lng, accuracy }
POST /api/location/ping     → Guardian ping { contact_name, lat, lng }
GET  /api/location/pings    → Recent pings
```

---

## ✨ Features

1. **Map & Dual Route** — Safest (teal) vs Fastest (red dashed) with Fear Scores
2. **Safety Heatmap** — Color-coded risk overlay with Day/Night toggle
3. **Fear Score System** — Dynamic 0-100 score with crime density, time, isolation factors
4. **Real-Time Risk Alerts** — Auto-dismiss zone entry notifications
5. **One-Tap SOS** — 3-second countdown → GPS alert → guardian SMS preview
6. **Voice-Activated SOS** — Web Speech API: "help me", "SOS", "emergency"
7. **Guardian Tracking** — 30s pings, live map, shareable link
8. **Offline Detection** — Persistent banner + location cache
9. **Decoy Calculator** — Hold logo 3s → fake calculator (exit: type `1234=`)
10. **Incident Reporting** — Tap map → categorized pins → community heatmap
11. **Light/Dark Mode** — Toggle via ☀️/🌙 button, persisted in localStorage
12. **Backend + DB** — REST API persists all data to JSON file database

---

## 🚀 Deployment

### Railway.app (Recommended, Free)
1. Push repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Railway auto-detects `npm start` — no config needed!
4. Set env vars in Railway dashboard if needed

### Render.com (Free)
1. Go to [render.com](https://render.com) → New Web Service
2. Connect GitHub repo
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Done!

### Heroku
```bash
heroku create zensafe-app
git push heroku main
heroku open
```

### Environment Variables
```env
PORT=3000
NODE_ENV=production
DB_PATH=/data          # Optional: custom data directory
```

---

## 🔒 Security
- Helmet.js for HTTP security headers
- CSP configured for Leaflet CDN sources
- Request body size limited to 10KB
- Input validation on all endpoints
- GZIP compression enabled

---

## 🎨 Theme
Toggle light/dark mode with the ☀️/🌙 button (top-right corner on all pages).
Preference is saved to `localStorage`.
