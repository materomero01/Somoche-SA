// /scripts/cheques-admin.js

import { setChequesPagos, socket, setupChoferAutocomplete, fetchAllChoferes, fetchProveedores, updatePagos } from './api.js';
import { renderTabla, renderTables, enterEditMode, handleEdit, setupTableEventListeners, editingRowId, resetEditingState } from './tabla.js';
import { createLoadingSpinner, getCheques, showConfirmModal, toggleSpinnerVisible } from './apiPublic.js';

// Arrays para almacenar los datos de cheques próximos y pagados
let datosChequesProximos = [];
let datosChequesPagos = [];

let chequesFueraFecha = [];

let dataChoferes = [];
let dataProveedores = [];

let currentChequesPage = 1;

// Mapa para mantener el estado de los cheques seleccionados
const selectedCheques = new Map(); // Map<nro_cheque, chequeObject>

const contentPrincipal = document.getElementById("contentPrincipal");

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

const columnasProximos = [
    { label: 'Cliente', key: 'nombre_cliente', noEdit: true, class: ['bold']},
    { label: 'Días', key: 'fecha_cheque', class: ['text-right', 'bold'], noEdit: true, modify: (content) => calcularDiasRestantes(content) > 0 ? `${calcularDiasRestantes(content)} días` : calcularDiasRestantes(content) === 0 ? 'Hoy' : formatFecha(content) },
    { label: 'Fecha Cobro', key: 'fecha_cheque', noEdit: true, class: [], modify: (content) => formatFecha(content) },
    { label: 'Cheque', key: 'nro_cheque', noEdit: true, class: [] },
    { label: 'Destinatario', key: 'destinatario', noEdit: true, class: [] },
    { label: 'Banco', key: 'tercero', noEdit: true, class: [] },
    { label: 'Fecha Emisión', key: 'fecha_pago', noEdit: true, class: [], modify: (content) => formatFecha(content) },
    { label: 'Entregado a', key: 'nombre', id:'autocompleteEntrega', autocompleteFunc: true, class: [] },
    { label: 'Importe', key: 'importe', noEdit: true, class: ['text-right'], modify: (content) => `$${parseImporte(content).toFixed(2)}` }
];

const columnasPagos = [
    { label: 'Cliente', key: 'nombre_cliente', noEdit: true, class: ['bold']},
    { label: 'Fecha Cobro', key: 'fecha_cheque', class: [], modify: (content) => formatFecha(content) },
    { label: 'Cheque', key: 'nro_cheque', class: [] },
    { label: 'Destinatario', key: 'destinatario', class: [] },
    { label: 'Banco', key: 'tercero', class: [] },
    { label: 'Fecha Pago', key: 'fecha_pago', class: [], modify: (content) => formatFecha(content) },
    { label: 'Entregado a', key: 'nombre', class: [] },
    { label: 'Importe', key: 'importe', class: ['text-right'], modify: (content) => `$${parseImporte(content).toFixed(2)}` }
];

const handleCheckboxChange = (nroCheque, isChecked) => {
    const cheque = datosChequesProximos.find(c => c.nro_cheque === nroCheque);
    if (cheque) {
        cheque.selected = isChecked;
        if (isChecked) {
            selectedCheques.set(nroCheque, cheque);
        } else {
            selectedCheques.delete(nroCheque);
        }
        updateSelectedChequesSummary();
    }
}

const actionsCheques = [{
        icon: 'bi bi-pencil',
        tooltip: 'Editar',
        classList: ['edit-btn'],
        id: null,
        handler: (rowData) => {
            enterEditMode(rowData, 'cheques', () => {renderTablaProximos();
                if (editingRowId) {
                    const dataEntregar = [...dataChoferes, ...dataProveedores];
                    setupChoferAutocomplete('autocompleteEntrega', dataEntregar);
                }
            },
            async (payload) => await changeEntregado(payload));
        }
    }];

