const express = require('express');
const router  = express.Router();
const { Contacts } = require('../db');

router.get('/', (req, res) => {
    try {
        res.json({ success: true, data: Contacts.getAll() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/', (req, res) => {
    try {
        const { name, phone } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ success: false, error: 'name and phone are required' });
        }
        if (Contacts.count() >= 5) {
            return res.status(400).json({ success: false, error: 'Maximum 5 guardian contacts allowed' });
        }
        const record = Contacts.insert({ name, phone });
        res.status(201).json({ success: true, data: record });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const deleted = Contacts.delete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Contact not found' });
        res.json({ success: true, message: 'Contact removed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
