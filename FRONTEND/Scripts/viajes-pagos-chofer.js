import { getPagosCuil, getViajes, getResumenCuil, showConfirmModal, getFactura } from "./apiPublic.js";
import { parsePagos, parseViaje, columnasPagos } from "./resumenes.js";
import { renderTabla } from "./tabla.js";
import { viajesFactura } from "./subir-factura.js";

let mockViajes = [];
let mockPagos = [];
let pagosResumenes = [];
let viajesResumenes = [];
let choferData = {};

let loadingSpinner;
let mainContent;

const choferCuil = localStorage.getItem("userCuil");
const trabajador = localStorage.getItem("userTrabajador");

let currentViajesPagosPage = 1;
let currentResumenesPage = 1;

// Configuración de columnas para la tabla de viajes
export const columnasViajes = [
    { label: "Fecha", key: "fecha" },
    { label: "Comprobante", key: "comprobante" },
    { label: "Campo", key: "campo" },
    { label: "KM", key: "km" },
    { label: "Tarifa", key: "tarifa" },
    { label: "Variación", key: "variacion" },
    { label: "Toneladas", key: "toneladas" },
    { label: "Faltante", key: "diferencia" },
    { label: "Importe", key: "importe", class: "text-right" },
    { label: "Comisión", key: "comision", class: "text-right" },
    { label: "IVA", key: "iva", class: "text-right" },
];

function actualizarTotales(viajes, pagos, tablesTab) {
    const subtotal = viajes.reduce((sum, viaje) => sum + (viaje.importe || 0), 0);
    const iva = viajes.reduce((sum, viaje) => sum + (viaje.iva || 0), 0);
    const totalViajes = subtotal + iva;
    const totalPagos = pagos?.reduce((sum, pago) => sum + (pago.importe || 0), 0);
    let totalAPagar = totalViajes - totalPagos;
    if (Math.abs(totalAPagar) < 0.01) totalAPagar = 0;

    const subtotalContainer = tablesTab === "viajesPagos" ? document.getElementById("subtotal") : document.getElementById("subtotal-resumen");
    if (subtotalContainer)
        subtotalContainer.textContent = `Subtotal: $${subtotal.toFixed(2)}`;
    const ivaContainer = tablesTab === "viajesPagos" ? document.getElementById("iva") : document.getElementById("iva-resumen");
    if (ivaContainer)
        ivaContainer.textContent = `IVA (21%): $${iva.toFixed(2)}`;
    const totalViajesContainer = tablesTab === "viajesPagos" ? document.getElementById("total-viajes") : document.getElementById("total-viajes-resumen");
    if (totalViajesContainer)
        totalViajesContainer.textContent = `Total Viajes: $${totalViajes.toFixed(2)}`;
    const totalPagarContainer = tablesTab === "viajesPagos" ? document.getElementById("total-cobrar") : document.getElementById("total-resumen");
    if (totalPagarContainer)
        totalPagarContainer.textContent = `${tablesTab === "viajesPagos" ? "Total a Pagar: " : "Saldo del Resumen: "}${("$" + totalAPagar.toFixed(2)).replace("$-", "-$")}`;
}

function renderTables(tablesTab) {
    let columnas = trabajador !== 'Monotributista'
        ? columnasViajes
        : columnasViajes.filter(col => col.key !== "iva");

    renderTabla({
        containerId: "viajesPagos-table",
        columnas: columnas,
        datos: mockViajes.map(v => ({
            id: v.id,
            fecha: v.fecha,
            comprobante: v.comprobante,
            campo: v.campo,
            km: v.km,
            tarifa: `$${v.tarifa}`,
            variacion: `${v.variacion * 100}%`,
            toneladas: v.toneladas,
            diferencia: v.diferencia,
            importe: `$${v.importe.toFixed(2)}`,
            comision: `-$${v.comision.toFixed(2)}`,
            iva: v.iva ? `$${v.iva.toFixed(2)}` : undefined,
            factura_id: v.factura_id
        })),
        itemsPorPagina: 5,
        actions: [],
        tableType: "viajes",
        checkboxColumn: true,
        checkboxColumnPosition: "end",
        useScrollable: true,
        descargarFactura: descargarFactura,
        changeDataFactura: changeDataFactura,
        onCheckboxChange: (itemId, itemChecked) => { 
            if (itemChecked)
                viajesFactura.push(itemId); 
            else
                viajesFactura.pop(itemId);
        }
    });

    renderTabla({
        containerId: "pagos-table",
        columnas: columnasPagos,
        datos: mockPagos.map(p => ({
            id: p.id,
            fechaPago: p.fechaPago,
            tipo: p.tipo,
            descripcion: p.descripcion,
            importe: `$${p.importe.toFixed(2)}`.replace('$-', '-$')
        })),
        itemsPorPagina: 5,
        actions: [],
        tableType: "pagos",
        useScrollable: true
    });

    actualizarTotales(mockViajes, mockPagos, tablesTab);
}

