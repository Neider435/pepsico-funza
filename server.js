const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// ✅ Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== LOGS INICIALES =====
console.log('🚀 [RENDER] === INICIANDO SERVIDOR ===');
console.log('[RENDER] Timestamp:', new Date().toISOString());
console.log('[ENV] MYSQLHOST:', process.env.MYSQLHOST ? '✅' : '❌');
console.log('[ENV] MYSQLPORT:', process.env.MYSQLPORT || '4000');
console.log('[ENV] MYSQLUSER:', process.env.MYSQLUSER ? '✅' : '❌');
console.log('[ENV] MYSQLDATABASE:', process.env.MYSQLDATABASE ? '✅' : '❌');
console.log('[ENV] NODE_ENV:', process.env.NODE_ENV || 'production');
console.log('========================================');

// ===== CONEXIÓN MYSQL =====
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

// ✅ Test de conexión
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ [MYSQL] Conexión exitosa a la base de datos');
    conn.release();
  } catch (err) {
    console.error('❌ [MYSQL] Error de conexión:', err.message);
  }
})();

// ✅ ENDPOINT PRINCIPAL CON LOGS EXTENSIVOS
app.post('/api/registro', async (req, res) => {
  let connection;
  
  console.log('\n📥 [API] === NUEVA PETICIÓN RECIBIDA ===');
  console.log('[API] Timestamp:', new Date().toISOString());
  console.log('[API] Content-Type:', req.headers['content-type']);
  console.log('[API] Body size:', JSON.stringify(req.body).length, 'bytes');
  console.log('[API] Body keys:', Object.keys(req.body));
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    console.log('✅ [DB] Transacción iniciada');

    // ✅ Extraer datos - NOMBRES CORREGIDOS (SIN ESPACIOS)
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
      respo_diligen,
      datos_vehiculos = [],
      datos_paradas_operacion = []
    } = req.body; // ✅ CORREGIDO: era 'r eq.body'

    console.log('[API] 📋 Datos principales:');
    console.log('   • fecha:', fecha);
    console.log('   • lugar:', lugar);
    console.log('   • lider_asignado:', lider_asignado);
    console.log('   • Nº vehículos:', datos_vehiculos?.length || 0);
    console.log('   • Nº paradas:', datos_paradas_operacion?.length || 0);

    if (!fecha || !lugar) {
      console.error('❌ [VALIDACIÓN] Faltan campos obligatorios');
      throw new Error('Faltan campos: fecha o lugar');
    }

    const respoLimpio = (respo_diligen || '').replace(/\./g, '');

    // ✅ 1. Insertar registro principal
    console.log('[DB] 📝 Insertando registro principal...');
    const [regResult] = await connection.query(
      `INSERT INTO registros (
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fecha, 
        lugar, 
        lider_asignado || '', 
        coordinador || '', 
        coordinador_otro || '',
        lider_pepsico || '', 
        lider_pepsico_otro || '',
        turno || '', 
        total_personas || '', 
        cajas_totales || '', 
        respoLimpio
      ]
    );
    
    const registroId = regResult.insertId; // ✅ CORREGIDO: era 'regResul t'
    console.log('✅ [DB] Registro principal creado - ID:', registroId);

    // ✅ 2. Insertar vehículos
    console.log(`[DB] 🚗 Procesando ${datos_vehiculos.length} vehículo(s)...`);
    
    for (let i = 0; i < datos_vehiculos.length; i++) {
      const vehiculo = datos_vehiculos[i];
      console.log(`\n🚗 [VEHÍCULO ${i+1}/${datos_vehiculos.length}] ===`);
      console.log('   • Placa:', vehiculo.placa || 'N/A');
      console.log('   • Tipo:', vehiculo.tipo_vehi || 'N/A');
      
      // 🔍 LOG CRÍTICO: Verificar fotos
      console.log('📸 [FOTOS] URLs recibidas:');
      console.log('   • foto_url:', vehiculo.foto_url ? '✅' : '❌', (vehiculo.foto_url || '').substring(0, 60));
      console.log('   • foto_inicio_url:', vehiculo.foto_inicio_url ? '✅' : '❌', (vehiculo.foto_inicio_url || '').substring(0, 60));
      console.log('   • foto_durante_url:', vehiculo.foto_durante_url ? '✅' : '❌', (vehiculo.foto_durante_url || '').substring(0, 60));
      console.log('   • foto_fin_url:', vehiculo.foto_fin_url ? '✅' : '❌', (vehiculo.foto_fin_url || '').substring(0, 60));
      
      console.log('🔍 [FOTOS] Verificación booleana:');
      console.log('   • tiene_inicio:', !!vehiculo.foto_inicio_url);
      console.log('   • tiene_durante:', !!vehiculo.foto_durante_url);
      console.log('   • tiene_fin:', !!vehiculo.foto_fin_url);

      const nombresJSON = Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) 
        : null;

      // ✅ CORREGIDO: Query sin espacios
      console.log('[DB] Ejecutando INSERT en vehiculos...');
      const [vehResult] = await connection.query(
        `INSERT INTO vehiculos (
          registro_id, inicio, fin, motivo, otro_motivo, tipo_carga, muelle, otro_muelle_num,
          placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, otro_origen, personas, cajas,
          foto_url, foto_inicio_url, foto_durante_url, foto_fin_url, nombres_personal, tipo_operacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          registroId,
          vehiculo.inicio || '', 
          vehiculo.fin || '', 
          vehiculo.motivo || '', 
          vehiculo.otro_motivo || '',
          vehiculo.tipo_carga || '', 
          vehiculo.muelle || '', 
          vehiculo.otro_muelle_num || '',
          vehiculo.placa || '', 
          vehiculo.tipo_vehi || '', 
          vehiculo.otro_tipo || '',
          vehiculo.destino || '', 
          vehiculo.otro_destino || '', 
          vehiculo.origen || '', 
          vehiculo.otro_origen || '',
          vehiculo.personas || '', 
          vehiculo.cajas || '', 
          vehiculo.foto_url || '', 
          vehiculo.foto_inicio_url || '',   // ← Aquí va la URL
          vehiculo.foto_durante_url || '',  // ← Aquí va la URL
          vehiculo.foto_fin_url || '',      // ← Aquí va la URL
          nombresJSON, 
          vehiculo.tipo_operacion || ''
        ]
      );
      
      const vehiculoId = vehResult.insertId;
      console.log('✅ [DB] Vehículo insertado - ID:', vehiculoId);
      
      // ✅ Verificar qué se guardó realmente en la DB
      console.log('[DB] 🔍 Verificando datos guardados...');
      const [checkResult] = await connection.query(
        `SELECT id, placa, foto_inicio_url, foto_durante_url, foto_fin_url FROM vehiculos WHERE id = ?`,
        [vehiculoId]
      );
      
      if (checkResult && checkResult[0]) {
        console.log('✅ [VERIFICACIÓN] Datos reales en BD:');
        console.log('   • foto_inicio_url:', checkResult[0].foto_inicio_url ? '✅ GUARDADA' : '❌ NULL', (checkResult[0].foto_inicio_url || '').substring(0, 60));
        console.log('   • foto_durante_url:', checkResult[0].foto_durante_url ? '✅ GUARDADA' : '❌ NULL', (checkResult[0].foto_durante_url || '').substring(0, 60));
        console.log('   • foto_fin_url:', checkResult[0].foto_fin_url ? '✅ GUARDADA' : '❌ NULL', (checkResult[0].foto_fin_url || '').substring(0, 60));
      }
    }

    // ✅ 3. Paradas de operación
    if (Array.isArray(datos_paradas_operacion) && datos_paradas_operacion.length > 0) {
      console.log(`[DB] 📋 Insertando ${datos_paradas_operacion.length} parada(s) de operación...`);
      for (const parada of datos_paradas_operacion) {
        await connection.query(
          `INSERT INTO paradas_operacion (registro_id, inicio, fin, motivo, otro_motivo) VALUES (?, ?, ?, ?, ?)`,
          [registroId, parada.inicio || null, parada.fin || null, parada.motivo || null, parada.otro_motivo || null]
        );
      }
      console.log('✅ [DB] Paradas insertadas');
    }

    await connection.commit();
    connection.release();
    console.log('✅ [DB] === TRANSACCIÓN COMMIT EXITOSA ===');
    console.log('✅ [API] Registro completado - ID:', registroId);
    
    res.json({ 
      success: true, 
      message: 'Guardado correctamente', 
      id: registroId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('\n❌ [ERROR CRÍTICO] ====================');
    console.error('❌ [ERROR] Mensaje:', error.message);
    console.error('❌ [ERROR] Código:', error.code || 'N/A');
    console.error('❌ [ERROR] Stack:', error.stack);
    console.error('=====================================\n');
    
    if (connection) {
      await connection.rollback();
      connection.release();
      console.log('🔄 [DB] Rollback realizado');
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      render_debug: 'Revisa los logs arriba para más detalles',
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ Endpoint de salud
app.get('/health', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    conn.release();
    console.log('✅ [HEALTH] Check exitoso');
    res.json({ 
      status: 'ok', 
      message: 'API y DB funcionando',
      timestamp: new Date().toISOString() 
    });
  } catch (err) {
    console.error('❌ [HEALTH] Error:', err.message);
    res.status(500).json({ 
      status: 'error', 
      error: err.message,
      timestamp: new Date().toISOString() 
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`\n✅ [RENDER] Servidor escuchando en puerto ${port}`);
  console.log('✅ [RENDER] Listo para recibir peticiones\n');
});
