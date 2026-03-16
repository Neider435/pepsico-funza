const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// ✅ Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== LOGS DE VARIABLES DE ENTORNO =====
console.log('=== VARIABLES DE ENTORNO AL INICIAR ===');
console.log('MYSQLHOST:', process.env.MYSQLHOST ? '✅' : '❌ NO DEFINIDO');
console.log('MYSQLPORT:', process.env.MYSQLPORT || '4000');
console.log('MYSQLUSER:', process.env.MYSQLUSER ? '✅' : '❌ NO DEFINIDO');
console.log('MYSQLPASSWORD:', process.env.MYSQLPASSWORD ? '✅' : '❌ NO DEFINIDO');
console.log('MYSQLDATABASE:', process.env.MYSQLDATABASE ? '✅' : '❌ NO DEFINIDO');
console.log('=======================================');

// ===== CONEXIÓN A MYSQL/TIDB =====
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

// ✅ TEST DE CONEXIÓN
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexión a MySQL/TiDB exitosa');
    connection.release();
  } catch (error) {
    console.error('❌ Error de conexión a MySQL:', error.message);
  }
})();

// ✅ ENDPOINT PRINCIPAL
app.post('/api/registro', async (req, res) => {
  let connection;
  try {
    // 🔍 LOG 1: RECEPCIÓN DE DATOS - DEBUG COMPLETO
    console.log('\n📥 [DEBUG] === NUEVA PETICIÓN /api/registro ===');
    console.log('📥 [DEBUG] Timestamp:', new Date().toISOString());
    console.log('📥 [DEBUG] Body keys:', Object.keys(req.body));
    
    // 🔍 LOG DE VEHÍCULOS Y FOTOS
    if (req.body.datos_vehiculos?.length > 0) {
      console.log(`🚗 [DEBUG] Total vehículos recibidos: ${req.body.datos_vehiculos.length}`);
      
      req.body.datos_vehiculos.forEach((vehiculo, idx) => {
        console.log(`\n🔍 [DEBUG] Vehículo #${idx + 1} - Placa: ${vehiculo.placa || 'N/A'}`);
        console.log(`   📸 foto_url: ${(vehiculo.foto_url || '').substring(0, 100)}`);
        console.log(`   📸 foto_inicio_url: ${(vehiculo.foto_inicio_url || '').substring(0, 100)}`);
        console.log(`   📸 foto_durante_url: ${(vehiculo.foto_durante_url || '').substring(0, 100)}`);
        console.log(`   📸 foto_fin_url: ${(vehiculo.foto_fin_url || '').substring(0, 100)}`);
        console.log(`   ✅ Tiene inicio: ${!!vehiculo.foto_inicio_url}`);
        console.log(`   ✅ Tiene durante: ${!!vehiculo.foto_durante_url}`);
        console.log(`   ✅ Tiene fin: ${!!vehiculo.foto_fin_url}`);
        console.log(`   📋 Motivo: ${vehiculo.motivo || 'N/A'}`);
        console.log(`   📋 Tipo operación: ${vehiculo.tipo_operacion || 'N/A'}`);
      });
    } else {
      console.log('⚠️ [DEBUG] No se recibieron vehículos en datos_vehiculos');
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // ✅ Extraer datos
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

    if (!fecha || !lugar) {
      throw new Error('Faltan campos obligatorios: fecha o lugar');
    }

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
    console.log(`✅ [DB] Registro principal creado con ID: ${registroId}`);

    // ✅ 2. Insertar vehículos
    for (const [idx, vehiculo] of datos_vehiculos.entries()) {
      const nombresJSON = Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) 
        : null;

      // 🔍 LOG 2: ANTES DEL INSERT DE VEHÍCULO
      console.log(`\n🔍 [INSERT] Vehículo #${idx + 1} - Placa: ${vehiculo.placa || 'N/A'}`);
      console.log('   📋 Valores a insertar:', {
        registro_id: registroId,
        placa: vehiculo.placa,
        inicio: vehiculo.inicio,
        fin: vehiculo.fin,
        motivo: vehiculo.motivo,
        tipo_carga: vehiculo.tipo_carga,
        muelle: vehiculo.muelle,
        tipo_operacion: vehiculo.tipo_operacion,
        foto_url: (vehiculo.foto_url || '').substring(0, 60),
        foto_inicio_url: (vehiculo.foto_inicio_url || '').substring(0, 60),
        foto_durante_url: (vehiculo.foto_durante_url || '').substring(0, 60),
        foto_fin_url: (vehiculo.foto_fin_url || '').substring(0, 60),
        tiene_inicio: !!vehiculo.foto_inicio_url,
        tiene_durante: !!vehiculo.foto_durante_url,
        tiene_fin: !!vehiculo.foto_fin_url
      });

      // ✅ INSERT VEHÍCULO
      const [vehResult] = await connection.query(
        `INSERT INTO vehiculos (
          registro_id, inicio, fin, motivo, otro_motivo, tipo_carga, muelle, otro_muelle_num,
          placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, otro_origen, personas, cajas,
          foto_url, foto_inicio_url, foto_durante_url, foto_fin_url, nombres_personal, tipo_operacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          registroId,
          vehiculo.inicio || '', vehiculo.fin || '', vehiculo.motivo || '', vehiculo.otro_motivo || '',
          vehiculo.tipo_carga || '', vehiculo.muelle || '', vehiculo.otro_muelle_num || '',
          vehiculo.placa || '', vehiculo.tipo_vehi || '', vehiculo.otro_tipo || '',
          vehiculo.destino || '', vehiculo.otro_destino || '', vehiculo.origen || '', vehiculo.otro_origen || '',
          vehiculo.personas || '', vehiculo.cajas || '', 
          vehiculo.foto_url || '', 
          vehiculo.foto_inicio_url || '',
          vehiculo.foto_durante_url || '',
          vehiculo.foto_fin_url || '',
          nombresJSON, 
          vehiculo.tipo_operacion || ''
        ]
      );
      
      const vehiculoId = vehResult.insertId;
      
      // ✅ LOG 3: CONFIRMACIÓN DE INSERT
      console.log(`✅ [DB] Vehículo insertado - ID: ${vehiculoId}`);
      console.log(`   📸 URLs guardadas:`, {
        inicio: vehiculo.foto_inicio_url ? '✅' : '❌',
        durante: vehiculo.foto_durante_url ? '✅' : '❌',
        fin: vehiculo.foto_fin_url ? '✅' : '❌'
      });

      // ✅ Insertar justificaciones
      if (Array.isArray(vehiculo.justificaciones) && vehiculo.justificaciones.length > 0) {
        console.log(`   📋 Insertando ${vehiculo.justificaciones.length} justificaciones...`);
        for (const just of vehiculo.justificaciones) {
          await connection.query(
            `INSERT INTO justificaciones (vehiculo_id, registro_id, justificacion, otro_justificacion, tiempo_muerto_inicio, tiempo_muerto_final) VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, just.justificacion || '', just.otro_justificacion || '', just.tiempo_muerto_inicio || '', just.tiempo_muerto_final || '']
          );
        }
      }

      // ✅ Insertar novedades
      if (Array.isArray(vehiculo.novedades) && vehiculo.novedades.length > 0) {
        console.log(`   📋 Insertando ${vehiculo.novedades.length} novedades...`);
        for (const nov of vehiculo.novedades) {
          await connection.query(
            `INSERT INTO novedades (vehiculo_id, registro_id, tipo_novedad, descripcion, foto_url) VALUES (?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, nov.tipo || '', nov.descripcion || '', nov.foto_url || '']
          );
        }
      }

      // ✅ Insertar detalles de inspección
      await connection.query(
        `INSERT INTO detalles_vehiculos (
          vehiculo_id, interior_camion, estado_carpa, olores_extranos, 
          objetos_extranos, evidencias_plagas, estado_suelo, aprobado
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

      // ✅ Insertar productos escaneados
      if (Array.isArray(vehiculo.productos_escaneados) && vehiculo.productos_escaneados.length > 0) {
        console.log(`   📦 Insertando ${vehiculo.productos_escaneados.length} productos...`);
        for (const prod of vehiculo.productos_escaneados) {
          await connection.query(
            `INSERT INTO num_producto (vehiculo_id, registro_id, codigo_producto, referencia, nombre_producto, cantidad_cajas) VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, prod.codigo || '', prod.referencia || '', prod.nombre || '', prod.cantidad || 0]
          );
        }
      }
    }

    // ✅ 3. Insertar paradas de operación
    if (Array.isArray(datos_paradas_operacion) && datos_paradas_operacion.length > 0) {
      console.log(`\n🛑 [INSERT] Insertando ${datos_paradas_operacion.length} paradas de operación...`);
      for (const parada of datos_paradas_operacion) {
        if (parada.inicio || parada.fin || parada.motivo || parada.otro_motivo) {
          await connection.query(
            `INSERT INTO paradas_operacion (registro_id, inicio, fin, motivo, otro_motivo) VALUES (?, ?, ?, ?, ?)`,
            [registroId, parada.inicio || null, parada.fin || null, parada.motivo || null, parada.otro_motivo || null]
          );
        }
      }
    }

    await connection.commit();
    connection.release();

    // ✅ LOG FINAL DE ÉXITO
    console.log(`\n✅ [SUCCESS] === REGISTRO COMPLETADO ===`);
    console.log(`✅ [SUCCESS] ID del registro: ${registroId}`);
    console.log(`✅ [SUCCESS] Vehículos procesados: ${datos_vehiculos.length}`);
    console.log(`✅ [SUCCESS] Timestamp: ${new Date().toISOString()}`);

    res.json({
      success: true,
      message: 'Registro guardado correctamente en MySQL',
      id: registroId
    });

  } catch (error) {
    // ❌ LOG 4: ERROR DETALLADO
    console.error('\n💥 [ERROR] === FALLO EN /api/registro ===');
    console.error('💥 [ERROR] Mensaje:', error.message);
    console.error('💥 [ERROR] Código:', error.code);
    console.error('💥 [ERROR] SQL:', error.sql?.substring(0, 200));
    console.error('💥 [ERROR] Timestamp:', new Date().toISOString());
    
    // 🔍 Log de debug del último vehículo intentado
    if (req.body.datos_vehiculos?.length > 0) {
      console.error('📋 [DEBUG ERROR] Últimos valores de fotos enviados:');
      req.body.datos_vehiculos.slice(-1).forEach((v, i) => {
        console.error(`   Vehículo ${i + 1}:`, {
          placa: v.placa,
          inicio: v.foto_inicio_url?.substring(0, 60),
          durante: v.foto_durante_url?.substring(0, 60),
          fin: v.foto_fin_url?.substring(0, 60),
          tiene_inicio: !!v.foto_inicio_url,
          tiene_durante: !!v.foto_durante_url,
          tiene_fin: !!v.foto_fin_url
        });
      });
    }

    if (connection) {
      await connection.rollback();
      connection.release();
      console.log('🔄 [ERROR] Transacción revertida');
    }

    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ✅ Health check
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

app.listen(port, () => {
  console.log(`✅ Servidor corriendo en puerto ${port}`);
  console.log(`✅ API lista para recibir peticiones en /api/registro`);
});
