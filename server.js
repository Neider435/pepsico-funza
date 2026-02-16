const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ===== LOGS DE VARIABLES DE ENTORNO =====
console.log('=== VARIABLES DE ENTORNO AL INICIAR ===');
console.log('HOST:', process.env.MYSQLHOST || '❌ NO DEFINIDO');
console.log('PORT:', process.env.MYSQLPORT || '❌ NO DEFINIDO');
console.log('USER:', process.env.MYSQLUSER || '❌ NO DEFINIDO');
console.log('PASSWORD:', process.env.MYSQLPASSWORD ? '✅ DEFINIDO (oculto)' : '❌ NO DEFINIDO');
console.log('DATABASE:', process.env.MYSQLDATABASE || '❌ NO DEFINIDO');
console.log('GMAIL_USER:', process.env.GMAIL_USER || '❌ NO DEFINIDO');
console.log('EMAIL_TO:', process.env.EMAIL_TO || '❌ NO DEFINIDO');
console.log('=======================================');

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

// ✅ CONFIGURACIÓN DE NODemailer (GMAIL SMTP)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// ✅ FUNCIÓN PARA GENERAR PDF
function generarPDF(datos, registroId) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const filePath = path.join(__dirname, `registro_${registroId}.pdf`);
    const stream = fs.createWriteStream(filePath);
    
    doc.pipe(stream);
    
    // ✅ Encabezado
    doc.fontSize(20).text('REPORTE DE OPERACIÓN - PEPSICO', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Registro ID: ${registroId}`, { align: 'center' });
    doc.text(`Fecha: ${datos.fecha}`, { align: 'center' });
    doc.text(`Lugar: ${datos.lugar}`, { align: 'center' });
    doc.moveDown();
    
    // ✅ Información General
    doc.fontSize(16).text('INFORMACIÓN GENERAL', { underline: true });
    doc.fontSize(11);
    doc.text(`Turno: ${datos.turno}`);
    doc.text(`Líder Asignado: ${datos.lider_asignado}`);
    doc.text(`Coordinador: ${datos.coordinador} ${datos.coordinador_otro ? '(' + datos.coordinador_otro + ')' : ''}`);
    doc.text(`Líder Pepsico: ${datos.lider_pepsico} ${datos.lider_pepsico_otro ? '(' + datos.lider_pepsico_otro + ')' : ''}`);
    doc.text(`Total Personas: ${datos.total_personas}`);
    doc.text(`Total Cajas: ${datos.cajas_totales}`);
    doc.text(`Responsable: ${datos.respo_diligen}`);
    doc.moveDown();
    
    // ✅ Vehículos
    doc.fontSize(16).text('VEHÍCULOS REGISTRADOS', { underline: true });
    doc.fontSize(11);
    
    if (datos.datos_vehiculos && datos.datos_vehiculos.length > 0) {
      datos.datos_vehiculos.forEach((vehiculo, index) => {
        doc.moveDown();
        doc.fontSize(13).text(`Vehículo #${index + 1}`, { underline: true });
        doc.fontSize(11);
        doc.text(`Placa: ${vehiculo.placa}`);
        doc.text(`Tipo: ${vehiculo.tipo_vehi}`);
        doc.text(`Motivo: ${vehiculo.motivo}`);
        doc.text(`Muelle: ${vehiculo.muelle}`);
        doc.text(`Inicio: ${vehiculo.inicio} - Fin: ${vehiculo.fin}`);
        doc.text(`Cajas: ${vehiculo.cajas}`);
        doc.text(`Personas: ${vehiculo.personas}`);
        
        if (vehiculo.destino) doc.text(`Destino: ${vehiculo.destino}`);
        if (vehiculo.origen) doc.text(`Origen: ${vehiculo.origen}`);
        if (vehiculo.tipo_carga) doc.text(`Tipo Carga: ${vehiculo.tipo_carga}`);
        
        // ✅ Justificaciones
        if (vehiculo.justificaciones && vehiculo.justificaciones.length > 0) {
          doc.moveDown();
          doc.fontSize(12).text('Justificaciones:', { underline: true });
          vehiculo.justificaciones.forEach((just, jIndex) => {
            doc.fontSize(11).text(`  ${jIndex + 1}. ${just.justificacion} - ${just.tiempo_muerto_inicio} a ${just.tiempo_muerto_final}`);
            if (just.otro_justificacion) doc.text(`     Detalle: ${just.otro_justificacion}`);
          });
        }
        
        // ✅ Novedades
        if (vehiculo.novedades && vehiculo.novedades.length > 0) {
          doc.moveDown();
          doc.fontSize(12).text('Novedades:', { underline: true });
          vehiculo.novedades.forEach((nov, nIndex) => {
            doc.fontSize(11).text(`  ${nIndex + 1}. ${nov.tipo}: ${nov.descripcion}`);
          });
        }
        
        doc.moveDown();
        doc.text('────────────────────────────────────────', { align: 'center' });
      });
    }
    
    // ✅ Paradas de Operación
    doc.moveDown();
    doc.fontSize(16).text('PARADAS DE OPERACIÓN', { underline: true });
    doc.fontSize(11);
    
    if (datos.datos_paradas_operacion && datos.datos_paradas_operacion.length > 0) {
      datos.datos_paradas_operacion.forEach((parada, index) => {
        doc.text(`${index + 1}. ${parada.motivo} - ${parada.inicio} a ${parada.fin}`);
        if (parada.otro_motivo) doc.text(`   Detalle: ${parada.otro_motivo}`);
      });
    }
    
    // ✅ Pie de página
    doc.moveDown(2);
    doc.fontSize(10).text('Generado automáticamente por Sistema Pepsico Funza', { align: 'center' });
    doc.text(`Fecha de generación: ${new Date().toLocaleString('es-CO')}`, { align: 'center' });
    
    doc.end();
    
    stream.on('finish', () => {
      resolve(filePath);
    });
    
    stream.on('error', (error) => {
      reject(error);
    });
  });
}

