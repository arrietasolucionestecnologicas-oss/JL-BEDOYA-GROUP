/* JLB OPERACIONES - APP.JS (V23.5 - STABLE) */

// =============================================================
// 1. CONFIGURACIÓN
// =============================================================
const API_ENDPOINT = "https://script.google.com/macros/s/AKfycbzdW332Skk5Po7SHLzOddgzLe2Am3WyPpQ6B9bYJI08Nz9sk8kAmWAX28HvAv3BFk-15A/exec";

// =============================================================
// 2. ADAPTADOR
// =============================================================
class GasRunner {
    constructor() {
        this._successHandler = null;
        this._failureHandler = null;
        return new Proxy(this, {
            get: (target, prop, receiver) => {
                if (prop in target || typeof prop === 'symbol') { return target[prop]; }
                if (prop === 'withSuccessHandler') { return (cb) => { target._successHandler = cb; return receiver; }; }
                if (prop === 'withFailureHandler') { return (cb) => { target._failureHandler = cb; return receiver; }; }
                return (...args) => { const payload = args[0] || {}; target._execute(prop, payload); };
            }
        });
    }
    _execute(actionName, payload) {
        const requestBody = JSON.stringify({ action: actionName, payload: payload });
        fetch(API_ENDPOINT, {
            method: 'POST', redirect: 'follow', headers: { "Content-Type": "text/plain;charset=utf-8" }, body: requestBody
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'error') {
                if (this._failureHandler) this._failureHandler(data.message);
            } else {
                if (this._successHandler) this._successHandler((data.data !== undefined) ? data.data : data);
            }
        })
        .catch(error => { if (this._failureHandler) this._failureHandler(error.toString()); });
    }
}
const google = { script: { get run() { return new GasRunner(); } } };

// =============================================================
// 3. LÓGICA DE NEGOCIO
// =============================================================

let datosProg=[], datosEntradas=[], datosAlq=[], dbClientes = [], tareasCache = [];
let alqFotosNuevas = []; 
let listaReqTemp = []; // Lista temporal para requerimientos
let historialReqCache = []; // Cache para el botón de copiar y enviar
let canvas, ctx, isDrawing=false, indiceActual=-1;

window.onload = function() { 
    if(typeof lucide !== 'undefined') lucide.createIcons();
    if(document.getElementById('wrapper-operaciones')) {
        nav('programacion');
        google.script.run.withSuccessHandler(d => { dbClientes = d; actualizarDatalistClientes(); }).obtenerClientesDB();
    }
};

