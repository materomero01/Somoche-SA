import { renderTables, enterEditMode, handleEdit, editingRowId, originalEditingData, stagedEditingData, resetEditingState, currentEditingTableType } from './tabla.js';
import { getViajes, getPagosCuil, showConfirmModal, toggleSpinnerVisible, changeSpinnerText, createLoadingSpinner } from './apiPublic.js';
import { addViaje, addPagos, updateViaje, addResumen, uploadCartaPorte, deleteDocument, setupAutocomplete, setupClienteAutocomplete, deletePago, deleteViaje, socket, tarifasCatac} from './api.js';
import { mockClientes, mockProveedores } from './choferes-clientes.js';
import { setHistorial, parsePagos, parseViaje, parseImporte, columnasViajes, columnasPagos, actualizarValores} from './resumenes.js';
import { viaje, initializeFacturaUpload, updateViajeStatus, closeModalFactura } from './subir-factura.js';



// Datos del chofer
export let choferData = {};

let viajesData = [];

let pagosData = [];

let mainContent;

// Regex for input validation
const regexInputs = {
    'comprobante': /^(\d{4}-\d{8}|\d{11})$/
};

// Acciones para la tabla de viajes
const accionesViajes = [
    {
        icon: "bi bi-pencil",
        tooltip: "Editar viaje",
        classList: ['edit-btn'],
        id: null,
        handler: (item) => {
            enterEditMode({ ...item, choferCuil: choferData.cuil }, 'viajes', () => renderTables(viajesData, 1, optionsViajes, actualizarTotales), handleSaveEditViajes);
        }
    },
    {
        icon: "bi bi-download",
        tooltip:"Descargar archivos",
        classList: ['navigate-btn'],
        id: null,
        handler: (item) => {
            viaje.push(item); // Establece el viaje actual
            initializeFacturaUpload(
                changeDataFactura,
                (cartaPorteFiles) => cartaPorteFunc(cartaPorteFiles, changeDataDocuments),
                (facturaId) => deleteFactura(facturaId, changeDataDocuments),
                "viajes"
            );
        }
    },
    {
        icon: "bi bi-trash",
        tooltip: "Eliminar viaje",
        classList: ['delete-btn'],
        id: null,
        handler: (item, tr) => {
            showConfirmModal("¿Estás seguro de eliminar este viaje?", "delete", async () => {
                const result = await deleteViaje(item.id);
                const data = await result.json();
                if (result.ok) {
                    viajesData = viajesData.filter(v => v.id !== item.id);
                    await renderTables(viajesData, 1, optionsViajes, actualizarTotales);
                    showConfirmModal(data.message);
                } else {
                    showConfirmModal(`Error: ${data.message}`);
                }})
        }
    }
];

