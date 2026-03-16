const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

console.log('=== ENV ===');
console.log('MYSQLHOST:', process.env.MYSQLHOST ? '✅' : '❌');
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 4000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: true }
});

app.post('/api/registro', async (req, res) => {
  let conn;
  try {
    console.log('📥 BODY COMPLETO RECIBIDO:', JSON.stringify(req.body, null, 2).substring(0, 500));
    console.log('📥 datos_vehiculos:', req.body.datos_vehiculos ? req.body.datos_vehiculos.length : 0, 'vehículos');
    
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const { fecha, lugar, datos_vehiculos = [] } = req.body;
    
    if (!fecha || !lugar) throw new Error('Faltan fecha/lugar');

    // Insert registro
    const [regResult] = await conn.query(
      `INSERT INTO registros (fecha, lugar) VALUES (?, ?)`,
      [fecha, lugar]
    );
    const registroId = regResult.insertId;
    console.log('✅ Registro creado ID:', registroId);

    // Insert vehículos con DEBUG EXTREMO
    for (let i = 0; i < datos_vehiculos.length; i++) {
      const v = datos_vehiculos[i];
      
      console.log(`\n🔍 VEHÍCULO ${i} - DATOS RAW:`, JSON.stringify(v, null, 2));
      
      const f_inicio = (v.foto_inicio || v.foto_inicio_url || '').trim();
      const f_durante = (v.foto_durante || v.foto_durante_url || '').trim();
      const f_fin = (v.foto_fin || v.foto_fin_url || '').trim();
      
      console.log(`🔍 FOTOS PROCESADAS:`, {
        inicio: f_inicio ? f_inicio.substring(0, 60) : 'VACÍO',
        durante: f_durante ? f_durante.substring(0, 60) : 'VACÍO',
        fin: f_fin ? f_fin.substring(0, 60) : 'VACÍO',
        longitud_inicio: f_inicio.length,
        es_string: typeof f_inicio
      });

      const [vehResult] = await conn.query(
        `INSERT INTO vehiculos (
          registro_id, placa, foto_inicio_url, foto_durante_url, foto_fin_url
        ) VALUES (?, ?, ?, ?, ?)`,
        [registroId, v.placa || '', f_inicio, f_durante, f_fin]
      );
      
      console.log('✅ Vehículo insertado, ID:', vehResult.insertId);
      
      // Verificar inmediatamente después de insertar
      const [check] = await conn.query(
        `SELECT foto_inicio_url, foto_durante_url, foto_fin_url FROM vehiculos WHERE id = ?`,
        [vehResult.insertId]
      );
      console.log('🔍 VERIFICACIÓN POST-INSERT:', check[0]);
    }

    await conn.commit();
    conn.release();
    
    res.json({ success: true, message: 'Guardado', id: registroId });
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (conn) { await conn.rollback(); conn.release(); }
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => console.log(`✅ Server: ${port}`));
