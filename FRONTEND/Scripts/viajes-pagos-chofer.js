import { changeSpinnerText, createLoadingSpinner, getPagosCuil, getViajes, showConfirmModal, toggleSpinnerVisible } from "./apiPublic.js";
import { parsePagos, parseViaje, columnasPagos, columnasViajes, setHistorial } from "./resumenes.js";
import { renderTabla } from "./tabla.js";
import { viaje, initializeFacturaUpload} from "./subir-factura.js";

let mockViajes = [];
let mockPagos = [];
let choferData = {
    cuil: localStorage.getItem("userCuil") || null,
    trabajador: localStorage.getItem("userTrabajador") || null
};

let pagosOpen = true;

const mainContent = document.getElementById('contenido');

const accionesViajes = [
    {
        icon: "bi bi-download",
        tooltip:"Descargar archivos",
        classList: ['navigate-btn'],
        id: null,
        handler: (item) => {
            viaje.push(item); // Establece el viaje actual
            initializeFacturaUpload(
                changeDataFactura,
                null,
                null,
                "viajesChofer"
            );
        }
    }
];

const checkboxHeaderActionUpload = {
    icon: 'bi bi-file-earmark-arrow-up',
    tooltip: 'Subir factura para los viajes seleccionados',
    id: 'facturaBtn',
    classList: ['btn-upload', 'checkbox-cell', 'factura-cell'],
    handler: selectedRows => {
        if (selectedRows.length === 0) {
            showConfirmModal('Por favor, seleccione al menos un viaje para subir la factura.');
            return;
        }

        initializeFacturaUpload(changeDataFactura, null, null, "viajesChofer", selectedRows.map( r =>  r.comprobante));
    }
}

function actualizarTotales(viajes = mockViajes, pagos = mockPagos) {
    const subtotal = viajes.reduce((sum, viaje) => sum + (viaje.saldo || 0), 0);
    const iva = choferData.trabajador !== "Monotribustista" ? viajes.reduce((sum, viaje) => sum + (viaje.iva || 0), 0) : 0;
    const totalViajes = subtotal + iva;
    const totalPagos = pagos?.reduce((sum, pago) => sum + (pago.importe || 0), 0);
    let totalAPagar = totalViajes - totalPagos;
    if (Math.abs(totalAPagar) < 0.01) totalAPagar = 0;

    const subtotalContainer = document.getElementById("subtotal");
    if (subtotalContainer)
        subtotalContainer.textContent = `Subtotal: $${subtotal.toFixed(2)}`;
    const ivaContainer = document.getElementById("iva");
    if (ivaContainer)
        ivaContainer.textContent = `IVA (21%): $${iva.toFixed(2)}`;
    const totalViajesContainer = document.getElementById("total-viajes");
    if (totalViajesContainer)
        totalViajesContainer.textContent = `Total Viajes: $${totalViajes.toFixed(2)}`;
    const totalPagarContainer = document.getElementById("total-cobrar");
    if (totalPagarContainer)
        totalPagarContainer.textContent = `Total a Cobrar: ${("$" + totalAPagar.toFixed(2)).replace("$-", "-$")}`;
}

function renderTables() {
    let columnas = choferData.trabajador !== 'Monotributista'
        ? columnasViajes
        : columnasViajes.filter(col => col.key !== "iva");
    columnas = columnas.filter( col => !["cargado", "descargado"].includes(col.key));

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
            faltante: v.faltante,
            importe: `$${v.importe.toFixed(2)}`,
            comision: `$${v.comision.toFixed(2)}`.replace('$-','-$'),
            saldo: `$${v.saldo.toFixed(2)}`,
            iva: v.iva ? `$${v.iva.toFixed(2)}` : 0,
            factura_id: v.factura_id,
            cuil: v.cuil,
            carta_porte: v.carta_porte
        })),
        itemsPorPagina: pagosOpen? null : 8,
        actions: accionesViajes,
        tableType: "viajes",
        checkboxColumn: true,
        checkboxColumnPosition: "end",
        useScrollable: true,
        uploadFactura: true,
        checkboxHeaderAction: checkboxHeaderActionUpload,
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

    actualizarTotales();
}

