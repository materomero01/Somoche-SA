// /FRONTEND/scripts/cheques.js

import { renderTabla } from './tabla.js'; // Asegúrate que la ruta sea correcta

// Simulamos datos de cheques próximos y pagos
// Es importante que los objetos de datos tengan las 'keys' que usaremos en las columnas
const datosChequesProximos = Array.from({ length: 15 }, (_, i) => ({
    id: `prox-${i}`, // Añadimos un ID único para cada fila, necesario para tabla.js
    diasRestantes: Math.floor(Math.random() * 30) + 1,
    fechaCobro: generarFechaFutura(),
    cheque: `#${10000 + i}`,
    destinatario: `Cliente ${i + 1}`,
    banco: ['Banco Nación', 'Santander', 'Galicia'][i % 3],
    fechaPago: generarFechaPasada(), // Fecha de emisión del cheque
    importe: (Math.random() * 100 + 10).toFixed(2)
}));

const datosChequesPagos = Array.from({ length: 12 }, (_, i) => ({
    id: `pago-${i}`, // Añadimos un ID único
    fechaCobro: generarFechaPasada(),
    cheque: `#${8000 + i}`,
    destinatario: `Proveedor ${i + 1}`,
    banco: ['Banco Nación', 'Santander', 'Galicia'][i % 3],
    fechaPago: generarFechaPasada(), // Fecha de emisión del cheque
    importe: (Math.random() * 100 + 10).toFixed(2)
}));

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

function calcularTotalImportes(data) {
    return data.reduce((acc, el) => acc + parseFloat(el.importe), 0).toFixed(2);
}

function renderTablaProximos() {
    renderTabla({
        containerId: 'tabla-proximos',
        paginacionContainerId: 'paginacion-proximos', // Nuevo ID para el contenedor de paginación
        columnas: [
            { label: 'Días', key: 'diasRestantes' }, // Mapea a la propiedad 'diasRestantes'
            { label: 'Fecha Cobro', key: 'fechaCobro' },
            { label: 'Cheque', key: 'cheque' },
            { label: 'Destinatario', key: 'destinatario' },
            { label: 'Tercero (Banco)', key: 'banco' }, // Mapea a la propiedad 'banco'
            { label: 'Fecha de Emisión', key: 'fechaPago' }, // Cambiado el label a "Fecha de Emisión" para ser más claro
            { label: 'Importe', key: 'importe', class: 'text-right' } // Agregamos una clase si queremos alinear a la derecha
        ],
        datos: datosChequesProximos.map(c => ({
            ...c, // Mantener todas las propiedades del objeto original
            importe: `$${c.importe}`, // Formatear el importe aquí para mostrar '$'
            diasRestantes: `${c.diasRestantes} días` // Formatear los días aquí
        })),
        itemsPorPagina: 10, // Usamos itemsPorPagina que es el nombre del parámetro en tabla.js
        // No pasamos actions, editingRowId, onEdit ya que no son necesarios aquí
    });

    const total = calcularTotalImportes(datosChequesProximos);
    const totalDiv = document.getElementById('total-a-cobrar');
    if (totalDiv) totalDiv.textContent = `Total a cobrar: $${total}`;
}

function renderTablaPagos() {
    renderTabla({
        containerId: 'tabla-pagos',
        paginacionContainerId: 'paginacion-pagos', // Nuevo ID para el contenedor de paginación
        columnas: [
            { label: 'Fecha Cobro', key: 'fechaCobro' },
            { label: 'Cheque', key: 'cheque' },
            { label: 'Destinatario', key: 'destinatario' },
            { label: 'Tercero (Banco)', key: 'banco' },
            { label: 'Fecha de Emisión', key: 'fechaPago' },
            { label: 'Importe', key: 'importe', class: 'text-right' }
        ],
        datos: datosChequesPagos.map(c => ({
            ...c,
            importe: `$${c.importe}`
        })),
        itemsPorPagina: 10,
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
        renderTablaProximos(); // Asegúrate de renderizar cuando la pestaña se activa
    } else if (tab === 'pagos') {
        pagosDiv.classList.remove('hidden');
        proximosDiv.classList.add('hidden');
        renderTablaPagos(); // Asegúrate de renderizar cuando la pestaña se activa
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