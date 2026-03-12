const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== LOGS DE VARIABLES DE ENTORNO =====
console.log('=== VARIABLES DE ENTORNO AL INICIAR ===');
console.log('MYSQLHOST:', process.env.MYSQLHOST ? '✅' : '❌');
console.log('MYSQLPORT:', process.env.MYSQLPORT || '4000');
console.log('MYSQLUSER:', process.env.MYSQLUSER ? '✅' : '❌');
console.log('MYSQLDATABASE:', process.env.MYSQLDATABASE ? '✅' : '❌');
console.log('GMAIL_USER:', process.env.GMAIL_USER ? '✅' : '❌ NO CONFIGURADO');
console.log('GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? '✅' : '❌ NO CONFIGURADO');
console.log('EMAIL_DESTINO:', process.env.EMAIL_DESTINO || '❌ NO CONFIGURADO');
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
    const conn = await pool.getConnection();
    console.log('✅ Conexión a MySQL exitosa');
    conn.release();
  } catch (e) {
    console.error('❌ Error MySQL:', e.message);
  }
})();

// ✅ FUNCIÓN: Enviar email con Gmail + Nodemailer
async function enviarCorreoGmail(data, registroId) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('⚠️ Credenciales de Gmail no configuradas');
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    },
    tls: { rejectUnauthorized: false }
  });

  try {
    await transporter.verify();
    console.log('✅ Conexión SMTP con Gmail verificada');
  } catch (e) {
    console.warn('⚠️ Advertencia SMTP:', e.message);
  }

  // Formatear vehículos
  let vehiculosHTML = '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#001855;color:white"><th style="padding:8px">#</th><th>Motivo</th><th>Muelle</th><th>Placa</th><th>Cajas</th></tr></thead><tbody>';
  
  if (data.datos_vehiculos?.length > 0) {
    data.datos_vehiculos.forEach((v, i) => {
      const muelle = v.muelle === 'otro' ? (v.otro_muelle_num || 'N/A') : (v.muelle || 'N/A');
      vehiculosHTML += `<tr><td style="padding:8px;border:1px solid #ddd">${i+1}</td><td style="padding:8px;border:1px solid #ddd">${v.motivo||'N/A'}</td><td style="padding:8px;border:1px solid #ddd">${muelle}</td><td style="padding:8px;border:1px solid #ddd">${v.placa||'N/A'}</td><td style="padding:8px;border:1px solid #ddd">${v.cajas||'0'}</td></tr>`;
    });
  } else {
    vehiculosHTML += '<tr><td colspan="5" style="padding:15px;text-align:center">Sin vehículos</td></tr>';
  }
  vehiculosHTML += '</tbody></table>';

  const mailOptions = {
    from: `"Pepsico Funza" <${process.env.GMAIL_USER}>`,
    to: process.env.EMAIL_DESTINO || 'lcgs.ramirezalejandra@gmail.com',
    subject: `📋 Registro PepsiCo - ${data.fecha} - Turno ${data.turno}`,
    html: `
      <h2>✅ Registro Guardado Exitosamente</h2>
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
    console.log('📤 Enviando email a:', mailOptions.to);
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email enviado con Gmail:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error Gmail:', error.message);
    return false;
  }
}

// Endpoint POST
app.post('/api/registro', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const {
      fecha, lugar, lider_asignado, coordinador, coordinador_otro,
      lider_pepsico, lider_pepsico_otro, turno, total_personas,
      cajas_totales, respo_diligen, datos_vehiculos = [], datos_paradas_operacion = []
    } = req.body;

    if (!fecha || !lugar) throw new Error('Faltan campos obligatorios');

    const respoLimpio = (respo_diligen || '').replace(/\./g, '');

    const [reg] = await connection.query(
      `INSERT INTO registros (fecha,lugar,lider_asignado,coordinador,coordinador_otro,lider_pepsico,lider_pepsico_otro,turno,total_personas,cajas_totales,respo_diligen) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [fecha, lugar, lider_asignado||'', coordinador||'', coordinador_otro||'', lider_pepsico||'', lider_pepsico_otro||'', turno||'', total_personas||'', cajas_totales||'', respoLimpio]
    );
    const registroId = reg.insertId;

    // Insertar vehículos (simplificado)
    for (const v of datos_vehiculos) {
      const nombresJSON = Array.isArray(v.nombres_personal) && v.nombres_personal.length > 0 ? JSON.stringify(v.nombres_personal) : null;
      const [veh] = await connection.query(
        `INSERT INTO vehiculos (registro_id,inicio,fin,motivo,otro_motivo,tipo_carga,muelle,otro_muelle_num,placa,tipo_vehi,otro_tipo,destino,otro_destino,origen,otro_origen,personas,cajas,foto_url,nombres_personal,tipo_operacion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [registroId, v.inicio||'', v.fin||'', v.motivo||'', v.otro_motivo||'', v.tipo_carga||'', v.muelle||'', v.otro_muelle_num||'', v.placa||'', v.tipo_vehi||'', v.otro_tipo||'', v.destino||'', v.otro_destino||'', v.origen||'', v.otro_origen||'', v.personas||'', v.cajas||'', v.foto_url||'', nombresJSON, v.tipo_operacion||'']
      );
      const vehiculoId = veh.insertId;

      if (Array.isArray(v.justificaciones)) {
        for (const j of v.justificaciones) {
          await connection.query(`INSERT INTO justificaciones (vehiculo_id,registro_id,justificacion,otro_justificacion,tiempo_muerto_inicio,tiempo_muerto_final) VALUES (?,?,?,?,?,?)`, [vehiculoId, registroId, j.justificacion||'', j.otro_justificacion||'', j.tiempo_muerto_inicio||'', j.tiempo_muerto_final||'']);
        }
      }
      if (Array.isArray(v.novedades)) {
        for (const n of v.novedades) {
          await connection.query(`INSERT INTO novedades (vehiculo_id,registro_id,tipo_novedad,descripcion,foto_url) VALUES (?,?,?,?,?)`, [vehiculoId, registroId, n.tipo||'', n.descripcion||'', n.foto_url||'']);
        }
      }
      await connection.query(`INSERT INTO detalles_vehiculos (vehiculo_id,interior_camion,estado_carpa,olores_extraños,objetos_extraños,evidencias_plagas,estado_suelo,aprobado) VALUES (?,?,?,?,?,?,?,?)`, [vehiculoId, v.interior_camion||null, v.estado_carpa||null, v.olores_extranos||null, v.objetos_extranos||null, v.evidencias_plagas||null, v.estado_suelo||null, v.aprobado||null]);
      if (Array.isArray(v.productos_escaneados)) {
        for (const p of v.productos_escaneados) {
          await connection.query(`INSERT INTO num_producto (vehiculo_id,registro_id,codigo_producto,referencia,nombre_producto,cantidad_cajas) VALUES (?,?,?,?,?,?)`, [vehiculoId, registroId, p.codigo||'', p.referencia||'', p.nombre||'', p.cantidad||0]);
        }
      }
    }

    for (const p of datos_paradas_operacion) {
      if (p.inicio || p.fin || p.motivo || p.otro_motivo) {
        await connection.query(`INSERT INTO paradas_operacion (registro_id,inicio,fin,motivo,otro_motivo) VALUES (?,?,?,?,?)`, [registroId, p.inicio||null, p.fin||null, p.motivo||null, p.otro_motivo||null]);
      }
    }

    await connection.commit();
    connection.release();

    // ✅ Enviar email (NO bloqueante)
    enviarCorreoGmail(req.body, registroId).catch(e => console.error('Email error:', e.message));

    res.json({ success: true, message: 'Registro guardado', id: registroId });

  } catch (error) {
    if (connection) { await connection.rollback(); connection.release(); }
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    conn.release();
    res.json({ status: 'ok', message: 'API funcionando' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// Test Gmail
app.get('/test-gmail', async (req, res) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.json({ success: false, message: '❌ Credenciales Gmail no configuradas' });
  }
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 587, secure: false,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    tls: { rejectUnauthorized: false }
  });
  try {
    await transporter.verify();
    res.json({ success: true, message: '✅ Conexión Gmail OK' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message, code: e.code });
  }
});

app.listen(port, () => console.log(`✅ Servidor en puerto ${port}`));
