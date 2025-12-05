import { renderTabla } from './tabla.js';
import { fetchAllDataChoferes, deleteChofer, deleteCliente, updateCliente, insertCliente, insertChofer, fetchClientes, socket, loadTarifas, tarifasCatac } from './api.js';
import { updateChofer, showConfirmModal, createLoadingSpinner, toggleSpinnerVisible, changeSpinnerText } from './apiPublic.js';
import { inicializarModal, renderizarTablas, handleSaveEditViajes } from './viajes-pagos.js';
import { parseImporte } from './resumenes.js';
import { handleSaveEditViajesCliente, inicializarModaCliente, renderizarTablaVC } from './viajes-clientes.js';

// --- Datos de ejemplo (sustituir con datos reales del backend) ---
export let mockChoferes = [];
export let mockClientes = [];

let currentChoferesPage = 1;
let currentClientesPage = 1;

// --- Estado de edición (exportado para ser usado en viajes-pagos.js) ---
export let editingRowId = null;
export let currentEditingTableType = null;
export let originalEditingData = {};
export let stagedEditingData = {};

const principalContent = document.getElementById('principalContent');

// --- Definición de columnas para las tablas ---
const choferesColumns = [
    { key: 'nombre', label: 'Nombre y Apellido', class: [] },
    { key: 'cuil', label: 'CUIL/CUIT', class: [] },
    { key: 'trabajador', label: 'Trabajador', class: [], type: 'select', options: [{value: 'Monotributista', text:'Monotributista'} , {value: 'Responsable Inscripto', text: 'Responsable Inscripto'}, {value: 'Chofer', text: 'Chofer'}] },
    { key: 'patente_chasis', label: 'Chasis', class: [] },
    { key: 'patente_acoplado', label: 'Acoplado', class: [] },
    { key: 'telefono', label: 'Teléfono', class: [] },
    { key: 'email', label: 'Email', class: [] },
];

const clientesColumns = [
    { key: 'nombre', label: 'Nombre y Apellido/Razón Social', class: [] },
    { key: 'cuit', label: 'CUIL/CUIT', class: [] },
    { key: 'email', label: 'Email', class: []}
];

// --- Acciones para las tablas ---
const choferesActions = [
    {
        icon: 'bi bi-pencil',
        tooltip: 'Editar',
        classList: ['edit-btn'],
        id: null,
        handler: (rowData) => {
            enterEditMode(rowData, 'choferes');
        }
    },
    {
        icon: 'bi bi-trash',
        tooltip: 'Eliminar',
        id: null,
        classList: ['delete-btn'],
        handler: (rowData) => {
            showConfirmModal(`¿Estás seguro de que quieres eliminar al chofer ${rowData.nombre}?`, "delete", () => handleDelete(rowData.cuil, 'choferes'));
        }
    },
    {
        icon: 'bi bi-send',
        tooltip: 'Ver Viajes',
        id: null,
        classList: ['navigate-btn'],
        handler: (rowData) => {
            verViajesModal(rowData, "chofer");
        }
    }
];

const clientesActions = [
    {
        icon: 'bi bi-pencil',
        tooltip: 'Editar',
        classList: ['edit-btn'],
        id: null,
        handler: (rowData) => {
            enterEditMode(rowData, 'clientes');
        }
    },
    {
        icon: 'bi bi-trash',
        tooltip: 'Eliminar',
        classList: ['delete-btn'],
        id: null,
        handler: (rowData) => {
            showConfirmModal(`¿Estás seguro de que quieres eliminar al cliente ${rowData.nombre}?`, "delete", () => handleDelete(rowData.cuit, 'clientes'));
        }
    },
    {
        icon: 'bi bi-send',
        tooltip: 'Ver Viajes',
        classList: ['navigate-btn'],
        id: null,
        handler: (rowData) => {
            verViajesModal(rowData, "cliente");
        }
    }
];

