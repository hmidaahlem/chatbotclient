import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // 🔒 Ligne obligatoire pour autoriser le chiffrement SSL exigé par TiDB Cloud
  ssl: {
    rejectUnauthorized: true,
  },
});

export default pool;