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

// Endpoint para recibir datos del formulario (CON TRANSACCIONES)
app.post('/api/registro', async (req, res) => {
  let connection;
  
  try {
    // Validar datos antes de insertar
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

    // Validaciones básicas
    if (!fecha || !lugar || !lider_asignado || !turno || !total_personas || !cajas_totales) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos obligatorios'
      });
    }

    if (!Array.isArray(datos_vehiculos) || datos_vehiculos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debe registrar al menos un vehículo'
      });
    }

    // Obtener conexión
    connection = await pool.getConnection();
    
    // Iniciar transacción
    await connection.beginTransaction();

    try {
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
        const [vehiculoResult] = await connection.query(
          `INSERT INTO vehiculos (
            registro_id, inicio, fin, motivo, otro_motivo, muelle, otro_muelle_num,
            placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, personas, 
            nombres_personal, cajas, justificacion, otro_justificacion, 
            tiempo_muerto_inicio, tiempo_muerto_final, foto_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            registroId,
            vehiculo.inicio || null,
            vehiculo.fin || null,
            vehiculo.motivo || null,
            vehiculo.otro_motivo || null,
            vehiculo.muelle || null,
            vehiculo.otro_muelle_num || null,
            vehiculo.placa || null,
            vehiculo.tipo_vehi || null,
            vehiculo.otro_tipo || null,
            vehiculo.destino || null,
            vehiculo.otro_destino || null,
            vehiculo.origen || null,
            vehiculo.personas || 0,
            JSON.stringify(vehiculo.nombres_personal || []),
            vehiculo.cajas || 0,
            vehiculo.justificacion || null,
            vehiculo.otro_justificacion || null,
            vehiculo.tiempo_muerto_inicio || null,
            vehiculo.tiempo_muerto_final || null,
            vehiculo.foto_url || null
          ]
        );
        
        const vehiculoId = vehiculoResult.insertId;
        
        // 3. Insertar detalles del vehículo (si existen)
        const detallesKey = `vehiculo_${vehiculosData.indexOf(vehiculo)}_detalles`;
        if (detalles_vehiculos && detalles_vehiculos[detallesKey]) {
          const detalles = detalles_vehiculos[detallesKey];
          await connection.query(
            `INSERT INTO detalles_vehiculos (
              vehiculo_id, estado_carpa, carpa_limpia, estibas, estibas_estado,
              canastillas, canastillas_estado, vinipel
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              vehiculoId,
              detalles.estado_carpa || 'N/A',
              detalles.carpa_limpia || 'N/A',
              detalles.estibas || 'N/A',
              detalles.estibas_estado || 'N/A',
              detalles.canastillas || 'N/A',
              detalles.canastillas_estado || 'N/A',
              detalles.vinipel || 'N/A'
            ]
          );
        }
      }
      
      // 4. Insertar paradas de operación
      if (Array.isArray(datos_paradas_operacion)) {
        for (const parada of datos_paradas_operacion) {
          await connection.query(
            `INSERT INTO paradas_operacion (
              registro_id, inicio, fin, motivo, otro_motivo
            ) VALUES (?, ?, ?, ?, ?)`,
            [
              registroId,
              parada.inicio || null,
              parada.fin || null,
              parada.motivo || null,
              parada.otro_motivo || null
            ]
          );
        }
      }

      // Confirmar transacción
      await connection.commit();

      res.json({
        success: true,
        message: 'Registro guardado correctamente',
        id: registroId
      });

    } catch (error) {
      // Revertir transacción en caso de error
      await connection.rollback();
      throw error;
    }

  } catch (error) {
    console.error('Error al guardar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (connection) connection.release();
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
        port: process.env.MYSQLPORT || '3306',
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
