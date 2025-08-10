const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const { generateSummary } = require('../services/geminiService');
const { memory, makeId } = require('../services/memoryDb');
const mongoose = require('mongoose');

const router = express.Router();

function mongoReady() {
  return global.DB_MODE === 'mongo' && mongoose.connection && mongoose.connection.readyState === 1;
}

// Validation middleware
const validateInvoice = [
  body('invoiceNumber').notEmpty().trim().withMessage('Invoice number is required'),
  body('customerId').notEmpty().withMessage('Valid customer ID is required'),
  body('customerName').notEmpty().trim().withMessage('Customer name is required'),
  body('customerEmail').isEmail().withMessage('Valid customer email is required'),
  body('dueDate').notEmpty().withMessage('Valid due date is required'),
  body('lineItems').isArray({ min: 1 }).withMessage('At least one line item is required'),
  body('lineItems.*.item').notEmpty().trim().withMessage('Item name is required'),
  body('lineItems.*.quantity').isFloat({ min: 0 }).withMessage('Quantity must be positive'),
  body('lineItems.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price must be positive')
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// GET /api/invoices
router.get('/', validatePagination, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  if (!mongoReady()) {
    const total = memory.invoices.length;
    const data = memory.invoices.slice(skip, skip + limit);
    return res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total/limit), hasNext: (skip+limit)<total, hasPrev: page>1 } });
  }

  try {
    const [invoices, total] = await Promise.all([
      Invoice.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Invoice.countDocuments()
    ]);
    res.json({ data: invoices, pagination: { page, limit, total, totalPages: Math.ceil(total/limit), hasNext: (skip+limit)<total, hasPrev: page>1 } });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// POST /api/invoices
router.post('/', validateInvoice, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (!mongoReady()) {
    const now = new Date();
    const inv = { ...req.body, _id: makeId(), createdAt: now, updatedAt: now };
    memory.invoices.unshift(inv);
    return res.status(201).json({ message: 'Invoice created successfully', data: inv });
  }

  try {
    const customer = await Customer.findById(req.body.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const invoice = new Invoice({ ...req.body, customerName: customer.name, customerEmail: customer.email });
    await invoice.save();
    await invoice.populate('customerId', 'name email company');
    res.status(201).json({ message: 'Invoice created successfully', data: invoice });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// GET /api/invoices/:id
router.get('/:id', async (req, res) => {
  if (!mongoReady()) {
    const inv = memory.invoices.find(x => x._id === req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    return res.json({ data: inv });
  }

  try {
    const inv = await Invoice.findById(req.params.id).populate('customerId', 'name email company phone address');
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ data: inv });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// PUT /api/invoices/:id
router.put('/:id', validateInvoice, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (!mongoReady()) {
    const idx = memory.invoices.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Invoice not found' });
    memory.invoices[idx] = { ...memory.invoices[idx], ...req.body, updatedAt: new Date() };
    return res.json({ message: 'Invoice updated successfully', data: memory.invoices[idx] });
  }

  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    Object.assign(inv, req.body);
    await inv.save();
    await inv.populate('customerId', 'name email company');
    res.json({ message: 'Invoice updated successfully', data: inv });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// DELETE /api/invoices/:id
router.delete('/:id', async (req, res) => {
  if (!mongoReady()) {
    const idx = memory.invoices.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Invoice not found' });
    memory.invoices.splice(idx, 1);
    return res.json({ message: 'Invoice deleted successfully' });
  }

  try {
    const inv = await Invoice.findByIdAndDelete(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// AI Summary
router.post('/:id/notes/summary', async (req, res) => {
  if (!mongoReady()) {
    const inv = memory.invoices.find(x => x._id === req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    const notes = inv.lineItems.filter(i => i.notes && i.notes.trim()).map(i => i.notes);
    if (!notes.length) return res.json({ message: 'No notes to summarize', data: { summary: 'No notes available for this invoice.', noteCount: 0 } });
    try {
      const summary = await generateSummary(notes);
      return res.json({ message: 'Summary generated successfully', data: { summary, noteCount: notes.length, originalNotes: notes } });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to generate summary', message: e.message });
    }
  }

  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    const notes = inv.lineItems.filter(i => i.notes && i.notes.trim()).map(i => i.notes);
    if (!notes.length) return res.json({ message: 'No notes to summarize', data: { summary: 'No notes available for this invoice.', noteCount: 0 } });
    const summary = await generateSummary(notes);
    res.json({ message: 'Summary generated successfully', data: { summary, noteCount: notes.length, originalNotes: notes } });
  } catch (error) {
    console.error('Error generating summary:', error);
    res.status(500).json({ error: 'Failed to generate summary', message: error.message });
  }
});

module.exports = router;