// Acciones para la tabla de pagos
const accionesPagos = [
    {
        icon: "bi bi-trash",
        tooltip: "Eliminar pago",
        classList: ['delete-btn'],
        id: null,
        handler: (item, tr) => {
            showConfirmModal("¿Estás seguro de eliminar este pago?", "delete" , async () => {
                const response = await deletePago(item.id, item.tipo);
                const data = await response.json();
                if(!response.ok){
                    showConfirmModal(data.message);
                    return;
                }

                pagosData = pagosData.filter(p => p.tipo !== item.tipo || p.id !== item.id);
                showConfirmModal(data.message);
                renderTables(pagosData, 1, optionsPagos, actualizarTotales);
            });
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

        initializeFacturaUpload(changeDataFactura, null, null, "viajes", selectedRows.map( r =>  r.comprobante));
    }
}

const optionsViajes = {
    containerId: 'viajes-table',
    paginacionContainerId: '',
    columnas: [ columnasViajes.filter(col => !["cargado", "descargado"].includes(col.key)), 
                columnasViajes.filter(col => !["faltante", "importe", "comision", "iva", "saldo"].includes(col.key))],
    itemsPorPagina: () => 10,
    actions: accionesViajes,
    onEdit: (id, field, value) => handleEdit(id, field, value, 'viajes', () => {return tarifasCatac}),
    tableType: 'viajes',
    onPageChange: null,
    checkboxColumn: true,
    checkboxColumnPosition: 'end',
    checkboxHeaderAction: checkboxHeaderActionUpload,
    onCheckboxChange: null,
    uploadFactura: true,
    useScrollable: true
}

const optionsPagos = {
    containerId: 'pagos-table',
    paginacionContainerId: '',
    columnas: [ columnasPagos ],
    itemsPorPagina: () => 3,
    actions: accionesPagos,
    onEdit: null,
    tableType: 'pagos',
    onPageChange: null,
    checkboxColumn: null,
    checkboxColumnPosition: null,
    checkboxHeaderAction: null,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: true
}

// Set today's date in date inputs
const setTodayDate = () => {
    const today = new Date().toLocaleDateString('es-AR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).split('/').reverse().join('-');

    ['nuevoFecha', 'fechaPago'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = today;
    });

    const chequeDate = new Date();
    const fechaCheque = document.getElementById('fechaCheque');
    if (fechaCheque) {
        chequeDate.setDate(chequeDate.getDate() + 40);
        fechaCheque.value = chequeDate.toLocaleDateString('es-AR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).split('/').reverse().join('-');
    }
};

function changeDataFactura(facturaId, selectedRows){
    if (!facturaId) {
        console.warn('No se recibió el facturaId en los encabezados');
    } else {
        viajesData.forEach(v =>{
            if (selectedRows.includes(v.id))
                v.factura_id = facturaId;
        });

        renderTables(viajesData, 1, optionsViajes);
    }
}

function changeDataDocuments(){
    if (viajesData.length > 0){
        viajesData.forEach(v => {
            if (v.comprobante === viaje[0].comprobante){
                v.carta_porte = viaje[0].carta_porte;
                v.factura_id = viaje[0].factura_id? viaje[0].factura_id : null;
            }
        })
        renderTables(viajesData, 1, optionsViajes);
    }
    
}

export async function cartaPorteFunc(cartaPorteFiles , changeDataDocuments) {
    
    const cartaPorteResponse = await uploadCartaPorte(viaje[0].comprobante, cartaPorteFiles);
    if (!cartaPorteResponse.ok) {
        showConfirmModal("Ocurrió un error al subir el archivo de la carta de porte");
        return;
    }

    viaje[0].carta_porte = true;
    await changeDataDocuments?.();
}

export async function deleteFactura(facturaId = null, changeDataDocuments, tableType = "viajes") {
    const response = await deleteDocument(facturaId, viaje[0].comprobante, tableType);
    if (!response.ok) {
        showConfirmModal(`Ocurrió un error al eliminar la ${facturaId ? "factura" : "carta de porte"}`);
        return;
    }
    viaje[0][facturaId ? "factura_id" : "carta_porte"] = facturaId ? null : false;

    await changeDataDocuments?.();
    showConfirmModal(`${facturaId ? "Factura" : "Carta de porte"} eliminada con éxito`);
}

// Función para actualizar los totales
function actualizarTotales() {
    const subtotal = viajesData.reduce((sum, viaje) => sum + (viaje.saldo || 0), 0);
    const iva = choferData.trabajador === "Responsable Inscripto"? viajesData.reduce((sum, viaje) => sum + (viaje.iva || 0), 0) : 0;
    const totalViajes = subtotal + iva;
    let totalPagos;
    let totalAPagar;
    if (pagosData){
        totalPagos = pagosData?.reduce((sum, pago) => sum + (pago.importe || 0), 0);
        totalAPagar = totalViajes - totalPagos;
        if (Math.abs(totalAPagar) < 0.01) totalAPagar = 0;
    }

    const subtotalContainer = document.getElementById("subtotal");
    if (subtotalContainer)
        subtotalContainer.textContent = `Subtotal: $${subtotal.toFixed(2)}`;
    const ivaContainer = document.getElementById("iva");
    if (ivaContainer)
        ivaContainer.textContent = `IVA (21%): $${iva.toFixed(2)}`;
    const totalViajesContainer = document.getElementById("total-viajes");
    if (totalViajesContainer)
        totalViajesContainer.textContent = `Total Viajes: $${totalViajes.toFixed(2)}`;
    const porcentajeChofer = document.getElementById("porcentaje-chofer");
    if (porcentajeChofer && choferData.trabajador === "Chofer"){
        porcentajeChofer.classList.remove("hidden");
        porcentajeChofer.textContent = `Porcentaje Chofer: $${(totalViajes * 0.2).toFixed(2)}`;
    }

    const totalPagarContainer = document.getElementById("total-pagar");
    if (totalPagarContainer)
        totalPagarContainer.textContent = `Total a Pagar: ${("$" + totalAPagar.toFixed(2)).replace("$-", "-$")}`;
}

export const validateInputs = (payload, fields) => {
    for (const [key, label] of Object.entries(fields)) {
        if (!payload[key] || (typeof payload[key] === 'string' && !payload[key].trim())) {
            showConfirmModal(`El valor para ${label} no ha sido ingresado.`);
            return false;
        }
    }
    return true;
};

export async function handleSaveEditViajes() {
    const comprobanteOriginal = originalEditingData.comprobante;
    const payload = {
        [comprobanteOriginal]: {
            fecha: stagedEditingData.fecha || null,
            comprobante: stagedEditingData.comprobante || null,
            campo: stagedEditingData.campo || null,
            producto: stagedEditingData.producto || null,
            kilometros: parseInt(stagedEditingData.km) || null,
            tarifa: parseImporte(stagedEditingData.tarifa) || null,
            variacion: parseFloat(stagedEditingData.variacion) > 1? parseFloat(stagedEditingData.variacion) /100 : parseFloat(stagedEditingData.variacion) || 0.1,
            toneladas: parseFloat(stagedEditingData.toneladas) || null,
            cargado: parseFloat(stagedEditingData.cargado) || null,
            descargado: parseFloat(stagedEditingData.descargado) || null,
            tabla: "viaje"
        }
    };

    if (!validateInputs(payload[comprobanteOriginal], {
        comprobante: 'Comprobante',
        campo: 'Campo',
        kilometros: 'Kilómetro',
        tarifa: 'Tarifa',
        toneladas: 'Toneladas',
    })) return;

    if (!regexInputs.comprobante.test(payload[comprobanteOriginal].comprobante)) {
        showConfirmModal('El comprobante debe tener el formato "XXXX-XXXXXXXX" o ser un número de 11 dígitos.');
        return;
    }

    const numericFields = {
        kilometros: 'Kilómetro',
        tarifa: 'Tarifa',
        toneladas: 'Toneladas',
        cargado: 'Cargado',
        descargado: 'Descargado'
    };
    for (const [key, label] of Object.entries(numericFields)) {
        if (isNaN(payload[comprobanteOriginal][key]) || payload[comprobanteOriginal][key] <= 0) {
            showConfirmModal(`${label} debe ser un número mayor a 0.`, 'error');
            return;
        }
    }
    console.log(payload[comprobanteOriginal].toneladas);
    if (payload[comprobanteOriginal].toneladas >= 100.0 || payload[comprobanteOriginal].cargado >= 100.0 || payload[comprobanteOriginal].descargado >= 100.0){
        showConfirmModal("Las toneladas no pueden ser mayor a 100");
        return;
    }

    const response = await updateViaje(payload);
    if (response) {
        showConfirmModal('Los cambios se realizaron con exito.');
        const viajeIndex = viajesData.findIndex(v => v.comprobante === comprobanteOriginal);
        if (viajeIndex !== -1)
            viajesData[viajeIndex] = parseViaje({...payload[comprobanteOriginal], factura_id: stagedEditingData.factura_id});
    } else {
        showConfirmModal('Error al guardar los cambios del viaje.');
    }
}

// Setup add viaje button
async function setupAddViajeBtn() {
    const form = document.getElementById('form-viaje');
    const btn = document.getElementById('addViajeBtn');
    setupClienteAutocomplete('nuevoCliente', mockClientes);
    btn?.addEventListener('click', async () => {
        const clienteInput = document.getElementById('nuevoCliente');
        const fechaInput = document.getElementById('nuevoFecha');
        
        const formData = Object.fromEntries(new FormData(form).entries());
        const fechaISO = fechaInput?.value ? `${fechaInput.value}T00:00:00-03:00` : new Date().toISOString().split('T')[0] + 'T00:00:00-03:00';
        const viaje = {
            fecha: fechaISO,
            comprobante: formData.comprobante?.trim(),
            campo: formData.campo?.trim(),
            producto: formData.producto?.trim(),
            kilometros: parseFloat(formData.kilometro),
            tarifa: formData.tarifa,
            variacion: parseFloat(formData.variacion) > 1 ? parseFloat(formData.variacion) / 100 : parseFloat(formData.variacion),
            toneladas: parseFloat(formData.toneladas),
            cargado: parseFloat(formData.cargado) || parseFloat(formData.toneladas),
            descargado: parseFloat(formData.descargado) || parseFloat(formData.toneladas),
            pagado: false
        };
        const payload = {
            chofer_cuil: choferData?.cuil,
            nombre: choferData?.nombre,
            cliente_cuit: clienteInput?.dataset.selectedClienteCuit,
            ...viaje
        };

        if (!payload.cliente_cuit) {
            showConfirmModal('Por favor, selecciona un cliente de la lista de sugerencias.');
            return;
        }

        if (!validateInputs(payload, {
            comprobante: 'Comprobante',
            campo: 'Campo',
            kilometros: 'Kilómetro',
            tarifa: 'Tarifa',
            toneladas: 'Toneladas',
            cargado: 'Cargado',
            descargado: 'Descargado'
        })) return;

        if (!regexInputs.comprobante.test(payload.comprobante)) {
            showConfirmModal('El comprobante debe tener el formato "XXXX-XXXXXXXX" o ser un número de 11 dígitos.');
            return;
        }

        const numericFields = {
            kilometros: 'Kilómetro',
            tarifa: 'Tarifa',
            toneladas: 'Toneladas',
            cargado: 'Cargado',
            descargado: 'Descargado'
        };
        for (const [key, label] of Object.entries(numericFields)) {
            if ((isNaN(payload[key]) && key !== 'tarifa') || parseImporte(payload[key]) <= 0) {
                showConfirmModal(`${label} debe ser un número mayor a 0.`, 'error');
                return;
            }
        }

        if (payload.toneladas >= 100.0 || payload.cargado >= 100.0 || payload.descargado >= 100.0){
            showConfirmModal("Las toneladas no pueden ser mayor a 100");
            return;
        }

        try {
            const response = await addViaje(payload);
            const data = await response.json();
            if (response.ok) {
                viajesData.push(parseViaje({...viaje, cuil: choferData.cuil}));
                form.reset();
                setTodayDate();
                renderTables(viajesData, 1, optionsViajes, actualizarTotales);
            }
            showConfirmModal(data.message);
        } catch (error) {
            console.error('Error en addViaje:', error.message);
        }
    });

    setupTarifaAutocomplete();
    setupCargaDescargaAutocomplete();
}

// Setup add pago button
const setupAddPagoBtn = () => {
    const btn = document.getElementById('addPagoBtn');
    const cuitCliente = document.getElementById('cuitCheque');
    const cuitProveedor = document.getElementById('cuitProveedorGasoil');
    setupClienteAutocomplete('cuitCheque', mockClientes);
    setupClienteAutocomplete('cuitProveedorGasoil', mockProveedores);
    btn?.addEventListener('click', async () => {
        const tipoPago = document.getElementById('tipoPago')?.value;
        const fechaPagoInput = document.getElementById('fechaPago')?.value;

        const nroCheque = document.getElementById('nroCheque');
        const tercero = document.getElementById('terceroCheque');
        const destinatario = document.getElementById('destinatarioCheque');
        const importeCheque = document.getElementById('importeCheque');

        const comprobanteGasoil = document.getElementById('comprobanteGasoil');
        const precioGasoil = document.getElementById('precioGasoil');
        const litros = document.getElementById('litrosGasoil');
        const importeGasoil = document.getElementById('importeGasoil');

        const comprobanteOtro = document.getElementById('comprobanteOtro');
        const detalle = document.getElementById('detalleOtro');
        const importeOtro =  document.getElementById('importeOtro');

        let fechaPago;
        try {
            fechaPago = fechaPagoInput ? new Date(`${fechaPagoInput}T00:00:00-03:00`).toISOString() : new Date().toISOString();
        } catch (error) {
            showConfirmModal('La fecha de pago ingresada no es válida');
            return;
        }

        let payload = {
            chofer_cuil: choferData?.cuil,
        };

        switch (tipoPago) {
            case 'cheque':
                const fechaChequeInput = document.getElementById('fechaCheque')?.value;
                let fechaCheque;
                try {
                    fechaCheque = fechaChequeInput ? new Date(`${fechaChequeInput}T00:00:00-03:00`).toISOString() : new Date().toISOString();
                } catch (error) {
                    showConfirmModal('La fecha del cheque ingresada no es válida');
                    return;
                }
                payload = {
                    ...payload,
                    pagos: {
                        tipo: 'Cheque',
                        fecha_pago: fechaPago,
                        fecha_cheque: fechaCheque,
                        nroCheque: nroCheque?.value,
                        tercero: tercero?.value,
                        destinatario: destinatario?.value,
                        importe: importeCheque?.value,
                        cliente_cuit: cuitCliente?.dataset.selectedClienteCuit
                    }
                };

                if (isNaN(payload.pagos.importe) || payload.pagos.importe <= 0) {
                    showConfirmModal(`El importe ingresado no es válido`);
                    return;
                }
                break;
            case 'gasoil':
                payload = {
                    ...payload,
                    pagos: {
                        tipo: 'Gasoil',
                        proveedor_cuit: cuitProveedor?.dataset.selectedClienteCuit,
                        fecha_pago: fechaPago,
                        comprobante: comprobanteGasoil?.value,
                        precioGasoil: precioGasoil?.value,
                        litros: litros?.value,
                        importe: importeGasoil?.value
                    }
                };

                if (!cuitProveedor?.dataset.selectedClienteCuit) {
                    showConfirmModal('Por favor, selecciona un proveedor de la lista de sugerencias.');
                    return;
                }

                if (!payload.pagos.comprobante){
                    showConfirmModal('Ingrese el comprobante para el pago del gasoil');
                    return;
                }
                ['precioGasoil', 'litros', 'importe'].forEach(id => {
                    if (isNaN(payload.pagos[id]) || payload.pagos[id] <= 0) {
                        showConfirmModal(`El valor ingresado para ${id} no es válido`);
                        return;
                    }
                });
                break;
            case 'otro':
                payload = {
                    ...payload,
                    pagos: {
                        tipo: 'Otro',
                        fecha_pago: fechaPago,
                        comprobante: comprobanteOtro?.value,
                        detalle: detalle?.value,
                        importe: importeOtro?.value,
                    }
                };

                if (!payload.pagos.comprobante){
                    showConfirmModal('Ingrese el comprobante para el pago');
                    return;
                }
                
                if (isNaN(payload.pagos.importe)) {
                    showConfirmModal(`El valor ingresado para el importe no es válido`);
                    return;
                }
                break;
            default:
                console.warn('Tipo de pago no reconocido:', tipoPago);
                return;
        }

        try {
            const response = await addPagos(payload);
            if (response.ok){
                const data = await response.json();
                showConfirmModal(data.message);
                if (new Date(payload.pagos.fecha_pago) < new Date())
                    pagosData.push(parsePagos({id: data.pagoId.id, ...payload.pagos}));
                //reset de los fields aca
                renderTables(pagosData, 1, optionsPagos, actualizarTotales);

                if (tipoPago === 'gasoil'){
                    
                }

                [comprobanteGasoil, litros, precioGasoil, comprobanteOtro, detalle, importeOtro, nroCheque, tercero, destinatario, importeCheque, cuitCliente].forEach( input => {
                    input.value = '';
                    input.removeAttribute('data-selected-cliente-nombre');
                    input.removeAttribute('data-selected-cliente-cuit');
                });

                importeGasoil.value = '0.00';

            } else {
                const data = await response.json();
                showConfirmModal(data.message);
            }
        } catch (error) {
            console.error('Error en addPagos:', error.message);
        }
    });
};

// Setup payment type selector
export const setupPaymentTypeSelector = (fields) => {
    const tipoPagoSelect = document.getElementById('tipoPago');

    const showPaymentFields = type => {
        Object.values(fields).forEach(field => field?.classList.add('hidden'));
        fields[type]?.classList.remove('hidden');
        setTodayDate();
        switch (type){
            case 'cheque':
                document.getElementById('cuitCliente')?.classList.remove("hidden");
                document.getElementById('cuitProveedor')?.classList.add("hidden");
                document.getElementById('tipoAsignar')?.classList.remove("hidden");
                break;
            case 'gasoil':
                document.getElementById('cuitCliente')?.classList.add("hidden");
                document.getElementById('cuitProveedor')?.classList.remove("hidden");
                calculateGasoilImporte();
                break;
            default:
                document.getElementById('cuitCliente')?.classList.add("hidden");
                document.getElementById('cuitProveedor')?.classList.add("hidden");
                document.getElementById('tipoAsignar')?.classList.add("hidden");
                break;
        }
    };

    if (tipoPagoSelect) {
        tipoPagoSelect.addEventListener('change', e => showPaymentFields(e.target.value));
        showPaymentFields(tipoPagoSelect.value);
    }

    const precioGasoil = document.getElementById('precioGasoil');
    const litrosGasoil = document.getElementById('litrosGasoil');
    const importeGasoil = document.getElementById('importeGasoil');

    const calculateGasoilImporte = () => {
        const precio = parseFloat(precioGasoil?.value) || 0;
        const litros = parseFloat(litrosGasoil?.value) || 0;
        if (importeGasoil) importeGasoil.value = (precio * litros).toFixed(2);
    };

    precioGasoil?.addEventListener('input', calculateGasoilImporte);
    litrosGasoil?.addEventListener('input', calculateGasoilImporte);
};

async function cargarTablas() {
    if (choferData.cuil) {
        try {
            const response = await getViajes(choferData.cuil);
            const data = await response.json();
            if (!response.ok) {
                showConfirmModal(data.message);
                deleteModal("viajesPagosModal", "contentModalViajes", () => {
                    choferData = null;
                    pagosData = [];
                    viajesData = [];}
                );
            }
            viajesData = data.viajes.map(c => {
                return parseViaje(c);
            });
            if (choferData.trabajador !== "Responsable Inscripto") {
                document.getElementById("iva").classList.add("hidden");
                document.getElementById("subtotal").classList.add("hidden");
            }

            const responsePagos = await getPagosCuil(choferData.cuil);
            const dataPagos = await responsePagos.json();
            if (!responsePagos.ok) {
                showConfirmModal(dataPagos.message);
                deleteModal("viajesPagosModal", "contentModalViajes", () => {
                    choferData = null;
                    pagosData = [];
                    viajesData = [];}
                );
            }
            pagosData = dataPagos.map(p => {
                return parsePagos(p);
            });
            renderTables(pagosData, 1, optionsPagos)
        } catch (error) {
            console.log(error.message);
        }
    }
    renderTables(viajesData, 1, optionsViajes, actualizarTotales);
}

// Setup tarifa autocomplete
const setupTarifaAutocomplete = () => {
    const tarifaAutodescargableBase = 0;

    setupAutocomplete({
        inputId: 'tarifa',
        dependentInputId: 'nuevoKm',
        filterSuggestions: () => {
            const currentKm = parseInt(document.getElementById('nuevoKm')?.value.trim(), 10);
            const tarifaCatacCalculada = (!isNaN(currentKm) && currentKm > 0 && currentKm <= tarifasCatac.length && tarifasCatac[currentKm - 1]?.valor !== undefined)
                ? tarifasCatac[currentKm - 1].valor
                : tarifasCatac[tarifasCatac.length - 1].valor;

            return [
                { type: 'Tarifa CATAC', value: tarifaCatacCalculada },
                { type: 'Tarifa Autodescargable', value: tarifaAutodescargableBase }
            ];
        },
        renderSuggestion: suggestion => `${suggestion.type}: ${suggestion.value}`,
        onSelect: (input, suggestion) => input.value = suggestion.value,
        onDependentChange: (dependentInput, input, suggestionsDiv) => {
            const queryKm = parseInt(dependentInput.value.trim(), 10);
            if (isNaN(queryKm) || queryKm <= 0 || queryKm > tarifasCatac.length) {
                input.value = '';
                suggestionsDiv.style.display = 'none';
                return;
            }

            const tarifa = tarifasCatac[queryKm - 1];
            input.value = tarifa?.valor ?? '';
            suggestionsDiv.style.display = 'none';
            if (!tarifa?.valor) console.warn(`No se encontró tarifa para ${queryKm} km.`);
        }
    });
};

// Setup carga/descarga autocomplete
const setupCargaDescargaAutocomplete = () => {
    const [toneladas, cargado, descargado] = ['nuevoToneladas', 'nuevoCargado', 'nuevoDescargado'].map(id => document.getElementById(id));
    if (!toneladas || !cargado || !descargado) {
        console.error("Inputs de toneladas, cargado o descargado no encontrados.");
        return;
    }

    toneladas.addEventListener('change', () => {
        const value = parseFloat(toneladas.value.trim());
        if (!isNaN(value) && value >= 0) {
            cargado.value = value;
            descargado.value = value;
        } else {
            cargado.value = '';
            descargado.value = '';
        }
    });
};

async function cerrarCuenta() {
    const totalPagarContainer = document.getElementById("total-pagar");
    const comprobantes = viajesData.map(viaje => viaje.comprobante);
    const pagos = pagosData.map(pagos => {
        return {
            tipo: pagos.tipo,
            id: pagos.id || pagos.idAlternativo
        };
    });
    let saldoRestante = "";
    let importeRestante = 0;
    if (totalPagarContainer) {
        importeRestante = parseImporte(totalPagarContainer.textContent.split(': ')[1]);
        if (importeRestante !== 0)
            saldoRestante = `<br>El saldo restante de ${totalPagarContainer.textContent.split(': ')[1]} se agregará al siguiente resumen`;
    }

    const confirmar = async () => {
        const groupStamp = new Date();
        let payloadViajes = {};
        comprobantes.forEach(v => {
            payloadViajes = {
                ...payloadViajes,
                [v]: {
                    group: groupStamp,
                }
            };
        });

        let payloadPagos = {};
        pagos.forEach(p => {
            const idCompuesto = p.id + "°" + p.tipo;
            payloadPagos = {
                ...payloadPagos,
                [idCompuesto]: {
                    tipo: p.tipo,
                    group: groupStamp
                }
            };
        });
        let payloadRestante = null;
        if (importeRestante !== 0) {
            payloadRestante = {
                tipo: "Otro",
                detalle: importeRestante > 0 ? "Saldo a favor del resumen anterior" : "Saldo adeudado del resumen anterior",
                importe: -importeRestante
            };
        }

        changeSpinnerText(mainContent, "Generando resumen...");
        toggleSpinnerVisible(mainContent);

        try {
            const response = await addResumen(choferData.cuil, groupStamp, choferData.trabajador, payloadViajes, payloadPagos, payloadRestante);
            if (!response.ok) {
                showConfirmModal("No se pudo cerrar el resumen del chofer");
                toggleSpinnerVisible(mainContent);
                changeSpinnerText(mainContent);
                return;
            }
            const dataId = await response.json();
            console.log(dataId);
            pagosData = [];
            viajesData = [];
            if (dataId.idPagoAdicional)
                pagosData = [{id: dataId.idPagoAdicional.id, fecha_pago: groupStamp, ...payloadRestante}].map( p => {
                    return parsePagos(p);
                })
            showConfirmModal("Resumen cerrado con exito!");
           renderTables(pagosData, 1, optionsPagos);
           renderTables(viajesData, 1, optionsViajes, actualizarTotales);
        } catch (error) {
            console.log(error.message);
        }
        toggleSpinnerVisible(mainContent);
        changeSpinnerText(mainContent);
    };
    if (comprobantes && comprobantes.length > 0)
        showConfirmModal(`¿Estás seguro de cerrar el resumen del chofer?${saldoRestante}`, "confirm", confirmar);
    else
        showConfirmModal("No hay viajes disponibles para realizar un resumen");
}


// Cargar el nombre del chofer
export function cargarNombreChofer(nombre) {
    const personInfo = document.querySelector(".person-info span");
    if (personInfo) {
        personInfo.textContent = nombre;
    }
}

export function deleteModal(modalId, modalContentId, clearFunc = () => {}) {
    const modal = document.getElementById(modalId);
    if (editingRowId){
        showConfirmModal("Guarda o cancela los cambios realizados antes de salir");
        return;
    }

    if (modal) {
        modal.classList.toggle("active");
        document.body.classList.remove("no-scroll");
        const modalContent = document.getElementById(modalContentId);
        clearFunc();
        if (modalContent) modalContent.remove();
        window.onclick = null;
    }
}

// Inicializar
export async function inicializarModal(data) {
    document.body.classList.add("no-scroll");
    choferData = data;

    cargarNombreChofer(choferData.nombre);

    const closeButton = document.getElementById('closeBtnViaje');
    if (closeButton) {
        closeButton.onclick = () => {

            deleteModal("viajesPagosModal", "contentModalViajes", () => {
                choferData = null;
                pagosData = [];
                viajesData = [];

                socket.off('nuevoViaje');
                socket.off('nuevoPago');
                socket.off('nuevoFactura');
                socket.off('nuevoCartaPorte');
                socket.off('updateViaje');
                socket.off('updateUsuario', manejarUpdateUsuario);
                socket.off('deleteViaje');
                socket.off('deletePago');
                socket.off('deleteFactura');
                socket.off('deleteUsuario', manejarDeleteUsuario);
                socket.off('cerrarResumen');
            }
            );
        };
    }
    mainContent = document.getElementById("content-viajes");
    await createLoadingSpinner(mainContent);

    const fields = {
        cheque: document.getElementById('chequeFields'),
        gasoil: document.getElementById('gasoilFields'),
        otro: document.getElementById('otroFields')
    };

    const clienteAddPago = document.getElementById('chofer-pagos-wrapper');
    const tablaPagos = document.getElementById('pagos-table');
    const togglePagosArea = document.getElementById('togglePagosArea');
    
    // Toggle pagos area
    togglePagosArea?.addEventListener('click', () => {
        togglePagosArea.classList.toggle('active');
        tablaPagos.classList.toggle('hidden');
        clienteAddPago.classList.toggle('hidden');
    });

    async function manejarUpdateUsuario(user){
        if (user.updatedData.cuil === choferData.cuil && user.updatedData.cuil !== user.cuilOriginal){
            viajesData.forEach( viaje => viaje.cuil = choferData.cuil);
            if (viaje.length > 0){
                viaje[0].cuil = choferData.cuil;
            }
            await renderTables(pagosData, 1, optionsPagos);
            await renderTables(viajesData, 1, optionsViajes);
            showConfirmModal("Se actualizaron los datos del chofer");
        }
    }

    socket.on('updateUsuario', manejarUpdateUsuario);

    function manejarDeleteUsuario(user){
        if (user.cuil === choferData.cuil){
            closeModalFactura();
            showConfirmModal(`El chofer ${choferData.nombre} fue eliminado`)
            closeButton.click();
        }
    }

    socket.on('deleteUsuario', manejarDeleteUsuario);

    socket.on('nuevoViaje', async (viaje) => {
        console.log(viaje);
        if (viaje.chofer_cuil === choferData.cuil){
            let viajeParseado = parseViaje(viaje);
            viajesData.push(viajeParseado);
            await renderTables(viajesData, 1, optionsViajes, actualizarTotales);
            showConfirmModal("Se actualizaron los viajes del chofer");
        }
    });

    socket.on('updateViaje', async (viaje) => {
        if (viaje.updatedData.cuil === choferData.cuil){
            const index = viajesData.findIndex(v => v.id === viaje.comprobanteOriginal);
            if (index !== -1) {
                viajesData[index] = parseViaje(viaje.updatedData);
                console.log(`Se modifico el viaje con comprobante ${viaje.comprobanteOriginal}`);
                if (editingRowId)
                    if (editingRowId === viaje.comprobanteOriginal)
                        resetEditingState();
                    else
                        return;
                await renderTables(viajesData, 1, optionsViajes, actualizarTotales);
                showConfirmModal("Se actualizaron los viajes del chofer");
            }
        }
    });

    socket.on('deleteViaje', async (viaje) => {
        if (viaje.cuil === choferData.cuil){
            viajesData = viajesData.filter(v => v.id !== viaje.comprobante);
            if (currentEditingTableType === "viajes" && editingRowId) await resetEditingState();
            await renderTables(viajesData, 1,optionsViajes, actualizarTotales);
            showConfirmModal("Se actualizaron los viajes del chofer");
        }
    });

    socket.on('nuevoPago', async (pagos) => {
        let actualizo = false;
        if (pagos.cuil && pagos.cuil === choferData.cuil){
            pagos.pagosArray.forEach( pago => {
                    if (new Date(pago.fecha_pago) < new Date()){
                        let pagoParseado = parsePagos(pago);
                        pagosData.push(pagoParseado);
                        actualizo = true;
                    }
                });
            if (actualizo) {
                await renderTables(pagosData, 1,optionsPagos, actualizarTotales);
                showConfirmModal("Se actualizaron los pagos del chofer");
            }
        }
    });

    socket.on('deletePago', async (pago) => {
        if (pago.cuil && pago.cuil === choferData.cuil){
            pagosData = pagosData.filter(p => p.id !== pago.id || p.tipo !== pago.tipo);
            await renderTables(pagosData, 1, optionsPagos, actualizarTotales);
            showConfirmModal("Se actualizaron los pagos del chofer");
        }
    });
    

    try {
        if (choferData.trabajador !== "Responsable Inscripto") optionsViajes.columnas[0] = optionsViajes.columnas[0].filter(col => !["iva"].includes(col.key));
        await cargarTablas();
        setTodayDate();
        setupPaymentTypeSelector(fields);
        setupAddPagoBtn();
        setupAddViajeBtn();
        const historialBtn = document.getElementById("historial");
        const backHistorialBtn = document.getElementById("back-historialBtn");
        const headerModal = document.getElementById("headerModal");
        const selectCantidad = document.getElementById("selectResumenes");
        const contentResumenes = document.getElementById("content-resumenes");
        const inputCantResumenes = document.getElementById('inputSelectResumenes');
        

        inputCantResumenes?.addEventListener("change", () => {
            if (inputCantResumenes.value > 0)
                historialBtn.click();
        })

        selectCantidad?.addEventListener("change", () => {
            if (selectCantidad.value !== "Otro"){
                inputCantResumenes.classList.add("hidden");
                inputCantResumenes.value = '';
                historialBtn.click();
            } else 
                inputCantResumenes.classList.remove("hidden");
        })

        historialBtn?.addEventListener("click", async () =>{
            changeSpinnerText(mainContent, "Cargando resumenes...");
            toggleSpinnerVisible(mainContent);
            await setHistorial(choferData, cartaPorteFunc, deleteFactura);
            toggleSpinnerVisible(mainContent);
            changeSpinnerText(mainContent);
            document.getElementById("back-historial").classList.remove("hidden");
            headerModal.textContent = "Viajes y Pagos - Resumenes";
            contentResumenes.classList.remove("hidden");
            mainContent.classList.add("hidden");
            historialBtn.classList.add("hidden");
        });

        socket.on('nuevoFactura', (factura) => {
            if (factura.cuil === choferData.cuil){
                let viajesEditados = false;
                viajesData.forEach(viaje => {
                    if (factura.viajesIds.includes(viaje.comprobante)) {
                        viaje.factura_id = factura.facturaId;
                        viajesEditados = true;
                    }
                });
                if (viaje.length > 0 && factura.viajesIds.includes(viaje[0].id)){
                    viaje[0].factura_id = factura.facturaId;
                    updateViajeStatus();
                }
                document.getElementById('documentUploadBoxModal')?.remove();
                showConfirmModal("Se actualizaron los documentos del chofer");
                if (currentEditingTableType === "viajes" && editingRowId) return;
                renderTables(viajesData, 1, optionsViajes);
                if (historialBtn.classList.contains("hidden") && !viajesEditados){
                    historialBtn.click()
                }
            }
        });

        socket.on('nuevoCartaPorte', (cartaPorte) => {
            if (cartaPorte.cuil === choferData.cuil){
                let viajeEditado = false;
                viajesData.forEach(viaje => {
                    if ( viaje.comprobante === cartaPorte.comprobante){
                        viaje.carta_porte = true;
                        viajeEditado = true;
                    }
                });
                if (viaje.length > 0 && viaje[0].id === cartaPorte.comprobante){
                    viaje[0].carta_porte = true;
                    updateViajeStatus();
                }
                showConfirmModal("Se actualizaron los documentos del chofer");
                if (currentEditingTableType === "viajes" && editingRowId) return;
                renderTables(viajesData, 1, optionsViajes);
                if (historialBtn.classList.contains("hidden") && !viajeEditado){
                    historialBtn.click()
                }
            }
        })

        socket.on('deleteFactura', (factura) => {
            console.log(factura);
            if (factura.cuil === choferData.cuil){
                let viajeEditado = false;
                viajesData.forEach( viaje => {
                    if (viaje.comprobante === factura.comprobante){
                        if (factura.facturaId && factura.facturaId !== "null" && factura.facturaId !== "undefined"){
                            viaje.factura_id = null;
                            viajeEditado = true;
                        } else {
                            viaje.carta_porte = false;
                            viajeEditado = true;
                        }
                    }
                });

                if (viaje.length > 0 && viaje[0].comprobante === factura.comprobante){
                    if (factura.facturaId && factura.facturaId !== "null" && factura.facturaId !== "undefined")
                        viaje[0].factura_id = null;
                    else
                        viaje[0].carta_porte = false;
                    updateViajeStatus();
                }
                showConfirmModal("Se actualizaron los documentos del chofer");
                if (currentEditingTableType === "viajes" && editingRowId) return;
                renderTables(viajesData, 1,optionsViajes);
                if (historialBtn.classList.contains("hidden") && !viajeEditado){
                    historialBtn.click()
                }

            }
        });

        socket.on('cerrarResumen', async (resumen) => {
            if (resumen.cuil === choferData.cuil){
                changeSpinnerText(mainContent, "Actualizando datos...");
                toggleSpinnerVisible(mainContent);
                await resetEditingState();
                await cargarTablas();
                changeSpinnerText(mainContent);
                toggleSpinnerVisible(mainContent);
                
                if (historialBtn.classList.contains("hidden")) historialBtn.click();
                showConfirmModal("Se actualizo el resumen del chofer");
            }
        });

        backHistorialBtn?.addEventListener("click", () =>{
            document.getElementById("back-historial").classList.add("hidden");
            headerModal.textContent = "Viajes y Pagos";
            contentResumenes.classList.add("hidden");
            mainContent.classList.remove("hidden");
            historialBtn.classList.remove("hidden");
        });

        const cardViajes = document.getElementById("addViajeCard");
        document.getElementById("agregar-viaje")?.addEventListener("click", () => {
            cardViajes.classList.toggle('hidden');
        });

        const cardPagos = document.getElementById("addPagoCard");
        document.getElementById("agregar-pago")?.addEventListener("click", () => {
            cardPagos.classList.toggle('hidden');
        });

        document.getElementById("cerrarCuenta")?.addEventListener("click", () => {
            cerrarCuenta();
        });
    } catch (error) {
        console.error('Error de red o desconocido al obtener datos de los viajes:', error);
        if (mainContent) mainContent.innerHTML = `<p class="error-message">Error de conexión al cargar los datos.</p>`;
    } finally {
        toggleSpinnerVisible(mainContent);
    }
}