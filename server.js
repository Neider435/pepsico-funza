const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// 🔥 IDENTIFICADOR ÚNICO DE BUILD (CAMBIA ESTE VALOR CUANDO ACTUALICES)
const BUILD_ID = 'PEPSICO-BUILD-20260317-V3-FOTOS-FIX';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== LOGS DE INICIO CON BUILD ID =====
console.log(`\n🚀 === INICIANDO SERVIDOR [${BUILD_ID}] ===`);
console.log('🔍 Build ID:', BUILD_ID);
console.log('📅 Timestamp:', new Date().toISOString());
console.log('🗄️  MYSQLHOST:', process.env.MYSQLHOST ? '✅' : '❌');
console.log('🗄️  MYSQLDATABASE:', process.env.MYSQLDATABASE ? '✅' : '❌');
console.log('=======================================\n');

// ===== CONEXIÓN A MYSQL =====
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

(async () => {
  try {
    const conn = await pool.getConnection();
    console.log(`[${BUILD_ID}] ✅ MySQL conectado`);
    conn.release();
  } catch (err) {
    console.error(`[${BUILD_ID}] ❌ Error MySQL:`, err.message);
  }
})();

// 🔥 ENDPOINT CON BUILD ID EN CADA LOG
app.post('/api/registro', async (req, res) => {
  let connection;
  try {
    // 🎯 LOG CON BUILD ID - ¡ESTO CONFIRMA QUE EL CÓDIGO NUEVO ESTÁ ACTIVO!
    console.log(`\n[${BUILD_ID}] 🔍 === NUEVA PETICIÓN /api/registro ===`);
    console.log(`[${BUILD_ID}] 📦 Body keys:`, Object.keys(req.body));
    
    // Debug de vehículos con BUILD ID
    if (req.body.datos_vehiculos?.length > 0) {
      console.log(`[${BUILD_ID}] 🚗 Vehículos recibidos: ${req.body.datos_vehiculos.length}`);
      
      req.body.datos_vehiculos.forEach((v, i) => {
        console.log(`\n[${BUILD_ID}] 📋 Vehículo #${i+1} - Placa: ${v.placa || 'N/A'}`);
        
        // 🔥 LOG CRÍTICO DE FOTOS CON BUILD ID
        console.log(`[${BUILD_ID}] 📸 URLs de fotos RECIBIDAS:`, {
          foto_url: {
            value: (v.foto_url || '').substring(0, 70),
            type: typeof v.foto_url,
            hasValue: !!(v.foto_url && v.foto_url.trim())
          },
          foto_inicio_url: {
            value: (v.foto_inicio_url || '').substring(0, 70),
            type: typeof v.foto_inicio_url,
            hasValue: !!(v.foto_inicio_url && v.foto_inicio_url.trim())
          },
          foto_durante_url: {
            value: (v.foto_durante_url || '').substring(0, 70),
            type: typeof v.foto_durante_url,
            hasValue: !!(v.foto_durante_url && v.foto_durante_url.trim())
          },
          foto_fin_url: {
            value: (v.foto_fin_url || '').substring(0, 70),
            type: typeof v.foto_fin_url,
            hasValue: !!(v.foto_fin_url && v.foto_fin_url.trim())
          }
        });
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // ✅ Extraer datos (CORREGIDO - SIN ESPACIOS)
    const {
      fecha,
      lugar,
      lider_asignado,
      coordinador,
      coordinador_otro,
      lider_pepsico,
      lider_pepsico_otro,
      turno,
      total_personas,  // ✅ CORREGIDO: sin espacio
      cajas_totales,   // ✅ CORREGIDO: sin espacio
      respo_diligen,
      datos_vehiculos = [],
      datos_paradas_operacion = []
    } = req.body;

    if (!fecha || !lugar) {
      throw new Error('Faltan campos obligatorios: fecha o lugar');
    }

    const respoLimpio = (respo_diligen || '').replace(/\./g, '');

    // ✅ 1. Insertar registro principal
    const [regResult] = await connection.query(  // ✅ CORREGIDO: connection.query
      `INSERT INTO registros (
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fecha, lugar, lider_asignado || '', coordinador || '', coordinador_otro || '',
        lider_pepsico || '', lider_pepsico_otro || '', turno || '', 
        total_personas || '', cajas_totales || '', respoLimpio  // ✅ CORREGIDO
      ]
    );

    const registroId = regResult.insertId;
    console.log(`[${BUILD_ID}] ✅ Registro principal creado - ID: ${registroId}`);

    // ✅ 2. Insertar vehículos
    for (const [idx, vehiculo] of datos_vehiculos.entries()) {
      // 🔥 PREPARAR URLs CON TRIM
      const urls = {
        general: (vehiculo.foto_url || '').trim(),
        inicio: (vehiculo.foto_inicio_url || '').trim(),
        durante: (vehiculo.foto_durante_url || '').trim(),
        fin: (vehiculo.foto_fin_url || '').trim()
      };

      console.log(`\n[${BUILD_ID}] 🔗 Insertando vehículo #${idx+1} - Placa: ${vehiculo.placa}`);
      console.log(`[${BUILD_ID}] 📸 URLs que se INSERTARÁN:`, {
        inicio: urls.inicio ? `✅ "${urls.inicio.substring(0,50)}..."` : '❌ VACÍO',
        durante: urls.durante ? `✅ "${urls.durante.substring(0,50)}..."` : '❌ VACÍO',
        fin: urls.fin ? `✅ "${urls.fin.substring(0,50)}..."` : '❌ VACÍO'
      });

      const nombresJSON = Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal)  // ✅ CORREGIDO: && sin espacios
        : null;

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
          urls.general, urls.inicio, urls.durante, urls.fin,  // ✅ URLs con trim
          nombresJSON, 
          vehiculo.tipo_operacion || ''
        ]
      );
      
      const vehiculoId = vehResult.insertId;
      console.log(`[${BUILD_ID}] ✅ Vehículo insertado - ID: ${vehiculoId}`);

      // 🔥 CONFIRMACIÓN: Leer lo que realmente se guardó en DB
      try {
        const [confirm] = await connection.query(
          `SELECT foto_inicio_url, foto_durante_url, foto_fin_url FROM vehiculos WHERE id = ?`,
          [vehiculoId]
        );
        
        if (confirm[0]) {
          console.log(`[${BUILD_ID}] 🔎 [DB CONFIRM] Lo que se GUARDÓ realmente:`, {
            inicio: confirm[0].foto_inicio_url ? `✅ "${confirm[0].foto_inicio_url.substring(0,50)}..."` : '❌ NULL',
            durante: confirm[0].foto_durante_url ? `✅ "${confirm[0].foto_durante_url.substring(0,50)}..."` : '❌ NULL',
            fin: confirm[0].foto_fin_url ? `✅ "${confirm[0].foto_fin_url.substring(0,50)}..."` : '❌ NULL'
          });
        }
      } catch (e) {
        console.warn(`[${BUILD_ID}] ⚠️ No se pudo verificar inserción:`, e.message);
      }

      // Justificaciones
      if (Array.isArray(vehiculo.justificaciones) && vehiculo.justificaciones.length > 0) {  // ✅ CORREGIDO
        for (const just of vehiculo.justificaciones) {
          await connection.query(
            `INSERT INTO justificaciones (vehiculo_id, registro_id, justificacion, otro_justificacion, tiempo_muerto_inicio, tiempo_muerto_final) VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, just.justificacion || '', just.otro_justificacion || '', just.tiempo_muerto_inicio || '', just.tiempo_muerto_final || '']
          );
        }
      }

      // Novedades
      if (Array.isArray(vehiculo.novedades) && vehiculo.novedades.length > 0) {  // ✅ CORREGIDO
        for (const nov of vehiculo.novedades) {
          await connection.query(
            `INSERT INTO novedades (vehiculo_id, registro_id, tipo_novedad, descripcion, foto_url) VALUES (?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, nov.tipo || '', nov.descripcion || '', (nov.foto_url || '').trim()]
          );
        }
      }

      // Detalles
      await connection.query(
        `INSERT INTO detalles_vehiculos (
          vehiculo_id, interior_camion, estado_carpa, olores_extraños, 
          objetos_extranos, evidencias_plagas, estado_suelo, aprobado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vehiculoId,
          vehiculo.interior_camion || null, 
          vehiculo.estado_carpa || null,
          vehiculo.olores_extraños || null,
          vehiculo.objetos_extranos || null,
          vehiculo.evidencias_plagas || null, 
          vehiculo.estado_suelo || null,
          vehiculo.aprobado || null
        ]
      );

      // Productos
      if (Array.isArray(vehiculo.productos_escaneados) && vehiculo.productos_escaneados.length > 0) {  // ✅ CORREGIDO
        for (const prod of vehiculo.productos_escaneados) {
          await connection.query(
            `INSERT INTO num_producto (vehiculo_id, registro_id, codigo_producto, referencia, nombre_producto, cantidad_cajas) VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, prod.codigo || '', prod.referencia || '', prod.nombre || '', prod.cantidad || 0]
          );
        }
      }
    }

    // ✅ 3. Insertar paradas de operación
    if (Array.isArray(datos_paradas_operacion) && datos_paradas_operacion.length > 0) {  // ✅ CORREGIDO
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

    console.log(`[${BUILD_ID}] ✅ === PETICIÓN COMPLETADA ===\n`);
    res.json({
      success: true,
      message: 'Registro guardado correctamente',
      id: registroId,
      build: BUILD_ID  // 🔥 Devuelve el BUILD ID en la respuesta
    });

  } catch (error) {
    console.error(`[${BUILD_ID}] 💥 ERROR FATAL:`, error.message);
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    res.status(500).json({
      success: false,
      error: error.message,
      build: BUILD_ID
    });
  }
});

// Health check con BUILD ID
app.get('/health', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    conn.release();
    res.json({ 
      status: 'ok', 
      build: BUILD_ID,  // 🔥 BUILD ID en health check
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      build: BUILD_ID
    });
  }
});

app.listen(port, () => {
  console.log(`[${BUILD_ID}] 🚀 Servidor corriendo en puerto ${port}`);
  console.log(`[${BUILD_ID}] ✅ API lista en /api/registro\n`);
});
