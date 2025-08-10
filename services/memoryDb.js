const { randomUUID } = require('crypto');

const memory = {
  customers: [],
  queries: [],
  invoices: []
};

function makeId() {
  return randomUUID();
}

module.exports = {
  memory,
  makeId
};
