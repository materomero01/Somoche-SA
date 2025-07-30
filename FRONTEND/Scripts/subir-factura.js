// FRONTEND/scripts/factura-upload.js
import { showConfirmModal, uploadFactura } from './apiPublic.js';

export let viajesFactura = [];

// Initialize the factura upload modal
export async function initializeFacturaUpload(changeDataFactura) {
    if (viajesFactura.length === 0)
        return showConfirmModal("Selecciona los viajes para los que desea subir la factura");
    const modal = document.createElement('div');
    modal.id = 'facturaUploadModal';
    modal.className = 'modal';
    modal.classList.add('active');
    try {
        const response = await fetch('/FRONTEND/facturaBox.html');
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        const facturaBoxHtml = await response.text();
        if (facturaBoxHtml){
            modal.innerHTML = facturaBoxHtml;
            document.body.appendChild(modal);
        } else 
            return showConfirmModal("No se pudo cargar el apartado de Facturación");
    } catch (error) {
        console.log(error.message);
    }

    const dropArea = document.getElementById('dropArea');
    const facturaInput = document.getElementById('facturaInput');
    const uploadBtn = document.getElementById('uploadFacturaBtn');
    const cancelBtn = document.getElementById('cancelFacturaBtn');
    const uploadStatus = document.getElementById('uploadStatus');

    let selectedFile = null;
    let currentViajeId = null;

    // Handle file selection
    facturaInput.addEventListener('change', (e) => {
        selectedFile = e.target.files[0];
        if (selectedFile) {
            uploadStatus.textContent = `Archivo seleccionado: ${selectedFile.name}`;
            uploadBtn.disabled = false;
        } else {
            uploadStatus.textContent = '';
            uploadBtn.disabled = true;
        }
    });

    // Handle drag-and-drop
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('drag-over');
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('drag-over');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('drag-over');
        selectedFile = e.dataTransfer.files[0];
        if (selectedFile && ['application/pdf', 'image/jpeg', 'image/png'].includes(selectedFile.type)) {
            uploadStatus.textContent = `Archivo seleccionado: ${selectedFile.name}`;
            uploadBtn.disabled = false;
            facturaInput.files = e.dataTransfer.files;
        } else {
            uploadStatus.textContent = 'Por favor, selecciona un archivo PDF, JPG o PNG.';
            uploadBtn.disabled = true;
        }
    });

    // Handle upload
    uploadBtn.addEventListener('click', async () => {
        console.log(viajesFactura);
        if (!selectedFile || viajesFactura.length === 0) return;

        try {
            const response = await uploadFactura(viajesFactura, selectedFile, localStorage.getItem('userCuil'));
            const data = await response.json();

            if (response.ok)
                showConfirmModal('Factura subida con éxito');
            else {
                console.log(data.message);
                showConfirmModal("Ocurrio un error al subir la factura");
            }
            
            const facturaId = data.facturaId;
            await changeDataFactura(facturaId);
            viajesFactura = [];
            closeModal();
        } catch (error) {
            showConfirmModal(`Error al subir la factura: ${error.message}`);
        }
    });

    // Handle cancel
    cancelBtn.addEventListener('click', () => {
        closeModal();
    });

    function closeModal() {
        modal.remove();
        selectedFile = null;
        currentViajeId = null;
        facturaInput.value = '';
        uploadStatus.textContent = '';
        uploadBtn.disabled = true;
    }

    // Function to show the modal for a specific viaje
    window.showFacturaUploadModal = (viajeId) => {
        currentViajeId = viajeId;
        modal.classList.add('active');
    };
}

function newHandleFacturaCheckbox(itemId, checked) {
    if (checked) {
        window.showFacturaUploadModal(itemId);
    } else {
        originalHandleFacturaCheckbox(itemId, checked);
    }
}