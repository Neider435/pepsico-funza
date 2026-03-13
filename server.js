const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// ✅ Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // ✅ Para fotos en base64

// ===== LOGS DE VARIABLES DE ENTORNO =====
console.log('=== VARIABLES DE ENTORNO AL INICIAR ===');
console.log('MYSQLHOST:', process.env.MYSQLHOST ? '✅' : '❌ NO DEFINIDO');
console.log('MYSQLPORT:', process.env.MYSQLPORT || '4000');
console.log('MYSQLUSER:', process.env.MYSQLUSER ? '✅' : '❌ NO DEFINIDO');
console.log('MYSQLDATABASE:', process.env.MYSQLDATABASE ? '✅' : '❌ NO DEFINIDO');
console.log('=======================================');

// ===== CONEXIÓN A MYSQL/TIDB =====
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 4000, // ✅ TiDB usa puerto 4000
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: true // ✅ SSL obligatorio para TiDB Cloud
  }
});

// ✅ TEST DE CONEXIÓN AL INICIAR
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexión a MySQL/TiDB exitosa');
    connection.release();
  } catch (error) {
    console.error('❌ Error de conexión a MySQL:', error.message);
  }
})();

// ✅ ENDPOINT: Recibir y guardar datos del formulario
app.post('/api/registro', async (req, res) => {
  let connection;
  
  try {
    console.log('📥 Datos recibidos');
    
    // Obtener conexión para transacción
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    // ✅ Extraer datos del request
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
    } = req.body;

    // ✅ Validar campos obligatorios
    if (!fecha || !lugar) {
      throw new Error('Faltan campos obligatorios: fecha o lugar');
    }

    // ✅ Limpiar respo_diligen (quitar puntos)
    const respoLimpio = (respo_diligen || '').replace(/\./g, '');

    // ✅ 1. Insertar registro principal
    const [regResult] = await connection.query(
      `INSERT INTO registros (
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fecha, lugar, lider_asignado || '', coordinador || '', coordinador_otro || '',
        lider_pepsico || '', lider_pepsico_otro || '', turno || '', 
        total_personas || '', cajas_totales || '', respoLimpio
      ]
    );
    
    const registroId = regResult.insertId;
    console.log('✅ Registro principal creado con ID:', registroId);

    // ✅ 2. Insertar vehículos y sus datos relacionados
    for (const vehiculo of datos_vehiculos) {
      // Preparar nombres_personal como JSON
      const nombresJSON = Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) 
        : null;

      // Insertar vehículo
      const [vehResult] = await connection.query(
        `INSERT INTO vehiculos (
          registro_id, inicio, fin, motivo, otro_motivo, tipo_carga, muelle, otro_muelle_num,
          placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, otro_origen, personas, cajas,
          foto_url, nombres_personal, tipo_operacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          registroId,
          vehiculo.inicio || '', vehiculo.fin || '', vehiculo.motivo || '', vehiculo.otro_motivo || '',
          vehiculo.tipo_carga || '', vehiculo.muelle || '', vehiculo.otro_muelle_num || '',
          vehiculo.placa || '', vehiculo.tipo_vehi || '', vehiculo.otro_tipo || '',
          vehiculo.destino || '', vehiculo.otro_destino || '', vehiculo.origen || '', vehiculo.otro_origen || '',
          vehiculo.personas || '', vehiculo.cajas || '', vehiculo.foto_url || '',
          nombresJSON, vehiculo.tipo_operacion || ''
        ]
      );
      
      const vehiculoId = vehResult.insertId;
      console.log('✅ Vehículo creado con ID:', vehiculoId);

      // ✅ Insertar justificaciones
      if (Array.isArray(vehiculo.justificaciones) && vehiculo.justificaciones.length > 0) {
        for (const just of vehiculo.justificaciones) {
          await connection.query(
            `INSERT INTO justificaciones (vehiculo_id, registro_id, justificacion, otro_justificacion, tiempo_muerto_inicio, tiempo_muerto_final) VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, just.justificacion || '', just.otro_justificacion || '', just.tiempo_muerto_inicio || '', just.tiempo_muerto_final || '']
          );
        }
        console.log(`✅ Justificaciones guardadas: ${vehiculo.justificaciones.length}`);
      }

      // ✅ Insertar novedades
      if (Array.isArray(vehiculo.novedades) && vehiculo.novedades.length > 0) {
        for (const nov of vehiculo.novedades) {
          await connection.query(
            `INSERT INTO novedades (vehiculo_id, registro_id, tipo_novedad, descripcion, foto_url) VALUES (?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, nov.tipo || '', nov.descripcion || '', nov.foto_url || '']
          );
        }
        console.log(`✅ Novedades guardadas: ${vehiculo.novedades.length}`);
      }

      // ✅ Insertar detalles de inspección
      await connection.query(
        `INSERT INTO detalles_vehiculos (vehiculo_id, interior_camion, estado_carpa, olores_extraños, objetos_extraños, evidencias_plagas, estado_suelo, aprobado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vehiculoId,
          vehiculo.interior_camion || null, vehiculo.estado_carpa || null,
          vehiculo.olores_extranos || null, vehiculo.objetos_extranos || null,
          vehiculo.evidencias_plagas || null, vehiculo.estado_suelo || null,
          vehiculo.aprobado || null
        ]
      );

      // ✅ Insertar productos escaneados
      if (Array.isArray(vehiculo.productos_escaneados) && vehiculo.productos_escaneados.length > 0) {
        for (const prod of vehiculo.productos_escaneados) {
          await connection.query(
            `INSERT INTO num_producto (vehiculo_id, registro_id, codigo_producto, referencia, nombre_producto, cantidad_cajas) VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, prod.codigo || '', prod.referencia || '', prod.nombre || '', prod.cantidad || 0]
          );
        }
        console.log(`✅ Productos escaneados: ${vehiculo.productos_escaneados.length}`);
      }
    }

    // ✅ 3. Insertar paradas de operación (solo si tienen datos)
    if (Array.isArray(datos_paradas_operacion) && datos_paradas_operacion.length > 0) {
      for (const parada of datos_paradas_operacion) {
        if (parada.inicio || parada.fin || parada.motivo || parada.otro_motivo) {
          await connection.query(
            `INSERT INTO paradas_operacion (registro_id, inicio, fin, motivo, otro_motivo) VALUES (?, ?, ?, ?, ?)`,
            [registroId, parada.inicio || null, parada.fin || null, parada.motivo || null, parada.otro_motivo || null]
          );
        }
      }
      console.log(`✅ Paradas de operación guardadas`);
    }

    // ✅ Confirmar transacción
    await connection.commit();
    connection.release();

    // ✅ Responder éxito
    res.json({
      success: true,
      message: 'Registro guardado correctamente en MySQL',
      id: registroId
    });

  } catch (error) {
    console.error('❌ Error al guardar:', error);
    
    // ✅ Rollback en caso de error
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ✅ Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    conn.release();
    res.json({
      status: 'ok',
      message: 'API y base de datos funcionando correctamente',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Base de datos NO accesible',
      error: error.message
    });
  }
});

// ✅ Iniciar servidor
app.listen(port, () => {
  console.log(`✅ Servidor corriendo en puerto ${port}`);
});
