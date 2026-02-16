const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// ✅ CONFIGURACIÓN CORS CORREGIDA
app.use(cors({
  origin: ['https://pepsico-funza.netlify.app', 'https://pepsico-funza-production-b0f5.up.railway.app', '*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// ===== LOGS DE VARIABLES DE ENTORNO =====
console.log('=== VARIABLES DE ENTORNO AL INICIAR ===');
console.log('HOST:', process.env.MYSQLHOST || '❌ NO DEFINIDO');
console.log('PORT:', process.env.MYSQLPORT || '❌ NO DEFINIDO');
console.log('USER:', process.env.MYSQLUSER || '❌ NO DEFINIDO');
console.log('PASSWORD:', process.env.MYSQLPASSWORD ? '✅ DEFINIDO (oculto)' : '❌ NO DEFINIDO');
console.log('DATABASE:', process.env.MYSQLDATABASE || '❌ NO DEFINIDO');
console.log('=======================================');

// ✅ FUNCIÓN PARA GENERAR PDF
async function generarPDF(datos) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    // Encabezado
    doc.fontSize(20).text('REPORTE DE OPERACIÓN - PEPSICO FUNZA', { align: 'center' });
    doc.moveDown();
    
    // Información general
    doc.fontSize(14).text('INFORMACIÓN GENERAL', { underline: true });
    doc.fontSize(12);
    doc.text(`Fecha: ${datos.fecha}`);
    doc.text(`Lugar: ${datos.lugar}`);
    doc.text(`Turno: ${datos.turno}`);
    doc.text(`Líder Asignado: ${datos.lider_asignado}`);
    doc.text(`Coordinador: ${datos.coordinador}`);
    doc.text(`Líder Pepsico: ${datos.lider_pepsico}`);
    doc.text(`Total Personas: ${datos.total_personas}`);
    doc.text(`Total Cajas: ${datos.cajas_totales}`);
    doc.text(`Responsable: ${datos.respo_diligen}`);
    doc.moveDown();
    
    // Vehículos
    doc.fontSize(14).text('VEHÍCULOS', { underline: true });
    doc.fontSize(12);
    
    datos.datos_vehiculos.forEach((vehiculo, index) => {
      doc.text(`\n--- VEHÍCULO #${index + 1} ---`);
      doc.text(`Placa: ${vehiculo.placa}`);
      doc.text(`Tipo Vehículo: ${vehiculo.tipo_vehi}`);
      doc.text(`Motivo: ${vehiculo.motivo}`);
      doc.text(`Muelle: ${vehiculo.muelle}`);
      doc.text(`Inicio: ${vehiculo.inicio} - Fin: ${vehiculo.fin}`);
      doc.text(`Destino/Origen: ${vehiculo.destino || vehiculo.origen}`);
      doc.text(`Cajas: ${vehiculo.cajas}`);
      doc.text(`Personas: ${vehiculo.personas}`);
      
      if (vehiculo.novedades && vehiculo.novedades.length > 0) {
        doc.text(`Novedades: ${vehiculo.novedades.length}`);
        vehiculo.novedades.forEach(n => {
          doc.text(`  • ${n.tipo}: ${n.descripcion}`);
        });
      }
      
      if (vehiculo.justificaciones && vehiculo.justificaciones.length > 0) {
        doc.text(`Justificaciones: ${vehiculo.justificaciones.length}`);
        vehiculo.justificaciones.forEach(j => {
          doc.text(`  • ${j.justificacion}: ${j.tiempo_muerto_inicio} - ${j.tiempo_muerto_final}`);
        });
      }
    });
    
    doc.moveDown();
    
    // Paradas de operación
    doc.fontSize(14).text('PARADAS DE OPERACIÓN', { underline: true });
    doc.fontSize(12);
    
    datos.datos_paradas_operacion.forEach((parada, index) => {
      doc.text(`\nParada #${index + 1}: ${parada.inicio} - ${parada.fin}`);
      doc.text(`Motivo: ${parada.motivo}`);
      if (parada.otro_motivo) doc.text(`Especificación: ${parada.otro_motivo}`);
    });
    
    doc.moveDown();
    doc.fontSize(10).text(`Generado: ${new Date().toLocaleString()}`, { align: 'right' });
    
    doc.end();
  });
}

// ✅ FUNCIÓN PARA ENVIAR CORREO
async function enviarCorreo(pdfBuffer, datos) {
  const transporter = nodemailer.createTransport({
    host: process.env.OUTLOOK_SMTP || 'smtp-mail.outlook.com',
    port: parseInt(process.env.OUTLOOK_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.OUTLOOK_EMAIL,
      pass: process.env.OUTLOOK_PASSWORD
    }
  });
  
  const fechaFormateada = new Date().toISOString().split('T')[0].replace(/-/g, '_');
  const horaFormateada = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '_');
  const nombreArchivo = `Reporte_Pepsico_${fechaFormateada}_${horaFormateada}.pdf`;
  
  const mailOptions = {
    from: process.env.OUTLOOK_EMAIL,
    to: process.env.EMAIL_DESTINO || 'notificaciones@emmacolombia.com',
    cc: process.env.OUTLOOK_EMAIL,  // ✅ Copia para ti
    subject: `Reporte de Operación - ${datos.fecha} - ${datos.lugar}`,
    text: `Se adjunta el reporte de operación correspondiente a la fecha ${datos.fecha} en ${datos.lugar}.`,
    attachments: [{
      filename: nombreArchivo,
      content: pdfBuffer
    }]
  };
  
  return await transporter.sendMail(mailOptions);
}

