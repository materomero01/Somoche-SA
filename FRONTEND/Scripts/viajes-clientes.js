import { cargarNombreChofer, deleteModal, actualizarTotales, generatedUrls } from "./viajes-pagos.js";
import { editingRowId, enterEditMode, handleEdit } from "./choferes-clientes.js";
import { generarFactura, getViajesCliente } from "./api.js";
import { getFactura, showConfirmModal } from "./apiPublic.js";
import { renderTabla } from "./tabla.js";
import { actualizarValores, columnasViajes, formatFecha, parseViaje } from "./resumenes.js";

let loadingSpinner;
let mainContent;

let clienteData = [];
let viajesData = [];

let viajesHistorialData = [];

let currentViajesClientesPage = 1;
let currentViajesHistorialPage = 1;

// Acciones para la tabla de viajes
const accionesViajes = [
    {
        icon: "bi bi-pencil",
        tooltip: "Editar viaje",
        handler: (item) => {
            enterEditMode({ ...item, clienteCuit: clienteData.cuit }, 'viajesCliente');
        }
    },
    {
        icon: "bi bi-trash",
        tooltip: "Eliminar viaje",
        handler: (item, tr) => {
            showConfirmModal("¿Estás seguro de eliminar este viaje?", "delete", () => {
                viajesData = viajesData.filter(v => v.id !== item.id);
                renderizarTablaVC(viajesData);
                actualizarTotales(viajesData);
            });
        }
    }
];

// --- Lógica de la barra de búsqueda ---
function setupSearchBar(searchBarId) {
    const searchInput = document.querySelector(`#${searchBarId} .search-input`);
    const searchIcon = document.querySelector(`#${searchBarId} .search-icon`);

    if (searchInput && searchIcon) {
        const performSearch = () => {
            const searchTerm = searchInput.value.toLowerCase();
            let filteredData = [];

            filteredData = viajesData.filter(viaje =>
                formatFecha(viaje.fecha)?.includes(searchTerm) ||
                viaje.comprobante?.toLowerCase().includes(searchTerm) ||
                viaje.campo?.toLowerCase().includes(searchTerm)
            );
            currentViajesClientesPage = 1;
            renderizarTablaVC(filteredData, 1);
        };

        searchIcon.addEventListener('click', performSearch);
        searchInput.addEventListener('input', performSearch);
    } else {
        console.warn(`Elementos de la barra de búsqueda para '${searchBarId}' no encontrados.`);
    }
}

export function renderizarTablaVC(viajesDataRender = viajesData, currentPage = 1, tableType = "viajes"){
    if (tableType === 'viajes')
        currentViajesClientesPage = currentPage;
    else
        currentViajesHistorialPage = currentPage;

    let columnas = columnasViajes;

    if (editingRowId)
        columnas = columnasViajes.filter(col => !["diferencia", "importe", "comision", "iva"].includes(col.key));

    renderTabla({
        containerId: tableType === 'viajes'? 'clientesViajes-table' : 'clientesViajesHistorial-table',
        paginacionContainerId: tableType === 'viajes'? 'paginacion-viajes' : 'paginacion-viajesHistorial',
        datos: viajesDataRender.map(v => ({
                        id: v.id,
                        fecha: v.fecha,
                        comprobante: v.comprobante,
                        campo: v.campo,
                        km: v.km,
                        tarifa: !editingRowId? `$${v.tarifa}`: v.tarifa,
                        variacion: !editingRowId? `${v.variacion * 100}%` : v.variacion,
                        toneladas: v.toneladas,
                        cargado: v.cargado,
                        descargado: v.descargado,
                        diferencia: v.diferencia,
                        importe: `$${v.importe.toFixed(2)}`,
                        comision: `$${v.comision.toFixed(2)}`,
                        iva: `$${v.iva.toFixed(2)}`,
                        factura_id: v.factura_id,
    })),
        columnas: columnas,
        itemsPorPagina: 8,
        actions: tableType === 'viajes'? accionesViajes : [],
        editingRowId: tableType === 'viajes'? editingRowId : null,
        onEdit: tableType === 'viajes'? (id, field, value) => handleEdit(id, field, value, 'viajesCliente') : null,
        tableType: 'viajesCliente',
        checkboxColumn: true,
        checkboxColumnPosition: "end",
        generateFactura: handleGenerateInvoice,
        descargarFactura: descargarFactura,
        currentPage: currentPage,
        onPageChange: (page) => { tableType === 'viajes'? currentViajesClientesPage = page : currentViajesHistorialPage = page; }
    });

    if ( tableType === 'viajes')
        actualizarTotales(viajesDataRender);
}

