// /FRONTEND/scripts/cheques-admin.js

import { renderTabla } from './tabla.js';

// Simulamos datos de cheques próximos y pagos
// Añadir un ID único a cada cheque y la propiedad 'selected'
const datosChequesProximos = Array.from({ length: 15 }, (_, i) => ({
    id: `cheque-prox-${crypto.randomUUID()}`, // ID único para cada cheque
    diasRestantes: Math.floor(Math.random() * 30) + 1,
    fechaCobro: generarFechaFutura(),
    cheque: `#${10000 + i}`,
    destinatario: `Cliente ${i + 1}`,
    tercero: `Empresa YZ ${i % 5}`, // Añadido para el filtro
    banco: ['Banco Nación', 'Santander', 'Galicia'][i % 3],
    fechaPago: generarFechaPasada(), // Usado como "Fecha Emisión" para próximos
    importe: parseFloat((Math.random() * 50000 + 10000).toFixed(2)), // Convertir a número
    selected: false // Estado de selección para el checkbox
}));

const datosChequesPagos = Array.from({ length: 12 }, (_, i) => ({
    id: `cheque-pago-${crypto.randomUUID()}`, // ID único
    fechaCobro: generarFechaPasada(),
    cheque: `#${8000 + i}`,
    destinatario: `Proveedor ${i + 1}`,
    tercero: `Empresa AB ${i % 4}`, // Añadido para el filtro
    banco: ['HSBC', 'Macro', 'Provincia'][i % 3],
    fechaPago: generarFechaPasada(),
    importe: parseFloat((Math.random() * 40000 + 8000).toFixed(2)) // Convertir a número
}));

// Mapa para mantener el estado de los cheques seleccionados
const selectedCheques = new Map(); // Map<chequeId, chequeObject>

// Objeto para almacenar los filtros actuales
let currentFilter = {
    numero: '',
    destinatario: '',
    tercero: '',
    fechaDesde: '',
    fechaHasta: '',
    montoMinimo: '',
    montoMaximo: ''
};

function generarFechaFutura() {
    const hoy = new Date();
    hoy.setDate(hoy.getDate() + Math.floor(Math.random() * 30) + 1);
    return hoy.toISOString().split('T')[0];
}

function generarFechaPasada() {
    const hoy = new Date();
    hoy.setDate(hoy.getDate() - Math.floor(Math.random() * 30) - 1);
    return hoy.toISOString().split('T')[0];
}

// Función para filtrar los datos de cheques según los criterios
function filtrarCheques(data, filters) {
    return data.filter(cheque => {
        let match = true;

        if (filters.numero && !cheque.cheque.toLowerCase().includes(filters.numero.toLowerCase())) {
            match = false;
        }
        if (filters.destinatario && !cheque.destinatario.toLowerCase().includes(filters.destinatario.toLowerCase())) {
            match = false;
        }
        if (filters.tercero && !cheque.tercero.toLowerCase().includes(filters.tercero.toLowerCase())) {
            match = false;
        }
        // Las fechas deben ser comparadas como objetos Date o cadenas consistentes
        if (filters.fechaDesde && cheque.fechaCobro < filters.fechaDesde) {
            match = false;
        }
        if (filters.fechaHasta && cheque.fechaCobro > filters.fechaHasta) {
            match = false;
        }
        // Los montos deben ser comparados como números
        if (filters.montoMinimo !== undefined && filters.montoMinimo !== '' && cheque.importe < parseFloat(filters.montoMinimo)) {
            match = false;
        }
        if (filters.montoMaximo !== undefined && filters.montoMaximo !== '' && cheque.importe > parseFloat(filters.montoMaximo)) {
            match = false;
        }
        return match;
    });
}

