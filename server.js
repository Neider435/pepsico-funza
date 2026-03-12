const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { Resend } = require('resend'); // ✅ NUEVO
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== LOGS DE VARIABLES =====
console.log('=== VARIABLES DE ENTORNO AL INICIAR ===');
console.log('MYSQLHOST:', process.env.MYSQLHOST ? '✅' : '❌');
console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅' : '❌');
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

// ✅ TEST DE CONEXIÓN
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Conexión a MySQL exitosa');
    conn.release();
  } catch (e) {
    console.error('❌ Error MySQL:', e.message);
  }
})();

// ✅ FUNCIÓN: Enviar email con Resend
async function enviarCorreoResend(data, registroId) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY no configurada');
    return false;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  // Formatear vehículos
  let vehiculosHTML = '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#001855;color:white"><th style="padding:8px">#</th><th>Motivo</th><th>Muelle</th><th>Placa</th><th>Cajas</th></tr></thead><tbody>';
  
  if (data.datos_vehiculos?.length > 0) {
    data.datos_vehiculos.forEach((v, i) => {
      const muelle = v.muelle === 'otro' ? v.otro_muelle_num || 'N/A' : v.muelle || 'N/A';
      vehiculosHTML += `<tr><td style="padding:8px;border:1px solid #ddd">${i+1}</td><td style="padding:8px;border:1px solid #ddd">${v.motivo||'N/A'}</td><td style="padding:8px;border:1px solid #ddd">${muelle}</td><td style="padding:8px;border:1px solid #ddd">${v.placa||'N/A'}</td><td style="padding:8px;border:1px solid #ddd">${v.cajas||'0'}</td></tr>`;
    });
  } else {
    vehiculosHTML += '<tr><td colspan="5" style="padding:15px;text-align:center">Sin vehículos</td></tr>';
  }
  vehiculosHTML += '</tbody></table>';

  const htmlTemplate = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px">
<div style="max-width:800px;margin:0 auto;background:white;border-radius:10px;overflow:hidden">
  <div style="background:#001855;color:white;padding:25px;text-align:center">
    <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcThhtC2IdvEjLP-jZjP8eNii-Vp2ZvND-_XeA&s" style="width:80px;height:80px;border-radius:50%;border:3px solid white">
    <h2 style="margin:10px 0">📋 Registro PepsiCo</h2>
  </div>
  <div style="padding:20px">
    <p><strong>Fecha:</strong> ${data.fecha||'N/A'} | <strong>Turno:</strong> ${data.turno||'N/A'}</p>
    <p><strong>Coordinador:</strong> ${data.coordinador||data.coordinador_otro||'N/A'}</p>
    <p><strong>Total Cajas:</strong> ${data.cajas_totales||'0'}</p>
    <h3 style="color:#C76E00;border-bottom:2px solid #001855">🚛 Vehículos</h3>
    ${vehiculosHTML}
  </div>
  <div style="background:#001855;color:white;padding:15px;text-align:center;font-size:11px">
    Inlotrans S.A.S • ID: ${registroId}
  </div>
