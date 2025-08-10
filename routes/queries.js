const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Query = require('../models/Query');
const Customer = require('../models/Customer');
const { memory, makeId } = require('../services/memoryDb');
const mongoose = require('mongoose');

const router = express.Router();

function mongoReady() {
  return global.DB_MODE === 'mongo' && mongoose.connection && mongoose.connection.readyState === 1;
}

// Validation middleware
const validateQuery = [
  body('customerId').notEmpty().withMessage('Valid customer ID is required'),
  body('customerName').notEmpty().trim().withMessage('Customer name is required'),
  body('description').notEmpty().trim().withMessage('Description is required'),
  body('status').optional().isIn(['Open', 'InProgress', 'Closed']).withMessage('Invalid status'),
  body('priority').optional().isIn(['Low', 'Medium', 'High', 'Critical']).withMessage('Invalid priority'),
  body('category').optional().isIn(['Technical', 'Billing', 'General', 'Feature Request', 'Bug Report']).withMessage('Invalid category')
];

const validateNote = [
  body('text').notEmpty().trim().withMessage('Note text is required')
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// GET /api/queries
router.get('/', validatePagination, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const status = req.query.status;
  const skip = (page - 1) * limit;

  if (!mongoReady()) {
    let data = memory.queries;
    if (status) data = data.filter(q => q.status === status);
    const total = data.length;
    const paged = data.slice(skip, skip + limit);
    return res.json({ data: paged, pagination: { page, limit, total, totalPages: Math.ceil(total/limit), hasNext: (skip+limit)<total, hasPrev: page>1 } });
  }

  try {
    const filter = {};
    if (status) filter.status = status;
    const [queries, total] = await Promise.all([
      Query.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Query.countDocuments(filter)
    ]);
    res.json({ data: queries, pagination: { page, limit, total, totalPages: Math.ceil(total/limit), hasNext: (skip+limit)<total, hasPrev: page>1 } });
  } catch (error) {
    console.error('Error fetching queries:', error);
    res.status(500).json({ error: 'Failed to fetch queries' });
  }
});

// POST /api/queries
router.post('/', validateQuery, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (!mongoReady()) {
    const now = new Date();
    const q = { ...req.body, _id: makeId(), notes: [], createdAt: now, updatedAt: now };
    memory.queries.unshift(q);
    return res.status(201).json({ message: 'Query created successfully', data: q });
  }

  try {
    const customer = await Customer.findById(req.body.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const queryDoc = new Query({ ...req.body, customerName: customer.name });
    await queryDoc.save();
    await queryDoc.populate('customerId', 'name email company');
    res.status(201).json({ message: 'Query created successfully', data: queryDoc });
  } catch (error) {
    console.error('Error creating query:', error);
    res.status(500).json({ error: 'Failed to create query' });
  }
});

// GET /api/queries/:id
router.get('/:id', async (req, res) => {
  if (!mongoReady()) {
    const q = memory.queries.find(x => x._id === req.params.id);
    if (!q) return res.status(404).json({ error: 'Query not found' });
    return res.json({ data: q });
  }

  try {
    const q = await Query.findById(req.params.id).populate('customerId', 'name email company phone address');
    if (!q) return res.status(404).json({ error: 'Query not found' });
    res.json({ data: q });
  } catch (error) {
    console.error('Error fetching query:', error);
    res.status(500).json({ error: 'Failed to fetch query' });
  }
});

// PUT /api/queries/:id
router.put('/:id', validateQuery, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (!mongoReady()) {
    const idx = memory.queries.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Query not found' });
    memory.queries[idx] = { ...memory.queries[idx], ...req.body, updatedAt: new Date() };
    return res.json({ message: 'Query updated successfully', data: memory.queries[idx] });
  }

  try {
    const q = await Query.findById(req.params.id);
    if (!q) return res.status(404).json({ error: 'Query not found' });
    Object.assign(q, req.body);
    await q.save();
    await q.populate('customerId', 'name email company');
    res.json({ message: 'Query updated successfully', data: q });
  } catch (error) {
    console.error('Error updating query:', error);
    res.status(500).json({ error: 'Failed to update query' });
  }
});

// DELETE /api/queries/:id
router.delete('/:id', async (req, res) => {
  if (!mongoReady()) {
    const idx = memory.queries.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Query not found' });
    memory.queries.splice(idx, 1);
    return res.json({ message: 'Query deleted successfully' });
  }

  try {
    const q = await Query.findByIdAndDelete(req.params.id);
    if (!q) return res.status(404).json({ error: 'Query not found' });
    res.json({ message: 'Query deleted successfully' });
  } catch (error) {
    console.error('Error deleting query:', error);
    res.status(500).json({ error: 'Failed to delete query' });
  }
});

// Notes endpoints
router.post('/:id/notes', validateNote, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (!mongoReady()) {
    const q = memory.queries.find(x => x._id === req.params.id);
    if (!q) return res.status(404).json({ error: 'Query not found' });
    const note = { _id: makeId(), text: req.body.text, createdBy: req.body.createdBy || 'System', createdAt: new Date(), updatedAt: new Date() };
    q.notes.push(note);
    q.updatedAt = new Date();
    return res.status(201).json({ message: 'Note added successfully', data: note });
  }

  try {
    const q = await Query.findById(req.params.id);
    if (!q) return res.status(404).json({ error: 'Query not found' });
    q.notes.push({ text: req.body.text, createdBy: req.body.createdBy || 'System' });
    await q.save();
    const addedNote = q.notes[q.notes.length - 1];
    res.status(201).json({ message: 'Note added successfully', data: addedNote });
  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

router.delete('/:id/notes/:noteId', async (req, res) => {
  if (!mongoReady()) {
    const q = memory.queries.find(x => x._id === req.params.id);
    if (!q) return res.status(404).json({ error: 'Query not found' });
    const idx = q.notes.findIndex(n => n._id === req.params.noteId);
    if (idx === -1) return res.status(404).json({ error: 'Note not found' });
    q.notes.splice(idx, 1);
    q.updatedAt = new Date();
    return res.json({ message: 'Note deleted successfully' });
  }

  try {
    const q = await Query.findById(req.params.id);
    if (!q) return res.status(404).json({ error: 'Query not found' });
    const idx = q.notes.findIndex(n => n._id.toString() === req.params.noteId);
    if (idx === -1) return res.status(404).json({ error: 'Note not found' });
    q.notes.splice(idx, 1);
    await q.save();
    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

router.put('/:id/notes/:noteId', validateNote, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (!mongoReady()) {
    const q = memory.queries.find(x => x._id === req.params.id);
    if (!q) return res.status(404).json({ error: 'Query not found' });
    const note = q.notes.find(n => n._id === req.params.noteId);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    note.text = req.body.text; note.updatedAt = new Date(); q.updatedAt = new Date();
    return res.json({ message: 'Note updated successfully', data: note });
  }

  try {
    const q = await Query.findById(req.params.id);
    if (!q) return res.status(404).json({ error: 'Query not found' });
    const note = q.notes.id(req.params.noteId);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    note.text = req.body.text; note.updatedAt = new Date();
    await q.save();
    res.json({ message: 'Note updated successfully', data: note });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

module.exports = router;
