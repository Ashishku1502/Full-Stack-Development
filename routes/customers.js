const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Customer = require('../models/Customer');
const { memory, makeId } = require('../services/memoryDb');
const mongoose = require('mongoose');

const router = express.Router();

function mongoReady() {
  return global.DB_MODE === 'mongo' && mongoose.connection && mongoose.connection.readyState === 1;
}

// Validation middleware
const validateCustomer = [
  body('name').notEmpty().trim().withMessage('Customer name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').optional().isString(),
  body('status').optional().isIn(['active', 'inactive', 'lead']).withMessage('Invalid status')
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// GET /api/customers
router.get('/', validatePagination, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  if (!mongoReady()) {
    const total = memory.customers.length;
    const data = memory.customers.slice(skip, skip + limit);
    return res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total/limit), hasNext: (skip+limit)<total, hasPrev: page>1 } });
  }

  try {
    const [customers, total] = await Promise.all([
      Customer.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Customer.countDocuments()
    ]);
    res.json({ data: customers, pagination: { page, limit, total, totalPages: Math.ceil(total/limit), hasNext: (skip+limit)<total, hasPrev: page>1 } });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// POST /api/customers
router.post('/', validateCustomer, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (!mongoReady()) {
    const now = new Date();
    const exists = memory.customers.find(c => c.email === req.body.email);
    if (exists) return res.status(400).json({ error: 'Customer with this email already exists' });
    const c = { ...req.body, _id: makeId(), createdAt: now, updatedAt: now };
    memory.customers.unshift(c);
    return res.status(201).json({ message: 'Customer created successfully', data: c });
  }

  try {
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json({ message: 'Customer created successfully', data: customer });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// GET /api/customers/:id
router.get('/:id', async (req, res) => {
  if (!mongoReady()) {
    const c = memory.customers.find(x => x._id === req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    return res.json({ data: c });
  }

  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    res.json({ data: c });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// PUT /api/customers/:id
router.put('/:id', validateCustomer, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (!mongoReady()) {
    const idx = memory.customers.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Customer not found' });
    memory.customers[idx] = { ...memory.customers[idx], ...req.body, updatedAt: new Date() };
    return res.json({ message: 'Customer updated successfully', data: memory.customers[idx] });
  }

  try {
    const c = await Customer.findById(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    Object.assign(c, req.body);
    await c.save();
    res.json({ message: 'Customer updated successfully', data: c });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res) => {
  if (!mongoReady()) {
    const idx = memory.customers.findIndex(x => x._id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Customer not found' });
    memory.customers.splice(idx, 1);
    return res.json({ message: 'Customer deleted successfully' });
  }

  try {
    const c = await Customer.findByIdAndDelete(req.params.id);
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Names list
router.get('/list/names', async (req, res) => {
  if (!mongoReady()) {
    const data = memory.customers.map(c => ({ id: c._id, name: c.name, email: c.email, company: c.company }));
    return res.json({ data });
  }

  try {
    const customers = await Customer.find({}, 'name email company').sort({ name: 1 }).lean();
    res.json({ data: customers.map(c => ({ id: c._id, name: c.name, email: c.email, company: c.company })) });
  } catch (error) {
    console.error('Error fetching customer names:', error);
    res.status(500).json({ error: 'Failed to fetch customer names' });
  }
});

module.exports = router;
