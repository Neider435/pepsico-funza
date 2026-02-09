const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Conexión a MySQL
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Endpoint para recibir datos del formulario
app.post('/api/registro', async (req, res) => {
  try {
    const {
      fecha,
      lugar,
      lider_asignado,
      coordinador,
      coordinador_otro,
      lider_pepsico,
      lider_pepsico_otro,
      turno,
      total_personas,
      cajas_totales,
      datos_vehiculos,
      detalles_vehiculos,
      datos_paradas_operacion
    } = req.body;

    // Insertar registro principal
    const [result] = await pool.query(
      `INSERT INTO registros (
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales,
        datos_vehiculos, detalles_vehiculos, datos_paradas_operacion, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales,
        JSON.stringify(datos_vehiculos),
        JSON.stringify(detalles_vehiculos),
        JSON.stringify(datos_paradas_operacion)
      ]
    );

    res.json({
      success: true,
      message: 'Registro guardado correctamente',
      id: result.insertId
    });
  } catch (error) {
    console.error('Error al guardar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API funcionando correctamente' });
});

app.listen(port, () => {
  console.log(`Servidor corriendo en puerto ${port}`);
});