const optionsProximos = {
    containerId: 'tabla-proximos',
    paginacionContainerId: 'paginacion-proximos',
    get columnas(){
        if (document.querySelector('#chequesSelectorTerceros .tab-item.active')?.dataset.tab === "tercero")
            return [columnasProximos];
        else
            return [columnasProximos.filter(col => col.key !== 'nombre_cliente')];
    },
    itemsPorPagina: () => 10,
    get actions(){
        if (document.querySelector('#chequesSelectorTerceros .tab-item.active')?.dataset.tab === "tercero")
            return actionsCheques;
        else
            return [];
    },
    onEdit: (id, field, value) => handleEdit(id, field, value, 'cheques'),
    tableType: 'proximos',
    onPageChange: (page) => { currentChequesPage = page; },
    checkboxColumn: true,
    checkboxColumnPosition: "end",
    checkboxHeaderAction: null,
    onCheckboxChange: handleCheckboxChange,
    uploadFactura: null,
    useScrollable: false
}

const optionsPagos = {
    containerId: 'tabla-pagos',
    paginacionContainerId: 'paginacion-pagos',
    get columnas(){
        if (document.querySelector('#chequesSelectorTerceros .tab-item.active')?.dataset.tab === "tercero")
            return [columnasPagos];
        else
            return [columnasPagos.filter(col => col.key !== 'nombre_cliente')];
    },
    itemsPorPagina: () => 10,
    actions: [],
    onEdit: null,
    tableType: 'pagos',
    onPageChange: null,
    checkboxColumn: false,
    checkboxColumnPosition: "",
    checkboxHeaderAction: null,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: false
}

// Función para calcular los días restantes hasta la fecha de cobro
function calcularDiasRestantes(fechaCheque) {
    const hoy = new Date();
    const fechaCobro = new Date(fechaCheque);
    const diffTime = fechaCobro - hoy;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays; // Evitar días negativos
}

// Función para formatear fechas ISO a YYYY-MM-DD
function formatFecha(fecha) {
    return new Date(fecha).toISOString().split('T')[0];
}

// Función para parsear el importe (remueve '$' y comas)
function parseImporte(importe) {
    if (typeof importe === 'string') {
        return parseFloat(importe.replace(/[$,]/g, '')) || 0;
    }
    return parseFloat(importe) || 0;
}

// Función para filtrar los datos de cheques según los criterios
function filtrarCheques(data, filters) {
    return data.filter(cheque => {
        let match = true;

        if (filters.numero && !cheque.nro_cheque.toString().toLowerCase().includes(filters.numero.toLowerCase())) {
            match = false;
        }
        if (filters.destinatario && !cheque.destinatario.toLowerCase().includes(filters.destinatario.toLowerCase())) {
            match = false;
        }
        if (filters.tercero && !cheque.tercero.toLowerCase().includes(filters.tercero.toLowerCase())) {
            match = false;
        }
        // Comparar fechas
        if (filters.fechaDesde && formatFecha(cheque.fecha_cheque) < filters.fechaDesde) {
            match = false;
        }
        if (filters.fechaHasta && formatFecha(cheque.fecha_cheque) > filters.fechaHasta) {
            match = false;
        }
        // Comparar montos
        if (filters.montoMinimo !== undefined && filters.montoMinimo !== '' && parseImporte(cheque.importe) < parseFloat(filters.montoMinimo)) {
            match = false;
        }
        if (filters.montoMaximo !== undefined && filters.montoMaximo !== '' && parseImporte(cheque.importe) > parseFloat(filters.montoMaximo)) {
            match = false;
        }
        return match;
    });
}

function renderTablaProximos() {
    let filteredData = filtrarCheques(datosChequesProximos, currentFilter);
    filteredData = filteredData.map(c => ({
        ...c,
        id: c.nro_cheque,
        selected: selectedCheques.get(c.nro_cheque) ? true : false
    }));

    renderTables(filteredData, currentChequesPage, optionsProximos);

    // Actualizar el total a cobrar
    const total = calcularTotalImportesGlobal(filteredData);
    const totalDiv = document.getElementById('total-cheques-proximos');
    if (totalDiv) totalDiv.textContent = `Total: $${total}`;

    // Actualizar el resumen de cheques seleccionados
    updateSelectedChequesSummary();
    updateClearFilterButtonVisibility();
}