function nav(id) { 
    document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active')); 
    const sec = document.getElementById(id); if(sec) sec.classList.add('active'); 
    const headerTitle = document.getElementById('header-title');
    if(headerTitle) headerTitle.innerText = id.toUpperCase(); 
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-active')); 
    const btn = document.getElementById('btn-'+id); if(btn) btn.classList.add('nav-active'); 
    document.querySelectorAll('.nav-btn-mob').forEach(b => b.classList.remove('mobile-nav-active'));
    const mobBtn = document.getElementById('mob-'+id); if(mobBtn) mobBtn.classList.add('mobile-nav-active');

    if(id==='programacion' && datosProg.length === 0) cargarProgramacion(); 
    if(id==='entradas') cargarEntradas(); 
    if(id==='logistica') subLog('term'); 
    if(id==='control') { cargarActividades(); subNav('act'); } 
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

// --- UTILIDADES ---
function fechaParaInput(f){
    if(!f || f === "") return "";
    if(f.includes("T")) return f.split("T")[0];
    if(f.includes("-")) {
        const p = f.split("-");
        if(p.length === 3 && p[0].length === 4) return `${p[0]}-${p[1].length===1?'0'+p[1]:p[1]}-${p[2].split(' ')[0].length===1?'0'+p[2].split(' ')[0]:p[2].split(' ')[0]}`;
    }
    if(f.includes("/")){
        const p = f.split("/");
        if(p.length === 3) return `${p[2]}-${p[1].length===1?'0'+p[1]:p[1]}-${p[0].length===1?'0'+p[0]:p[0]}`;
    }
    return "";
}

function convertirLinkDrive(url) {
    if (!url) return "";
    try {
        let id = "";
        const partes = url.split('/d/');
        if (partes.length > 1) { id = partes[1].split('/')[0]; } 
        else { const match = url.match(/[-\w]{25,}/); if (match) id = match[0]; }
        if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
        return url;
    } catch (e) { return url; }
}

function irAlDashboard() { google.script.run.withSuccessHandler(url => window.open(url, '_top')).getUrlDashboard(); }
function abrirLaboratorio() { window.open('VistaCampoPruebas.html', '_blank'); }
function abrirAceites() { window.open('VistaAceites.html', '_blank'); }
function recargarActual() { 
    const active = document.querySelector('.view-section.active'); 
    if(active) {
        if(active.id === 'programacion') cargarProgramacion(); 
        else nav(active.id);
    }
}

// --- MODULO PROGRAMACION ---
function cargarProgramacion(){ 
    const tDesk = document.getElementById('tabla-prog-desktop'); 
    const tMob = document.getElementById('lista-prog-mobile');
    if(tDesk) tDesk.innerHTML='<tr><td colspan="5" class="text-center py-8 text-slate-500">Cargando...</td></tr>'; 
    if(tMob) tMob.innerHTML='<div class="text-center py-8 text-slate-500">Cargando...</div>';

    google.script.run.withSuccessHandler(d => { 
        datosProg = d; 
        renderTablaProg();
    }).obtenerDatosProgramacion(); 
}

function renderTablaProg() {
    const tDesk = document.getElementById('tabla-prog-desktop'); 
    const tMob = document.getElementById('lista-prog-mobile');
    if(!tDesk || !tMob) return;

    tDesk.innerHTML = ''; tMob.innerHTML = '';
    
    if(datosProg.length === 0) { 
        const empty = '<div class="text-center py-4 text-slate-400">No hay datos recientes.</div>'; 
        tDesk.innerHTML = `<tr><td colspan="5">${empty}</td></tr>`; 
        tMob.innerHTML = empty; 
        return; 
    } 

    datosProg.forEach((r, i) => insertarFilaHTML(r, i, tDesk, tMob)); 
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function insertarFilaHTML(r, i, tDesk, tMob) {
    let c = "row-default", badgeColor = "bg-slate-100 text-slate-600";
    const s = (r.estado || "").toUpperCase(); 
    if(s.includes("FINAL") || s.includes("ENTREGADO")) { c = "row-finalizado"; badgeColor = "bg-green-100 text-green-700"; }
    else if(s.includes("PROCESO") || s.includes("AUTO")) { c = "row-proceso"; badgeColor = "bg-blue-100 text-blue-700"; }
    else if(s.includes("PENDIENTE") || s.includes("SIN") || s.includes("DIAGNOSTICO") || s.includes("FALTA") || s.includes("AUTORIZAR")) { c = "row-pendiente"; badgeColor = "bg-orange-100 text-orange-700"; }
    
    if (r.tipo_ejecucion === 'EXTERNA') { badgeColor = "bg-purple-100 text-purple-700 border border-purple-200"; }

    let b = `<span class="font-mono font-bold text-slate-700">${r.idJLB||'--'}</span>`; 
    if(r.idGroup) b += `<br><span class="bg-orange-100 text-orange-800 px-1 rounded text-[10px] font-bold">G:${r.idGroup}</span>`; 
    
    const tr = `<tr id="tr-${i}" class="border-b ${c} hover:bg-slate-50"><td class="px-6 py-4">${b}</td><td class="px-6 py-4 text-xs font-mono text-slate-600">${r.fecha||'S/F'}</td><td class="px-6 py-4 font-medium">${r.cliente}</td><td class="px-6 py-4"><span class="text-xs font-bold px-2 py-1 rounded ${badgeColor}">${r.estado}</span></td><td class="px-6 py-4 text-center"><button onclick="abrirModal(${i})" class="text-blue-600 hover:bg-blue-100 p-2 rounded-full transition-colors"><i data-lucide="pencil" class="w-4 h-4"></i></button></td></tr>`;
    tDesk.insertAdjacentHTML('beforeend', tr); 

    const card = `<div id="mob-${i}" class="mobile-card relative ${c} p-4" onclick="abrirModal(${i})"><div class="flex justify-between items-start mb-2"><div><span class="font-black text-lg text-slate-800">#${r.idJLB || r.idGroup}</span><span class="text-xs text-slate-500 block">${r.fecha}</span></div><span class="text-[10px] font-bold px-2 py-1 rounded ${badgeColor} uppercase tracking-wide">${r.estado}</span></div><h4 class="font-bold text-blue-900 text-base mb-1">${r.cliente}</h4><p class="text-sm text-slate-600 truncate">${r.desc}</p><div class="mt-3 pt-2 border-t border-slate-200/50 flex justify-end"><button class="text-blue-600 text-xs font-bold flex items-center gap-1 bg-white px-3 py-1.5 rounded-full border border-blue-100 shadow-sm"><i data-lucide="pencil" class="w-3 h-3"></i> EDITAR / VER</button></div></div>`;
    tMob.insertAdjacentHTML('beforeend', card);
}

function abrirModal(i){ 
    indiceActual = i; 
    const d = datosProg[i]; 
    document.getElementById('modal-detalle').classList.remove('hidden'); 
    document.getElementById('m-cliente').innerText = d.cliente; 
    document.getElementById('m-ids-badge').innerText = `ID: ${d.idJLB} | GRUPO: ${d.idGroup||'N/A'}`; 
    document.getElementById('date-f-oferta').value = fechaParaInput(d.f_oferta); 
    document.getElementById('date-f-aut').value = fechaParaInput(d.f_autorizacion); 
    document.getElementById('date-entrega').value = fechaParaInput(d.f_entrega); 
    document.getElementById('input-obs-prog').value = d.observacion; 
    document.getElementById('input-remision-prog').value = d.remision; 
    document.getElementById('in-idgroup').value = d.idGroup; 
    document.getElementById('in-serie').value = d.serie; 
    document.getElementById('in-ods').value = d.ods; 
    document.getElementById('in-desc').value = d.desc; 
    
    const selTipo = document.getElementById('in-tipo');
    selTipo.value = d.tipo; 
    if(selTipo.value === "") { } // Dejar en default si no coincide

    renderPasosSeguimiento(d);
    
    // --- RESETEAR MODULO REQUERIMIENTOS ---
    listaReqTemp = [];
    historialReqCache = [];
    renderListaReqTemp();
    
    // Identificar ID único del trafo
    const idUnico = d.idJLB || d.idGroup;
    if(idUnico) {
        cargarRequerimientos(idUnico);
    } else {
        document.getElementById('lista-reqs').innerHTML = '<div class="text-center py-4 text-red-300 text-xs">Error: Trafo sin ID.</div>';
    }
}

function renderPasosSeguimiento(d) {
    const stepsContainer = document.getElementById('steps-container'); 
    stepsContainer.innerHTML = ''; 

    const esExterno = d.tipo_ejecucion === 'EXTERNA';
    const htmlEjecucion = `<div class="col-span-full bg-slate-50 p-3 rounded border mb-4 border-slate-300"><h6 class="font-bold text-xs text-slate-500 mb-2 uppercase flex items-center gap-2"><i data-lucide="settings-2" class="w-3 h-3"></i> Configuración de Ejecución</h6><div class="grid grid-cols-2 gap-4"><div><label class="text-[10px] font-bold text-slate-600 block mb-1">TIPO EJECUCIÓN</label><select id="sel-ejecucion" class="w-full border rounded p-2 text-sm bg-white font-bold text-slate-700 outline-none" onchange="toggleProveedor(this.value)"><option value="INTERNA" ${!esExterno?'selected':''}>🏠 INTERNA</option><option value="EXTERNA" ${esExterno?'selected':''}>🚚 EXTERNA</option></select></div><div><label class="text-[10px] font-bold text-slate-600 block mb-1">PROVEEDOR</label><input id="in-proveedor-dyn" class="w-full border rounded p-2 text-sm" value="${d.proveedor_ext||''}" ${!esExterno?'disabled':''} placeholder="Nombre..."></div></div></div>`;
    stepsContainer.insertAdjacentHTML('beforeend', htmlEjecucion);

    const estado = (d.estado || "").toUpperCase().trim();
    if(estado === "SIN INGRESAR A SISTEMA" || estado === "PENDIENTE" || estado === "") {
        stepsContainer.insertAdjacentHTML('beforeend', `<div class="col-span-full mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg flex flex-col items-center justify-center gap-2"><p class="text-orange-800 font-bold text-sm uppercase">⚠️ Equipo pendiente de ingreso</p><button onclick="avanzarEstado('FALTA INSPECCION INICIAL', 'CONFIRMAR_ZIUR')" class="bg-orange-600 text-white px-6 py-2 rounded-lg font-bold shadow text-xs">✅ CONFIRMAR INGRESO</button></div>`);
    }

    const tipoServ = (d.tipo || "").toUpperCase();
    const desc = (d.desc || "").toUpperCase();
    const esSoloAceite = tipoServ.includes("ACEITE") || desc.includes("ACEITE");
    
    let ps = [{id:'pruebas_ini',l:'1. Pruebas Ini'}, {id:'desencube',l:'2. Desencube'}, {id:'desensamble',l:'3. Desensamble'}, {id:'bobinado',l:'4. Bobinado'}, {id:'ensamble',l:'5. Ensamble'}, {id:'horno',l:'6. Horno'}, {id:'encube',l:'7. Encube'}, {id:'pruebas_fin',l:'8. Pruebas Fin'}, {id:'pintura',l:'9. Pintura'}, {id:'listo',l:'10. Listo'}]; 
    if(esSoloAceite) ps = [{id:'pruebas_ini',l:'1. Inicial'}, {id:'pruebas_fin',l:'2. Terminado'}, {id:'listo',l:'3. Listo'}];
    if (esExterno) ps = ps.filter(p => ['pruebas_ini','pruebas_fin','pintura','listo'].includes(p.id));

    ps.forEach(p => { 
        let valFecha = fechaParaInput(d.fases[p.id]) || (p.id==='listo'?fechaParaInput(d.f_listo):""); 
        const dn = valFecha !== ""; 
        const div = `<div class="step-card ${dn?'done':''}"><label class="text-[10px] font-bold uppercase mb-1 ${dn?'text-green-700':'text-slate-400'}">${p.l}</label><input type="date" id="date-${p.id}" value="${valFecha}" class="date-input"></div>`;
        stepsContainer.insertAdjacentHTML('beforeend', div); 
    }); 
    switchTab('seg'); 
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleProveedor(val) {
    const inp = document.getElementById('in-proveedor-dyn');
    if(val === 'EXTERNA') { inp.disabled = false; inp.focus(); } else { inp.disabled = true; inp.value = ''; }
}

function guardarCambios(){ 
    const b = document.getElementById('btn-guardar-prog'); 
    const txtOriginal = b.innerHTML; b.innerHTML = 'GUARDANDO...'; b.disabled = true; 
    
    const c = { 
        f_oferta: document.getElementById('date-f-oferta').value, 
        f_autorizacion: document.getElementById('date-f-aut').value, 
        observacion: document.getElementById('input-obs-prog').value, 
        remision: document.getElementById('input-remision-prog').value, 
        entrega: document.getElementById('date-entrega').value, 
        pruebas_ini: document.getElementById('date-pruebas_ini')?.value, 
        desencube: document.getElementById('date-desencube')?.value, 
        desensamble: document.getElementById('date-desensamble')?.value, 
        bobinado: document.getElementById('date-bobinado')?.value, 
        ensamble: document.getElementById('date-ensamble')?.value, 
        horno: document.getElementById('date-horno')?.value, 
        encube: document.getElementById('date-encube')?.value, 
        pruebas_fin: document.getElementById('date-pruebas_fin')?.value, 
        pintura: document.getElementById('date-pintura')?.value || document.getElementById('date-pruebas_fin')?.value, 
        listo: document.getElementById('date-listo')?.value, 
        idGroup: document.getElementById('in-idgroup').value, 
        serie: document.getElementById('in-serie').value, 
        ods: document.getElementById('in-ods').value, 
        desc: document.getElementById('in-desc').value, 
        tipo: document.getElementById('in-tipo').value,
        tipo_ejecucion: document.getElementById('sel-ejecucion')?.value || 'INTERNA',
        proveedor: document.getElementById('in-proveedor-dyn')?.value || ''
    }; 
    
    let nuevoEstado = datosProg[indiceActual].estado;
    if(c.entrega) nuevoEstado = "ENTREGADO";
    else if(c.listo) nuevoEstado = "FINALIZADO / LISTO";
    else if(c.tipo_ejecucion === 'EXTERNA') nuevoEstado = "EN PROVEEDOR / EXTERNO";
    
    const item = datosProg[indiceActual];
    item.estado = nuevoEstado;
    item.cliente = document.getElementById('m-cliente').innerText; 
    item.desc = c.desc;
    actualizarFilaDOM(indiceActual, item);

    google.script.run.withSuccessHandler(() => { 
        b.innerHTML = txtOriginal; b.disabled = false; showToast("Cambios guardados"); 
    }).withFailureHandler(e => { 
        b.innerHTML = txtOriginal; b.disabled = false; alert("Hubo un error al guardar en la nube: " + e + ". Por favor recarga."); 
    }).guardarAvance({rowIndex: item.rowIndex, cambios: c}); 
    
    cerrarModal(); 
}

function actualizarFilaDOM(i, r) {
    const tr = document.getElementById(`tr-${i}`);
    if(tr) {
        let badgeColor = "bg-slate-100 text-slate-600";
        const s = (r.estado || "").toUpperCase(); 
        if(s.includes("FINAL") || s.includes("ENTREGADO")) badgeColor = "bg-green-100 text-green-700";
        else if(s.includes("PROCESO") || s.includes("AUTO")) badgeColor = "bg-blue-100 text-blue-700";
        else if(s.includes("PENDIENTE")) badgeColor = "bg-orange-100 text-orange-700";
        if (r.tipo_ejecucion === 'EXTERNA') badgeColor = "bg-purple-100 text-purple-700 border border-purple-200";
        const tds = tr.getElementsByTagName('td');
        if(tds[3]) tds[3].innerHTML = `<span class="text-xs font-bold px-2 py-1 rounded ${badgeColor}">${r.estado}</span>`;
    }
    const card = document.getElementById(`mob-${i}`);
    if(card) {
        const badge = card.querySelector('span.rounded');
        if(badge) { badge.innerText = r.estado; badge.className = `text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide`; }
    }
}

function avanzarEstado(nuevoEstado, accion) {
    if(!confirm("¿Confirmar cambio?")) return;
    const d = datosProg[indiceActual];
    d.estado = "EN PROCESO"; 
    actualizarFilaDOM(indiceActual, d);
    cerrarModal();
    google.script.run.withSuccessHandler(res => { if(!res.exito) alert("Error al sincronizar estado."); }).avanzarEstadoAdmin({ rowIndex: d.rowIndex, nuevoEstado: nuevoEstado, accion: accion, idTrafo: d.idJLB||d.idGroup });
}

// --- LOGICA REQUERIMIENTOS RAPIDOS (CORREGIDO) ---
function agregarFilaReqTemp() {
    const desc = document.getElementById('req-desc').value.trim();
    const cant = document.getElementById('req-cant').value;
    if (!desc) return;
    
    listaReqTemp.push({ cant, desc });
    document.getElementById('req-desc').value = "";
    document.getElementById('req-cant').value = "1";
    document.getElementById('req-desc').focus();
    renderListaReqTemp();
}

function borrarReqTemp(index) {
    listaReqTemp.splice(index, 1);
    renderListaReqTemp();
}

function renderListaReqTemp() {
    const tbody = document.getElementById('tbody-req-temp');
    const container = document.getElementById('lista-req-temp');
    if (listaReqTemp.length === 0) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    tbody.innerHTML = "";
    listaReqTemp.forEach((item, i) => {
        tbody.innerHTML += `<tr class="border-b border-slate-100 last:border-0"><td class="p-2 text-center font-bold text-slate-700">${item.cant}</td><td class="p-2 text-slate-600">${item.desc}</td><td class="p-2 text-center"><button onclick="borrarReqTemp(${i})" class="text-red-400 hover:text-red-600 font-bold">✕</button></td></tr>`;
    });
}

function cargarRequerimientos(idTrafo) {
    const div = document.getElementById('lista-reqs');
    div.innerHTML = '<div class="text-center py-4 text-slate-400 italic text-xs">Cargando...</div>';
    
    // ERROR HANDLER PARA EVITAR CARGA INFINITA
    google.script.run.withSuccessHandler(list => {
        div.innerHTML = '';
        historialReqCache = list || []; // Guardar en caché para el botón copiar
        
        if(!list || list.length === 0) {
            div.innerHTML = '<div class="text-center py-4 text-slate-300 text-xs">No hay historial.</div>';
            return;
        }
        
        list.forEach(r => {
            // Compatibilidad: r.texto viene del backend, r.descripcion del frontend nuevo
            const textoMostrado = r.texto || r.descripcion || "Sin detalle";
            
            let color = "text-orange-500";
            if(r.estado === "COMPRADO" || r.estado === "ENTREGADO" || r.estado.includes("ENVIADO")) color = "text-green-600";
            
            div.innerHTML += `
                <div class="bg-white border border-slate-100 p-2 rounded shadow-sm text-xs flex justify-between items-start">
                    <div>
                        <p class="text-slate-800 font-medium">${textoMostrado}</p>
                        <p class="text-[10px] text-slate-400">${r.fecha} - ${r.autor}</p>
                    </div>
                    <span class="font-bold ${color} text-[10px] uppercase">${r.estado}</span>
                </div>
            `;
        });
    }).withFailureHandler(e => {
        div.innerHTML = `<div class="text-center py-4 text-red-400 text-xs">Error de conexión: ${e}</div>`;
    }).obtenerRequerimientos(idTrafo);
}

function guardarTodoReq() {
    const d = datosProg[indiceActual];
    const idTrafo = d.idJLB || d.idGroup;
    if (!idTrafo) { alert("Error: No hay ID de Trafo"); return; }
    if (listaReqTemp.length === 0) return;

    const btn = document.getElementById('btn-save-reqs');
    btn.disabled = true; btn.innerText = "ENVIANDO...";

    // Enviamos el lote uno por uno (para asegurar compatibilidad)
    let promesas = listaReqTemp.map(item => {
        return new Promise((resolve) => {
            const payload = {
                idTrafo: idTrafo,
                descripcion: item.desc,
                cantidad: item.cant,
                texto: `(${item.cant}) ${item.desc}`, // Concatenamos para compatibilidad con backend viejo
                autor: "Producción"
            };
            // Usamos withFailureHandler también para que no se detenga si uno falla
            google.script.run.withSuccessHandler(resolve).withFailureHandler(resolve).guardarRequerimiento(payload);
        });
    });

    Promise.all(promesas).then(() => {
        listaReqTemp = [];
        renderListaReqTemp();
        cargarRequerimientos(idTrafo);
        btn.disabled = false; btn.innerText = "GUARDAR LISTA DE MATERIALES";
        showToast("Requerimientos enviados");
    });
}

// NUEVA FUNCIÓN: COPIAR ALMACÉN
function copiarRequerimientosAlmacen() {
    if(!historialReqCache || historialReqCache.length === 0) {
        showToast("No hay nada para copiar", "error");
        return;
    }
    
    const d = datosProg[indiceActual];
    let texto = `*REQUERIMIENTO TRAFO ${d.idJLB || d.idGroup}*\nCliente: ${d.cliente}\n------------------\n`;
    
    historialReqCache.forEach(r => {
        // Limpiamos el texto si viene con paréntesis del backend antiguo
        let linea = r.texto || r.descripcion || "";
        // Si el estado es pendiente, lo copiamos. Si ya está entregado, lo ignoramos (opcional)
        if(r.estado === "PENDIENTE") {
            texto += `• ${linea}\n`;
        }
    });
    
    navigator.clipboard.writeText(texto).then(() => {
        showToast("📋 Pedido copiado al portapapeles");
    }).catch(err => {
        showToast("Error al copiar: " + err, "error");
    });
}

// --- FUNCIÓN ENVIAR A API ALMACÉN ---
function enviarAlmacenAPI() {
    // Verificar si hay items pendientes (usando la cache)
    const pendientes = historialReqCache.filter(r => r.estado === "PENDIENTE");
    if (pendientes.length === 0) {
        alert("No hay items PENDIENTES para enviar.");
        return;
    }

    if (!confirm(`¿Enviar ${pendientes.length} items a la App de Almacén?`)) return;

    const d = datosProg[indiceActual];
    const idTrafo = d.idJLB || d.idGroup;
    const cliente = d.cliente;
    const prioridad = document.getElementById('req-prioridad-envio').value;

    showToast("Conectando con Almacén...", "info");

    const payload = {
        idTrafo: idTrafo,
        cliente: cliente,
        prioridad: prioridad // Se lee del nuevo selector
    };

    google.script.run
        .withSuccessHandler(res => {
            if (res.success) {
                showToast("✅ " + res.msg);
                cargarRequerimientos(idTrafo); // Recargar para ver estado "ENVIADO"
            } else {
                alert("Error Almacén: " + res.error);
            }
        })
        .withFailureHandler(e => {
            alert("Error de Red: " + e);
        })
        .enviarPedidoAlmacen(payload);
}

// RESTO DE FUNCIONES
function subLog(id) { document.querySelectorAll('.log-view').forEach(e=>e.classList.remove('active')); document.querySelectorAll('.log-btn').forEach(e=>e.classList.remove('active')); document.getElementById('view-'+id).classList.add('active'); document.getElementById('btn-log-'+id).classList.add('active'); if(id==='term') cargarTerminados(); if(id==='alq') cargarAlquiler(); if(id==='pat') cargarPatio(); }
function subNav(id) { 
    document.querySelectorAll('.cp-view').forEach(e=>e.classList.remove('active')); 
    document.querySelectorAll('.cp-btn').forEach(e=>e.classList.remove('active')); 
    document.getElementById('view-'+id).classList.add('active'); 
    document.getElementById('btn-cp-'+id).classList.add('active');
    if(id === 'fot') cargarGaleriaFotos();
}

function cargarAlquiler() { google.script.run.withSuccessHandler(d => { datosAlq = d; filtrarAlquiler(); }).obtenerLogistica({ tipo: 'ALQUILER' }); }

function filtrarAlquiler() {
    const kva = document.getElementById('filtro-kva').value.toLowerCase();
    const volt = document.getElementById('filtro-voltaje').value.toLowerCase();
    const estadoFiltro = document.getElementById('filtro-estado').value;
    
    const t = document.getElementById('tabla-alq');
    if(!t) return;
    t.innerHTML = '';
    
    const filtrados = datosAlq.filter(item => {
        const matchKVA = kva === "" || item.kva.toString().toLowerCase().includes(kva);
        const matchVolt = volt === "" || item.voltajes.toString().toLowerCase().includes(volt);
        const matchEstado = estadoFiltro === "TODOS" || item.estado.toUpperCase().includes(estadoFiltro);
        return matchKVA && matchVolt && matchEstado;
    });

    if(filtrados.length === 0) { t.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400">No hay coincidencias.</td></tr>'; return; }
    
    filtrados.forEach((r, i) => {
        const btnFoto = r.foto ? `<a href="${convertirLinkDrive(r.foto)}" target="_blank" class="text-blue-600 flex justify-center"><i data-lucide="image" class="w-5 h-5"></i></a>` : '<span class="text-slate-300">-</span>';
        let badgeClass = 'bg-gray-100 text-slate-700';
        if (r.estado.includes("DISPONIBLE")) badgeClass = 'bg-green-100 text-green-700';
        else if (r.estado === "PRESTADO" || r.estado.includes("PRESTADO")) badgeClass = 'bg-blue-100 text-blue-700';
        else if (r.estado.includes("MANTENIMIENTO")) badgeClass = 'bg-orange-100 text-orange-700';
        else if (r.estado.includes("REPARACION")) badgeClass = 'bg-red-100 text-red-700';
        const indexReal = datosAlq.indexOf(r);
        t.insertAdjacentHTML('beforeend', `<tr class="border-b hover:bg-slate-50"><td class="p-3 font-bold">${r.codigo}</td><td class="p-3 text-xs">${r.equipo}<br><span class="text-slate-400">${r.voltajes}</span></td><td class="p-3"><span class="text-[10px] px-2 py-1 rounded font-bold uppercase ${badgeClass}">${r.estado}</span></td><td class="p-3 text-xs">${r.cliente}</td><td class="p-3 text-xs">${r.fechas}</td><td class="p-3 text-center">${btnFoto}</td><td class="p-3 text-center"><button onclick="editarAlquiler(${indexReal})" class="text-blue-600 hover:bg-blue-100 p-2 rounded-full"><i data-lucide="pencil" class="w-4 h-4"></i></button></td></tr>`);
    });
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

// --- FUNCIÓN GALERÍA ---
function cargarGaleriaFotos() {
    const grid = document.getElementById('galeria-fotos-grid');
    if(!grid) return;
    grid.innerHTML = '<div class="col-span-full text-center text-blue-500 py-8"><i data-lucide="loader-2" class="animate-spin w-8 h-8 mx-auto"></i><p class="text-xs mt-2">Sincronizando fotos recientes...</p></div>';
    if(typeof lucide !== 'undefined') lucide.createIcons();

    google.script.run
        .withSuccessHandler(fotos => {
            grid.innerHTML = '';
            if(!fotos || fotos.length === 0) {
                grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300"><i data-lucide="image-off" class="w-8 h-8 mx-auto mb-2 opacity-50"></i><p>Aún no hay fotos registradas.</p></div>';
                if(typeof lucide !== 'undefined') lucide.createIcons();
                return;
            }
            fotos.forEach(f => {
                const directUrl = convertirLinkDrive(f.url);
                const card = `
                    <div class="gallery-card relative group bg-white rounded-lg overflow-hidden aspect-square border border-slate-200 shadow-sm hover:shadow-lg transition-all cursor-pointer" onclick="window.open('${directUrl}', '_blank')">
                        <img src="${directUrl}" class="w-full h-full object-cover transition-transform group-hover:scale-105">
                        <div class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
                            <span class="text-white font-bold text-sm block shadow-black drop-shadow-md trafo-id">${f.idTrafo}</span>
                            <span class="text-[10px] text-white/90 uppercase font-bold bg-black/30 px-1.5 py-0.5 rounded backdrop-blur-sm etapa-tag">${f.etapa}</span>
                        </div>
                        <div class="absolute top-2 right-2 bg-white/90 text-slate-700 text-[9px] px-2 py-1 rounded-full shadow-sm font-bold border border-slate-100">
                            ${f.fecha ? f.fecha.split(' ')[0] : 'Hoy'}
                        </div>
                    </div>
                `;
                grid.insertAdjacentHTML('beforeend', card);
            });
        })
        .withFailureHandler(error => {
            grid.innerHTML = `<div class="col-span-full text-center text-red-400 py-8"><i data-lucide="alert-triangle" class="w-8 h-8 mx-auto mb-2"></i><p>Error de conexión.</p><button onclick="cargarGaleriaFotos()" class="text-blue-500 underline mt-2">Reintentar</button></div>`;
            if(typeof lucide !== 'undefined') lucide.createIcons();
        })
        .obtenerUltimasFotos();
}

function filtrarFotos() {
    const idQuery = document.getElementById('filtro-foto-id').value.toUpperCase();
    const etapaQuery = document.getElementById('filtro-foto-etapa').value.toUpperCase();
    const cards = document.querySelectorAll('.gallery-card');
    cards.forEach(card => {
        const idText = card.querySelector('.trafo-id').innerText.toUpperCase();
        const etapaText = card.querySelector('.etapa-tag').innerText.toUpperCase();
        const matchId = idText.includes(idQuery);
        const matchEtapa = etapaQuery === "TODAS" || etapaText.includes(etapaQuery);
        if(matchId && matchEtapa) { card.classList.remove('hidden'); } else { card.classList.add('hidden'); }
    });
}

function actualizarDatalistClientes(){ const dl = document.getElementById('lista-clientes'); if(!dl) return; dl.innerHTML = ''; dbClientes.forEach(c => { const opt = document.createElement('option'); opt.value = c.nombre; dl.appendChild(opt); }); }
function autocompletarCliente(input){ const val = input.value.toUpperCase(); const found = dbClientes.find(c => c.nombre === val); if(found){ document.getElementById('in-cedula-ent').value = found.nit; document.getElementById('in-telefono-ent').value = found.telefono; document.getElementById('in-contacto-ent').value = found.contacto; document.getElementById('in-ciudad-ent').value = found.ciudad; showToast("Cliente cargado"); } }
function abrirModalNuevaEntrada() { document.getElementById('modal-nueva-entrada').classList.remove('hidden'); setTimeout(initCanvas, 100); }
function cerrarModalNueva() { document.getElementById('modal-nueva-entrada').classList.add('hidden'); document.getElementById('form-entrada').reset(); limpiarFirma(); }
function filtrarProg() { 
    const q = document.getElementById('searchProg').value.toLowerCase(); 
    const tDesk = document.getElementById('tabla-prog-desktop'); 
    const tMob = document.getElementById('lista-prog-mobile'); 
    tDesk.innerHTML = ''; tMob.innerHTML = ''; 
    const f = datosProg.filter(r => ((r.idJLB || "") + " " + (r.idGroup || "") + " " + (r.cliente || "") + " " + (r.desc || "") + " " + (r.estado || "")).toLowerCase().includes(q)); 
    f.forEach(r => insertarFilaHTML(r, datosProg.indexOf(r), tDesk, tMob)); 
    if(typeof lucide !== 'undefined') lucide.createIcons(); 
}
function initCanvas() { canvas = document.getElementById('signature-pad'); if(!canvas) return; ctx = canvas.getContext('2d'); const rect = canvas.parentElement.getBoundingClientRect(); canvas.width = rect.width; canvas.height = rect.height; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000'; canvas.addEventListener('mousedown', startDraw); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', endDraw); canvas.addEventListener('mouseout', endDraw); canvas.addEventListener('touchstart', (e)=>{e.preventDefault();startDraw(e.touches[0])}); canvas.addEventListener('touchmove', (e)=>{e.preventDefault();draw(e.touches[0])}); canvas.addEventListener('touchend', (e)=>{e.preventDefault();endDraw()}); }
function startDraw(e) { isDrawing = true; const r = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo((e.clientX||e.pageX)-r.left, (e.clientY||e.pageY)-r.top); }
function draw(e) { if(!isDrawing)return; const r = canvas.getBoundingClientRect(); ctx.lineTo((e.clientX||e.pageX)-r.left, (e.clientY||e.pageY)-r.top); ctx.stroke(); }
function endDraw() { isDrawing = false; }
function limpiarFirma() { if(ctx) ctx.clearRect(0,0,canvas.width,canvas.height); }
function getFirmaBase64() { if(!canvas) return null; const b = document.createElement('canvas'); b.width = canvas.width; b.height = canvas.height; return canvas.toDataURL() === b.toDataURL() ? null : canvas.toDataURL('image/png'); }
function enviarFormulario(){ const b = document.getElementById('btn-crear'); const txtOriginal = b.innerHTML; b.innerHTML = 'PROCESANDO...'; b.disabled = true; const f = document.getElementById('form-entrada'); const d = new FormData(f); const dt = { empresa: d.get('empresa'), cliente: d.get('cliente'), cedula: d.get('cedula'), contacto: d.get('contacto'), telefono: d.get('telefono'), ciudad: d.get('ciudad'), descripcion: d.get('descripcion'), cantidad: d.get('cantidad'), observaciones: d.get('observaciones'), quienEntrega: d.get('quienEntrega'), quienRecibe: d.get('quienRecibe'), codigo: d.get('codigo'), firmaBase64: getFirmaBase64() }; google.script.run.withSuccessHandler(r => { if(r.exito) { cerrarModalNueva(); b.innerHTML = txtOriginal; b.disabled = false; cargarEntradas(); showToast("Entrada guardada"); } else { alert("Error: " + r.error); b.innerHTML = txtOriginal; b.disabled = false; } }).withFailureHandler(e => { b.innerHTML = txtOriginal; b.disabled = false; showToast("Error: " + e, 'error'); }).registrarEntradaRapida(dt); }
function cargarEntradas() { const g = document.getElementById('grid-entradas'); if(!g) return; g.innerHTML='<p class="col-span-full text-center py-4">Cargando...</p>'; google.script.run.withSuccessHandler(d => { datosEntradas = d; g.innerHTML = ''; if(d.length === 0) g.innerHTML = '<p class="col-span-full text-center">Sin registros.</p>'; d.forEach(i => renderCardEntrada(i, g, false)); if(typeof lucide !== 'undefined') lucide.createIcons(); }).obtenerDatosEntradas(); }
function renderCardEntrada(i, c, p){ const cid = `card-${i.id}`; const pdf = (i.urlPdf && i.urlPdf.length > 5) ? `<a href="${i.urlPdf}" target="_blank" class="w-full bg-red-50 text-red-600 py-2 rounded text-xs font-bold flex justify-center gap-2"><i data-lucide="file-text" class="w-4 h-4"></i> VER PDF</a>` : `<button id="btn-gen-${i.id}" onclick="genPDF(${i.id},${i.rowIndex})" class="w-full bg-slate-800 text-white hover:bg-slate-900 py-2 rounded text-xs font-bold flex justify-center gap-2"><i data-lucide="file-plus" class="w-4 h-4"></i> GENERAR</button>`; const ziur = `${i.cantidad||1} / ${i.codigo||'S/C'} / ${i.descripcion}`; const h = `<div id="${cid}" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative"><button onclick="copiarTexto('${ziur}')" class="absolute top-4 right-4 text-slate-400 hover:text-blue-600"><i data-lucide="copy" class="w-5 h-5"></i></button><div><div class="flex justify-between mb-2"><span class="font-bold text-lg">#${i.id}</span><span class="text-xs bg-slate-100 px-2 py-1 rounded">${i.fecha}</span></div><div class="bg-blue-50 text-blue-800 text-xs font-mono px-2 py-1 rounded w-fit mb-2">🏷️ ${i.codigo||'---'}</div><h4 class="font-bold text-blue-600 mb-1">${i.cliente}</h4><p class="text-sm text-slate-500 line-clamp-2">${i.descripcion}</p></div><div class="pt-3 border-t mt-4" id="act-${i.id}">${pdf}</div></div>`; if(p) c.insertAdjacentHTML('afterbegin', h); else c.insertAdjacentHTML('beforeend', h); }
function genPDF(id, rix){ const b = document.getElementById(`btn-gen-${id}`); if(b) { const o = b.innerHTML; b.innerHTML = '...'; b.disabled = true; google.script.run.withSuccessHandler(r => { if(r.exito) { b.parentElement.innerHTML = `<a href="${r.url}" target="_blank" class="w-full bg-red-50 text-red-600 py-2 rounded text-xs font-bold flex justify-center gap-2"><i data-lucide="file-text" class="w-4 h-4"></i> VER PDF</a>`; if(typeof lucide !== 'undefined') lucide.createIcons(); } else { alert(r.error); b.innerHTML = o; b.disabled = false; } }).generarPDFBackground({id: id, rowIndex: rix, datos: null}); } }
function showToast(msg, type = 'success') { const container = document.getElementById('toast-container'); if(!container) return; const el = document.createElement('div'); el.className = `toast ${type}`; el.innerHTML = type === 'success' ? `<i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i><span class="font-bold text-sm text-slate-700">${msg}</span>` : `<i data-lucide="alert-circle" class="w-5 h-5 text-red-600"></i><span class="font-bold text-sm text-slate-700">${msg}</span>`; container.appendChild(el); if(typeof lucide !== 'undefined') lucide.createIcons(); setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000); }
function copiarTexto(t){ navigator.clipboard.writeText(t).then(()=>showToast("Copiado")); }
function switchTab(t){ document.querySelectorAll('.tab-content').forEach(e=>e.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(e=>e.classList.remove('active')); document.getElementById('view-'+t).classList.add('active'); document.getElementById('tab-btn-'+t).classList.add('active'); }
function cerrarModal() { document.getElementById('modal-detalle').classList.add('hidden'); }
function cargarTerminados() { google.script.run.withSuccessHandler(d => { const c = document.getElementById('lista-terminados'); if(!c) return; c.innerHTML = ''; if(d.length === 0) c.innerHTML = '<p class="text-center text-slate-400 py-4">Sin pendientes.</p>'; d.forEach(i => { const txt = `ENTRADA: ${i.id} | CLIENTE: ${i.cliente} | EQUIPO: ${i.desc} | ODS: ${i.ods}`; c.insertAdjacentHTML('beforeend', `<div class="bg-white border border-green-200 p-4 rounded-lg shadow-sm flex justify-between items-center"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600"><i data-lucide="check" class="w-6 h-6"></i></div><div><h4 class="font-bold text-slate-700">${i.cliente}</h4><p class="text-xs text-slate-500">${i.desc} (ID: ${i.id})</p></div></div><button onclick="copiarTexto('${txt}')" class="bg-slate-100 text-slate-600 p-2 rounded hover:bg-slate-200"><i data-lucide="copy" class="w-4 h-4"></i></button></div>`); }); if(typeof lucide !== 'undefined') lucide.createIcons(); }).obtenerLogistica({ tipo: 'TERMINADOS' }); }
function cargarPatio() { google.script.run.withSuccessHandler(d => { const t = document.getElementById('tabla-pat'); if(!t) return; t.innerHTML = ''; d.forEach(r => { t.insertAdjacentHTML('beforeend', `<tr class="border-b"><td class="p-3 font-mono text-blue-600">${r.id}</td><td class="p-3">${r.cliente}</td><td class="p-3 text-xs text-red-500">${r.motivo}</td></tr>`); }); }).obtenerLogistica({ tipo: 'PATIO' }); }
function editarAlquiler(i) { const d = datosAlq[i]; abrirModalAlq(false); document.getElementById('title-modal-alq').innerText = "Editar Alquiler"; document.getElementById('alq-codigo').value = d.codigo; document.getElementById('alq-codigo').readOnly = true; document.getElementById('alq-kva').value = d.kva; document.getElementById('alq-marca').value = d.marca; document.getElementById('alq-volt').value = d.voltajes; document.getElementById('alq-cliente').value = d.cliente; document.getElementById('alq-salida').value = fechaParaInput(d.salida); document.getElementById('alq-regreso').value = fechaParaInput(d.regreso); const sel = document.getElementById('alq-estado-manual'); const estadosValidos = ["DISPONIBLE", "MANTENIMIENTO", "REPARACION", "PRESTADO"]; if(estadosValidos.includes(d.estado)) { sel.value = d.estado; } else { if(d.estado.includes("DISPONIBLE")) sel.value = "DISPONIBLE"; else if(d.estado.includes("MANTENIMIENTO")) sel.value = "MANTENIMIENTO"; else if(d.estado.includes("REPARACION")) sel.value = "REPARACION"; else if(d.estado.includes("PRESTADO")) sel.value = "PRESTADO"; else sel.value = "DISPONIBLE"; } alqFotosNuevas = []; document.getElementById('alq-preview-container').innerHTML = ''; document.getElementById('alq-preview-container').classList.add('hidden'); }
function abrirModalAlq(nuevo) { document.getElementById('modal-alq').classList.remove('hidden'); const btn = document.getElementById('btn-alq-save'); btn.innerText = "Guardar"; btn.disabled = false; if(nuevo) { document.getElementById('title-modal-alq').innerText = "Registrar Nuevo"; document.getElementById('form-alq').reset(); document.getElementById('alq-codigo').readOnly = false; alqFotosNuevas = []; document.getElementById('alq-preview-container').innerHTML = ''; document.getElementById('alq-preview-container').classList.add('hidden'); } }
function cerrarModalAlq() { document.getElementById('modal-alq').classList.add('hidden'); }
function previewAlqFoto(input) { if (input.files && input.files.length > 0) { const container = document.getElementById('alq-preview-container'); container.classList.remove('hidden'); document.getElementById('btn-limpiar-fotos').classList.remove('hidden'); Array.from(input.files).forEach(file => { const reader = new FileReader(); reader.onload = function(e) { const img = new Image(); img.src = e.target.result; img.onload = function() { const canvas = document.createElement('canvas'); const MAX_WIDTH = 1000; const scaleSize = MAX_WIDTH / img.width; if (img.width > MAX_WIDTH) { canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize; } else { canvas.width = img.width; canvas.height = img.height; } const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6); alqFotosNuevas.push(compressedDataUrl); const div = document.createElement('div'); div.className = "aspect-square rounded border border-slate-200 overflow-hidden relative"; div.innerHTML = `<img src="${compressedDataUrl}" class="w-full h-full object-cover">`; container.appendChild(div); }; }; reader.readAsDataURL(file); }); input.value = ""; } }
function limpiarFotosAlq() { alqFotosNuevas = []; const container = document.getElementById('alq-preview-container'); container.innerHTML = ''; container.classList.add('hidden'); document.getElementById('btn-limpiar-fotos').classList.add('hidden'); }
function guardarAlquiler() { const estadoSeleccionado = document.getElementById('alq-estado-manual').value; let cliente = document.getElementById('alq-cliente').value; if(estadoSeleccionado !== "PRESTADO") { cliente = ""; } const d = { codigo: document.getElementById('alq-codigo').value, kva: document.getElementById('alq-kva').value, marca: document.getElementById('alq-marca').value, voltajes: document.getElementById('alq-volt').value, cliente: cliente, salida: document.getElementById('alq-salida').value, regreso: document.getElementById('alq-regreso').value, estadoManual: estadoSeleccionado }; enviarAlquiler(d); cerrarModalAlq(); showToast("Datos guardados. Procesando fotos..."); if(alqFotosNuevas.length > 0) { showToast("Subiendo fotos en segundo plano...", "info"); google.script.run.withSuccessHandler(res => { if(res.exito) { google.script.run.withSuccessHandler(() => { showToast("✅ Fotos subidas y vinculadas."); cargarAlquiler(); }).actualizarFotoAlquiler({ codigo: d.codigo, url: res.url }); } else { showToast("Error subiendo fotos: " + res.error, 'error'); } }).subirFotosAlquilerBatch({ listaBase64: alqFotosNuevas, codigo: d.codigo }); } }
function enviarAlquiler(d){ google.script.run.withSuccessHandler(() => { cargarAlquiler(); alqFotosNuevas=[]; }).withFailureHandler(e => { showToast("Error guardar: " + e, 'error'); }).guardarAlquiler(d); }
function cargarActividades() { google.script.run.withSuccessHandler(list => { const s = document.getElementById('task-resp'); if(!s) return; const sel = s.value; let html = list.map(n => `<option value="${n}">${n}</option>`).join(''); html += `<option value="CREAR_NUEVO" class="font-bold text-blue-600 bg-blue-50">[ + CREAR NUEVO ]</option>`; s.innerHTML = html; if(list.includes(sel)) s.value = sel; }).obtenerTrabajadores(); google.script.run.withSuccessHandler(d => { tareasCache = d; renderizarTareas(d); }).obtenerActividades(); }
function verificarNuevoResponsable(selectElement) { if (selectElement.value === 'CREAR_NUEVO') { const nuevoNombre = prompt("Ingrese el nombre del nuevo integrante:"); if (nuevoNombre && nuevoNombre.trim().length > 0) { const nombreFinal = nuevoNombre.trim().toUpperCase(); const opcionCarga = document.createElement("option"); opcionCarga.text = "Guardando..."; selectElement.add(opcionCarga, selectElement[0]); selectElement.selectedIndex = 0; selectElement.disabled = true; google.script.run.withSuccessHandler(nuevaLista => { let html = nuevaLista.map(n => `<option value="${n}">${n}</option>`).join(''); html += `<option value="CREAR_NUEVO" class="font-bold text-blue-600 bg-blue-50">[ + CREAR NUEVO ]</option>`; selectElement.innerHTML = html; selectElement.value = nombreFinal; if (selectElement.value !== nombreFinal) selectElement.selectedIndex = 0; selectElement.disabled = false; showToast("Trabajador creado"); }).crearTrabajador({ nombre: nombreFinal }); } else { selectElement.selectedIndex = 0; } } }
function abrirModalTarea(editar) { document.getElementById('modal-tarea').classList.remove('hidden'); const titulo = document.getElementById('title-modal-tarea'); if(editar) { titulo.innerText = "Editar Actividad"; } else { titulo.innerText = "Nueva Actividad"; document.getElementById('form-tarea').reset(); document.getElementById('task-rowIndex').value = ""; } }
function editarTarea(index) { const t = tareasCache[index]; if(!t) return; abrirModalTarea(true); document.getElementById('task-rowIndex').value = t.rowIndex; document.getElementById('task-desc').value = t.actividad; document.getElementById('task-resp').value = t.responsable; document.getElementById('task-trafo').value = t.idTrafo; document.getElementById('task-prio').value = t.prioridad; }
function borrarTarea(rowIndex) { if(confirm("¿Eliminar esta actividad?")) { google.script.run.withSuccessHandler((listaActualizada) => { tareasCache = listaActualizada; renderizarTareas(listaActualizada); showToast("Actividad eliminada"); }).borrarActividad({ index: rowIndex }); } }
function cerrarModalTarea() { document.getElementById('modal-tarea').classList.add('hidden'); document.getElementById('form-tarea').reset(); }
function guardarTarea() { const datos = { rowIndex: document.getElementById('task-rowIndex').value, actividad: document.getElementById('task-desc').value, responsable: document.getElementById('task-resp').value, idTrafo: document.getElementById('task-trafo').value, prioridad: document.getElementById('task-prio').value }; const btn = document.querySelector('#modal-tarea button:last-child'); const txtOriginal = btn.innerText; btn.innerText = "Guardando..."; btn.disabled = true; google.script.run.withSuccessHandler((listaActualizada) => { cerrarModalTarea(); tareasCache = listaActualizada; renderizarTareas(listaActualizada); showToast(datos.rowIndex ? "Tarea actualizada" : "Tarea creada"); btn.innerText = txtOriginal; btn.disabled = false; }).crearNuevaActividad(datos); }
function moverTarea(ix, est) { google.script.run.withSuccessHandler((listaActualizada) => { tareasCache = listaActualizada; renderizarTareas(listaActualizada); }).actualizarEstadoActividad({ index: ix, estado: est }); }
function renderizarTareas(d) { ['pendiente', 'proceso', 'terminado'].forEach(k => { const col = document.getElementById('col-' + k); if(col) col.innerHTML = ''; }); d.forEach((t, index) => { const colName = t.estado === 'PENDIENTE' ? 'pendiente' : (t.estado === 'EN PROCESO' ? 'proceso' : 'terminado'); const col = document.getElementById('col-' + colName); if(!col) return; let botonAvance = ''; if(t.estado === 'PENDIENTE') { botonAvance = `<button onclick="moverTarea(${t.rowIndex},'EN PROCESO')" class="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 p-1.5 rounded-full shadow-sm" title="Iniciar Tarea"><i data-lucide="play" class="w-3 h-3"></i></button>`; } else if (t.estado === 'EN PROCESO') { botonAvance = `<button onclick="moverTarea(${t.rowIndex},'TERMINADO')" class="bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 p-1.5 rounded-full shadow-sm" title="Finalizar Tarea"><i data-lucide="check" class="w-3 h-3"></i></button>`; } const html = `<div class="task-card relative group bg-white p-3 rounded shadow-sm border border-slate-200 hover:shadow-md transition-all"><div class="text-[10px] text-slate-400 mb-1 flex justify-between font-mono"><span>${t.fecha}</span><span class="font-bold text-slate-600 bg-slate-100 px-1 rounded">${t.idTrafo||'S/N'}</span></div><p class="font-bold text-slate-800 text-sm mb-2 leading-tight pr-6">${t.actividad}</p><div class="absolute top-2 right-2">${botonAvance}</div><div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100"><div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700 border border-blue-200">${t.responsable ? t.responsable.charAt(0) : '?'}</div><span class="text-xs text-slate-500 font-medium truncate max-w-[100px]">${t.responsable}</span><div class="ml-auto flex gap-1 items-center">${t.prioridad === 'Alta' ? '<span class="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">ALTA</span>' : ''}<button onclick="editarTarea(${index})" class="p-1 text-slate-400 hover:text-blue-600"><i data-lucide="pencil" class="w-3 h-3"></i></button><button onclick="borrarTarea(${t.rowIndex})" class="p-1 text-slate-400 hover:text-red-600"><i data-lucide="trash-2" class="w-3 h-3"></i></button></div></div></div>`; col.insertAdjacentHTML('beforeend', html); }); if(typeof lucide !== 'undefined') lucide.createIcons(); }
function procesarFotosInmediato(input) { const idTrafo = document.getElementById('foto-trafo').value; if(!idTrafo) { alert("¡Escribe primero el ID del Trafo!"); input.value = ""; return; } if (input.files && input.files.length > 0) { const statusDiv = document.getElementById('status-fotos'); const listaDiv = document.getElementById('lista-fotos'); const etapa = document.getElementById('foto-etapa').value; statusDiv.innerHTML = '<span class="text-blue-600 animate-pulse">Iniciando carga secuencial...</span>'; const archivos = Array.from(input.files); (async () => { for (const file of archivos) { const divPreview = document.createElement('div'); divPreview.className = "bg-white p-2 rounded border flex justify-between items-center opacity-50 mb-1"; divPreview.innerHTML = `<span class="text-xs truncate font-bold w-2/3">${file.name}</span><span class="text-xs text-blue-500">Procesando...</span>`; listaDiv.prepend(divPreview); try { const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (e) => resolve(e.target.result); reader.onerror = (e) => reject(e); reader.readAsDataURL(file); }); await new Promise((resolve, reject) => { google.script.run.withSuccessHandler(res => { if(res.exito){ divPreview.className = "bg-green-50 p-2 rounded border flex justify-between items-center border-green-200 mb-1"; divPreview.innerHTML = `<span class="text-xs truncate font-bold text-green-800 w-2/3">${file.name}</span><a href="${res.url}" target="_blank" class="text-green-600"><i data-lucide="check" class="w-4 h-4"></i></a>`; if(typeof lucide !== 'undefined') lucide.createIcons(); resolve(); } else { divPreview.className = "bg-red-50 p-2 rounded border border-red-200 mb-1"; divPreview.innerHTML = `<span class="text-xs text-red-600">Error: ${res.error}</span>`; reject(res.error); } }).withFailureHandler(err => { divPreview.innerHTML = `<span class="text-xs text-red-600">Error Red: ${err}</span>`; reject(err); }).subirFotoProceso({ base64: base64, idTrafo: idTrafo, etapa: etapa }); }); } catch (error) { console.error("Error subiendo foto:", error); } } statusDiv.innerHTML = '<span class="text-green-600 font-bold">¡Carga completa!</span>'; setTimeout(() => { statusDiv.innerHTML = ''; }, 3000); input.value = ""; })(); } }
function abrirModalHistorico() { document.getElementById('modal-historico').classList.remove('hidden'); }
function guardarHistorico() { const d = { idJLB: document.getElementById('hist-idjlb').value, idGroup: document.getElementById('hist-idgroup').value, fecha: document.getElementById('hist-fecha').value, cliente: document.getElementById('hist-cliente').value, desc: document.getElementById('hist-desc').value, serie: document.getElementById('hist-serie').value, estado: document.getElementById('hist-estado').value }; google.script.run.withSuccessHandler(() => { document.getElementById('modal-historico').classList.add('hidden'); cargarProgramacion(); showToast("Histórico cargado"); }).cargarHistoricoManual(d); }