function seePassword(passwordId) {
    const iconoToggle = document.querySelector(".toggle");
    const inputPassword = document.getElementById("password-input");
    iconoToggle.addEventListener("click", (e) =>{
    if (inputPassword?.type ==="password"){
        inputPassword.type = "text";
        e.target.classList.replace("bi-eye-slash", "bi-eye");
    } else {
        inputPassword.type = "password";
        e.target.classList.replace("bi-eye","bi-eye-slash");
    }
    });
}

// --- Funciones de renderizado de tablas ---
function renderChoferesTable(data, currentPage = 1) {
    currentChoferesPage = currentPage;
    renderTabla({
        containerId: 'tabla-choferes',
        paginacionContainerId: 'paginacion-choferes',
        datos: data,
        columnas: choferesColumns,
        itemsPorPagina: 10,
        actions: choferesActions,
        editingRowId: editingRowId,
        onEdit: (id, field, value) => handleEdit(id, field, value, 'choferes'),
        tableType: 'choferes',
        currentPage: currentPage,
        onPageChange: (page) => { currentChoferesPage = page; }
    });
}

function renderClientesTable(data, currentPage = 1) {
    currentClientesPage = currentPage;
    renderTabla({
        containerId: 'tabla-clientes',
        paginacionContainerId: 'paginacion-clientes',
        datos: data,
        columnas: clientesColumns,
        itemsPorPagina: 10,
        actions: clientesActions,
        editingRowId: editingRowId,
        onEdit: (id, field, value) => handleEdit(id, field, value, 'clientes'),
        tableType: 'clientes',
        currentPage: currentPage,
        onPageChange: (page) => { currentClientesPage = page; }
    });
}

// --- Función para renderizar la tabla actual ---
export function renderCurrentTable() {
    //console.log(currentEditingTableType);
    if (currentEditingTableType === 'choferes') {
        renderChoferesTable(mockChoferes, currentChoferesPage);
    } else if (currentEditingTableType === 'clientes') {
        renderClientesTable(mockClientes, currentClientesPage);
    } else if (currentEditingTableType === 'viajes') {
        renderizarTablas();
    } else if (currentEditingTableType === "viajesCliente") {
        renderizarTablaVC();
    }
}

// --- Lógica de Pestañas ---
 async function setupChoferesClientesTabSelector() {
    const tabSelector = document.getElementById('choferesClientesSelector');
    if (!tabSelector) {
        console.warn("Elemento #choferesClientesSelector no encontrado. La funcionalidad de pestañas no se inicializará.");
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

async function verViajesModal(choferData, tipo) {
    if (tipo === "chofer") {
        const modalViajesPagos = document.getElementById("viajesPagosModal");
        if (modalViajesPagos) {
            try {
                const response = await fetch('/viajes-pagos.html');
                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }
                const viajesPagosHtml = await response.text();
                modalViajesPagos.innerHTML = viajesPagosHtml;
                modalViajesPagos.classList.toggle("active");
                inicializarModal(choferData);
            } catch (error) {
                console.log(error.message);
            }
        }
    } else if (tipo === "cliente") {
        const modalViajesClientes = document.getElementById("viajesClientesModal");
        if (modalViajesClientes) {
            try {
                const response = await fetch('/viajes-clientes.html');
                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }
                const viajesClientesHtml = await response.text();
                modalViajesClientes.innerHTML = viajesClientesHtml;
                modalViajesClientes.classList.toggle("active");
                inicializarModaCliente(choferData);
            } catch (error) {
                console.log(error.message);
            }
        }
    }
}

async function handleTabContentDisplay(selectedTab) {
    const choferesContent = document.getElementById('content-choferes');
    const clientesContent = document.getElementById('content-clientes');
    if (mockChoferes?.length === 0) {
        mockChoferes = await fetchAllDataChoferes();
    }
    if (mockClientes?.length === 0) {
        mockClientes = await fetchClientes();
        mockClientes.forEach(c => {
            c.balance = parseImporte(c.balance);
        })
    }
    if (selectedTab === 'choferes') {
        choferesContent.classList.remove('hidden');
        clientesContent.classList.add('hidden');
        
        renderChoferesTable(mockChoferes, currentChoferesPage);
        currentEditingTableType = 'choferes';
    } else if (selectedTab === 'clientes') {
        choferesContent.classList.add('hidden');
        clientesContent.classList.remove('hidden');
        renderClientesTable(mockClientes, currentClientesPage);
        currentEditingTableType = 'clientes';
    }
    resetEditingState();
}