function renderTablesResumenes(tablesTab, currentPage = 1){
    let columnas = trabajador !== 'Monotributista'
        ? columnasViajes
        : columnasViajes.filter(col => col.key !== "iva");

     // Obtener todos los grupos únicos, ordenados de más reciente a más antiguo
    const grupos = [...new Set([
        ...viajesResumenes.map(v => v.group),
        ...pagosResumenes.map(p => p.group)
    ])].sort().reverse();

    // Seleccionar el grupo actual según la página
    const grupoActual = grupos[Math.min(currentPage - 1, grupos.length - 1)] || null;
    currentResumenesPage = currentPage;

    // Filtrar viajes y pagos para el grupo actual
    const resumenViajes = viajesResumenes.find(r => r.group === grupoActual) || { viajes: [] };
    const resumenPagos = pagosResumenes.find(r => r.group === grupoActual) || { pagos: [] };

    // Renderizar tabla de viajes
    renderTabla({
        containerId: "viajes-table-resumenes",
        paginacionContainerId: "paginacion-resumenes",
        columnas: columnas,
        datos: resumenViajes.viajes.map(v => ({
            id: v.id,
            fecha: v.fecha,
            comprobante: v.comprobante,
            campo: v.campo,
            km: v.km,
            tarifa: `$${parseFloat(v.tarifa).toFixed(2)}`,
            variacion: `${(v.variacion * 100).toFixed(2)}%`,
            toneladas: v.toneladas,
            diferencia: v.diferencia,
            importe: `$${v.importe.toFixed(2)}`,
            comision: `-$${v.comision.toFixed(2)}`,
            iva: v.iva ? `$${v.iva.toFixed(2)}` : undefined,
            factura_id: v.factura_id
        })),
        itemsPorPagina: resumenViajes.viajes.length || 1,
        currentPage: currentPage,
        actions: [],
        tableType: "viajes",
        checkboxColumn: true,
        checkboxColumnPosition: "end",
        useScrollable: true,
        descargarFactura: descargarFactura,
        changeDataFactura: changeDataFactura,
        onCheckboxChange: (itemId, itemChecked) => { 
            if (itemChecked)
                viajesFactura.push(itemId); 
            else
                viajesFactura.pop(itemId);
        }
    });

    // Renderizar tabla de pagos
    renderTabla({
        containerId: "pagos-table-resumenes",
        paginacionContainerId: "paginacion-resumen",
        columnas: columnasPagos,
        datos: resumenPagos.pagos.map(p => ({
            id: p.id,
            fechaPago: p.fechaPago,
            tipo: p.tipo,
            descripcion: p.descripcion,
            importe: `$${p.importe.toFixed(2)}`.replace('$-', '-$')
        })),
        itemsPorPagina: resumenPagos.pagos.length || 1,
        currentPage: currentPage,
        actions: [],
        tableType: "pagos",
        useScrollable: true
    });

    actualizarTotales(resumenViajes.viajes, resumenPagos.pagos, tablesTab);

    // Renderizar paginación
    renderPaginacionResumenes(currentPage, grupos.length > 0 ? grupos.length : 1);
}

