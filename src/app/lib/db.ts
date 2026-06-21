import mysql from 'mysql2/promise';
import type { Pool, ExecuteValues } from 'mysql2/promise';

// 🔒 Détection automatique de TiDB Cloud et configuration SSL
const isSSLRequired = process.env.DB_SSL === 'true' || 
                      (process.env.DB_HOST && process.env.DB_HOST.includes('tidbcloud.com'));

// 🚀 Configuration du pool de connexions avec SSL
const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'aeroserve',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  
  // 🔐 Configuration SSL/TLS (optionnel pour TiDB)
ssl: isSSLRequired ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,  
  // ⚙️ Options de pool
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  
  // 🔄 Reconnexion automatique
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  
  // ⏱️ Timeouts (noms corrects)
  connectTimeout: 10000, // ✅ connectTimeout (pas connectionTimeout)
});

// ✅ Test de connexion au démarrage (une seule fois)
let connectionTested = false;

if (!connectionTested && process.env.NODE_ENV !== 'test') {
  pool.getConnection()
    .then((connection) => {
      console.log('✅ Database connected successfully');
      console.log(`🔒 SSL: ${isSSLRequired ? 'Enabled' : 'Disabled'}`);
      console.log(`📍 Host: ${process.env.DB_HOST || 'localhost'}`);
      console.log(`📦 Database: ${process.env.DB_NAME || 'aeroserve'}`);
      connection.release();
      connectionTested = true;
    })
    .catch((err: Error & { code?: string }) => {
      console.error('❌ Database connection failed:', err.message);
      if (err.code === 'ER_UNKNOWN_ERROR' || err.message.includes('insecure transport')) {
        console.error('💡 Tip: TiDB Cloud requires SSL. Set DB_SSL=true');
      }
      if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.error('💡 Tip: Connection lost. Check your network or database host.');
      }
      if (err.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('💡 Tip: Access denied. Check DB_USER and DB_PASSWORD.');
      }
    });
}

// 🛡️ Gestion des événements du pool
pool.on('enqueue', () => {
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('⏳ Waiting for available connection...');
  }
});

pool.on('acquire', () => {
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('✅ Connection acquired');
  }
});

pool.on('release', () => {
  if (process.env.LOG_LEVEL === 'debug') {
    console.log('↩️ Connection released');
  }
});

// 📝 Wrapper pour logger les requêtes en développement
export async function executeQuery<T = unknown>(sql: string, values?: ExecuteValues): Promise<T> {
  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`📌 SQL: ${sql}`, values ? `| Values: ${JSON.stringify(values)}` : '');
  }
  
  try {
    const connection = await pool.getConnection();
    const [results] = await connection.execute(sql, values);
    connection.release();
    return results as T;
  } catch (error) {
    const err = error as Error & { code?: string };
    console.error('❌ Query error:', err.message);
    throw error;
  }
}

export default pool;