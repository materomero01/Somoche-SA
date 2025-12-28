import { createLoadingSpinner, toggleSpinnerVisible, changeSpinnerText, getFactura, getCartaPorte } from "./apiPublic.js";
import { fetchLogs } from "./api.js";

// Función para parsear valores con formato de moneda ($376,529.16) a número
// Formato: coma como separador de miles, punto como decimal
const parseCurrency = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    // Detectar si es negativo
    const isNegative = value.includes('-');
    // Remover $, espacios, comas (miles), y signos negativos, dejar el punto decimal
    const cleanValue = value.replace(/[$\s,-]/g, '');
    const result = parseFloat(cleanValue) || 0;
    return isNegative ? -result : result;
};

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof loadHeader === 'function') await loadHeader();
    if (typeof loadSidebar === 'function') await loadSidebar();

    const tableBody = document.querySelector('#logsTable tbody');
    const content = document.querySelector('.content');
    const modal = document.getElementById('log-detail-modal');
    const closeModal = document.querySelector('.close-modal');
    const jsonContent = document.getElementById('log-json-content');

    // Variables de paginación
    let currentPage = 1;
    const limit = 50;
    let isLoading = false;

    // Crear botón "Cargar más" si no existe
    let loadMoreBtn = document.querySelector('#loadMoreBtn');
    if (!loadMoreBtn) {
        const tableContainer = document.querySelector('.table-container') || document.querySelector('#logsTable').parentElement;
        const btnContainer = document.createElement('div');
        btnContainer.style.textAlign = 'center';
        btnContainer.style.margin = '20px 0';

        loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'loadMoreBtn';
        loadMoreBtn.textContent = 'Cargar más registros';
        loadMoreBtn.className = 'btn btn-primary btn-lg';
        loadMoreBtn.style.display = 'none'; // Oculto inicialmente

        btnContainer.appendChild(loadMoreBtn);
        tableContainer.parentElement.appendChild(btnContainer); // Agregar después del contenedor de la tabla

        loadMoreBtn.onclick = () => {
            currentPage++;
            loadLogs(currentPage, true);
        };
    }

    // Cerrar modal
    if (closeModal) {
        closeModal.onclick = () => {
            modal.classList.add('hidden');
            modal.classList.remove('active');
        };
    }

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.classList.add('hidden');
            modal.classList.remove('active');
        }
    };

    // Campos a ocultar según la tabla
    const camposOcultos = {
        viaje: ['valid', 'group_r', 'create_at', 'update_at', 'factura_id'],
        viaje_cliente: ['valid', 'create_at', 'update_at', 'factura_id', 'pagado'],
        pagos_cheque: ['valid', 'group_r', 'create_at', 'update_at', 'pagado'],
        pagos_gasoil: ['valid', 'group_r', 'create_at', 'update_at', 'pagado'],
        pagos_otro: ['valid', 'group_r', 'create_at', 'update_at', 'id', 'cliente_cuit'],
        cliente: ['valid', 'create_at', 'update_at'],
        proveedor: ['valid', 'create_at', 'update_at'],
        usuario: ['valid', 'create_at', 'update_at', 'password'],
        chofer: ['valid', 'create_at', 'update_at'],
        factura: ['valid', 'create_at', 'update_at', 'factura_pdf', 'id', 'cuil'],
        factura_arca: ['valid', 'create_at', 'update_at', 'factura_pdf', 'id'],
        carta_porte: ['valid', 'create_at', 'update_at', 'carta_porte_pdf']
    };

    // Filtrar campos ocultos y nulls
    const filtrarDatos = (data, tabla) => {
        if (!data || typeof data !== 'object') return data;
        const ocultos = camposOcultos[tabla] || ['valid', 'create_at', 'update_at'];
        const filtrado = {};
        for (const [key, value] of Object.entries(data)) {
            // Ocultar campos de la lista o valores null
            if (ocultos.includes(key)) continue;
            if (value === null) continue;
            filtrado[key] = value;
        }

        // Para pagos_gasoil, calcular importe (litros * precio)
        if (tabla === 'pagos_gasoil' && !filtrado.importe) {
            // Limpiar símbolos de moneda (solo $)
            const cleanNumber = (val) => {
                if (typeof val === 'number') return val;
                if (!val) return 0;
                let s = String(val).replace(/[$]/g, '').trim();

                const lastDot = s.lastIndexOf('.');
                const lastComma = s.lastIndexOf(',');

                // Si hay ambos, el último es el decimal
                if (lastDot > -1 && lastComma > -1) {
                    if (lastDot > lastComma) {
                        s = s.replace(/,/g, ''); // US
                    } else {
                        s = s.replace(/\./g, '').replace(',', '.'); // AR
                    }
                }
                else if (lastComma > -1) s = s.replace(',', '.');

                return parseFloat(s) || 0;
            };
            const litros = cleanNumber(filtrado.litros);
            const precio = cleanNumber(filtrado.precio);
            if (!isNaN(litros) && !isNaN(precio)) {
                filtrado.importe = '$' + (litros * precio).toFixed(2);
            }
        }

        return filtrado;
    };

    const loadLogs = async (page = 1, append = false) => {
        if (isLoading) return;
        isLoading = true;

        try {
            if (!append) {
                createLoadingSpinner(content);
                changeSpinnerText(content, "Cargando registros de actividad...");
                currentPage = 1;
            } else {
                if (loadMoreBtn) {
                    loadMoreBtn.textContent = 'Cargando...';
                    loadMoreBtn.disabled = true;
                }
            }

            const response = await fetchLogs(page, limit);
            const logs = response.logs || [];

            if (!append) {
                tableBody.innerHTML = '';
            }

            if (logs.length > 0) {
                logs.forEach(log => {
                    const row = document.createElement('tr');
                    const tabla = log.table_name?.toLowerCase() || '';

                    // Fecha en formato 24hs
                    const date = new Date(log.timestamp).toLocaleString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    });

                    // Usuario
                    const user = log.nombre_apellido && log.nombre_apellido.trim() !== ''
                        ? log.nombre_apellido
                        : (log.user_cuil || 'Desconocido');

                    // Acción
                    const actionText = log.action || 'Operación desconocida';

                    // Preview inteligente
                    let previewText = 'Sin cambios';
                    const detailsObj = log.details || { before: {}, after: {} };

                    // Detectar soft delete o hard delete para usar before en lugar of after
                    const isSoftDeleteForPreview = log.operation === 'UPDATE' && log.action && log.action.toLowerCase().startsWith('eliminar');
                    const isHardDeleteForPreview = log.operation === 'DELETE';
                    const isDeleteForPreview = isSoftDeleteForPreview || isHardDeleteForPreview;

                    // Preview especial para factura de proveedor (cargada a orden gasoil)
                    if (log.action === 'Cargar factura (proveedor)' && log.related_pagos_gasoil && log.related_pagos_gasoil.length > 0) {
                        const pago = log.related_pagos_gasoil[0];
                        const comprobantePago = pago.comprobante || '';
                        if (comprobantePago) {
                            previewText = `Orden Gasoil: ${comprobantePago}`;
                        } else {
                            previewText = 'Factura cargada';
                        }
                    }
                    // Para factura (cargar o eliminar), mostrar chofer/cliente en lugar de viaje
                    else if ((tabla === 'factura' || tabla === 'factura_arca') && log.related_viajes && log.related_viajes.length > 0) {
                        // Para facturas, obtener el chofer o cliente del viaje
                        const viaje = log.related_viajes[0];
                        const identificador = viaje.chofer_cuil || viaje.cliente_cuit || '';
                        if (identificador) {
                            previewText = tabla === 'factura_arca' ? `Cliente: ${identificador}` : `Chofer: ${identificador}`;
                        } else {
                            previewText = isDeleteForPreview ? 'Factura eliminada' : 'Factura cargada';
                        }
                    } else if ((tabla === 'factura' || tabla === 'factura_arca') && log.related_viajes_cliente && log.related_viajes_cliente.length > 0) {
                        const viaje = log.related_viajes_cliente[0];
                        const identificador = viaje.cliente_cuit || '';
                        if (identificador) {
                            previewText = `Cliente: ${identificador}`;
                        } else {
                            previewText = isDeleteForPreview ? 'Factura eliminada' : 'Factura cargada';
                        }
                    } else {
                        let mainData = filtrarDatos(isDeleteForPreview ? detailsObj.before : (detailsObj.after || detailsObj.before || {}), tabla);

                        if (Object.keys(mainData).length > 0) {
                            const prioridades = {
                                pagos_gasoil: ['comprobante', 'litros', 'importe'],
                                pagos_otro: ['comprobante', 'importe', 'detalle', 'chofer_cuil'],
                                pagos_cheque: ['nro', 'importe', 'destinatario'],
                                factura: ['id', 'cuil'],
                                factura_arca: ['id', 'cliente_cuit'],
                                viaje: ['comprobante', 'fecha', 'chofer_cuil'],
                                viaje_cliente: ['viaje_comprobante', 'cliente_cuit'],
                                carta_porte: ['comprobante', 'cuil_chofer'],
                                cliente: ['cuit', 'razon_social', 'email'],
                                proveedor: ['cuit', 'razon_social', 'telefono'],
                                usuario: ['cuil', 'nombre_apellido', 'role'],
                                chofer: ['cuil', 'nombre_apellido']
                            };

                            const campos = prioridades[tabla] || ['comprobante', 'importe', 'cuil', 'detalle'];
                            const maxCampos = tabla === 'pagos_cheque' || tabla === 'pagos_gasoil' ? 3 : 2;

                            const encontrados = [];
                            for (const campo of campos) {
                                if (mainData[campo] !== undefined && mainData[campo] !== null) {
                                    let valor = String(mainData[campo]);
                                    if (valor.length > 25) valor = valor.substring(0, 25) + '...';
                                    encontrados.push(`${campo.replace(/_/g, ' ')}: ${valor}`);
                                    if (encontrados.length >= maxCampos) break;
                                }
                            }

                            previewText = encontrados.length > 0 ? encontrados.join(' | ') : 'Datos modificados';
                        }
                    }

                    // Preview especial para CATAC
                    if (tabla === 'catac' && log.action === 'Actualizar tarifas CATAC') {
                        const catacData = detailsObj.after || detailsObj.before || {};
                        const porcentaje = catacData.porcentaje || '0';
                        const signo = parseFloat(porcentaje) >= 0 ? '+' : '';
                        previewText = `${signo}${porcentaje}%`;
                    }

                    // Preview especial para Cerrar resumen
                    if (log.action === 'Cerrar resumen' && log.related_resumen_data) {
                        const resumenData = log.related_resumen_data;
                        const saldo = parseCurrency(resumenData.saldo);
                        const signo = saldo >= 0 ? '+' : '';
                        previewText = `Saldo: ${signo}$${Math.abs(saldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
                    }

                    // Preview especial para carta porte - mostrar chofer del viaje vinculado
                    if (tabla === 'carta_porte' && log.related_viaje_data) {
                        const viajeData = log.related_viaje_data;
                        const comprobante = viajeData.comprobante || '';
                        const clienteCuit = viajeData.cliente_cuit || '';
                        if (comprobante && clienteCuit) {
                            previewText = `Viaje: ${comprobante} | CUIT: ${clienteCuit}`;
                        } else if (comprobante) {
                            previewText = `Viaje: ${comprobante}`;
                        } else if (clienteCuit) {
                            previewText = `CUIT: ${clienteCuit}`;
                        }
                    }

                    // Preview especial para facturas - mostrar cliente/chofer
                    if ((tabla === 'factura' || tabla === 'factura_arca') && detailsObj) {
                        const fData = detailsObj.after || detailsObj.before || {};
                        const identificador = fData.cliente_cuit || fData.cuil || '';
                        if (identificador) {
                            previewText = tabla === 'factura_arca' ? `Cliente: ${identificador}` : `Chofer: ${identificador}`;
                        }
                    }

                    // Truncar preview si es muy largo
                    if (previewText.length > 60) {
                        previewText = previewText.substring(0, 60) + '...';
                    }

                    row.innerHTML = `
                        <td>${date}</td>
                        <td>${user}</td>
                        <td>${actionText}</td>
                        <td>
                             <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span class="log-preview" style="color: #555; font-size: 0.9em; margin-right: 10px;">${previewText}</span>
                                <button class="view-details-btn btn btn-primary btn-sm">Ver más</button>
                            </div>
                        </td>
                    `;

                    // Botón Ver más
                    const viewMoreBtn = row.querySelector('.view-details-btn');
                    if (viewMoreBtn) {
                        viewMoreBtn.addEventListener('click', () => {
                            let modalContent = '';
                            const detailsObj = log.details || { before: {}, after: {} };

                            const hasBefore = detailsObj.before && Object.keys(detailsObj.before).length > 0;
                            const hasAfter = detailsObj.after && Object.keys(detailsObj.after).length > 0;

                            // Detectar soft delete (UPDATE con acción Eliminar) o hard delete (DELETE)
                            const isSoftDelete = log.operation === 'UPDATE' && log.action && log.action.toLowerCase().startsWith('eliminar');
                            const isHardDelete = log.operation === 'DELETE';
                            const isDeleteOperation = isSoftDelete || isHardDelete;
                            // Detectar marcar cheque como pagado
                            const isChequePagado = log.action === 'Marcar cheque como pagado';
                            const isOrdenGasoilPagada = log.action === 'Marcar orden gasoil pagada';
                            // Detectar si es una factura con PDF (en after para crear, en before para eliminar)
                            const isFacturaTabla = tabla === 'factura' || tabla === 'factura_arca';
                            const facturaData = isFacturaTabla ? (detailsObj.after && detailsObj.after.factura_pdf ? detailsObj.after : detailsObj.before) : null;
                            const isFacturaConPdf = facturaData && facturaData.factura_pdf;
                            const isFacturaCliente = tabla === 'factura_arca';

                            // Detectar si es carta de porte con PDF
                            const isCartaPorte = tabla === 'carta_porte';
                            const cartaPorteData = isCartaPorte ? (detailsObj.after && detailsObj.after.carta_porte_pdf ? detailsObj.after : detailsObj.before) : null;
                            const isCartaPorteConPdf = cartaPorteData && cartaPorteData.carta_porte_pdf;

                            // Detectar actualización de tarifas CATAC
                            const isCatacUpdate = log.action === 'Actualizar tarifas CATAC';
                            // Detectar cerrar resumen
                            const isCerrarResumen = log.action === 'Cerrar resumen';

                            // Detectar carga de factura proveedor
                            const isCargarFacturaProveedor = log.action === 'Cargar factura (proveedor)';

                            if (isCargarFacturaProveedor) {
                                if (log.related_pagos_gasoil && log.related_pagos_gasoil.length > 0) {
                                    const pago = log.related_pagos_gasoil[0];
                                    const pagoData = pago.data || {};
                                    // Helper para limpiar valores numéricos/moneda
                                    const cleanVal = (v) => {
                                        if (typeof v === 'number') return v;
                                        if (!v) return 0;
                                        return parseFloat(String(v).replace(/[^0-9.-]/g, ''));
                                    };

                                    const litrosVal = cleanVal(pagoData.litros);
                                    const precioVal = cleanVal(pagoData.precio);

                                    // Calcular importe si no existe o es cero
                                    let importe = cleanVal(pagoData.importe);
                                    if ((!importe || importe === 0) && litrosVal > 0 && precioVal > 0) {
                                        importe = litrosVal * precioVal;
                                    }
                                    const impFormatted = importe ? `$${importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : 'N/A';

                                    // Precio para mostrar (evitar doble $)
                                    const precioDisplay = pagoData.precio ? (String(pagoData.precio).includes('$') ? pagoData.precio : `$${pagoData.precio}`) : 'N/A';

                                    // Formatear fecha
                                    let fecha = pagoData.fecha || pago.created_at || 'N/A';
                                    if (fecha !== 'N/A' && !fecha.includes('/')) {
                                        const dateObj = new Date(fecha);
                                        if (!isNaN(dateObj)) {
                                            fecha = dateObj.toLocaleDateString('es-AR');
                                        }
                                    }

                                    const detalleHtml = pagoData.detalle && pagoData.detalle !== '-'
                                        ? `<div><strong style="color: #555;">Detalle:</strong> ${pagoData.detalle}</div>`
                                        : '';

                                    modalContent += `
                                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; margin-bottom: 20px;">
                                        <h4 style="margin-top: 0; color: #007bff; display: flex; align-items: center; gap: 8px;">
                                           <i class="bi bi-fuel-pump"></i> Orden de Gasoil Vinculada
                                        </h4>
                                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 0.95em;">
                                            <div><strong style="color: #555;">Comprobante:</strong> ${pagoData.comprobante || pago.comprobante || 'N/A'}</div>
                                            <div><strong style="color: #555;">Proveedor CUIT:</strong> ${pagoData.proveedor_cuit || pago.proveedor_cuit || 'N/A'}</div>
                                            <div><strong style="color: #555;">Fecha:</strong> ${fecha}</div>
                                            <div><strong style="color: #555;">Litros:</strong> ${pagoData.litros || 'N/A'}</div>
                                            <div><strong style="color: #555;">Precio:</strong> ${precioDisplay}</div>
                                            <div><strong style="color: #555;">Importe:</strong> ${impFormatted}</div>
                                            ${detalleHtml}
                                        </div>
                                    </div>
                                    `;
                                }

                                // Mostrar datos de la factura
                                const facturaData = detailsObj.after || {};

                                if (Object.keys(facturaData).length > 0) {
                                    let cuit = facturaData.cuil;
                                    if (!cuit && log.related_pagos_gasoil && log.related_pagos_gasoil.length > 0) {
                                        cuit = log.related_pagos_gasoil[0].data?.proveedor_cuit || log.related_pagos_gasoil[0].data?.provedor_cuit;
                                    }
                                    cuit = cuit || 'N/A';
                                    modalContent += `
                                    <div style="padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3; margin-top: 15px;">
                                        <h4 style="margin: 0 0 15px; color: #1565c0; display: flex; align-items: center; gap: 8px;">
                                            <i class="bi bi-file-earmark-pdf"></i>
                                            Factura de proveedor
                                        </h4>
                                        <p style="margin: 5px 0;"><strong>Proveedor CUIT:</strong><br>${cuit}</p>
                                        ${facturaData.factura_pdf ? `
                                            <button class="btn-view-factura" 
                                                data-factura-id="${facturaData.id}" 
                                                data-cuil="${cuit}" 
                                                data-type="proveedor"
                                                style="margin-top: 10px; padding: 8px 16px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                                                <i class="bi bi-eye"></i> Ver factura
                                            </button>
                                        ` : ''}
                                    </div>
                                    `;
                                }

                            } else if (isCerrarResumen && log.related_resumen_data) {
                                // Cerrar resumen: mostrar chofer, saldo, viajes y pagos
                                const resumen = log.related_resumen_data;
                                const saldo = parseCurrency(resumen.saldo);
                                const signo = saldo >= 0 ? '+' : '';
                                const saldoColor = saldo >= 0 ? '#28a745' : '#dc3545';
                                const saldoBgColor = saldo >= 0 ? '#d4edda' : '#f8d7da';

                                modalContent += `
                                    <div style="padding: 15px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3; margin-bottom: 15px;">
                                        <h4 style="margin: 0 0 10px; color: #1565c0; display: flex; align-items: center; gap: 8px;">
                                            <i class="bi bi-journal-check"></i>
                                            Resumen cerrado
                                        </h4>
                                        <p style="margin: 5px 0;"><strong>Chofer:</strong> ${resumen.chofer_cuil || 'N/A'}</p>
                                        <p style="margin: 5px 0; padding: 8px; background: ${saldoBgColor}; border-radius: 4px; display: inline-block;">
                                            <strong>Saldo final:</strong> 
                                            <span style="color: ${saldoColor}; font-weight: bold; font-size: 1.1em;">
                                                ${signo}$${Math.abs(saldo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                            </span>
                                        </p>
                                    </div>
                                `;

                                // Viajes incluidos (colapsable)
                                const viajes = resumen.viajes || [];
                                if (viajes.length > 0) {
                                    modalContent += `
                                        <style>
                                            .collapsible-section[open] .chevron-icon { transform: rotate(90deg); }
                                            .collapsible-section[open] .ver-detalle { display: none; }
                                            .collapsible-section:not([open]) .ocultar-texto { display: none; }
                                        </style>
                                        <details class="collapsible-section" style="margin-bottom: 15px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                                            <summary style="padding: 12px 15px; background: #f5f5f5; cursor: pointer; font-weight: 600; color: #333; display: flex; align-items: center; gap: 8px; list-style: none;">
                                                <i class="bi bi-chevron-right chevron-icon" style="transition: transform 0.2s;"></i>
                                                <i class="bi bi-truck"></i> Viajes incluidos (${viajes.length})
                                                <span class="ver-detalle" style="margin-left: auto; font-size: 0.85em; color: #666; font-weight: normal;">Ver detalle</span>
                                                <span class="ocultar-texto" style="margin-left: auto; font-size: 0.85em; color: #666; font-weight: normal;">Ocultar</span>
                                            </summary>
                                            <div style="padding: 10px;">
                                                <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                                                    <thead>
                                                        <tr style="background: #fafafa;">
                                                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Comprobante</th>
                                                            <th style="padding: 8px; text-align: right; border-bottom: 1px solid #ddd;">Importe</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        ${viajes.map(v => {
                                        const tarifa = parseCurrency(v.tarifa);
                                        const variacion = parseFloat(v.variacion || 1);
                                        const importe = tarifa * variacion;
                                        return `
                                                            <tr>
                                                                <td style="padding: 6px 8px; border-bottom: 1px solid #eee;">${v.comprobante || 'N/A'}</td>
                                                                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right;">$${importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        `}).join('')}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </details>
                                    `;
                                }

                                // Pagos incluidos (colapsable)
                                const pagos = resumen.pagos || [];
                                if (pagos.length > 0) {
                                    modalContent += `
                                        <details class="collapsible-section" style="margin-bottom: 15px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
                                            <summary style="padding: 12px 15px; background: #f5f5f5; cursor: pointer; font-weight: 600; color: #333; display: flex; align-items: center; gap: 8px; list-style: none;">
                                                <i class="bi bi-chevron-right chevron-icon" style="transition: transform 0.2s;"></i>
                                                <i class="bi bi-cash-stack"></i> Pagos incluidos (${pagos.length})
                                                <span class="ver-detalle" style="margin-left: auto; font-size: 0.85em; color: #666; font-weight: normal;">Ver detalle</span>
                                                <span class="ocultar-texto" style="margin-left: auto; font-size: 0.85em; color: #666; font-weight: normal;">Ocultar</span>
                                            </summary>
                                            <div style="padding: 10px;">
                                                <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                                                    <thead>
                                                        <tr style="background: #fafafa;">
                                                            <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Comprobante</th>
                                                            <th style="padding: 8px; text-align: right; border-bottom: 1px solid #ddd;">Importe</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        ${pagos.map(p => {
                                        const importe = parseCurrency(p.importe);
                                        return `
                                                            <tr>
                                                                <td style="padding: 6px 8px; border-bottom: 1px solid #eee;">${p.comprobante || 'N/A'}</td>
                                                                <td style="padding: 6px 8px; border-bottom: 1px solid #eee; text-align: right;">$${importe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                        `}).join('')}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </details>
                                    `;
                                }

                                // Pago de saldo (si existe y tiene importe válido)
                                const pagoSaldo = resumen.pago_saldo;
                                const importeSaldo = pagoSaldo ? Math.abs(parseCurrency(pagoSaldo.importe)) : 0;
                                if (pagoSaldo && importeSaldo > 0) {
                                    modalContent += `
                                        <div style="padding: 10px; background: #fff3e0; border-radius: 8px; border-left: 4px solid #ff9800;">
                                            <p style="margin: 0 0 5px; color: #e65100;">
                                                <i class="bi bi-plus-circle"></i>
                                                <strong>Pago de saldo creado:</strong>
                                            </p>
                                            <p style="margin: 0; color: #e65100; padding-left: 20px;">
                                                ${pagoSaldo.detalle || 'Saldo a favor'} - $${importeSaldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                    `;
                                }
                            } else if (isCatacUpdate) {
                                // CATAC: mostrar porcentaje aplicado
                                const catacData = detailsObj.after || detailsObj.before || {};
                                const porcentaje = catacData.porcentaje || '0';
                                const filasAfectadas = catacData.filas_afectadas || '0';
                                const signo = parseFloat(porcentaje) >= 0 ? '+' : '';
                                const color = parseFloat(porcentaje) >= 0 ? '#28a745' : '#dc3545';
                                const bgColor = parseFloat(porcentaje) >= 0 ? '#d4edda' : '#f8d7da';
                                modalContent += `
                                    <div style="padding: 15px; background: ${bgColor}; border-radius: 8px; border-left: 4px solid ${color};">
                                        <h4 style="margin: 0 0 15px; color: ${color}; display: flex; align-items: center; gap: 8px;">
                                            <i class="bi bi-percent"></i>
                                            Tarifas CATAC actualizadas
                                        </h4>
                                        <p style="margin: 5px 0; font-size: 1.2em;"><strong>Porcentaje aplicado:</strong> ${signo}${porcentaje}%</p>
                                        <p style="margin: 5px 0; color: #666;"><strong>Filas afectadas:</strong> ${filasAfectadas}</p>
                                    </div>
                                `;
                            } else if (isChequePagado && hasAfter) {
                                // Cheque pagado: mostrar solo nro e importe
                                const chequeData = detailsObj.after;
                                const nro = chequeData.nro || 'N/A';
                                const importe = chequeData.importe || 'N/A';
                                const destinatario = chequeData.destinatario || '';
                                modalContent += `
                                    <div style="padding: 15px; background: #d4edda; border-radius: 8px; border-left: 4px solid #28a745;">
                                        <h4 style="margin: 0 0 15px; color: #155724; display: flex; align-items: center; gap: 8px;">
                                            <i class="bi bi-check-circle-fill"></i>
                                            Cheque marcado como pagado
                                        </h4>
                                        <p style="margin: 5px 0;"><strong>Nro:</strong> ${nro}</p>
                                        <p style="margin: 5px 0;"><strong>Importe:</strong> ${importe}</p>
                                        ${destinatario ? `<p style="margin: 5px 0;"><strong>Destinatario:</strong> ${destinatario}</p>` : ''}
                                    </div>
                                `;
                            } else if (isOrdenGasoilPagada && hasAfter) {
                                const pagoData = detailsObj.after;
                                const comprobante = pagoData.comprobante || 'N/A';

                                // Calcular importe siempre (forzado) para asegurar validez vs datos corruptos en DB
                                let importeValor = 0;
                                if (pagoData.litros && pagoData.precio) {
                                    // Lógica clean robusta: Detectar separador decimal por posición
                                    const cleanNum = (v) => {
                                        let s = String(v).replace(/[^0-9.,-]/g, '');
                                        const lastDot = s.lastIndexOf('.');
                                        const lastComma = s.lastIndexOf(',');

                                        // Si hay ambos, el último es el decimal
                                        if (lastDot > -1 && lastComma > -1) {
                                            if (lastDot > lastComma) {
                                                // Formato US: 1,450.00 -> Borrar comas
                                                s = s.replace(/,/g, '');
                                            } else {
                                                // Formato AR: 1.450,00 -> Borrar puntos, cambiar coma
                                                s = s.replace(/\./g, '').replace(',', '.');
                                            }
                                        }
                                        // Si solo hay coma, asumimos decimal AR (145,50)
                                        else if (lastComma > -1) {
                                            s = s.replace(',', '.');
                                        }
                                        // Si solo hay punto, lo dejamos (parseFloat maneja 145.50)

                                        return parseFloat(s) || 0;
                                    };
                                    const l = cleanNum(pagoData.litros);
                                    const p = cleanNum(pagoData.precio);
                                    importeValor = l * p;
                                } else {
                                    // Fallback al importe guardado
                                    const cleanSimple = (v) => parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 0;
                                    importeValor = cleanSimple(pagoData.importe);
                                }

                                const impFormatted = `$${importeValor.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

                                // Formatear fecha
                                let fechaRaw = pagoData.fecha || pagoData.created_at || log.timestamp;
                                let fecha = 'N/A';
                                if (fechaRaw) {
                                    const d = new Date(fechaRaw);
                                    if (!isNaN(d)) fecha = d.toLocaleDateString('es-AR');
                                }

                                const debugInfo = `Raw L:${pagoData.litros} P:${pagoData.precio} I_Calc:${importeValor}`;

                                modalContent += `
                                    <div style="padding: 15px; background: #d4edda; border-radius: 8px; border-left: 4px solid #28a745;">
                                        <h4 style="margin: 0 0 15px; color: #155724; display: flex; align-items: center; gap: 8px;">
                                            <i class="bi bi-check-circle-fill"></i>
                                            Orden de gasoil marcada como pagada
                                        </h4>
                                        <p style="margin: 5px 0;"><strong>Comprobante:</strong> ${comprobante}</p>
                                        <p style="margin: 5px 0;"><strong>Fecha:</strong> ${fecha}</p>
                                        <p style="margin: 5px 0;" title="${debugInfo}"><strong>Importe:</strong> ${impFormatted}</p>
                                    </div>
                                `;
                            } else if (isFacturaConPdf) {
                                // Factura con PDF: mostrar info y botón para ver
                                const clienteCuit = facturaData.cliente_cuit || facturaData.cuil || 'N/A';
                                const facturaId = facturaData.id;
                                const tipoFactura = isFacturaCliente ? 'Factura de cliente' : 'Factura de chofer';
                                const bgColor = isDeleteOperation ? '#f8d7da' : '#e3f2fd';
                                const borderColor = isDeleteOperation ? '#dc3545' : '#2196f3';
                                const titleColor = isDeleteOperation ? '#721c24' : '#1565c0';
                                const iconClass = isDeleteOperation ? 'bi-file-earmark-x' : 'bi-file-earmark-pdf';

                                modalContent += `
                                    <div style="padding: 15px; background: ${bgColor}; border-radius: 8px; border-left: 4px solid ${borderColor};">
                                        <h4 style="margin: 0 0 15px; color: ${titleColor}; display: flex; align-items: center; gap: 8px;">
                                            <i class="bi ${iconClass}"></i>
                                            ${isDeleteOperation ? 'Factura eliminada' : tipoFactura}
                                        </h4>
                                        <p style="margin: 5px 0;"><strong>${isFacturaCliente ? 'Cliente CUIT:' : 'Chofer CUIL:'}</strong> ${clienteCuit}</p>
                                        ${!isDeleteOperation && facturaId ? `
                                            <button class="btn-view-factura" data-factura-id="${facturaId}" data-cuil="${clienteCuit}" data-type="${isFacturaCliente ? 'viajeCliente' : 'viaje'}" 
                                                style="margin-top: 10px; padding: 8px 16px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                                                <i class="bi bi-eye"></i> Ver factura
                                            </button>
                                        ` : ''}
                                        ${isDeleteOperation ? '<p style="margin-top: 10px; color: #856404; font-style: italic;">El documento fue eliminado y ya no está disponible.</p>' : ''}
                                    </div>
                                `;
                            } else if (isCartaPorteConPdf) {
                                // Carta de porte con PDF: mostrar info y botón para ver
                                const viajeComprobante = cartaPorteData.viaje_comprobante || 'N/A';
                                const viajeData = log.related_viaje_data;
                                const clienteCuit = viajeData?.cliente_cuit || 'N/A';
                                const bgColor = isDeleteOperation ? '#f8d7da' : '#e8f5e9';
                                const borderColor = isDeleteOperation ? '#dc3545' : '#4caf50';
                                const titleColor = isDeleteOperation ? '#721c24' : '#2e7d32';
                                const iconClass = isDeleteOperation ? 'bi-file-earmark-x' : 'bi-file-earmark-text';

                                modalContent += `
                                    <div style="padding: 15px; background: ${bgColor}; border-radius: 8px; border-left: 4px solid ${borderColor};">
                                        <h4 style="margin: 0 0 15px; color: ${titleColor}; display: flex; align-items: center; gap: 8px;">
                                            <i class="bi ${iconClass}"></i>
                                            ${isDeleteOperation ? 'Carta de porte eliminada' : 'Carta de porte'}
                                        </h4>
                                        <p style="margin: 5px 0;"><strong>Viaje:</strong> ${viajeComprobante}</p>
                                        <p style="margin: 5px 0;"><strong>CUIT:</strong> ${clienteCuit}</p>
                                        ${!isDeleteOperation ? `
                                            <button class="btn-view-carta-porte" data-viaje-comprobante="${viajeComprobante}" 
                                                style="margin-top: 10px; padding: 8px 16px; background: #388e3c; color: white; border: none; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                                                <i class="bi bi-eye"></i> Ver carta de porte
                                            </button>
                                        ` : '<p style="margin-top: 10px; color: #856404; font-style: italic;">El documento fue eliminado y ya no está disponible.</p>'}
                                    </div>
                                `;

                                // Agregar viaje vinculado (mismo formato que facturas)
                                // viajeData ya está declarado arriba
                                if (viajeComprobante && viajeComprobante !== 'N/A') {
                                    const isCartaPorteEliminada = isDeleteOperation;
                                    const bgColorViaje = isCartaPorteEliminada ? '#ffebee' : '#e3f2fd';
                                    const borderColorViaje = isCartaPorteEliminada ? '#f44336' : '#2196f3';
                                    const textColorViaje = isCartaPorteEliminada ? '#c62828' : '#1565c0';
                                    const actionTextViaje = isCartaPorteEliminada ? 'desvinculado de' : 'vinculado a';

                                    modalContent += `
                                        <div style="margin-top: 20px; padding: 15px; background: ${bgColorViaje}; border-radius: 8px; border-left: 4px solid ${borderColorViaje};">
                                            <h4 style="margin: 0 0 10px; color: ${textColorViaje}; display: flex; align-items: center; gap: 8px;">
                                                <i class="bi bi-link-45deg"></i>
                                                1 viaje ${actionTextViaje} esta carta de porte
                                            </h4>
                                            <ul style="list-style: none; padding: 0; margin: 0;" id="related-viajes-carta-porte">
                                                <li style="padding: 8px 12px; background: white; border-radius: 4px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                                                    <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                        <strong>Comprobante:</strong> ${viajeComprobante}
                                                    </span>
                                                    <button class="btn btn-primary btn-sm btn-view-viaje-carta-porte" data-viaje-comprobante="${viajeComprobante}" style="padding: 4px 10px; font-size: 0.85em; flex-shrink: 0; margin-left: auto;">
                                                        Ver detalle
                                                    </button>
                                                </li>
                                            </ul>
                                        </div>
                                    `;
                                }
                            } else if ((isSoftDelete || isHardDelete) && hasBefore) {
                                // Delete: mostrar datos eliminados solo si hay datos después de filtrar
                                const filteredBefore = filtrarDatos(detailsObj.before, tabla);
                                if (Object.keys(filteredBefore).length > 0) {
                                    modalContent += '<h4 style="margin: 15px 0 5px; color: #333;">Datos eliminados</h4>';
                                    modalContent += formatDataToHTML(filteredBefore);
                                }
                                // Si es factura y no hay datos, no mostrar nada (los viajes se muestran después)
                            } else if (hasBefore && hasAfter) {
                                // UPDATE: separar datos comunes de cambios
                                const beforeFiltered = filtrarDatos(detailsObj.before, tabla);
                                const afterFiltered = filtrarDatos(detailsObj.after, tabla);

                                // Combinar con datos del chofer si existen
                                const choferData = log.related_chofer_data;
                                let choferBeforeFiltered = {};
                                let choferAfterFiltered = {};
                                if (choferData) {
                                    if (choferData.before && Object.keys(choferData.before).length > 0) {
                                        choferBeforeFiltered = filtrarDatos(choferData.before, 'chofer');
                                    }
                                    if (choferData.after && Object.keys(choferData.after).length > 0) {
                                        choferAfterFiltered = filtrarDatos(choferData.after, 'chofer');
                                    }
                                }

                                const common = {};
                                const changedBefore = {};
                                const changedAfter = {};

                                // Encontrar campos comunes (sin cambios) y campos que cambiaron - Usuario
                                const allKeys = new Set([...Object.keys(beforeFiltered), ...Object.keys(afterFiltered)]);
                                allKeys.forEach(key => {
                                    const beforeVal = JSON.stringify(beforeFiltered[key]);
                                    const afterVal = JSON.stringify(afterFiltered[key]);

                                    if (beforeVal === afterVal) {
                                        common[key] = afterFiltered[key];
                                    } else {
                                        if (beforeFiltered[key] !== undefined) changedBefore[key] = beforeFiltered[key];
                                        if (afterFiltered[key] !== undefined) changedAfter[key] = afterFiltered[key];
                                    }
                                });

                                // Encontrar campos comunes (sin cambios) y campos que cambiaron - Chofer
                                const choferKeys = new Set([...Object.keys(choferBeforeFiltered), ...Object.keys(choferAfterFiltered)]);
                                choferKeys.forEach(key => {
                                    const beforeVal = JSON.stringify(choferBeforeFiltered[key]);
                                    const afterVal = JSON.stringify(choferAfterFiltered[key]);

                                    if (beforeVal === afterVal) {
                                        common[key] = choferAfterFiltered[key];
                                    } else {
                                        if (choferBeforeFiltered[key] !== undefined) changedBefore[key] = choferBeforeFiltered[key];
                                        if (choferAfterFiltered[key] !== undefined) changedAfter[key] = choferAfterFiltered[key];
                                    }
                                });

                                // Mostrar datos comunes primero
                                if (Object.keys(common).length > 0) {
                                    modalContent += '<h4 style="margin: 15px 0 5px; color: #333;">Información</h4>';
                                    modalContent += formatDataToHTML(common);
                                }

                                // Mostrar cambios
                                if (Object.keys(changedBefore).length > 0 || Object.keys(changedAfter).length > 0) {
                                    modalContent += `
                                        <div style="margin-top: 15px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                                            <h4 style="margin: 0 0 10px; color: #856404; display: flex; align-items: center; gap: 8px;">
                                                <i class="bi bi-pencil-square"></i>
                                                Cambios realizados
                                            </h4>
                                    `;

                                    if (Object.keys(changedBefore).length > 0) {
                                        modalContent += '<p style="margin: 10px 0 5px; font-weight: bold; color: #dc3545;">Antes:</p>';
                                        modalContent += formatDataToHTML(changedBefore);
                                    }

                                    if (Object.keys(changedAfter).length > 0) {
                                        modalContent += '<p style="margin: 10px 0 5px; font-weight: bold; color: #28a745;">Después:</p>';
                                        modalContent += formatDataToHTML(changedAfter);
                                    }

                                    modalContent += '</div>';
                                } else {
                                    modalContent += '<p style="color: #999; font-style: italic; margin-top: 15px;">No se detectaron cambios en los datos visibles.</p>';
                                }
                            } else if (hasAfter) {
                                // INSERT: combinar datos de usuario y chofer
                                const choferData = log.related_chofer_data;
                                const combinedData = { ...filtrarDatos(detailsObj.after, tabla) };

                                // Si hay datos del chofer, combinarlos
                                if (choferData && choferData.after && Object.keys(choferData.after).length > 0) {
                                    Object.assign(combinedData, filtrarDatos(choferData.after, 'chofer'));
                                    // Eliminar cuil duplicado si existe
                                    delete combinedData.cuil;
                                    // Agregar cuil al principio
                                    const cuil = detailsObj.after.cuil || (choferData.after && choferData.after.cuil);
                                    if (cuil) {
                                        const temp = { cuil, ...combinedData };
                                        Object.keys(combinedData).forEach(k => delete combinedData[k]);
                                        Object.assign(combinedData, temp);
                                    }
                                    modalContent += '<h4 style="margin: 15px 0 5px; color: #333;">Datos del Chofer</h4>';
                                } else {
                                    modalContent += '<h4 style="margin: 15px 0 5px; color: #333;">Datos</h4>';
                                }

                                modalContent += formatDataToHTML(combinedData);
                            } else if (hasBefore) {
                                // DELETE: solo datos
                                modalContent += '<h4 style="margin: 15px 0 5px; color: #333;">Datos eliminados</h4>';
                                modalContent += formatDataToHTML(filtrarDatos(detailsObj.before, tabla));
                            } else {
                                modalContent = '<p style="color: #999; font-style: italic;">No hay detalles disponibles.</p>';
                            }
                            // Mostrar viajes asociados para clientes si existen
                            const relatedClientes = log.related_viaje_clientes;
                            if (relatedClientes && Array.isArray(relatedClientes) && relatedClientes.length > 0) {
                                const numClientes = relatedClientes.length;
                                const clienteWord = numClientes === 1 ? 'cliente' : 'clientes';
                                const siguienteWord = numClientes === 1 ? 'el siguiente cliente' : 'los siguientes clientes';

                                // Detectar si es soft delete (cualquier viaje_cliente tiene is_soft_delete)
                                const hasSoftDelete = relatedClientes.some(vc => vc.is_soft_delete);
                                const isUpdate = log.operation === 'UPDATE' && !hasSoftDelete;

                                let actionWord, actionVerb, bgColor, borderColor, textColor;
                                if (hasSoftDelete) {
                                    actionWord = 'eliminado';
                                    actionVerb = 'eliminó';
                                    bgColor = '#ffebee';
                                    borderColor = '#f44336';
                                    textColor = '#c62828';
                                } else if (isUpdate) {
                                    actionWord = 'editado';
                                    actionVerb = 'editó';
                                    bgColor = '#fff3e0';
                                    borderColor = '#ff9800';
                                    textColor = '#e65100';
                                } else {
                                    actionWord = 'creado';
                                    actionVerb = 'creó';
                                    bgColor = '#e8f5e9';
                                    borderColor = '#4caf50';
                                    textColor = '#2e7d32';
                                }

                                modalContent += `
                                    <div style="margin-top: 20px; padding: 15px; background: ${bgColor}; border-radius: 8px; border-left: 4px solid ${borderColor};">
                                        <h4 style="margin: 0 0 10px; color: ${textColor}; display: flex; align-items: center; gap: 8px;">
                                            <i class="bi bi-link-45deg"></i>
                                            Viaje asociado ${actionWord} para ${clienteWord}
                                        </h4>
                                        <p style="margin: 0 0 10px; color: #555; font-size: 0.9em;">
                                            Esta operación también ${actionVerb} un viaje para ${siguienteWord}:
                                        </p>
                                        <ul style="list-style: none; padding: 0; margin: 0;" id="related-clientes-list">
                                            ${relatedClientes.map((vc, idx) => `
                                                <li style="padding: 8px 12px; background: white; border-radius: 4px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                                                    <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                        <strong>Cliente CUIT:</strong> ${vc.cliente_cuit || 'N/A'}
                                                    </span>
                                                    <button class="btn btn-primary btn-sm btn-view-related" data-index="${idx}" style="padding: 4px 10px; font-size: 0.85em; flex-shrink: 0; margin-left: auto;">
                                                        Ver detalle
                                                    </button>
                                                </li>
                                            `).join('')}
                                        </ul>
                                    </div>
                                `;
                            }

                            // Mostrar viajes vinculados para facturas si existen
                            const relatedViajes = log.related_viajes;
                            if (relatedViajes && Array.isArray(relatedViajes) && relatedViajes.length > 0) {
                                const numViajes = relatedViajes.length;
                                const viajeWord = numViajes === 1 ? 'viaje' : 'viajes';
                                const isFacturaEliminada = isDeleteOperation;
                                const bgColor = isFacturaEliminada ? '#ffebee' : '#e3f2fd';
                                const borderColor = isFacturaEliminada ? '#f44336' : '#2196f3';
                                const textColor = isFacturaEliminada ? '#c62828' : '#1565c0';
                                const actionText = isFacturaEliminada ? 'desvinculado' : 'vinculado';

                                modalContent += `
                                    <div style="margin-top: 20px; padding: 15px; background: ${bgColor}; border-radius: 8px; border-left: 4px solid ${borderColor};">
                                        <h4 style="margin: 0 0 10px; color: ${textColor}; display: flex; align-items: center; gap: 8px;">
                                            <i class="bi bi-link-45deg"></i>
                                            ${numViajes} ${viajeWord} ${actionText}${numViajes > 1 ? 's' : ''} ${isFacturaEliminada ? 'de' : 'a'} esta factura
                                        </h4>
                                        <ul style="list-style: none; padding: 0; margin: 0;" id="related-viajes-list">
                                            ${relatedViajes.map((v, idx) => `
                                                <li style="padding: 8px 12px; background: white; border-radius: 4px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                                                    <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                        <strong>Comprobante:</strong> ${v.comprobante || 'N/A'}
                                                    </span>
                                                    <button class="btn btn-primary btn-sm btn-view-viaje" data-viaje-index="${idx}" style="padding: 4px 10px; font-size: 0.85em; flex-shrink: 0; margin-left: auto;">
                                                        Ver detalle
                                                    </button>
                                                </li>
                                            `).join('')}
                                        </ul>
                                    </div>
                                `;
                            }
                            jsonContent.innerHTML = modalContent;

                            // Agregar event listeners para los botones de ver detalle de viajes relacionados
                            if (relatedClientes && relatedClientes.length > 0) {
                                const relatedBtns = jsonContent.querySelectorAll('.btn-view-related');
                                relatedBtns.forEach(btn => {
                                    btn.addEventListener('click', () => {
                                        const idx = parseInt(btn.dataset.index);
                                        const vc = relatedClientes[idx];
                                        if (vc && (vc.after || vc.before)) {
                                            let vcContent = '';

                                            // Detectar soft delete
                                            if (vc.is_soft_delete) {
                                                vcContent += '<h4 style="margin: 15px 0 5px; color: #c62828;">Datos del viaje eliminado</h4>';
                                                vcContent += formatDataToHTML(filtrarDatos(vc.before, 'viaje_cliente'));
                                            } else if (vc.operation === 'UPDATE' && vc.before && Object.keys(vc.before).length > 0 && vc.after && Object.keys(vc.after).length > 0) {
                                                // UPDATE normal: mostrar datos comunes y cambios
                                                vcContent += '<h4 style="margin: 15px 0 5px; color: #333;">Detalle del viaje para cliente</h4>';
                                                const vcBeforeFiltered = filtrarDatos(vc.before, 'viaje_cliente');
                                                const vcAfterFiltered = filtrarDatos(vc.after, 'viaje_cliente');

                                                const vcCommon = {};
                                                const vcChangedBefore = {};
                                                const vcChangedAfter = {};

                                                const vcAllKeys = new Set([...Object.keys(vcBeforeFiltered), ...Object.keys(vcAfterFiltered)]);
                                                vcAllKeys.forEach(key => {
                                                    if (JSON.stringify(vcBeforeFiltered[key]) === JSON.stringify(vcAfterFiltered[key])) {
                                                        vcCommon[key] = vcAfterFiltered[key];
                                                    } else {
                                                        if (vcBeforeFiltered[key] !== undefined) vcChangedBefore[key] = vcBeforeFiltered[key];
                                                        if (vcAfterFiltered[key] !== undefined) vcChangedAfter[key] = vcAfterFiltered[key];
                                                    }
                                                });

                                                if (Object.keys(vcCommon).length > 0) {
                                                    vcContent += '<h5 style="margin: 10px 0 5px; color: #555;">Información</h5>';
                                                    vcContent += formatDataToHTML(vcCommon);
                                                }

                                                if (Object.keys(vcChangedBefore).length > 0 || Object.keys(vcChangedAfter).length > 0) {
                                                    vcContent += `
                                                        <div style="margin-top: 15px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;">
                                                            <h5 style="margin: 0 0 10px; color: #856404;">Cambios realizados</h5>
                                                    `;
                                                    if (Object.keys(vcChangedBefore).length > 0) {
                                                        vcContent += '<p style="margin: 10px 0 5px; font-weight: bold; color: #dc3545;">Antes:</p>';
                                                        vcContent += formatDataToHTML(vcChangedBefore);
                                                    }
                                                    if (Object.keys(vcChangedAfter).length > 0) {
                                                        vcContent += '<p style="margin: 10px 0 5px; font-weight: bold; color: #28a745;">Después:</p>';
                                                        vcContent += formatDataToHTML(vcChangedAfter);
                                                    }
                                                    vcContent += '</div>';
                                                } else {
                                                    vcContent += '<p style="color: #999; font-style: italic;">No se detectaron cambios.</p>';
                                                }
                                            } else if (vc.after && Object.keys(vc.after).length > 0) {
                                                vcContent += formatDataToHTML(filtrarDatos(vc.after, 'viaje_cliente'));
                                            } else if (vc.before && Object.keys(vc.before).length > 0) {
                                                vcContent += formatDataToHTML(filtrarDatos(vc.before, 'viaje_cliente'));
                                            }

                                            vcContent += `
                                                <button class="btn btn-secondary btn-sm btn-back-to-main" style="margin-top: 15px;">
                                                    <i class="bi bi-arrow-left"></i> Volver
                                                </button>
                                            `;

                                            // Guardar contenido actual para poder volver
                                            const previousContent = jsonContent.innerHTML;
                                            jsonContent.innerHTML = vcContent;

                                            // Botón para volver
                                            const backBtn = jsonContent.querySelector('.btn-back-to-main');
                                            if (backBtn) {
                                                backBtn.addEventListener('click', () => {
                                                    jsonContent.innerHTML = previousContent;
                                                    // Re-agregar event listeners después de volver
                                                    const newRelatedBtns = jsonContent.querySelectorAll('.btn-view-related');
                                                    newRelatedBtns.forEach((newBtn, newIdx) => {
                                                        newBtn.addEventListener('click', () => {
                                                            const vcItem = relatedClientes[newIdx];
                                                            if (vcItem && (vcItem.after || vcItem.before)) {
                                                                let vcItemContent = '<h4 style="margin: 15px 0 5px; color: #333;">Detalle del viaje para cliente</h4>';
                                                                if (vcItem.operation === 'UPDATE' && vcItem.before && Object.keys(vcItem.before).length > 0 && vcItem.after && Object.keys(vcItem.after).length > 0) {
                                                                    const vcItemBeforeFiltered = filtrarDatos(vcItem.before, 'viaje_cliente');
                                                                    const vcItemAfterFiltered = filtrarDatos(vcItem.after, 'viaje_cliente');
                                                                    const vcItemCommon = {};
                                                                    const vcItemChangedBefore = {};
                                                                    const vcItemChangedAfter = {};
                                                                    const vcItemAllKeys = new Set([...Object.keys(vcItemBeforeFiltered), ...Object.keys(vcItemAfterFiltered)]);
                                                                    vcItemAllKeys.forEach(key => {
                                                                        if (JSON.stringify(vcItemBeforeFiltered[key]) === JSON.stringify(vcItemAfterFiltered[key])) {
                                                                            vcItemCommon[key] = vcItemAfterFiltered[key];
                                                                        } else {
                                                                            if (vcItemBeforeFiltered[key] !== undefined) vcItemChangedBefore[key] = vcItemBeforeFiltered[key];
                                                                            if (vcItemAfterFiltered[key] !== undefined) vcItemChangedAfter[key] = vcItemAfterFiltered[key];
                                                                        }
                                                                    });
                                                                    if (Object.keys(vcItemCommon).length > 0) {
                                                                        vcItemContent += '<h5 style="margin: 10px 0 5px; color: #555;">Información</h5>';
                                                                        vcItemContent += formatDataToHTML(vcItemCommon);
                                                                    }
                                                                    if (Object.keys(vcItemChangedBefore).length > 0 || Object.keys(vcItemChangedAfter).length > 0) {
                                                                        vcItemContent += '<div style="margin-top: 15px; padding: 15px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107;"><h5 style="margin: 0 0 10px; color: #856404;">Cambios realizados</h5>';
                                                                        if (Object.keys(vcItemChangedBefore).length > 0) {
                                                                            vcItemContent += '<p style="margin: 10px 0 5px; font-weight: bold; color: #dc3545;">Antes:</p>';
                                                                            vcItemContent += formatDataToHTML(vcItemChangedBefore);
                                                                        }
                                                                        if (Object.keys(vcItemChangedAfter).length > 0) {
                                                                            vcItemContent += '<p style="margin: 10px 0 5px; font-weight: bold; color: #28a745;">Después:</p>';
                                                                            vcItemContent += formatDataToHTML(vcItemChangedAfter);
                                                                        }
                                                                        vcItemContent += '</div>';
                                                                    }
                                                                } else if (vcItem.after && Object.keys(vcItem.after).length > 0) {
                                                                    vcItemContent += formatDataToHTML(filtrarDatos(vcItem.after, 'viaje_cliente'));
                                                                }
                                                                vcItemContent += `
                                                                    <button class="btn btn-secondary btn-sm btn-back-to-main" style="margin-top: 15px;">
                                                                        <i class="bi bi-arrow-left"></i> Volver
                                                                    </button>
                                                                `;
                                                                const currentContent = jsonContent.innerHTML;
                                                                jsonContent.innerHTML = vcItemContent;
                                                                const newBackBtn = jsonContent.querySelector('.btn-back-to-main');
                                                                if (newBackBtn) {
                                                                    newBackBtn.addEventListener('click', () => {
                                                                        jsonContent.innerHTML = currentContent;
                                                                    });
                                                                }
                                                            }
                                                        });
                                                    });
                                                });
                                            }
                                        }
                                    });
                                });
                            }

                            // Agregar event listeners para los botones de ver detalle de viajes vinculados a facturas
                            if (relatedViajes && relatedViajes.length > 0) {
                                // Función para adjuntar event listeners a los botones de viaje
                                const attachViajeListeners = (mainContent) => {
                                    const viajeBtns = jsonContent.querySelectorAll('.btn-view-viaje');
                                    viajeBtns.forEach(btn => {
                                        btn.addEventListener('click', () => {
                                            const idx = parseInt(btn.getAttribute('data-viaje-index'));
                                            const viaje = relatedViajes[idx];
                                            if (viaje && viaje.data) {
                                                let viajeContent = '<h4 style="margin: 15px 0 5px; color: #333;">Detalle del viaje vinculado</h4>';
                                                viajeContent += formatDataToHTML(filtrarDatos(viaje.data, 'viaje'));
                                                viajeContent += `
                                                    <button class="btn btn-secondary btn-sm btn-back-to-main" style="margin-top: 15px;">
                                                        <i class="bi bi-arrow-left"></i> Volver
                                                    </button>
                                                `;
                                                jsonContent.innerHTML = viajeContent;
                                                const backBtn = jsonContent.querySelector('.btn-back-to-main');
                                                if (backBtn) {
                                                    backBtn.addEventListener('click', () => {
                                                        jsonContent.innerHTML = mainContent;
                                                        // Re-attach event listeners recursivamente
                                                        attachViajeListeners(mainContent);
                                                    });
                                                }
                                            }
                                        });
                                    });
                                };
                                // Guardar el contenido principal y adjuntar listeners
                                const mainModalContent = jsonContent.innerHTML;
                                attachViajeListeners(mainModalContent);
                            }

                            // Listener para botón de ver carta de porte
                            const cartaPorteBtn = jsonContent.querySelector('.btn-view-carta-porte');
                            if (cartaPorteBtn) {
                                cartaPorteBtn.addEventListener('click', async () => {
                                    const viajeComprobante = cartaPorteBtn.getAttribute('data-viaje-comprobante');
                                    if (viajeComprobante) {
                                        try {
                                            const response = await getCartaPorte(null, viajeComprobante);
                                            if (response && response.ok) {
                                                const blob = await response.blob();
                                                const url = window.URL.createObjectURL(blob);
                                                window.open(url, '_blank');
                                            } else {
                                                alert('No se pudo cargar la carta de porte (puede haber sido eliminada)');
                                            }
                                        } catch (error) {
                                            console.error('Error al obtener carta de porte:', error);
                                            alert('Error al obtener la carta de porte');
                                        }
                                    }
                                });
                            }

                            // Listener para botón de ver viaje vinculado desde carta de porte
                            const viajeCartaPorteBtn = jsonContent.querySelector('.btn-view-viaje-carta-porte');
                            if (viajeCartaPorteBtn) {
                                viajeCartaPorteBtn.addEventListener('click', () => {
                                    const viajeData = log.related_viaje_data;
                                    if (viajeData) {
                                        // Mostrar info del viaje en el modal (igual que facturas)
                                        const previousContent = jsonContent.innerHTML;
                                        let viajeContent = '<h4 style="margin: 15px 0 5px; color: #333;">Detalle del viaje vinculado</h4>';
                                        viajeContent += formatDataToHTML(viajeData);
                                        viajeContent += `
                                            <button class="btn btn-secondary btn-sm btn-back-to-main" style="margin-top: 15px;">
                                                <i class="bi bi-arrow-left"></i> Volver
                                            </button>
                                        `;
                                        jsonContent.innerHTML = viajeContent;
                                        const backBtn = jsonContent.querySelector('.btn-back-to-main');
                                        if (backBtn) {
                                            backBtn.addEventListener('click', () => {
                                                jsonContent.innerHTML = previousContent;
                                                // Re-attach listeners
                                                const newCartaPorteBtn = jsonContent.querySelector('.btn-view-carta-porte');
                                                if (newCartaPorteBtn) {
                                                    newCartaPorteBtn.addEventListener('click', async () => {
                                                        const vc = newCartaPorteBtn.getAttribute('data-viaje-comprobante');
                                                        if (vc) {
                                                            const response = await getCartaPorte(null, vc);
                                                            if (response && response.ok) {
                                                                const blob = await response.blob();
                                                                window.open(window.URL.createObjectURL(blob), '_blank');
                                                            }
                                                        }
                                                    });
                                                }
                                            });
                                        }
                                    }
                                });
                            }
                            // Agregar event listener para ver factura PDF
                            if (isFacturaConPdf) {
                                const pdfBtn = jsonContent.querySelector('.btn-view-pdf');
                                if (pdfBtn) {
                                    pdfBtn.addEventListener('click', async () => {
                                        const facturaId = facturaData.id;
                                        const cuil = facturaData.cuil;
                                        if (facturaId && cuil) {
                                            try {
                                                const response = await getFactura(cuil, facturaId);
                                                if (response && response.ok) {
                                                    const blob = await response.blob();
                                                    const url = window.URL.createObjectURL(blob);
                                                    window.open(url, '_blank');
                                                } else {
                                                    alert('No se pudo cargar la factura (puede haber sido eliminada)');
                                                }
                                            } catch (error) {
                                                console.error('Error al obtener factura:', error);
                                                alert('Error al obtener la factura');
                                            }
                                        }
                                    });
                                }

                                // Listener para botón de ver factura específico (facturas de cliente)
                                const facturaBtn = jsonContent.querySelector('.btn-view-factura');
                                if (facturaBtn) {
                                    facturaBtn.addEventListener('click', async () => {
                                        const id = facturaBtn.getAttribute('data-factura-id');
                                        const cuil = facturaBtn.getAttribute('data-cuil');
                                        const type = facturaBtn.getAttribute('data-type');
                                        if (id && cuil) {
                                            try {
                                                const response = await getFactura(cuil, id, null, type);
                                                if (response && response.ok) {
                                                    const blob = await response.blob();
                                                    const url = window.URL.createObjectURL(blob);
                                                    window.open(url, '_blank');
                                                } else {
                                                    alert('No se pudo cargar la factura (puede haber sido eliminada)');
                                                }
                                            } catch (error) {
                                                console.error('Error al obtener factura:', error);
                                                alert('Error al obtener la factura');
                                            }
                                        }
                                    });
                                }
                            }
                            modal.classList.remove('hidden');
                            modal.classList.add('active');
                        });
                    }

                    tableBody.appendChild(row);
                });

                // Manejar visibilidad del botón "Cargar más"
                if (logs.length < limit) {
                    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
                } else {
                    if (loadMoreBtn) loadMoreBtn.style.display = 'inline-block';
                }

            } else {
                if (!append) {
                    tableBody.innerHTML = `<tr><td->No hay actividad registrada aún.</td></tr>`;
                }
                if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            }
        } catch (error) {
            console.error("Error cargando logs:", error);
            if (!append) {
                tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; color: red;">Error al cargar los registros.</td></tr>`;
            }
        } finally {
            if (!append) toggleSpinnerVisible(content);
            isLoading = false;
            if (loadMoreBtn) {
                loadMoreBtn.textContent = 'Cargar más registros';
                loadMoreBtn.disabled = false;
            }
        }
    };

    // Función para formatear bonito
    const formatDataToHTML = (data) => {
        if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
            return '<p style="color: #999;">Sin datos</p>';
        }
        if (typeof data !== 'object') {
            return `<span style="color: #d14;">"${String(data)}"</span>`;
        }

        let html = '<ul style="list-style: none; padding-left: 0; margin: 8px 0; text-align: left;">';
        Object.entries(data).forEach(([key, value]) => {
            const niceKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            html += `<li style="margin-bottom: 8px;">
                <strong style="color: #905;">${niceKey}:</strong> 
                ${typeof value === 'object' ? formatDataToHTML(value) : `<span style="color: #d14;">${value}</span>`}
            </li>`;
        });
        html += '</ul>';
        return html;
    };

    loadLogs();
});