function renderTablaProximos() {
    let filteredData = filtrarCheques(datosChequesProximos, currentFilter);

    // Ordenar por 'diasRestantes' de forma ascendente
    filteredData.sort((a, b) => a.diasRestantes - b.diasRestantes);

    renderTabla({
        containerId: 'tabla-proximos',
        paginacionContainerId: 'paginacion-proximos',
        columnas: [
            { label: 'Días', key: 'diasRestantes', class: 'text-right' },
            { label: 'Fecha Cobro', key: 'fechaCobro' },
            { label: 'Cheque', key: 'cheque' },
            { label: 'Destinatario', key: 'destinatario' },
            { label: 'Banco', key: 'banco' },
            { label: 'Fecha Emisión', key: 'fechaPago' }, 
            { label: 'Importe', key: 'importe', class: 'text-right' }
        ],
        datos: filteredData.map(c => ({
            id: c.id,
            diasRestantes: `${c.diasRestantes} días`,
            fechaCobro: c.fechaCobro,
            cheque: c.cheque,
            destinatario: c.destinatario,
            banco: c.banco,
            fechaPago: c.fechaPago,
            importe: `$${c.importe.toFixed(2)}`,
            selected: c.selected // Pasar el estado de selección a renderTabla
        })),
        itemsPorPagina: 10,
        checkboxColumn: true, // Habilitar la columna de checkbox
        checkboxColumnPosition: 'end', // Posicionar el checkbox al final
        onCheckboxChange: handleCheckboxChange // Asignar el handler para cambios en los checkboxes
    });

    // Actualizar el total a cobrar (de todos los cheques actualmente mostrados, no solo los seleccionados)
    const total = calcularTotalImportesGlobal(filteredData);
    const totalDiv = document.getElementById('selected-cheques-total'); // Corregido ID
    if (totalDiv) totalDiv.textContent = total; // Corregido para solo el número

    // Actualizar el resumen de cheques seleccionados
    updateSelectedChequesSummary();
    updateClearFilterButtonVisibility(); // Actualizar visibilidad del botón de limpiar filtro
}

function renderTablaPagos() {
    const filteredData = filtrarCheques(datosChequesPagos, currentFilter);

    renderTabla({
        containerId: 'tabla-pagos',
        paginacionContainerId: 'paginacion-pagos',
        columnas: [
            { label: 'Fecha Cobro', key: 'fechaCobro' },
            { label: 'Cheque', key: 'cheque' },
            { label: 'Destinatario', key: 'destinatario' },
            { label: 'Banco', key: 'banco' },
            { label: 'Fecha Pago', key: 'fechaPago' },
            { label: 'Importe', key: 'importe', class: 'text-right' }
        ],
        datos: filteredData.map(c => ({
            id: c.id,
            fechaCobro: c.fechaCobro,
            cheque: c.cheque,
            destinatario: c.destinatario,
            banco: c.banco,
            fechaPago: c.fechaPago,
            importe: `$${c.importe.toFixed(2)}`
        })),
        itemsPorPagina: 10,
        checkboxColumn: false // No hay checkboxes para la tabla de cheques pagos
    });
    updateClearFilterButtonVisibility(); // Actualizar visibilidad del botón de limpiar filtro
}

function calcularTotalImportesGlobal(data) {
    return data.reduce((acc, el) => acc + el.importe, 0).toFixed(2);
}

// Función para actualizar el resumen de cheques seleccionados
function updateSelectedChequesSummary() {
    const count = selectedCheques.size;
    const total = Array.from(selectedCheques.values()).reduce((sum, cheque) => sum + cheque.importe, 0).toFixed(2);

    document.getElementById('selected-cheques-count').textContent = count;
    document.getElementById('selected-cheques-total').textContent = total;

    const chequesSelectionControls = document.getElementById('cheques-selection-controls');
    if (chequesSelectionControls) {
        if (count > 0) {
            chequesSelectionControls.classList.remove('hidden');
        } else {
            chequesSelectionControls.classList.add('hidden');
        }
    }
}

// Handler para cuando un checkbox cambia de estado
function handleCheckboxChange(chequeId, isChecked) {
    // Buscar el cheque en los datos originales (no en los filtrados/paginados)
    const cheque = datosChequesProximos.find(c => c.id === chequeId);
    if (cheque) {
        cheque.selected = isChecked; // Actualizar el estado 'selected' en el objeto original
        if (isChecked) {
            selectedCheques.set(chequeId, cheque);
        } else {
            selectedCheques.delete(chequeId);
        }
        updateSelectedChequesSummary();
    }
}

