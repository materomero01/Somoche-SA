export function renderTabla({ 
    containerId, 
    paginacionContainerId, 
    columnas, 
    datos, 
    itemsPorPagina = 5, 
    currentPage = 1,
    actions = [], 
    editingRowId = null, 
    onEdit = null,
    tableType = 'default',
    onPageChange = null,
    checkboxColumn = false,
    checkboxColumnPosition = 'start',
    onCheckboxChange = null,
    useScrollable = false
}) {
    const container = document.getElementById(containerId);
    const paginacionContainer = useScrollable ? null : document.getElementById(paginacionContainerId);
    const tableWrapper = container.querySelector('.tabla-dinamica');

    if (!container) {
        console.error(`Contenedor de tabla '${containerId}' no encontrado.`);
        return;
    }
    if (!useScrollable && !paginacionContainer) {
        console.error(`Contenedor de paginación '${paginacionContainerId}' no encontrado.`);
        return;
    }

    // Store current scroll position if scrollable
    let scrollPosition = 0;
    if (useScrollable && tableWrapper) {
        scrollPosition = tableWrapper.scrollTop;
    }

    // Limpiar contenedores
    container.innerHTML = "";
    if (!useScrollable && paginacionContainer) {
        paginacionContainer.innerHTML = "";
    }

    // Crear contenedor para la tabla
    const newTableWrapper = document.createElement("div");
    newTableWrapper.className = `tabla-dinamica ${useScrollable ? 'tabla-scrollable' : ''} ${tableType === 'clientes' ? 'tabla-clientes' : ''}`;

    const tabla = document.createElement("table");
    tabla.classList.add("data-table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    // --- Renderizar Encabezados de la Tabla ---
    const headerRow = document.createElement("tr");
    
    if (!editingRowId && checkboxColumn && checkboxColumnPosition === 'start') {
        const th = document.createElement("th");
        th.classList.add("checkbox-cell");
        headerRow.appendChild(th);
    }

    columnas.forEach(col => {
        const th = document.createElement("th");
        th.textContent = col.label;
        headerRow.appendChild(th);
    });

    if (actions.length > 0) {
        const thAcciones = document.createElement("th");
        thAcciones.textContent = "Acciones";
        thAcciones.classList.add("acciones-cell");
        thAcciones.style.textAlign = "center";
        headerRow.appendChild(thAcciones);
    }

    if (!editingRowId && checkboxColumn && checkboxColumnPosition === 'end') {
        const th = document.createElement("th");
        if (datos.length > 0 && datos[0].facturaSubida != null) {
            const facturaButton = document.createElement("button");
            facturaButton.classList.add("btn-action");
            facturaButton.innerHTML = '<i class="bi bi-file-earmark-arrow-up"></i>';
            // Change button for viajesCliente table
            if (tableType === 'viajesCliente') {
                facturaButton.classList.add("btn-generate-invoice");
                facturaButton.title = "Generar Factura";
                facturaButton.addEventListener('click', () => handleGenerateInvoice(datos));
            } else {
                facturaButton.classList.add("btn-upload");
                facturaButton.title = "Subir Factura";
            }
            th.classList.add("checkbox-cell", "factura-cell");
            th.style.textAlign = "center";
            th.appendChild(facturaButton);
        }
        headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    tabla.appendChild(thead);
    tabla.appendChild(tbody);

    // --- Lógica de Paginación o Scroll ---
    const totalPaginas = Math.ceil(datos.length / itemsPorPagina);

    function renderBody(page) {
        tbody.innerHTML = "";
        const currentData = useScrollable ? datos : datos.slice((page - 1) * itemsPorPagina, page * itemsPorPagina);

        if (currentData.length === 0) {
            const noDataRow = document.createElement('tr');
            const noDataCell = document.createElement('td');
            noDataCell.colSpan = columnas.length + (actions.length > 0 ? 1 : 0) + (checkboxColumn && !editingRowId ? 1 : 0);
            noDataCell.textContent = "No se encontraron resultados.";
            noDataCell.style.textAlign = "center";
            noDataCell.style.padding = "20px";
            noDataCell.style.color = "#888";
            noDataRow.appendChild(noDataCell);
            tbody.appendChild(noDataRow);
            return;
        }

        currentData.forEach(item => {
            const tr = document.createElement("tr");
            tr.setAttribute('data-id', item.id);
            tr.id = `row-${item.id}`; // Unique ID for each row
            
            const isEditing = editingRowId === item.id;
            if (isEditing) {
                tr.classList.add('editing-row');
            }

            if (!editingRowId && checkboxColumn && checkboxColumnPosition === 'start') {
                const td = document.createElement("td");
                td.classList.add("checkbox-cell");
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.setAttribute('data-id', item.id);
                checkbox.checked = item.selected || false;
                checkbox.addEventListener('change', (e) => {
                    item.selected = e.target.checked; // Directly update item
                    console.log(`Checkbox ${item.id} changed: ${item.selected}`); // Debug
                    if (onCheckboxChange) {
                        onCheckboxChange(item.id, e.target.checked);
                    }
                });
                td.appendChild(checkbox);
                tr.appendChild(td);
            }

            columnas.forEach(col => {
                const td = document.createElement("td");
                
                if (col.key === 'facturaSubida' && !isEditing) {
                    if (item.facturaSubida) {
                        const downloadBtn = document.createElement("button");
                        downloadBtn.className = "btn-action download-btn";
                        downloadBtn.innerHTML = '<i class="bi bi-download"></i>';
                        downloadBtn.title = "Descargar factura";
                        downloadBtn.addEventListener('click', () => {
                            descargarFactura(item.id);
                        });
                        td.appendChild(downloadBtn);
                    } else {
                        const checkbox = document.createElement("input");
                        checkbox.type = "checkbox";
                        checkbox.setAttribute('data-id', item.id);
                        checkbox.checked = item.selected || false;
                        checkbox.addEventListener('change', (e) => {
                            item.selected = e.target.checked; // Directly update item
                            console.log(`FacturaSubida checkbox ${item.id} changed: ${item.selected}`); // Debug
                            if (onCheckboxChange) {
                                onCheckboxChange(item.id, e.target.checked);
                            }
                        });
                        td.appendChild(checkbox);
                    }
                } else if (isEditing) {
                    const input = createEditableInput(col, item[col.key], item.id);
                    td.appendChild(input);
                } else {
                    td.textContent = item[col.key] !== undefined ? item[col.key] : '';
                    td.title = item[col.key] || '';
                }
                
                if (col.class) {
                    td.classList.add(col.class);
                }
                tr.appendChild(td);
            });

            if (actions.length > 0) {
                const tdAcciones = document.createElement("td");
                tdAcciones.classList.add("acciones-cell");
                
                if (isEditing) {
                    const saveBtn = document.createElement("button");
                    saveBtn.className = "btn-action save-btn";
                    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i>';
                    saveBtn.title = "Guardar cambios";
                    saveBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        saveEditingRow(item.id);
                    });
                    
                    const cancelBtn = document.createElement("button");
                    cancelBtn.className = "btn-action cancel-btn";
                    cancelBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
                    cancelBtn.title = "Cancelar edición";
                    cancelBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        cancelEditingRow(item.id);
                    });
                    tdAcciones.appendChild(saveBtn);
                    tdAcciones.appendChild(cancelBtn);
                } else {
                    const actionContainer = document.createElement("div");
                    actionContainer.classList.add("action-icons");
                    actions.forEach(action => {
                        const button = document.createElement("button");
                        button.className = "btn-action";
                        
                        if (action.icon.includes('pencil')) {
                            button.classList.add('edit-btn');
                        } else if (action.icon.includes('trash')) {
                            button.classList.add('delete-btn');
                        } else if (action.icon.includes('send')) {
                            button.classList.add('navigate-btn');
                        }
                        
                        if (action.class) {
                            action.class.split(' ').forEach(cls => {
                                if (cls) {
                                    button.classList.add(cls);
                                }
                            });
                        }

                        button.innerHTML = `<i class="${action.icon}"></i>`;
                        button.title = action.tooltip || '';
                        button.addEventListener('click', (e) => {
                            e.stopPropagation();
                            action.handler(item, tr);
                        });
                        actionContainer.appendChild(button);
                    });
                    
                    tdAcciones.appendChild(actionContainer);
                }
                
                tr.appendChild(tdAcciones);
            }

            if (!editingRowId && checkboxColumn && checkboxColumnPosition === 'end') {
                const td = document.createElement("td");
                td.classList.add("checkbox-cell");
                if (item.facturaSubida) {
                    const downloadBtn = document.createElement("button");
                    downloadBtn.className = "btn-action navigate-btn";
                    downloadBtn.innerHTML = '<i class="bi bi-download"></i>';
                    downloadBtn.title = "Descargar factura";
                    downloadBtn.addEventListener('click', () => {
                        descargarFactura(item.id);
                    });
                    td.appendChild(downloadBtn);
                } else {
                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.setAttribute('data-id', item.id);
                    checkbox.checked = item.selected || false;
                    checkbox.addEventListener('change', (e) => {
                        item.selected = e.target.checked; // Directly update item
                        console.log(`End checkbox ${item.id} changed: ${item.selected}`); // Debug
                        if (onCheckboxChange) {
                            onCheckboxChange(item.id, e.target.checked);
                        }
                    });
                    td.appendChild(checkbox);
                }
                tr.appendChild(td);
            }

            tbody.appendChild(tr);
        });
    }

    function createEditableInput(column, value, itemId) {
        let input;
        
        if (column.type === 'select' && column.options) {
            input = document.createElement('select');
            input.className = 'editable-input editable-select';
            column.options.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option;
                optionElement.textContent = option;
                if (option === value) {
                    optionElement.selected = true;
                }
                input.appendChild(optionElement);
            });
        } else {
            input = document.createElement('input');
            input.type = getInputType(column.key);
            input.className = 'editable-input';
            input.value = value || '';
            input.placeholder = getPlaceholder(column.key);
            if (column.key === 'tarifa'){
                input.id = 'tarifaEdit';
            }
        }
        
        input.setAttribute('data-field', column.key);
        input.setAttribute('data-item-id', itemId);
        
        input.addEventListener('input', (e) => {
            if (onEdit) {
                onEdit(itemId, column.key, e.target.value);
            }
        });
        
        input.addEventListener('change', (e) => {
            if (onEdit) {
                onEdit(itemId, column.key, e.target.value);
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEditingRow(itemId);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEditingRow(itemId);
            }
        });
        
        return input;
    }

    function getInputType(fieldKey) {
        if (fieldKey.includes('fecha')) return 'date';
        if (['km', 'tarifa', 'variacion', 'toneladas', 'cargado', 'descargado', 'importe'].includes(fieldKey)) return 'number';
        return 'text';
    }

    function getPlaceholder(fieldKey) {
        const placeholders = {
            fecha: 'YYYY-MM-DD',
            comprobante: 'Nº de comprobante',
            campo: 'Nombre del campo',
            km: 'Kilómetros',
            tarifa: 'Tarifa por tonelada',
            variacion: 'Variación (%)',
            toneladas: 'Toneladas',
            cargado: 'Peso cargado',
            descargado: 'Peso descargado'
        };
        return placeholders[fieldKey] || 'Ingrese el valor';
    }

    function saveEditingRow(itemId) {
        const event = new CustomEvent('saveEdit', { detail: { itemId } });
        document.dispatchEvent(event);
    }

    function cancelEditingRow(itemId) {
        const event = new CustomEvent('cancelEdit', { detail: { itemId } });
        document.dispatchEvent(event);
    }

    function renderPaginacion(currentPage) {
        if (useScrollable) return;

        paginacionContainer.innerHTML = "";

        const btnPrev = document.createElement("button");
        btnPrev.textContent = "<";
        btnPrev.classList.add("pagination-button");
        btnPrev.disabled = currentPage === 1;
        btnPrev.onclick = () => cambiarPagina(currentPage - 1);
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
            paginacionContainer.appendChild(botonPagina(1, currentPage));
            if (startPageNum > 2) {
                const ellipsis = document.createElement("span");
                ellipsis.textContent = "...";
                ellipsis.classList.add("pagination-ellipsis");
                paginacionContainer.appendChild(ellipsis);
            }
        }

        for (let i = startPageNum; i <= endPageNum; i++) {
            paginacionContainer.appendChild(botonPagina(i, currentPage));
        }

        if (endPageNum < totalPaginas) {
            if (endPageNum < totalPaginas - 1) {
                const ellipsis = document.createElement("span");
                ellipsis.textContent = "...";
                ellipsis.classList.add("pagination-ellipsis");
                paginacionContainer.appendChild(ellipsis);
            }
            paginacionContainer.appendChild(botonPagina(totalPaginas, currentPage));
        }

        const btnNext = document.createElement("button");
        btnNext.textContent = ">";
        btnNext.classList.add("pagination-button");
        btnNext.disabled = currentPage === totalPaginas;
        btnNext.onclick = () => cambiarPagina(currentPage + 1);
        paginacionContainer.appendChild(btnNext);
    }

    function botonPagina(n, currentPage) {
        const btn = document.createElement("button");
        btn.textContent = n;
        btn.classList.add("pagination-button");
        if (n === currentPage) {
            btn.classList.add("active");
        }
        btn.onclick = () => cambiarPagina(n);
        return btn;
    }

    function cambiarPagina(nuevaPagina) {
        nuevaPagina = Math.max(1, Math.min(nuevaPagina, totalPaginas));

        if (nuevaPagina === parseInt(container.dataset.currentPage)) {
            return;
        }

        container.dataset.currentPage = nuevaPagina;
        renderBody(nuevaPagina);
        renderPaginacion(nuevaPagina);
        if (onPageChange) {
            onPageChange(nuevaPagina);
        }
    }

    // Handler for Generate Invoice button
    function handleGenerateInvoice(data) {
        const selectedRows = data.filter(item => item.selected);
        console.log('Selected rows:', JSON.stringify(selectedRows, null, 2));
        if (selectedRows.length === 0) {
            showConfirmModal('Por favor, seleccione al menos un viaje para generar la factura.');
            return;
        }

        // Get client CUIT from localStorage
        const selectedClientCUIT = localStorage.getItem('selectedClientCUIT');
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

        fetch('http://localhost:3000/api/facturas/generar-factura', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(invoiceData)
        })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.error || 'Error al generar factura');
                    });
                }
                return response.json(); // Expect JSON response
            })
            .then(data => {
                console.log('Invoice generation response:', data);
                showConfirmModal(`Factura generada y guardada en el servidor: ${data.pdfPath}`);
            })
            .catch(error => {
                console.error('Error:', error.message);
                showConfirmModal('Error al generar la factura: ' + error.message);
            });
    }

    // Date formatting helper
    function formatDate(date, separator = '') {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return separator ? `${day}${separator}${month}${separator}${year}` : `${year}${month}${day}`;
    }

    // Inicializa el cuerpo y la paginación con la página actual
    renderBody(currentPage);
    if (!useScrollable) {
        renderPaginacion(currentPage);
    }

    newTableWrapper.appendChild(tabla);
    container.appendChild(newTableWrapper);

    if (useScrollable && editingRowId && newTableWrapper) {
        const editedRow = document.getElementById(`row-${editingRowId}`);
        if (editedRow) {
            const rowOffset = editedRow.offsetTop;
            const containerHeight = newTableWrapper.clientHeight;
            const scrollOffset = rowOffset - (containerHeight / 2);
            newTableWrapper.scrollTop = scrollOffset > 0 ? scrollOffset : 0;
        } else {
            newTableWrapper.scrollTop = scrollPosition;
        }
    }
}

// SweetAlert modal for notifications (requires <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>)
// Fallback to alert if SweetAlert is not loaded
function showConfirmModal(message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: 'Notificación',
            text: message,
            icon: message.includes('Error') ? 'error' : 'success',
            confirmButtonText: 'OK'
        });
    } else {
        alert(message);
    }
}