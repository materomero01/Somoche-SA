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
    checkboxHeaderAction = null,
    onCheckboxChange = null,
    uploadFactura = null,
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
    delete container.dataset.currentPage;
    if (!useScrollable && paginacionContainer) {
        paginacionContainer.innerHTML = "";
    }

    // Crear contenedor para la tabla
    const newTableWrapper = document.createElement("div");
    newTableWrapper.className = `tabla-dinamica ${useScrollable ? 'tabla-scrollable' : ''} ${tableType === 'clientes' ? 'tabla-clientes' : ''}`;
    if (useScrollable){
        if (itemsPorPagina && !isNaN(itemsPorPagina) && itemsPorPagina > 3){
            newTableWrapper.classList.add('expand-table-scroll');
            newTableWrapper.classList.remove('reduce-table-scroll');
        } else {
            newTableWrapper.classList.remove('expand-table-scroll');
            newTableWrapper.classList.add('reduce-table-scroll');
        }
    }

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
        if (checkboxHeaderAction){
            const actionContainer = document.createElement("div");
            actionContainer.classList.add("action-icons");
            const button = document.createElement("button");
            button.classList.add("btn-action");
            checkboxHeaderAction.classList.forEach( className => {
                button.classList.add(className);
            })
            button.innerHTML = `<i class="${checkboxHeaderAction.icon}"></i>`;
            if (checkboxHeaderAction.id) button.id = checkboxHeaderAction.id;
            button.title = checkboxHeaderAction.tooltip || '';
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const selectedRows = datos.filter(v => v.selected);
                checkboxHeaderAction.handler(selectedRows);
            });
            actionContainer.appendChild(button);
            th.appendChild(actionContainer);
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
                    //console.log(`Checkbox ${item.id} changed: ${item.selected}`); // Debug
                    if (onCheckboxChange) {
                        onCheckboxChange(item.id, e.target.checked);
                    }
                });
                td.appendChild(checkbox);
                tr.appendChild(td);
            }

            columnas.forEach(col => {
                const td = document.createElement("td");
        
                if (isEditing) {
                    const input = createEditableInput(col, item[col.key], item.id);
                    td.appendChild(input);
                } else {
                    td.textContent = item[col.key] !== undefined ? item[col.key] : '';
                    td.title = item[col.key] || '';
                }
                
                try{
                    col.class.forEach( className => {
                        td.classList.add(className);
                    })
                } catch (error){
                    console.log(error.message);
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

                        action.classList.forEach( className => {
                            button.classList.add(className);
                        })

                        if (action.id) button.id = action.id;

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
                if (uploadFactura && item.hasOwnProperty("factura_id") && item.factura_id ) {
                    const checkFactura = document.createElement("div");
                    checkFactura.innerHTML = '<i class="bi bi-check-lg"></i>';
                    checkFactura.title = "Factura cargada";
                    td.appendChild(checkFactura);
                } else {
                    const checkbox = document.createElement("input");
                    checkbox.type = "checkbox";
                    checkbox.setAttribute('data-id', item.id);
                    checkbox.checked = item.selected || false;
                    checkbox.addEventListener('change', (e) => {
                        item.selected = e.target.checked; // Directly update item
                        //console.log(`End checkbox ${item.id} changed: ${item.selected}`); // Debug
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
                optionElement.value = option.value;
                optionElement.textContent = option.text;
                if (option.value === value) {
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
        btn.id = `pagination-button-${n}`;
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

    // Inicializa el cuerpo y la paginación con la página actual
    let paginaEditando = 0;
    if (editingRowId){
        let viajeEditando = datos.findIndex(viaje => viaje.id === editingRowId);
        while (viajeEditando >= 0){
            paginaEditando = paginaEditando + 1;
            viajeEditando = viajeEditando - itemsPorPagina;
        }
        if (paginaEditando !== currentPage) currentPage = paginaEditando;
    }

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