function setupChequesTabSelector() {
    const tabSelector = document.getElementById('chequesSelector');
    if (!tabSelector) {
        console.warn("Elemento #chequesSelector no encontrado.");
        return;
    }

    const tabItems = tabSelector.querySelectorAll('.tab-item');

    tabItems.forEach(item => {
        item.addEventListener('click', function () {
            tabItems.forEach(tab => tab.classList.remove('active'));
            this.classList.add('active');

            const selectedTab = this.dataset.tab;
            mostrarContenidoTabCheques(selectedTab);
        });
    });

    const initialActive = tabSelector.querySelector('.tab-item.active');
    if (initialActive) {
        mostrarContenidoTabCheques(initialActive.dataset.tab);
    }
}

function mostrarContenidoTabCheques(tab) {
    const proximosDiv = document.getElementById('content-proximos');
    const pagosDiv = document.getElementById('content-pagos');

    currentFilter = {}; // Reiniciar filtros al cambiar de pestaña
    clearFilterInputs(); // Limpiar campos de entrada del filtro

    if (tab === 'proximos') {
        proximosDiv.classList.remove('hidden');
        pagosDiv.classList.add('hidden');
        renderTablaProximos(); // Volver a renderizar al cambiar de pestaña
    } else if (tab === 'pagos') {
        proximosDiv.classList.add('hidden');
        pagosDiv.classList.remove('hidden');
        renderTablaPagos(); // Volver a renderizar al cambiar de pestaña
    }
    updateClearFilterButtonVisibility(); // Actualizar visibilidad del botón de limpiar filtro
}

// Lógica de la tarjeta de filtro
let filterCardVisible = false;
let currentActiveFilterBtn = null; // Para saber qué botón de filtro abrió la tarjeta

function toggleFilterCard(event, filterBtnId) {
    const filterCard = document.getElementById('filter-card');
    const clickedBtn = document.getElementById(filterBtnId);

    if (filterCardVisible && currentActiveFilterBtn === clickedBtn) {
        // Si se hace clic en el mismo botón y la tarjeta está visible, la ocultamos
        filterCard.classList.add('hidden');
        filterCardVisible = false;
        currentActiveFilterBtn = null;
    } else {
        // Mostrar la tarjeta y posicionarla junto al botón que se hizo clic
        filterCard.classList.remove('hidden');
        filterCardVisible = true;
        currentActiveFilterBtn = clickedBtn;

        // Posicionar la tarjeta de filtro relativa al botón
        const rect = clickedBtn.getBoundingClientRect();
        // Alinea el borde derecho de la tarjeta con el borde derecho del botón
        // y 12px debajo del botón (ajustado para el CSS)
        filterCard.style.top = `${rect.bottom + 12}px`; 
        filterCard.style.left = `${rect.right - filterCard.offsetWidth}px`; 

        // Asegurarse de que la tarjeta no se salga de la pantalla por la izquierda
        // Si el borde izquierdo de la tarjeta es menor que 0 (se sale por la izquierda)
        // o si el ancho de la tarjeta es mayor que el ancho de la ventana
        if (filterCard.offsetLeft < 0 || filterCard.offsetWidth > window.innerWidth) {
            filterCard.style.left = '10px'; // Un pequeño margen desde la izquierda
        }
    }

    event.stopPropagation(); // Prevenir que el clic en el botón cierre inmediatamente la tarjeta por el click fuera
}

