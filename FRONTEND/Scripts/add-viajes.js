// /FRONTEND/scripts/add-viajes.js

// --- Lógica de Pestañas (SIN tab-indicator) ---

// Función para inicializar los selectores de pestañas
function setupTabSelectors() {
    const tabSelector = document.getElementById('viajesPagosSelector'); 

    if (!tabSelector) {
        console.warn("Elemento #viajesPagosSelector no encontrado. La funcionalidad de pestañas no se inicializará.");
        return;
    }

    const tabItems = tabSelector.querySelectorAll('.tab-item');
    
    tabItems.forEach(item => {
        item.addEventListener('click', function () {
            tabItems.forEach(tab => tab.classList.remove('active'));
            this.classList.add('active');

            const selectedTab = this.dataset.tab;
            
            handleTabContentDisplay(selectedTab);
            
            // Si la pestaña de Pagos se activa, inicializa el selector de tipo de pago
            // Esto asegura que la lógica de pagos se inicialice solo cuando su pestaña esté activa
            if (selectedTab === 'pagos') {
                setupPaymentTypeSelector();
            }
        });
    });

    const initialActive = tabSelector.querySelector('.tab-item.active');
    if (initialActive) {
        handleTabContentDisplay(initialActive.dataset.tab);
        // Si la pestaña de Pagos es la activa por defecto al cargar, también inicializamos
        if (initialActive.dataset.tab === 'pagos') {
            setupPaymentTypeSelector();
        }
    }
}

// Esta función muestra u oculta los bloques de contenido para viajes/pagos
function handleTabContentDisplay(selectedTab) {
    const contentViajes = document.getElementById('viajes'); 
    const contentPagos = document.getElementById('pagos');   

    if (contentViajes) contentViajes.classList.add('hidden');
    if (contentPagos) contentPagos.classList.add('hidden');

    if (selectedTab === 'viajes') contentViajes?.classList.remove('hidden');
    if (selectedTab === 'pagos') contentPagos?.classList.remove('hidden');
}

// --- Lógica del Botón Añadir Viaje ---
function setupAddViajeBtn() {
    const btn = document.getElementById('addViajeBtn');
    btn?.addEventListener('click', function() {
        const chofer = document.getElementById('chofer')?.value;
        const fecha = document.getElementById('fecha')?.value;
        const comprobante = document.getElementById('comprobante')?.value;
        const campo = document.getElementById('campo')?.value;
        const kilometro = document.getElementById('kilometro')?.value;
        const tarifa = document.getElementById('tarifa')?.value;
        const variacion = document.getElementById('variacion')?.value;
        const toneladas = document.getElementById('toneladas')?.value;
        const cargado = document.getElementById('cargado')?.value;
        const descargado = document.getElementById('descargado')?.value;

        console.log('[Añadir viaje]', { 
            chofer, fecha, comprobante, campo, kilometro, 
            tarifa, variacion, toneladas, cargado, descargado 
        });
        alert('Viaje añadido (simulado)!');
    });
}

// --- Lógica de la Barra de Búsqueda de Viajes ---
function setupViajesSearchBar() {
    const input = document.querySelector('#viajesSearchBar .search-input');
    const icon = document.querySelector('#viajesSearchBar .search-icon');

    if (!input || !icon) {
        console.warn("Elementos de la barra de búsqueda de viajes no encontrados.");
        return;
    }

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const term = input.value.trim();
            if (term) {
                alert(`Buscar viaje con: "${term}"`);
            } else {
                alert('Por favor, ingresa un término de búsqueda.');
            }
        }
    });

    icon.addEventListener('click', () => {
        const term = input.value.trim();
        if (term) {
            alert(`Buscar viaje con: "${term}"`);
        } else {
            alert('Por favor, ingresa un término de búsqueda.');
        }
    });
}

// --- Funcionalidad para establecer la fecha actual en el input de fecha ---
function setTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const formattedDate = `${year}-${month}-${day}`;

    // Campo de fecha para Viajes
    const dateInputViaje = document.getElementById('fecha');
    if (dateInputViaje) {
        dateInputViaje.value = formattedDate;
    }
    
    // Campos de fecha para Pagos (específicos por tipo de pago)
    const dateInputPagoCheque = document.getElementById('fechaPagoCheque');
    if (dateInputPagoCheque) {
        dateInputPagoCheque.value = formattedDate;
    }
    const dateInputFechaCheque = document.getElementById('fechaCheque'); // Fecha del cheque
    if (dateInputFechaCheque) {
        dateInputFechaCheque.value = formattedDate;
    }

    const dateInputPagoGasoil = document.getElementById('fechaPagoGasoil');
    if (dateInputPagoGasoil) {
        dateInputPagoGasoil.value = formattedDate;
    }

    const dateInputPagoOtro = document.getElementById('fechaPagoOtro');
    if (dateInputPagoOtro) {
        dateInputPagoOtro.value = formattedDate;
    }
}

