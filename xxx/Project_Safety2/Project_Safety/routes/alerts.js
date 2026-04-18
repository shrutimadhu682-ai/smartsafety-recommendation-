const express = require('express');
const router  = express.Router();
const { Alerts } = require('../db');

router.get('/', (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
        res.json({ success: true, data: Alerts.getAll(limit) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/', (req, res) => {
    try {
        const { type, msg, coords, time } = req.body;
        if (!type || !msg) {
            return res.status(400).json({ success: false, error: 'type and msg are required' });
        }
        const record = Alerts.insert({ type, msg, coords, time });
        res.status(201).json({ success: true, data: record });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/', (req, res) => {
    try {
        Alerts.clear();
        res.json({ success: true, message: 'Alert log cleared' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
