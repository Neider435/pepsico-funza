const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const nodemailer = require('nodemailer'); // ✅ CAMBIO: Usar Nodemailer en lugar de Resend

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===== LOGS DE VARIABLES DE ENTORNO =====
console.log('=== VARIABLES DE ENTORNO AL INICIAR ===');
console.log('MYSQLHOST:', process.env.MYSQLHOST ? '✅' : '❌ NO DEFINIDO');
console.log('MYSQLPORT:', process.env.MYSQLPORT || '4000 (default)');
console.log('MYSQLUSER:', process.env.MYSQLUSER ? '✅' : '❌ NO DEFINIDO');
console.log('MYSQLDATABASE:', process.env.MYSQLDATABASE ? '✅' : '❌ NO DEFINIDO');
console.log('GMAIL_USER:', process.env.GMAIL_USER ? '✅' : '❌ NO DEFINIDO');
console.log('GMAIL_APP_PASSWORD:', process.env.GMAIL_APP_PASSWORD ? '✅' : '❌ NO DEFINIDO');
console.log('EMAIL_DESTINO:', process.env.EMAIL_DESTINO || 'No configurado');
console.log('=======================================');

// ... (la conexión a MySQL se mantiene igual) ...

// ✅ FUNCIÓN: Enviar email con Gmail + Nodemailer
async function enviarCorreoGmail(data, registroId) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('⚠️ Credenciales de Gmail no configuradas - email no enviado');
    return false;
  }

  // ✅ Configurar transporter con Gmail
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // false para 587, true para 465
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  // Verificar conexión
  try {
    await transporter.verify();
    console.log('✅ Conexión SMTP con Gmail verificada');
  } catch (verifyError) {
    console.warn('⚠️ Advertencia al verificar SMTP:', verifyError.message);
  }

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

  const mailOptions = {
    from: `"Pepsico Funza" <${process.env.GMAIL_USER}>`,
    to: process.env.EMAIL_DESTINO || 'lcgs.ramirezalejandra@gmail.com',
    subject: `📋 Registro PepsiCo - ${data.fecha} - Turno ${data.turno}`,
    html: htmlTemplate
  };

  try {
    console.log('📤 Enviando email a:', mailOptions.to);
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email enviado exitosamente con Gmail. Message ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error al enviar email con Gmail:', {
      message: error.message,
      code: error.code,
      command: error.command
    });
    return false;
  }
}

// ✅ ENDPOINT: Recibir datos del formulario
app.post('/api/registro', async (req, res) => {
  // ... (todo el código de inserción en BD se mantiene igual) ...

    // ✅ Confirmar transacción
    await connection.commit();
    connection.release();

    // ✅ CAMBIO: Enviar email con Gmail en lugar de Resend
    enviarCorreoGmail(req.body, registroId).catch(err => {
      console.error('❌ Error en envío de email (ignorado):', err.message);
    });

    res.json({
      success: true,
      message: 'Registro guardado correctamente',
      id: registroId
    });

  // ... (el resto del catch se mantiene igual) ...
});

// ✅ Health check endpoint
app.get('/health', async (req, res) => {
  // ... (se mantiene igual) ...
});

// ✅ Endpoint de prueba para Gmail (reemplaza el de Resend)
app.get('/test-gmail', async (req, res) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.json({ 
      success: false, 
      message: '❌ Credenciales de Gmail no configuradas' 
    });
  }

  const nodemailer = require('nodemailer');
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
    res.json({ 
      success: true, 
      message: '✅ Conexión Gmail OK - SMTP verificado correctamente' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: '❌ Error Gmail',
      error: error.message,
      code: error.code
    });
  }
});

// ✅ Iniciar servidor
app.listen(port, () => {
  console.log(`✅ Servidor corriendo en puerto ${port}`);
});