function renderPaginacionResumenes(currentPage, totalPaginas) {
    const paginacionContainer = document.getElementById("paginacion-resumenes");
    if (!paginacionContainer) {
        console.error("Contenedor de paginación 'paginacion-resumenes' no encontrado.");
        return;
    }

    paginacionContainer.innerHTML = "";

    const btnPrev = document.createElement("button");
    btnPrev.textContent = "<";
    btnPrev.classList.add("pagination-button");
    btnPrev.disabled = currentPage === 1;
    btnPrev.onclick = () => renderTablesResumenes("resumenes", currentPage - 1);
    paginacionContainer.appendChild(btnPrev);

    const maxButtonsToShow = 5;
    let startPageNum, endPageNum;

    if (totalPaginas <= maxButtonsToShow) {
        startPageNum = 1;
        endPageNum = totalPaginas;
    } else {
        if (currentPage <= Math.ceil(maxButtonsToShow / 2)) {
            startPageNum = 1;
            endPageNum = maxButtonsToShow;
        } else if (currentPage + Math.floor(maxButtonsToShow / 2) >= totalPaginas) {
            startPageNum = totalPaginas - maxButtonsToShow + 1;
            endPageNum = totalPaginas;
        } else {
            startPageNum = currentPage - Math.floor(maxButtonsToShow / 2);
            endPageNum = currentPage + Math.floor(maxButtonsToShow / 2);
        }
    }

    if (startPageNum > 1) {
        paginacionContainer.appendChild(botonPaginaResumen(1, currentPage));
        if (startPageNum > 2) {
            const ellipsis = document.createElement("span");
            ellipsis.textContent = "...";
            ellipsis.classList.add("pagination-ellipsis");
            paginacionContainer.appendChild(ellipsis);
        }
    }

    for (let i = startPageNum; i <= endPageNum; i++) {
        paginacionContainer.appendChild(botonPaginaResumen(i, currentPage));
    }

    if (endPageNum < totalPaginas) {
        if (endPageNum < totalPaginas - 1) {
            const ellipsis = document.createElement("span");
            ellipsis.textContent = "...";
            ellipsis.classList.add("pagination-ellipsis");
            paginacionContainer.appendChild(ellipsis);
        }
        paginacionContainer.appendChild(botonPaginaResumen(totalPaginas, currentPage));
    }

    const btnNext = document.createElement("button");
    btnNext.textContent = ">";
    btnNext.classList.add("pagination-button");
    btnNext.disabled = currentPage === totalPaginas;
    btnNext.onclick = () => renderTablesResumenes("resumenes", currentPage + 1);
    paginacionContainer.appendChild(btnNext);
}

function botonPaginaResumen(n, currentPage) {
    const btn = document.createElement("button");
    btn.textContent = n;
    btn.classList.add("pagination-button");
    if (n === currentPage) {
        btn.classList.add("active");
    }
    btn.onclick = () => renderTablesResumenes("resumenes", n);
    return btn;
}

async function setHistorial(chofer) {
    choferData = { cuil: choferCuil, trabajador: trabajador };
    const cantidad = document.getElementById("selectResumenes").value;
    if (!cantidad) {
        showConfirmModal("Seleccione una cantidad de resúmenes válida.");
        return;
    }

    try {
        const response = await getResumenCuil(choferData.cuil, parseInt(cantidad));
        if (response.ok) {
            const data = await response.json();
            pagosResumenes = data.pagos.map(resumen => ({
                group: resumen.group,
                pagos: resumen.pagos.map(p => parsePagos(p))
            }));
            viajesResumenes = data.viajes.map(resumen => ({
                group: resumen.group,
                viajes: resumen.viajes.map(v => parseViaje(v))
            }));
            console.log(viajesResumenes);
            renderTablesResumenes("resumenes");
        } else {
            showConfirmModal(`Error al cargar los últimos ${cantidad} resúmenes`);
        }
    } catch (error) {
        console.error('Error en setHistorial:', error.message);
        showConfirmModal(`Ocurrió un error al obtener los últimos ${cantidad} resúmenes`);
    }
}

function changeDataFactura(facturaId){
    if (!facturaId) {
        console.warn('No se recibió el facturaId en los encabezados');
    } else {
        mockViajes.forEach(v =>{
            if (viajesFactura.includes(v.id))
                v.factura_id = facturaId;
        });
        
        viajesResumenes[currentResumenesPage - 1].viajes.forEach(r => {
            if (viajesFactura.includes(r.id))
                r.factura_id = facturaId;
        });
        renderTables('viajesPagos');
        renderTablesResumenes("resumenes", currentResumenesPage);
    }
}

// Función para descargar factura
async function descargarFactura(viaje) {
    if (viaje && viaje.factura_id) {
        try {
            const response = await getFactura(localStorage.getItem('userCuil'), viaje.factura_id);
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al obtener la factura');
            }

            const data = await response.blob();

            const url = window.URL.createObjectURL(data);

            // Abrir el PDF en una nueva pestaña
            const pdfWindow = window.open(url, '_blank');
        } catch (error){
            console.log(error.message);
            showConfirmModal("No se pudo obtener la factura para descargar");
        }
    }
}