async function cargarTablaCliente(){
    if (clienteData.cuit){
        try {
            const response = await getViajesCliente(clienteData.cuit);
            const data = await response.json();
            if (!response.ok) {
                showConfirmModal(data.message);
                deleteModal("viajesClientesModal","contentModalViajes");
            }
            viajesData = data.viajes.map(c => {
                return parseViaje(c);
            });
            console.log(viajesData);
        } catch (error) {
            console.log(error.message);
        }
    }
    renderizarTablaVC(viajesData);
}

// Handler for Generate Invoice button
async function handleGenerateInvoice(data) {
    const selectedRows = data;
    console.log('Selected rows:', JSON.stringify(selectedRows, null, 2));
    if (selectedRows.length === 0) {
        showConfirmModal('Por favor, seleccione al menos un viaje para generar la factura.');
        return;
    }

    // Get client CUIT from localStorage
    const selectedClientCUIT = clienteData.cuit;
    console.log('Selected client CUIT:', selectedClientCUIT);

    if (!selectedClientCUIT || selectedClientCUIT.replace(/[^0-9]/g, '').length !== 11) {
        showConfirmModal('Error: CUIT del cliente no disponible o inválido. Por favor, seleccione un cliente en la tabla de clientes.');
        return;
    }

    // Validate and clean fields
    for (const row of selectedRows) {
        const tarifa = parseFloat(row.tarifa?.replace(/[^0-9.]/g, '')); // Clean tarifa
        const importe = parseFloat(row.importe?.replace(/[^0-9.]/g, '')); // Clean importe
        const iva = parseFloat(row.iva?.replace(/[^0-9.]/g, '')); // Clean iva
        if (isNaN(tarifa)) {
            showConfirmModal(`Error: Tarifa inválida en viaje: ${row.campo || 'Sin campo'}`);
            return;
        }
        if (isNaN(importe)) {
            showConfirmModal(`Error: Importe inválido en viaje: ${row.campo || 'Sin campo'}`);
            return;
        }
        if (isNaN(iva)) {
            showConfirmModal(`Error: IVA inválido en viaje: ${row.campo || 'Sin campo'}`);
            return;
        }
    }

    const servicios = selectedRows.map((row, index) => {
        const importe = parseFloat(row.importe.replace(/[^0-9.]/g, '')); // Clean importe
        const iva = parseFloat(row.iva.replace(/[^0-9.]/g, '')); // Clean iva
        const subtotal = importe; // Importe is the subtotal
        const subtotalConIVA = (importe + iva).toFixed(2); // Subtotal + IVA
        return {
            codigo: `V${index + 1}`,
            descripcion: `Transporte - ${row.campo || 'Sin campo'} (${row.fecha})`,
            cantidad: row.toneladas, // Per trip; change to row.cargado if billing by tonnage
            unidad: 'Toneladas',
            precioUnit: importe.toFixed(2),
            bonif: '0.00',
            subtotal: subtotal.toFixed(2),
            ivaId: 5, // 21% IVA
            subtotalConIVA: subtotalConIVA
        };
    });

    const invoiceData = {
        ptoVta: 12,
        docNro: selectedClientCUIT,
        comprobante: selectedRows.map(r => ({ id: r.id })),
        servicios,
        tributos: [],
        fechaEmision: formatDate(new Date()), // AAAAMMDD
        periodoDesde: formatDate(new Date(), '/'), // DD/MM/YYYY
        periodoHasta: formatDate(new Date(), '/'), // DD/MM/YYYY
        fechaVtoPago: formatDate(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), '/'), // 10 days
        condicionVenta: 'Efectivo'
    };

    console.log('Invoice data to send:', JSON.stringify(invoiceData, null, 2));

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        showConfirmModal('Error: No se encontró token de autenticación. Por favor, inicia sesión nuevamente.');
        return;
    }

    try {
        const response = await generarFactura(invoiceData);

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error al generar factura');
        }
        console.log('Encabezados recibidos:', Object.fromEntries(response.headers));
        // Obtener el facturaId desde el encabezado
        const facturaId = response.headers.get('X-Factura-Id');
        if (!facturaId) {
            console.warn('No se recibió el facturaId en los encabezados');
        } else {
            console.log('Factura ID:', facturaId);
        }

        viajesData.forEach(v => {
            if (selectedRows.some(row => row.id === v.id)) {
                v.factura_id = facturaId;
            }
        });
        renderizarTablaVC(viajesData, currentViajesClientesPage);
        const data = await response.blob();

        const url = window.URL.createObjectURL(data);

        // Abrir el PDF en una nueva pestaña
        const pdfWindow = window.open(url, '_blank');

        
        
        // Liberar la URL del blob después de abrir la pestaña
        if (!pdfWindow) {
            console.error('No se pudo abrir la ventana del navegador');
            // Opcional: Mostrar un mensaje al usuario
            showConfirmModal('No se pudo abrir la pestaña para mostrar el PDF');
        }
    } catch (error) {
        console.error('Error:', error.message);
        showConfirmModal('Error al generar la factura: ' + error.message);
        // No realizar ninguna acción que cause un refresco
    }
}

