import { renderTables, handleSaveEdit, handleEdit, enterEditMode, setupTableEventListeners, currentEditingTableType, resetEditingState, editingRowId, originalEditingData, hasChanges } from './tabla.js';
import { fetchAllDataChoferes, deleteChofer, deleteCliente, updateCliente, insertCliente, insertChofer, fetchClientes, socket, loadTarifas, tarifasCatac, fetchProveedores, insertProveedor, updateProveedor, deleteProveedor } from './api.js';
import { updateChofer, showConfirmModal, createLoadingSpinner, toggleSpinnerVisible, changeSpinnerText } from './apiPublic.js';
import { inicializarModal } from './viajes-pagos.js';
import { parseImporte } from './resumenes.js';
import { inicializarModaCliente, getClienteCuit } from './viajes-clientes.js';
import { inicializarModalProveedor, getProveedorCuit } from './ordenes-proveedor.js';

// --- Datos de ejemplo (sustituir con datos reales del backend) ---
export let mockChoferes = [];
export let mockClientes = [];
export let mockProveedores = [];

let currentChoferesPage = 1;
let currentClientesPage = 1;
let currentProveedoresPage = 1;

let currentEditingTable = 'choferes';

const principalContent = document.getElementById('principalContent');

// --- Definición de columnas para las tablas ---
const choferesColumns = [
    { key: 'nombre', label: 'Nombre y Apellido', class: [] },
    { key: 'cuil', label: 'CUIL/CUIT', class: [] },
    { key: 'trabajador', label: 'Trabajador', class: [], type: 'select', options: [{ value: 'Monotributista', text: 'Monotributista' }, { value: 'Responsable Inscripto', text: 'Responsable Inscripto' }, { value: 'Chofer', text: 'Chofer' }] },
    { key: 'patente_chasis', label: 'Chasis', class: [] },
    { key: 'patente_acoplado', label: 'Acoplado', class: [] },
    { key: 'telefono', label: 'Teléfono', class: [] },
    { key: 'email', label: 'Email', class: [] },
];

const clientesColumns = [
    { key: 'nombre', label: 'Nombre y Apellido/Razón Social', class: [] },
    { key: 'cuit', label: 'CUIL/CUIT', class: [] },
    { key: 'email', label: 'Email', class: [] },
    { key: 'balance', label: 'Saldo', class: ['text-right', 'bold'], modify: (content) => { return `$${parseImporte(content).toFixed(2)}`.replace('$-', '-$'); } }
];

const proveedoresColumns = [
    { key: 'nombre', label: 'Nombre y Apellido/Razón Social', class: [] },
    { key: 'cuit', label: 'CUIL/CUIT', class: [] },
    { key: 'telefono', label: 'Teléfono', class: [] },
    { key: 'balance', label: 'Saldo', class: ['text-right', 'bold'], modify: (content) => { return `$${parseImporte(content).toFixed(2)}`.replace('$-', '-$'); } }
];

