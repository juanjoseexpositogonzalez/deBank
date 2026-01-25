const sqlite3 = require('sqlite3').verbose();
const config = require('../config');

let db;

function initialize() {
  db = new sqlite3.Database(config.databasePath);
  
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        payment_request TEXT,
        tx_hash TEXT,
        amount TEXT,
        from_address TEXT,
        to_address TEXT,
        timestamp INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_tx_hash ON payments(tx_hash)
    `);
    
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON payments(timestamp)
    `);
  });
}

async function checkPaymentExists(paymentId) {
  return new Promise((resolve, reject) => {
    if (!db) initialize();
    
    db.get(
      'SELECT * FROM payments WHERE id = ?',
      [paymentId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

async function recordPayment(paymentId, paymentData) {
  return new Promise((resolve, reject) => {
    if (!db) initialize();
    
    db.run(
      `INSERT INTO payments (id, payment_request, tx_hash, amount, from_address, to_address, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentId,
        JSON.stringify(paymentData.paymentRequest),
        paymentData.txHash,
        paymentData.amount,
        paymentData.from,
        paymentData.to,
        paymentData.timestamp,
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

module.exports = { checkPaymentExists, recordPayment, initialize };
