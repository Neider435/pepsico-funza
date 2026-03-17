// ✅ ENDPOINT: Recibir y guardar datos del formulario
app.post('/api/registro', async (req, res) => {
  let connection;
  
  try {
    console.log(`[${BUILD_ID}] 🔍 === NUEVA PETICIÓN /api/registro ===`);
    console.log(`[${BUILD_ID}] 📦 Body keys:`, Object.keys(req.body));
    
    // Debug de vehículos
    if (req.body.datos_vehiculos?.length > 0) {
      console.log(`[${BUILD_ID}] 🚗 Vehículos recibidos: ${req.body.datos_vehiculos.length}`);
      
      req.body.datos_vehiculos.forEach((v, i) => {
        console.log(`\n[${BUILD_ID}] 📋 Vehículo #${i+1} - Placa: ${v.placa || 'N/A'}`);
        
        // 🔥 LOG CRÍTICO DE FOTOS
        console.log(`[${BUILD_ID}] 📸 URLs de fotos RECIBIDAS:`, {
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

    const {
      fecha, lugar, lider_asignado, coordinador, coordinador_otro,
      lider_pepsico, lider_pepsico_otro, turno, total_personas,
      cajas_totales, respo_diligen, datos_vehiculos = [],
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
    console.log(`[${BUILD_ID}] ✅ Registro principal creado - ID: ${registroId}`);

    // ✅ 2. Insertar vehículos (SIN foto_url)
    for (const vehiculo of datos_vehiculos) {
      const nombresJSON = Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) 
        : null;

      // 🔥 LOG ANTES DE INSERTAR
      console.log(`[${BUILD_ID}] 🔗 Insertando vehículo #${datos_vehiculos.indexOf(vehiculo)+1} - Placa: ${vehiculo.placa}`);
      console.log(`[${BUILD_ID}] 📸 URLs que se INSERTARÁN:`, {
        inicio: vehiculo.foto_inicio_url ? `✅ "${vehiculo.foto_inicio_url.substring(0,50)}..."` : '❌ VACÍO',
        durante: vehiculo.foto_durante_url ? `✅ "${vehiculo.foto_durante_url.substring(0,50)}..."` : '❌ VACÍO',
        fin: vehiculo.foto_fin_url ? `✅ "${vehiculo.foto_fin_url.substring(0,50)}..."` : '❌ VACÍO'
      });

      // ✅ INSERT CORREGIDO (SIN foto_url)
      const [vehResult] = await connection.query(
        `INSERT INTO vehiculos (
          registro_id, inicio, fin, motivo, otro_motivo, tipo_carga, muelle, otro_muelle_num,
          placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, otro_origen, personas, cajas,
          foto_inicio_url, foto_durante_url, foto_fin_url, nombres_personal, tipo_operacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          registroId,
          vehiculo.inicio || '', vehiculo.fin || '', vehiculo.motivo || '', vehiculo.otro_motivo || '',
          vehiculo.tipo_carga || '', vehiculo.muelle || '', vehiculo.otro_muelle_num || '',
          vehiculo.placa || '', vehiculo.tipo_vehi || '', vehiculo.otro_tipo || '',
          vehiculo.destino || '', vehiculo.otro_destino || '', vehiculo.origen || '', vehiculo.otro_origen || '',
          vehiculo.personas || '', vehiculo.cajas || '', 
          // ✅ SOLO LAS 3 FOTOS (foto_url eliminado)
          vehiculo.foto_inicio_url || '',
          vehiculo.foto_durante_url || '',
          vehiculo.foto_fin_url || '',
          nombresJSON, 
          vehiculo.tipo_operacion || ''
        ]
      );
      
      const vehiculoId = vehResult.insertId;
      console.log(`[${BUILD_ID}] ✅ Vehículo insertado - ID: ${vehiculoId}`);

      // 🔥 CONFIRMACIÓN: Leer lo que se guardó
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
      if (Array.isArray(vehiculo.justificaciones) && vehiculo.justificaciones.length > 0) {
        for (const just of vehiculo.justificaciones) {
          await connection.query(
            `INSERT INTO justificaciones (vehiculo_id, registro_id, justificacion, otro_justificacion, tiempo_muerto_inicio, tiempo_muerto_final) VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, just.justificacion || '', just.otro_justificacion || '', just.tiempo_muerto_inicio || '', just.tiempo_muerto_final || '']
          );
        }
        console.log(`[${BUILD_ID}] ✅ Justificaciones guardadas: ${vehiculo.justificaciones.length}`);
      }

      // Novedades
      if (Array.isArray(vehiculo.novedades) && vehiculo.novedades.length > 0) {
        for (const nov of vehiculo.novedades) {
          await connection.query(
            `INSERT INTO novedades (vehiculo_id, registro_id, tipo_novedad, descripcion, foto_url) VALUES (?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, nov.tipo || '', nov.descripcion || '', nov.foto_url || '']
          );
        }
        console.log(`[${BUILD_ID}] ✅ Novedades guardadas: ${vehiculo.novedades.length}`);
      }

      // Detalles de inspección
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

      // Productos escaneados
      if (Array.isArray(vehiculo.productos_escaneados) && vehiculo.productos_escaneados.length > 0) {
        for (const prod of vehiculo.productos_escaneados) {
          await connection.query(
            `INSERT INTO num_producto (vehiculo_id, registro_id, codigo_producto, referencia, nombre_producto, cantidad_cajas) VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, prod.codigo || '', prod.referencia || '', prod.nombre || '', prod.cantidad || 0]
          );
        }
        console.log(`[${BUILD_ID}] ✅ Productos escaneados: ${vehiculo.productos_escaneados.length}`);
      }
    }

    // ✅ 3. Insertar paradas de operación
    if (Array.isArray(datos_paradas_operacion) && datos_paradas_operacion.length > 0) {
      for (const parada of datos_paradas_operacion) {
        if (parada.inicio || parada.fin || parada.motivo || parada.otro_motivo) {
          await connection.query(
            `INSERT INTO paradas_operacion (registro_id, inicio, fin, motivo, otro_motivo) VALUES (?, ?, ?, ?, ?)`,
            [registroId, parada.inicio || null, parada.fin || null, parada.motivo || null, parada.otro_motivo || null]
          );
        }
      }
      console.log(`[${BUILD_ID}] ✅ Paradas de operación guardadas`);
    }

    await connection.commit();
    connection.release();

    console.log(`[${BUILD_ID}] ✅ === PETICIÓN COMPLETADA ===\n`);
    res.json({
      success: true,
      message: 'Registro guardado correctamente',
      id: registroId,
      build: BUILD_ID
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
