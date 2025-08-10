const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  item: {
    type: String,
    required: [true, 'Item name is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0, 'Quantity cannot be negative']
  },
  unitPrice: {
    type: Number,
    required: [true, 'Unit price is required'],
    min: [0, 'Unit price cannot be negative']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  timestamps: true
});

// Virtual for line item total
lineItemSchema.virtual('total').get(function() {
  return this.quantity * this.unitPrice;
});

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: [true, 'Invoice number is required'],
    unique: true,
    trim: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer ID is required']
  },
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  customerEmail: {
    type: String,
    required: [true, 'Customer email is required'],
    lowercase: true
  },
  issueDate: {
    type: Date,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'],
    default: 'Draft'
  },
  lineItems: [lineItemSchema],
  subtotal: {
    type: Number,
    default: 0
  },
  taxRate: {
    type: Number,
    default: 0,
    min: [0, 'Tax rate cannot be negative'],
    max: [100, 'Tax rate cannot exceed 100%']
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative']
  },
  total: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total cannot be negative']
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  terms: {
    type: String,
    trim: true,
    maxlength: [2000, 'Terms cannot exceed 2000 characters']
  },
  paymentMethod: {
    type: String,
    enum: ['Credit Card', 'Bank Transfer', 'Check', 'Cash', 'PayPal'],
    default: 'Bank Transfer'
  },
  paidDate: {
    type: Date
  },
  paymentReference: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for days overdue
invoiceSchema.virtual('daysOverdue').get(function() {
  if (this.status === 'Overdue' && this.dueDate) {
    const now = new Date();
    const due = new Date(this.dueDate);
    return Math.floor((now - due) / (1000 * 60 * 60 * 24));
  }
  return 0;
});

// Virtual for all notes from line items
invoiceSchema.virtual('allLineItemNotes').get(function() {
  return this.lineItems
    .filter(item => item.notes && item.notes.trim())
    .map(item => item.notes)
    .join('\n');
});

// Pre-save middleware to calculate totals
invoiceSchema.pre('save', function(next) {
  this.subtotal = this.lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  this.taxAmount = (this.subtotal * this.taxRate) / 100;
  this.total = this.subtotal + this.taxAmount - this.discount;
  if (this.dueDate && new Date() > this.dueDate && this.status === 'Sent') {
    this.status = 'Overdue';
  }
  next();
});

// Indexes for better query performance (avoid duplicate invoiceNumber index; unique already creates one)
invoiceSchema.index({ customerId: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ issueDate: -1 });
invoiceSchema.index({ dueDate: 1 });
invoiceSchema.index({ 'lineItems.notes': 'text' });

module.exports = mongoose.model('Invoice', invoiceSchema);
