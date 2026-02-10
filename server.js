const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== LOGS DE VARIABLES DE ENTORNO =====
console.log('=== VARIABLES DE ENTORNO AL INICIAR ===');
console.log('HOST:', process.env.MYSQLHOST || '❌ NO DEFINIDO');
console.log('PORT:', process.env.MYSQLPORT || '❌ NO DEFINIDO');
console.log('USER:', process.env.MYSQLUSER || '❌ NO DEFINIDO');
console.log('PASSWORD:', process.env.MYSQLPASSWORD ? '✅ DEFINIDO (oculto)' : '❌ NO DEFINIDO');
console.log('DATABASE:', process.env.MYSQLDATABASE || '❌ NO DEFINIDO');
console.log('=======================================');

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

// ============================================
// ALMACENAMIENTO TEMPORAL DE INSPECCIONES
// ============================================
const inspeccionesTemporales = {}; // { vehiculo_index: { detalles... } }

// ============================================
// ENDPOINT: RECIBIR INSPECCIÓN DE VEHÍCULO
// ============================================
app.post('/api/inspeccion', async (req, res) => {
  try {
    const { vehiculo_index, ...detalles } = req.body;

    if (typeof vehiculo_index !== 'number' || vehiculo_index < 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Índice de vehículo inválido' 
      });
    }

    // Guardar temporalmente en memoria (asociado al índice, no al ID de BD)
    inspeccionesTemporales[vehiculo_index] = detalles;
    
    console.log(`✅ Inspección recibida para vehículo índice ${vehiculo_index}:`, detalles);
    
    res.json({ 
      success: true, 
      message: 'Inspección guardada temporalmente' 
    });
  } catch (error) {
    console.error('❌ Error en /api/inspeccion:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============================================
// ENDPOINT: RECIBIR DATOS DEL FORMULARIO COMPLETO
// ============================================
app.post('/api/registro', async (req, res) => {
  let connection;
  try {
    console.log('📝 Recibiendo datos del formulario...');
    
    // Obtener conexión para transacción
    connection = await pool.getConnection();
    await connection.beginTransaction();

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
      datos_paradas_operacion
    } = req.body;

    console.log('📊 Datos recibidos:');
    console.log('- Vehículos:', datos_vehiculos.length);
    console.log('- Paradas operación:', datos_paradas_operacion.length);

    // 1. Insertar registro principal
    const [registroResult] = await connection.query(
      `INSERT INTO registros (
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales
      ]
    );
    const registroId = registroResult.insertId;
    console.log('✅ Registro principal guardado. ID:', registroId);

    // 2. Insertar vehículos y sus detalles
    for (let i = 0; i < datos_vehiculos.length; i++) {
      const vehiculo = datos_vehiculos[i];
      
      console.log(`🚛 Procesando vehículo #${i + 1}...`);
      console.log('   Placa:', vehiculo.placa);
      console.log('   Personas:', vehiculo.personas);
      console.log('   Cajas:', vehiculo.cajas);

      // Insertar vehículo
      const [vehiculoResult] = await connection.query(
        `INSERT INTO vehiculos (
          registro_id, inicio, fin, motivo, otro_motivo, muelle, otro_muelle_num,
          placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, personas, cajas,
          justificacion, otro_justificacion, tiempo_muerto_inicio, tiempo_muerto_final, foto_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          registroId,
          vehiculo.inicio,
          vehiculo.fin,
          vehiculo.motivo,
          vehiculo.otro_motivo,
          vehiculo.muelle,
          vehiculo.otro_muelle_num,
          vehiculo.placa,
          vehiculo.tipo_vehi,
          vehiculo.otro_tipo,
          vehiculo.destino,
          vehiculo.otro_destino,
          vehiculo.origen,
          vehiculo.personas,
          vehiculo.cajas,
          vehiculo.justificacion,
          vehiculo.otro_justificacion,
          vehiculo.tiempo_muerto_inicio,
          vehiculo.tiempo_muerto_final,
          vehiculo.foto_url
        ]
      );
      const vehiculoId = vehiculoResult.insertId;
      console.log(`   ✅ Vehículo guardado. ID: ${vehiculoId}`);

      // 3. Insertar detalles del vehículo (si existen)
      // USAR EL ÍNDICE (i) EN LUGAR DEL ID DE BASE DE DATOS
      const inspeccionTemporal = inspeccionesTemporales[i];
      
      if (inspeccionTemporal) {
        console.log(`   🔍 Encontrada inspección para vehículo índice ${i}`);
        console.log('   ', JSON.stringify(inspeccionTemporal, null, 2));

        await connection.query(
          `INSERT INTO detalles_vehiculos (
            vehiculo_id, interior_camion, estado_carpa, olores_extraños, objetos_extraños,
            evidencias_plagas, estado_suelo, aprobado
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            vehiculoId,
            inspeccionTemporal.interior_camion || '',
            inspeccionTemporal.estado_carpa || '',
            inspeccionTemporal.olores_extraños || '', // ✅ Correcto: plural
            inspeccionTemporal.objetos_extraños || '',
            inspeccionTemporal.evidencias_plagas || '',
            inspeccionTemporal.estado_suelo || '',
            inspeccionTemporal.aprobado || ''
          ]
        );
        console.log(`   ✅ Inspección guardada en MySQL para vehículo ID ${vehiculoId}`);
        
        // Eliminar de memoria temporal
        delete inspeccionesTemporales[i];
      } else {
        console.log(`   ⚠️ No se encontró inspección para vehículo índice ${i}`);
      }

      // 4. Insertar nombres del personal (si existen)
      if (vehiculo.nombres_personal && vehiculo.nombres_personal.length > 0) {
        console.log(`   👥 Guardando ${vehiculo.nombres_personal.length} nombres de personal...`);
        
        for (const nombre of vehiculo.nombres_personal) {
          if (nombre && nombre.trim()) {
            await connection.query(
              `INSERT INTO nombres_personal (vehiculo_id, nombre) VALUES (?, ?)`,
              [vehiculoId, nombre.trim()]
            );
          }
        }
        console.log(`   ✅ Nombres del personal guardados`);
      }
    }

    // 5. Insertar paradas de operación
    console.log(`🛑 Procesando ${datos_paradas_operacion.length} paradas de operación...`);
    
    for (const parada of datos_paradas_operacion) {
      await connection.query(
        `INSERT INTO paradas_operacion (
          registro_id, inicio, fin, motivo, otro_motivo
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          registroId,
          parada.inicio,
          parada.fin,
          parada.motivo,
          parada.otro_motivo
        ]
      );
    }
    console.log(`✅ ${datos_paradas_operacion.length} paradas de operación guardadas`);

    // Confirmar transacción
    await connection.commit();
    connection.release();

    console.log('🎉 TRANSACCIÓN COMPLETADA EXITOSAMENTE');
    
    res.json({
      success: true,
      message: 'Registro guardado correctamente',
      id: registroId,
      vehiculos: datos_vehiculos.length
    });

  } catch (error) {
    // Revertir transacción en caso de error
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    
    console.error('❌ ERROR AL GUARDAR:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error al guardar los datos en la base de datos'
    });
  }
});

// ============================================
// ENDPOINT: OBTENER ÚLTIMOS REGISTROS (OPCIONAL)
// ============================================
app.get('/api/registros', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    const [registros] = await connection.query(
      `SELECT r.*, COUNT(v.id) as total_vehiculos 
       FROM registros r 
       LEFT JOIN vehiculos v ON r.id = v.registro_id 
       GROUP BY r.id 
       ORDER BY r.id DESC 
       LIMIT 20`
    );
    
    connection.release();
    
    res.json({
      success: true,
      registros: registros
    });
  } catch (error) {
    console.error('Error al obtener registros:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ENDPOINT: OBTENER DETALLES DE VEHÍCULO ESPECÍFICO
// ============================================
app.get('/api/vehiculo/:id/detalles', async (req, res) => {
  try {
    const vehiculoId = req.params.id;
    const connection = await pool.getConnection();
    
    const [detalles] = await connection.query(
      `SELECT * FROM detalles_vehiculos WHERE vehiculo_id = ?`,
      [vehiculoId]
    );
    
    connection.release();
    
    if (detalles.length > 0) {
      res.json({
        success: true,
        detalles: detalles[0]
      });
    } else {
      res.json({
        success: false,
        message: 'No se encontraron detalles para este vehículo'
      });
    }
  } catch (error) {
    console.error('Error al obtener detalles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    
    // Verificar conexión
    const [result] = await connection.query('SELECT 1 + 1 AS result');
    
    // Obtener información de las tablas
    const [tables] = await connection.query(
      `SELECT TABLE_NAME, TABLE_ROWS 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = ?`,
      [process.env.MYSQLDATABASE]
    );
    
    connection.release();
    
    res.json({
      status: 'ok',
      message: 'API y base de datos funcionando correctamente',
      timestamp: new Date().toISOString(),
      database: process.env.MYSQLDATABASE,
      tables: tables,
      env: {
        host: process.env.MYSQLHOST ? '✅ Definido' : '❌ NO DEFINIDO',
        port: process.env.MYSQLPORT || '3306 (default)',
        user: process.env.MYSQLUSER || '❌ NO DEFINIDO',
        database: process.env.MYSQLDATABASE || '❌ NO DEFINIDO'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Base de datos NO accesible',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================
// ENDPOINT DE PRUEBA
// ============================================
app.post('/api/test', (req, res) => {
  console.log('🧪 TEST - Datos recibidos:');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  res.json({
    success: true,
    message: 'Test recibido correctamente',
    received: {
      vehiculos: req.body.datos_vehiculos?.length || 0,
      paradas: req.body.datos_paradas_operacion?.length || 0
    }
  });
});

// ============================================
// MANEJADOR DE ERRORES GLOBAL
// ============================================
app.use((err, req, res, next) => {
  console.error('Error global:', err);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
    message: err.message
  });
});

// ============================================
// RUTA 404
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(port, () => {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║         🚀 SERVIDOR INICIADO EXITOSAMENTE          ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Puerto: ${port.toString().padEnd(43)}║`);
  console.log(`║  Base de datos: ${process.env.MYSQLDATABASE || 'NO DEFINIDA'.padEnd(32)}║`);
  console.log(`║  Host: ${process.env.MYSQLHOST || 'NO DEFINIDO'.padEnd(40)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Endpoints disponibles:');
  console.log('  POST   /api/inspeccion         - Guardar inspección temporal');
  console.log('  POST   /api/registro           - Guardar registro completo');
  console.log('  GET    /api/registros          - Obtener últimos registros');
  console.log('  GET    /api/vehiculo/:id/detalles - Obtener detalles de vehículo');
  console.log('  GET    /health                 - Verificar estado del servidor');
  console.log('  POST   /api/test               - Test de recepción de datos');
  console.log('');
});

module.exports = app;