function renderTablaPagos() {
    const filteredData = filtrarCheques(datosChequesPagos, currentFilter);
    renderTables(filteredData, 1, optionsPagos);
    updateClearFilterButtonVisibility();
}

function calcularTotalImportesGlobal(data) {
    return data.reduce((acc, el) => acc + parseImporte(el.importe), 0).toFixed(2);
}

function updateSelectedChequesSummary() {
    const count = selectedCheques.size;
    const total = Array.from(selectedCheques.values()).reduce((sum, cheque) => sum + parseImporte(cheque.importe), 0).toFixed(2);

    const countElement = document.getElementById('selected-cheques-count');
    const totalElement = document.getElementById('selected-cheques-total');
    if (countElement) countElement.textContent = count;
    if (totalElement) totalElement.textContent = `${total}`;

    const chequesSelectionControls = document.getElementById('cheques-selection-controls');
    if (chequesSelectionControls) {
        if (count > 0) {
            chequesSelectionControls.classList.remove('hidden');
        } else {
            chequesSelectionControls.classList.add('hidden');
        }
    }
}

async function changeEntregado(payload) {
    const input = document.getElementById("autocompleteEntrega");
    const cuil = input?.dataset.selectedChoferCuil || null;

    if (!cuil && input.value !== ""){
        showConfirmModal("Por favor, selecciona un chofer o proveedor de la lista de sugerencias.");
        return;
    }

    const idCheque = payload.nro_cheque;
    
    const choferEncontrado = dataChoferes.find(c => c.cuil === cuil);
    const esChofer = choferEncontrado && choferEncontrado.tipo_trabajador === "Chofer";
    let destino = "general";
    if (esChofer){
        destino = await new Promise((resolve) => {
            showConfirmModal(`Desea entregar el cheque como pago del Chofer ${choferEncontrado.nombre}?`, "confirm", () => {resolve("chofer")}, () => {resolve("general")});
        });
    }

    const bodyRequest = {
        [idCheque]: {
            tipo: "cheque",
            destino: destino,
            chofer_cuil: choferEncontrado? cuil : null,
            proveedor_cuit: !choferEncontrado ? cuil : null
        }
    };

    try {
        const response = await updatePagos(bodyRequest);
        const result = await response.json();

        if (response.ok) {
            datosChequesProximos.find(cheque => cheque.nro_cheque === idCheque).nombre = payload.nombre;
            showConfirmModal("Entrega de cheque actualizada con éxito.");
        } else {
            console.error("Errores del backend:", result.errors);
            showConfirmModal(result.message);
        }
    } catch (error) {
        console.error("Error de red:", error);
        showConfirmModal("Error al intentar modificar la entrega.");
    }
}

function setupChequesTabSelector() {
    const tabSelectorEstado = document.getElementById('chequesSelector'); // próximos/pagos
    const tabSelectorTipo = document.getElementById('chequesSelectorTerceros'); // propios/terceros

    if (!tabSelectorEstado || !tabSelectorTipo) return;

    const allTabs = [...tabSelectorEstado.querySelectorAll('.tab-item'), ...tabSelectorTipo.querySelectorAll('.tab-item')];

    allTabs.forEach(item => {
        item.addEventListener('click', function () {
            // Buscamos el contenedor padre de la pestaña clickeada
            const parent = this.closest('.tab-selector');
            const siblingTabs = parent.querySelectorAll('.tab-item');
            
            // 1. Activar la pestaña correcta dentro de su propio grupo
            siblingTabs.forEach(tab => tab.classList.remove('active'));
            this.classList.add('active');

            // 2. Lógica especial: Si cambiamos el TIPO (propio/tercero), 
            // reseteamos el ESTADO a "proximos"
            if (parent.id === 'chequesSelectorTerceros') {
                const estadoTabs = tabSelectorEstado.querySelectorAll('.tab-item');
                estadoTabs.forEach(t => t.classList.remove('active'));
                // Buscamos la pestaña que tiene data-tab="proximos" y la activamos
                const tabProximos = Array.from(estadoTabs).find(t => t.dataset.tab === 'proximos');
                if (tabProximos) tabProximos.classList.add('active');
            }

            // 3. Obtenemos ambos valores actuales para la consulta
            const estadoActivo = tabSelectorEstado.querySelector('.tab-item.active').dataset.tab;
            const tipoActivo = tabSelectorTipo.querySelector('.tab-item.active').dataset.tab;

            mostrarContenidoTabCheques(estadoActivo, tipoActivo);
        });
    });
}

