const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// ===== CONFIGURACIÓN CORS EXPLÍCITA PARA NETLIFY =====
app.use(cors({
  origin: [
    'https://pepsico-funza.netlify.app',
    'https://pepsico-funza-production-b0f5.up.railway.app',
    'http://localhost:3000',
    'http://localhost:5500',
    '*'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// ✅ MANEJAR PREFLIGHT (OPTIONS) EXPLÍCITAMENTE
app.options('*', cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// ✅ ENDPOINT HEALTH CHECK
app.get('/health', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    
    res.json({
      status: 'ok',
      message: 'API y base de datos funcionando correctamente',
      timestamp: new Date().toISOString(),
      env: {
        host: process.env.MYSQLHOST ? '✅ Definido' : '❌ NO DEFINIDO',
        port: process.env.MYSQLPORT || '3306 (default)',
        user: process.env.MYSQLUSER || '❌ NO DEFINIDO',
        database: process.env.MYSQLDATABASE || '❌ NO DEFINIDO'
      }
    });
  } catch (error) {
    console.error('❌ Error en health check:', error);
    res.status(500).json({
      status: 'error',
      message: 'Base de datos NO accesible',
      error: error.message
    });
  }
});

// ✅ ENDPOINT PARA RECIBIR DATOS DEL FORMULARIO
app.post('/api/registro', async (req, res) => {
  let connection;
  
  try {
    console.log('📥 Recibiendo datos del formulario...');
    console.log('📊 Datos recibidos:', JSON.stringify(req.body, null, 2));
    
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
      respo_diligen,
      datos_vehiculos,
      datos_paradas_operacion
    } = req.body;

    // ✅ Obtener respo_diligen y limpiar puntos
    let respo_diligen_limpio = respo_diligen || '';
    respo_diligen_limpio = respo_diligen_limpio.replace(/\./g, '');
    
    const [registroResult] = await connection.query(
      `INSERT INTO registros (
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen_limpio
      ]
    );
    
    const registroId = registroResult.insertId;
    console.log('✅ Registro creado con ID:', registroId);
    
    // 2. Insertar vehículos Y sus detalles
    for (let i = 0; i < datos_vehiculos.length; i++) {
      const vehiculo = datos_vehiculos[i];
      
      const nombresJSON = vehiculo.nombres_personal && Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) 
        : null;
      
      console.log('📥 Vehículo recibido:', {
        placa: vehiculo.placa,
        tipo_operacion: vehiculo.tipo_operacion,
        tipo_carga: vehiculo.tipo_carga,
        tiene_justificaciones: vehiculo.hasOwnProperty('justificaciones'),
        tiene_novedades: vehiculo.hasOwnProperty('novedades')
      });

      const [vehiculoResult] = await connection.query(
        `INSERT INTO vehiculos (
          registro_id, inicio, fin, motivo, otro_motivo, tipo_carga, muelle, otro_muelle_num,
          placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, otro_origen, personas, cajas,
          foto_url, nombres_personal, tipo_operacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          nombresJSON,
          vehiculo.tipo_operacion || ''
        ]
      );
      
      const vehiculoId = vehiculoResult.insertId;
      console.log('✅ Vehículo', i + 1, 'creado con ID:', vehiculoId);
      
      // ✅ Insertar justificaciones por vehículo (TABLA SEPARADA)
      if (vehiculo.justificaciones && Array.isArray(vehiculo.justificaciones)) {
        for (const justificacion of vehiculo.justificaciones) {
          await connection.query(
            `INSERT INTO justificaciones (
              vehiculo_id, registro_id, justificacion, otro_justificacion, 
              tiempo_muerto_inicio, tiempo_muerto_final
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              vehiculoId,
              registroId,
              justificacion.justificacion || '',
              justificacion.otro_justificacion || '',
              justificacion.tiempo_muerto_inicio || '',
              justificacion.tiempo_muerto_final || ''
            ]
          );
        }
        console.log('✅ Justificaciones guardadas para Vehículo', i + 1, ':', vehiculo.justificaciones.length);
      }
      
      // ✅ Insertar novedades por vehículo
      if (vehiculo.novedades && Array.isArray(vehiculo.novedades)) {
        for (const novedad of vehiculo.novedades) {
          await connection.query(
            `INSERT INTO novedades (
              vehiculo_id, registro_id, tipo_novedad, descripcion, foto_url
            ) VALUES (?, ?, ?, ?, ?)`,
            [
              vehiculoId,
              registroId,
              novedad.tipo || '',
              novedad.descripcion || '',
              novedad.foto_url || ''
            ]
          );
        }
        console.log('✅ Novedades guardadas para Vehículo', i + 1, ':', vehiculo.novedades.length);
      }
      
      // ✅ INSERTAR DETALLES DE INSPECCIÓN
      await connection.query(
        `INSERT INTO detalles_vehiculos (
          vehiculo_id, interior_camion, estado_carpa, olores_extraños, objetos_extraños,
          evidencias_plagas, estado_suelo, aprobado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vehiculoId,
          vehiculo.interior_camion || null,
          vehiculo.estado_carpa || null,
          vehiculo.olores_extranos || null,
          vehiculo.objetos_extranos || null,
          vehiculo.evidencias_plagas || null,
          vehiculo.estado_suelo || null,
          vehiculo.aprobado || null
        ]
      );
      console.log('✅ Detalles de inspección guardados para Vehículo', i + 1);
      
      // ✅ Insertar productos escaneados por vehículo
      if (vehiculo.productos_escaneados && Array.isArray(vehiculo.productos_escaneados)) {
        for (const producto of vehiculo.productos_escaneados) {
          await connection.query(
            `INSERT INTO num_producto (
              vehiculo_id, registro_id, codigo_producto, referencia, nombre_producto, cantidad_cajas
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              vehiculoId,
              registroId,
              producto.codigo || '',
              producto.referencia || '',
              producto.nombre || '',
              producto.cantidad || 0
            ]
          );
        }
        console.log('✅ Productos escaneados guardados para Vehículo', i + 1, ':', vehiculo.productos_escaneados.length);
      }
      
    } // <-- CIERRE DEL BUCLE FOR
    
    // 3. Insertar paradas de operación
    if (datos_paradas_operacion && Array.isArray(datos_paradas_operacion)) {
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
      console.log('✅ Paradas de operación guardadas:', datos_paradas_operacion.length);
    }
    
    // Confirmar transacción
    await connection.commit();
    connection.release();

    console.log('✅ Registro completado exitosamente con ID:', registroId);

    res.json({
      success: true,
      message: 'Registro guardado correctamente con detalles',
      id: registroId
    });
  } catch (error) {
    // Revertir transacción en caso de error
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    
    console.error('❌ Error al guardar:', error);
    console.error('❌ Stack trace:', error.stack);
    
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// ✅ MANEJO DE ERRORES GLOBAL
app.use((err, req, res, next) => {
  console.error('❌ Error global:', err);
  res.status(500).json({
    success: false,
    error: err.message
  });
});

// ✅ RUTA 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

app.listen(port, () => {
  console.log(`✅ Servidor corriendo en puerto ${port}`);
  console.log(`✅ Health check: http://localhost:${port}/health`);
  console.log(`✅ API registro: http://localhost:${port}/api/registro`);
});