// Función para aplicar los filtros
function applyFilters() {
    currentFilter = {
        numero: document.getElementById('filter-cheque-numero').value,
        destinatario: document.getElementById('filter-destinatario').value,
        tercero: document.getElementById('filter-tercero').value,
        fechaDesde: document.getElementById('filter-fecha-desde').value,
        fechaHasta: document.getElementById('filter-fecha-hasta').value,
        montoMinimo: document.getElementById('filter-monto-minimo').value,
        montoMaximo: document.getElementById('filter-monto-maximo').value
    };

    // Eliminar los valores vacíos para que no se tomen en cuenta en el filtro
    for (const key in currentFilter) {
        if (currentFilter[key] === '') {
            delete currentFilter[key];
        }
    }
    
    // Determinar qué pestaña está activa y volver a renderizar su tabla con los filtros aplicados
    const activeTab = document.querySelector('.tab-item.active');
    if (activeTab) {
        const tabName = activeTab.dataset.tab;
        if (tabName === 'proximos') {
            renderTablaProximos();
        } else if (tabName === 'pagos') {
            renderTablaPagos();
        }
    }
    
    // Ocultar la tarjeta de filtro después de aplicar los filtros
    document.getElementById('filter-card').classList.add('hidden');
    filterCardVisible = false;
    currentActiveFilterBtn = null;

    updateClearFilterButtonVisibility(); // Actualizar visibilidad del botón de limpiar filtro
}

// Función para limpiar los campos de entrada del filtro
function clearFilterInputs() {
    document.getElementById('filter-cheque-numero').value = '';
    document.getElementById('filter-destinatario').value = '';
    document.getElementById('filter-tercero').value = '';
    document.getElementById('filter-fecha-desde').value = '';
    document.getElementById('filter-fecha-hasta').value = '';
    document.getElementById('filter-monto-minimo').value = '';
    document.getElementById('filter-monto-maximo').value = '';
}

// Función para verificar si hay algún filtro activo
function hasActiveFilters() {
    // Verifica si el objeto currentFilter tiene alguna propiedad con un valor no vacío
    for (const key in currentFilter) {
        if (currentFilter.hasOwnProperty(key) && currentFilter[key] !== '' && currentFilter[key] !== undefined) {
            return true;
        }
    }
    return false;
}

// Función para actualizar la visibilidad del botón de limpiar filtro
function updateClearFilterButtonVisibility() {
    const clearBtnProximos = document.getElementById('clear-filter-btn-proximos');
    const clearBtnPagos = document.getElementById('clear-filter-btn-pagos');
    const activeTab = document.querySelector('.tab-item.active');

    if (hasActiveFilters()) {
        if (activeTab && activeTab.dataset.tab === 'proximos') {
            if (clearBtnProximos) clearBtnProximos.classList.remove('hidden');
            if (clearBtnPagos) clearBtnPagos.classList.add('hidden');
        } else if (activeTab && activeTab.dataset.tab === 'pagos') {
            if (clearBtnPagos) clearBtnPagos.classList.remove('hidden');
            if (clearBtnProximos) clearBtnProximos.classList.add('hidden');
        }
    } else {
        // Si no hay filtros activos, ocultar ambos botones
        if (clearBtnProximos) clearBtnProximos.classList.add('hidden');
        if (clearBtnPagos) clearBtnPagos.classList.add('hidden');
    }
}

// Función para manejar clics fuera de la tarjeta de filtro
function handleClickOutsideFilterCard(event) {
    const filterCard = document.getElementById('filter-card');
    const filterBtnProximos = document.getElementById('filter-btn-proximos');
    const filterBtnPagos = document.getElementById('filter-btn-pagos');
    const clearFilterBtnProximos = document.getElementById('clear-filter-btn-proximos');
    const clearFilterBtnPagos = document.getElementById('clear-filter-btn-pagos');

    // Si la tarjeta de filtro está visible y el clic fue fuera de la tarjeta y fuera de los botones de filtro
    if (filterCardVisible && 
        !filterCard.contains(event.target) && 
        event.target !== filterBtnProximos && 
        !filterBtnProximos.contains(event.target) && 
        event.target !== filterBtnPagos && 
        !filterBtnPagos.contains(event.target) &&
        event.target !== clearFilterBtnProximos && 
        ! (clearFilterBtnProximos && clearFilterBtnProximos.contains(event.target)) && 
        event.target !== clearFilterBtnPagos && 
        ! (clearFilterBtnPagos && clearFilterBtnPagos.contains(event.target))
    ) {
        filterCard.classList.add('hidden');
        filterCardVisible = false;
        currentActiveFilterBtn = null;
    }
}