// --- Lógica de la barra de búsqueda ---
function setupSearchBar(searchBarId, tableType) {
    const searchInput = document.querySelector(`#${searchBarId} .search-input`);
    const searchIcon = document.querySelector(`#${searchBarId} .search-icon`);

    if (searchInput && searchIcon) {
        const performSearch = () => {
            const searchTerm = searchInput.value.toLowerCase();
            let filteredData = [];

            if (tableType === 'choferes') {
                filteredData = mockChoferes.filter(chofer =>
                    chofer.nombre?.toLowerCase().includes(searchTerm) ||
                    chofer.cuil?.toLowerCase().includes(searchTerm) ||
                    chofer.patente_chasis?.toLowerCase().includes(searchTerm) ||
                    chofer.patente_acoplado?.toLowerCase().includes(searchTerm)
                );
                currentChoferesPage = 1;
                renderChoferesTable(filteredData, 1);
            } else if (tableType === 'clientes') {
                filteredData = mockClientes.filter(cliente =>
                    cliente.nombre.toLowerCase().includes(searchTerm) ||
                    cliente.cuit.toLowerCase().includes(searchTerm)
                );
                currentClientesPage = 1;
                renderClientesTable(filteredData, 1);
            }
        };

        searchIcon.addEventListener('click', performSearch);
        searchInput.addEventListener('input', performSearch);
    } else {
        console.warn(`Elementos de la barra de búsqueda para '${searchBarId}' no encontrados.`);
    }
}

// --- Lógica de los botones de añadir ---
function setupAddButtons() {
    const btnAddChofer = document.getElementById('btnAddChofer');
    const formCardChofer = document.getElementById('addChoferCard');
    const btnGuardarChofer = document.getElementById('btnGuardarNuevoChofer');
    if (btnAddChofer) {
        btnAddChofer.addEventListener('click', () => {
            formCardChofer.classList.toggle('hidden');
        });
    }
    if (btnGuardarChofer) {
        btnGuardarChofer.addEventListener('click', async () => {
            const formChofer = document.getElementById('form-chofer');
            const choferData = new FormData(formChofer);
            for (let [key, value] of choferData.entries()) {
                choferData[key] = value.trim();
            }
            var valid = true;
            ['nombre', 'cuil', 'password', 'trabajador', 'patente_chasis'].forEach(key => {
                if (!choferData[key] || choferData[key] === '')
                    valid = false;
            });
            if (!valid) {
                return showConfirmModal('Por favor completá los campos obligatorios.');;
            }
            const payload = {
                cuil: choferData['cuil'],
                nombre: choferData['nombre'],
                password: choferData['password'],
                trabajador: choferData['trabajador'] || null,
                patente_chasis: choferData['patente_chasis']?.toUpperCase(),
                patente_acoplado: choferData['patente_acoplado']?.toUpperCase() || null,
                telefono: choferData['telefono'] || null,
                email: choferData['email'] || null
            };
            const response = await insertChofer(payload);
            if (response.ok) {
                const nuevoChofer = {
                    id: payload.cuil,
                    nombre: payload.nombre,
                    cuil: payload.cuil,
                    trabajador: payload.trabajador,
                    patente_chasis: payload.patente_chasis,
                    patente_acoplado: payload.patente_acoplado,
                    telefono: payload.telefono,
                    email: payload.email
                };
                mockChoferes.push(nuevoChofer);
                renderChoferesTable(mockChoferes);
                formChofer.reset();
                formCardChofer.classList.toggle('hidden');
                const data = await response.json();
                showConfirmModal(data.message);
            } else {
                const dataError = await response.json();
                showConfirmModal(dataError.message);
            }
        });
    }

    const btnAddCliente = document.getElementById('btnAddCliente');
    const formCard = document.getElementById('addClienteCard');
    const btnGuardar = document.getElementById('btnGuardarNuevoCliente');
    if (btnAddCliente) {
        btnAddCliente.addEventListener('click', () => {
            formCard.classList.toggle('hidden');
        });
    }

    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            const nombre = document.getElementById('nuevoClienteNombre').value.trim();
            const cuit = document.getElementById('nuevoClienteCuit').value.trim();
            const email = document.getElementById('nuevoClienteEmail').value.trim();

            if (!nombre || !cuit) {
                showConfirmModal('Por favor completá los campos obligatorios.');
                return;
            }
            const payload = {
                cuit: cuit,
                nombre: nombre,
                email: email !== ''? email : null
            };
            const response = await insertCliente(payload);
            if (response.ok) {
                const nuevoCliente = {
                    id: payload.cuit,
                    nombre,
                    cuit,
                    email
                };
                mockClientes.push(nuevoCliente);
                renderClientesTable(mockClientes);
                document.getElementById('nuevoClienteNombre').value = '';
                document.getElementById('nuevoClienteCuit').value = '';
                document.getElementById('nuevoClienteEmail').value = '';
                formCard.classList.add('hidden');
                const data = await response.json();
                showConfirmModal(data.message);
            } else {
                const dataError = await response.json();
                showConfirmModal(dataError.message);
            }
        });
    }
}

