/* JLB OPERACIONES - APP.JS (V24.3 - INTEGRACIÓN LEGACY ROBUSTA) */

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
        // NOTA TÉCNICA: Este adaptador serializa todo a JSON.
        // Google Apps Script recibe esto y lo descompone.
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
let listaReqTemp = []; // Lista editable (Borrador)
let historialReqCache = []; 
let canvas, ctx, isDrawing=false, indiceActual=-1;

// VARIABLES PARA EL ROBOT DE FOTOS
let COLA_FOTOS = [];
let PROCESANDO_COLA = false;

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
    if(selTipo.value === "") { } 

    renderPasosSeguimiento(d);
    
    // --- LÓGICA DE CARGA INTELIGENTE ---
    listaReqTemp = [];
    historialReqCache = [];
    document.getElementById('req-cant').value = "1";
    document.getElementById('req-desc').value = "";
    document.getElementById('req-edit-index').value = "-1";
    toggleEditMode(false);
    
    // Limpiamos listas visuales
    renderListaReqTemp();
    document.getElementById('lista-reqs').innerHTML = '<div class="text-center py-4 text-slate-400 italic text-xs">Cargando historial...</div>';

    const idUnico = d.idJLB || d.idGroup;
    if(idUnico) {
        cargarRequerimientos(idUnico);
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

// --- LOGICA REQUERIMIENTOS: PANEL INTEGRADO PRO ---

function agregarFilaReqTemp() {
    const descInput = document.getElementById('req-desc');
    const cantInput = document.getElementById('req-cant');
    const desc = descInput.value.trim().toUpperCase();
    const cant = cantInput.value;
    const index = parseInt(document.getElementById('req-edit-index').value);
    
    if (!desc) {
        showToast("Escribe una descripción", "error");
        descInput.focus();
        return;
    }
    
    if (index >= 0) {
        listaReqTemp[index] = { cant, desc };
        showToast("Item actualizado");
        toggleEditMode(false);
    } else {
        listaReqTemp.push({ cant, desc });
    }
    
    descInput.value = "";
    cantInput.value = "1";
    document.getElementById('req-edit-index').value = "-1";
    descInput.focus();
    
    renderListaReqTemp();
}

function editarItemTemp(i) {
    const item = listaReqTemp[i];
    document.getElementById('req-desc').value = item.desc;
    document.getElementById('req-cant').value = item.cant;
    document.getElementById('req-edit-index').value = i;
    
    toggleEditMode(true);
    document.getElementById('req-desc').focus();
}

function borrarReqTemp(index) {
    if(confirm("¿Borrar este item de la lista?")) {
        listaReqTemp.splice(index, 1);
        if (parseInt(document.getElementById('req-edit-index').value) === index) {
            cancelarEdicion();
        }
        renderListaReqTemp();
    }
}

function cancelarEdicion() {
    document.getElementById('req-desc').value = "";
    document.getElementById('req-cant').value = "1";
    document.getElementById('req-edit-index').value = "-1";
    toggleEditMode(false);
}

function toggleEditMode(isEditing) {
    const btnAdd = document.getElementById('btn-add-item');
    const btnCancel = document.getElementById('btn-cancel-edit');
    
    if (isEditing) {
        btnAdd.innerHTML = '<i data-lucide="refresh-cw"></i> ACTUALIZAR ITEM';
        btnAdd.classList.replace('bg-slate-800', 'bg-blue-600');
        btnAdd.classList.replace('hover:bg-slate-700', 'hover:bg-blue-700');
        btnCancel.classList.remove('hidden');
    } else {
        btnAdd.innerHTML = '<i data-lucide="plus-circle"></i> AGREGAR A LA LISTA';
        btnAdd.classList.replace('bg-blue-600', 'bg-slate-800');
        btnAdd.classList.replace('hover:bg-blue-700', 'hover:bg-slate-700');
        btnCancel.classList.add('hidden');
    }
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function renderListaReqTemp() {
    const tbody = document.getElementById('tbody-req-temp');
    const container = document.getElementById('lista-req-temp');
    const badge = document.getElementById('contador-temp');
    
    if (listaReqTemp.length === 0) { 
        container.classList.add('hidden'); 
        return; 
    }
    
    container.classList.remove('hidden');
    badge.innerText = listaReqTemp.length;
    tbody.innerHTML = "";
    
    listaReqTemp.forEach((item, i) => {
        tbody.innerHTML += `
            <div class="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div class="flex items-center gap-3 flex-1 cursor-pointer" onclick="editarItemTemp(${i})">
                    <div class="w-8 h-8 rounded bg-slate-200 flex items-center justify-center font-black text-slate-700 text-sm border border-slate-300">
                        ${item.cant}
                    </div>
                    <span class="font-bold text-slate-700 text-xs uppercase leading-tight">${item.desc}</span>
                </div>
                <button onclick="borrarReqTemp(${i})" class="text-red-400 hover:text-red-600 p-2"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        `;
    });
    
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

// ========================================================
// CARGAR REQUERIMIENTOS: CLASIFICACIÓN BORRADOR / HISTORIAL
// ========================================================
function cargarRequerimientos(idTrafo) {
    const divHistory = document.getElementById('lista-reqs');
    
    // Limpiamos visualmente antes de cargar
    divHistory.innerHTML = '<div class="text-center py-4 text-slate-400 italic text-xs">Cargando historial...</div>';
    
    google.script.run.withSuccessHandler(list => {
        divHistory.innerHTML = '';
        historialReqCache = []; 
        listaReqTemp = []; // Reiniciamos el borrador local para llenarlo con lo del servidor

        if(!list || list.length === 0) {
            divHistory.innerHTML = '<div class="text-center py-4 text-slate-300 text-xs">No hay historial.</div>';
            renderListaReqTemp(); // Actualiza contador a 0
            return;
        }
        
        list.forEach(r => {
            const textoMostrado = r.texto || r.descripcion || "Sin detalle";
            
            // LÓGICA DE SEPARACIÓN
            if (r.estado === "PENDIENTE") {
                // Es un borrador -> Lo recuperamos a la lista editable
                let cant = "1";
                let desc = textoMostrado;
                
                // Intentamos parsear "(5) TORNILLOS"
                const match = textoMostrado.match(/^\((\d+)\)\s*(.*)/);
                if (match) {
                    cant = match[1];
                    desc = match[2];
                }
                
                listaReqTemp.push({ cant: cant, desc: desc });

            } else {
                // Es historial (Enviado, Comprado, etc) -> Lo mostramos abajo solo lectura
                let color = "text-green-600";
                let icon = "check-circle";
                
                if(r.estado.includes("ENVIADO")) {
                    color = "text-blue-600";
                    icon = "send";
                }

                divHistory.innerHTML += `
                    <div class="bg-white border border-slate-100 p-3 rounded-xl shadow-sm flex justify-between items-center mb-2">
                        <div class="flex-1">
                            <p class="text-sm font-bold text-slate-700">${textoMostrado}</p>
                            <p class="text-[10px] text-slate-400 mt-1">${r.fecha} - ${r.autor}</p>
                        </div>
                        <div class="flex flex-col items-end">
                            <span class="font-bold ${color} text-[10px] uppercase bg-slate-50 px-2 py-1 rounded flex items-center gap-1">
                                <i data-lucide="${icon}" class="w-3 h-3"></i> ${r.estado}
                            </span>
                        </div>
                    </div>
                `;
            }
        });

        // Actualizamos la visualización del borrador con lo recuperado
        renderListaReqTemp();
        
        if(typeof lucide !== 'undefined') lucide.createIcons();

    }).withFailureHandler(e => {
        divHistory.innerHTML = `<div class="text-center py-4 text-red-400 text-xs">Error de conexión: ${e}</div>`;
    }).obtenerRequerimientos(idTrafo);
}

// ========================================================
// GUARDAR BORRADOR (MASIVO)
// ========================================================
function guardarTodoReq() {
    const d = datosProg[indiceActual];
    const idTrafo = d.idJLB || d.idGroup;
    
    if (!idTrafo) { alert("Error: No hay ID de Trafo"); return; }
    
    // Permitimos guardar lista vacía (para borrar todo el borrador si se desea)
    
    const btn = document.getElementById('btn-save-reqs');
    const txtOriginal = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> GUARDANDO...';
    if(typeof lucide !== 'undefined') lucide.createIcons();

    const payload = {
        idTrafo: idTrafo,
        items: listaReqTemp, // Enviamos toda la lista
        autor: "Producción"
    };

    google.script.run
        .withSuccessHandler(res => {
            btn.disabled = false; 
            btn.innerHTML = txtOriginal;
            if (res.success) {
                showToast("✅ Borrador sincronizado");
                // Recargamos para verificar que se guardó bien
                cargarRequerimientos(idTrafo);
            } else {
                alert("Error al guardar: " + res.error);
            }
        })
        .withFailureHandler(e => {
            btn.disabled = false; 
            btn.innerHTML = txtOriginal;
            alert("Error de red: " + e);
        })
        .guardarBorradorMasivo(payload); // Llamamos a la nueva función masiva
}

// ========================================================
// ENVIAR A ALMACÉN (API)
// ========================================================
function enviarAlmacenAPI() {
    const pendientes = listaReqTemp; // Usamos la lista local que está sincronizada
    if (pendientes.length === 0) {
        alert("⚠️ No hay items en el borrador para enviar.\nAgrega items a la lista primero.");
        return;
    }

    if (!confirm(`¿Confirmar envío de ${pendientes.length} items a Almacén?`)) return;

    // Primero aseguramos que esté guardado (Auto-Save antes de enviar)
    const d = datosProg[indiceActual];
    const idTrafo = d.idJLB || d.idGroup;
    const cliente = d.cliente;
    const prioridad = document.getElementById('req-prioridad-envio').value;

    showToast("Procesando envío...", "info");

    // Paso 1: Guardamos el borrador actual por seguridad
    const payloadGuardar = {
        idTrafo: idTrafo,
        items: listaReqTemp,
        autor: "Producción"
    };

    google.script.run.withSuccessHandler(resGuardar => {
        if(resGuardar.success) {
            // Paso 2: Si guardó bien, disparamos el envío
            const payloadEnviar = {
                idTrafo: idTrafo,
                cliente: cliente,
                prioridad: prioridad
            };

            google.script.run.withSuccessHandler(resEnvio => {
                if (resEnvio.success) {
                    showToast("🚀 " + resEnvio.msg);
                    cargarRequerimientos(idTrafo); // Esto moverá todo a historial
                } else {
                    alert("Error Almacén: " + resEnvio.error);
                }
            }).enviarPedidoAlmacen(payloadEnviar);

        } else {
            alert("Error guardando borrador previo: " + resGuardar.error);
        }
    }).guardarBorradorMasivo(payloadGuardar);
}

// RESTO DE FUNCIONES (Logística, Fotos, Tareas, etc.) - Sin cambios
function subLog(id) { document.querySelectorAll('.log-view').forEach(e=>e.classList.remove('active')); document.querySelectorAll('.log-btn').forEach(e=>e.classList.remove('active')); document.getElementById('view-'+id).classList.add('active'); document.getElementById('btn-log-'+id).classList.add('active'); if(id==='term') cargarTerminados(); if(id==='alq') cargarAlquiler(); if(id==='pat') cargarPatio(); }
function subNav(id) { document.querySelectorAll('.cp-view').forEach(e=>e.classList.remove('active')); document.querySelectorAll('.cp-btn').forEach(e=>e.classList.remove('active')); document.getElementById('view-'+id).classList.add('active'); document.getElementById('btn-cp-'+id).classList.add('active'); if(id === 'fot') cargarGaleriaFotos(); }
function cargarAlquiler() { google.script.run.withSuccessHandler(d => { datosAlq = d; filtrarAlquiler(); }).obtenerLogistica({ tipo: 'ALQUILER' }); }
function filtrarAlquiler() { const kva = document.getElementById('filtro-kva').value.toLowerCase(); const volt = document.getElementById('filtro-voltaje').value.toLowerCase(); const estadoFiltro = document.getElementById('filtro-estado').value; const t = document.getElementById('tabla-alq'); if(!t) return; t.innerHTML = ''; const filtrados = datosAlq.filter(item => { const matchKVA = kva === "" || item.kva.toString().toLowerCase().includes(kva); const matchVolt = volt === "" || item.voltajes.toString().toLowerCase().includes(volt); const matchEstado = estadoFiltro === "TODOS" || item.estado.toUpperCase().includes(estadoFiltro); return matchKVA && matchVolt && matchEstado; }); if(filtrados.length === 0) { t.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400">No hay coincidencias.</td></tr>'; return; } filtrados.forEach((r, i) => { const btnFoto = r.foto ? `<a href="${convertirLinkDrive(r.foto)}" target="_blank" class="text-blue-600 flex justify-center"><i data-lucide="image" class="w-5 h-5"></i></a>` : '<span class="text-slate-300">-</span>'; let badgeClass = 'bg-gray-100 text-slate-700'; if (r.estado.includes("DISPONIBLE")) badgeClass = 'bg-green-100 text-green-700'; else if (r.estado === "PRESTADO" || r.estado.includes("PRESTADO")) badgeClass = 'bg-blue-100 text-blue-700'; else if (r.estado.includes("MANTENIMIENTO")) badgeClass = 'bg-orange-100 text-orange-700'; else if (r.estado.includes("REPARACION")) badgeClass = 'bg-red-100 text-red-700'; const indexReal = datosAlq.indexOf(r); t.insertAdjacentHTML('beforeend', `<tr class="border-b hover:bg-slate-50"><td class="p-3 font-bold">${r.codigo}</td><td class="p-3 text-xs">${r.equipo}<br><span class="text-slate-400">${r.voltajes}</span></td><td class="p-3"><span class="text-[10px] px-2 py-1 rounded font-bold uppercase ${badgeClass}">${r.estado}</span></td><td class="p-3 text-xs">${r.cliente}</td><td class="p-3 text-xs">${r.fechas}</td><td class="p-3 text-center">${btnFoto}</td><td class="p-3 text-center"><button onclick="editarAlquiler(${indexReal})" class="text-blue-600 hover:bg-blue-100 p-2 rounded-full"><i data-lucide="pencil" class="w-4 h-4"></i></button></td></tr>`); }); if(typeof lucide !== 'undefined') lucide.createIcons(); }
function cargarGaleriaFotos() { const grid = document.getElementById('galeria-fotos-grid'); if(!grid) return; grid.innerHTML = '<div class="col-span-full text-center text-blue-500 py-8"><i data-lucide="loader-2" class="animate-spin w-8 h-8 mx-auto"></i><p class="text-xs mt-2">Sincronizando fotos recientes...</p></div>'; if(typeof lucide !== 'undefined') lucide.createIcons(); google.script.run .withSuccessHandler(fotos => { grid.innerHTML = ''; if(!fotos || fotos.length === 0) { grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300"><i data-lucide="image-off" class="w-8 h-8 mx-auto mb-2 opacity-50"></i><p>Aún no hay fotos registradas.</p></div>'; if(typeof lucide !== 'undefined') lucide.createIcons(); return; } fotos.forEach(f => { const directUrl = convertirLinkDrive(f.url); const card = `<div class="gallery-card relative group bg-white rounded-lg overflow-hidden aspect-square border border-slate-200 shadow-sm hover:shadow-lg transition-all cursor-pointer" onclick="window.open('${directUrl}', '_blank')"> <img src="${directUrl}" class="w-full h-full object-cover transition-transform group-hover:scale-105"> <div class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-3 pt-8"> <span class="text-white font-bold text-sm block shadow-black drop-shadow-md trafo-id">${f.idTrafo}</span> <span class="text-[10px] text-white/90 uppercase font-bold bg-black/30 px-1.5 py-0.5 rounded backdrop-blur-sm etapa-tag">${f.etapa}</span> </div> <div class="absolute top-2 right-2 bg-white/90 text-slate-700 text-[9px] px-2 py-1 rounded-full shadow-sm font-bold border border-slate-100"> ${f.fecha ? f.fecha.split(' ')[0] : 'Hoy'} </div> </div>`; grid.insertAdjacentHTML('beforeend', card); }); }) .withFailureHandler(error => { grid.innerHTML = `<div class="col-span-full text-center text-red-400 py-8"><i data-lucide="alert-triangle" class="w-8 h-8 mx-auto mb-2"></i><p>Error de conexión.</p><button onclick="cargarGaleriaFotos()" class="text-blue-500 underline mt-2">Reintentar</button></div>`; if(typeof lucide !== 'undefined') lucide.createIcons(); }) .obtenerUltimasFotos(); }
function filtrarFotos() { const idQuery = document.getElementById('filtro-foto-id').value.toUpperCase(); const etapaQuery = document.getElementById('filtro-foto-etapa').value.toUpperCase(); const cards = document.querySelectorAll('.gallery-card'); cards.forEach(card => { const idText = card.querySelector('.trafo-id').innerText.toUpperCase(); const etapaText = card.querySelector('.etapa-tag').innerText.toUpperCase(); const matchId = idText.includes(idQuery); const matchEtapa = etapaQuery === "TODAS" || etapaText.includes(etapaQuery); if(matchId && matchEtapa) { card.classList.remove('hidden'); } else { card.classList.add('hidden'); } }); }
function actualizarDatalistClientes(){ const dl = document.getElementById('lista-clientes'); if(!dl) return; dl.innerHTML = ''; dbClientes.forEach(c => { const opt = document.createElement('option'); opt.value = c.nombre; dl.appendChild(opt); }); }
function autocompletarCliente(input){ const val = input.value.toUpperCase(); const found = dbClientes.find(c => c.nombre === val); if(found){ document.getElementById('in-cedula-ent').value = found.nit; document.getElementById('in-telefono-ent').value = found.telefono; document.getElementById('in-contacto-ent').value = found.contacto; document.getElementById('in-ciudad-ent').value = found.ciudad; showToast("Cliente cargado"); } }
function abrirModalNuevaEntrada() { document.getElementById('modal-nueva-entrada').classList.remove('hidden'); setTimeout(initCanvas, 100); }
function cerrarModalNueva() { document.getElementById('modal-nueva-entrada').classList.add('hidden'); document.getElementById('form-entrada').reset(); limpiarFirma(); }
function filtrarProg() { const q = document.getElementById('searchProg').value.toLowerCase(); const tDesk = document.getElementById('tabla-prog-desktop'); const tMob = document.getElementById('lista-prog-mobile'); tDesk.innerHTML = ''; tMob.innerHTML = ''; const f = datosProg.filter(r => ((r.idJLB || "") + " " + (r.idGroup || "") + " " + (r.cliente || "") + " " + (r.desc || "") + " " + (r.estado || "")).toLowerCase().includes(q)); f.forEach(r => insertarFilaHTML(r, datosProg.indexOf(r), tDesk, tMob)); if(typeof lucide !== 'undefined') lucide.createIcons(); }
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
function abrirModalHistorico() { document.getElementById('modal-historico').classList.remove('hidden'); }
function guardarHistorico() { const d = { idJLB: document.getElementById('hist-idjlb').value, idGroup: document.getElementById('hist-idgroup').value, fecha: document.getElementById('hist-fecha').value, cliente: document.getElementById('hist-cliente').value, desc: document.getElementById('hist-desc').value, serie: document.getElementById('hist-serie').value, estado: document.getElementById('hist-estado').value }; google.script.run.withSuccessHandler(() => { document.getElementById('modal-historico').classList.add('hidden'); cargarProgramacion(); showToast("Histórico cargado"); }).cargarHistoricoManual(d); }

// =======================================================
// 🚀 MOTOR DE COLA DE SUBIDA (INTEGRADO EN APP.JS)
// =======================================================

// 2. INTERCEPTOR DE CÁMARA (Reemplaza la función original de bloqueo)
function procesarFotosInmediato(input) {
    if (input.files && input.files.length > 0) {
        const idTrafo = document.getElementById('foto-trafo').value.trim();
        const etapa = document.getElementById('foto-etapa').value;

        if (!idTrafo) {
            alert("⚠️ Escribe el ID del Transformador primero.");
            input.value = ""; // Limpiar input
            return;
        }

        // Procesamos cada archivo seleccionado (soporta ráfaga de galería también)
        Array.from(input.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const base64 = e.target.result; // Imagen en base64
                // ENCOLAR (No subir todavía)
                encolarFoto(base64, idTrafo, etapa);
            };
            reader.readAsDataURL(file);
        });

        // Limpiamos el input para permitir tomar la misma foto de nuevo si se desea
        input.value = "";
    }
}

// 3. FUNCIÓN DE ENCOLADO VISUAL
function encolarFoto(base64, idTrafo, etapa) {
    // Agregamos a la lista
    COLA_FOTOS.push({ base64: base64, id: idTrafo, etapa: etapa, intento: 0 });

    // Actualizamos UI
    actualizarIndicadorCola();
    
    // Mostrar miniatura en la lista visual (Feedback instantáneo para el usuario)
    agregarMiniaturaVisual(base64);

    // Despertamos al robot
    if (!PROCESANDO_COLA) {
        procesarCola();
    }
}

// 4. EL ROBOT (Procesa 1 a 1 en segundo plano)
// CORRECCIÓN CRÍTICA: ENVÍA 3 ARGUMENTOS SEPARADOS, NO UN OBJETO
function procesarCola() {
    if (COLA_FOTOS.length === 0) {
        PROCESANDO_COLA = false;
        actualizarIndicadorCola();
        return;
    }

    PROCESANDO_COLA = true;
    var tarea = COLA_FOTOS[0]; // Miramos la primera

    actualizarIndicadorCola(); // Mostrar "Subiendo..."

    google.script.run
        .withSuccessHandler(function(res) {
            if (res.exito) {
                console.log("✅ Foto subida: " + res.url);
                COLA_FOTOS.shift(); // Borrar de la cola
                marcarMiniaturaComoSubida(); // Poner check verde visual
            } else {
                console.warn("⚠️ Error subida: " + res.error);
                if (res.error === 'BUSY' && tarea.intento < 3) {
                    tarea.intento++;
                    setTimeout(function() { procesarCola(); }, 2000); // Reintentar
                    return; 
                } else {
                    COLA_FOTOS.shift(); // Descartar si falla mucho
                    alert("❌ Error subiendo una foto: " + res.error);
                }
            }
            procesarCola(); // Siguiente
        })
        .withFailureHandler(function(e) {
            console.error("Error Red: " + e);
            setTimeout(function() { procesarCola(); }, 3000); // Reintentar en 3s
        })
        // LA CLAVE: 3 ARGUMENTOS SEPARADOS PARA COINCIDIR CON V23.0
        .subirFotoProceso(tarea.base64, tarea.id, tarea.etapa);
}

// 5. UTILIDADES VISUALES
function actualizarIndicadorCola() {
    var div = document.getElementById('status-fotos');
    if (div) {
        if (COLA_FOTOS.length > 0) {
            div.innerText = "⏳ Subiendo " + COLA_FOTOS.length + " fotos...";
            div.style.color = "#eab308"; // Amarillo
        } else {
            div.innerText = "✅ Todo subido";
            div.style.color = "#22c55e"; // Verde
            setTimeout(() => { if(COLA_FOTOS.length===0) div.innerText = ""; }, 2000);
        }
    }
}

function agregarMiniaturaVisual(base64) {
    const lista = document.getElementById('lista-fotos');
    if (!lista) return;

    const div = document.createElement('div');
    div.className = "flex items-center gap-3 p-2 bg-slate-50 rounded border border-slate-200 foto-item-temp opacity-50"; // Opaco = Subiendo
    div.innerHTML = `
        <img src="${base64}" class="w-10 h-10 object-cover rounded">
        <div class="text-xs text-slate-500 font-bold flex-1">En cola...</div>
        <div class="loading-spinner w-3 h-3 border-2 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
    `;
    // Insertar al principio
    lista.insertBefore(div, lista.firstChild);
}

function marcarMiniaturaComoSubida() {
    const loadingItems = document.querySelectorAll('.foto-item-temp .loading-spinner');
    if(loadingItems.length > 0) {
        const spinner = loadingItems[loadingItems.length - 1]; // El más viejo visualmente abajo
        const row = spinner.parentElement;
        
        row.classList.remove('opacity-50');
        row.querySelector('.text-xs').innerText = "Subida OK";
        row.querySelector('.text-xs').classList.add('text-green-600');
        spinner.remove(); // Quitar spinner
        
        // Agregar check
        const check = document.createElement('i');
        check.setAttribute('data-lucide', 'check');
        check.className = "w-4 h-4 text-green-500";
        row.appendChild(check);
        lucide.createIcons();
    }
}