// Date formatting helper
function formatDate(date, separator = '') {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return separator ? `${day}${separator}${month}${separator}${year}` : `${year}${month}${day}`;
}

// Función para descargar factura
async function descargarFactura(viaje) {
    if (viaje && viaje.factura_id) {
        try {
            const response = await getFactura(clienteData.cuit, viaje.factura_id);
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al obtener la factura');
            }

            const data = await response.blob();

            const url = window.URL.createObjectURL(data);

            generatedUrls.push(url);

            // Abrir el PDF en una nueva pestaña
            const pdfWindow = window.open(url, '_blank');
        } catch (error){
            console.log(error.message);
            showConfirmModal("No se pudo obtener la factura para descargar");
        }
    }
}


export async function handleSaveEditViajesCliente() {
    showConfirmModal("Viaje editado con exito");
}

async function setHistorial() {
    const cantidad = document.getElementById("selectResumenes").value;
    if (!cantidad) {
        showConfirmModal("Seleccione una cantidad de resúmenes válida.");
        return;
    }

    try {
        const response = await getViajesCliente(clienteData.cuit, cantidad);
        const data = await response.json();
        if (!response.ok) {
            showConfirmModal(data.message);
            document.getElementById("back-historialBtn").click();
        }

        viajesHistorialData = data.viajes.map(c => {
            return parseViaje(c);
        });

        console.log(viajesHistorialData);
        renderizarTablaVC(viajesHistorialData, 1, 'historial');
    } catch (error) {
        showConfirmModal(`Ocurrió un error al obtener los últimos ${cantidad} resúmenes`);
        console.error('Error en setHistorial:', error.message);
    }
}

// Inicializar
export async function inicializarModaCliente(data) {
    document.body.classList.add("no-scroll");
    clienteData = data;

    cargarNombreChofer(clienteData.nombre);

    const closeButton = document.getElementById('closeBtnViaje');
    if (closeButton) {
        closeButton.onclick = () => {
            deleteModal("viajesClientesModal","contentModalViajes");
        };
    }

    loadingSpinner = document.getElementById('loading-spinner');
    mainContent = document.getElementById('content-clientesViajes');

    if (loadingSpinner) loadingSpinner.classList.remove("hidden");
    if (mainContent) mainContent.classList.add("hidden");

    try {
        await cargarTablaCliente();
        setupSearchBar("clientesViajesSearchBar");

        const historialBtn = document.getElementById("historial");
        const backHistorialBtn = document.getElementById("back-historialBtn");
        const headerModal = document.getElementById("headerModal");
        const selectCantidad = document.getElementById("selectResumenes");
        const contentResumenes = document.getElementById("content-clientesViajesHistorial");

        selectCantidad?.addEventListener("change", () => {
            contentResumenes.classList.add("hidden");
            historialBtn.click();
        })

        historialBtn?.addEventListener("click", async () =>{
            if (loadingSpinner) {
                loadingSpinner.classList.remove("hidden");
                loadingSpinner.childNodes[2].textContent = "Cargando resumenes...";
            }
            if (mainContent) mainContent.classList.add("hidden");
            await setHistorial();
            if (loadingSpinner) {
                loadingSpinner.classList.add("hidden");
                loadingSpinner.childNodes[2].textContent = "Cargando datos...";
            }
            if (mainContent) mainContent.classList.remove("hidden");
            document.getElementById("back-historial").classList.remove("hidden");
            headerModal.textContent = "Viajes - Historial";
            contentResumenes.classList.remove("hidden");
            mainContent.classList.add("hidden");
            historialBtn.classList.add("hidden");
        });

        backHistorialBtn?.addEventListener("click", () =>{
            document.getElementById("back-historial").classList.add("hidden");
            headerModal.textContent = "Viajes";
            contentResumenes.classList.add("hidden");
            mainContent.classList.remove("hidden");
            historialBtn.classList.remove("hidden");
        });

    } catch (error) {
        console.error('Error de red o desconocido al obtener datos de los viajes:', error);
        showConfirmModal('Error de conexión al cargar los viajes.');
        if (mainContent) mainContent.innerHTML = `<p class="error-message">Error de conexión al cargar los datos.</p>`;
    } finally {
        if (loadingSpinner) loadingSpinner.classList.add("hidden");
        if (mainContent) mainContent.classList.remove("hidden");
    }
}