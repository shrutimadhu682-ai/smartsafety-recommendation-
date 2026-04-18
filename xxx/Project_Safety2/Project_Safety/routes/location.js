const express = require('express');
const router  = express.Router();
const { Location, GuardianPings } = require('../db');

router.get('/', (req, res) => {
    try {
        res.json({ success: true, data: Location.get() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/', (req, res) => {
    try {
        const { lat, lng, accuracy } = req.body;
        if (lat == null || lng == null) {
            return res.status(400).json({ success: false, error: 'lat and lng are required' });
        }
        const updated = Location.update(lat, lng, accuracy);
        res.json({ success: true, data: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/ping', (req, res) => {
    try {
        const { contact_name, contact_phone, lat, lng } = req.body;
        if (lat == null || lng == null) {
            return res.status(400).json({ success: false, error: 'lat and lng are required' });
        }
        const record = GuardianPings.insert({ contact_name, contact_phone, lat, lng });
        res.status(201).json({ success: true, data: record });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/pings', (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        res.json({ success: true, data: GuardianPings.getRecent(limit) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