async function mostrarContenidoTabCheques(estado, tipo) {
    const proximosDiv = document.getElementById('content-proximos');
    const pagosDiv = document.getElementById('content-pagos');
    const selectCantidad = document.getElementById("selectCheques");
    const inputCantCheques = document.getElementById('inputSelectCheques');

    currentFilter = {};
    clearFilterInputs();

    // Definimos si está pagado según el estado del selector
    const esPagado = (estado === 'pagos');

    if (estado === 'proximos') {
        proximosDiv.classList.remove('hidden');
        pagosDiv.classList.add('hidden');
        
        try {
            // Siempre consultamos ya que el "tipo" puede haber cambiado
            // Si quieres optimizar con caché, deberías guardar datosChequesProximosPropio y datosChequesProximosTercero por separado
            let resultado = await getCheques(false, null, null, tipo);
            
            datosChequesProximos = resultado.map(cheque => ({
                ...cheque,
                selected: false,
                importe: parseImporte(cheque.importe)
            }));

            renderTablaProximos();
        } catch (error) {
            console.error("Error obteniendo próximos:", error.message);
        }

    } else if (estado === 'pagos') {
        
        
        try {
            const cantidad = selectCantidad.value !== "Otro" ? selectCantidad.value : inputCantCheques.value;
            let resultado = await getCheques(true, null, cantidad, tipo);
            
            datosChequesPagos = resultado.map(cheque => ({
                ...cheque,
                importe: parseImporte(cheque.importe)
            }));

            renderTablaPagos();
            proximosDiv.classList.add('hidden');
            pagosDiv.classList.remove('hidden');
        } catch (error) {
            console.error("Error obteniendo pagos:", error.message);
        }
    }
    
    updateClearFilterButtonVisibility();
}

let filterCardVisible = false;
let currentActiveFilterBtn = null;

function toggleFilterCard(event, filterBtnId) {
    const filterCard = document.getElementById('filter-card');
    const clickedBtn = document.getElementById(filterBtnId);

    if (!filterCard || !clickedBtn) return;

    if (filterCardVisible && currentActiveFilterBtn === clickedBtn) {
        filterCard.classList.add('hidden');
        filterCardVisible = false;
        currentActiveFilterBtn = null;
    } else {
        filterCard.classList.remove('hidden');
        filterCardVisible = true;
        currentActiveFilterBtn = clickedBtn;

        // Calcular la posición del filtro
        positionFilterCard(filterCard, clickedBtn);

        // Asegurar que el filtro no se salga de la pantalla
        const cardRect = filterCard.getBoundingClientRect();
        if (cardRect.left < 10) {
            filterCard.style.left = '10px';
        } else if (cardRect.right > window.innerWidth - 10) {
            filterCard.style.left = `${window.innerWidth - cardRect.width - 10}px`;
        }
    }

    event.stopPropagation();
}

function positionFilterCard(filterCard, button) {
    const rect = button.getBoundingClientRect();
    const cardWidth = filterCard.offsetWidth;
    const buttonWidth = rect.width;

    // Posicionar el filtro justo debajo del botón, alineado al centro
    const top = rect.bottom + window.scrollY + 12; // 12px para el espacio
    const left = rect.left + window.scrollX + (buttonWidth - cardWidth); // Centrar a la izquierda respecto al botón

    filterCard.style.top = `${top}px`;
    filterCard.style.left = `${left}px`;
}