document.addEventListener('DOMContentLoaded', async function () {
    if (typeof loadHeader === 'function') await loadHeader();
    if (typeof loadSidebar === 'function') {
        const role = localStorage.getItem('userRole') || 'admin'; // Asumir rol 'admin' para esta página
        await loadSidebar(role);
    }

    // Selecciona item activo en el sidebar si corresponde
    const currentPath = window.location.pathname;
    document.querySelectorAll('.sidebar-item').forEach(item => {
        const target = item.dataset.targetPage;
        if (target && currentPath.includes(target)) {
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        }
    });

    // Inicializar el tab selector
    setupChequesTabSelector();

    // Renderizado inicial basado en la pestaña activa
    const initialActiveTab = document.querySelector('.tab-item.active');
    if (initialActiveTab) {
        mostrarContenidoTabCheques(initialActiveTab.dataset.tab);
    }

    // Event listeners para los botones de acción (Cancelar y Pagar)
    const cancelSelectionBtn = document.getElementById('cancel-selection-btn');
    if (cancelSelectionBtn) {
        cancelSelectionBtn.addEventListener('click', () => {
            selectedCheques.clear(); // Limpiar el mapa de cheques seleccionados
            // Desmarcar todos los checkboxes visibles
            document.querySelectorAll('#tabla-proximos input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
            });
            // Restablecer el estado 'selected' en los datos originales
            datosChequesProximos.forEach(cheque => cheque.selected = false); 
            updateSelectedChequesSummary(); // Actualizar el resumen
        });
    }

    const paySelectedBtn = document.getElementById('pay-selected-btn');
    if (paySelectedBtn) {
        paySelectedBtn.addEventListener('click', () => {
            if (selectedCheques.size === 0) {
                alert('No hay cheques seleccionados para pagar.');
                return;
            }
            const chequeIdsToPay = Array.from(selectedCheques.keys()).join(', ');
            alert(`Se pagaron los cheques con IDs: ${chequeIdsToPay}`);
            
            // Aquí iría la lógica para procesar el pago de los cheques
            // Por ejemplo, enviar al backend, mover cheques a la lista de "pagos", etc.
            
            // Después de pagar, limpiar la selección y volver a renderizar la tabla
            selectedCheques.clear();
            datosChequesProximos.forEach(cheque => cheque.selected = false); // Restablecer el estado 'selected'
            renderTablaProximos(); // Volver a renderizar para reflejar los cambios
        });
    }

    // Event listeners para los botones de filtro
    const filterBtnProximos = document.getElementById('filter-btn-proximos');
    if (filterBtnProximos) {
        filterBtnProximos.addEventListener('click', (e) => toggleFilterCard(e, 'filter-btn-proximos'));
    }

    const filterBtnPagos = document.getElementById('filter-btn-pagos');
    if (filterBtnPagos) {
        filterBtnPagos.addEventListener('click', (e) => toggleFilterCard(e, 'filter-btn-pagos'));
    }

    const applyFilterBtn = document.getElementById('apply-filter-btn');
    if (applyFilterBtn) {
        applyFilterBtn.addEventListener('click', applyFilters);
    }

    // Adjuntar el event listener al botón de limpiar filtro (para ambos, si se clonaron)
    const clearFilterBtnProximos = document.getElementById('clear-filter-btn-proximos');
    if (clearFilterBtnProximos) {
        clearFilterBtnProximos.addEventListener('click', () => {
            clearFilterInputs();
            currentFilter = {}; 
            applyFilters(); 
        });
    }

    const clearFilterBtnPagos = document.getElementById('clear-filter-btn-pagos');
    if (clearFilterBtnPagos) {
        clearFilterBtnPagos.addEventListener('click', () => {
            clearFilterInputs();
            currentFilter = {}; 
            applyFilters(); 
        });
    }

    // Cerrar la tarjeta de filtro al hacer clic fuera
    document.addEventListener('click', handleClickOutsideFilterCard);

    // Inicializar la visibilidad del botón de limpiar filtro al cargar la página
    updateClearFilterButtonVisibility();
});