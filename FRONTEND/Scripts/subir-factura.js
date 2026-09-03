import { getCartaPorte, getFactura, showConfirmModal, uploadFactura, getArchivosViaje, getArchivoViaje } from './apiPublic.js';

// tableTypes para los que tiene sentido la sección "Otros Archivos" (ligada a la tabla
// viaje o viaje_cliente); no aplica a órdenes de proveedor, que usan otras tablas.
const TIPOS_CON_OTROS_ARCHIVOS = ['viajes', 'viajesChofer', 'viajeCliente', 'resumenes'];

export let viajesFactura = [];
export let viaje = [];
let generatedUrls = [];

let facturaFile = null;
let cartaPorteFiles = [];

let facturaDropArea;
let cartaPorteDropArea;
let toggleFacturaDropbox;
let toggleCartaPorteDropbox;
let facturaActions;
let cartaPorteActions;
let facturaExists = false;
let cartaPorteExists = false;

let modal;

// Funciones para subir/eliminar "otros archivos", inyectadas por quien abre el modal
// (viajes-clientes.js / viajes-pagos.js) porque son operaciones exclusivas de administradores;
// este módulo no debe llamar a la API directamente para no exponer esas acciones a choferes.
let uploadArchivoFuncActual = null;
let deleteArchivoFuncActual = null;

export function updateViajeStatus() {
    if (viaje.length !== 0) {
        facturaExists = viaje[0].factura_id ? true : false;
        cartaPorteExists = viaje[0].carta_porte;

        toggleFacturaDropbox.style.display = facturaExists ? 'none' : 'inline';
        facturaActions.style.display = facturaExists ? 'flex' : 'none';
        facturaDropArea.classList.toggle('active', !facturaExists);

        toggleCartaPorteDropbox.style.display = cartaPorteExists ? 'none' : 'inline';
        cartaPorteActions.style.display = cartaPorteExists ? 'flex' : 'none';
        cartaPorteDropArea.classList.toggle('active', !cartaPorteExists);
    }
}

export function closeModalFactura() {
    if (modal) modal.remove();
    cartaPorteFiles = [];
    viaje = [];
    facturaFile = null;
    uploadArchivoFuncActual = null;
    deleteArchivoFuncActual = null;
    generatedUrls.forEach(url => {
        window.URL.revokeObjectURL(url);
        //console.log('URL liberada:', url);
    });
    generatedUrls = [];
}
// Initialize the document upload modal

