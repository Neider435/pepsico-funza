const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

console.log('🚀 [RENDER] Servidor iniciando...');
console.log('[ENV] MYSQLHOST:', process.env.MYSQLHOST ? '✅' : '❌');
console.log('[ENV] MYSQLUSER:', process.env.MYSQLUSER ? '✅' : '❌');
console.log('[ENV] MYSQLDATABASE:', process.env.MYSQLDATABASE ? '✅' : '❌');

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

(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ [MYSQL] Conexión exitosa');
    conn.release();
  } catch (err) {
    console.error('❌ [MYSQL] Error:', err.message);
  }
})();

app.post('/api/registro', async (req, res) => {
  let connection;
  
  console.log('\n📥 [API] === NUEVA PETICIÓN ===');
  console.log('[API] Timestamp:', new Date().toISOString());
  console.log('[API] Keys recibidas:', Object.keys(req.body).join(', '));
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    console.log('✅ [DB] Transacción iniciada');

    const {
      fecha, lugar, lider_asignado, coordinador, coordinador_otro,
      lider_pepsico, lider_pepsico_otro, turno, total_personas,
      cajas_totales, respo_diligen, datos_vehiculos = [], datos_paradas_operacion = []
    } = req.body;

    console.log('[API] fecha:', fecha);
    console.log('[API] lugar:', lugar);
    console.log('[API] Vehículos recibidos:', datos_vehiculos.length);

    if (!fecha || !lugar) {
      throw new Error('Faltan campos: fecha o lugar');
    }

    const respoLimpio = (respo_diligen || '').replace(/\./g, '');

    // 1. Insertar registro principal
    const [regResult] = await connection.query(
      `INSERT INTO registros (
        fecha, lugar, lider_asignado, coordinador, coordinador_otro,
        lider_pepsico, lider_pepsico_otro, turno, total_personas, cajas_totales, respo_diligen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fecha, lugar, lider_asignado||'', coordinador||'', coordinador_otro||'',
       lider_pepsico||'', lider_pepsico_otro||'', turno||'', total_personas||'', 
       cajas_totales||'', respoLimpio]
    );
    
    const registroId = regResult.insertId;
    console.log('✅ [DB] Registro principal ID:', registroId);

    // 2. Insertar vehículos
    for (let i = 0; i < datos_vehiculos.length; i++) {
      const vehiculo = datos_vehiculos[i];
      console.log(`\n🚗 [VEHÍCULO ${i+1}] Placa:`, vehiculo.placa || 'N/A');
      
      // 🔍 LOG CRÍTICO DE FOTOS
      console.log('📸 [FOTOS] Verificando URLs:');
      console.log('   • foto_url:', vehiculo.foto_url ? '✅' : '❌', (vehiculo.foto_url || '').substring(0, 50));
      console.log('   • foto_inicio_url:', vehiculo.foto_inicio_url ? '✅' : '❌', (vehiculo.foto_inicio_url || '').substring(0, 50));
      console.log('   • foto_durante_url:', vehiculo.foto_durante_url ? '✅' : '❌', (vehiculo.foto_durante_url || '').substring(0, 50));
      console.log('   • foto_fin_url:', vehiculo.foto_fin_url ? '✅' : '❌', (vehiculo.foto_fin_url || '').substring(0, 50));
      
      console.log('🔍 [FOTOS] Booleanos:');
      console.log('   • tiene_inicio:', !!vehiculo.foto_inicio_url);
      console.log('   • tiene_durante:', !!vehiculo.foto_durante_url);
      console.log('   • tiene_fin:', !!vehiculo.foto_fin_url);

      const nombresJSON = Array.isArray(vehiculo.nombres_personal) && vehiculo.nombres_personal.length > 0 
        ? JSON.stringify(vehiculo.nombres_personal) : null;

      const [vehResult] = await connection.query(
        `INSERT INTO vehiculos (
          registro_id, inicio, fin, motivo, otro_motivo, tipo_carga, muelle, otro_muelle_num,
          placa, tipo_vehi, otro_tipo, destino, otro_destino, origen, otro_origen, personas, cajas,
          foto_url, foto_inicio_url, foto_durante_url, foto_fin_url, nombres_personal, tipo_operacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          registroId, vehiculo.inicio||'', vehiculo.fin||'', vehiculo.motivo||'', vehiculo.otro_motivo||'',
          vehiculo.tipo_carga||'', vehiculo.muelle||'', vehiculo.otro_muelle_num||'',
          vehiculo.placa||'', vehiculo.tipo_vehi||'', vehiculo.otro_tipo||'',
          vehiculo.destino||'', vehiculo.otro_destino||'', vehiculo.origen||'', vehiculo.otro_origen||'',
          vehiculo.personas||'', vehiculo.cajas||'', 
          vehiculo.foto_url||'', 
          vehiculo.foto_inicio_url||'',
          vehiculo.foto_durante_url||'',
          vehiculo.foto_fin_url||'',
          nombresJSON, vehiculo.tipo_operacion||''
        ]
      );
      
      console.log('✅ [DB] Vehículo insertado ID:', vehResult.insertId);
      
      // Verificar qué se guardó
      const [check] = await connection.query(
        `SELECT foto_inicio_url, foto_durante_url, foto_fin_url FROM vehiculos WHERE id = ?`,
        [vehResult.insertId]
      );
      
      console.log('🔍 [VERIFICACIÓN DB] Datos guardados:');
      console.log('   • foto_inicio_url:', check[0]?.foto_inicio_url ? '✅ GUARDADA' : '❌ NULL');
      console.log('   • foto_durante_url:', check[0]?.foto_durante_url ? '✅ GUARDADA' : '❌ NULL');
      console.log('   • foto_fin_url:', check[0]?.foto_fin_url ? '✅ GUARDADA' : '❌ NULL');
    }

    // 3. Paradas de operación
    if (Array.isArray(datos_paradas_operacion) && datos_paradas_operacion.length > 0) {
      console.log('[DB] Insertando', datos_paradas_operacion.length, 'paradas...');
      for (const parada of datos_paradas_operacion) {
        await connection.query(
          `INSERT INTO paradas_operacion (registro_id, inicio, fin, motivo, otro_motivo) VALUES (?, ?, ?, ?, ?)`,
          [registroId, parada.inicio||null, parada.fin||null, parada.motivo||null, parada.otro_motivo||null]
        );
      }
    }

    await connection.commit();
    connection.release();
    console.log('✅ [DB] COMMIT exitoso');
    console.log('✅ [API] Registro completado ID:', registroId);
    
    res.json({ success: true, message: 'Guardado correctamente', id: registroId });

  } catch (error) {
    console.error('❌ [ERROR]', error.message);
    console.error('❌ [STACK]', error.stack);
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    conn.release();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log('✅ [RENDER] Servidor en puerto', port);
});
