const express = require('express');
const router  = express.Router();
const { SOS } = require('../db');

router.get('/', (req, res) => {
    try {
        res.json({ success: true, data: SOS.getAll() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/', (req, res) => {
    try {
        const { lat, lng, timestamp, contacts_notified, message } = req.body;
        const record = SOS.insert({ lat, lng, timestamp, contacts_notified, message });
        res.status(201).json({ success: true, data: record });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
