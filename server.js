const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

// Endpoint para recibir datos del formulario
app.post('/api/registro', async (req, res) => {
  let connection;
  
  try {
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
      detalles_vehiculos,
      datos_paradas_operacion
    } = req.body;

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
    
    // 2. Insertar vehículos
    for (const vehiculo of datos_vehiculos) {
      const nombresJSON = vehiculo.nombres_personal && Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) 
        : null;
      
      const [vehiculoResult] = await connection.query(
        `INSERT INTO vehiculos (
          registro_id, inicio, fin, motivo, otro_motivo, muelle, otro_muelle_num,
          placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, personas, cajas,
          justificacion, otro_justificacion, tiempo_muerto_inicio, tiempo_muerto_final, 
          foto_url, nombres_personal  -- ✅ Columna añadida aquí
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          vehiculo.foto_url,
          nombresJSON
        ]
      );
      
      const vehiculoId = vehiculoResult.insertId;
      
      // 3. Insertar detalles del vehículo (si existen)
      const detallesKey = `vehiculo_${vehiculoId}_detalles`;
      if (detalles_vehiculos[detallesKey]) {
        const detalles = detalles_vehiculos[detallesKey];
        await connection.query(
          `INSERT INTO detalles_vehiculos (
            vehiculo_id, interior_camion, estado_carpa, olores_extraños, objetos_extraños,
            evidencias_plagas, estado_suelo, aprobado
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            vehiculoId,
            detalles.interior_camion,
            detalles.estado_carpa,
            detalles.olores_extraños,
            detalles.objetos_extraños,
            detalles.evidencias_plagas,
            detalles.estado_suelo,
            detalles.aprobado
          ]
        );
      }
    }
    
    // 4. Insertar paradas de operación
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
    
    // Confirmar transacción
    await connection.commit();
    connection.release();

    res.json({
      success: true,
      message: 'Registro guardado correctamente',
      id: registroId
    });
  } catch (error) {
    // Revertir transacción en caso de error
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    
    console.error('Error al guardar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check mejorado
app.get('/health', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    
    res.json({
      status: 'ok',
      message: 'API y base de datos funcionando correctamente',
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
      error: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor corriendo en puerto ${port}`);
});
