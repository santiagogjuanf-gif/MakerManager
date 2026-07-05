(function () {

  const SECCIONES = [
    {
      id: 'inicio',
      icon: '🏠',
      titulo: 'Primeros pasos',
      pasos: [
        { titulo: 'Configura tu negocio', texto: 'Ve a <strong>Configuración</strong> y llena el nombre de tu negocio, teléfono, dirección, moneda y logo. Estos datos aparecerán en tus cotizaciones y PDFs.' },
        { titulo: 'Ajusta los costos base', texto: 'En Configuración, establece el <strong>costo de electricidad ($/kWh)</strong> y la <strong>tarifa por hora de mano de obra</strong>. La calculadora los usa automáticamente para calcular precios.' },
        { titulo: 'Define tus márgenes', texto: 'Configura los márgenes de <strong>Unitario, Menudeo y Mayoreo</strong>. Por ejemplo: Unitario 2.2×, Menudeo 1.9×, Mayoreo 1.5×. La calculadora multiplica el costo por estos factores.' },
        { titulo: 'Agrega tu primera impresora', texto: 'Ve a <strong>Impresoras</strong> y registra tu máquina con su consumo en watts. Esto permite calcular el costo de electricidad por trabajo automáticamente.' },
        { titulo: 'Carga tu inventario de filamentos', texto: 'Ve a <strong>Inventario → Filamentos</strong> y agrega tus bobinas con marca, material, color, peso y costo. El sistema calcula el costo por gramo y lo usa en la calculadora.' },
      ]
    },
    {
      id: 'calculadora',
      icon: '🧮',
      titulo: 'Calculadora de precios',
      pasos: [
        { titulo: 'Accede a la calculadora', texto: 'Haz clic en el botón <strong>🧮 Calculadora</strong> en la sección de Trabajos, o desde el Catálogo en "Recalcular".' },
        { titulo: 'Llena el levantamiento', texto: 'Ingresa el <strong>tiempo de impresión</strong> (horas y minutos), la <strong>impresora</strong> y el <strong>tiempo de mano de obra</strong>. Estos tres datos definen el costo base.' },
        { titulo: 'Agrega los filamentos', texto: 'Selecciona cada filamento usado y escribe los <strong>gramos por pieza</strong>. Puedes agregar varios filamentos si la pieza usa múltiples colores o materiales.' },
        { titulo: 'Agrega extras (opcional)', texto: 'Si el trabajo requiere soportes, post-procesado, pintura u otros insumos, agrégalos como extras con su costo unitario.' },
        { titulo: 'Revisa el desglose de costos', texto: 'La calculadora muestra en tiempo real: costo de material, electricidad, mano de obra y el precio sugerido por <strong>Unitario, Menudeo y Mayoreo</strong>.' },
        { titulo: 'Guarda la cotización o crea un trabajo', texto: 'Haz clic en <strong>💾 Guardar cotización</strong> para guardarla en el catálogo, o en <strong>📋 Crear trabajo</strong> para abrir directamente el formulario de un nuevo trabajo con todos los datos prellenados.' },
      ]
    },
    {
      id: 'trabajos',
      icon: '📋',
      titulo: 'Gestión de trabajos (Tablero)',
      pasos: [
        { titulo: 'El tablero de trabajos', texto: 'Los trabajos se organizan en 4 columnas: <strong>Solicitud → Levantamiento → Producción → Cierre</strong>. Cada trabajo avanza por estas etapas según el progreso.' },
        { titulo: 'Crear un nuevo trabajo', texto: 'Haz clic en <strong>＋ Nuevo Trabajo</strong>. Llena el nombre del proyecto, cliente, fecha y descripción. En la etapa de Solicitud solo necesitas la información básica.' },
        { titulo: 'Etapa: Solicitud', texto: 'Es la petición inicial del cliente. Registra el canal de venta (Presencial, WhatsApp, Shopify, etc.) y el número de orden si aplica. Haz clic en <strong>📐 Levantamiento →</strong> para avanzar.' },
        { titulo: 'Etapa: Levantamiento', texto: 'Aquí defines todos los detalles técnicos: impresora, filamentos, tiempos, productos y precio. Puedes abrir la calculadora desde aquí. Una vez listo, pasa a Producción.' },
        { titulo: 'Etapa: Producción', texto: 'El trabajo está en proceso de impresión. Si tienes múltiples camas (tandas), defínelas y márcalas conforme se completan. Cuando todas las camas estén ✅, aparece el botón <strong>Cerrar trabajo</strong>.' },
        { titulo: 'Camas de producción', texto: 'Las camas representan tandas de impresión. Ingresa el número de camas en el formulario de edición, guarda, y en la vista de producción ve marcando cada una conforme termina.' },
        { titulo: 'Etapa: Cierre', texto: 'El trabajo está terminado y entregado. Los trabajos en Cierre cuentan en el Dashboard y en Contabilidad como ingresos.' },
        { titulo: 'Eliminar un trabajo', texto: 'Al eliminar un trabajo, este se archiva (no se borra definitivamente), por lo que los ingresos del Dashboard se conservan aunque no aparezca en el tablero.' },
      ]
    },
    {
      id: 'clientes',
      icon: '👥',
      titulo: 'Gestión de clientes',
      pasos: [
        { titulo: 'Agregar un cliente', texto: 'Ve a <strong>Clientes → ＋ Nuevo Cliente</strong>. Llena nombre, teléfono, email y dirección. El sistema le asignará automáticamente una clasificación según sus pedidos.' },
        { titulo: 'Clasificación automática', texto: 'El sistema clasifica a los clientes en: <strong>Nuevo</strong> (1 pedido), <strong>Regular</strong> (3+), <strong>Frecuente</strong> (7+), <strong>VIP</strong> (15+). Los niveles se ajustan en Configuración.' },
        { titulo: 'Ver historial de un cliente', texto: 'Haz clic en un cliente para ver todos sus trabajos, total de pedidos y notas. Útil para dar seguimiento personalizado.' },
        { titulo: 'Notas del cliente', texto: 'Usa el campo de notas para registrar preferencias, forma de pago habitual, instrucciones especiales o cualquier detalle importante del cliente.' },
        { titulo: 'Asignar cliente a un trabajo', texto: 'Al crear o editar un trabajo, selecciona el cliente del menú desplegable. Si el cliente es nuevo, créalo primero desde la sección Clientes.' },
      ]
    },
    {
      id: 'inventario',
      icon: '📦',
      titulo: 'Inventario',
      pasos: [
        { titulo: 'Filamentos', texto: 'Registra cada bobina con: marca, nombre, material (PLA/PETG/ABS…), color, peso inicial, costo total y proveedor. El sistema calcula el <strong>costo por gramo</strong> automáticamente.' },
        { titulo: 'Control de stock de filamentos', texto: 'El peso actual se descuenta automáticamente cuando creas un trabajo con filamentos asignados. También puedes actualizarlo manualmente desde el botón de editar.' },
        { titulo: 'Indicador visual de bobina', texto: 'Cada filamento muestra un ícono de bobina con el nivel de llenado actual. Cuando queda menos de 150g, aparece en la alerta de stock bajo del Dashboard.' },
        { titulo: 'Resinas', texto: 'Igual que filamentos pero para impresoras de resina. Se mide en mililitros (ml) en lugar de gramos.' },
        { titulo: 'Consumibles externos', texto: 'Materiales que se venden al cliente como parte del trabajo (láminas de corte láser, planchas CNC, etc.). Lleva control de cantidad y costo unitario.' },
        { titulo: 'Consumibles internos', texto: 'Materiales de uso interno del taller (cinta de impresión, alcohol isopropílico, guantes, etc.). No se cobran directamente al cliente.' },
        { titulo: 'Registrar compra como gasto', texto: 'Al agregar filamento o insumos, ve también a <strong>Contabilidad → Registrar gasto</strong> para registrar el desembolso en la categoría correspondiente y mantener tu contabilidad actualizada.' },
      ]
    },
    {
      id: 'catalogo',
      icon: '🏷️',
      titulo: 'Catálogo de productos',
      pasos: [
        { titulo: '¿Qué es el catálogo?', texto: 'El catálogo guarda tus productos ya calculados y listos para vender. Es ideal para piezas que produces repetidamente con el mismo precio.' },
        { titulo: 'Agregar un producto', texto: 'Desde la Calculadora, llena todos los datos del trabajo y haz clic en <strong>💾 Guardar en catálogo</strong>. El producto queda guardado con su desglose de costos y precios.' },
        { titulo: 'Foto del producto', texto: 'En el catálogo, haz clic en <strong>✏️ Editar</strong> sobre un producto para subir una foto, modificar el nombre, descripción y precios de venta (online y local).' },
        { titulo: 'Cotizar al cliente', texto: 'Haz clic en <strong>Cotizar al cliente</strong> en cualquier producto del catálogo para abrir la calculadora en modo venta. Desde ahí puedes crear directamente un trabajo para ese cliente.' },
        { titulo: 'Recalcular precios', texto: 'Si cambian los costos de materiales o tus tarifas, usa el botón <strong>Recalcular</strong> para abrir la calculadora con los datos del producto y ajustar el precio.' },
        { titulo: 'Vista mosaico vs lista', texto: 'Puedes alternar entre vista de tarjetas (mosaico) y vista de lista usando los botones en la esquina superior derecha del catálogo.' },
      ]
    },
    {
      id: 'impresoras',
      icon: '🖨️',
      titulo: 'Gestión de impresoras',
      pasos: [
        { titulo: 'Registrar una impresora', texto: 'Ve a <strong>Impresoras → ＋ Nueva Impresora</strong>. Ingresa nombre, marca, modelo, tipo (FDM, Resina, Láser, CNC), costo de compra y consumo en watts.' },
        { titulo: 'Consumo eléctrico', texto: 'El campo <strong>Consumo promedio (watts)</strong> es clave: la calculadora lo usa junto al costo de kWh configurado para calcular el costo de electricidad por trabajo.' },
        { titulo: 'Horas acumuladas', texto: 'Cada vez que se registra un trabajo completado, las horas de impresión se suman automáticamente a la impresora. Sirve para saber cuándo necesita mantenimiento.' },
        { titulo: 'Vida útil y mantenimiento', texto: 'Define la vida útil en horas. El sistema mostrará una alerta cuando la impresora se acerque a ese límite, para que planifiques mantenimiento preventivo.' },
        { titulo: 'Estado de la impresora', texto: 'Marca cada impresora como <strong>Activa, En mantenimiento</strong> o <strong>Inactiva</strong> para reflejar su disponibilidad real en el tablero.' },
      ]
    },
    {
      id: 'contabilidad',
      icon: '💰',
      titulo: 'Contabilidad',
      pasos: [
        { titulo: '¿Cómo funciona la contabilidad?', texto: 'La sección de Contabilidad muestra <strong>ingresos</strong> (de trabajos en Cierre) y <strong>gastos</strong> (que registras manualmente) para calcular tu utilidad neta del mes.' },
        { titulo: 'Registrar un gasto', texto: 'Haz clic en <strong>+ Registrar gasto</strong>. Elige la fecha, categoría (Filamento, Resina, Impresora, Mantenimiento, Electricidad…), descripción, monto y proveedor.' },
        { titulo: 'Categorías de gasto', texto: '<strong>Filamento / Resina:</strong> compra de materiales. <strong>Impresora:</strong> compra de equipo. <strong>Mantenimiento:</strong> reparaciones y repuestos. <strong>Electricidad:</strong> factura de luz. <strong>General:</strong> todo lo demás.' },
        { titulo: 'Filtrar por mes', texto: 'Usa el selector de mes en la parte superior para ver el resumen de cualquier mes anterior. Las gráficas muestran siempre los últimos 6 meses para ver la tendencia.' },
        { titulo: 'Gráfica Ingresos vs Gastos', texto: 'Cada par de barras representa un mes: la barra de color son ingresos y la roja son gastos. Si la barra de color es más alta, el mes fue rentable.' },
        { titulo: 'Gráfica de dona', texto: 'Muestra en qué categorías gastas más. Si "Filamento" domina, considera negociar mejores precios con proveedores o comprar en volumen.' },
        { titulo: 'Pipeline (trabajos activos)', texto: 'El KPI de Pipeline muestra el valor potencial de todos los trabajos en curso (Solicitud, Levantamiento, Producción). Es el ingreso esperado si todos cierran exitosamente.' },
      ]
    },
    {
      id: 'tips',
      icon: '💡',
      titulo: 'Tips y buenas prácticas',
      pasos: [
        { titulo: 'Mantén el inventario actualizado', texto: 'Actualiza el peso de tus filamentos regularmente. Un inventario preciso significa precios más exactos y alertas de stock bajo confiables.' },
        { titulo: 'Usa el canal de venta', texto: 'Registra siempre por dónde llegó el pedido (WhatsApp, Shopify, presencial…). Con el tiempo verás qué canales te generan más ventas.' },
        { titulo: 'Cierra los trabajos a tiempo', texto: 'Solo los trabajos en estado <strong>Cierre</strong> cuentan como ingreso en el Dashboard y Contabilidad. No olvides cerrarlos cuando entregues al cliente.' },
        { titulo: 'Registra todos los gastos', texto: 'Aunque sea un gasto pequeño (cinta, alcohol, una nozzle), regístralo. La suma de los pequeños gastos impacta significativamente tu utilidad real.' },
        { titulo: 'Revisa el margen mensual', texto: 'Un margen sano para un taller de impresión 3D es 40–60%. Si tu margen está por debajo del 30%, revisa si tus precios cubren todos los costos reales.' },
        { titulo: 'Crea clientes aunque sean de paso', texto: 'Registra a todos los clientes, incluso los de una sola compra. Muchos "clientes de paso" se vuelven frecuentes cuando les das seguimiento.' },
        { titulo: 'Cotiza antes de comprometerte', texto: 'Siempre usa la calculadora antes de dar precio a un cliente. Una cotización rápida a ojo puede resultar en trabajos sin ganancia o incluso con pérdida.' },
      ]
    },
  ];

  function render() {
    const container = document.getElementById('ayuda-root');
    if (!container) return;

    let activeId = 'inicio';

    function renderContent() {
      const sec = SECCIONES.find(s => s.id === activeId) || SECCIONES[0];
      return `
        <div style="padding:4px 0">
          <div style="font-size:22px;font-weight:800;margin-bottom:4px">${sec.icon} ${sec.titulo}</div>
          <div style="height:3px;width:48px;background:var(--accent);border-radius:2px;margin-bottom:20px"></div>
          ${sec.pasos.map((p, i) => `
            <div style="display:flex;gap:16px;margin-bottom:20px;align-items:flex-start">
              <div style="min-width:32px;height:32px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0">${i+1}</div>
              <div>
                <div style="font-weight:700;font-size:14px;margin-bottom:4px">${p.titulo}</div>
                <div style="font-size:13px;color:var(--text-muted);line-height:1.6">${p.texto}</div>
              </div>
            </div>`).join('')}
        </div>`;
    }

    function renderSidebar() {
      return SECCIONES.map(s => `
        <div onclick="ayudaNav('${s.id}')" id="ayuda-nav-${s.id}"
          style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:2px;
          ${s.id===activeId?'background:var(--accent-dim);color:var(--accent-light);font-weight:700;':'color:var(--text-muted);'}
          font-size:13px;transition:all .15s">
          <span style="font-size:16px">${s.icon}</span>
          <span>${s.titulo}</span>
        </div>`).join('');
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">📖 Manual de uso</div>
          <div class="page-subtitle">Guías paso a paso para cada función de MakerManager</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:220px 1fr;gap:20px;align-items:start">
        <!-- Sidebar nav -->
        <div class="card" style="padding:12px;position:sticky;top:20px" id="ayuda-sidebar">
          ${renderSidebar()}
        </div>
        <!-- Content -->
        <div class="card" id="ayuda-content">
          ${renderContent()}
        </div>
      </div>`;

    window.ayudaNav = function(id) {
      activeId = id;
      // Update sidebar highlight
      SECCIONES.forEach(s => {
        const el = document.getElementById(`ayuda-nav-${s.id}`);
        if (!el) return;
        if (s.id === id) {
          el.style.background = 'var(--accent-dim)';
          el.style.color = 'var(--accent-light)';
          el.style.fontWeight = '700';
        } else {
          el.style.background = '';
          el.style.color = 'var(--text-muted)';
          el.style.fontWeight = '';
        }
      });
      // Update content
      const content = document.getElementById('ayuda-content');
      if (content) content.innerHTML = renderContent();
      // Scroll to top of content
      content?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }

  pageLoaders['ayuda'] = function() {
    document.getElementById('page-ayuda').innerHTML = '<div id="ayuda-root"></div>';
    render();
  };
})();
