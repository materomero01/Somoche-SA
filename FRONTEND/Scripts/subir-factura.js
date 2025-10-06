import { getCartaPorte, getFactura, showConfirmModal, uploadFactura } from './apiPublic.js';

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

export function updateViajeStatus(){
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
        generatedUrls.forEach(url => {
            window.URL.revokeObjectURL(url);
            //console.log('URL liberada:', url);
        });
        generatedUrls = [];
    }
// Initialize the document upload modal

export async function initializeFacturaUpload(changeDataFactura, cartaPorteFunc, deleteFunc, tableType = "viajes", selectedRows = []) {
    if (selectedRows.length === 0 && viaje.length === 0) {
        return showConfirmModal("Selecciona los viajes para los que desea subir los documentos");
    }

    modal = document.createElement('div');
    modal.id = 'documentUploadModal';
    modal.className = 'modal';
    modal.classList.add('active');

    try {
        let urlFetch = viaje.length > 0 ? '/documentsBox.html' : '/facturaBox.html';
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

    // Check if documents already exist for the viaje
    await updateViajeStatus();

    if (viaje.length > 0 && !cartaPorteFunc && !deleteFunc){
        facturaExists = viaje[0].factura_id ? true : false;
        cartaPorteExists = viaje[0].carta_porte;

        cartaPorteDropArea.remove();
        deleteCartaPorteBtn.remove();
        deleteFacturaBtn.remove();
        toggleCartaPorteDropbox.remove();
        
        downloadFacturaBtn.disabled = facturaExists? false : true;
        cartaPorteActions.style.display = 'flex';
        downloadCartaPorteBtn.disabled = cartaPorteExists? false : true;

    }

    // Handle file selection for factura
    facturaInput?.addEventListener('change', (e) => {
        facturaFile = e.target.files[0];
        if (facturaFile) {
            facturaUploadStatus.textContent = `Archivo seleccionado: ${facturaFile.name}`;
            uploadBtn.disabled = !(facturaFile || cartaPorteFiles.length > 0);
        } else {
            facturaUploadStatus.textContent = '';
            uploadBtn.disabled = true;
        }
    });

    // Handle file selection for carta de porte
    cartaPorteInput?.addEventListener('change', (e) => {
        cartaPorteFiles = Array.from(e.target.files);
        if (cartaPorteFiles.length > 0) {
            cartaPorteUploadStatus.textContent = `Archivos seleccionados: ${cartaPorteFiles.map(f => f.name).join(', ')}`;
            uploadBtn.disabled = !(facturaFile || cartaPorteFiles.length > 0);
        } else {
            cartaPorteUploadStatus.textContent = '';
            uploadBtn.disabled = !facturaFile;
        }
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
            uploadBtn.disabled = !(facturaFile || cartaPorteFiles.length > 0);
            facturaInput.files = e.dataTransfer.files;
        } else {
            facturaUploadStatus.textContent = 'Por favor, selecciona un archivo PDF, JPG o PNG.';
            uploadBtn.disabled = true;
        }
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
            uploadBtn.disabled = !(facturaFile || cartaPorteFiles.length > 0);
            cartaPorteInput.files = e.dataTransfer.files;
        } else {
            cartaPorteUploadStatus.textContent = 'Por favor, selecciona archivos PDF, JPG o PNG.';
            uploadBtn.disabled = !facturaFile;
        }
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
        if (!facturaFile && cartaPorteFiles.length === 0) return;

        try {
            let facturaId = null;
            if (facturaFile) {
                if (selectedRows.length === 0 && viaje.length > 0) {
                    selectedRows.push(viaje[0].comprobante);
                }
                const facturaResponse = await uploadFactura(selectedRows, facturaFile, localStorage.getItem('userCuil'), tableType);
                const facturaData = await facturaResponse.json();
                if (!facturaResponse.ok) throw new Error(facturaData.message);
                facturaId = facturaData.facturaId;
            }

            if (cartaPorteFiles.length > 0 && cartaPorteFunc && viaje.length > 0) {
                await cartaPorteFunc(cartaPorteFiles);
            }

            if (facturaId) {
                await changeDataFactura(facturaId, selectedRows);
                if (viaje.length > 0) {
                    viaje[0].factura_id = facturaId; // Actualiza el viaje actual
                }
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
        //console.log(viaje[0]);
        if (viaje.length > 0 && viaje[0].factura_id !== null) {
            showConfirmModal(`¿Está seguro de que desea eliminar la factura del viaje con comprobante ${viaje[0].comprobante}?`, "delete", async () => {
                await deleteFunc(viaje[0].factura_id);
                toggleFacturaDropbox.style.display = 'inline';
                facturaActions.style.display = 'none';
                facturaDropArea.classList.toggle('active', true);
            });
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
            } catch (error){
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

function newHandleFacturaCheckbox(itemId, checked) {
    if (checked) {
        window.showDocumentUploadModal(itemId);
    } else {
        originalHandleFacturaCheckbox(itemId, checked);
    }
}