// --- Lógica de Edición ---
export function enterEditMode(rowData, tableType) {
    if (editingRowId !== null && editingRowId !== rowData.id) {
        if (hasChanges(originalEditingData, stagedEditingData)) {
            showConfirmModal(
                "Hay cambios sin guardar en la fila actual. ¿Deseas guardarlos antes de editar otra?",
                "confirm",
                async () => {
                    await handleSaveEdit();
                    setTimeout(() => enterEditMode(rowData, tableType), 100);
                },
                () => {
                    resetEditingState();
                    enterEditMode(rowData, tableType);
                }
            );
            return;
        } else {
            resetEditingState();
        }
    }

    if (editingRowId === rowData.id) {
        if (hasChanges(originalEditingData, stagedEditingData)) {
            showConfirmModal(
                "Hay cambios sin guardar. ¿Deseas guardarlos o descartarlos?",
                "confirm",
                handleSaveEdit,
                handleCancelEdit
            );
        } else {
            exitEditMode();
        }
        return;
    }

    originalEditingData = JSON.parse(JSON.stringify(rowData));
    stagedEditingData = JSON.parse(JSON.stringify(rowData));
    editingRowId = rowData.id;
    currentEditingTableType = tableType;

    renderCurrentTable();
}

export function handleEdit(id, field, value, tableType) {
    if (id === editingRowId && tableType === currentEditingTableType) {
        stagedEditingData[field] = value;
        // Lógica específica para actualizar tarifa cuando se cambia km en la tabla de viajes
        if ((tableType === 'viajes' || tableType === 'viajesCliente') && field === 'km') {
            const currentKm = parseInt(value.trim(), 10);
            const tarifaCatacCalculada = (!isNaN(currentKm) && currentKm > 0 && currentKm <= tarifasCatac.length && tarifasCatac[currentKm - 1]?.valor !== undefined)
                ? parseImporte(tarifasCatac[currentKm - 1].valor)
                : parseImporte(tarifasCatac[tarifasCatac.length - 1]?.valor) || 0;
            stagedEditingData['tarifa'] = tarifaCatacCalculada;
            //console.log(`Tarifa actualizada a ${tarifaCatacCalculada} para km ${value}`);
            
            // Actualizar el input de tarifa en el DOM
            const tarifaInput = document.getElementById('tarifaEdit');
            if (tarifaInput) {
                tarifaInput.value = tarifaCatacCalculada;
            }
        }
    }
}

export function hasChanges(originalData, stagedData) {
    Object.keys(stagedData).forEach(key => {
        stagedData[key] = stagedData[key] === '' ? null : stagedData[key];
    });
    return JSON.stringify(originalData) !== JSON.stringify(stagedData);
}