// --- Acciones para las tablas ---
const choferesActions = [
    {
        icon: 'bi bi-pencil',
        tooltip: 'Editar',
        classList: ['edit-btn'],
        id: null,
        handler: (rowData) => {
            enterEditMode(rowData, 'choferes', () => renderTables(mockChoferes, currentChoferesPage, optionsChoferes),
                async (payload) => await saveEditLists(payload, getCurrentData, () => updateChofer(originalEditingData.cuil, payload)));
        }
    },
    {
        icon: 'bi bi-trash',
        tooltip: 'Eliminar',
        id: null,
        classList: ['delete-btn'],
        handler: (rowData) => {
            showConfirmModal(`¿Estás seguro de que quieres eliminar al chofer ${rowData.nombre}?`, "delete",
                () => handleDelete(rowData.cuil, 'choferes', (cuil) => deleteChofer(cuil)));
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

const optionsChoferes = {
    containerId: 'tabla-choferes',
    paginacionContainerId: 'paginacion-choferes',
    columnas: [choferesColumns],
    itemsPorPagina: () => 10,
    actions: choferesActions,
    onEdit: (id, field, value) => handleEdit(id, field, value, 'choferes'),
    tableType: 'choferes',
    onPageChange: (page) => { currentChoferesPage = page; },
    checkboxColumn: false,
    checkboxColumnPosition: null,
    checkboxHeaderAction: null,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: false
}

const clientesActions = [
    {
        icon: 'bi bi-pencil',
        tooltip: 'Editar',
        classList: ['edit-btn'],
        id: null,
        handler: (rowData) => {
            enterEditMode(rowData, 'clientes', () => renderTables(mockClientes, currentClientesPage, optionsClientes),
                async (payload) => await saveEditLists(payload, getCurrentData, () => updateCliente(originalEditingData.cuit, payload)));
        }
    },
    {
        icon: 'bi bi-trash',
        tooltip: 'Eliminar',
        classList: ['delete-btn'],
        id: null,
        handler: (rowData) => {
            showConfirmModal(`¿Estás seguro de que quieres eliminar al cliente ${rowData.nombre}?`, "delete",
                () => handleDelete(rowData.cuit, 'clientes', (cuil) => deleteCliente(cuil)));
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

const optionsClientes = {
    containerId: 'tabla-clientes',
    paginacionContainerId: 'paginacion-clientes',
    columnas: [clientesColumns, clientesColumns.filter(col => !['balance'].includes(col.key))],
    itemsPorPagina: () => 10,
    actions: clientesActions,
    onEdit: (id, field, value) => handleEdit(id, field, value, 'clientes'),
    tableType: 'clientes',
    onPageChange: (page) => { currentClientesPage = page; },
    checkboxColumn: false,
    checkboxColumnPosition: null,
    checkboxHeaderAction: null,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: false
}

const proveedoresActions = [
    {
        icon: 'bi bi-pencil',
        tooltip: 'Editar',
        classList: ['edit-btn'],
        id: null,
        handler: (rowData) => {
            enterEditMode(rowData, 'proveedores', () => renderTables(mockProveedores, currentProveedoresPage, optionsProveedores),
                async (payload) => await saveEditLists(payload, getCurrentData, () => updateProveedor(originalEditingData.cuit, payload)));
        }
    },
    {
        icon: 'bi bi-trash',
        tooltip: 'Eliminar',
        id: null,
        classList: ['delete-btn'],
        handler: (rowData) => {
            showConfirmModal(`¿Estás seguro de que quieres eliminar al proveedor ${rowData.nombre}?`, "delete",
                () => handleDelete(rowData.cuit, 'proveedores', (cuil) => deleteProveedor(cuil)));
        }
    },
    {
        icon: 'bi bi-send',
        tooltip: 'Ver Ordenes',
        id: null,
        classList: ['navigate-btn'],
        handler: (rowData) => {
            verViajesModal(rowData, 'proveedor');
        }
    }
];

const optionsProveedores = {
    containerId: 'tabla-proveedores',
    paginacionContainerId: 'paginacion-proveedores',
    columnas: [proveedoresColumns, proveedoresColumns.filter(col => !['balance'].includes(col.key))],
    itemsPorPagina: () => 10,
    actions: proveedoresActions,
    onEdit: (id, field, value) => handleEdit(id, field, value, 'proveedores'),
    tableType: 'proveedores',
    onPageChange: (page) => { currentProveedoresPage = page; },
    checkboxColumn: false,
    checkboxColumnPosition: null,
    checkboxHeaderAction: null,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: false
}

function getCurrentData() {
    switch (currentEditingTable) {
        case 'choferes':
            return mockChoferes;
        case 'clientes':
            return mockClientes;
        case 'proveedores':
            return mockProveedores;
        default:
            return [];
    }
}

export function renderCurrentTable() {
    switch (currentEditingTable) {
        case 'choferes':
            return renderTables(mockChoferes, currentChoferesPage, optionsChoferes);
        case 'clientes':
            return renderTables(mockClientes, currentClientesPage, optionsClientes);
        case 'proveedores':
            return renderTables(mockProveedores, currentProveedoresPage, optionsProveedores);
        default:
            return [];
    }
}

async function saveEditLists(payload, currentDataFunc = () => { }, saveEditFunc = () => { }) {
    const currentData = currentDataFunc();
    const index = currentData.findIndex(c => c.id === editingRowId);
    const response = await saveEditFunc();
    if (response && index !== -1) {
        currentData[index] = payload;
        showConfirmModal('Cambios guardados.');
    }
}

function seePassword(passwordId) {
    const iconoToggle = document.querySelector(".toggle");
    const inputPassword = document.getElementById("password-input");
    iconoToggle.addEventListener("click", (e) => {
        if (inputPassword?.type === "password") {
            inputPassword.type = "text";
            e.target.classList.replace("bi-eye-slash", "bi-eye");
        } else {
            inputPassword.type = "password";
            e.target.classList.replace("bi-eye", "bi-eye-slash");
        }
    });
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
    try {
        switch (tipo) {
            case 'chofer':
                const modalViajesPagos = document.getElementById("viajesPagosModal");
                if (modalViajesPagos) {
                    try {
                        const response = await fetch('/FRONTEND/viajes-pagos.html');
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
                break;
            case 'cliente':
                const modalViajesClientes = document.getElementById("viajesClientesModal");
                if (modalViajesClientes) {
                    try {
                        const response = await fetch('/FRONTEND/viajes-clientes.html');
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
                break;
            case 'proveedor':
                const modalOrdenesProveedor = document.getElementById("ordenesProveedoresModal");
                if (modalOrdenesProveedor) {
                    try {
                        const response = await fetch('/FRONTEND/ordenes-proveedor.html');
                        if (!response.ok) {
                            throw new Error(`Error HTTP: ${response.status}`);
                        }
                        const ordenesProveedorHtml = await response.text();
                        modalOrdenesProveedor.innerHTML = ordenesProveedorHtml;
                        modalOrdenesProveedor.classList.toggle("active");
                        inicializarModalProveedor(choferData);
                    } catch (error) {
                        console.log(error.message);
                    }
                }
                break;
            default:
        }
    } catch (error) {
        console.error("Ocurrio un error al cargar los viajes. ", error.message);
        showConfirmModal("Ocurrio un error al cargar los datos");
    }
}

async function handleTabContentDisplay(selectedTab) {
    const choferesContent = document.getElementById('content-choferes');
    const clientesContent = document.getElementById('content-clientes');
    const proveedoresContent = document.getElementById('content-proveedores');
    if (mockChoferes?.length === 0) {
        mockChoferes = await fetchAllDataChoferes();
    }
    if (mockClientes?.length === 0) {
        mockClientes = await fetchClientes();
        mockClientes.forEach(c => {
            c.balance = parseImporte(c.balance);
        });
    }
    if (mockProveedores?.length === 0) {
        mockProveedores = await fetchProveedores();
        mockProveedores.forEach(c => {
            c.balance = parseImporte(c.balance);
        });
    }
    switch (selectedTab) {
        case 'choferes':
            choferesContent.classList.remove('hidden');
            clientesContent.classList.add('hidden');
            proveedoresContent.classList.add('hidden');
            renderTables(mockChoferes, 1, optionsChoferes);
            break;
        case 'clientes':
            mockClientes = await fetchClientes();
            mockClientes.forEach(c => {
                c.balance = parseImporte(c.balance);
            });
            choferesContent.classList.add('hidden');
            clientesContent.classList.remove('hidden');
            proveedoresContent.classList.add('hidden');
            renderTables(mockClientes, 1, optionsClientes);
            break;
        case 'proveedores':
            mockProveedores = await fetchProveedores();
            mockProveedores.forEach(c => {
                c.balance = parseImporte(c.balance);
            });
            choferesContent.classList.add('hidden');
            clientesContent.classList.add('hidden');
            proveedoresContent.classList.remove('hidden');
            renderTables(mockProveedores, 1, optionsProveedores);
            break;
    }
    currentEditingTable = selectedTab;
    resetEditingState();
}

// --- Lógica de la barra de búsqueda ---
export function setupSearchBar(searchBarId, filterFunc, renderFunc) {
    const searchInput = document.querySelector(`#${searchBarId} .search-input`);
    const searchIcon = document.querySelector(`#${searchBarId} .search-icon`);

    if (searchInput && searchIcon) {
        const performSearch = () => {
            const searchTerm = searchInput.value.toLowerCase();
            let filteredData = [];
            filteredData = filterFunc(searchTerm);
            renderFunc(filteredData);
        }

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
                renderTables(mockChoferes, currentChoferesPage, optionsChoferes);
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
    const formCardCliente = document.getElementById('addClienteCard');
    const btnGuardarCliente = document.getElementById('btnGuardarNuevoCliente');
    if (btnAddCliente) {
        btnAddCliente.addEventListener('click', () => {
            formCardCliente.classList.toggle('hidden');
        });
    }

    if (btnGuardarCliente) {
        btnGuardarCliente.addEventListener('click', async () => {
            const formCliente = document.getElementById('form-cliente');
            const clienteData = new FormData(formCliente);
            for (let [key, value] of clienteData.entries()) {
                clienteData[key] = value.trim();
            }
            var valid = true;
            ['nombre', 'cuit'].forEach(key => {
                if (!clienteData[key] || clienteData[key] === '')
                    valid = false;
            });
            if (!valid) { return showConfirmModal('Por favor completá los campos obligatorios.'); }
            const payload = {
                cuit: clienteData.cuit,
                nombre: clienteData.nombre,
                email: clienteData.email !== '' ? clienteData.email : null
            };
            const response = await insertCliente(payload);
            if (response.ok) {
                const data = await response.json();
                const nuevoCliente = {
                    id: payload.cuit,
                    balance: data.balance ? data.balance : 0,
                    ...payload
                };
                mockClientes.push(nuevoCliente);
                renderTables(mockClientes, currentClientesPage, optionsClientes);
                formCliente.reset();
                formCardCliente.classList.add('hidden');
                showConfirmModal(data.message);
            } else {
                const dataError = await response.json();
                showConfirmModal(dataError.message);
            }
        });
    }

    const btnAddProveedor = document.getElementById('btnAddProveedor');
    const formCardProveedor = document.getElementById('addProveedorCard');
    const btnGuardarProveedor = document.getElementById('btnGuardarNuevoProveedor');
    if (btnAddProveedor) {
        btnAddProveedor.addEventListener('click', () => {
            formCardProveedor.classList.toggle('hidden');
        });
    }

    if (btnGuardarProveedor) {
        btnGuardarProveedor.addEventListener('click', async () => {
            const formProveedor = document.getElementById('form-proveedor');
            const proveedorData = new FormData(formProveedor);
            for (let [key, value] of proveedorData.entries()) {
                proveedorData[key] = value.trim();
            }
            var valid = true;
            ['nombre', 'cuit'].forEach(key => {
                if (!proveedorData[key] || proveedorData[key] === '')
                    valid = false;
            });
            if (!valid) { return showConfirmModal('Por favor completá los campos obligatorios.'); }
            const payload = {
                cuit: proveedorData.cuit,
                nombre: proveedorData.nombre,
                telefono: proveedorData.telefono || null
            };
            const response = await insertProveedor(payload);
            if (response.ok) {
                const data = await response.json();
                const nuevoProveedor = {
                    id: payload.cuit,
                    balance: data.balance ? data.balance : 0,
                    ...payload
                };
                mockProveedores.push(nuevoProveedor);
                renderTables(mockProveedores, currentProveedoresPage, optionsProveedores);
                formProveedor.reset();
                formCardProveedor.classList.add('hidden');

                showConfirmModal(data.message);
            } else {
                const dataError = await response.json();
                showConfirmModal(dataError.message);
            }
        });
    }
}

// --- Lógica de Eliminación ---
async function handleDelete(cuil, tableType, deleteFunc = () => { }) {
    try {
        const response = await deleteFunc(cuil);
        if (response) {
            const currentData = getCurrentData();
            console.log(currentData);
            const index = currentData.findIndex(data => data.id === cuil);
            currentData.splice(index, 1);
            const totalItemsAfter = currentData.length;
            const itemsPerPage = 10;
            const maxPage = Math.ceil(totalItemsAfter / itemsPerPage) || 1;
            switch (tableType) {
                case 'choferes':
                    if (currentChoferesPage > maxPage) currentChoferesPage = maxPage;
                    renderTables(mockChoferes, currentChoferesPage, optionsChoferes);
                    showConfirmModal('Chofer eliminado exitosamente.');
                    break;
                case 'clientes':
                    if (currentClientesPage > maxPage) currentClientesPage = maxPage;
                    renderTables(mockClientes, currentClientesPage, optionsClientes);
                    showConfirmModal('Cliente eliminado exitosamente.');
                    break;
                case 'proveedores':
                    console.log(currentData);
                    if (currentProveedoresPage > maxPage) currentProveedoresPage = maxPage;
                    renderTables(mockProveedores, currentProveedoresPage, optionsProveedores);
                    showConfirmModal('Proveedor eliminado exitosamente.');
                    break;
            }
        }
    } catch (error) {
        console.log(error.message);
    }

    resetEditingState();
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
    setupSearchBar('choferesSearchBar',
        (searchTerm) => {
            currentChoferesPage = 1;
            return mockChoferes.filter(chofer =>
                chofer.nombre?.toLowerCase().includes(searchTerm) ||
                chofer.cuil?.toLowerCase().includes(searchTerm) ||
                chofer.patente_chasis?.toLowerCase().includes(searchTerm) ||
                chofer.patente_acoplado?.toLowerCase().includes(searchTerm)
            );
        },
        (filteredData) => renderTables(filteredData, 1, optionsChoferes)
    );
    setupSearchBar('clientesSearchBar',
        (searchTerm) => {
            currentClientesPage = 1;
            return mockClientes.filter(cliente =>
                cliente.nombre.toLowerCase().includes(searchTerm) ||
                cliente.cuit.toLowerCase().includes(searchTerm)
            );
        },
        (filteredData) => renderTables(filteredData, 1, optionsClientes)
    );
    setupSearchBar('proveedoresSearchBar',
        (searchTerm) => {
            currentProveedoresPage = 1;
            return mockProveedores.filter(proveedor =>
                proveedor.nombre.toLowerCase().includes(searchTerm) ||
                proveedor.cuit.toLowerCase().includes(searchTerm)
            );
        },
        (filteredData) => renderTables(filteredData, 1, optionsProveedores)
    );
    setupAddButtons();
    seePassword("password-input");

    toggleSpinnerVisible(principalContent);

    socket.on('nuevoUsuario', async (user) => {
        mockChoferes.push(user);
        //console.log("Nuevo chofer añadido");
        if (currentEditingTableType === "choferes" && editingRowId) return;
        renderTables(mockChoferes, currentChoferesPage, optionsChoferes);
    });

    socket.on('updateUsuario', async (user) => {
        let chofer = mockChoferes.find(chofer => chofer.cuil === user.cuilOriginal);
        const updatedData = user.updatedData;
        if (chofer) {
            //console.log(`Chofer con cuil ${user.cuilOriginal} modificado`);
            Object.assign(chofer, updatedData);
            if (currentEditingTableType === "choferes" && editingRowId) {
                if (editingRowId === user.cuilOriginal) {
                    resetEditingState();
                    changeSpinnerText(principalContent, "Actualizando datos...");
                    toggleSpinnerVisible(principalContent);
                    await renderTables(mockChoferes, currentChoferesPage, optionsChoferes);
                    toggleSpinnerVisible(principalContent);
                    changeSpinnerText(principalContent);
                    showConfirmModal("Se han actualizado los datos");
                }
                return;
            }
            renderTables(mockChoferes, currentChoferesPage, optionsChoferes);
        }
    });

    socket.on('deleteUsuario', async (user) => {
        const chofer = mockChoferes.find(chofer => chofer.cuil === user.cuil);
        mockChoferes = mockChoferes.filter(chofer => chofer.cuil !== user.cuil);
        if (currentEditingTableType === "choferes" && editingRowId) {
            if (chofer.id === editingRowId) {
                resetEditingState();
                changeSpinnerText(principalContent, "Actualizando datos...");
                toggleSpinnerVisible(principalContent);
                await renderTables(mockChoferes, currentChoferesPage, optionsChoferes);
                toggleSpinnerVisible(principalContent);
                changeSpinnerText(principalContent);
                showConfirmModal("Se han actualizado los datos");
            }
            return;
        }
        renderTables(mockChoferes, currentChoferesPage, optionsChoferes);
    });

    socket.on('balanceUpdatedCliente', async (data) => {
        console.log("Balance cliente " + data.cuit + " actualizado.");
        const client = mockClientes.find(client => client.cuit === data.cuit);
        if (client) {
            if (client.cuit !== getClienteCuit())
                client.balance = data.balance;
            else
                return;
            if (currentEditingTableType === "clientes" && editingRowId)
                if (editingRowId === client.cuit) {
                    resetEditingState();
                    showConfirmModal("Se actualizo el balance del cliente");
                } else
                    return;
            console.log(client.balance);
            renderTables(mockClientes, currentClientesPage, optionsClientes);
        }
    });

    socket.on('balanceUpdatedProveedor', async (data) => {
        console.log("Balance proveedor " + data.cuit + " actualizado.");
        const proveedor = mockProveedores.find(proveedor => proveedor.cuit === data.cuit);
        if (proveedor) {
            if (proveedor.cuit !== getProveedorCuit())
                proveedor.balance = data.balance;
            else
                return;
            if (currentEditingTableType === "proveedores" && editingRowId)
                if (editingRowId === proveedor.cuit) {
                    resetEditingState();
                    showConfirmModal("Se actualizo el balance del proveedor");
                } else
                    return;
            renderTables(mockProveedores, currentProveedoresPage, optionsProveedores);
        }
    });

    socket.on('nuevoCliente', async (client) => {
        mockClientes.push(client);
        //console.log("Nuevo cliente añadido");
        if (currentEditingTableType === "clientes" && editingRowId) return;
        renderTables(mockClientes, currentClientesPage, optionsClientes);
    });

    socket.on('updateCliente', async (client) => {
        let cliente = mockClientes.find(cliente => cliente.cuit === client.cuitOriginal);
        const updatedData = client.updatedData;
        if (cliente) {
            Object.assign(cliente, updatedData);
            //console.log(`Cliente con cuit ${client.cuitOriginal} modificado`);
            if (currentEditingTableType === "clientes" && editingRowId) {
                if (editingRowId === client.cuitOriginal) {
                    resetEditingState();
                    changeSpinnerText(principalContent, "Actualizando datos...");
                    toggleSpinnerVisible(principalContent);
                    await renderTables(mockClientes, currentClientesPage, optionsClientes);
                    toggleSpinnerVisible(principalContent);
                    changeSpinnerText(principalContent);
                    showConfirmModal("Se han actualizado los datos");
                }
                return;
            }
            renderTables(mockClientes, currentClientesPage, optionsClientes);
        }
    });

    socket.on('deleteCliente', async (client) => {
        const cliente = mockClientes.find(cliente => cliente.cuit === client.cuit);
        mockClientes = mockClientes.filter(cliente => cliente.cuit !== client.cuit);
        if (currentEditingTableType === "clientes" && editingRowId) {
            if (cliente.id === editingRowId) {
                resetEditingState();
                changeSpinnerText(principalContent, "Actualizando datos...");
                toggleSpinnerVisible(principalContent);
                await renderTables(mockClientes, currentClientesPage, optionsClientes);
                toggleSpinnerVisible(principalContent);
                changeSpinnerText(principalContent);
                showConfirmModal("Se han actualizado los datos");

            }
            return;
        }
        renderTables(mockClientes, currentClientesPage, optionsClientes);
    });

    socket.on('nuevoProveedor', async (proveedor) => {
        mockProveedores.push(proveedor);
        if (currentEditingTableType === "proveedor" && editingRowId) return;
        renderTables(mockProveedores, currentProveedoresPage, optionsProveedores);
    });

    socket.on('deleteProveedor', async (proveedor) => {
        console.log(proveedor);
        const proveedorData = mockProveedores.find(p => p.cuit === proveedor.cuit);
        mockProveedores = mockProveedores.filter(p => p.cuit !== proveedor.cuit);
        if (currentEditingTableType === "proveedores" && editingRowId) {
            if (proveedorData.id === editingRowId) {
                resetEditingState();
                changeSpinnerText(principalContent, "Actualizando datos...");
                toggleSpinnerVisible(principalContent);
                await renderTables(mockProveedores, currentProveedoresPage, optionsProveedores);
                toggleSpinnerVisible(principalContent);
                changeSpinnerText(principalContent);
                showConfirmModal("Se han actualizado los datos");
            }
            return;
        }
        renderTables(mockProveedores, currentProveedoresPage, optionsProveedores);
    });

    socket.on('updateProveedor', async (proveedor) => {
        let proveedorData = mockProveedores.find(p => p.cuit === proveedor.cuitOriginal);
        const updatedData = proveedor.updatedData;
        if (proveedorData) {
            //console.log(`Cliente con cuit ${client.cuitOriginal} modificado`);
            Object.assign(proveedorData, updatedData);
            if (currentEditingTableType === "proveedores" && editingRowId) {
                if (editingRowId === proveedor.cuitOriginal) {
                    resetEditingState();
                    changeSpinnerText(principalContent, "Actualizando datos...");
                    toggleSpinnerVisible(principalContent);
                    await renderTables(mockProveedores, currentProveedoresPage, optionsProveedores);
                    toggleSpinnerVisible(principalContent);
                    changeSpinnerText(principalContent);
                    showConfirmModal("Se han actualizado los datos");
                }
                return;
            }
            renderTables(mockProveedores, currentProveedoresPage, optionsProveedores);
        }
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
