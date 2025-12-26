// /FRONTEND/scripts/cheques.js

import { createLoadingSpinner, getCheques, showConfirmModal, toggleSpinnerVisible } from './apiPublic.js';
import { renderTabla, renderTables } from './tabla.js'; // Asegúrate que la ruta sea correcta

// Simulamos datos de cheques próximos y pagos
// Es importante que los objetos de datos tengan las 'keys' que usaremos en las columnas
let datosChequesProximos = [];

let datosChequesPagos = [];

const contentPrincipal = document.getElementById("contentPrincipal");

const userCuil = localStorage.getItem("userCuil");

const columnasProximos = [
    { label: 'Días', key: 'fecha_cheque', class: ['text-right', 'bold'], modify: (content) => calcularDiasRestantes(content) > 0? `${calcularDiasRestantes(content)} días` : calcularDiasRestantes(content) === 0? 'Hoy' : formatFecha(content) },
    { label: 'Fecha Cobro', key: 'fecha_cheque', class: [], modify: (content) => formatFecha(content) },
    { label: 'Cheque', key: 'nro_cheque', class: [] },
    { label: 'Destinatario', key: 'destinatario', class: [] },
    { label: 'Banco', key: 'tercero', class: [] },
    { label: 'Fecha de Emisión', key: 'fecha_pago', class: [], modify: (content) => formatFecha(content) },
    { label: 'Importe', key: 'importe', class: ['text-right'], modify: (content) => `$${parseImporte(content).toFixed(2)}` }
];

const columnasPagos = [
    { label: 'Fecha Cobro', key: 'fecha_cheque', class: [], modify: (content) => formatFecha(content) },
    { label: 'Cheque', key: 'nro_cheque', class: [] },
    { label: 'Destinatario', key: 'destinatario', class: [] },
    { label: 'Banco', key: 'tercero', class: [] },
    { label: 'Fecha de Emisión', key: 'fecha_pago', class: [], modify: (content) => formatFecha(content) },
    { label: 'Importe', key: 'importe', class: ['text-right'], modify: (content) => `$${parseImporte(content).toFixed(2)}` }
];

const optionsProximos = {
    containerId: 'tabla-proximos',
    paginacionContainerId: 'paginacion-proximos',
    columnas: [ columnasProximos ],
    itemsPorPagina: () => 10,
    actions: [],
    onEdit: null,
    tableType: 'proximos',
    onPageChange: null,
    checkboxColumn: false,
    checkboxColumnPosition: null,
    checkboxHeaderAction: null,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: false
}

const optionsPagos = {
    containerId: 'tabla-pagos',
    paginacionContainerId: 'paginacion-pagos',
    columnas: [ columnasPagos ],
    itemsPorPagina: () => 10,
    actions: [],
    onEdit: null,
    tableType: 'pagos',
    onPageChange: null,
    checkboxColumn: false,
    checkboxColumnPosition: null,
    checkboxHeaderAction: null,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: false
}

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

// Función para parsear el importe (remueve '$' y comas)
function parseImporte(importe) {
    if (typeof importe === 'string') {
        return parseFloat(importe.replace(/[$,]/g, '')) || 0;
    }
    return parseFloat(importe) || 0;
}

function calcularTotalImportes(data) {
    return data.reduce((acc, el) => acc + parseImporte(el.importe), 0).toFixed(2);
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

function actualizarTotal() {
    const total = calcularTotalImportes(datosChequesProximos);
    const totalDiv = document.getElementById('total-a-cobrar');
    if (totalDiv) totalDiv.textContent = `Total a cobrar: $${total}`;
}


async function setupChequesTabSelector() {
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

    // Mostrar pestaña activa inicial
    const initialActive = tabSelector.querySelector('.tab-item.active');
    if (initialActive) {
        await mostrarContenidoTabCheques(initialActive.dataset.tab);
    }
}

async function mostrarContenidoTabCheques(tab) {
    const proximosDiv = document.getElementById('content-proximos');
    const pagosDiv = document.getElementById('content-pagos');
    
    if (tab === 'proximos') {
        proximosDiv.classList.remove('hidden');
        pagosDiv.classList.add('hidden');
        try {
            datosChequesProximos = await getCheques(false, userCuil);
        } catch (error) {
            console.error("Error al cargar los cheques proximos. ", error.message);
        }
        renderTables(datosChequesProximos, 1, optionsProximos, actualizarTotal);
    } else if (tab === 'pagos') {
        pagosDiv.classList.remove('hidden');
        proximosDiv.classList.add('hidden');
        try {
            datosChequesPagos = await getCheques(true, userCuil);
        } catch (error) {
            console.error("Error al cargar los cheques pagos. ", error.message);
        }
        renderTables(datosChequesPagos, 1, optionsPagos);
    }
}

// Setup general al cargar la página

document.addEventListener('DOMContentLoaded', async function () {
    await createLoadingSpinner(contentPrincipal);

    if (typeof loadHeader === 'function') await loadHeader();
    if (typeof loadSidebar === 'function') {
        const role = localStorage.getItem('userRole') || 'chofer';
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

    // Inicializar el tab selector (ya debe estar disponible globalmente)
    await setupChequesTabSelector();

    // Renderizar la tabla inicial (la que esté activa por defecto)
    const initialTab = document.getElementById('chequesSelector')?.querySelector('.tab-item.active')?.dataset.tab;
    if (initialTab === 'pagos') {
        renderTables(datosChequesPagos, 1, optionsPagos);
    } else {
        // Fallback si no hay tab activa por defecto, o para la primera carga
        renderTables(datosChequesProximos, 1, optionsProximos, actualizarTotal);
    }
    toggleSpinnerVisible(contentPrincipal);
});