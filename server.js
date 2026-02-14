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
      res_diligenciamiento,
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

    // 1. Insertar registro principal
    const [registroResult] = await connection.query(
      `INSERT INTO registros (
        fecha, lugar, res_diligenciamiento, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fecha, 
        lugar,
        res_diligenciamiento, 
        lider_asignado, 
        coordinador, 
        coordinador_otro,
        lider_pepsico, 
        lider_pepsico_otro, 
        turno, 
        total_personas, 
        cajas_totales
      ]
    );
    
    const registroId = registroResult.insertId;
    
    // 2. Insertar vehículos Y sus detalles
    for (let i = 0; i < datos_vehiculos.length; i++) {
      const vehiculo = datos_vehiculos[i];
      
      const nombresJSON = vehiculo.nombres_personal && Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) 
        : null;
      
      // Insertar vehículo (SIN campos de tiempo muerto)
      const [vehiculoResult] = await connection.query(
        `INSERT INTO vehiculos (
          registro_id, inicio, fin, motivo, otro_motivo, muelle, otro_muelle_num,
          placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, personas, cajas,
          foto_url, nombres_personal, tipo_operacion, observaciones_especiales, detalle_observaciones
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
          vehiculo.foto_url,
          nombresJSON,
          vehiculo.tipo_operacion,
          vehiculo.observaciones_especiales || null,
          vehiculo.detalle_observaciones || null
        ]
      );
      
      const vehiculoId = vehiculoResult.insertId;
      
      // ✅ INSERTAR TIEMPO MUERTO EN TABLA DEDICADA (SOLO SI HAY JUSTIFICACIÓN)
      // ✅ INSERTAR TIEMPO MUERTO EN TABLA DEDICADA (SOLO SI HAY DATOS VÁLIDOS)
if (vehiculo.justificacion && 
    (vehiculo.tiempo_muerto_inicio || vehiculo.tiempo_muerto_final)) {
  
  // ✅ Validar que los tiempos no sean "00:00:00" o vacíos
  const inicioValido = vehiculo.tiempo_muerto_inicio && 
                       vehiculo.tiempo_muerto_inicio !== '00:00:00' && 
                       vehiculo.tiempo_muerto_inicio !== '00:00' && 
                       vehiculo.tiempo_muerto_inicio.trim() !== '';
  
  const finValido = vehiculo.tiempo_muerto_final && 
                    vehiculo.tiempo_muerto_final !== '00:00:00' && 
                    vehiculo.tiempo_muerto_final !== '00:00' && 
                    vehiculo.tiempo_muerto_final.trim() !== '';
  
  // ✅ Solo insertar si al menos uno de los tiempos es válido
  if (inicioValido || finValido) {
    await connection.query(
      `INSERT INTO time_out (
        idvehiculo, justificacion, otro_justificacion, tiempo_muerto_inicio, tiempo_muerto_fin
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        vehiculoId,
        vehiculo.justificacion,
        vehiculo.otro_justificacion || null,
        inicioValido ? vehiculo.tiempo_muerto_inicio : null,
        finValido ? vehiculo.tiempo_muerto_final : null
      ]
    );
  }
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
      
      // ✅ INSERTAR PRODUCTOS ESCANEADOS
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
      }
    }
    
    // 3. Insertar paradas de operación
    // 3. Insertar paradas de operación (SOLO SI HAY DATOS VÁLIDOS)
if (datos_paradas_operacion && Array.isArray(datos_paradas_operacion)) {
  for (const parada of datos_paradas_operacion) {
    // ✅ Validar que la parada tenga datos significativos
    const inicioValido = parada.inicio && 
                         parada.inicio !== '00:00:00' && 
                         parada.inicio !== '00:00' && 
                         parada.inicio.trim() !== '';
    
    const finValido = parada.fin && 
                      parada.fin !== '00:00:00' && 
                      parada.fin !== '00:00' && 
                      parada.fin.trim() !== '';
    
    const motivoValido = parada.motivo && parada.motivo.trim() !== '';
    
    // ✅ Solo insertar si hay al menos un dato válido (tiempo o motivo)
    if (inicioValido || finValido || motivoValido) {
      await connection.query(
        `INSERT INTO paradas_operacion (
          registro_id, inicio, fin, motivo, otro_motivo
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          registroId,
          inicioValido ? parada.inicio : null,
          finValido ? parada.fin : null,
          motivoValido ? parada.motivo : null,
          (motivoValido && parada.motivo === 'otro') ? (parada.otro_motivo || null) : null
        ]
      );
    }
  }
}
    
    // Confirmar transacción
    await connection.commit();
    connection.release();

    res.json({
      success: true,
      message: 'Registro guardado correctamente con tiempo muerto en tabla dedicada',
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
