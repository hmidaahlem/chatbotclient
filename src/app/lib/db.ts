import mysql from 'mysql2/promise';

const isSSLRequired = process.env.DB_SSL === 'true' || 
                      (process.env.DB_HOST && process.env.DB_HOST.includes('tidbcloud.com'));

// 🔗 Construction de l'URI de connexion
const sslParam = isSSLRequired ? '?ssl={"rejectUnauthorized":true}' : '';
const connectionString = `mysql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}${sslParam}`;

// 🚀 Création du pool via l'URI directe
const pool = mysql.createPool({
  uri: connectionString,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;