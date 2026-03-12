const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== LOGS DE VARIABLES DE ENTORNO =====
console.log('=== VARIABLES DE ENTORNO AL INICIAR ===');
console.log('MYSQLHOST:', process.env.MYSQLHOST || '❌ NO DEFINIDO');
console.log('MYSQLPORT:', process.env.MYSQLPORT || '4000');
console.log('MYSQLUSER:', process.env.MYSQLUSER ? '✅' : '❌ NO DEFINIDO');
console.log('MYSQLDATABASE:', process.env.MYSQLDATABASE || '❌ NO DEFINIDO');
console.log('=======================================');

// Conexión a TiDB
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

// Test de conexión
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexión a MySQL exitosa');
    connection.release();
  } catch (error) {
    console.error('❌ Error de conexión a MySQL:', error.message);
  }
})();

// Endpoint POST
app.post('/api/registro', async (req, res) => {
  let connection;
  
  try {
    console.log('📥 Datos recibidos');
    
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const {
      fecha, lugar, lider_asignado, coordinador, coordinador_otro,
      lider_pepsico, lider_pepsico_otro, turno, total_personas,
      cajas_totales, respo_diligen, datos_vehiculos = [], datos_paradas_operacion = []
    } = req.body;

    if (!fecha || !lugar) {
      throw new Error('Faltan campos obligatorios');
    }

    const respoLimpio = (respo_diligen || '').replace(/\./g, '');

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
    console.log('✅ Registro creado con ID:', registroId);

    // Insertar vehículos
    for (const vehiculo of datos_vehiculos) {
      const nombresJSON = Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) 
        : null;

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

      // Justificaciones
      if (Array.isArray(vehiculo.justificaciones)) {
        for (const just of vehiculo.justificaciones) {
          await connection.query(
            `INSERT INTO justificaciones (vehiculo_id, registro_id, justificacion, otro_justificacion, tiempo_muerto_inicio, tiempo_muerto_final) VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, just.justificacion || '', just.otro_justificacion || '', just.tiempo_muerto_inicio || '', just.tiempo_muerto_final || '']
          );
        }
      }

      // Novedades
      if (Array.isArray(vehiculo.novedades)) {
        for (const nov of vehiculo.novedades) {
          await connection.query(
            `INSERT INTO novedades (vehiculo_id, registro_id, tipo_novedad, descripcion, foto_url) VALUES (?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, nov.tipo || '', nov.descripcion || '', nov.foto_url || '']
          );
        }
      }

      // Detalles inspección
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

      // Productos
      if (Array.isArray(vehiculo.productos_escaneados)) {
        for (const prod of vehiculo.productos_escaneados) {
          await connection.query(
            `INSERT INTO num_producto (vehiculo_id, registro_id, codigo_producto, referencia, nombre_producto, cantidad_cajas) VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, prod.codigo || '', prod.referencia || '', prod.nombre || '', prod.cantidad || 0]
          );
        }
      }
    }

    // Paradas de operación
    for (const parada of datos_paradas_operacion) {
      if (parada.inicio || parada.fin || parada.motivo || parada.otro_motivo) {
        await connection.query(
          `INSERT INTO paradas_operacion (registro_id, inicio, fin, motivo, otro_motivo) VALUES (?, ?, ?, ?, ?)`,
          [registroId, parada.inicio || null, parada.fin || null, parada.motivo || null, parada.otro_motivo || null]
        );
      }
    }

    await connection.commit();
    connection.release();

    res.json({
      success: true,
      message: 'Registro guardado correctamente',
      id: registroId
    });

  } catch (error) {
    console.error('❌ Error:', error);
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    conn.release();
    res.json({ status: 'ok', message: 'API funcionando' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`✅ Servidor corriendo en puerto ${port}`);
});
