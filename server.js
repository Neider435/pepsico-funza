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

// ✅ FUNCIÓN: Enviar correo con Nodemailer + Brevo
async function enviarCorreoNodemailer(data, registroId) {
  const nodemailer = require('nodemailer');
  
  // ✅ CONFIGURACIÓN CORREGIDA PARA BREVO
  const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 465,  // ✅ Cambiar a 465 (SSL) en lugar de 587
    secure: true,  // ✅ true para puerto 465
    auth: {
      user: process.env.BREVO_LOGIN,
      pass: process.env.BREVO_PASSWORD
    },
    // ✅ Agregar configuración TLS para evitar timeout
    tls: {
      rejectUnauthorized: false  // ✅ Permite conexión en entornos cloud
    },
    // ✅ Timeouts más largos para Render free tier
    connectionTimeout: 10000,  // 10 segundos
    socketTimeout: 10000
  });

  // Formatear vehículos como tabla HTML
  let vehiculosHTML = `
    <table style="width:100%; border-collapse:collapse; margin-top:10px;">
      <thead>
        <tr style="background:#001855; color:white;">
          <th style="padding:10px; border:1px solid #ddd;">#</th>
          <th style="padding:10px; border:1px solid #ddd;">Motivo</th>
          <th style="padding:10px; border:1px solid #ddd;">Muelle</th>
          <th style="padding:10px; border:1px solid #ddd;">Placa</th>
          <th style="padding:10px; border:1px solid #ddd;">Destino</th>
          <th style="padding:10px; border:1px solid #ddd;">Cajas</th>
          <th style="padding:10px; border:1px solid #ddd;">Tipo Vehículo</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (data.datos_vehiculos && data.datos_vehiculos.length > 0) {
    data.datos_vehiculos.forEach((v, index) => {
      const muelle = v.muelle === 'otro' ? (v.otro_muelle_num || 'N/A') : (v.muelle || 'N/A');
      const destino = v.destino || v.origen || 'N/A';
      const cajas = v.cajas || v.total_cajas_escaneadas || '0';
      const tipoVehiculo = v.tipo_vehi || 'N/A';
      const motivo = v.motivo ? v.motivo.charAt(0).toUpperCase() + v.motivo.slice(1) : 'N/A';
      
      vehiculosHTML += `
        <tr style="background:${index % 2 === 0 ? '#f8f9fa' : 'white'};">
          <td style="padding:8px; border:1px solid #ddd; text-align:center;">${index + 1}</td>
          <td style="padding:8px; border:1px solid #ddd;">${motivo}</td>
          <td style="padding:8px; border:1px solid #ddd; text-align:center;">${muelle}</td>
          <td style="padding:8px; border:1px solid #ddd; text-align:center;">${v.placa || 'N/A'}</td>
          <td style="padding:8px; border:1px solid #ddd;">${destino}</td>
          <td style="padding:8px; border:1px solid #ddd; text-align:center;">${cajas}</td>
          <td style="padding:8px; border:1px solid #ddd;">${tipoVehiculo}</td>
        </tr>
      `;
    });
  } else {
    vehiculosHTML += '<tr><td colspan="7" style="padding:15px; text-align:center; color:#6c757d;">No hay vehículos registrados</td></tr>';
  }

  vehiculosHTML += '</tbody></table>';

  // Formatear productos
  let productosHTML = `
    <table style="width:100%; border-collapse:collapse; margin-top:10px;">
      <thead>
        <tr style="background:#001855; color:white;">
          <th style="padding:10px; border:1px solid #ddd;">#</th>
          <th style="padding:10px; border:1px solid #ddd;">Vehículo</th>
          <th style="padding:10px; border:1px solid #ddd;">Placa</th>
          <th style="padding:10px; border:1px solid #ddd;">Código</th>
          <th style="padding:10px; border:1px solid #ddd;">Nombre Producto</th>
          <th style="padding:10px; border:1px solid #ddd;">Cantidad Cajas</th>
        </tr>
      </thead>
      <tbody>
  `;

  let productoIndex = 0;
  if (data.datos_vehiculos && data.datos_vehiculos.length > 0) {
    data.datos_vehiculos.forEach((v, vIndex) => {
      if (v.productos_escaneados && v.productos_escaneados.length > 0) {
        v.productos_escaneados.forEach((prod) => {
          productoIndex++;
          productosHTML += `
            <tr style="background:${productoIndex % 2 === 0 ? '#f8f9fa' : 'white'};">
              <td style="padding:8px; border:1px solid #ddd; text-align:center;">${productoIndex}</td>
              <td style="padding:8px; border:1px solid #ddd; text-align:center; font-weight:bold; color:#001855;">${vIndex + 1}</td>
              <td style="padding:8px; border:1px solid #ddd; text-align:center; font-family:monospace;">${v.placa || 'N/A'}</td>
              <td style="padding:8px; border:1px solid #ddd; font-family:monospace;">${prod.codigo || prod.referencia || 'N/A'}</td>
              <td style="padding:8px; border:1px solid #ddd;">${prod.nombre || 'N/A'}</td>
              <td style="padding:8px; border:1px solid #ddd; text-align:center; font-weight:bold; color:#C76E00;">${prod.cantidad || '0'}</td>
            </tr>
          `;
        });
      }
    });
  }

  if (productoIndex === 0) {
    productosHTML += '<tr><td colspan="6" style="padding:15px; text-align:center; color:#6c757d;">No hay productos escaneados</td></tr>';
  }

  productosHTML += '</tbody></table>';

  // Formatear novedades
  let novedadesHTML = `
    <table style="width:100%; border-collapse:collapse; margin-top:10px;">
      <thead>
        <tr style="background:#001855; color:white;">
          <th style="padding:10px; border:1px solid #ddd;">#</th>
          <th style="padding:10px; border:1px solid #ddd;">Vehículo</th>
          <th style="padding:10px; border:1px solid #ddd;">Placa</th>
          <th style="padding:10px; border:1px solid #ddd;">Tipo Novedad</th>
          <th style="padding:10px; border:1px solid #ddd;">Descripción</th>
        </tr>
      </thead>
      <tbody>
  `;

  let novedadIndex = 0;
  if (data.datos_vehiculos && data.datos_vehiculos.length > 0) {
    data.datos_vehiculos.forEach((v, vIndex) => {
      if (v.novedades && v.novedades.length > 0) {
        v.novedades.forEach((nov) => {
          novedadIndex++;
          const tipoFormateado = nov.tipo ? nov.tipo.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'N/A';
          
          novedadesHTML += `
            <tr style="background:${novedadIndex % 2 === 0 ? '#f8f9fa' : 'white'};">
              <td style="padding:8px; border:1px solid #ddd; text-align:center;">${novedadIndex}</td>
              <td style="padding:8px; border:1px solid #ddd; text-align:center; font-weight:bold; color:#001855;">${vIndex + 1}</td>
              <td style="padding:8px; border:1px solid #ddd; text-align:center; font-family:monospace;">${v.placa || 'N/A'}</td>
              <td style="padding:8px; border:1px solid #ddd; font-weight:bold; color:#C76E00;">${tipoFormateado}</td>
              <td style="padding:8px; border:1px solid #ddd;">${nov.descripcion || 'Sin descripción'}</td>
            </tr>
          `;
        });
      }
    });
  }

  if (novedadIndex === 0) {
    novedadesHTML += '<tr><td colspan="5" style="padding:15px; text-align:center; color:#6c757d;">No hay novedades registradas</td></tr>';
  }

  novedadesHTML += '</tbody></table>';

  // ✅ PLANTILLA HTML COMPLETA
  const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 20px;">
  <div style="max-width: 800px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1);">
    
    <!-- ✅ HEADER CON FONDO AZUL SÓLIDO -->
    <div style="background-color: #001855; color: white; padding: 25px; text-align: center; border-radius: 12px 12px 0 0;">
      <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcThhtC2IdvEjLP-jZjP8eNii-Vp2ZvND-_XeA&s" alt="Logo Inlotrans" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid white; margin-bottom: 10px;">
      <h2 style="margin: 10px 0 5px 0; font-size: 22px; color: white;">📋 Nuevo Registro - PepsiCo</h2>
      <p style="margin: 0; font-size: 13px; opacity: 0.9; color: #e0e0e0;">Sistema de Control de Operaciones</p>
    </div>

    <!-- ✅ INFORMACIÓN DE REGISTRO -->
    <div style="margin: 20px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #ffffff;">
      <h3 style="color: #C76E00; font-weight: bold; font-size: 1.2em; border-bottom: 3px solid #001855; padding-bottom: 10px; margin-bottom: 15px; margin-top: 0;">📌 INFORMACIÓN DE REGISTRO</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 15px; background: #f8f9fa; border-radius: 5px; border-left: 4px solid #001855; width: 33%;">
            <div style="font-size: 0.85em; color: #6c757d; margin-bottom: 5px;">Fecha</div>
            <div style="font-weight: bold; color: #001855; font-size: 1.1em;">${data.fecha || 'N/A'}</div>
          </td>
          <td style="padding: 15px; background: #f8f9fa; border-radius: 5px; border-left: 4px solid #001855; width: 33%;">
            <div style="font-size: 0.85em; color: #6c757d; margin-bottom: 5px;">Coordinador</div>
            <div style="font-weight: bold; color: #001855; font-size: 1.1em;">${data.coordinador || data.coordinador_otro || 'N/A'}</div>
          </td>
          <td style="padding: 15px; background: #f8f9fa; border-radius: 5px; border-left: 4px solid #001855; width: 33%;">
            <div style="font-size: 0.85em; color: #6c757d; margin-bottom: 5px;">Turno</div>
            <div style="font-weight: bold; color: #001855; font-size: 1.1em;">${data.turno || 'N/A'}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- ✅ VEHÍCULOS REGISTRADOS -->
    <div style="margin: 20px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #ffffff;">
      <h3 style="color: #C76E00; font-weight: bold; font-size: 1.2em; border-bottom: 3px solid #001855; padding-bottom: 10px; margin-bottom: 15px; margin-top: 0;">🚛 VEHÍCULOS REGISTRADOS</h3>
      ${vehiculosHTML}
    </div>

    <!-- ✅ PRODUCTOS ESCANEADOS -->
    <div style="margin: 20px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #ffffff;">
      <h3 style="color: #C76E00; font-weight: bold; font-size: 1.2em; border-bottom: 3px solid #001855; padding-bottom: 10px; margin-bottom: 15px; margin-top: 0;">📦 PRODUCTOS ESCANEADOS</h3>
      ${productosHTML}
    </div>

    <!-- ✅ NOVEDADES -->
    <div style="margin: 20px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #ffffff;">
      <h3 style="color: #C76E00; font-weight: bold; font-size: 1.2em; border-bottom: 3px solid #001855; padding-bottom: 10px; margin-bottom: 15px; margin-top: 0;">⚠️ NOVEDADES</h3>
      ${novedadesHTML}
    </div>

    <!-- ✅ FOOTER CON FONDO AZUL -->
    <div style="background-color: #001855; color: white; padding: 25px; text-align: center; border-radius: 0 0 12px 12px;">
      <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcThhtC2IdvEjLP-jZjP8eNii-Vp2ZvND-_XeA&s" alt="Logo Inlotrans" style="width: 60px; height: 60px; border-radius: 50%; border: 2px solid white; margin-bottom: 10px; opacity: 0.9;">
      <p style="margin: 10px 0 5px 0; font-size: 14px; font-weight: bold; color: white;">Inlotrans S.A.S</p>
      <p style="margin: 5px 0; font-size: 12px; opacity: 0.8; color: #e0e0e0;">Sistema de Control de Operaciones - PepsiCo</p>
      <p style="margin: 15px 0 5px 0; font-size: 11px; opacity: 0.6; color: #b0b0b0;">Enviado automáticamente</p>
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 11px; opacity: 0.6; color: #b0b0b0;">
        <p style="margin: 0;">Este correo fue generado automáticamente por el sistema de registro</p>
        <p style="margin: 5px 0 0 0;">© 2026 Inlotrans S.A.S - Todos los derechos reservados</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  // Email options
  const mailOptions = {
    from: `"Inlotrans - PepsiCo" <${process.env.BREVO_LOGIN}>`,
    to: process.env.EMAIL_DESTINO || 'destinatario@ejemplo.com',
    subject: `📋 Registro PepsiCo - ${data.fecha} - Turno ${data.turno}`,
    html: htmlTemplate
  };

  try {
    console.log('📧 Intentando enviar email a:', mailOptions.to);
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email enviado exitosamente:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error detallado al enviar email:', {
      message: error.message,
      code: error.code,
      command: error.command
    });
    return false;  // ✅ No fallar todo el registro si el email falla
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

    // ✅ ENVIAR CORREO CON NODEMAILER
    const emailEnviado = await enviarCorreoNodemailer(req.body, registroId);

    res.json({
      success: true,
      message: 'Registro guardado correctamente',
      id: registroId,
      emailEnviado: emailEnviado
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

app.listen(port, () => {
  console.log(`✅ Servidor corriendo en puerto ${port}`);
});
