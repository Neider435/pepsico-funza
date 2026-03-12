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

// ✅ FUNCIÓN: Enviar email con Resend (API REST - compatible con Render)
async function enviarCorreoResend(data, registroId) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY no configurada - email no enviado');
    return false;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const htmlTemplate = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;background:#f4f4f4;margin:0;padding:20px">
  <div style="max-width:800px;margin:0 auto;background:white;border-radius:10px;overflow:hidden;box-shadow:0 0 20px rgba(0,0,0,0.1)">
    
    <!-- HEADER -->
    <div style="background:#001855;color:white;padding:25px;text-align:center">
      <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcThhtC2IdvEjLP-jZjP8eNii-Vp2ZvND-_XeA&s" alt="Logo" style="width:80px;height:80px;border-radius:50%;border:3px solid white;margin-bottom:10px">
      <h2 style="margin:10px 0 5px;font-size:22px;color:white">📋 Nuevo Registro - PepsiCo</h2>
      <p style="margin:0;font-size:13px;opacity:0.9;color:#e0e0e0">Sistema de Control de Operaciones</p>
    </div>

    <!-- INFORMACIÓN -->
    <div style="margin:20px;padding:20px;border:1px solid #ddd;border-radius:8px;background:#fff">
      <h3 style="color:#C76E00;font-weight:bold;font-size:1.2em;border-bottom:3px solid #001855;padding-bottom:10px;margin:0 0 15px 0">📌 INFORMACIÓN DE REGISTRO</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:15px;background:#f8f9fa;border-radius:5px;border-left:4px solid #001855;width:33%">
            <div style="font-size:0.85em;color:#6c757d;margin-bottom:5px">Fecha</div>
            <div style="font-weight:bold;color:#001855;font-size:1.1em">${data.fecha || 'N/A'}</div>
          </td>
          <td style="padding:15px;background:#f8f9fa;border-radius:5px;border-left:4px solid #001855;width:33%">
            <div style="font-size:0.85em;color:#6c757d;margin-bottom:5px">Coordinador</div>
            <div style="font-weight:bold;color:#001855;font-size:1.1em">${data.coordinador || data.coordinador_otro || 'N/A'}</div>
          </td>
          <td style="padding:15px;background:#f8f9fa;border-radius:5px;border-left:4px solid #001855;width:33%">
            <div style="font-size:0.85em;color:#6c757d;margin-bottom:5px">Turno</div>
            <div style="font-weight:bold;color:#001855;font-size:1.1em">${data.turno || 'N/A'}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- VEHÍCULOS -->
    <div style="margin:20px;padding:20px;border:1px solid #ddd;border-radius:8px;background:#fff">
      <h3 style="color:#C76E00;font-weight:bold;font-size:1.2em;border-bottom:3px solid #001855;padding-bottom:10px;margin:0 0 15px 0">🚛 VEHÍCULOS REGISTRADOS</h3>
      ${formatearVehiculosHTML(data.datos_vehiculos)}
    </div>

    <!-- PRODUCTOS -->
    <div style="margin:20px;padding:20px;border:1px solid #ddd;border-radius:8px;background:#fff">
      <h3 style="color:#C76E00;font-weight:bold;font-size:1.2em;border-bottom:3px solid #001855;padding-bottom:10px;margin:0 0 15px 0">📦 PRODUCTOS ESCANEADOS</h3>
      ${formatearProductosHTML(data.datos_vehiculos)}
    </div>

    <!-- NOVEDADES -->
    <div style="margin:20px;padding:20px;border:1px solid #ddd;border-radius:8px;background:#fff">
      <h3 style="color:#C76E00;font-weight:bold;font-size:1.2em;border-bottom:3px solid #001855;padding-bottom:10px;margin:0 0 15px 0">⚠️ NOVEDADES</h3>
      ${formatearNovedadesHTML(data.datos_vehiculos)}
    </div>

    <!-- FOOTER -->
    <div style="background:#001855;color:white;padding:25px;text-align:center;border-radius:0 0 10px 10px">
      <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcThhtC2IdvEjLP-jZjP8eNii-Vp2ZvND-_XeA&s" alt="Logo" style="width:60px;height:60px;border-radius:50%;border:2px solid white;margin-bottom:10px;opacity:0.9">
      <p style="margin:10px 0 5px;font-size:14px;font-weight:bold;color:white">Inlotrans S.A.S</p>
      <p style="margin:5px 0;font-size:12px;opacity:0.8;color:#e0e0e0">Sistema de Control de Operaciones - PepsiCo</p>
      <p style="margin:15px 0 5px;font-size:11px;opacity:0.6;color:#b0b0b0">Enviado automáticamente</p>
      <div style="margin-top:15px;padding-top:15px;border-top:1px solid rgba(255,255,255,0.2);font-size:11px;opacity:0.6;color:#b0b0b0">
        <p style="margin:0">Este correo fue generado automáticamente por el sistema de registro</p>
        <p style="margin:5px 0 0 0">© 2026 Inlotrans S.A.S - Todos los derechos reservados</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    const { data: emailData, error } = await resend.emails.send({
      from: 'Pepsico Funza <onboarding@resend.dev>', // Cambia cuando verifiques tu dominio
      to: [process.env.EMAIL_DESTINO || 'lcgs.ramirezalejandra@gmail.com'],
      subject: `📋 Registro PepsiCo - ${data.fecha} - Turno ${data.turno}`,
      html: htmlTemplate
    });

    if (error) {
      console.error('❌ Error Resend:', error);
      return false;
    }

    console.log('✅ Email enviado con Resend:', emailData?.id);
    return true;
  } catch (err) {
    console.error('❌ Error al enviar email:', err.message);
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