export async function handleSaveEdit() {
    if (!hasChanges(originalEditingData, stagedEditingData)) {
        exitEditMode();
        return;
    }

    try {
        if (currentEditingTableType === 'choferes') {
            const index = mockChoferes.findIndex(c => c.id === editingRowId);
            const payload = {
                nombre: stagedEditingData.nombre || null,
                cuil: stagedEditingData.cuil || null,
                trabajador: stagedEditingData.trabajador || null,
                patente_chasis: stagedEditingData.patente_chasis?.toUpperCase() || null,
                patente_acoplado: stagedEditingData.patente_acoplado?.toUpperCase() || null,
                telefono: stagedEditingData.telefono || null,
                email: stagedEditingData.email || null
            };
            const response = await updateChofer(originalEditingData.cuil, payload);
            if (response && index !== -1) {
                mockChoferes[index] = { ...mockChoferes[index], ...stagedEditingData };
                showConfirmModal('Cambios guardados para el chofer.');
            }
        } else if (currentEditingTableType === 'clientes') {
            const index = mockClientes.findIndex(c => c.id === editingRowId);
            const payload = {
                cuit: stagedEditingData.cuit || null,
                nombre: stagedEditingData.nombre || null,
                email: stagedEditingData.email || null
            };
            const response = await updateCliente(originalEditingData.cuit, payload);
            if (response && index !== -1) {
                mockClientes[index] = { ...mockClientes[index], ...stagedEditingData };
                showConfirmModal('Cambios guardados para el cliente.');
            }
        } else if (currentEditingTableType === 'viajes') {
            await handleSaveEditViajes();
        } else if (currentEditingTableType === 'viajesCliente') {
            await handleSaveEditViajesCliente();
        }
    } catch (error) {
        console.error('Error al guardar cambios:', error);
    }

    exitEditMode();
}

export function handleCancelEdit() {
    //console.log('Cancelando edición');
    exitEditMode();
}

export function exitEditMode() {
    resetEditingState();
    renderCurrentTable();
}

export function resetEditingState() {
    editingRowId = null;
    originalEditingData = {};
    stagedEditingData = {};
}

// --- Lógica de Eliminación ---
async function handleDelete(cuil, tableType) {
    if (tableType === 'choferes') {
        const response = await deleteChofer(cuil);
        if (response) {
            mockChoferes = mockChoferes.filter(chofer => chofer.cuil !== cuil);
            const totalItemsAfter = mockChoferes.length;
            const itemsPerPage = 10;
            const maxPage = Math.ceil(totalItemsAfter / itemsPerPage) || 1;
            if (currentChoferesPage > maxPage) {
                currentChoferesPage = maxPage;
            }
            renderChoferesTable(mockChoferes, currentChoferesPage);
            showConfirmModal('Chofer eliminado exitosamente.');
        }
    } else if (tableType === 'clientes') {
        const response = await deleteCliente(cuil);
        if (response) {
            mockClientes = mockClientes.filter(cliente => cliente.cuit !== cuil);
            const totalItemsAfter = mockClientes.length;
            const itemsPerPage = 10;
            const maxPage = Math.ceil(totalItemsAfter / itemsPerPage) || 1;
            if (currentClientesPage > maxPage) {
                currentClientesPage = maxPage;
            }
            renderClientesTable(mockClientes, currentClientesPage);
            showConfirmModal('Cliente eliminado exitosamente.');
        }
    }
    resetEditingState();
}

// --- Event Listeners para los eventos personalizados de tabla.js ---
function setupTableEventListeners() {
    document.addEventListener('saveEdit', (event) => {
        const { itemId } = event.detail;
        if (itemId === editingRowId) {
            handleSaveEdit();
        }
    });

    document.addEventListener('cancelEdit', (event) => {
        const { itemId } = event.detail;
        if (itemId === editingRowId) {
            handleCancelEdit();
        }
    });
}

