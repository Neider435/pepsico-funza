const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { Resend } = require('resend'); // ✅ Para envío de emails

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // ✅ Para fotos en base64

// ===== LOGS DE VARIABLES DE ENTORNO =====
console.log('=== VARIABLES DE ENTORNO AL INICIAR ===');
console.log('MYSQLHOST:', process.env.MYSQLHOST ? '✅' : '❌ NO DEFINIDO');
console.log('MYSQLPORT:', process.env.MYSQLPORT || '4000 (default)');
console.log('MYSQLUSER:', process.env.MYSQLUSER ? '✅' : '❌ NO DEFINIDO');
console.log('MYSQLDATABASE:', process.env.MYSQLDATABASE ? '✅' : '❌ NO DEFINIDO');
console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅' : '❌ NO DEFINIDO');
console.log('EMAIL_DESTINO:', process.env.EMAIL_DESTINO || 'No configurado');
console.log('=======================================');

// ===== CONEXIÓN A TIDB CLOUD (MySQL) =====
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 4000, // ⚠️ TiDB usa puerto 4000
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: true // ✅ SSL obligatorio para TiDB
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

// ✅ FUNCIÓN: Formatear vehículos como tabla HTML
function formatearVehiculosHTML(datos_vehiculos) {
  let html = '<table style="width:100%;border-collapse:collapse;margin-top:10px">';
  html += '<thead><tr style="background:#001855;color:white">';
  html += '<th style="padding:10px;border:1px solid #ddd">#</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Motivo</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Muelle</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Placa</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Cajas</th>';
  html += '</tr></thead><tbody>';

  if (datos_vehiculos?.length > 0) {
    datos_vehiculos.forEach((v, i) => {
      const muelle = v.muelle === 'otro' ? (v.otro_muelle_num || 'N/A') : (v.muelle || 'N/A');
      html += `<tr style="background:${i % 2 === 0 ? '#f8f9fa' : 'white'}">`;
      html += `<td style="padding:8px;border:1px solid #ddd;text-align:center">${i + 1}</td>`;
      html += `<td style="padding:8px;border:1px solid #ddd">${v.motivo?.charAt(0).toUpperCase() + (v.motivo?.slice(1) || '') || 'N/A'}</td>`;
      html += `<td style="padding:8px;border:1px solid #ddd;text-align:center">${muelle}</td>`;
      html += `<td style="padding:8px;border:1px solid #ddd;text-align:center">${v.placa || 'N/A'}</td>`;
      html += `<td style="padding:8px;border:1px solid #ddd;text-align:center">${v.cajas || '0'}</td>`;
      html += '</tr>';
    });
  } else {
    html += '<tr><td colspan="5" style="padding:15px;text-align:center;color:#6c757d">Sin vehículos registrados</td></tr>';
  }
  html += '</tbody></table>';
  return html;
}

// ✅ FUNCIÓN: Formatear productos como tabla HTML
function formatearProductosHTML(datos_vehiculos) {
  let html = '<table style="width:100%;border-collapse:collapse;margin-top:10px">';
  html += '<thead><tr style="background:#001855;color:white">';
  html += '<th style="padding:10px;border:1px solid #ddd">#</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Vehículo</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Placa</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Código</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Producto</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Cajas</th>';
  html += '</tr></thead><tbody>';

  let index = 0;
  if (datos_vehiculos?.length > 0) {
    datos_vehiculos.forEach((v, vIdx) => {
      if (v.productos_escaneados?.length > 0) {
        v.productos_escaneados.forEach(prod => {
          index++;
          const bg = index % 2 === 0 ? '#f8f9fa' : 'white';
          html += `<tr style="background:${bg}">`;
          html += `<td style="padding:8px;border:1px solid #ddd;text-align:center">${index}</td>`;
          html += `<td style="padding:8px;border:1px solid #ddd;text-align:center;font-weight:bold;color:#001855">${vIdx + 1}</td>`;
          html += `<td style="padding:8px;border:1px solid #ddd;text-align:center;font-family:monospace">${v.placa || 'N/A'}</td>`;
          html += `<td style="padding:8px;border:1px solid #ddd;font-family:monospace">${prod.codigo || prod.referencia || 'N/A'}</td>`;
          html += `<td style="padding:8px;border:1px solid #ddd">${prod.nombre || 'N/A'}</td>`;
          html += `<td style="padding:8px;border:1px solid #ddd;text-align:center;font-weight:bold;color:#C76E00">${prod.cantidad || 0}</td>`;
          html += '</tr>';
        });
      }
    });
  }
  if (index === 0) {
    html += '<tr><td colspan="6" style="padding:15px;text-align:center;color:#6c757d">Sin productos escaneados</td></tr>';
  }
  html += '</tbody></table>';
  return html;
}