function applyFilters() {
    currentFilter = {
        numero: document.getElementById('filter-cheque-numero')?.value || '',
        destinatario: document.getElementById('filter-destinatario')?.value || '',
        tercero: document.getElementById('filter-tercero')?.value || '',
        fechaDesde: document.getElementById('filter-fecha-desde')?.value || '',
        fechaHasta: document.getElementById('filter-fecha-hasta')?.value || '',
        montoMinimo: document.getElementById('filter-monto-minimo')?.value || '',
        montoMaximo: document.getElementById('filter-monto-maximo')?.value || ''
    };

    for (const key in currentFilter) {
        if (currentFilter[key] === '') {
            delete currentFilter[key];
        }
    }

    if (editingRowId) resetEditingState();
    currentChequesPage = 1;

    const activeTab = document.querySelector('#chequesSelector .tab-item.active');

    if (activeTab) {
        const tabName = activeTab.dataset.tab;
        if (tabName === 'proximos') {
            renderTablaProximos();
        } else if (tabName === 'pagos') {
            renderTablaPagos();
        }
    }

    const filterCard = document.getElementById('filter-card');
    if (filterCard) {
        filterCard.classList.add('hidden');
        filterCardVisible = false;
        currentActiveFilterBtn = null;
    }
    updateClearFilterButtonVisibility();
}

function clearFilterInputs() {
    const inputs = [
        'filter-cheque-numero',
        'filter-destinatario',
        'filter-tercero',
        'filter-fecha-desde',
        'filter-fecha-hasta',
        'filter-monto-minimo',
        'filter-monto-maximo'
    ];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
}

function hasActiveFilters() {
    for (const key in currentFilter) {
        if (currentFilter.hasOwnProperty(key) && currentFilter[key] !== '' && currentFilter[key] !== undefined) {
            return true;
        }
    }
    return false;
}

function updateClearFilterButtonVisibility() {
    const clearBtnProximos = document.getElementById('clear-filter-btn-proximos');
    const clearBtnPagos = document.getElementById('clear-filter-btn-pagos');
    const activeTab = document.querySelector('#chequesSelector .tab-item.active');

    if (hasActiveFilters()) {
        if (activeTab && activeTab.dataset.tab === 'proximos') {
            if (clearBtnProximos) clearBtnProximos.classList.remove('hidden');
            if (clearBtnPagos) clearBtnPagos.classList.add('hidden');
        } else if (activeTab && activeTab.dataset.tab === 'pagos') {
            if (clearBtnPagos) clearBtnPagos.classList.remove('hidden');
            if (clearBtnProximos) clearBtnProximos.classList.add('hidden');
        }
    } else {
        if (clearBtnProximos) clearBtnProximos.classList.add('hidden');
        if (clearBtnPagos) clearBtnPagos.classList.add('hidden');
    }
}