// --- Lógica del selector de tipo de pago ---
function setupPaymentTypeSelector() {
    const tipoPagoSelect = document.getElementById('tipoPago');
    const chequeFields = document.getElementById('chequeFields');
    const gasoilFields = document.getElementById('gasoilFields');
    const otroFields = document.getElementById('otroFields');

    // Función auxiliar para mostrar solo los campos relevantes
    function showPaymentFields(selectedType) {
        // Ocultar todos los contenedores de campos de pago
        [chequeFields, gasoilFields, otroFields].forEach(fieldDiv => {
            if (fieldDiv) fieldDiv.classList.add('hidden');
        });

        // Mostrar solo el contenedor correspondiente al tipo seleccionado
        switch (selectedType) {
            case 'cheque':
                chequeFields?.classList.remove('hidden');
                break;
            case 'gasoil':
                gasoilFields?.classList.remove('hidden');
                // Asegurarse de que el cálculo se haga al mostrar los campos de gasoil
                calculateGasoilImporte(); 
                break;
            case 'otro':
                otroFields?.classList.remove('hidden');
                break;
        }
        // Asegurarse de que las fechas se establezcan para los campos mostrados
        setTodayDate(); 
    }

    // Listener para el cambio en el selector de tipo de pago
    if (tipoPagoSelect) {
        tipoPagoSelect.addEventListener('change', (event) => {
            showPaymentFields(event.target.value);
        });

        // Mostrar los campos para el valor seleccionado inicialmente (por defecto "cheque")
        showPaymentFields(tipoPagoSelect.value);
    }

    // Lógica de autocálculo para Gasoil
    const precioGasoilInput = document.getElementById('precioGasoil');
    const litrosGasoilInput = document.getElementById('litrosGasoil');
    const importeGasoilInput = document.getElementById('importeGasoil');

    function calculateGasoilImporte() {
        const precio = parseFloat(precioGasoilInput?.value) || 0;
        const litros = parseFloat(litrosGasoilInput?.value) || 0;
        // Calcular el importe y redondear a 2 decimales
        const importe = (precio * litros).toFixed(2); 
        if (importeGasoilInput) {
            importeGasoilInput.value = importe;
        }
    }

    // Añadir event listeners para el cálculo en tiempo real
    if (precioGasoilInput) {
        precioGasoilInput.addEventListener('input', calculateGasoilImporte);
    }
    if (litrosGasoilInput) {
        litrosGasoilInput.addEventListener('input', calculateGasoilImporte);
    }
}

// --- Lógica del Botón Registrar Pago ---
function setupAddPagoBtn() {
    const btn = document.getElementById('addPagoBtn');
    btn?.addEventListener('click', () => {
        const tipoPago = document.getElementById('tipoPago')?.value;
        let pagoData = { tipo: tipoPago }; // Objeto base con el tipo de pago

        // Recopilar datos específicos según el tipo de pago seleccionado
        switch (tipoPago) {
            case 'cheque':
                pagoData = {
                    ...pagoData, // Mantiene el tipo: 'cheque'
                    chofer: document.getElementById('choferPagoCheque')?.value,
                    fechaPago: document.getElementById('fechaPagoCheque')?.value,
                    fechaCheque: document.getElementById('fechaCheque')?.value,
                    nroCheque: document.getElementById('nroCheque')?.value,
                    tercero: document.getElementById('terceroCheque')?.value,
                    destinatario: document.getElementById('destinatarioCheque')?.value,
                    importe: document.getElementById('importeCheque')?.value
                };
                break;
            case 'gasoil':
                pagoData = {
                    ...pagoData, // Mantiene el tipo: 'gasoil'
                    chofer: document.getElementById('choferPagoGasoil')?.value,
                    fechaPago: document.getElementById('fechaPagoGasoil')?.value,
                    precioGasoil: document.getElementById('precioGasoil')?.value,
                    litros: document.getElementById('litrosGasoil')?.value,
                    importe: document.getElementById('importeGasoil')?.value // Se obtiene el valor ya calculado
                };
                break;
            case 'otro':
                pagoData = {
                    ...pagoData, // Mantiene el tipo: 'otro'
                    chofer: document.getElementById('choferPagoOtro')?.value,
                    fechaPago: document.getElementById('fechaPagoOtro')?.value,
                    detalle: document.getElementById('detalleOtro')?.value,
                    importe: document.getElementById('importeOtro')?.value
                };
                break;
            default:
                console.warn('Tipo de pago no reconocido:', tipoPago);
                return; // Salir si el tipo no es válido
        }

        console.log('[Registrar Pago]', pagoData);
        alert(`Pago de tipo "${tipoPago}" registrado (simulado)!`);
        // Aquí iría la lógica para enviar los datos de pago al backend
    });
}

// --- Inicialización al cargar el DOM ---

document.addEventListener('DOMContentLoaded', async function() {
    // Carga y configura el Header
    if (typeof loadHeader === 'function') { 
        await loadHeader(); 
    } else {
        console.error("loadHeader no está definido. Asegúrate de que /FRONTEND/scripts/header.js se cargue antes.");
    }

    // Carga y configura el Sidebar
    if (typeof loadSidebar === 'function') { 
        const userRole = localStorage.getItem('userRole') || 'admin';
        await loadSidebar(userRole);
    } else {
        console.error("loadSidebar no está definido. Asegúrate de que /FRONTEND/scripts/sidebar.js se cargue antes.");
    }

    // Lógica para resaltar el ítem del sidebar
    const currentPath = window.location.pathname;
    const sidebarItems = document.querySelectorAll('.sidebar-item');

    sidebarItems.forEach(item => {
        const targetPage = item.dataset.targetPage; 
        if (targetPage && currentPath.includes(targetPage)) {
            sidebarItems.forEach(el => el.classList.remove('active')); 
            item.classList.add('active');
        }
    });

    // Establece la fecha actual en los inputs de fecha (llama a esta función temprano)
    setTodayDate(); 

    // Inicializa la funcionalidad de pestañas (esto llamará a setupPaymentTypeSelector si 'Pagos' es la pestaña inicial)
    setupTabSelectors(); 
    
    // Inicializa la lógica del botón "Añadir Viaje"
    setupAddViajeBtn();

    // Inicializa la lógica de la barra de búsqueda
    setupViajesSearchBar();

    // Inicializa la lógica del botón "Registrar Pago"
    setupAddPagoBtn();
});