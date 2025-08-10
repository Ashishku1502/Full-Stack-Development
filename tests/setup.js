// Test setup file
require('dotenv').config();

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for tests
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  // Helper to create test data
  createTestCustomer: async (Customer) => {
    return new Customer({
      name: 'Test Customer',
      email: 'test@example.com',
      phone: '1234567890',
      company: 'Test Company'
    });
  },

  // Helper to create test query
  createTestQuery: async (Query, customerId, customerName) => {
    return new Query({
      customerId,
      customerName,
      description: 'Test query description',
      status: 'Open',
      priority: 'Medium',
      category: 'General'
    });
  }
};
