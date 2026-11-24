// Loads the extension's shared libraries into Node with an in-memory storage mock.
const path = require('node:path');
const LIB = path.join(__dirname, '..', 'extension', 'lib');

function load() {
  delete globalThis.CreatorSpot;
  ['core', 'platforms', 'defaults', 'schema', 'rotation', 'store', 'payload', 'shared', 'cloud'].forEach((f) => {
    const p = path.join(LIB, f + '.js');
    delete require.cache[require.resolve(p)];
    require(p);
  });
  const CS = globalThis.CreatorSpot;
  const mem = {};
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  CS.api = {
    storage: {
      local: {
        async get(keys) {
          if (keys == null) return clone(mem);
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          list.forEach((k) => k in mem && (out[k] = clone(mem[k])));
          return out;
        },
        async set(obj) {
          Object.entries(obj).forEach(([k, v]) => (mem[k] = clone(v)));
        },
        async remove(keys) {
          [].concat(keys).forEach((k) => delete mem[k]);
        },
      },
    },
  };
  return { CS, mem };
}

module.exports = { load };
