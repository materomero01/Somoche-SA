// /FRONTEND/scripts/add-viajes.js

// Variable global para almacenar todos los choferes cargados una sola vez
let allChoferes = [];
let apiURL = 'http://localhost:3000'
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
            
            // Si la pestaña de Pagos se activa, inicializa los autocompletados de chofer
            if (selectedTab === 'pagos') {
                setupPaymentTypeSelector();
                // Asegúrate de que los IDs de tus inputs de chofer en la pestaña de Pagos sean correctos
                setupChoferAutocomplete('choferPagoCheque');
                setupChoferAutocomplete('choferPagoGasoil');
                setupChoferAutocomplete('choferPagoOtro');   
            } else if (selectedTab === 'viajes') {
                setupChoferAutocomplete('chofer'); // Autocompletado para el input de viajes
            }
        });
    });

    const initialActive = tabSelector.querySelector('.tab-item.active');
    if (initialActive) {
        handleTabContentDisplay(initialActive.dataset.tab);
        if (initialActive.dataset.tab === 'pagos') {
            setupPaymentTypeSelector();
            setupChoferAutocomplete('choferPagoCheque'); 
            setupChoferAutocomplete('choferPagoGasoil'); 
            setupChoferAutocomplete('choferPagoOtro');   
        } else if (initialActive.dataset.tab === 'viajes') {
            setupChoferAutocomplete('chofer');
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
        const choferInput = document.getElementById('chofer'); 
        const choferId = choferInput?.dataset.selectedChoferId; // Obtener el ID del chofer seleccionado
        const choferNombre = choferInput?.value; // Obtener el nombre que está en el input

        const fecha = document.getElementById('fecha')?.value;
        const comprobante = document.getElementById('comprobante')?.value;
        const campo = document.getElementById('campo')?.value;
        const kilometro = document.getElementById('kilometro')?.value;
        const tarifa = document.getElementById('tarifa')?.value;
        const variacion = document.getElementById('variacion')?.value;
        const toneladas = document.getElementById('toneladas')?.value;
        const cargado = document.getElementById('cargado')?.value;
        const descargado = document.getElementById('descargado')?.value;

        if (!choferId) {
            alert('Por favor, selecciona un chofer de la lista de sugerencias.');
            return;
        }

        console.log('[Añadir viaje]', { 
            choferId, 
            choferNombre, 
            fecha, comprobante, campo, kilometro, 
            tarifa, variacion, toneladas, cargado, descargado 
        });
        alert('Viaje añadido (simulado)!');
        // Aquí iría tu fetch al backend para registrar el viaje
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

    const dateInputViaje = document.getElementById('fecha');
    if (dateInputViaje) {
        dateInputViaje.value = formattedDate;
    }
    
    const dateInputPagoCheque = document.getElementById('fechaPagoCheque');
    if (dateInputPagoCheque) {
        dateInputPagoCheque.value = formattedDate;
    }
    const dateInputFechaCheque = document.getElementById('fechaCheque');
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

    function showPaymentFields(selectedType) {
        [chequeFields, gasoilFields, otroFields].forEach(fieldDiv => {
            if (fieldDiv) fieldDiv.classList.add('hidden');
        });

        switch (selectedType) {
            case 'cheque':
                chequeFields?.classList.remove('hidden');
                break;
            case 'gasoil':
                gasoilFields?.classList.remove('hidden');
                calculateGasoilImporte(); 
                break;
            case 'otro':
                otroFields?.classList.remove('hidden');
                break;
        }
        setTodayDate(); 
    }

    if (tipoPagoSelect) {
        tipoPagoSelect.addEventListener('change', (event) => {
            showPaymentFields(event.target.value);
        });

        showPaymentFields(tipoPagoSelect.value);
    }

    const precioGasoilInput = document.getElementById('precioGasoil');
    const litrosGasoilInput = document.getElementById('litrosGasoil');
    const importeGasoilInput = document.getElementById('importeGasoil');

    function calculateGasoilImporte() {
        const precio = parseFloat(precioGasoilInput?.value) || 0;
        const litros = parseFloat(litrosGasoilInput?.value) || 0;
        const importe = (precio * litros).toFixed(2); 
        if (importeGasoilInput) {
            importeGasoilInput.value = importe;
        }
    }

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
        let pagoData = { tipo: tipoPago }; 

        let choferInput; // Variable para almacenar la referencia al input del chofer de la pestaña actual

        switch (tipoPago) {
            case 'cheque':
                choferInput = document.getElementById('choferPagoCheque');
                pagoData = {
                    ...pagoData, 
                    choferId: choferInput?.dataset.selectedChoferId, 
                    choferNombre: choferInput?.value, 
                    fechaPago: document.getElementById('fechaPagoCheque')?.value,
                    fechaCheque: document.getElementById('fechaCheque')?.value,
                    nroCheque: document.getElementById('nroCheque')?.value,
                    tercero: document.getElementById('terceroCheque')?.value,
                    destinatario: document.getElementById('destinatarioCheque')?.value,
                    importe: document.getElementById('importeCheque')?.value
                };
                break;
            case 'gasoil':
                choferInput = document.getElementById('choferPagoGasoil');
                pagoData = {
                    ...pagoData, 
                    choferId: choferInput?.dataset.selectedChoferId,
                    choferNombre: choferInput?.value,
                    fechaPago: document.getElementById('fechaPagoGasoil')?.value,
                    precioGasoil: document.getElementById('precioGasoil')?.value,
                    litros: document.getElementById('litrosGasoil')?.value,
                    importe: document.getElementById('importeGasoil')?.value
                };
                break;
            case 'otro':
                choferInput = document.getElementById('choferPagoOtro');
                pagoData = {
                    ...pagoData, 
                    choferId: choferInput?.dataset.selectedChoferId,
                    choferNombre: choferInput?.value,
                    fechaPago: document.getElementById('fechaPagoOtro')?.value,
                    detalle: document.getElementById('detalleOtro')?.value,
                    importe: document.getElementById('importeOtro')?.value
                };
                break;
            default:
                console.warn('Tipo de pago no reconocido:', tipoPago);
                return;
        }

        if (!pagoData.choferId) {
             alert('Por favor, selecciona un chofer de la lista de sugerencias.');
             return;
        }

        console.log('[Registrar Pago]', pagoData);
        alert(`Pago de tipo "${tipoPago}" registrado (simulado)!`);
    });
}