function handleClickOutsideFilterCard(event) {
    const filterCard = document.getElementById('filter-card');
    const filterBtnProximos = document.getElementById('filter-btn-proximos');
    const filterBtnPagos = document.getElementById('filter-btn-pagos');
    const clearFilterBtnProximos = document.getElementById('clear-filter-btn-proximos');
    const clearFilterBtnPagos = document.getElementById('clear-filter-btn-pagos');

    if (filterCardVisible &&
        filterCard && !filterCard.contains(event.target) &&
        filterBtnProximos && event.target !== filterBtnProximos &&
        !filterBtnProximos.contains(event.target) &&
        filterBtnPagos && event.target !== filterBtnPagos &&
        !filterBtnPagos.contains(event.target) &&
        clearFilterBtnProximos && event.target !== clearFilterBtnProximos &&
        !(clearFilterBtnProximos && clearFilterBtnProximos.contains(event.target)) &&
        clearFilterBtnPagos && event.target !== clearFilterBtnPagos &&
        !(clearFilterBtnPagos && clearFilterBtnPagos.contains(event.target))
    ) {
        filterCard.classList.add('hidden');
        filterCardVisible = false;
        currentActiveFilterBtn = null;
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    if (typeof loadHeader === 'function') await loadHeader();
    if (typeof loadSidebar === 'function') {
        const role = localStorage.getItem('userRole') || 'admin';
        await loadSidebar(role);
    }

    const currentPath = window.location.pathname;
    document.querySelectorAll('.sidebar-item').forEach(item => {
        const target = item.dataset.targetPage;
        if (target && currentPath.includes(target)) {
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        }
    });

    await createLoadingSpinner(contentPrincipal);

    setupChequesTabSelector();
    setupTableEventListeners();

    const tabSelectorEstado = document.getElementById('chequesSelector');
    const tabSelectorTipo = document.getElementById('chequesSelectorTerceros');

    if (tabSelectorEstado && tabSelectorTipo) {
        const estadoInicial = tabSelectorEstado.querySelector('.tab-item.active').dataset.tab;
        const tipoInicial = tabSelectorTipo.querySelector('.tab-item.active').dataset.tab;

        // 3. Ejecutamos la carga inicial con esos valores (por defecto: proximos y propio)
        await mostrarContenidoTabCheques(estadoInicial, tipoInicial);
        toggleSpinnerVisible(contentPrincipal);
    }

    

    const cancelSelectionBtn = document.getElementById('cancel-selection-btn');
    if (cancelSelectionBtn) {
        cancelSelectionBtn.addEventListener('click', () => {
            selectedCheques.clear();
            document.querySelectorAll('#tabla-proximos input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
            });
            datosChequesProximos.forEach(cheque => cheque.selected = false);
            updateSelectedChequesSummary();
        });
    }

    const clearFilterBtnProximos = document.getElementById('clear-filter-btn-proximos');
    if (clearFilterBtnProximos) {
        clearFilterBtnProximos.addEventListener('click', () => {
            clearFilterInputs();
            currentFilter = {};
            applyFilters();
        });
    }

    const selectCantidad = document.getElementById("selectCheques");
    const inputCantCheques = document.getElementById('inputSelectCheques');

    inputCantCheques?.addEventListener("change", () => {
        if (inputCantCheques.value > 0)
            mostrarContenidoTabCheques('pagos');
    })

    selectCantidad?.addEventListener("change", () => {
        if (selectCantidad.value !== "Otro") {
            inputCantCheques.classList.add("hidden");
            inputCantCheques.value = '';
            mostrarContenidoTabCheques('pagos');
        } else
            inputCantCheques.classList.remove("hidden");
    })

    const paySelectedBtn = document.getElementById('pay-selected-btn');
    if (paySelectedBtn) {
        paySelectedBtn.addEventListener('click', async () => {
            if (selectedCheques.size === 0) {
                showConfirmModal('No hay cheques seleccionados para pagar.');
                return;
            }
            try {
                const response = await setChequesPagos(Array.from(selectedCheques.keys()));
                if (response) {
                    // Filtrar datosChequesProximos para remover los cheques seleccionados
                    if (datosChequesPagos.length > 0)
                        datosChequesProximos.filter(
                            cheque => selectedCheques.has(cheque.nro_cheque)
                        ).forEach(cheque => datosChequesPagos.push(cheque));
                    datosChequesProximos = datosChequesProximos.filter(
                        cheque => !selectedCheques.has(cheque.nro_cheque)
                    );
                    const chequeIdsToPay = Array.from(selectedCheques.keys()).join(', ');
                    showConfirmModal(`Se marcaron como pagos los cheques con número: ${chequeIdsToPay}`);

                }
            } catch (error) {
                console.log(error.message);
            }

            selectedCheques.clear();
            clearFilterBtnProximos.click();
        });
    }

    try {
        dataChoferes = await fetchAllChoferes();
        dataProveedores = await fetchProveedores();
    } catch (error) {
        console.log(error.message);
    }

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

    const clearFilterBtnPagos = document.getElementById('clear-filter-btn-pagos');
    if (clearFilterBtnPagos) {
        clearFilterBtnPagos.addEventListener('click', () => {
            clearFilterInputs();
            currentFilter = {};
            applyFilters();
        });
    }
    // Añadir listener para redimensionamiento o zoom
    window.addEventListener('resize', () => {
        if (filterCardVisible && currentActiveFilterBtn) {
            const filterCard = document.getElementById('filter-card');
            positionFilterCard(filterCard, currentActiveFilterBtn);
        }
    });

    socket.on('nuevoPago', async (pagos) => {
    // Obtenemos qué tipo de cheques está viendo el usuario actualmente
    const tipoActual = document.querySelector('#chequesSelectorTerceros .tab-item.active').dataset.tab; // 'propio' o 'tercero'
    let actualizo = false;

    pagos.pagosArray.forEach(pago => {
        if (pago.tipo.toLowerCase() === 'cheque') {
            const esTercero = !pago.cuit; 
            const tipoPago = esTercero ? 'tercero' : 'propio';
            console.log(pago);
            if (tipoPago === tipoActual && !datosChequesProximos.find(c => c.nro_cheque === pago.nro_cheque)) {
                datosChequesProximos.push(pago);
                actualizo = true;
            }
        }
    });

    if (actualizo) {
        if (editingRowId) return;
        await renderTablaProximos();
        showConfirmModal("Se actualizaron los cheques próximos");
    }
});

    socket.on('deletePago', async (pago) => {
        console.log(pago);
        if (pago.tipo.toLowerCase() === 'cheque') {
            const lengthOriginal = datosChequesProximos.length;
            
            // Filtramos por ID sin importar si tiene CUIT o no
            console.log()
            datosChequesProximos = datosChequesProximos.filter(c => c.nro_cheque !== pago.id);
            // Solo renderizamos si realmente se eliminó algo
            if (lengthOriginal !== datosChequesProximos.length) {
                if (editingRowId){
                    if (editingRowId === pago.id)
                        resetEditingState();
                    else
                        return;
                }
                currentChequesPage = 1;
                await renderTablaProximos();
                showConfirmModal("Se actualizaron los cheques próximos");
            }
        }
    });
    
    socket.on('updatePagos', async ({ updatedPagos }) => {
        const activeTab = document.querySelector('#chequesSelector .tab-item.active');
        
        // 1. Guard Clause: Si no estamos en la pestaña correcta, no hacemos nada
        if (activeTab?.dataset.tab !== "proximos") return;

        // 2. Extraer solo los IDs de los cheques actualizados (Set para búsqueda rápida)
        const chequesActualizadosIds = new Set(
            updatedPagos
                .filter(p => p.tipo === "cheque")
                .map(p => p.id)
        );

        // 3. Verificar si alguno de los cheques en pantalla está en el Set
        const requiereActualizacion = datosChequesProximos.some(cheque => 
            chequesActualizadosIds.has(cheque.nro_cheque)
        );

        if (requiereActualizacion) {
            if (editingRowId) resetEditingState();
            
            // Refrescamos la pestaña
            activeTab.click();
            showConfirmModal("Se actualizaron los cheques próximos");
        }
    });

    socket.on('marcarPago', async (pago) => {
        length = datosChequesProximos.length;
        datosChequesProximos = datosChequesProximos.filter(p => {
            if (pago.nros.includes(p.nro_cheque)) {
                datosChequesPagos.push(p);
                return false;
            }
            return true;
        });
        
        if (length !== datosChequesProximos.length) {
            datosChequesPagos.sort((a, b) => new Date(a.fecha_cheque) - new Date(b.fecha_cheque));
            if (editingRowId) resetEditingState();
            await renderTablaProximos();
            await renderTablaPagos();
            showConfirmModal("Se marcaron cheques como pagos y se actualizaron las tablas");
        }
    });


    document.addEventListener('click', handleClickOutsideFilterCard);
    updateClearFilterButtonVisibility();
});
