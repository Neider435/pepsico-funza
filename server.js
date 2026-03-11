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

// ✅ FUNCIÓN PARA ENVIAR EMAIL CON NODEMAILER + BREVO
async function enviarCorreoNodemailer(data, registroId) {
  const nodemailer = require('nodemailer');
  
  console.log('📧 Intentando enviar correo electrónico a:', process.env.EMAIL_DESTINO);
  
  // Configurar transporter con Brevo
  const transporter = nodemailer.createTransport({
    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.BREVO_SMTP_PORT) || 587,
    secure: false, // false para 587, true para 465
    auth: {
      user: process.env.BREVO_LOGIN,
      pass: process.env.BREVO_PASSWORD
    },
    tls: {
      rejectUnauthorized: false // Para evitar errores de certificado
    },
    connectionTimeout: 10000, // 10 segundos
    socketTimeout: 10000
  });

  // Verificar conexión
  try {
    await transporter.verify();
    console.log('✅ Conexión SMTP verificada exitosamente');
  } catch (error) {
    console.error('❌ Error verificando conexión SMTP:', error.message);
    throw error;
  }

  // Email HTML (usa tu plantilla)
  const mailOptions = {
    from: `"Inlotrans - PepsiCo" <${process.env.BREVO_LOGIN}>`,
    to: process.env.EMAIL_DESTINO,
    subject: `📋 Registro PepsiCo - ${data.fecha} - Turno ${data.turno}`,
    html: `
      <h2>Registro Guardado Exitosamente</h2>
      <p><strong>ID Registro:</strong> ${registroId}</p>
      <p><strong>Fecha:</strong> ${data.fecha}</p>
      <p><strong>Lugar:</strong> ${data.lugar}</p>
      <p><strong>Turno:</strong> ${data.turno}</p>
      <p><strong>Total Vehículos:</strong> ${data.datos_vehiculos ? data.datos_vehiculos.length : 0}</p>
      <p><strong>Total Cajas:</strong> ${data.cajas_totales}</p>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email enviado exitosamente:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error detallado al enviar email:', {
      message: error.message,
      code: error.code,
      command: error.command,
      stack: error.stack
    });
    return false;
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

    // ✅ ENDPOINT DE PRUEBA SMTP
app.get('/test-smtp', async (req, res) => {
  try {
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.BREVO_LOGIN,
        pass: process.env.BREVO_PASSWORD
      }
    });
    
    await transporter.verify();
    res.json({ success: true, message: '✅ Conexión SMTP exitosa' });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: '❌ Error SMTP',
      error: error.message,
      code: error.code
    });
  }
});
    
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