// --- Lógica de Pestañas ---
function setupViajesResumenesTabSelector() {
    const tabSelector = document.getElementById('viajesResumenesSelector');
    if (!tabSelector) {
        console.warn("Elemento #viajesResumenesSelector no encontrado. La funcionalidad de pestañas no se inicializará.");
        return;
    }

    const tabItems = tabSelector.querySelectorAll('.tab-item');

    tabItems.forEach(item => {
        item.addEventListener('click', function () {
            tabItems.forEach(tab => tab.classList.remove('active'));
            this.classList.add('active');

            const selectedTab = this.dataset.tab;
            handleTabContentDisplay(selectedTab);
        });
    });

    const initialActive = tabSelector.querySelector('.tab-item.active');
    if (initialActive) {
        handleTabContentDisplay(initialActive.dataset.tab);
    } else if (tabItems.length > 0) {
        tabItems[0].classList.add('active');
        handleTabContentDisplay(tabItems[0].dataset.tab);
    }
}

async function handleTabContentDisplay(selectedTab) {
    const viajesPagosContent = document.getElementById('content-viajes');
    const resumenesContent = document.getElementById('content-resumenes');

    if (selectedTab === 'viajesPagos') {
        if (mockViajes?.length === 0) {
            try {
                const response = await getViajes(choferCuil);
                if (response.ok) {
                    const data = await response.json();
                    mockViajes = data.viajes.map(c => parseViaje(c));
                } else {
                    showConfirmModal("Error al cargar los viajes y pagos");
                    return;
                }
            } catch (error) {
                console.log(error.message);
                showConfirmModal("Error al cargar los viajes");
                return;
            }
        }
        if (mockPagos?.length === 0) {
            try {
                const response = await getPagosCuil(choferCuil);
                if (response.ok) {
                    const data = await response.json();
                    mockPagos = data.map(c => parsePagos(c));
                } else {
                    showConfirmModal("Error al cargar los viajes y pagos");
                    return;
                }
            } catch (error) {
                console.log(error.message);
                showConfirmModal("Error al cargar los viajes");
                return;
            }
        }
        viajesPagosContent.classList.remove('hidden');
        resumenesContent.classList.add('hidden');
        if (mainContent) mainContent.classList.add("hidden");
        if (loadingSpinner) loadingSpinner.classList.remove("hidden");
        await renderTables("viajesPagos");
        if (mainContent) mainContent.classList.remove("hidden");
        if (loadingSpinner) loadingSpinner.classList.add("hidden");
    } else if (selectedTab === 'resumenes') {
        viajesPagosContent.classList.add('hidden');
        resumenesContent.classList.remove('hidden');
        if(loadingSpinner){
            loadingSpinner.classList.remove("hidden");
            loadingSpinner.childNodes[2].textContent = "Cargando resumenes...";
        }
        if (mainContent) mainContent.classList.add("hidden");
        await setHistorial({ cuil: choferCuil, trabajador: trabajador });
        if(loadingSpinner){
            loadingSpinner.classList.add("hidden");
            loadingSpinner.childNodes[2].textContent = "Cargando datos...";
        }
        if (mainContent) mainContent.classList.remove("hidden");
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

    loadingSpinner = document.getElementById('loading-spinner');
    mainContent = document.getElementById('contenido');

    if (loadingSpinner) loadingSpinner.classList.remove("hidden");
    if (mainContent) mainContent.classList.add("hidden");
    try {
        setupViajesResumenesTabSelector();

        const selectCantidad = document.getElementById("selectResumenes");

        selectCantidad?.addEventListener("change", async () => {
            if(loadingSpinner){
                loadingSpinner.classList.remove("hidden");
                loadingSpinner.childNodes[2].textContent = "Cargando resumenes...";
            }
            if (mainContent) mainContent.classList.add("hidden");
            await setHistorial();
            if(loadingSpinner){
                loadingSpinner.classList.add("hidden");
                loadingSpinner.childNodes[2].textContent = "Cargando datos...";
            }
            if (mainContent) mainContent.classList.remove("hidden");
        })

    } catch (error){
        console.error('Error de red o desconocido al obtener datos de los viajes:', error);
        showConfirmModal('Error de conexión al cargar los viajes.');
        if (mainContent) mainContent.innerHTML = `<p class="error-message">Error de conexión al cargar los datos.</p>`;
    }
});