// --- Inicialización al cargar el DOM ---
document.addEventListener('DOMContentLoaded', async function () {
    const headerContainer = document.getElementById('header-container');
    const sidebarContainer = document.getElementById('sidebar-container');
    const confirmModal = document.getElementById('confirmModal');
    
    if (confirmModal) {
        confirmModal.style.display = 'none';
    }

    if (typeof loadHeader === 'function') {
        await loadHeader();
    } else {
        console.error("loadHeader no está definido. Asegúrate de que /js/header.js se cargue antes.");
    }

    if (typeof loadSidebar === 'function') {
        const userRole = localStorage.getItem('userRole');
        await loadSidebar(userRole);
    } else {
        console.error("loadSidebar no está definido. Asegúrate de que /js/sidebar.js se cargue antes.");
    }

    const currentPath = window.location.pathname;
    const sidebarItems = document.querySelectorAll('.sidebar-item');

    sidebarItems.forEach(item => {
        const targetPage = item.dataset.targetPage;
        if (targetPage && currentPath.includes(targetPage)) {
            sidebarItems.forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        }
    });

    await createLoadingSpinner(principalContent);

    await loadTarifas();
    setupTableEventListeners();
    await setupChoferesClientesTabSelector();
    setupSearchBar('choferesSearchBar', 'choferes');
    setupSearchBar('clientesSearchBar', 'clientes');
    setupAddButtons();
    seePassword("password-input");

    toggleSpinnerVisible(principalContent);

    socket.on('nuevoUsuario', async (user) => {
        mockChoferes.push(user);
        //console.log("Nuevo chofer añadido");
        if (currentEditingTableType === "choferes" && editingRowId) return;
        renderChoferesTable(mockChoferes, currentChoferesPage);
    });

    socket.on('updateUsuario', async (user) => {
        let chofer = mockChoferes.find(chofer => chofer.cuil === user.cuilOriginal);
        const updatedData = user.updatedData;
        if (chofer){
            //console.log(`Chofer con cuil ${user.cuilOriginal} modificado`);
            if (currentEditingTableType === "choferes" && editingRowId) {
                if (editingRowId === user.cuilOriginal){
                    Object.assign(chofer, updatedData);
                    resetEditingState();
                    changeSpinnerText(principalContent, "Actualizando datos...");
                    toggleSpinnerVisible(principalContent);
                    await renderChoferesTable(mockChoferes, currentChoferesPage);
                    toggleSpinnerVisible(principalContent);
                    changeSpinnerText(principalContent);
                    showConfirmModal("Se han actualizado los datos");
                }
                Object.assign(chofer, updatedData);
                return;
            }
            Object.assign(chofer, updatedData);
            renderChoferesTable(mockChoferes, currentChoferesPage);
        }
    });

    socket.on('deleteUsuario', async (user) => {
        const chofer = mockChoferes.find(chofer => chofer.cuil === user.cuil);
        mockChoferes = mockChoferes.filter(chofer => chofer.cuil !== user.cuil);
        if (currentEditingTableType === "choferes" && editingRowId){
            if (chofer.id === editingRowId){
                    resetEditingState();
                    changeSpinnerText(principalContent, "Actualizando datos...");
                    toggleSpinnerVisible(principalContent);
                    await renderChoferesTable(mockChoferes, currentChoferesPage);
                    toggleSpinnerVisible(principalContent);
                    changeSpinnerText(principalContent);
                    showConfirmModal("Se han actualizado los datos");
                }
                return;
            }
        renderChoferesTable(mockChoferes, currentChoferesPage);
    });

    socket.on('nuevoCliente', async (client) => {
        mockClientes.push(client);
        //console.log("Nuevo cliente añadido");
        if (currentEditingTableType === "clientes" && editingRowId) return;
        renderClientesTable(mockClientes, currentClientesPage);
    });

    socket.on('updateCliente', async (client) => {
        let cliente = mockClientes.find(cliente => cliente.cuit === client.cuitOriginal);
        const updatedData = client.updatedData;
        if (cliente){
            //console.log(`Cliente con cuit ${client.cuitOriginal} modificado`);
            if (currentEditingTableType === "clientes" && editingRowId) {
                if (editingRowId === client.cuitOriginal){
                    Object.assign(cliente, updatedData);
                    resetEditingState();
                    changeSpinnerText(principalContent, "Actualizando datos...");
                    toggleSpinnerVisible(principalContent);
                    await renderClientesTable(mockClientes, currentClientesPage);
                    toggleSpinnerVisible(principalContent);
                    changeSpinnerText(principalContent);
                    showConfirmModal("Se han actualizado los datos");
                }
                Object.assign(cliente, updatedData);
                return;
            }
            Object.assign(cliente, updatedData);
            renderClientesTable(mockClientes, currentClientesPage);
        }
    });

    socket.on('deleteCliente', async (client) => {
        const cliente = mockClientes.find(cliente => cliente.cuit === client.cuit);
        mockClientes = mockClientes.filter(cliente => cliente.cuit !== client.cuit);
        if (currentEditingTableType === "clientes" && editingRowId){
            if (cliente.id === editingRowId){
                resetEditingState();
                changeSpinnerText(principalContent, "Actualizando datos...");
                toggleSpinnerVisible(principalContent);
                await renderClientesTable(mockClientes, currentClientesPage);
                toggleSpinnerVisible(principalContent);
                changeSpinnerText(principalContent);
                showConfirmModal("Se han actualizado los datos");

            }
            return;
        }
        renderClientesTable(mockClientes, currentClientesPage);
    });

    document.addEventListener('click', function (event) {
        const confirmModalElement = document.getElementById('confirmModal');
        const modalContent = confirmModalElement ? confirmModalElement.querySelector('.modal-content') : null;
        const headerContainer = document.getElementById('header-container');
        const sidebarContainer = document.getElementById('sidebar-container');
        const addClienteWrapper = document.getElementById('cliente-wrapper');
        const addClienteCard = document.getElementById('addClienteCard');
        const addChoferWrapper = document.getElementById('chofer-wrapper');
        const addChoferCard = document.getElementById('addChoferCard');
        const modalConfirmacion = document.getElementById('confirmModal');

        const isClickOutsideModal = modalContent && !modalContent.contains(event.target);
        const isClickInsideHeader = headerContainer && headerContainer.contains(event.target);
        const isClickInsideSidebar = sidebarContainer && sidebarContainer.contains(event.target);
        const isClickInsideAddCliente = (addClienteWrapper && addClienteWrapper.contains(event.target)) || (modalConfirmacion && modalConfirmacion.contains(event.target));
        const isClickInsideAddChofer = (addChoferWrapper && addChoferWrapper.contains(event.target)) || (modalConfirmacion && modalConfirmacion.contains(event.target));

        if (addChoferCard && !isClickInsideAddChofer && !isClickInsideHeader && !isClickInsideSidebar) {
            addChoferCard.classList.add('hidden');
        }

        if (addClienteCard && !isClickInsideAddCliente && !isClickInsideHeader && !isClickInsideSidebar) {
            addClienteCard.classList.add('hidden');
        }

        if (editingRowId === null) {
            return;
        }

        const editingRowElement = document.querySelector(`.data-table tr[data-id="${editingRowId}"]`);
        //console.log(editingRowElement);
        const isClickInsideEditingRow = editingRowElement && editingRowElement.contains(event.target);
        const isActionButton = event.target.closest('.action-icons i');
        const isInputInTable = event.target.matches('.editable-input');
        const isTableHeader = event.target.closest('th');
        const isPaginationControl = event.target.closest('.pagination-controls');

        if (
            isClickInsideEditingRow ||
            !isClickOutsideModal ||
            isActionButton ||
            isInputInTable ||
            isTableHeader ||
            isPaginationControl ||
            isClickInsideHeader ||
            isClickInsideSidebar ||
            isClickInsideAddCliente
        ) {
            return;
        }

        if (hasChanges(originalEditingData, stagedEditingData)) {
            showConfirmModal(
                "Hay cambios sin guardar. ¿Deseas guardar los cambios?",
                "confirm",
                handleSaveEdit,
                handleCancelEdit
            );
        } else {
            exitEditMode();
        }
    });
});