</div>
</body></html>`;

  try {
    const {  emailData, error } = await resend.emails.send({
      from: 'Pepsico Funza <onboarding@resend.dev>', // Cambia cuando verifiques tu dominio
      to: [process.env.EMAIL_DESTINO || 'lcgs.ramirezalejandra@gmail.com'],
      subject: `📋 Registro - ${data.fecha} - ${data.turno}`,
      html: htmlTemplate
    });

    if (error) throw error;
    console.log('✅ Email enviado con Resend:', emailData?.id);
    return true;
  } catch (err) {
    console.error('❌ Error Resend:', err.message);
    return false;
  }
}

// ✅ ENDPOINT POST
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

    // Insertar vehículos
    for (const v of datos_vehiculos) {
      const nombresJSON = Array.isArray(v.nombres_personal) && v.nombres_personal.length > 0 ? JSON.stringify(v.nombres_personal) : null;
      
      const [veh] = await connection.query(
        `INSERT INTO vehiculos (registro_id,inicio,fin,motivo,otro_motivo,tipo_carga,muelle,otro_muelle_num,placa,tipo_vehi,otro_tipo,destino,otro_destino,origen,otro_origen,personas,cajas,foto_url,nombres_personal,tipo_operacion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [registroId, v.inicio||'', v.fin||'', v.motivo||'', v.otro_motivo||'', v.tipo_carga||'', v.muelle||'', v.otro_muelle_num||'', v.placa||'', v.tipo_vehi||'', v.otro_tipo||'', v.destino||'', v.otro_destino||'', v.origen||'', v.otro_origen||'', v.personas||'', v.cajas||'', v.foto_url||'', nombresJSON, v.tipo_operacion||'']
      );
      const vehiculoId = veh.insertId;

      // Justificaciones
      if (Array.isArray(v.justificaciones)) {
        for (const j of v.justificaciones) {
          await connection.query(`INSERT INTO justificaciones (vehiculo_id,registro_id,justificacion,otro_justificacion,tiempo_muerto_inicio,tiempo_muerto_final) VALUES (?,?,?,?,?,?)`, [vehiculoId, registroId, j.justificacion||'', j.otro_justificacion||'', j.tiempo_muerto_inicio||'', j.tiempo_muerto_final||'']);
        }
      }

      // Novedades
      if (Array.isArray(v.novedades)) {
        for (const n of v.novedades) {
          await connection.query(`INSERT INTO novedades (vehiculo_id,registro_id,tipo_novedad,descripcion,foto_url) VALUES (?,?,?,?,?)`, [vehiculoId, registroId, n.tipo||'', n.descripcion||'', n.foto_url||'']);
        }
      }

      // Detalles inspección
      await connection.query(`INSERT INTO detalles_vehiculos (vehiculo_id,interior_camion,estado_carpa,olores_extraños,objetos_extraños,evidencias_plagas,estado_suelo,aprobado) VALUES (?,?,?,?,?,?,?,?)`, [vehiculoId, v.interior_camion||null, v.estado_carpa||null, v.olores_extranos||null, v.objetos_extranos||null, v.evidencias_plagas||null, v.estado_suelo||null, v.aprobado||null]);

      // Productos
      if (Array.isArray(v.productos_escaneados)) {
        for (const p of v.productos_escaneados) {
          await connection.query(`INSERT INTO num_producto (vehiculo_id,registro_id,codigo_producto,referencia,nombre_producto,cantidad_cajas) VALUES (?,?,?,?,?,?)`, [vehiculoId, registroId, p.codigo||'', p.referencia||'', p.nombre||'', p.cantidad||0]);
        }
      }
    }

    // Paradas de operación
    for (const p of datos_paradas_operacion) {
      if (p.inicio || p.fin || p.motivo || p.otro_motivo) {
        await connection.query(`INSERT INTO paradas_operacion (registro_id,inicio,fin,motivo,otro_motivo) VALUES (?,?,?,?,?)`, [registroId, p.inicio||null, p.fin||null, p.motivo||null, p.otro_motivo||null]);
      }
    }

    await connection.commit();
    connection.release();

    // ✅ Enviar email (NO bloqueante)
    enviarCorreoResend(req.body, registroId).catch(e => console.error('Email error:', e.message));

    res.json({ success: true, message: 'Registro guardado', id: registroId });

  } catch (error) {
    if (connection) { await connection.rollback(); connection.release(); }
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Health check
app.get('/health', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    conn.release();
    res.json({ status: 'ok', message: 'API funcionando' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ✅ Test Resend
app.get('/test-resend', async (req, res) => {
  if (!process.env.RESEND_API_KEY) return res.json({ success: false, message: 'API key no configurada' });
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: 'Pepsico Funza <onboarding@resend.dev>',
      to: [process.env.EMAIL_DESTINO || 'lcgs.ramirezalejandra@gmail.com'],
      subject: '✅ Test Resend',
      html: '<h1>¡Funciona!</h1><p>Resend está configurado correctamente.</p>'
    });
    if (error) throw error;
    res.json({ success: true, message: '✅ Resend OK' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

app.listen(port, () => console.log(`✅ Servidor en puerto ${port}`));