// --- Funcionalidad para cargar todos los choferes del backend una vez ---
async function fetchAllChoferes() {
    try {
        const token = localStorage.getItem('jwtToken');
        if (!token) {
            console.error('No se encontró token JWT en localStorage.');
            // Redirigir al login o mostrar mensaje de error si no hay token
            return [];
        }

        // Endpoint para obtener todos los choferes
        const response = await fetch(apiURL+'/api/choferes/all', { // Asegúrate de que este endpoint exista en tu backend
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                console.error('Autenticación fallida o token inválido/expirado al cargar choferes.');
                // Aquí podrías forzar el cierre de sesión o redirigir al login
                alert('Tu sesión ha expirado o es inválida. Por favor, inicia sesión de nuevo.');
                window.location.href = 'login.html'; // Ajusta tu ruta de login
            }
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error al cargar la lista de choferes.');
        }

        const data = await response.json();
        // Asegúrate de que tu backend devuelve un objeto con una propiedad 'choferes' que es un array
        if (data.choferes && Array.isArray(data.choferes)) {
            allChoferes = data.choferes; // Almacena la lista globalmente
            console.log('Choferes cargados:', allChoferes.length);
            return allChoferes;
        } else {
            console.error('El formato de respuesta de choferes no es el esperado.');
            return [];
        }
    } catch (error) {
        console.error('Error en fetchAllChoferes:', error.message);
        return [];
    }
}

// --- Funcionalidad: Autocompletado de Choferes (con filtrado local) ---

/**
 * Configura la funcionalidad de autocompletado para un input de chofer.
 * @param {string} inputId - El ID del elemento input HTML.
 */
