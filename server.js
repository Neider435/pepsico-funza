const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;
const nodemailer = require('nodemailer');

app.use(cors());
app.use(express.json({ limit: '50mb' })); // ✅ Aumenta límite para fotos en base64

// ===== LOGS DE VARIABLES DE ENTORNO =====
console.log('=== VARIABLES DE ENTORNO AL INICIAR ===');
console.log('HOST:', process.env.MYSQLHOST || '❌ NO DEFINIDO');
console.log('PORT:', process.env.MYSQLPORT || '❌ NO DEFINIDO');
console.log('USER:', process.env.MYSQLUSER || '❌ NO DEFINIDO');
console.log('PASSWORD:', process.env.MYSQLPASSWORD ? '✅ DEFINIDO (oculto)' : '❌ NO DEFINIDO');
console.log('DATABASE:', process.env.MYSQLDATABASE || '❌ NO DEFINIDO');
console.log('=======================================');

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 4000,  // ⚠️ TiDB usa puerto 4000
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: true
  }
});

// ✅ TEST DE CONEXIÓN AL INICIAR
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conexión a MySQL exitosa');
    connection.release();
  } catch (error) {
    console.error('❌ Error de conexión a MySQL:', error.message);
  }
})();

// ✅ FUNCIÓN: Enviar correo con Nodemailer + Brevo (CORREGIDA)
async function enviarCorreoBrevo(data, registroId) {
  const nodemailer = require('nodemailer');
  
  console.log('📧 Preparando envío de email con Brevo...');
  
  // ✅ CONFIGURACIÓN SMTP OPTIMIZADA PARA BREVO + RENDER
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,              // ✅ Puerto STARTTLS
    secure: false,          // ✅ false para puerto 587
    auth: {
      user: process.env.BREVO_LOGIN,
      pass: process.env.BREVO_PASSWORD
    },
    tls: {
      rejectUnauthorized: false,  // ✅ Evita errores de certificado en Render
      minVersion: 'TLSv1.2'
    },
    // ✅ Timeouts extendidos para Render Free Tier
    connectionTimeout: 15000,
    socketTimeout: 15000,
    greetingTimeout: 10000
  });

  // ✅ Verificar conexión SMTP antes de enviar
  try {
    await transporter.verify();
    console.log('✅ Conexión SMTP con Brevo verificada');
  } catch (verifyError) {
    console.warn('⚠️ Advertencia al verificar SMTP:', verifyError.message);
    // Continuamos, puede ser un falso positivo en Render
  }

  // ✅ FORMATEAR DATOS PARA EL EMAIL (tu plantilla profesional)
  // Vehículos
  let vehiculosHTML = '<table style="width:100%; border-collapse:collapse; margin-top:10px;">';
  vehiculosHTML += '<thead><tr style="background:#001855; color:white;">';
  vehiculosHTML += '<th style="padding:10px; border:1px solid #ddd;">#</th>';
  vehiculosHTML += '<th style="padding:10px; border:1px solid #ddd;">Motivo</th>';
  vehiculosHTML += '<th style="padding:10px; border:1px solid #ddd;">Muelle</th>';
  vehiculosHTML += '<th style="padding:10px; border:1px solid #ddd;">Placa</th>';
  vehiculosHTML += '<th style="padding:10px; border:1px solid #ddd;">Cajas</th>';
  vehiculosHTML += '</tr></thead><tbody>';

  if (data.datos_vehiculos?.length > 0) {
    data.datos_vehiculos.forEach((v, i) => {
      const muelle = v.muelle === 'otro' ? v.otro_muelle_num || 'N/A' : v.muelle || 'N/A';
      vehiculosHTML += `<tr style="background:${i%2===0?'#f8f9fa':'white'};">`;
      vehiculosHTML += `<td style="padding:8px; border:1px solid #ddd;">${i+1}</td>`;
      vehiculosHTML += `<td style="padding:8px; border:1px solid #ddd;">${v.motivo||'N/A'}</td>`;
      vehiculosHTML += `<td style="padding:8px; border:1px solid #ddd;">${muelle}</td>`;
      vehiculosHTML += `<td style="padding:8px; border:1px solid #ddd;">${v.placa||'N/A'}</td>`;
      vehiculosHTML += `<td style="padding:8px; border:1px solid #ddd;">${v.cajas||'0'}</td>`;
      vehiculosHTML += '</tr>';
    });
  } else {
    vehiculosHTML += '<tr><td colspan="5" style="padding:15px; text-align:center;">Sin vehículos</td></tr>';
  }
  vehiculosHTML += '</tbody></table>';

  // ✅ PLANTILLA HTML COMPLETA (tu diseño profesional)
  const htmlTemplate = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif; line-height:1.6; color:#333; background:#f4f4f4; margin:0; padding:20px;">
  <div style="max-width:800px; margin:0 auto; background:white; border-radius:10px; overflow:hidden; box-shadow:0 0 20px rgba(0,0,0,0.1);">
    
    <!-- HEADER -->
    <div style="background:#001855; color:white; padding:25px; text-align:center;">
      <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcThhtC2IdvEjLP-jZjP8eNii-Vp2ZvND-_XeA&s" 
           alt="Logo" style="width:80px; height:80px; border-radius:50%; border:3px solid white;">
      <h2 style="margin:10px 0 5px;">📋 Nuevo Registro - PepsiCo</h2>
      <p style="margin:0; font-size:13px; opacity:0.9;">Sistema de Control de Operaciones</p>
    </div>

    <!-- INFORMACIÓN -->
    <div style="margin:20px; padding:20px; border:1px solid #ddd; border-radius:8px;">
      <h3 style="color:#C76E00; border-bottom:3px solid #001855; padding-bottom:10px;">📌 INFORMACIÓN</h3>
      <table style="width:100%;">
        <tr>
          <td style="padding:10px; background:#f8f9fa;"><strong>Fecha:</strong><br>${data.fecha||'N/A'}</td>
          <td style="padding:10px; background:#f8f9fa;"><strong>Coordinador:</strong><br>${data.coordinador||data.coordinador_otro||'N/A'}</td>
          <td style="padding:10px; background:#f8f9fa;"><strong>Turno:</strong><br>${data.turno||'N/A'}</td>
        </tr>
      </table>
    </div>

    <!-- VEHÍCULOS -->
    <div style="margin:20px; padding:20px; border:1px solid #ddd; border-radius:8px;">
      <h3 style="color:#C76E00; border-bottom:3px solid #001855; padding-bottom:10px;">🚛 VEHÍCULOS</h3>
      ${vehiculosHTML}
    </div>

    <!-- FOOTER -->
    <div style="background:#001855; color:white; padding:25px; text-align:center;">
      <p style="margin:0;">Inlotrans S.A.S - Sistema de Control</p>
      <p style="margin:5px 0; font-size:11px; opacity:0.7;">Enviado automáticamente • ID: ${registroId}</p>
    </div>
  </div>
