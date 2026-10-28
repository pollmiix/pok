const { test } = require('node:test');
const assert = require('node:assert/strict');
const payments = require('../api/_lib/payments');
const { applyConfirmedInventory, INVENTORY_ADJUSTMENT_KEY, INVENTORY_BACKUP_KEY } = require('../api/_lib/catalog');

test('confirmed stock adjustment runs once, preserves product details and backs up previous inventory', async () => {
  const original = { redis: payments.redis, lock: payments.lock, unlock: payments.unlock };
  const products = [{ id: 'imported-1', name: 'Nome cadastrado', price: 50, stock: 3 },
    { id: 'custom-item', name: 'Produto do painel', price: 31.99, stock: 0 }];
  const raw = JSON.stringify(products);
  const db = new Map([['walkcards:products', raw], ['walkcards:orders', '[{"id":"existing-order"}]']]);
  let writes = 0, locked = false, failWrite = false;
  payments.lock = async () => {
    if (locked) return null;
    locked = true;
    return 'lease';
  };
  payments.unlock = async token => { assert.equal(token, 'lease'); locked = false; };
  payments.redis = async ([command, ...args]) => {
    if (command === 'GET') return db.get(args[0]) ?? null;
    assert.equal(command, 'EVAL');
    assert.equal(locked, true);
    if (failWrite) throw new Error('write failed');
    const [, count, productsKey, backupKey, markerKey, next, marker] = args;
    assert.equal(count, 3);
    if (db.has(markerKey)) return 0;
    db.set(backupKey, db.get(productsKey) || '[]');
    db.set(productsKey, next);
    db.set(markerKey, marker);
    writes++;
    return 1;
  };
  try {
    await applyConfirmedInventory();
    const adjusted = JSON.parse(db.get('walkcards:products'));
    assert.ok(adjusted.length > 2);
    assert.ok(adjusted.every(product => product.stock === 22 && product.stockVerified
      && Number.isFinite(Date.parse(product.stockConfirmedAt))));
    assert.equal(adjusted.find(product => product.id === 'imported-1').price, 50);
    assert.equal(adjusted.find(product => product.id === 'imported-1').name, 'Nome cadastrado');
    assert.equal(adjusted.find(product => product.id === 'custom-item').price, 31.99);
    assert.equal(db.get(INVENTORY_BACKUP_KEY), raw);
    assert.equal(db.get('walkcards:orders'), '[{"id":"existing-order"}]');
    assert.equal(JSON.parse(db.get(INVENTORY_ADJUSTMENT_KEY)).count, adjusted.length);
    adjusted[0].stock = 21;
    db.set('walkcards:products', JSON.stringify(adjusted));
    await applyConfirmedInventory();
    assert.equal(writes, 1);
    assert.equal(JSON.parse(db.get('walkcards:products'))[0].stock, 21);
    db.delete(INVENTORY_ADJUSTMENT_KEY);
    failWrite = true;
    await assert.rejects(applyConfirmedInventory, /write failed/);
    assert.equal(locked, false);
    assert.equal(db.has(INVENTORY_ADJUSTMENT_KEY), false);
  } finally {
    Object.assign(payments, original);
  }
});
