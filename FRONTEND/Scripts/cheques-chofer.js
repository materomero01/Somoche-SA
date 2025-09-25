// /FRONTEND/scripts/cheques.js

import { getCheques, showConfirmModal } from './apiPublic.js';
import { renderTabla } from './tabla.js'; // Asegúrate que la ruta sea correcta

// Simulamos datos de cheques próximos y pagos
// Es importante que los objetos de datos tengan las 'keys' que usaremos en las columnas
let datosChequesProximos = [];

let datosChequesPagos = [];

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
    return diffDays >= 0 ? diffDays : 0; // Evitar días negativos
}

// Función para formatear fechas ISO a YYYY-MM-DD
function formatFecha(fecha) {
    return new Date(fecha).toISOString().split('T')[0];
}

function renderTablaProximos() {

    renderTabla({
        containerId: 'tabla-proximos',
        paginacionContainerId: 'paginacion-proximos',
        columnas: [
            { label: 'Días', key: 'diasRestantes', class: ['text-right', 'bold'] },
            { label: 'Fecha Cobro', key: 'fecha_cheque', class: [] },
            { label: 'Cheque', key: 'nro_cheque', class: [] },
            { label: 'Destinatario', key: 'destinatario', class: [] },
            { label: 'Tercero (Banco)', key: 'tercero', class: [] },
            { label: 'Fecha de Emisión', key: 'fecha_pago', class: [] },
            { label: 'Importe', key: 'importe', class: ['text-right'] }
        ],
        datos: datosChequesProximos.map(c => ({
            id: c.nro_cheque,
            diasRestantes: calcularDiasRestantes(c.fecha_cheque) > 0 ? `${calcularDiasRestantes(c.fecha_cheque)} días` : 'Hoy',
            fecha_cheque: formatFecha(c.fecha_cheque),
            nro_cheque: c.nro_cheque,
            destinatario: c.destinatario,
            tercero: c.tercero,
            fecha_pago: formatFecha(c.fecha_pago),
            importe: `$${parseImporte(c.importe).toFixed(2)}`
        })),
        itemsPorPagina: 10
    });

    const total = calcularTotalImportes(datosChequesProximos);
    const totalDiv = document.getElementById('total-a-cobrar');
    if (totalDiv) totalDiv.textContent = `Total a cobrar: $${total}`;
}

function renderTablaPagos() {
    renderTabla({
        containerId: 'tabla-pagos',
        paginacionContainerId: 'paginacion-pagos',
        columnas: [
            { label: 'Fecha Cobro', key: 'fecha_cheque', class: [] },
            { label: 'Cheque', key: 'nro_cheque', class: [] },
            { label: 'Destinatario', key: 'destinatario', class: [] },
            { label: 'Tercero (Banco)', key: 'tercero', class: [] },
            { label: 'Fecha de Emisión', key: 'fecha_pago', class: [] },
            { label: 'Importe', key: 'importe', class: ['text-right'] }
        ],
        datos: datosChequesPagos.map(c => ({
            id: c.nro_cheque,
            fecha_cheque: formatFecha(c.fecha_cheque),
            nro_cheque: c.nro_cheque,
            destinatario: c.destinatario,
            tercero: c.tercero,
            fecha_pago: formatFecha(c.fecha_pago),
            importe: `$${parseImporte(c.importe).toFixed(2)}`
        })),
        itemsPorPagina: 10
    });
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

    // Mostrar pestaña activa inicial
    const initialActive = tabSelector.querySelector('.tab-item.active');
    if (initialActive) {
        mostrarContenidoTabCheques(initialActive.dataset.tab);
    }
}

function mostrarContenidoTabCheques(tab) {
    const proximosDiv = document.getElementById('content-proximos');
    const pagosDiv = document.getElementById('content-pagos');

    if (tab === 'proximos') {
        proximosDiv.classList.remove('hidden');
        pagosDiv.classList.add('hidden');
        renderTablaProximos();
    } else if (tab === 'pagos') {
        pagosDiv.classList.remove('hidden');
        proximosDiv.classList.add('hidden');
        renderTablaPagos();
    }
}

async function loadChequesData() {
    try {
        const userCuil = localStorage.getItem("userCuil");
        // if (!userCuil) {
        //     throw new Error('No se encontró userCuil en localStorage');
        // }
        const data = await getCheques(null, userCuil);
        if (data && data.length > 0) {
            const today = formatFecha(new Date());
            datosChequesProximos = data.filter(cheque => formatFecha(cheque.fecha_cheque) >= today);
            datosChequesPagos = data.filter(cheque => formatFecha(cheque.fecha_cheque) < today);
        } else {
            datosChequesProximos = [];
            datosChequesPagos = [];
        }
    } catch (error) {
        console.error('Error al cargar cheques:', error.message);
        datosChequesProximos = [];
        datosChequesPagos = [];
    }
}
// Setup general al cargar la página

document.addEventListener('DOMContentLoaded', async function () {
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

    // Cargar datos iniciales
    await loadChequesData();

    // Inicializar el tab selector (ya debe estar disponible globalmente)
    setupChequesTabSelector();

    // Renderizar la tabla inicial (la que esté activa por defecto)
    const initialTab = document.getElementById('chequesSelector')?.querySelector('.tab-item.active')?.dataset.tab;
    if (initialTab === 'proximos') {
        renderTablaProximos();
    } else if (initialTab === 'pagos') {
        renderTablaPagos();
    } else {
        // Fallback si no hay tab activa por defecto, o para la primera carga
        renderTablaProximos();
    }
});