// ✅ FUNCIÓN: Formatear novedades como tabla HTML
function formatearNovedadesHTML(datos_vehiculos) {
  let html = '<table style="width:100%;border-collapse:collapse;margin-top:10px">';
  html += '<thead><tr style="background:#001855;color:white">';
  html += '<th style="padding:10px;border:1px solid #ddd">#</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Vehículo</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Placa</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Tipo</th>';
  html += '<th style="padding:10px;border:1px solid #ddd">Descripción</th>';
  html += '</tr></thead><tbody>';

  let index = 0;
  if (datos_vehiculos?.length > 0) {
    datos_vehiculos.forEach((v, vIdx) => {
      if (v.novedades?.length > 0) {
        v.novedades.forEach(nov => {
          index++;
          const bg = index % 2 === 0 ? '#f8f9fa' : 'white';
          const tipoFmt = nov.tipo?.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'N/A';
          html += `<tr style="background:${bg}">`;
          html += `<td style="padding:8px;border:1px solid #ddd;text-align:center">${index}</td>`;
          html += `<td style="padding:8px;border:1px solid #ddd;text-align:center;font-weight:bold;color:#001855">${vIdx + 1}</td>`;
          html += `<td style="padding:8px;border:1px solid #ddd;text-align:center;font-family:monospace">${v.placa || 'N/A'}</td>`;
          html += `<td style="padding:8px;border:1px solid #ddd;font-weight:bold;color:#C76E00">${tipoFmt}</td>`;
          html += `<td style="padding:8px;border:1px solid #ddd">${nov.descripcion || 'Sin descripción'}</td>`;
          html += '</tr>';
        });
      }
    });
  }
  if (index === 0) {
    html += '<tr><td colspan="5" style="padding:15px;text-align:center;color:#6c757d">Sin novedades registradas</td></tr>';
  }
  html += '</tbody></table>';
  return html;
}

