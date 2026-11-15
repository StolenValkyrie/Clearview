
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, 'orders.json');

let data = {};

try {
  if (fs.existsSync(FILE)) {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  }
} catch (error) {
  console.error('Failed to load orders.json:', error);
  data = {};
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  all: () => data,

  get: (id) => data[id],

  set(id, value) {
    data[id] = value;
    save();
  },

  update(id, patch) {
    data[id] = { ...data[id], ...patch };
    save();
  },

  remove(id) {
    delete data[id];
    save();
  },
};