</body>
</html>`;

  // ✅ ENVIAR EMAIL
  const mailOptions = {
    from: `"Pepsico Funza" <${process.env.BREVO_LOGIN}>`,
    to: process.env.EMAIL_DESTINO || 'lcgs.ramirezalejandra@gmail.com',
    subject: `📋 Registro PepsiCo - ${data.fecha} - Turno ${data.turno}`,
    html: htmlTemplate
  };

  try {
    console.log('📤 Enviando email a:', mailOptions.to);
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email enviado exitosamente. Message ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error al enviar email con Brevo:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    });
    return false; // ✅ No fallar el registro si el email falla
  }
}

// Endpoint para recibir datos del formulario
app.post('/api/registro', async (req, res) => {
  let connection;
  
  try {
    console.log('📥 Datos recibidos:', JSON.stringify(req.body, null, 2));
    
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

    // ✅ VALIDAR DATOS BÁSICOS
    if (!fecha || !lugar) {
      throw new Error('Faltan campos obligatorios: fecha o lugar');
    }

    // ✅ Obtener respo_diligen y limpiar puntos
    let respo_diligen_limpio = respo_diligen || '';
    respo_diligen_limpio = respo_diligen_limpio.replace(/\./g, '');
    
    const [registroResult] = await connection.query(
      `INSERT INTO registros (
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fecha, lugar, lider_asignado || '', coordinador || '', coordinador_otro || '',
        lider_pepsico || '', lider_pepsico_otro || '', turno || '', total_personas || '', cajas_totales || '', respo_diligen_limpio
      ]
    );
    
    const registroId = registroResult.insertId;
    console.log('✅ Registro principal creado con ID:', registroId);
    
    // 2. Insertar vehículos Y sus detalles de inspección
    for (let i = 0; i < datos_vehiculos.length; i++) {
      const vehiculo = datos_vehiculos[i];
      
      console.log(`🚗 Procesando vehículo ${i + 1}:`, {
        placa: vehiculo.placa,
        motivo: vehiculo.motivo,
        tiene_justificaciones: Array.isArray(vehiculo.justificaciones),
        tiene_novedades: Array.isArray(vehiculo.novedades)
      });
      
      const nombresJSON = vehiculo.nombres_personal && Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) 
        : null;

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
      console.log(`✅ Vehículo ${i + 1} creado con ID:`, vehiculoId);
      
      // ✅ Insertar justificaciones
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
        console.log(`✅ Justificaciones guardadas:`, vehiculo.justificaciones.length);
      }
      
      // ✅ Insertar novedades
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
        console.log(`✅ Novedades guardadas:`, vehiculo.novedades.length);
      }
      
      // ✅ Insertar detalles de inspección
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
      
      // ✅ Insertar productos escaneados
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
        console.log(`✅ Productos escaneados:`, vehiculo.productos_escaneados.length);
      }
    }
    
    // 3. Insertar paradas de operación
    if (datos_paradas_operacion && Array.isArray(datos_paradas_operacion)) {
      let paradasGuardadas = 0;
      
      for (const parada of datos_paradas_operacion) {
        // ✅ VALIDAR: Solo guardar si al menos un campo tiene valor
        if (parada.inicio || parada.fin || parada.motivo || parada.otro_motivo) {
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
          paradasGuardadas++;
        }
      }
      
      if (paradasGuardadas > 0) {
        console.log(`✅ Paradas de operación guardadas: ${paradasGuardadas}`);
      } else {
        console.log(`ℹ️ No se guardaron paradas de operación (sin datos)`);
      }
    }
    
    // Confirmar transacción
    await connection.commit();
    connection.release();

    // ✅ ENVIAR CORREO CON BREVO (NO BLOQUEANTE)
    enviarCorreoBrevo(req.body, registroId)
      .then(enviado => {
        console.log('📧 Resultado email:', enviado ? '✅ Enviado' : '⚠️ No enviado');
      })
      .catch(err => {
        console.error('❌ Error en envío de email (ignorado):', err.message);
      });

    // ✅ RESPONDER INMEDIATAMENTE
    res.json({
      success: true,
      message: 'Registro guardado correctamente',
      id: registroId,
      emailStatus: 'processing'
    })

  } catch (error) {
    console.error('❌ Error al guardar:', error);
    
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Health check
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

// ✅ AGREGA AQUÍ EL ENDPOINT DE PRUEBA BREVO:
app.get('/test-brevo', async (req, res) => {
  const nodemailer = require('nodemailer');
  
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.BREVO_LOGIN,
      pass: process.env.BREVO_PASSWORD
    },
    tls: { rejectUnauthorized: false }
  });

  try {
    await transporter.verify();
    res.json({ success: true, message: '✅ Conexión Brevo OK' });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: '❌ Error Brevo',
      error: error.message,
      code: error.code
    });
  }
});

app.listen(port, () => {
  console.log(`✅ Servidor corriendo en puerto ${port}`);
});

app.listen(port, () => {
  console.log(`✅ Servidor corriendo en puerto ${port}`);
});