function changeDataFactura(facturaId, selectedRows){
    if (!facturaId) {
        console.warn('No se recibió el facturaId en los encabezados');
    } else {
        mockViajes.forEach(v =>{
            if (selectedRows.includes(v.id))
                v.factura_id = facturaId;
        });

        renderTables();
    }
}

// --- Lógica de Pestañas ---
async function setupViajesResumenesTabSelector() {
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
        await handleTabContentDisplay(initialActive.dataset.tab);
    } else if (tabItems.length > 0) {
        tabItems[0].classList.add('active');
        await handleTabContentDisplay(tabItems[0].dataset.tab);
    }
}

async function handleTabContentDisplay(selectedTab) {
    const viajesPagosContent = document.getElementById('content-viajes');
    const resumenesContent = document.getElementById('content-resumenes');

    if (selectedTab === 'viajesPagos') {
        viajesPagosContent.classList.remove('hidden');
        resumenesContent.classList.add('hidden');
        if (mockViajes?.length === 0) {
            try {
                const response = await getViajes(choferData.cuil);
                if (response.ok) {
                    const data = await response.json();
                    mockViajes = data.viajes.map(c => parseViaje(c));
                } else {
                    showConfirmModal("Error al cargar los viajes y pagos");
                    return;
                }
            } catch (error) {
                console.log(error.message);
                return;
            }
        }
        if (mockPagos?.length === 0) {
            try {
                const response = await getPagosCuil(choferData.cuil);
                if (response.ok) {
                    const data = await response.json();
                    mockPagos = data.map(c => parsePagos(c));
                } else {
                    showConfirmModal("Error al cargar los viajes y pagos");
                    return;
                }
            } catch (error) {
                console.log(error.message);
                return;
            }
        }

        await renderTables();
    } else if (selectedTab === 'resumenes') {
        viajesPagosContent.classList.add('hidden');
        resumenesContent.classList.remove('hidden');
        changeSpinnerText(mainContent, "Cargando resumenes...");
        toggleSpinnerVisible(mainContent);
        await setHistorial(choferData);
        toggleSpinnerVisible(mainContent);
        changeSpinnerText(mainContent)
    }
}

// Setup general al cargar la página
document.addEventListener('DOMContentLoaded', async function () {
    await createLoadingSpinner(mainContent)
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

    if (choferData.trabajador === "Monotributista"){
        document.getElementById("subtotal").classList.add("hidden");
        document.getElementById("iva").classList.add("hidden");
    }

    const togglePagosArea = document.getElementById('togglePagosArea');
    togglePagosArea.style.cursor = 'pointer';
    const tablaPagos = document.getElementById('pagos-table');
    
    // Toggle pagos area
    togglePagosArea?.addEventListener('click', () => {
        togglePagosArea.classList.toggle('active');
        tablaPagos.classList.toggle('hidden');
        pagosOpen = !pagosOpen;
        renderTables();
    });

    try {
        await setupViajesResumenesTabSelector();
        const selectCantidad = document.getElementById("selectResumenes");
        const inputCantResumenes = document.getElementById('inputSelectResumenes');

        inputCantResumenes?.addEventListener("change", () => {
            if (inputCantResumenes.value > 0)
                handleTabContentDisplay('resumenes');
        })

        selectCantidad?.addEventListener("change", () => {
            if (selectCantidad.value !== "Otro"){
                inputCantResumenes.classList.add("hidden");
                handleTabContentDisplay('resumenes');
            } else
                inputCantResumenes.classList.remove("hidden");
        })

    } catch (error){
        console.error('Error de red o desconocido al obtener datos de los viajes:', error);
        if (mainContent) mainContent.innerHTML = `<p class="error-message">Error de conexión al cargar los datos.</p>`;
    } finally {
        toggleSpinnerVisible(mainContent);
    }
});