export async function initializeFacturaUpload(changeDataFactura, cartaPorteFunc, deleteFunc, tableType = "viajes", selectedRows = [], iva = true, onlyFactura = false, confirmarEliminarFactura = true, clienteCuit = null, uploadArchivoFunc = null, deleteArchivoFunc = null) {
    if (selectedRows.length === 0 && viaje.length === 0) {
        return showConfirmModal("Selecciona los viajes para los que desea subir los documentos");
    }

    uploadArchivoFuncActual = uploadArchivoFunc;
    deleteArchivoFuncActual = deleteArchivoFunc;
    let otroArchivoFile = null;

    modal = document.createElement('div');
    modal.id = viaje.length > 0 ? 'documentUploadModal' : 'documentUploadBoxModal';
    modal.className = 'modal';

    try {
        let urlFetch = viaje.length > 0 ? './documentsBox.html' : './facturaBox.html';
        const response = await fetch(urlFetch);
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        const facturaBoxHtml = await response.text();
        if (facturaBoxHtml) {
            modal.innerHTML = facturaBoxHtml;
            document.body.appendChild(modal);
        } else {
            return showConfirmModal("No se pudo cargar el apartado de Documentos");
        }
    } catch (error) {
        console.log(error.message);
        return showConfirmModal("Error al cargar el modal de documentos");
    }

    facturaDropArea = document.getElementById('facturaDropArea');
    cartaPorteDropArea = document.getElementById('cartaPorteDropArea');
    const facturaInput = document.getElementById('facturaInput');
    const cartaPorteInput = document.getElementById('cartaPorteInput');
    const uploadBtn = document.getElementById('uploadDocumentsBtn');
    const cancelBtn = document.getElementById('cancelDocumentsBtn');
    const facturaUploadStatus = document.getElementById('facturaUploadStatus');
    const cartaPorteUploadStatus = document.getElementById('cartaPorteUploadStatus');
    toggleFacturaDropbox = document.getElementById('toggleFacturaDropbox');
    toggleCartaPorteDropbox = document.getElementById('toggleCartaPorteDropbox');
    facturaActions = document.getElementById('facturaActions');
    cartaPorteActions = document.getElementById('cartaPorteActions');
    const downloadFacturaBtn = document.getElementById('downloadFacturaBtn');
    const deleteFacturaBtn = document.getElementById('deleteFacturaBtn');
    const downloadCartaPorteBtn = document.getElementById('downloadCartaPorteBtn');
    const deleteCartaPorteBtn = document.getElementById('deleteCartaPorteBtn');
    const valueViajes = document.getElementById('valueViajes');

    if (valueViajes && tableType === "viajeCliente"){
        valueViajes.textContent = `Total ${iva? "con IVA" : "sin IVA"} de los ${selectedRows.length} viajes seleccionados: $${parseFloat(selectedRows.reduce((sum, viaje) => { return iva? sum + viaje.importe + viaje.iva : sum + viaje.importe}, 0)).toFixed(2)}`;
        valueViajes.classList.remove("hidden");
    }

    // Check if documents already exist for the viaje
    await updateViajeStatus();

    if (viaje.length > 0) {
        if (!cartaPorteFunc) {
            if (onlyFactura) {
                document.getElementById('cartaPorteSection').remove();
                document.getElementById('section-divider').remove();
            } else {
                cartaPorteExists = viaje[0].carta_porte;
                cartaPorteDropArea.remove();
                deleteCartaPorteBtn.remove();
                toggleCartaPorteDropbox.remove();
                cartaPorteActions.style.display = 'flex';
                downloadCartaPorteBtn.disabled = cartaPorteExists ? false : true;
            }
        }
        if (!deleteFunc) {
            facturaExists = viaje[0].factura_id ? true : false;
            downloadFacturaBtn.disabled = facturaExists ? false : true;
            deleteFacturaBtn.remove();
        }
    }

    // Sección "Otros Archivos": solo tiene sentido para viajes/viaje_cliente (Notas de
    // Crédito/Débito y demás archivos sueltos), no para órdenes de proveedor.
    const otrosArchivosAplica = viaje.length > 0 && TIPOS_CON_OTROS_ARCHIVOS.includes(tableType);
    const otrosArchivosSection = document.getElementById('otrosArchivosSection');
    const otrosArchivosDivider = document.getElementById('section-divider-otros');
    const otrosArchivosInput = document.getElementById('otrosArchivosInput');
    const otrosArchivosDescripcionInput = document.getElementById('otrosArchivosDescripcion');
    const otrosArchivosUploadStatus = document.getElementById('otrosArchivosUploadStatus');
    const otrosArchivosDropArea = document.getElementById('otrosArchivosDropArea');
    const toggleOtrosArchivosDropbox = document.getElementById('toggleOtrosArchivosDropbox');

    if (!otrosArchivosAplica) {
        otrosArchivosSection?.remove();
        otrosArchivosDivider?.remove();
    } else {
        try {
            // Si el ítem representa una factura agrupada (varios viajes bajo el mismo
            // comprobante), se buscan los archivos de todos esos viajes en conjunto.
            const esVistaAgrupada = Array.isArray(viaje[0].viaje_comprobantes);
            const comprobantesArchivos = Array.isArray(viaje[0].viaje_comprobantes) && viaje[0].viaje_comprobantes.length > 0
                ? viaje[0].viaje_comprobantes.join(',')
                : viaje[0].comprobante;

            const archivosResponse = await getArchivosViaje(comprobantesArchivos, tableType === 'viajeCliente' ? clienteCuit : null);
            if (archivosResponse?.ok) {
                const archivosData = await archivosResponse.json();
                viaje[0].archivos = archivosData.archivos || [];
            } else {
                viaje[0].archivos = viaje[0].archivos || [];
            }

            if (!uploadArchivoFuncActual || esVistaAgrupada) {
                // Sin función de subida inyectada (p. ej. vista de chofer), o vista de factura
                // agrupada (varios viajes bajo el mismo comprobante): no hay un único viaje al
                // que asociar un archivo nuevo, así que solo se puede ver y descargar lo ya
                // existente, no cargar archivos nuevos.
                otrosArchivosDropArea?.remove();
            } else {
                const seleccionarOtroArchivo = (file) => {
                    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
                        otroArchivoFile = null;
                        otrosArchivosUploadStatus.textContent = 'Por favor, selecciona un archivo PDF, JPG o PNG.';
                    } else {
                        otroArchivoFile = file;
                        otrosArchivosUploadStatus.textContent = `Archivo seleccionado: ${file.name}`;
                    }
                    actualizarEstadoUploadBtn();
                };

                toggleOtrosArchivosDropbox?.addEventListener('click', () => {
                    otrosArchivosDropArea.classList.toggle('active');
                    toggleOtrosArchivosDropbox.classList.toggle('active');
                });

                otrosArchivosInput?.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) seleccionarOtroArchivo(file);
                });

                otrosArchivosDropArea?.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    otrosArchivosDropArea.classList.add('drag-over');
                });

                otrosArchivosDropArea?.addEventListener('dragleave', () => {
                    otrosArchivosDropArea.classList.remove('drag-over');
                });

                otrosArchivosDropArea?.addEventListener('drop', (e) => {
                    e.preventDefault();
                    otrosArchivosDropArea.classList.remove('drag-over');
                    const file = e.dataTransfer.files[0];
                    if (file) {
                        seleccionarOtroArchivo(file);
                        otrosArchivosInput.files = e.dataTransfer.files;
                    }
                });
            }

            renderArchivosViaje();
        } catch (error) {
            // Un fallo acá (ej. red, respuesta inesperada) no debe tirar abajo el resto del
            // modal (factura, carta de porte): se deja la sección oculta y se loguea el error.
            console.error('Error al inicializar la sección de Otros Archivos:', error);
            otrosArchivosSection?.remove();
            otrosArchivosDivider?.remove();
        }
    }

    modal.classList.add('active');

    // El botón "Subir" del modal es general a todas las secciones: se habilita si hay algo
    // para subir (factura, carta de porte, u otro archivo) y sube todo junto al clickearlo.
    const actualizarEstadoUploadBtn = () => {
        uploadBtn.disabled = !(facturaFile || cartaPorteFiles.length > 0 || otroArchivoFile);
    };

    // Handle file selection for factura
    facturaInput?.addEventListener('change', (e) => {
        facturaFile = e.target.files[0];
        if (facturaFile) {
            facturaUploadStatus.textContent = `Archivo seleccionado: ${facturaFile.name}`;
        } else {
            facturaUploadStatus.textContent = '';
        }
        actualizarEstadoUploadBtn();
    });

    // Handle file selection for carta de porte
    cartaPorteInput?.addEventListener('change', (e) => {
        cartaPorteFiles = Array.from(e.target.files);
        if (cartaPorteFiles.length > 0) {
            cartaPorteUploadStatus.textContent = `Archivos seleccionados: ${cartaPorteFiles.map(f => f.name).join(', ')}`;
        } else {
            cartaPorteUploadStatus.textContent = '';
        }
        actualizarEstadoUploadBtn();
    });

    // Handle drag-and-drop for factura
    facturaDropArea?.addEventListener('dragover', (e) => {
        e.preventDefault();
        facturaDropArea.classList.add('drag-over');
    });

    facturaDropArea?.addEventListener('dragleave', () => {
        facturaDropArea.classList.remove('drag-over');
    });

    facturaDropArea?.addEventListener('drop', (e) => {
        e.preventDefault();
        facturaDropArea.classList.remove('drag-over');
        facturaFile = e.dataTransfer.files[0];
        if (facturaFile && ['application/pdf', 'image/jpeg', 'image/png'].includes(facturaFile.type)) {
            facturaUploadStatus.textContent = `Archivo seleccionado: ${facturaFile.name}`;
            facturaInput.files = e.dataTransfer.files;
        } else {
            facturaFile = null;
            facturaUploadStatus.textContent = 'Por favor, selecciona un archivo PDF, JPG o PNG.';
        }
        actualizarEstadoUploadBtn();
    });

    // Handle drag-and-drop for carta de porte
    cartaPorteDropArea?.addEventListener('dragover', (e) => {
        e.preventDefault();
        cartaPorteDropArea.classList.add('drag-over');
    });

    cartaPorteDropArea?.addEventListener('dragleave', () => {
        cartaPorteDropArea.classList.remove('drag-over');
    });

    cartaPorteDropArea?.addEventListener('drop', (e) => {
        e.preventDefault();
        cartaPorteDropArea.classList.remove('drag-over');
        cartaPorteFiles = Array.from(e.dataTransfer.files).filter(file =>
            ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)
        );
        if (cartaPorteFiles.length > 0) {
            cartaPorteUploadStatus.textContent = `Archivos seleccionados: ${cartaPorteFiles.map(f => f.name).join(', ')}`;
            cartaPorteInput.files = e.dataTransfer.files;
        } else {
            cartaPorteUploadStatus.textContent = 'Por favor, selecciona archivos PDF, JPG o PNG.';
        }
        actualizarEstadoUploadBtn();
    });

    // Toggle factura dropbox
    toggleFacturaDropbox?.addEventListener('click', () => {
        facturaDropArea.classList.toggle('active');
        toggleFacturaDropbox.classList.toggle('active');
    });

    // Toggle carta de porte dropbox
    toggleCartaPorteDropbox?.addEventListener('click', () => {
        cartaPorteDropArea.classList.toggle('active');
        toggleCartaPorteDropbox.classList.toggle('active');
    });

    // Handle upload
    uploadBtn?.addEventListener('click', async () => {
        if (!facturaFile && cartaPorteFiles.length === 0 && !otroArchivoFile) return;

        const otroArchivoDescripcion = otrosArchivosDescripcionInput?.value?.trim();
        if (otroArchivoFile && !otroArchivoDescripcion) {
            showConfirmModal('Ingrese una descripción para el archivo');
            return;
        }

        try {
            let facturaId = null;
            let facturaEstado = null;
            if (facturaFile) {
                if (selectedRows.length === 0 && viaje.length > 0) {
                    selectedRows.push(viaje[0].comprobante);
                }
                const facturaResponse = await uploadFactura(viaje.length === 0 && tableType === "viajeCliente" ? selectedRows.map(r => r.comprobante) : selectedRows, facturaFile, localStorage.getItem('userCuil'), tableType);
                const facturaData = await facturaResponse.json();
                if (!facturaResponse.ok) throw new Error(facturaData.message);
                facturaId = facturaData.facturaId;
                if (tableType === "viajeCliente" && facturaData.estado) facturaEstado = facturaData.estado;
            }

            if (cartaPorteFiles.length > 0 && cartaPorteFunc && viaje.length > 0) {
                await cartaPorteFunc(cartaPorteFiles);
            }

            if (facturaId) {
                await changeDataFactura(facturaId, viaje.length > 0 && tableType === "viajeCliente" ? viaje : selectedRows, facturaEstado);
                if (viaje.length > 0) {
                    viaje[0].factura_id = facturaId; // Actualiza el viaje actual
                }
            }

            if (otroArchivoFile && uploadArchivoFuncActual && viaje.length > 0) {
                const archivoResponse = await uploadArchivoFuncActual(viaje[0].comprobante, tableType === 'viajeCliente' ? clienteCuit : null, otroArchivoDescripcion, otroArchivoFile);
                const archivoData = await archivoResponse.json();
                if (!archivoResponse.ok) throw new Error(archivoData.message || archivoData.error || 'Error al subir el archivo');
                viaje[0].archivos = [...(viaje[0].archivos || []), { id: archivoData.id, descripcion: otroArchivoDescripcion }];
                renderArchivosViaje();
            }

            showConfirmModal('Documentos subidos con éxito');
            selectedRows = [];
            closeModalFactura();
        } catch (error) {
            showConfirmModal(`Error al subir los documentos: ${error.message}`);
        }
    });

    // Handle download factura
    downloadFacturaBtn?.addEventListener('click', async () => {
        if (viaje.length > 0 && viaje[0].factura_id) {
            try {
                const response = await getFactura(viaje[0].cuil, viaje[0].factura_id);
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Error al obtener la factura');
                }

                const data = await response.blob();
                const url = window.URL.createObjectURL(data);
                generatedUrls.push(url);
                window.open(url, '_blank');
            } catch (error) {
                console.log(error.message);
                showConfirmModal("No se pudo obtener la factura para descargar");
            }
        }
    });

    // Handle delete factura
    deleteFacturaBtn?.addEventListener('click', async () => {
        if (viaje.length > 0 && viaje[0].factura_id !== null) {
            const ejecutarEliminacion = async () => {
                let response = await deleteFunc(viaje[0].factura_id);
                if (response) {
                    toggleFacturaDropbox.style.display = 'inline';
                    facturaActions.style.display = 'none';
                    facturaDropArea.classList.toggle('active', true);
                }
            };

            if (confirmarEliminarFactura) {
                showConfirmModal(`¿Está seguro de que desea eliminar la factura del viaje con comprobante ${viaje[0].comprobante}?`, "delete", ejecutarEliminacion);
            } else {
                await ejecutarEliminacion();
            }
        }
    });

    // Handle download carta de porte
    downloadCartaPorteBtn?.addEventListener('click', async () => {
        if (viaje.length > 0 && viaje[0].carta_porte) {
            try {
                const response = await getCartaPorte(viaje[0].cuil, viaje[0].comprobante);
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Error al obtener la factura');
                }

                const data = await response.blob();

                const url = window.URL.createObjectURL(data);

                generatedUrls.push(url);

                // Abrir el PDF en una nueva pestaña
                const pdfWindow = window.open(url, '_blank');
            } catch (error) {
                console.log(error.message);
                showConfirmModal("No se pudo obtener la carta de porte para descargar");
            }
        }
    });

    // Handle delete carta de porte
    deleteCartaPorteBtn?.addEventListener('click', async () => {
        if (viaje.length > 0 && viaje[0].carta_porte) {
            showConfirmModal(`¿Está seguro de que desea eliminar la carta de porte del viaje con comprobante ${viaje[0].comprobante}?`, "delete", async () => {
                await deleteFunc(null, tableType);
                toggleCartaPorteDropbox.style.display = 'inline';
                cartaPorteActions.style.display = 'none';
                cartaPorteDropArea.classList.toggle('active', true);
            });
        }
    });

    // Handle cancel
    cancelBtn?.addEventListener('click', () => { closeModalFactura(); });

    // Function to show the modal for a specific viaje
    window.showDocumentUploadModal = async (viajeId) => {
        currentViajeId = viajeId;
        await checkDocuments();
        modal.classList.add('active');
    };
}

