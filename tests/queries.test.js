const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const Query = require('../models/Query');
const Customer = require('../models/Customer');

describe('Queries API', () => {
  let testCustomer;
  let testQuery;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/idurar-test');
    
    // Create test customer
    testCustomer = new Customer({
      name: 'Test Customer',
      email: 'test@example.com',
      phone: '1234567890',
      company: 'Test Company'
    });
    await testCustomer.save();
  });

  afterAll(async () => {
    // Clean up test data
    await Customer.deleteMany({});
    await Query.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear queries before each test
    await Query.deleteMany({});
  });

  describe('GET /api/queries', () => {
    it('should return paginated queries', async () => {
      // Create test queries
      const queries = [
        {
          customerId: testCustomer._id,
          customerName: testCustomer.name,
          description: 'Test query 1',
          status: 'Open',
          priority: 'Medium'
        },
        {
          customerId: testCustomer._id,
          customerName: testCustomer.name,
          description: 'Test query 2',
          status: 'InProgress',
          priority: 'High'
        }
      ];

      await Query.insertMany(queries);

      const response = await request(app)
        .get('/api/queries')
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBe(2);
    });

    it('should filter queries by status', async () => {
      const queries = [
        {
          customerId: testCustomer._id,
          customerName: testCustomer.name,
          description: 'Open query',
          status: 'Open'
        },
        {
          customerId: testCustomer._id,
          customerName: testCustomer.name,
          description: 'Closed query',
          status: 'Closed'
        }
      ];

      await Query.insertMany(queries);

      const response = await request(app)
        .get('/api/queries?status=Open')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('Open');
    });
  });

  describe('POST /api/queries', () => {
    it('should create a new query', async () => {
      const queryData = {
        customerId: testCustomer._id.toString(),
        customerName: testCustomer.name,
        description: 'New test query',
        status: 'Open',
        priority: 'Medium',
        category: 'General'
      };

      const response = await request(app)
        .post('/api/queries')
        .send(queryData)
        .expect(201);

      expect(response.body.data.description).toBe(queryData.description);
      expect(response.body.data.customerId).toBe(testCustomer._id.toString());
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/queries')
        .send({})
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('GET /api/queries/:id', () => {
    it('should return a single query', async () => {
      const query = new Query({
        customerId: testCustomer._id,
        customerName: testCustomer.name,
        description: 'Single query test',
        status: 'Open'
      });
      await query.save();

      const response = await request(app)
        .get(`/api/queries/${query._id}`)
        .expect(200);

      expect(response.body.data._id).toBe(query._id.toString());
      expect(response.body.data.description).toBe('Single query test');
    });

    it('should return 404 for non-existent query', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      await request(app)
        .get(`/api/queries/${fakeId}`)
        .expect(404);
    });
  });

  describe('PUT /api/queries/:id', () => {
    it('should update a query', async () => {
      const query = new Query({
        customerId: testCustomer._id,
        customerName: testCustomer.name,
        description: 'Original description',
        status: 'Open'
      });
      await query.save();

      const updateData = {
        description: 'Updated description',
        status: 'InProgress'
      };

      const response = await request(app)
        .put(`/api/queries/${query._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.data.description).toBe(updateData.description);
      expect(response.body.data.status).toBe(updateData.status);
    });
  });

  describe('POST /api/queries/:id/notes', () => {
    it('should add a note to a query', async () => {
      const query = new Query({
        customerId: testCustomer._id,
        customerName: testCustomer.name,
        description: 'Query with notes',
        status: 'Open'
      });
      await query.save();

      const noteData = {
        text: 'This is a test note'
      };

      const response = await request(app)
        .post(`/api/queries/${query._id}/notes`)
        .send(noteData)
        .expect(201);

      expect(response.body.data.text).toBe(noteData.text);
      
      // Verify note was added to query
      const updatedQuery = await Query.findById(query._id);
      expect(updatedQuery.notes).toHaveLength(1);
      expect(updatedQuery.notes[0].text).toBe(noteData.text);
    });
  });

  describe('DELETE /api/queries/:id/notes/:noteId', () => {
    it('should delete a note from a query', async () => {
      const query = new Query({
        customerId: testCustomer._id,
        customerName: testCustomer.name,
        description: 'Query with notes',
        status: 'Open',
        notes: [{ text: 'Note to delete' }]
      });
      await query.save();

      const noteId = query.notes[0]._id;

      await request(app)
        .delete(`/api/queries/${query._id}/notes/${noteId}`)
        .expect(200);

      // Verify note was deleted
      const updatedQuery = await Query.findById(query._id);
      expect(updatedQuery.notes).toHaveLength(0);
    });
  });

  describe('DELETE /api/queries/:id', () => {
    it('should delete a query', async () => {
      const query = new Query({
        customerId: testCustomer._id,
        customerName: testCustomer.name,
        description: 'Query to delete',
        status: 'Open'
      });
      await query.save();

      await request(app)
        .delete(`/api/queries/${query._id}`)
        .expect(200);

      // Verify query was deleted
      const deletedQuery = await Query.findById(query._id);
      expect(deletedQuery).toBeNull();
    });
  });
});
