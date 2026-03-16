const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

console.log('🚀 [RENDER] Iniciando servidor...');
console.log('MYSQLHOST:', process.env.MYSQLHOST ? '✅' : '❌');

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 4000,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: { rejectUnauthorized: true }
});

app.post('/api/registro', async (req, res) => {
  let connection;
  console.log('\n📥 [API] Nueva petición recibida');
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const {
      fecha, lugar, lider_asignado, coordinador, coordinador_otro,
      lider_pepsico, lider_pepsico_otro, turno, total_personas,
      cajas_totales, respo_diligen, datos_vehiculos = [], datos_paradas_operacion = []
    } = req.body; // ✅ Sin espacios

    if (!fecha || !lugar) throw new Error('Faltan campos obligatorios');

    // 1. Registro Principal
    const [regResult] = await connection.query(
      `INSERT INTO registros (fecha, lugar, lider_asignado, coordinador, coordinador_otro, lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fecha, lugar, lider_asignado||'', coordinador||'', coordinador_otro||'', lider_pepsico||'', lider_pepsico_otro||'', turno||'', total_personas||'', cajas_totales||'', (respo_diligen||'').replace(/\./g, '')]
    );
    const registroId = regResult.insertId;
    console.log('✅ Registro ID:', registroId);

    // 2. Vehículos
    for (const vehiculo of datos_vehiculos) {
      console.log(`\n🚗 Procesando vehículo: ${vehiculo.placa}`);
      
      // 🔍 LOG CRÍTICO PARA DEBUG
      console.log('📸 URLs recibidas en el objeto vehiculo:');
      console.log('   - inicio:', vehiculo.foto_inicio_url ? '✅ PRESENTE' : '❌ AUSENTE (undefined)');
      console.log('   - durante:', vehiculo.foto_durante_url ? '✅ PRESENTE' : '❌ AUSENTE (undefined)');
      console.log('   - fin:', vehiculo.foto_fin_url ? '✅ PRESENTE' : '❌ AUSENTE (undefined)');

      const nombresJSON = Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) : null;

      const [vehResult] = await connection.query(
        `INSERT INTO vehiculos (registro_id, placa, foto_url, foto_inicio_url, foto_durante_url, foto_fin_url, inicio, fin, motivo, otro_motivo, tipo_carga, muelle, otro_muelle_num, tipo_vehi, otro_tipo, destino, otro_destino, origen, otro_origen, personas, cajas, nombres_personal, tipo_operacion) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          registroId, 
          vehiculo.placa||'', 
          vehiculo.foto_url||'', 
          vehiculo.foto_inicio_url||'',   // Aquí se guarda si llega bien
          vehiculo.foto_durante_url||'',  // Aquí se guarda si llega bien
          vehiculo.foto_fin_url||'',      // Aquí se guarda si llega bien
          vehiculo.inicio||'', vehiculo.fin||'', vehiculo.motivo||'', vehiculo.otro_motivo||'',
          vehiculo.tipo_carga||'', vehiculo.muelle||'', vehiculo.otro_muelle_num||'',
          vehiculo.tipo_vehi||'', vehiculo.otro_tipo||'', vehiculo.destino||'', vehiculo.otro_destino||'',
          vehiculo.origen||'', vehiculo.otro_origen||'', vehiculo.personas||'', vehiculo.cajas||'',
          nombresJSON, vehiculo.tipo_operacion||''
        ]
      );
      
      const vehiculoId = vehResult.insertId;
      console.log('✅ Vehículo guardado ID:', vehiculoId);

      // Verificación post-insert
      const [check] = await connection.query('SELECT foto_inicio_url, foto_durante_url, foto_fin_url FROM vehiculos WHERE id = ?', [vehiculoId]);
      console.log('🔍 Lo que quedó en BD:', check[0]);

      // Novedades (Estas sí te funcionaban)
      if (Array.isArray(vehiculo.novedades)) {
        for (const nov of vehiculo.novedades) {
          await connection.query(`INSERT INTO novedades (vehiculo_id, registro_id, tipo_novedad, descripcion, foto_url) VALUES (?, ?, ?, ?, ?)`, 
            [vehiculoId, registroId, nov.tipo||'', nov.descripcion||'', nov.foto_url||'']);
        }
      }
      
      // Justificaciones
      if (Array.isArray(vehiculo.justificaciones)) {
        for (const just of vehiculo.justificaciones) {
          await connection.query(`INSERT INTO justificaciones (vehiculo_id, registro_id, justificacion, otro_justificacion, tiempo_muerto_inicio, tiempo_muerto_final) VALUES (?, ?, ?, ?, ?, ?)`, 
            [vehiculoId, registroId, just.justificacion||'', just.otro_justificacion||'', just.tiempo_muerto_inicio||'', just.tiempo_muerto_final||'']);
        }
      }

      // Detalles
      await connection.query(`INSERT INTO detalles_vehiculos (vehiculo_id, interior_camion, estado_carpa, olores_extraños, objetos_extraños, evidencias_plagas, estado_suelo, aprobado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [vehiculoId, vehiculo.interior_camion||null, vehiculo.estado_carpa||null, vehiculo.olores_extraños||null, vehiculo.objetos_extraños||null, vehiculo.evidencias_plagas||null, vehiculo.estado_suelo||null, vehiculo.aprobado||null]);
    }

    // Paradas
    if (Array.isArray(datos_paradas_operacion)) {
      for (const parada of datos_paradas_operacion) {
        await connection.query(`INSERT INTO paradas_operacion (registro_id, inicio, fin, motivo, otro_motivo) VALUES (?, ?, ?, ?, ?)`, 
          [registroId, parada.inicio||null, parada.fin||null, parada.motivo||null, parada.otro_motivo||null]);
      }
    }

    await connection.commit();
    connection.release();
    res.json({ success: true, id: registroId });

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (connection) { await connection.rollback(); connection.release(); }
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    conn.release();
    res.json({ status: 'ok' });
  } catch (e) { res.status(500).json({ status: 'error', error: e.message }); }
});

app.listen(port, '0.0.0.0', () => console.log(`✅ Servidor en puerto ${port}`));
