function enviarFormulario(event) {
  event.preventDefault();
  
  // ✅ PASO 1: Hacer visibles los campos de motivo ANTES de validar
  mostrarCamposMotivo();
  
  // ✅ PASO 2: Sincronizar datos del DOM a vehiculosData
  sincronizarVehiculosDesdeDOM();
  
  // ✅ PASO 3: Debug - Verificar qué valores se capturaron
  console.log('🔍 Debug motivos antes de validar:');
  vehiculosData.forEach((v, i) => {
    console.log(`Vehículo ${i + 1}:`, {
      motivo: v.motivo,
      motivo_trim: v.motivo?.trim(),
      motivo_empty: !v.motivo || v.motivo.trim() === ''
    });
  });
  
  // ✅ PASO 4: Validar motivo de cada vehículo
  for (let i = 0; i < vehiculosData.length; i++) {
    const vehiculo = vehiculosData[i];
    
    if (!vehiculo.motivo || vehiculo.motivo.trim() === '') {
      alert(`❌ Error: El Vehículo #${i + 1} no tiene motivo seleccionado.\n\nPor favor, seleccione: Cargue, Descargue u Otro.`);
      
      const motivoSelect = document.getElementById(`motivo-cargue-descargue-${i}`);
      if (motivoSelect) {
        const container = motivoSelect.closest('.registro-vehiculo');
        if (container) {
          container.scrollIntoView({ behavior: 'smooth', block: 'center' });
          motivoSelect.focus();
          motivoSelect.style.borderColor = '#dc3545';
          motivoSelect.style.boxShadow = '0 0 0 2px rgba(220, 53, 69, 0.25)';
        }
      }
      return;
    }
  }
  
  // ✅ PASO 5: Validar inspección de vehículos
  let inspeccionCompleta = true;
  let vehiculoConInspeccionPendiente = -1;
  
  for (let i = 0; i < vehiculosData.length; i++) {
    const vehiculo = vehiculosData[i];
    
    if (!vehiculo.interior_camion || 
        !vehiculo.estado_carpa || 
        !vehiculo.olores_extranos || 
        !vehiculo.objetos_extranos || 
        !vehiculo.evidencias_plagas || 
        !vehiculo.estado_suelo || 
        !vehiculo.aprobado) {
      
      inspeccionCompleta = false;
      vehiculoConInspeccionPendiente = i;
      break;
    }
  }
  
  if (!inspeccionCompleta) {
    alert(`❌ Error: La inspección del Vehículo #${vehiculoConInspeccionPendiente + 1} está incompleta.\n\nPor favor, complete todos los campos de inspección antes de enviar.`);
    abrirInspeccionVehiculo(vehiculoConInspeccionPendiente);
    return;
  }
  
  console.log('📊 Vehículos con nombres del personal:');
  vehiculosData.forEach((vehiculo, index) => {
    console.log(`Vehículo ${index}:`, {
      placa: vehiculo.placa,
      personas: vehiculo.personas,
      nombres: vehiculo.nombres_personal,
      motivo: vehiculo.motivo,
      justificaciones: vehiculo.justificaciones
    });
  });
  
  // ✅ PASO 6: Validar campos obligatorios del formulario principal
  const camposObligatorios = [
    { id: 'lugar', nombre: 'Lugar de operación' },
    { id: 'lider_pepsico', nombre: 'Líder De Pepsico' },
    { id: 'fecha', nombre: 'Fecha' },
    { id: 'turno', nombre: 'Turno' },
    { id: 'total_personas', nombre: 'Total Personas En El Turno' },
    { id: 'cajas_totales', nombre: 'Total Cajas Movidas' }
  ];
  
  for (const campo of camposObligatorios) {
    const el = document.getElementById(campo.id);
    if (el && !el.value.trim()) {
      alert(`❌ Por favor, complete el campo: "${campo.nombre}".`);
      return;
    }
  }
  
  // ✅ PASO 7: Validar nombres por vehículo
  for (let i = 0; i < vehiculosData.length; i++) {
    const vehiculo = vehiculosData[i];
    const totalPersonasVeh = parseInt(vehiculo.personas) || 0;
    if (totalPersonasVeh > 0) {
      const nombresContainer = document.querySelector(`#nombres-personal-${i}`);
      if (nombresContainer) {
        const inputsNombres = nombresContainer.querySelectorAll('input[type="text"]');
        for (let j = 0; j < inputsNombres.length; j++) {
          if (!inputsNombres[j].value.trim()) {
            alert(`❌ Por favor, ingrese el nombre del trabajador ${j + 1} del Vehículo #${i + 1}.`);
            inputsNombres[j].focus();
            return;
          }
        }
      }
    }
  }
  
  // ✅ PASO 8: Validar placas y solapamientos
  if (!validarPlacas()) return;
  if (!validarSolapamientoVehiculos() || !validarSolapamientoParadas()) return;
  
  // ✅ PASO 9: Sincronizar productos escaneados con vehiculosData
  sincronizarVehiculosDesdeDOM();
  for (let i = 0; i < vehiculosData.length; i++) {
    if (productosEscaneadosPorVehiculo[i]) {
      const productosArray = Object.entries(productosEscaneadosPorVehiculo[i].productos).map(([codigo, prod]) => ({
        codigo: codigo,
        referencia: prod.referencia,
        nombre: prod.nombre,
        cantidad: prod.cantidad
      }));
      
      vehiculosData[i].productos_escaneados = productosArray;
      vehiculosData[i].total_cajas_escaneadas = productosEscaneadosPorVehiculo[i].totalCajas;
    }
  }
  
  // ✅ PASO 10: Preparar datos para enviar (CORREGIDO)
  const formData = {
    fecha: document.getElementById('fecha').value,
    lugar: document.getElementById('lugar').value,
    lider_asignado: document.getElementById('lider').value.toUpperCase(),
    coordinador: document.getElementById('coordinador').value,
    coordinador_otro: document.getElementById('coordinador_otro').value,
    lider_pepsico: document.getElementById('lider_pepsico').value,
    lider_pepsico_otro: document.getElementById('lider_pepsico_otro').value,
    turno: document.getElementById('turno').value,
    total_personas: document.getElementById('total_personas').value,
    cajas_totales: document.getElementById('cajas_totales').value,
    respo_diligen: document.getElementById('responsable').value,
    datos_vehiculos: vehiculosData.map((v, i) => {
      // ✅ Verificar que tipo_operacion tenga valor
      if (v.tipo_operacion === undefined) {
        console.warn(`⚠️ Vehículo ${i}: tipo_operacion es undefined, corrigiendo a ""`);
        v.tipo_operacion = '';
      }
      // ✅ Incluir novedades
      v.novedades = v.novedades || [];
      // ✅ Incluir justificaciones
      v.justificaciones = v.justificaciones || [];
      // ✅ Incluir tipo_carga
      v.tipo_carga = v.tipo_carga || '';
      return v;
    }),
    datos_paradas_operacion: Array.from(
      document.querySelectorAll('#operacion-contenedor .parada-group')
    ).map(grupo => {
      return {
        inicio: grupo.querySelector(`input[name^="parada_inicio_operacion_"]`)?.value || '',
        fin: grupo.querySelector(`input[name^="parada_fin_operacion_"]`)?.value || '',
        motivo: grupo.querySelector(`select[name^="parada_motivo_operacion_"]`)?.value || '',
        otro_motivo: grupo.querySelector(`input[name^="parada_otro_motivo_operacion_"]`)?.value || ''
      };
    })
  };
  
  console.log('📝 Datos que se enviarán a MySQL:');
  console.log('Vehículos:', JSON.stringify(vehiculosData, null, 2));
  
  // ✅ PASO 11: URL CORREGIDA (SIN ESPACIOS)
  const RAILWAY_API_URL = 'https://pepsico-funza-production-b0f5.up.railway.app/api/registro';
  
  // ✅ PASO 12: Mostrar mensaje de carga
  const submitBtn = document.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';
  
  // ✅ PASO 13: Enviar a Railway (MySQL)
  fetch(RAILWAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(formData)
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }
    return response.json();
  })
  .then(result => {
    if (result.success) {
      // ✅ Eliminar datos de localStorage
      localStorage.removeItem('pepsico_data');
      
      // ✅ Redirigir a aceptacion.html
      window.location.href = 'aceptacion.html';
    } else {
      throw new Error(result.error || 'Error desconocido');
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert('❌ Error al guardar: ' + error.message + '\n\nPor favor, inténtalo de nuevo.');
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  });
}