// Descarga un "otro archivo" (p. ej. una Nota de Crédito/Débito) de la misma forma que
// las facturas o cartas de porte.
async function descargarArchivoViajeHandler(id) {
    try {
        const response = await getArchivoViaje(id);
        if (!response.ok) throw new Error('No se pudo obtener el archivo');
        const data = await response.blob();
        const url = window.URL.createObjectURL(data);
        generatedUrls.push(url);
        window.open(url, '_blank');
    } catch (error) {
        console.log(error.message);
        showConfirmModal("No se pudo obtener el archivo para descargar");
    }
}

function eliminarArchivoViajeHandler(id) {
    if (!deleteArchivoFuncActual) return;
    showConfirmModal("¿Está seguro de que desea eliminar este archivo?", "delete", async () => {
        const response = await deleteArchivoFuncActual(id);
        if (!response?.ok) {
            showConfirmModal("No se pudo eliminar el archivo");
            return;
        }
        if (viaje.length > 0) {
            viaje[0].archivos = (viaje[0].archivos || []).filter(a => a.id !== id);
        }
        renderArchivosViaje();
    });
}

// Renderiza la sección "Otros Archivos" del viaje actual a partir de viaje[0].archivos.
// Se exporta para poder refrescarla desde afuera (p. ej. al generar una nota de
// crédito/débito mientras el modal de documentos sigue abierto).
// El dropArea puede no existir (p. ej. vista de chofer, sin función de subida inyectada):
// en ese caso solo se muestra la lista de archivos existentes, sin opción de agregar más.
export function renderArchivosViaje() {
    const section = document.getElementById('otrosArchivosSection');
    const divider = document.getElementById('section-divider-otros');
    const dropArea = document.getElementById('otrosArchivosDropArea');
    const container = document.getElementById('otrosArchivosContainer');
    if (!section || !container) return;

    const archivos = viaje[0]?.archivos || [];
    const esVistaAgrupada = Array.isArray(viaje[0]?.viaje_comprobantes) && viaje[0].viaje_comprobantes.length > 1;
    const puedeAgregar = !!dropArea && !esVistaAgrupada;

    // Si no hay archivos y tampoco se puede agregar uno nuevo (vista de solo lectura sin
    // archivos, o factura agrupada sin archivos todavía), no hay nada que mostrar.
    const mostrarSeccion = archivos.length > 0 || puedeAgregar;
    section.classList.toggle('hidden', !mostrarSeccion);
    divider?.classList.toggle('hidden', !mostrarSeccion);
    if (!mostrarSeccion) return;

    container.innerHTML = '';
    dropArea?.classList.toggle('active', puedeAgregar);
    container.classList.toggle('hidden', archivos.length === 0);

    archivos.forEach(archivo => {
        const box = document.createElement('div');
        box.className = 'archivo-box';
        box.innerHTML = `<i class="bi bi-file-earmark-text archivo-icon"></i>`;

        const descripcionSpan = document.createElement('span');
        descripcionSpan.className = 'archivo-descripcion';
        descripcionSpan.title = archivo.descripcion;
        descripcionSpan.textContent = archivo.descripcion;

        const actions = document.createElement('div');
        actions.className = 'archivo-actions';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn-archivo-download';
        downloadBtn.title = 'Descargar';
        downloadBtn.innerHTML = '<i class="bi bi-download"></i>';
        downloadBtn.onclick = () => descargarArchivoViajeHandler(archivo.id);
        actions.append(downloadBtn);

        if (deleteArchivoFuncActual) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-archivo-delete';
            deleteBtn.title = 'Eliminar';
            deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
            deleteBtn.onclick = () => eliminarArchivoViajeHandler(archivo.id);
            actions.append(deleteBtn);
        }

        box.append(descripcionSpan, actions);
        container.appendChild(box);
    });
}

function newHandleFacturaCheckbox(itemId, checked) {
    if (checked) {
        window.showDocumentUploadModal(itemId);
    } else {
        originalHandleFacturaCheckbox(itemId, checked);
    }
}
