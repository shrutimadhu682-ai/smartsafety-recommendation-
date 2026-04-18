const express = require('express');
const router  = express.Router();
const { Reports } = require('../db');

const VALID_TYPES = ['Harassment', 'Theft', 'Poor Lighting', 'Suspicious Activity', 'Other'];

router.get('/', (req, res) => {
    try {
        const limit   = Math.min(parseInt(req.query.limit) || 100, 500);
        const reports = Reports.getAll(limit);
        res.json({ success: true, count: reports.length, data: reports });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/', (req, res) => {
    try {
        const { lat, lng, type, description, time_of_incident, fear_score } = req.body;
        if (lat == null || lng == null) {
            return res.status(400).json({ success: false, error: 'lat and lng are required' });
        }
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ success: false, error: 'Invalid coordinates' });
        }
        const safeType = VALID_TYPES.includes(type) ? type : 'Other';
        const record   = Reports.insert({ lat, lng, type: safeType, description, time_of_incident, fear_score });
        res.status(201).json({ success: true, data: record });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/all', (req, res) => {
    try {
        Reports.clear();
        res.json({ success: true, message: 'All reports cleared' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const deleted = Reports.delete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Report not found' });
        res.json({ success: true, message: 'Report deleted' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