// Conexión a MySQL
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});



// Endpoint para recibir datos del formulario
app.post('/api/registro', async (req, res) => {
  let connection;
  
  try {
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
      datos_vehiculos,
      datos_paradas_operacion
    } = req.body;

    // ✅ Obtener respo_diligen y limpiar puntos
    let respo_diligen = req.body.respo_diligen || '';
    respo_diligen = respo_diligen.replace(/\./g, '');
    const [registroResult] = await connection.query(
      `INSERT INTO registros (
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen
      ]
    )
    
    const registroId = registroResult.insertId;
    
    // 2. Insertar vehículos Y sus detalles de inspección
    for (let i = 0; i < datos_vehiculos.length; i++) {
      const vehiculo = datos_vehiculos[i];
      
      const nombresJSON = vehiculo.nombres_personal && Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) 
        : null;
      
      // Insertar vehículo
      // ✅ Depuración: Verificar qué llega al servidor
      console.log('📥 Vehículo recibido:', {
        placa: vehiculo.placa,
        tipo_operacion: vehiculo.tipo_operacion,
        tipo_operacion_tipo: typeof vehiculo.tipo_operacion,
        tiene_tipo_operacion: vehiculo.hasOwnProperty('tipo_operacion')
      });

      const [vehiculoResult] = await connection.query(
        `INSERT INTO vehiculos (
          registro_id, inicio, fin, motivo, otro_motivo, muelle, otro_muelle_num,
          placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, otro_origen, personas, cajas,
          justificacion, otro_justificacion, tiempo_muerto_inicio, tiempo_muerto_final, 
          foto_url, nombres_personal, tipo_operacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          registroId,
          vehiculo.inicio || '',
          vehiculo.fin || '',
          vehiculo.motivo || '',
          vehiculo.otro_motivo || '',
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
          vehiculo.justificacion || '',
          vehiculo.otro_justificacion || '',
          vehiculo.tiempo_muerto_inicio || '',
          vehiculo.tiempo_muerto_final || '',
          vehiculo.foto_url || '',
          nombresJSON,
          vehiculo.tipo_operacion || ''  // ✅ CORREGIDO: valor por defecto
        ]
    );
      
      const vehiculoId = vehiculoResult.insertId;
      // ✅ NUEVO: Insertar novedades por vehículo
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
  }
      
      // ✅ INSERTAR DETALLES DE INSPECCIÓN usando los campos del mismo objeto vehiculo
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
      
      // ✅ NUEVO: Insertar productos escaneados por vehículo (AHORA DENTRO DEL BUCLE)
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
      }
      
    } // <-- CIERRE DEL BUCLE FOR
    
    // 3. Insertar paradas de operación
    for (const parada of datos_paradas_operacion) {
      await connection.query(
        `INSERT INTO paradas_operacion (
          registro_id, inicio, fin, motivo, otro_motivo
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          registroId,
          parada.inicio,
          parada.fin,
          parada.motivo,
          parada.otro_motivo
        ]
      );
    }
    
    await connection.commit();
    connection.release();

    // ✅ GENERAR PDF
    console.log('📄 Generando PDF...');
    const pdfBuffer = await generarPDF(req.body);

    // ✅ ENVIAR CORREO
    console.log('📧 Enviando correo...');
    try {
      const emailResult = await enviarCorreo(pdfBuffer, req.body);
      console.log('✅ Correo enviado:', emailResult.messageId);
    } catch (emailError) {
      console.error('❌ Error al enviar correo:', emailError.message);
      // No fallar la petición si el correo falla
    }

    res.json({
      success: true,
      message: 'Registro guardado correctamente con detalles',
      id: registroId,
      pdf: true,
      email: true
    });

  } catch (error) {
    // Revertir transacción en caso de error
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    
    console.error('Error al guardar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check mejorado
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
  console.log(`Servidor corriendo en puerto ${port}`);
});
