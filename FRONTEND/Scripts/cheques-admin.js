// /FRONTEND/scripts/cheques-admin.js

import { setChequesPagos, socket } from './api.js';
import { renderTabla } from './tabla.js';
import { createLoadingSpinner, getCheques, showConfirmModal, toggleSpinnerVisible } from './apiPublic.js';

// Arrays para almacenar los datos de cheques próximos y pagados
let datosChequesProximos = [];
let datosChequesPagos = [];
let chequesFueraFecha = [];

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

// Función para calcular los días restantes hasta la fecha de cobro
function calcularDiasRestantes(fechaCheque) {
    const hoy = new Date();
    const fechaCobro = new Date(fechaCheque);
    const diffTime = fechaCobro - hoy;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : 0; // Evitar días negativos
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

    renderTabla({
        containerId: 'tabla-proximos',
        paginacionContainerId: 'paginacion-proximos',
        columnas: [
            { label: 'Días', key: 'diasRestantes', class: ['text-right', 'bold'] },
            { label: 'Fecha Cobro', key: 'fecha_cheque', class: [] },
            { label: 'Cheque', key: 'nro_cheque', class: [] },
            { label: 'Destinatario', key: 'destinatario', class: [] },
            { label: 'Tercero', key: 'tercero', class: [] },
            { label: 'Fecha Emisión', key: 'fecha_pago', class: [] },
            { label: 'Chofer Nombre', key: 'nombre', class: [] },
            { label: 'Importe', key: 'importe', class: ['text-right'] }
        ],
        datos: filteredData.map(c => ({
            id: c.nro_cheque, // Usar nro_cheque como ID
            diasRestantes: calcularDiasRestantes(c.fecha_cheque) > 0? `${calcularDiasRestantes(c.fecha_cheque)} días` : 'Hoy',
            fecha_cheque: formatFecha(c.fecha_cheque),
            nro_cheque: c.nro_cheque,
            destinatario: c.destinatario,
            tercero: c.tercero,
            fecha_pago: formatFecha(c.fecha_pago),
            importe: `$${parseImporte(c.importe).toFixed(2)}`,
            nombre: c.nombre,
            selected: selectedCheques.get(c.nro_cheque)? true : false // Estado de selección
        })),
        itemsPorPagina: 10,
        checkboxColumn: true,
        checkboxColumnPosition: 'end',
        onCheckboxChange: handleCheckboxChange
    });

    // Actualizar el total a cobrar
    const total = calcularTotalImportesGlobal(filteredData);
    const totalDiv = document.getElementById('selected-cheques-total');
    if (totalDiv) totalDiv.textContent = total;

    // Actualizar el resumen de cheques seleccionados
    updateSelectedChequesSummary();
    updateClearFilterButtonVisibility();
}

function renderTablaPagos() {
    const filteredData = filtrarCheques(datosChequesPagos, currentFilter);

    renderTabla({
        containerId: 'tabla-pagos',
        paginacionContainerId: 'paginacion-pagos',
        columnas: [
            { label: 'Fecha Cobro', key: 'fecha_cheque', class: [] },
            { label: 'Cheque', key: 'nro_cheque', class: [] },
            { label: 'Destinatario', key: 'destinatario', class: [] },
            { label: 'Tercero', key: 'tercero', class: [] },
            { label: 'Fecha Pago', key: 'fecha_pago', class: [] },
            { label: 'Chofer Nombre', key: 'nombre', class: [] },
            { label: 'Importe', key: 'importe', class: ['text-right'] }
        ],
        datos: filteredData.map(c => ({
            id: c.nro_cheque,
            fecha_cheque: formatFecha(c.fecha_cheque),
            nro_cheque: c.nro_cheque,
            destinatario: c.destinatario,
            tercero: c.tercero,
            fecha_pago: formatFecha(c.fecha_pago),
            importe: `$${parseImporte(c.importe).toFixed(2)}`,
            nombre: c.nombre
        })),
        itemsPorPagina: 10,
        checkboxColumn: false
    });
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

function handleCheckboxChange(nroCheque, isChecked) {
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
}

async function mostrarContenidoTabCheques(tab) {
    const proximosDiv = document.getElementById('content-proximos');
    const pagosDiv = document.getElementById('content-pagos');
    const selectCantidad = document.getElementById("selectCheques");
    const inputCantCheques = document.getElementById('inputSelectCheques');
    

    currentFilter = {};
    clearFilterInputs();

    if (tab === 'proximos') {
        proximosDiv.classList.remove('hidden');
        pagosDiv.classList.add('hidden');
        if (datosChequesProximos.length < 1) {
            try {
                datosChequesProximos = await getCheques(false, null);
                datosChequesProximos.forEach(cheque => {
                    cheque.selected = false;
                    cheque.importe = parseImporte(cheque.importe);
                });
                if(datosChequesProximos.length > 0){
                    datosChequesProximos.filter(
                                cheque =>formatFecha(cheque.fecha_cheque) < formatFecha(new Date())
                            ).forEach( cheque => chequesFueraFecha.push(cheque.nro_cheque));
                }
                    
                if(chequesFueraFecha.length > 0){
                    await setChequesPagos(chequesFueraFecha);
                    datosChequesProximos = datosChequesProximos.filter(cheque => !chequesFueraFecha.includes(cheque.nro_cheque))
                }
            } catch (error) {
                console.error(error.message);
            }
        }
        renderTablaProximos();
    } else if (tab === 'pagos') {
        proximosDiv.classList.add('hidden');
        pagosDiv.classList.remove('hidden');
        try {
            const cantidad = selectCantidad.value !== "Otro"? selectCantidad.value : inputCantCheques.value;
            datosChequesPagos = await getCheques(true, null, cantidad);
            datosChequesPagos.forEach(cheque => {
                cheque.importe = parseImporte(cheque.importe);
            });
        } catch (error) {
            console.error(error.message);
        }
        renderTablaPagos();
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
    console.log(filterCard.style.left);
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

    const activeTab = document.querySelector('.tab-item.active');
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

    const initialActiveTab = document.querySelector('.tab-item.active');
    if (initialActiveTab) {
        await mostrarContenidoTabCheques(initialActiveTab.dataset.tab);
    }

    toggleSpinnerVisible(contentPrincipal);

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
        if (selectCantidad.value !== "Otro"){
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
                        ).forEach( cheque => datosChequesPagos.push(cheque));
                    datosChequesProximos = datosChequesProximos.filter(
                        cheque => !selectedCheques.has(cheque.nro_cheque)
                    );
                    const chequeIdsToPay = Array.from(selectedCheques.keys()).join(', ');
                    showConfirmModal(`Se marcaron como pagos los cheques con número: ${chequeIdsToPay}`);

                }
            } catch (error){
                console.log(error.message);
            }
            
            selectedCheques.clear();
            clearFilterBtnProximos.click();
        });
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
        let actualizo = false;
        pagos.pagosArray.forEach( pago => {
            if (pago.tipo === 'cheque' && !datosChequesProximos.find(c => c.nro_cheque === pago.comprobante) && !pago.cliente_cuit){
                datosChequesProximos.push(pago);
                actualizo = true;
            };
        });
        if (actualizo) {
            await renderTablaProximos();
            showConfirmModal("Se actualizaron los pagos del chofer");
        }
    });

    document.addEventListener('click', handleClickOutsideFilterCard);
    updateClearFilterButtonVisibility();
});