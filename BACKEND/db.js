const { Pool } = require('pg');

// Crea un nuevo Pool de conexiones usando las variables de entorno
const pool = new Pool({
  connectionString:`postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@maglev.proxy.rlwy.net:${process.env.PGPORT}/${process.env.PGDATABASE}`,
  ssl: {
    rejectUnauthorized: false // NECESARIO para Railway sin certificados
  }
});

// Chequeo conexión establecida
pool.connect((err, client, done) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.stack);
  } else {
    console.log('Conectado a la base de datos PostgreSQL en Railway.');
    client.release();
  }
});

module.exports = pool; // Exporta el pool para usarlo en otras partes de la app