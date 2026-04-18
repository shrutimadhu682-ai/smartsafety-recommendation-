// ============================================================
// ZENSAFE – JSON File Database (lowdb v1)
// Pure JavaScript, no native compilation needed
// Deployment-ready: data persisted to ./data/db.json
// ============================================================

const low  = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs   = require('fs');
const { v4: uuidv4 } = require('uuid');

// ─── DATA DIRECTORY ──────────────────────────────────────────
const DB_DIR  = process.env.DB_PATH || path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

// ─── INIT DATABASE ──────────────────────────────────────────
const adapter = new FileSync(DB_FILE);
const db = low(adapter);

// ─── DEFAULT SCHEMA ──────────────────────────────────────────
db.defaults({
    reports:        [],
    contacts:       [],
    alerts:         [],
    sos_events:     [],
    guardian_pings: [],
    location:       { lat: 30.3165, lng: 78.0322, accuracy: null, updated_at: null }
}).write();

// ─── SEED INITIAL REPORTS ────────────────────────────────────
function seedIfEmpty() {
    if (db.get('reports').value().length > 0) return;

    const DEHRADUN = [30.3165, 78.0322];
    const types = ['Harassment', 'Theft', 'Poor Lighting', 'Suspicious Activity', 'Other'];

    for (let i = 0; i < 12; i++) {
        const lat  = DEHRADUN[0] + (Math.random() - 0.5) * 0.1;
        const lng  = DEHRADUN[1] + (Math.random() - 0.5) * 0.1;
        const type = types[Math.floor(Math.random() * types.length)];
        db.get('reports').push({
            id:               uuidv4(),
            lat:              parseFloat(lat.toFixed(6)),
            lng:              parseFloat(lng.toFixed(6)),
            type,
            description:      `Crowdsourced report – ${type} observed in this area`,
            time_of_incident: new Date(Date.now() - Math.random() * 86400000).toLocaleTimeString(),
            fear_score:       Math.floor(Math.random() * 80) + 10,
            created_at:       new Date(Date.now() - Math.random() * 86400000).toISOString()
        }).write();
    }
    console.log('[DB] Seeded 12 initial reports');
}

seedIfEmpty();

// ─── DB HELPERS ──────────────────────────────────────────────
const Reports = {
    getAll: (limit = 100) => {
        return db.get('reports')
            .orderBy(['created_at'], ['desc'])
            .take(limit)
            .value();
    },
    insert: (data) => {
        const record = {
            id:               uuidv4(),
            lat:              parseFloat(data.lat),
            lng:              parseFloat(data.lng),
            type:             data.type || 'Other',
            description:      data.description || '',
            time_of_incident: data.time_of_incident || new Date().toLocaleTimeString(),
            fear_score:       parseInt(data.fear_score) || 0,
            created_at:       new Date().toISOString()
        };
        db.get('reports').push(record).write();
        return record;
    },
    delete: (id) => {
        const before = db.get('reports').value().length;
        db.get('reports').remove({ id }).write();
        const after = db.get('reports').value().length;
        return before !== after;
    },
    clear: () => { db.set('reports', []).write(); }
};

const Contacts = {
    getAll: () => db.get('contacts').filter({ is_active: true }).value(),
    count:  () => db.get('contacts').filter({ is_active: true }).value().length,
    insert: (data) => {
        const record = {
            id:         uuidv4(),
            name:       data.name.trim(),
            phone:      data.phone.trim(),
            is_active:  true,
            created_at: new Date().toISOString()
        };
        db.get('contacts').push(record).write();
        return record;
    },
    delete: (id) => {
        const contact = db.get('contacts').find({ id }).value();
        if (!contact) return false;
        db.get('contacts').find({ id }).assign({ is_active: false }).write();
        return true;
    }
};

const Alerts = {
    getAll: (limit = 50) => {
        return db.get('alerts')
            .orderBy(['created_at'], ['desc'])
            .take(limit)
            .value();
    },
    insert: (data) => {
        const record = {
            id:         uuidv4(),
            type:       data.type,
            msg:        data.msg,
            coords:     data.coords ? JSON.stringify(data.coords) : null,
            time:       data.time || new Date().toLocaleTimeString(),
            created_at: new Date().toISOString()
        };
        db.get('alerts').push(record).write();
        // Keep only last 200 alerts
        const all = db.get('alerts').value();
        if (all.length > 200) {
            db.set('alerts', all.slice(-200)).write();
        }
        return record;
    },
    clear: () => { db.set('alerts', []).write(); }
};

const SOS = {
    getAll: (limit = 20) => {
        return db.get('sos_events')
            .orderBy(['created_at'], ['desc'])
            .take(limit)
            .value();
    },
    insert: (data) => {
        const record = {
            id:                uuidv4(),
            lat:               data.lat ? parseFloat(data.lat) : null,
            lng:               data.lng ? parseFloat(data.lng) : null,
            timestamp:         data.timestamp || new Date().toISOString(),
            contacts_notified: Array.isArray(data.contacts_notified)
                ? JSON.stringify(data.contacts_notified)
                : (data.contacts_notified || '[]'),
            message:           data.message || 'Emergency SOS triggered',
            created_at:        new Date().toISOString()
        };
        db.get('sos_events').push(record).write();
        // Also log to alerts
        Alerts.insert({ type: 'SOS', msg: `🚨 ${record.message}`, coords: [data.lat, data.lng] });
        return record;
    }
};

const Location = {
    get: () => db.get('location').value(),
    update: (lat, lng, accuracy) => {
        db.set('location', {
            lat:        parseFloat(lat),
            lng:        parseFloat(lng),
            accuracy:   accuracy ? parseFloat(accuracy) : null,
            updated_at: new Date().toISOString()
        }).write();
        return db.get('location').value();
    }
};

const GuardianPings = {
    getRecent: (limit = 20) => {
        return db.get('guardian_pings')
            .orderBy(['sent_at'], ['desc'])
            .take(limit)
            .value();
    },
    insert: (data) => {
        const record = {
            id:            uuidv4(),
            contact_name:  data.contact_name || 'Guardian',
            contact_phone: data.contact_phone || '',
            lat:           parseFloat(data.lat),
            lng:           parseFloat(data.lng),
            sent_at:       new Date().toISOString()
        };
        db.get('guardian_pings').push(record).write();
        // Keep only 100
        const all = db.get('guardian_pings').value();
        if (all.length > 100) db.set('guardian_pings', all.slice(-100)).write();
        return record;
    }
};

module.exports = { db, Reports, Contacts, Alerts, SOS, Location, GuardianPings };
