import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST as string,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

});

export default pool;