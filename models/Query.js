const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Note text is required'],
    trim: true,
    maxlength: [1000, 'Note cannot exceed 1000 characters']
  },
  createdBy: {
    type: String,
    default: 'System'
  }
}, {
  timestamps: true
});

const querySchema = new mongoose.Schema({
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
  description: {
    type: String,
    required: [true, 'Query description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  status: {
    type: String,
    enum: ['Open', 'InProgress', 'Closed'],
    default: 'Open'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  category: {
    type: String,
    enum: ['Technical', 'Billing', 'General', 'Feature Request', 'Bug Report'],
    default: 'General'
  },
  resolution: {
    type: String,
    trim: true,
    maxlength: [2000, 'Resolution cannot exceed 2000 characters']
  },
  assignedTo: {
    type: String,
    trim: true
  },
  estimatedResolutionTime: {
    type: Date
  },
  actualResolutionTime: {
    type: Date
  },
  notes: [noteSchema],
  attachments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    url: String
  }],
  tags: [{
    type: String,
    trim: true
  }],
  source: {
    type: String,
    enum: ['Email', 'Phone', 'Web Form', 'Chat', 'Social Media'],
    default: 'Web Form'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for time to resolution
querySchema.virtual('timeToResolution').get(function() {
  if (this.actualResolutionTime && this.createdAt) {
    return this.actualResolutionTime - this.createdAt;
  }
  return null;
});

// Virtual for is overdue
querySchema.virtual('isOverdue').get(function() {
  if (this.estimatedResolutionTime && this.status !== 'Closed') {
    return new Date() > this.estimatedResolutionTime;
  }
  return false;
});

// Indexes for better query performance
querySchema.index({ customerId: 1 });
querySchema.index({ status: 1 });
querySchema.index({ priority: 1 });
querySchema.index({ createdAt: -1 });
querySchema.index({ assignedTo: 1 });
querySchema.index({ 'notes.createdAt': -1 });

// Pre-save middleware to update resolution time when status changes to Closed
querySchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'Closed' && !this.actualResolutionTime) {
    this.actualResolutionTime = new Date();
  }
  next();
});

module.exports = mongoose.model('Query', querySchema);
