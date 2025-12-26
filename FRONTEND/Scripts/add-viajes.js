import { fetchAllChoferes, addViaje, addPagos, fetchClientes, getViajeComprobante, updateViaje, setupAutocomplete, setupClienteAutocomplete, setupChoferAutocomplete, loadTarifas, tarifasCatac, fetchProveedores } from './api.js';
import { showConfirmModal, createLoadingSpinner, toggleSpinnerVisible } from './apiPublic.js';

// Global variables
let allChoferes = [];
let allClientes = [];
let allProveedores = [];

const contentPrincipal = document.getElementById("add-viajes-section");

// Regex for input validation
const regexInputs = {
    'comprobante': /^(\d{4}-\d{8}|\d{11})$/
};

// Set today's date in date inputs
const setTodayDate = () => {
    const today = new Date().toLocaleDateString('es-AR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).split('/').reverse().join('-');

    ['fecha', 'fechaPago'].forEach(id => {
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

// Validate form inputs
const validateInputs = (payload, fields) => {
    for (const [key, label] of Object.entries(fields)) {
        if (!payload[key] || (typeof payload[key] === 'string' && !payload[key].trim())) {
            showConfirmModal(`El valor para ${label} no ha sido ingresado.`, 'error');
            return false;
        }
    }
    return true;
};

// Tab content display
const handleTabContentDisplay = (selectedTab) => {
    const content = { viajes: document.getElementById('viajes'), pagos: document.getElementById('pagos') };
    Object.values(content).forEach(div => div?.classList.add('hidden'));
    content[selectedTab]?.classList.remove('hidden');

    if (selectedTab === 'pagos') {
        setupPaymentTypeSelector();
        setupChoferAutocomplete('choferPago', allChoferes);
    } else if (selectedTab === 'viajes') {
        setupChoferAutocomplete('chofer', allChoferes);
        setupClienteAutocomplete('cliente', allClientes);
        setupTarifaAutocomplete();
        setupCargaDescargaAutocomplete();
    }
};

// Setup tab selectors
const setupTabSelectors = () => {
    const tabSelector = document.getElementById('viajesPagosSelector');
    if (!tabSelector) {
        console.warn("Elemento #viajesPagosSelector no encontrado.");
        return;
    }

    const tabItems = tabSelector.querySelectorAll('.tab-item');
    tabItems.forEach(item => {
        item.addEventListener('click', () => {
            tabItems.forEach(tab => tab.classList.remove('active'));
            item.classList.add('active');
            handleTabContentDisplay(item.dataset.tab);
        });
    });

    const initialActive = tabSelector.querySelector('.tab-item.active');
    if (initialActive) handleTabContentDisplay(initialActive.dataset.tab);
};

// Setup add viaje button
const setupAddViajeBtn = () => {
    const form = document.getElementById('formViaje');
    const btn = document.getElementById('addViajeBtn');
    btn?.addEventListener('click', async () => {
        const choferInput = document.getElementById('chofer');
        const clienteInput = document.getElementById('cliente');
        const fechaInput = document.getElementById('fecha');
        const payload = {
            chofer_cuil: choferInput?.dataset.selectedChoferCuil,
            nombre: choferInput?.dataset.selectedChoferNombre,
            cliente_cuit: clienteInput?.dataset.selectedClienteCuit
        };

        if (!payload.chofer_cuil) {
            showConfirmModal('Por favor, selecciona un chofer de la lista de sugerencias.');
            return;
        }

        if (!payload.cliente_cuit) {
            showConfirmModal('Por favor, selecciona un cliente de la lista de sugerencias.');
            return;
        }

        const formData = Object.fromEntries(new FormData(form).entries());

        const fechaISO = fechaInput?.value ? `${fechaInput.value}T00:00:00-03:00` : new Date().toISOString().split('T')[0] + 'T00:00:00-03:00';
        Object.assign(payload, {
            fecha: fechaISO,
            comprobante: formData.comprobante?.trim(),
            campo: formData.campo?.trim(),
            producto: formData.producto?.trim(),
            kilometros: parseFloat(formData.kilometro),
            tarifa: formData.tarifa,
            variacion: parseFloat(formData.variacion) || 0.1,
            toneladas: parseFloat(formData.toneladas),
            cargado: parseFloat(formData.cargado) || parseFloat(formData.toneladas),
            descargado: parseFloat(formData.descargado) || parseFloat(formData.toneladas),
            pagado: false
        });

        if (!validarInputs(payload)) return;

        try {
            const response = await addViaje(payload);
            const data = await response.json();
            if (response.ok){
                form.reset();
                setTodayDate();
            }
            showConfirmModal(data.message);
        } catch (error) {
            console.error('Error en addViaje:', error.message);
        }
    });
};

function validarInputs(payload){
    // Validate required fields
        if (!validateInputs(payload, {
            comprobante: 'Comprobante',
            campo: 'Campo',
            producto: 'Producto',
            kilometros: 'Kilómetro',
            tarifa: 'Tarifa',
            toneladas: 'Toneladas',
            cargado: 'Cargado',
            descargado: 'Descargado'
        })) return false;

        // Validate comprobante format
        if (!regexInputs.comprobante.test(payload.comprobante)) {
            showConfirmModal('El comprobante debe tener el formato "XXXX-XXXXXXXX" o ser un número de 11 dígitos.');
            return false;
        }

        // Validate numeric fields
        const numericFields = {
            kilometros: 'Kilómetro',
            toneladas: 'Toneladas',
            cargado: 'Cargado',
            descargado: 'Descargado'
        };
        for (const [key, label] of Object.entries(numericFields)) {
            if (isNaN(payload[key]) || payload[key] <= 0) {
                showConfirmModal(`${label} debe ser un número mayor a 0.`, 'error');
                return false;
            }
        }
        return true;
}

// Setup search bar
const setupViajesSearchBar = () => {
    const input = document.querySelector('#viajesSearchBar .search-input');
    const icon = document.querySelector('#viajesSearchBar .search-icon');
    if (!input || !icon) {
        console.warn("Elementos de la barra de búsqueda no encontrados.");
        return;
    }

    const handleSearch = async () => {
        const term = input.value.trim();
        try {
            if (!regexInputs.comprobante.test(term))
                return showConfirmModal("El comprobante ingresado no es valido, debe tener la forma XXXX-XXXXXXXX o XXXXXXXXXXX");

            const response = await getViajeComprobante(term);
            const data = await response.json();
            if (!response.ok)
                return showConfirmModal(data.message);

            input.value = '';
            const buttonsAddViaje = document.getElementById("añadirViaje");
            const buttonsEditViaje = document.getElementById("editarViaje");

            const editViajeBtn = document.getElementById("editViajeBtn");

            if (data.group_r)
                editViajeBtn.classList.add("hidden");

            buttonsAddViaje.classList.add("hidden");
            buttonsEditViaje.classList.remove("hidden");


            const inputChofer = document.getElementById("chofer");
            const inputCliente = document.getElementById("cliente");
            const inputKilometro = document.getElementById("kilometro");
            const inputToneladas = document.getElementById("toneladas");
            const inputFecha = document.getElementById("fecha");
            const inputTarifa = document.getElementById("tarifa");
            const inputCargado = document.getElementById("cargado");
            const inputComprobante = document.getElementById("comprobante");
            const inputVariacion = document.getElementById("variacion");
            const inputDescargado = document.getElementById("descargado");
            const inputCampo = document.getElementById("campo");

            const chofer = allChoferes.find(chofer => chofer.cuil === data.cuil);
            if (chofer){
                inputChofer.value = chofer.nombre;
                inputChofer.dataset.selectedChoferNombre = chofer.nombre;
            } else {
                inputChofer.value = "CHOFER ELIMINADO";
            }
            inputChofer.dataset.selectedChoferCuil = data.cuil;

            const cliente = data.cuit ? allClientes.filter(cliente => cliente.cuit === data.cuit) : null;
            if (cliente){
                inputCliente.value = cliente[0].nombre;
                inputCliente.dataset.selectedClienteNombre = cliente[0].nombre;
                inputCliente.dataset.selectedClienteCuit = cliente[0].cuit;
            } else {
                inputCliente.value = data.cuit? "CLIENTE ELIMINADO" : '';
                inputCliente.removeAttribute('data-selected-cliente-nombre');
                if (data.cuit)
                    inputCliente.dataset.selectedClienteCuit = data.cuit;
                else 
                    inputCliente.removeAttribute('data-selected-cliente-cuit');
            }

            inputKilometro.value = data.kilometros;
            inputTarifa.value = data.tarifa;
            inputToneladas.value = data.toneladas;
            inputFecha.value = data.fecha.split("T")[0];
            inputCargado.value = data.cargado;
            inputComprobante.value = data.comprobante;
            inputVariacion.value = data.variacion;
            inputDescargado.value = data.descargado;
            inputCampo.value = data.campo;

            [inputChofer, inputCliente, inputKilometro, inputToneladas, inputFecha, inputTarifa, inputCargado, inputComprobante, inputVariacion, inputDescargado, inputCampo].forEach( input => {
                input.setAttribute('readonly', true);
            });

            const acceptViajeBtn = document.getElementById("acceptViajeBtn");
            const cancelViajeBtn = document.getElementById("cancelViajeBtn");

            editViajeBtn.onclick = () => {
                editViajeBtn.classList.add("hidden");
                acceptViajeBtn.classList.remove("hidden");
                [inputChofer, inputCliente, inputKilometro, inputToneladas, inputFecha, inputTarifa, inputCargado, inputComprobante, inputVariacion, inputDescargado, inputCampo].forEach( input => {
                    input.removeAttribute('readonly');
                    input.setAttribute('editing', true);
                });
            }
            acceptViajeBtn.onclick= () => {
                console.log(inputComprobante.value);
                const payload = {
                    [data.comprobante]:{
                        chofer_cuil: inputChofer.dataset.selectedChoferCuil,
                        cliente_cuit: inputCliente.dataset.selectedClienteCuit,
                        kilometros: parseInt(inputKilometro.value),
                        toneladas: parseFloat(inputToneladas.value),
                        fecha: `${inputFecha.value}T00:00:00-03:00`,
                        tarifa: inputTarifa.value,
                        cargado: parseFloat(inputCargado.value) || parseFloat(inputToneladas.value),
                        comprobante: inputComprobante.value.trim(),
                        descargado: parseFloat(inputDescargado.value) || parseFloat(inputToneladas.value),
                        variacion: parseFloat(inputVariacion.value),
                        campo: inputCampo.value.trim()
                    }
                }
                console.log(payload);
                if (!validarInputs(payload[data.comprobante])) return;

                try {
                    showConfirmModal(`Esta seguro de que desea editar el viaje con comprobante ${data.comprobante}?`, "confirm", async () => {
                        const response = await updateViaje(payload);
                        const data = await response.json();
                        showConfirmModal(data.message);
                        cancelViajeBtn.click();
                        });
                } catch (error){
                    console.log(error.message);
                }
            }

            cancelViajeBtn.onclick = () => {
                editViajeBtn.classList.remove("hidden");
                acceptViajeBtn.classList.add("hidden");
                buttonsAddViaje.classList.remove("hidden");
                buttonsEditViaje.classList.add("hidden");
                [inputChofer, inputCliente, inputKilometro, inputToneladas, inputFecha, inputTarifa, inputCargado, inputComprobante, inputVariacion, inputDescargado, inputCampo].forEach( input => {
                    input.removeAttribute('readonly');
                    input.removeAttribute('editing');
                    input.value = '';
                    input.removeAttribute('data-selected-chofer-nombre');
                    input.removeAttribute('data-selected-chofer-cuil');
                    input.removeAttribute('data-selected-cliente-nombre');
                    input.removeAttribute('data-selected-cliente-cuit');
                });

                setTodayDate();
            }
                
        } catch (error){
            console.log(error.message);
        }
    };

    input.addEventListener('keydown', e => e.key === 'Enter' && handleSearch());
    icon.addEventListener('click', handleSearch);
};

// Setup payment type selector
const setupPaymentTypeSelector = () => {
    const tipoPagoSelect = document.getElementById('tipoPago');
    const fields = {
        Cheque: document.getElementById('chequeFields'),
        Gasoil: document.getElementById('gasoilFields'),
        Otro: document.getElementById('otroFields')
    };
    const addChequeBtn = document.getElementById('addChequeBtn');
    const chequeFieldsContainer = document.getElementById('chequeFieldsContainer');

    const showPaymentFields = type => {
        Object.values(fields).forEach(field => field?.classList.add('hidden'));
        fields[type]?.classList.remove('hidden');
        if (type === 'Cheque') {
            addChequeBtn?.classList.remove('hidden');
            chequeFieldsContainer?.classList.remove('hidden');
        } else {
            addChequeBtn?.classList.add('hidden');
            chequeFieldsContainer?.classList.add('hidden');
        }
        setTodayDate();
        if (type === 'Gasoil') calculateGasoilImporte();
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

// Setup add cheque button
const setupAddChequeBtn = () => {
    const addChequeBtn = document.getElementById('addChequeBtn');
    const chequeContainer = document.querySelector('#chequeFields .cheques');

    if (!addChequeBtn || !chequeContainer) {
        console.warn("Elementos del botón de añadir cheque no encontrados.");
        return;
    }

    let chequeCounter = 1; // Contador para identificar cada cheque

    addChequeBtn.addEventListener('click', () => {
        chequeCounter++;
        
        // Crear un nuevo contenedor para el cheque duplicado
        const newChequeDiv = document.createElement('div');
        newChequeDiv.classList.add('cheque-form');
        newChequeDiv.setAttribute('data-cheque-id', chequeCounter);
        
        // Crear el HTML del nuevo formulario de cheque
        newChequeDiv.innerHTML = `
            <div style="background-color: #cccccc; width: auto; height: 1px; margin: 15px 1% 10px 1%;"></div>
            <div class="form-grid">
                <div class="form-group">
                    <label for="fechaCheque_${chequeCounter}">Fecha del Cheque</label>
                    <input type="date" id="fechaCheque_${chequeCounter}" name="fechaCheque_${chequeCounter}">
                </div>
                <div class="form-group">
                    <label for="nroCheque_${chequeCounter}">Nro. de Cheque</label>
                    <input type="number" id="nroCheque_${chequeCounter}" name="nroCheque_${chequeCounter}" placeholder="Número de Cheque">
                </div>
                <div class="form-group">
                    <label for="terceroCheque_${chequeCounter}">Banco</label>
                    <input type="text" id="terceroCheque_${chequeCounter}" name="terceroCheque_${chequeCounter}" placeholder="Nombre del Banco">
                </div>
                <div class="form-group">
                    <label for="destinatarioCheque_${chequeCounter}">Destinatario</label>
                    <input type="text" id="destinatarioCheque_${chequeCounter}" name="destinatarioCheque_${chequeCounter}" placeholder="Nombre del Destinatario">
                </div>
                <div class="form-group">
                    <label for="importeCheque_${chequeCounter}">Importe</label>
                    <input type="number" id="importeCheque_${chequeCounter}" name="importeCheque_${chequeCounter}" placeholder="Importe">
                </div>
                <div class="form-group autocomplete-container">
                        <label for="clienteCheque_${chequeCounter}">Asignar Cliente?</label>
                        <input type="search" id="clienteCheque_${chequeCounter}" name="clienteCheque_${chequeCounter}" placeholder="Razon social">
                </div>
            </div>
            <div style="text-align: center; margin: 10px 0;">
                <button type="button" class="btn btn-danger btn-sm remove-cheque-btn" data-cheque-id="${chequeCounter}">
                    <i class="bi bi-trash"></i> Eliminar Cheque
                </button>
            </div>
        `;
        // Insertar el nuevo cheque antes del botón de añadir
        const buttonContainer = addChequeBtn.parentElement;
        buttonContainer.parentNode.insertBefore(newChequeDiv, buttonContainer);
        
        // Establecer la fecha por defecto (40 días desde hoy)
        const fechaChequeInput = document.getElementById(`fechaCheque_${chequeCounter}`);
        if (fechaChequeInput) {
            const chequeDate = new Date();
            chequeDate.setDate(chequeDate.getDate() + 40);
            fechaChequeInput.value = chequeDate.toLocaleDateString('es-AR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).split('/').reverse().join('-');
        }
        setupClienteAutocomplete(`clienteCheque_${chequeCounter}`, allClientes);
        // Agregar evento al botón de eliminar
        const removeBtn = newChequeDiv.querySelector('.remove-cheque-btn');
        removeBtn.addEventListener('click', () => {
            newChequeDiv.remove();
        });
        
        console.log(`Cheque ${chequeCounter} añadido`);
    });
};

// Función de debug para verificar el payload antes de enviarlo
const debugPayload = (payload, tipoPago) => {
    console.log('=== DEBUG PAYLOAD ===');
    console.log('Tipo de pago:', tipoPago);
    console.log('Payload completo:', JSON.stringify(payload, null, 2));
    
    if (tipoPago.toLowerCase() === 'cheque') {
        console.log('Número de cheques:', payload.pagos.length);
        payload.pagos.forEach((cheque, index) => {
            console.log(`Cheque ${index + 1}:`, {
                tipo: cheque.tipo,
                fecha_pago: cheque.fechaPago,
                fecha_cheque: cheque.fechaCheque,
                nroCheque: cheque.nroCheque,
                tercero: cheque.tercero,
                destinatario: cheque.destinatario,
                importe: cheque.importe
            });
        });
    }
    console.log('=====================');
    
    // Verificar que el payload coincida con lo que espera el backend
    const backendExpected = {
        choferCuil: 'string',
        pagos: tipoPago.toLowerCase() === 'cheque' ? 'array' : 'object'
    };
    
    console.log('Estructura esperada por backend:', backendExpected);
    console.log('Estructura enviada:', {
        choferCuil: typeof payload.choferCuil,
        pagos: Array.isArray(payload.pagos) ? 'array' : typeof payload.pagos
    });
};

// Añadir esta línea justo antes del try-catch en setupAddPagoBtn:
// debugPayload(payload, tipoPago);

// Setup add pago button - Versión actualizada
const setupAddPagoBtn = () => {
    const btn = document.getElementById('addPagoBtn');
    setupClienteAutocomplete('clienteCheque', allClientes);
    setupClienteAutocomplete('proveedorGasoil', allProveedores);
    btn?.addEventListener('click', async () => {
        const tipoPago = document.getElementById('tipoPago')?.value;
        const fechaPago = document.getElementById('fechaPago')?.value;
        const choferInput = document.getElementById('choferPago');
        let payload = {
            chofer_cuil: choferInput?.dataset.selectedChoferCuil,
        };

        if (!payload.chofer_cuil) {
            showConfirmModal('Por favor, selecciona un chofer de la lista de sugerencias.');
            return;
        }

        switch (tipoPago.toLowerCase()) {
            case 'cheque':
                payload = {
                    ...payload,
                    pagos: []
                };
                
                // Recopilar datos del cheque original
                const originalChequeData = {
                    tipo: tipoPago,
                    fecha_pago: fechaPago,
                    fecha_cheque: document.getElementById('fechaCheque')?.value,
                    nroCheque: document.getElementById('nroCheque')?.value,
                    tercero: document.getElementById('terceroCheque')?.value,
                    destinatario: document.getElementById('destinatarioCheque')?.value,
                    importe: document.getElementById('importeCheque')?.value,
                    cliente_cuit: document.getElementById('clienteCheque')?.dataset.selectedClienteCuit || null
                };
                
                // Validar y añadir el cheque original si tiene datos
                if (originalChequeData.importe && originalChequeData.importe.trim() !== '') {
                    if (isNaN(originalChequeData.importe) || parseFloat(originalChequeData.importe) <= 0) {
                        showConfirmModal('El importe del cheque original no es válido');
                        return;
                    }
                    payload.pagos.push(originalChequeData);
                }
                
                // Recopilar datos de los cheques duplicados
                const chequeFormularios = document.querySelectorAll('.cheque-form');
                chequeFormularios.forEach(formulario => {
                    const chequeId = formulario.getAttribute('data-cheque-id');
                    const chequeData = {
                        tipo: 'cheque',
                        fecha_pago: fechaPago,
                        fecha_cheque: document.getElementById(`fechaCheque_${chequeId}`)?.value,
                        nroCheque: document.getElementById(`nroCheque_${chequeId}`)?.value,
                        tercero: document.getElementById(`terceroCheque_${chequeId}`)?.value,
                        destinatario: document.getElementById(`destinatarioCheque_${chequeId}`)?.value,
                        importe: document.getElementById(`importeCheque_${chequeId}`)?.value,
                        cliente_cuit: document.getElementById(`clienteCheque_${chequeId}`)?.dataset.selectedClienteCuit || null
                    };
                    
                    // Validar y añadir si tiene datos válidos
                    if (chequeData.importe && chequeData.importe.trim() !== '') {
                        if (isNaN(chequeData.importe) || parseFloat(chequeData.importe) <= 0) {
                            showConfirmModal(`El importe del cheque ${chequeId} no es válido`);
                            return;
                        }
                        payload.pagos.push(chequeData);
                    }
                });
                
                if (payload.pagos.length === 0) {
                    showConfirmModal('Por favor, completa al menos un cheque con todos sus datos.');
                    return;
                }
                
                // Validar que todos los cheques tengan los campos requeridos
                for (let i = 0; i < payload.pagos.length; i++) {
                    const cheque = payload.pagos[i];
                    const requiredFields = ['fecha_cheque', 'nroCheque', 'tercero', 'destinatario', 'importe'];
                    
                    for (const field of requiredFields) {
                        if (!cheque[field] || cheque[field].trim() === '') {
                            showConfirmModal(`Por favor, completa todos los campos del cheque ${i + 1}.`);
                            return;
                        }
                    }
                }
                break;
                
            case 'gasoil':
                const comprobanteGasoil = document.getElementById('comprobanteGasoil')?.value;
                const precioGasoil = document.getElementById('precioGasoil')?.value;
                const litros = document.getElementById('litrosGasoil')?.value;
                const importe = document.getElementById('importeGasoil')?.value;
                
                if (!comprobanteGasoil || !precioGasoil || !litros || !importe) {
                    showConfirmModal('Por favor, completa todos los campos del gasoil.');
                    return;
                }
                
                if (isNaN(precioGasoil) || parseFloat(precioGasoil) <= 0 ||
                    isNaN(litros) || parseFloat(litros) <= 0 ||
                    isNaN(importe) || parseFloat(importe) <= 0) {
                    showConfirmModal('Los valores del gasoil deben ser números válidos mayores a 0.');
                    return;
                }
                
                payload = {
                    ...payload,
                    pagos: {
                        tipo: tipoPago,
                        proveedor_cuit: document.getElementById('proveedorGasoil')?.dataset.selectedClienteCuit,
                        fecha_pago: fechaPago,
                        comprobante: comprobanteGasoil,
                        precioGasoil: precioGasoil,
                        litros: litros,
                        importe: importe
                    }
                };
                break;
                
            case 'otro':
                const comprobanteOtro = document.getElementById('comprobanteOtro')?.value;
                const detalle = document.getElementById('detalleOtro')?.value;
                const importeOtro = document.getElementById('importeOtro')?.value;
                
                if (!comprobanteOtro || !detalle || !importeOtro) {
                    showConfirmModal('Por favor, completa todos los campos.');
                    return;
                }
                
                if (isNaN(importeOtro) || parseFloat(importeOtro) <= 0) {
                    showConfirmModal('El valor ingresado para el importe no es válido');
                    return;
                }
                
                payload = {
                    ...payload,
                    pagos: {
                        tipo: tipoPago,
                        fecha_pago: fechaPago,
                        comprobante: comprobanteOtro,
                        detalle: detalle,
                        importe: importeOtro
                    }
                };
                break;
                
            default:
                console.warn('Tipo de pago no reconocido:', tipoPago);
                return;
        }
        
        try {
            // Debug: Mostrar payload antes de enviar
            console.log('=== DEBUG PAYLOAD ===');
            console.log('Tipo de pago:', tipoPago);
            console.log('Payload completo:', JSON.stringify(payload, null, 2));
            
            if (tipoPago.toLowerCase() === 'cheque') {
                console.log('Número de cheques:', payload.pagos.length);
                payload.pagos.forEach((cheque, index) => {
                    console.log(`Cheque ${index + 1}:`, {
                        tipo: cheque.tipo,
                        fecha_pago: cheque.fechaPago,
                        fecha_cheque: cheque.fechaCheque,
                        nroCheque: cheque.nroCheque,
                        tercero: cheque.tercero,
                        destinatario: cheque.destinatario,
                        importe: cheque.importe,
                        cliente_cuit: cheque.cliente_cuit
                    });
                });
            }
            console.log('=====================');
            
            const response = await addPagos(payload);
            const data = await response.json();
            
            // Limpiar formularios después del éxito
            if (response.ok)
                if (tipoPago.toLowerCase() === 'cheque') {
                    // Limpiar el formulario original
                    ['fechaCheque', 'nroCheque', 'terceroCheque', 'destinatarioCheque', 'importeCheque', 'clienteCheque'].forEach(id => {
                        const input = document.getElementById(id);
                        if (input) input.value = '';
                        input.removeAttribute('data-selected-cliente-nombre');
                        input.removeAttribute('data-selected-cliente-cuit');
                    });
                    
                    // Eliminar todos los formularios duplicados
                    document.querySelectorAll('.cheque-form').forEach(form => form.remove());
                    
                    // Restablecer la fecha por defecto en el cheque original
                    setTodayDate();
                } else {
                    // Limpiar otros formularios
                    const formFields = tipoPago.toLowerCase() === 'gasoil' 
                        ? ['comprobanteGasoil','precioGasoil', 'litrosGasoil', 'importeGasoil', 'proveedorGasoil' ]
                        : ['comprobanteOtro','detalleOtro', 'importeOtro'];
                        
                    formFields.forEach(id => {
                        const input = document.getElementById(id);
                        if (input) input.value = '';
                        input.removeAttribute('data-selected-cliente-nombre');
                        input.removeAttribute('data-selected-cliente-cuit');
                    });
                }
            
            showConfirmModal(data.message);
        } catch (error) {
            console.error('Error en addPagos:', error.message);
        }
        
        console.log('[Registrar Pago]', payload);
    });
};

// Setup tarifa autocomplete
const setupTarifaAutocomplete = () => {
    const tarifaAutodescargableBase = 0;

    setupAutocomplete({
        inputId: 'tarifa',
        dependentInputId: 'kilometro',
        filterSuggestions: () => {
            const currentKm = parseInt(document.getElementById('kilometro')?.value.trim(), 10);
            const tarifaCatacCalculada = (!isNaN(currentKm) && currentKm > 0 && currentKm <= tarifasCatac.length && tarifasCatac[currentKm - 1]?.valor !== undefined)
                ? tarifasCatac[currentKm - 1].valor
                : 0;

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
    const [toneladas, cargado, descargado] = ['toneladas', 'cargado', 'descargado'].map(id => document.getElementById(id));
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

// DOMContentLoaded initialization
document.addEventListener('DOMContentLoaded', async () => {
    await createLoadingSpinner(contentPrincipal);
    if (typeof loadHeader === 'function') await loadHeader();
    else console.error("loadHeader no está definido. Asegúrate de cargar /FRONTEND/scripts/header.js.");

    if (typeof loadSidebar === 'function') await loadSidebar(localStorage.getItem('userRole') || 'admin');
    else console.error("loadSidebar no está definido. Asegúrate de cargar /FRONTEND/scripts/sidebar.js.");
    allChoferes = await fetchAllChoferes();
    allClientes = await fetchClientes();
    allProveedores = await fetchProveedores();
    await loadTarifas();
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    sidebarItems.forEach(item => {
        if (item.dataset.targetPage && window.location.pathname.includes(item.dataset.targetPage)) {
            sidebarItems.forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        }
    });

    

    setTodayDate();
    setupTabSelectors();

    
    
    setupAddViajeBtn();
    setupViajesSearchBar();
    setupAddPagoBtn();
    setupAddChequeBtn();

    toggleSpinnerVisible(contentPrincipal);
});