const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
    const c = await pool.getConnection();
    console.log('✅ DB Conectada');
    c.release();
  } catch (e) {
    console.error('❌ Error DB:', e.message);
  }
})();

// 🔥 ENDPOINT CON LOGS FORENSES
app.post('/api/registro', async (req, res) => {
  let connection;
  try {
    console.log('\n🔍 === INICIO PETICIÓN /api/registro ===');
    console.log('📥 Timestamp:', new Date().toISOString());
    
    // 🔍 LOG 1: ¿Qué llegó exactamente?
    console.log('📦 Body recibido (resumen):', {
      tiene_fecha: !!req.body.fecha,
      tiene_lugar: !!req.body.lugar,
      total_vehiculos: req.body.datos_vehiculos?.length || 0
    });

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const {
      fecha, lugar, lider_asignado, coordinador, coordinador_otro,
      lider_pepsico, lider_pepsico_otro, turno, total_personas,
      cajas_totales, respo_diligen, datos_vehiculos = [], datos_paradas_operacion = []
    } = req.body;

    if (!fecha || !lugar) throw new Error('Faltan fecha o lugar');

    // 🔍 LOG 2: Detalle de cada vehículo recibido
    if (datos_vehiculos.length > 0) {
      console.log('\n🚗 === DETALLE VEHÍCULOS RECIBIDOS ===');
      datos_vehiculos.forEach((v, i) => {
        console.log(`\n[VEHÍCULO #${i+1}] Placa: ${v.placa || 'N/A'}`);
        
        // 🔥 LOG CRÍTICO: URLs de fotos con tipo y longitud
        const urls = {
          foto_url: {
            valor: v.foto_url,
            tipo: typeof v.foto_url,
            longitud: v.foto_url?.length || 0,
            tiene_valor: !!(v.foto_url && v.foto_url.trim())
          },
          foto_inicio_url: {
            valor: v.foto_inicio_url,
            tipo: typeof v.foto_inicio_url,
            longitud: v.foto_inicio_url?.length || 0,
            tiene_valor: !!(v.foto_inicio_url && v.foto_inicio_url.trim())
          },
          foto_durante_url: {
            valor: v.foto_durante_url,
            tipo: typeof v.foto_durante_url,
            longitud: v.foto_durante_url?.length || 0,
            tiene_valor: !!(v.foto_durante_url && v.foto_durante_url.trim())
          },
          foto_fin_url: {
            valor: v.foto_fin_url,
            tipo: typeof v.foto_fin_url,
            longitud: v.foto_fin_url?.length || 0,
            tiene_valor: !!(v.foto_fin_url && v.foto_fin_url.trim())
          }
        };
        
        console.log('📸 URLs analizadas:', JSON.stringify(urls, null, 2));
        
        // 🔍 Verificar nombres alternativos (posible causa del problema)
        const posiblesNombres = ['foto_inicio', 'fotoinicio', 'inicio_url', 'fotoInicio'];
        posiblesNombres.forEach(nombre => {
          if (v[nombre]) {
            console.warn(`⚠️ [ALERTA] Encontrado campo alternativo: "${nombre}" = ${v[nombre]}`);
          }
        });
      });
    }

    // 1️⃣ Insertar Registro Principal
    const [regResult] = await connection.query(
      `INSERT INTO registros (fecha, lugar, lider_asignado, coordinador, coordinador_otro, lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fecha, lugar, lider_asignado||'', coordinador||'', coordinador_otro||'', lider_pepsico||'', lider_pepsico_otro||'', turno||'', total_personas||'', cajas_totales||'', (respo_diligen||'').replace(/\./g, '')]
    );
    const registroId = regResult.insertId;
    console.log(`✅ Registro principal creado - ID: ${registroId}`);

    // 2️⃣ Insertar Vehículos CON LOGS DE INSERCIÓN
    for (const [idx, v] of datos_vehiculos.entries()) {
      // 🔥 PREPARAR VALORES CON TRIM Y LOG
      const valoresFotos = {
        foto_url: (v.foto_url || '').trim(),
        foto_inicio_url: (v.foto_inicio_url || '').trim(),
        foto_durante_url: (v.foto_durante_url || '').trim(),
        foto_fin_url: (v.foto_fin_url || '').trim()
      };

      console.log(`\n🔍 [INSERT VEHÍCULO #${idx+1}] Placa: ${v.placa}`);
      console.log('📋 Valores que se van a INSERTAR:', {
        foto_url: valoresFotos.foto_url ? `✅ "${valoresFotos.foto_url.substring(0,50)}..."` : '❌ VACÍO',
        foto_inicio_url: valoresFotos.foto_inicio_url ? `✅ "${valoresFotos.foto_inicio_url.substring(0,50)}..."` : '❌ VACÍO',
        foto_durante_url: valoresFotos.foto_durante_url ? `✅ "${valoresFotos.foto_durante_url.substring(0,50)}..."` : '❌ VACÍO',
        foto_fin_url: valoresFotos.foto_fin_url ? `✅ "${valoresFotos.foto_fin_url.substring(0,50)}..."` : '❌ VACÍO'
      });

      const nombresJSON = (Array.isArray(v.nombres_personal) && v.nombres_personal.length) 
        ? JSON.stringify(v.nombres_personal) : null;

      // 🔥 EJECUTAR INSERT
      const [vRes] = await connection.query(
        `INSERT INTO vehiculos (registro_id, inicio, fin, motivo, otro_motivo, tipo_carga, muelle, otro_muelle_num, placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, otro_origen, personas, cajas, foto_url, foto_inicio_url, foto_durante_url, foto_fin_url, nombres_personal, tipo_operacion) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          registroId, v.inicio||'', v.fin||'', v.motivo||'', v.otro_motivo||'',
          v.tipo_carga||'', v.muelle||'', v.otro_muelle_num||'', v.placa||'', v.tipo_vehi||'', v.otro_tipo||'',
          v.destino||'', v.otro_destino||'', v.origen||'', v.otro_origen||'', v.personas||'', v.cajas||'',
          valoresFotos.foto_url, valoresFotos.foto_inicio_url, valoresFotos.foto_durante_url, valoresFotos.foto_fin_url, 
          nombresJSON, v.tipo_operacion||''
        ]
      );
      
      const vehiculoId = vRes.insertId;
      console.log(`✅ Vehículo insertado - ID: ${vehiculoId}`);

      // 🔥 LOG 3: VERIFICAR LO QUE SE GUARDÓ (Query de confirmación)
      try {
        const [confirm] = await connection.query(
          `SELECT foto_url, foto_inicio_url, foto_durante_url, foto_fin_url FROM vehiculos WHERE id = ?`,
          [vehiculoId]
        );
        
        if (confirm[0]) {
          console.log('🔎 [CONFIRMACIÓN DB] Lo que realmente se guardó:', {
            foto_url: confirm[0].foto_url ? `✅ "${confirm[0].foto_url.substring(0,50)}..."` : '❌ NULL/VACÍO',
            foto_inicio_url: confirm[0].foto_inicio_url ? `✅ "${confirm[0].foto_inicio_url.substring(0,50)}..."` : '❌ NULL/VACÍO',
            foto_durante_url: confirm[0].foto_durante_url ? `✅ "${confirm[0].foto_durante_url.substring(0,50)}..."` : '❌ NULL/VACÍO',
            foto_fin_url: confirm[0].foto_fin_url ? `✅ "${confirm[0].foto_fin_url.substring(0,50)}..."` : '❌ NULL/VACÍO'
          });
        }
      } catch (err) {
        console.warn('⚠️ No se pudo verificar la inserción:', err.message);
      }

      // ... (resto de inserciones: justificaciones, novedades, etc. sin cambios)
      if (Array.isArray(v.justificaciones)) {
        for (const j of v.justificaciones) {
          await connection.query(`INSERT INTO justificaciones (vehiculo_id, registro_id, justificacion, otro_justificacion, tiempo_muerto_inicio, tiempo_muerto_final) VALUES (?, ?, ?, ?, ?, ?)`, [vehiculoId, registroId, j.justificacion||'', j.otro_justificacion||'', j.tiempo_muerto_inicio||'', j.tiempo_muerto_final||'']);
        }
      }
      if (Array.isArray(v.novedades)) {
        for (const n of v.novedades) {
          await connection.query(`INSERT INTO novedades (vehiculo_id, registro_id, tipo_novedad, descripcion, foto_url) VALUES (?, ?, ?, ?, ?)`, [vehiculoId, registroId, n.tipo||'', n.descripcion||'', (n.foto_url||'').trim()]);
        }
      }
      await connection.query(`INSERT INTO detalles_vehiculos (vehiculo_id, interior_camion, estado_carpa, olores_extranos, objetos_extranos, evidencias_plagas, estado_suelo, aprobado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [vehiculoId, v.interior_camion||null, v.estado_carpa||null, v.olores_extranos||null, v.objetos_extranos||null, v.evidencias_plagas||null, v.estado_suelo||null, v.aprobado||null]);
      if (Array.isArray(v.productos_escaneados)) {
        for (const p of v.productos_escaneados) {
          await connection.query(`INSERT INTO num_producto (vehiculo_id, registro_id, codigo_producto, referencia, nombre_producto, cantidad_cajas) VALUES (?, ?, ?, ?, ?, ?)`, [vehiculoId, registroId, p.codigo||'', p.referencia||'', p.nombre||'', p.cantidad||0]);
        }
      }
    }

    // 3️⃣ Paradas de operación
    if (Array.isArray(datos_paradas_operacion)) {
      for (const p of datos_paradas_operacion) {
        if(p.inicio || p.fin || p.motivo) {
          await connection.query(`INSERT INTO paradas_operacion (registro_id, inicio, fin, motivo, otro_motivo) VALUES (?, ?, ?, ?, ?)`, [registroId, p.inicio||null, p.fin||null, p.motivo||null, p.otro_motivo||null]);
        }
      }
    }

    await connection.commit();
    connection.release();
    
    console.log('✅ === PETICIÓN COMPLETADA EXITOSAMENTE ===\n');
    res.json({ success: true, id: registroId, message: 'Guardado exitoso' });

  } catch (error) {
    console.error('💥 === ERROR FATAL ===');
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);
    if (connection) { await connection.rollback(); connection.release(); }
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    const c = await pool.getConnection(); c.release();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (e) { res.status(500).json({ status: 'error', error: e.message }); }
});

app.listen(port, () => console.log(`🚀 Server on port ${port}`));