// ✅ FUNCIÓN: Enviar correo con Gmail + Nodemailer
async function enviarCorreoGmail(data, registroId) {
  const nodemailer = require('nodemailer');
  
  // Configurar transporter con Gmail
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  // Formatear vehículos
  let vehiculosHTML = '<table style="width:100%;border-collapse:collapse">';
  vehiculosHTML += '<thead><tr style="background:#001855;color:white"><th style="padding:8px">#</th><th>Motivo</th><th>Muelle</th><th>Placa</th><th>Cajas</th></tr></thead><tbody>';
  
  if (data.datos_vehiculos?.length > 0) {
    data.datos_vehiculos.forEach((v, i) => {
      const muelle = v.muelle === 'otro' ? v.otro_muelle_num || 'N/A' : v.muelle || 'N/A';
      vehiculosHTML += `<tr><td style="padding:8px;border:1px solid #ddd">${i+1}</td><td style="padding:8px;border:1px solid #ddd">${v.motivo||'N/A'}</td><td style="padding:8px;border:1px solid #ddd">${muelle}</td><td style="padding:8px;border:1px solid #ddd">${v.placa||'N/A'}</td><td style="padding:8px;border:1px solid #ddd">${v.cajas||'0'}</td></tr>`;
    });
  } else {
    vehiculosHTML += '<tr><td colspan="5" style="padding:15px;text-align:center">Sin vehículos</td></tr>';
  }
  vehiculosHTML += '</tbody></table>';

  const mailOptions = {
    from: `"Pepsico Funza" <${process.env.GMAIL_USER}>`,
    to: process.env.EMAIL_DESTINO,
    subject: `📋 Registro PepsiCo - ${data.fecha} - Turno ${data.turno}`,
    html: `
      <h2>Registro Guardado Exitosamente</h2>
      <p><strong>ID:</strong> ${registroId}</p>
      <p><strong>Fecha:</strong> ${data.fecha}</p>
      <p><strong>Turno:</strong> ${data.turno}</p>
      <p><strong>Coordinador:</strong> ${data.coordinador || data.coordinador_otro || 'N/A'}</p>
      <p><strong>Total Cajas:</strong> ${data.cajas_totales}</p>
      <h3>Vehículos:</h3>
      ${vehiculosHTML}
      <p style="margin-top:20px;color:#666"><small>Enviado automáticamente - Inlotrans S.A.S</small></p>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email enviado con Gmail:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error al enviar email con Gmail:', error.message);
    return false;
  }
}

// ✅ ENDPOINT: Recibir datos del formulario
app.post('/api/registro', async (req, res) => {
  let connection;
  
  try {
    console.log('📥 Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const {
      fecha, lugar, lider_asignado, coordinador, coordinador_otro,
      lider_pepsico, lider_pepsico_otro, turno, total_personas,
      cajas_totales, respo_diligen, datos_vehiculos = [], datos_paradas_operacion = []
    } = req.body;

    // ✅ Validar campos obligatorios
    if (!fecha || !lugar) {
      throw new Error('Faltan campos obligatorios: fecha o lugar');
    }

    // ✅ Limpiar respo_diligen (quitar puntos)
    const respoLimpio = (respo_diligen || '').replace(/\./g, '');

    // ✅ Insertar registro principal
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

    // ✅ Insertar vehículos y sus datos relacionados
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
      if (Array.isArray(vehiculo.productos_escaneados)) {
        for (const prod of vehiculo.productos_escaneados) {
          await connection.query(
            `INSERT INTO num_producto (vehiculo_id, registro_id, codigo_producto, referencia, nombre_producto, cantidad_cajas) VALUES (?, ?, ?, ?, ?, ?)`,
            [vehiculoId, registroId, prod.codigo || '', prod.referencia || '', prod.nombre || '', prod.cantidad || 0]
          );
        }
      }
    }

    // ✅ Insertar paradas de operación (solo si tienen datos)
    for (const parada of datos_paradas_operacion) {
      if (parada.inicio || parada.fin || parada.motivo || parada.otro_motivo) {
        await connection.query(
          `INSERT INTO paradas_operacion (registro_id, inicio, fin, motivo, otro_motivo) VALUES (?, ?, ?, ?, ?)`,
          [registroId, parada.inicio || null, parada.fin || null, parada.motivo || null, parada.otro_motivo || null]
        );
      }
    }

    // ✅ Confirmar transacción
    await connection.commit();
    connection.release();

    // ✅ Enviar email (NO bloqueante - no falla el registro si el email falla)
    enviarCorreoResend(req.body, registroId).catch(err => {
      console.error('❌ Error en envío de email (ignorado):', err.message);
    });

    res.json({
      success: true,
      message: 'Registro guardado correctamente',
      id: registroId
    });

  } catch (error) {
    console.error('❌ Error al guardar:', error);
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

// ✅ Endpoint de prueba para Resend (eliminar en producción si deseas)
app.get('/test-resend', async (req, res) => {
  if (!process.env.RESEND_API_KEY) {
    return res.json({ success: false, message: '❌ RESEND_API_KEY no configurada' });
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: 'Pepsico Funza <onboarding@resend.dev>',
      to: [process.env.EMAIL_DESTINO || 'lcgs.ramirezalejandra@gmail.com'],
      subject: '✅ Test Resend - Conexión Exitosa',
      html: '<h1>¡Funciona!</h1><p>Resend está configurado correctamente en Render.</p>'
    });
    if (error) throw error;
    res.json({ success: true, message: '✅ Resend OK - Email de prueba enviado' });
  } catch (err) {
    res.status(500).json({ success: false, message: '❌ Error Resend', error: err.message });
  }
});

// ✅ Iniciar servidor
app.listen(port, () => {
  console.log(`✅ Servidor corriendo en puerto ${port}`);
});
