const { Pool } = require('pg');

// Crea un nuevo Pool de conexiones usando las variables de entorno
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 20, // Máximo de conexiones en el pool
  min: 1,  // Mínimo de conexiones en el pool
  idleTimeoutMillis: 30000, // Tiempo de inactividad antes de cerrar conexiones
  connectionTimeoutMillis: 5000 // Tiempo de espera para conectar
});

// Chequeo conexión establecida
pool.connect((err, client, done) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.stack);
  } else {
    console.log('Conectado a la base de datos PostgreSQL en donweb.');
    client.release();
  }
});

module.exports = pool; // Exporta el pool para usarlo en otras partes de la app