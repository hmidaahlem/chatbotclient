import mysql from 'mysql2/promise';
import type { ExecuteValues } from 'mysql2/promise';

// 📝 Wrapper dynamique : On crée le pool UNIQUEMENT quand on appelle la base de données
export async function executeQuery<T = unknown>(sql: string, values?: ExecuteValues): Promise<T> {
  
  // 1. Lire les variables au moment de l'exécution (Garanti sans bug Turbopack)
  const host = process.env.DB_HOST || '';
  const isSSLRequired = process.env.DB_SSL === 'true' || host.includes('tidbcloud.com');

  if (process.env.LOG_LEVEL === 'debug') {
    console.log(`📍 Connexion à : ${host} | SSL Requis : ${isSSLRequired}`);
    console.log(`📌 SQL: ${sql}`, values ? `| Values: ${JSON.stringify(values)}` : '');
  }

  // 2. Création d'une configuration propre et isolée
  const pool = mysql.createPool({
    host: host || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'aeroserve',
    port: parseInt(process.env.DB_PORT || '4000', 10),
    
    // 🔐 Forçage de l'objet SSL standard compatible serveurs cloud
    ssl: isSSLRequired ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
    
    waitForConnections: true,
    connectionLimit: 1, // Idéal pour le Serverless/Vercel
    queueLimit: 0,
    connectTimeout: 10000,
  });

  try {
    // 3. Exécution de la requête
    const [results] = await pool.execute(sql, values);
    
    // 4. Fermeture immédiate du pool pour libérer la mémoire Serverless
    await pool.end();
    
    return results as T;
  } catch (error) {
    const err = error as Error & { code?: string };
    console.error('❌ Query error:', err.message);
    throw error;
  }
}

// Pour éviter les erreurs d'importation ailleurs dans ton code, on exporte un pool factice
const dummyPool = {};
export default dummyPool;