// ✅ FUNCIÓN PARA ENVIAR CORREO CON PDF
async function enviarCorreoConPDF(datos, registroId, pdfPath) {
  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: process.env.EMAIL_TO,
    subject: `📋 Reporte de Operación - ${datos.lugar} - ${datos.fecha} (ID: ${registroId})`,
    text: `
Nuevo registro de operación generado:

📍 Lugar: ${datos.lugar}
📅 Fecha: ${datos.fecha}
🔄 Turno: ${datos.turno}
👥 Total Personas: ${datos.total_personas}
📦 Total Cajas: ${datos.cajas_totales}
🚛 Vehículos: ${datos.datos_vehiculos ? datos.datos_vehiculos.length : 0}
🛑 Paradas: ${datos.datos_paradas_operacion ? datos.datos_paradas_operacion.length : 0}

El reporte completo está adjunto en PDF.

────────────────────────────────
Sistema Pepsico Funza
Generado automáticamente
    `,
    attachments: [
      {
        filename: `registro_${registroId}_${datos.fecha}.pdf`,
        path: pdfPath
      }
    ]
  };
  
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Correo enviado:', info.messageId);
    
    // ✅ Eliminar archivo PDF después de enviar
    fs.unlinkSync(pdfPath);
    
    return true;
  } catch (error) {
    console.error('❌ Error al enviar correo:', error.message);
    return false;
  }
}

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
      respo_diligen,
      datos_vehiculos,
      datos_paradas_operacion
    } = req.body;

    // ✅ Obtener respo_diligen y limpiar puntos
    let respo_diligen_limpio = respo_diligen || '';
    respo_diligen_limpio = respo_diligen_limpio.replace(/\./g, '');
    
    const [registroResult] = await connection.query(
      `INSERT INTO registros (
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen_limpio
      ]
    );
    
    const registroId = registroResult.insertId;
    
    // 2. Insertar vehículos Y sus detalles de inspección
    for (let i = 0; i < datos_vehiculos.length; i++) {
      const vehiculo = datos_vehiculos[i];
      
      const nombresJSON = vehiculo.nombres_personal && Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) 
        : null;
      
      console.log('📥 Vehículo recibido:', {
        placa: vehiculo.placa,
        tipo_operacion: vehiculo.tipo_operacion,
        tipo_carga: vehiculo.tipo_carga,
        tiene_justificaciones: vehiculo.hasOwnProperty('justificaciones'),
        tiene_novedades: vehiculo.hasOwnProperty('novedades')
      });

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
      
      // ✅ Insertar justificaciones por vehículo (TABLA SEPARADA)
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
        console.log(`✅ Justificaciones guardadas para Vehículo ${i + 1}:`, vehiculo.justificaciones.length);
      }
      
      // ✅ Insertar novedades por vehículo
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
        console.log(`✅ Novedades guardadas para Vehículo ${i + 1}:`, vehiculo.novedades.length);
      }
      
      // ✅ INSERTAR DETALLES DE INSPECCIÓN
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
      
      // ✅ Insertar productos escaneados por vehículo
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
        console.log(`✅ Productos escaneados guardados para Vehículo ${i + 1}:`, vehiculo.productos_escaneados.length);
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
    
    // ✅ Confirmar transacción
    await connection.commit();
    connection.release();
    
    // ✅ GENERAR PDF Y ENVIAR CORREO (DESPUÉS DE GUARDAR EN BD)
    try {
      console.log('📧 Generando PDF para envío por correo...');
      const pdfPath = await generarPDF(req.body, registroId);
      console.log('✅ PDF generado:', pdfPath);
      
      console.log('📧 Enviando correo a:', process.env.EMAIL_TO);
      const correoEnviado = await enviarCorreoConPDF(req.body, registroId, pdfPath);
      
      if (correoEnviado) {
        console.log('✅ Correo enviado exitosamente');
      } else {
        console.warn('⚠️ Error al enviar correo, pero los datos se guardaron en BD');
      }
    } catch (error) {
      console.error('❌ Error al generar/enviar PDF:', error.message);
      // ✅ No fallar la petición si el correo falla (los datos ya están en BD)
    }

    res.json({
      success: true,
      message: 'Registro guardado correctamente con detalles',
      id: registroId
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
        database: process.env.MYSQLDATABASE || '❌ NO DEFINIDO',
        gmail: process.env.GMAIL_USER ? '✅ Configurado' : '❌ NO DEFINIDO',
        email_to: process.env.EMAIL_TO || '❌ NO DEFINIDO'
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