function setupChoferAutocomplete(inputId) {
    const choferInput = document.getElementById(inputId);
    let suggestionsDiv = document.getElementById(`${inputId}-suggestions`);

    if (!choferInput) {
        // console.warn(`Input de chofer con ID '${inputId}' no encontrado. No se configurará el autocompletado.`);
        return; // No warns, ya que esta función se llama para IDs que pueden no estar visibles
    }

    if (!suggestionsDiv) {
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.id = `${inputId}-suggestions`;
        suggestionsDiv.classList.add('suggestions-list');
        choferInput.parentNode.insertBefore(suggestionsDiv, choferInput.nextSibling);
    }

    // Función de filtrado local
    function filterLocalSuggestions(query) {
        if (query.length < 2) {
            return [];
        }
        // Filtra la lista completa de choferes (allChoferes)
        return allChoferes.filter(chofer =>
            chofer.nombre.toLowerCase().includes(query.toLowerCase())
        );
    }

    function displaySuggestions(suggestions) {
        suggestionsDiv.innerHTML = '';
        activeSuggestionIndex = -1;

        if (suggestions.length === 0 && choferInput.value.length > 0) {
            suggestionsDiv.style.display = 'none';
            return;
        }

        if (suggestions.length === 0) {
            suggestionsDiv.style.display = 'none';
            return;
        }

        suggestions.forEach(chofer => {
            const item = document.createElement('div');
            item.classList.add('suggestion-item');
            item.textContent = `${chofer.nombre} (${chofer.cuil})`;
            
            for (const key in chofer) {
                item.dataset[key] = chofer[key];
            }

            item.addEventListener('click', () => {
                choferInput.value = chofer.nombre;
                choferInput.dataset.selectedChoferId = chofer.id;
                choferInput.dataset.selectedChoferNombre = chofer.nombre;
                choferInput.dataset.selectedChoferCuil = chofer.cuil;

                suggestionsDiv.innerHTML = '';
                suggestionsDiv.style.display = 'none';
                choferInput.focus();
            });
            suggestionsDiv.appendChild(item);
        });
        suggestionsDiv.style.display = 'block';
    }

    let activeSuggestionIndex = -1;

    choferInput.addEventListener('input', async () => {
        const query = choferInput.value.trim();
        delete choferInput.dataset.selectedChoferId; 
        delete choferInput.dataset.selectedChoferNombre;
        delete choferInput.dataset.selectedChoferCuil;

        if (query.length === 0) {
            suggestionsDiv.innerHTML = '';
            suggestionsDiv.style.display = 'none';
            return;
        }

        // ¡Ahora llamamos a la función de filtrado local!
        const suggestions = filterLocalSuggestions(query); 
        displaySuggestions(suggestions);
    });

    document.addEventListener('click', (event) => {
        if (!choferInput.contains(event.target) && !suggestionsDiv.contains(event.target)) {
            suggestionsDiv.style.display = 'none';
            activeSuggestionIndex = -1;
        }
    });

    choferInput.addEventListener('keydown', (e) => {
        const items = Array.from(suggestionsDiv.children);
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
            highlightSuggestion(items[activeSuggestionIndex]);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
            highlightSuggestion(items[activeSuggestionIndex]);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeSuggestionIndex > -1) {
                items[activeSuggestionIndex].click();
            } else if (items.length === 1 && choferInput.value === items[0].dataset.nombre) { // Usar .dataset.nombre
                items[0].click();
            }
        } else if (e.key === 'Escape') {
            suggestionsDiv.style.display = 'none';
            activeSuggestionIndex = -1;
        }
    });

    function highlightSuggestion(item) {
        Array.from(suggestionsDiv.children).forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    
    suggestionsDiv.addEventListener('mousedown', (e) => {
        e.preventDefault();
    });
}


// --- Inicialización al cargar el DOM ---

document.addEventListener('DOMContentLoaded', async function() {
    // Primero, carga todos los choferes
    await fetchAllChoferes(); // Esto poblará la variable `allChoferes`

    // Luego, carga y configura el Header
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

    setTodayDate(); 

    // Inicializa la funcionalidad de pestañas.
    // setupTabSelectors ahora se encargará de llamar a setupChoferAutocomplete
    // para los inputs de chofer apropiados una vez que las pestañas sean activas.
    setupTabSelectors(); 
    
    setupAddViajeBtn();
    setupViajesSearchBar();
    setupAddPagoBtn();
    
    // No necesitamos llamar a setupChoferAutocomplete aquí directamente
    // si ya se maneja a través de setupTabSelectors al cambiar de pestaña
});