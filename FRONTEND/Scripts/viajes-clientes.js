import { cargarNombreChofer, deleteModal, actualizarTotales } from "./viajes-pagos.js";
import { editingRowId, enterEditMode, handleEdit } from "./choferes-clientes.js";
import { getViajesCliente } from "./api.js";
import { showConfirmModal } from "./apiPublic.js";
import { renderTabla } from "./tabla.js";
import { actualizarValores, columnasViajes, formatFecha, parseViaje } from "./resumenes.js";

let loadingSpinner;
let mainContent;

let clienteData = [];
let viajesData = [];

let currentViajesClientesPage = 1;

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

export function renderizarTablaVC(viajesDataRender = viajesData, currentPage = 1){
    currentViajesClientesPage = currentPage;
    let columnas = columnasViajes;
    if (editingRowId)
        columnas = columnasViajes.filter(col => !["diferencia", "importe", "comision", "iva"].includes(col.key));

    renderTabla({
        containerId: 'clientesViajes-table',
        paginacionContainerId: 'paginacion-viajes',
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
                        facturaSubida: v.facturaSubida
    })),
        columnas: columnas,
        itemsPorPagina: 10,
        actions: accionesViajes,
        editingRowId: editingRowId,
        onEdit: (id, field, value) => handleEdit(id, field, value, 'viajesCliente'),
        tableType: 'viajesCliente',
        checkboxColumn: true,
        checkboxColumnPosition: "end",
        currentPage: currentPage,
        onPageChange: (page) => { currentViajesClientesPage = page; }
    });

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

export async function handleSaveEditViajesCliente() {
    showConfirmModal("Viaje editado con exito");
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
        const contentResumenes = document.getElementById("content-resumenes");

        // selectCantidad?.addEventListener("change", () => {
        //     contentResumenes.classList.add("hidden");
        //     historialBtn.click();
        // })

        // historialBtn?.addEventListener("click", async () =>{
        //     if (loadingSpinner) {
        //         loadingSpinner.classList.remove("hidden");
        //         loadingSpinner.childNodes[2].textContent = "Cargando resumenes...";
        //     }
        //     if (mainContent) mainContent.classList.add("hidden");
        //     await setHistorial(choferData);
        //     if (loadingSpinner) {
        //         loadingSpinner.classList.add("hidden");
        //         loadingSpinner.childNodes[2].textContent = "Cargando datos...";
        //     }
        //     if (mainContent) mainContent.classList.remove("hidden");
        //     document.getElementById("back-historial").classList.remove("hidden");
        //     headerModal.textContent = "Viajes y Pagos - Resumenes";
        //     contentResumenes.classList.remove("hidden");
        //     mainContent.classList.add("hidden");
        //     historialBtn.classList.add("hidden");
        // });

        // backHistorialBtn?.addEventListener("click", () =>{
        //     document.getElementById("back-historial").classList.add("hidden");
        //     headerModal.textContent = "Viajes y Pagos";
        //     contentResumenes.classList.add("hidden");
        //     mainContent.classList.remove("hidden");
        //     historialBtn.classList.remove("hidden");
        // });

    } catch (error) {
        console.error('Error de red o desconocido al obtener datos de los viajes:', error);
        showConfirmModal('Error de conexión al cargar los viajes.');
        if (mainContent) mainContent.innerHTML = `<p class="error-message">Error de conexión al cargar los datos.</p>`;
    } finally {
        if (loadingSpinner) loadingSpinner.classList.add("hidden");
        if (mainContent) mainContent.classList.remove("hidden");
    }
}