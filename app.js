/* JLB OPERACIONES - APP.JS (ARQUITECTURA HEADLESS V4) */

// =============================================================
// 1. CONFIGURACIÓN DE CONEXIÓN
// =============================================================
// ⚠️ IMPORTANTE: Asegúrate de que esta URL sea la de tu nuevo despliegue (versión nueva)
const API_ENDPOINT = "https://script.google.com/macros/s/AKfycbxEJ7AKN6Qn8VhELXGdluYDsm2Of49bGJV0h28GWCSpKu9lv1YWbWIosq6gQ-jcKNYsJg/exec"; 

// =============================================================
// 2. ADAPTADOR GOOGLE -> GITHUB (ROBUSTO Y SIN PROXY LOOPS)
// =============================================================

class GoogleRunner {
    constructor(methodName) {
        this.methodName = methodName;
        this.successCallback = null;
        this.failureCallback = null;
    }

    withSuccessHandler(cb) {
        this.successCallback = cb;
        return this; // Permite encadenamiento
    }

    withFailureHandler(cb) {
        this.failureCallback = cb;
        return this; // Permite encadenamiento
    }

    // Método que ejecuta la llamada final (ej: .obtenerDatosProgramacion())
    // Se usa Proxy para capturar la llamada dinámica
    execute(payload) {
        // console.log(`🚀 API CALL: ${this.methodName}`, payload); // Descomentar para debug

        // TRUCO CORS DE GAS: Enviamos texto plano para evitar preflight OPTIONS
        // Google Apps Script recibe esto en e.postData.contents
        const requestBody = JSON.stringify({
            action: this.methodName,
            payload: payload
        });

        fetch(API_ENDPOINT, {
            method: 'POST',
            redirect: 'follow', // IMPORTANTE: Seguir la redirección 302 de Google
            headers: {
                "Content-Type": "text/plain;charset=utf-8" // Engaña al navegador para no hacer OPTIONS
            },
            body: requestBody
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'error') {
                console.error("❌ Error Backend:", data.message);
                if (this.failureCallback) this.failureCallback(data.message);
            } else {
                if (this.successCallback) this.successCallback(data);
            }
        })
        .catch(error => {
            console.error("❌ Error de Red:", error);
            if (this.failureCallback) this.failureCallback(error.toString());
        });
    }
}

// Simulamos el objeto google.script.run
const google = {
    script: {
        run: new Proxy({}, {
            get: function(target, prop) {
                // Si llaman a .withSuccessHandler directamente primero
                if (prop === 'withSuccessHandler') {
                    return (cb) => {
                        // Retornamos un Proxy que espera el nombre de la función
                        return new Proxy({}, {
                            get: (t, funcName) => {
                                const runner = new GoogleRunner(funcName);
                                runner.withSuccessHandler(cb);
                                return (payload) => runner.execute(payload);
                            }
                        });
                    };
                }
                
                // Si llaman a la función directamente: google.script.run.miFuncion()
                const runner = new GoogleRunner(prop);
                // Retornamos una función que al ejecutarse lanza el request
                // Pero también le pegamos los métodos de handler por si encadenan después (raro en GAS, pero posible)
                const executor = (payload) => runner.execute(payload);
                executor.withSuccessHandler = (cb) => { runner.withSuccessHandler(cb); return executor; };
                executor.withFailureHandler = (cb) => { runner.withFailureHandler(cb); return executor; };
                
                return executor;
            }
        })
    }
};


// =============================================================
// 3. TU LÓGICA ORIGINAL (INTACTA)
// =============================================================

// --- VARIABLES GLOBALES ---
let datosProg=[], datosEntradas=[], datosAlq=[], dbClientes = [], tareasCache = [];
let alqFotoBase64=null;
let canvas, ctx, isDrawing=false, indiceActual=-1;

// --- INIT ---
window.onload = function() { 
    if(typeof lucide !== 'undefined') lucide.createIcons();
    nav('programacion');
    // Carga inicial de clientes
    google.script.run.withSuccessHandler(d => {
        dbClientes = d;
        actualizarDatalistClientes();
    }).obtenerClientesDB();
};

// --- NAVEGACION ---
function nav(id) { 
    document.querySelectorAll('.view-section').forEach(e => e.classList.remove('active')); 
    const sec = document.getElementById(id); if(sec) sec.classList.add('active'); 
    document.getElementById('header-title').innerText = id.toUpperCase(); 
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-active')); 
    const btn = document.getElementById('btn-'+id); if(btn) btn.classList.add('nav-active'); 
    document.querySelectorAll('.nav-btn-mob').forEach(b => b.classList.remove('mobile-nav-active'));
    const mobBtn = document.getElementById('mob-'+id); if(mobBtn) mobBtn.classList.add('mobile-nav-active');

    if(id==='programacion') cargarProgramacion(); 
    if(id==='entradas') cargarEntradas(); 
    if(id==='logistica') subLog('term'); 
    if(id==='control') { cargarActividades(); subNav('act'); } 
    if(typeof lucide !== 'undefined') lucide.createIcons();
}
function irAlDashboard() { google.script.run.withSuccessHandler(url => window.open(url, '_top')).getUrlDashboard(); }
function abrirLaboratorio() { google.script.run.withSuccessHandler(url => window.open(url, '_blank')).getUrlLaboratorio(); }
function recargarActual() { nav(document.querySelector('.view-section.active').id); }

// --- MODULO PROGRAMACION & REQUERIMIENTOS ---
function cargarProgramacion(){ 
    const tDesk = document.getElementById('tabla-prog-desktop'); 
    const tMob = document.getElementById('lista-prog-mobile');
    tDesk.innerHTML='<tr><td colspan="5" class="text-center py-8 text-slate-500">Cargando...</td></tr>'; 
    tMob.innerHTML='<div class="text-center py-8 text-slate-500">Cargando...</div>';

    google.script.run.withSuccessHandler(d => { 
        datosProg = d; 
        tDesk.innerHTML = ''; tMob.innerHTML = '';
        if(d.length === 0) { const empty = '<div class="text-center py-4 text-slate-400">No hay datos recientes.</div>'; tDesk.innerHTML = `<tr><td colspan="5">${empty}</td></tr>`; tMob.innerHTML = empty; return; } 

        d.forEach((r,i) => { 
            let c = "row-default", badgeColor = "bg-slate-100 text-slate-600";
            const s = (r.estado || "").toUpperCase(); 
            if(s.includes("FINAL") || s.includes("ENTREGADO")) { c = "row-finalizado"; badgeColor = "bg-green-100 text-green-700"; }
            else if(s.includes("PROCESO") || s.includes("AUTO")) { c = "row-proceso"; badgeColor = "bg-blue-100 text-blue-700"; }
            else if(s.includes("PEND") || s.includes("SIN")) { c = "row-pendiente"; badgeColor = "bg-orange-100 text-orange-700"; }
            
            let b = `<span class="font-mono font-bold text-slate-700">${r.idJLB||'--'}</span>`; 
            if(r.idGroup) b += `<br><span class="bg-orange-100 text-orange-800 px-1 rounded text-[10px] font-bold">G:${r.idGroup}</span>`; 

            tDesk.insertAdjacentHTML('beforeend', `<tr class="border-b ${c} hover:bg-slate-50"><td class="px-6 py-4">${b}</td><td class="px-6 py-4 text-xs font-mono text-slate-600">${r.fecha||'S/F'}</td><td class="px-6 py-4 font-medium">${r.cliente}</td><td class="px-6 py-4"><span class="text-xs font-bold px-2 py-1 rounded ${badgeColor}">${r.estado}</span></td><td class="px-6 py-4 text-center"><button onclick="abrirModal(${i})" class="text-blue-600 hover:bg-blue-100 p-2 rounded-full transition-colors"><i data-lucide="pencil" class="w-4 h-4"></i></button></td></tr>`); 
            tMob.insertAdjacentHTML('beforeend', `<div class="mobile-card relative ${c} p-4" onclick="abrirModal(${i})"><div class="flex justify-between items-start mb-2"><div><span class="font-black text-lg text-slate-800">#${r.idJLB || r.idGroup}</span><span class="text-xs text-slate-500 block">${r.fecha}</span></div><span class="text-[10px] font-bold px-2 py-1 rounded ${badgeColor} uppercase tracking-wide">${r.estado}</span></div><h4 class="font-bold text-blue-900 text-base mb-1">${r.cliente}</h4><p class="text-sm text-slate-600 truncate">${r.desc}</p><div class="mt-3 pt-2 border-t border-slate-200/50 flex justify-end"><button class="text-blue-600 text-xs font-bold flex items-center gap-1 bg-white px-3 py-1.5 rounded-full border border-blue-100 shadow-sm"><i data-lucide="pencil" class="w-3 h-3"></i> EDITAR / VER</button></div></div>`);
        }); 
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }).obtenerDatosProgramacion(); 
}

function abrirModal(i){ 
    indiceActual = i; 
    const d = datosProg[i]; 
    document.getElementById('modal-detalle').classList.remove('hidden'); 
    document.getElementById('m-cliente').innerText = d.cliente; 
    document.getElementById('m-ids-badge').innerText = `ID: ${d.idJLB} | GRUPO: ${d.idGroup||'N/A'}`; 
    document.getElementById('date-f-oferta').value = fechaParaInput(d.f_oferta); 
    document.getElementById('input-obs-prog').value = d.observacion; 
    document.getElementById('input-remision-prog').value = d.remision; 
    document.getElementById('date-entrega').value = fechaParaInput(d.f_entrega); 
    document.getElementById('in-idgroup').value = d.idGroup; document.getElementById('in-serie').value = d.serie; 
    document.getElementById('in-ods').value = d.ods; document.getElementById('in-desc').value = d.desc; document.getElementById('in-tipo').value = d.tipo;
    
    // Render Steps
    const ps = [{id:'pruebas_ini',l:'1. Pruebas Iniciales'},{id:'desencube',l:'2. Desencube'},{id:'desensamble',l:'3. Desensamble'},{id:'bobinado',l:'4. Bobinado'},{id:'ensamble',l:'5. Ensamble'},{id:'horno',l:'6. Horno'},{id:'encube',l:'7. Encube'},{id:'pruebas_fin',l:'8. Pruebas Finales'},{id:'pintura',l:'9. Pintura'},{id:'listo',l:'10. Listo'}]; 
    const c = document.getElementById('steps-container'); c.innerHTML = ''; 
    ps.forEach(p => { 
        let hid = ""; 
        if(d.esAceite && p.id!=='listo' && p.id!=='pruebas_ini' && p.id!=='pruebas_fin') hid = "hidden"; 
        const v = fechaParaInput(d.fases[p.id]) || (p.id==='listo'?fechaParaInput(d.f_listo):""); 
        const dn = v !== ""; 
        c.insertAdjacentHTML('beforeend', `<div class="step-card ${dn?'done':''} ${hid}"><label class="text-[10px] font-bold uppercase mb-1 ${dn?'text-green-700':'text-slate-400'}">${p.l}</label><input type="date" id="date-${p.id}" value="${v}" class="date-input"></div>`); 
    }); 
    
    // CARGAR REQUERIMIENTOS (NUEVO)
    const idParaReq = d.idJLB && d.idJLB.toString().length > 1 ? d.idJLB : d.idGroup;
    cargarRequerimientosModal(idParaReq);
    
    switchTab('seg'); 
}

// LOGICA REQUERIMIENTOS
function cargarRequerimientosModal(idTrafo) {
    const c = document.getElementById('lista-reqs');
    c.innerHTML = '<p class="text-center text-slate-400 text-xs py-4 animate-pulse">Cargando lista...</p>';
    google.script.run.withSuccessHandler(lista => renderListaReqs(lista)).obtenerRequerimientos(idTrafo);
}

function renderListaReqs(lista) {
    const c = document.getElementById('lista-reqs');
    c.innerHTML = '';
    if(lista.length === 0) { c.innerHTML = '<p class="text-center text-slate-400 text-xs py-4">Sin requerimientos.</p>'; return; }
    lista.forEach(r => {
        c.insertAdjacentHTML('beforeend', `
            <div class="bg-white p-2 rounded border border-slate-200 flex justify-between items-start mb-2">
                <div><p class="text-sm font-bold text-slate-700">${r.texto}</p><p class="text-[10px] text-slate-400">${r.fecha} - ${r.autor}</p></div>
                <button onclick="borrarReq(${r.idReq})" class="text-red-400 hover:text-red-600"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </div>`);
    });
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function guardarNuevoReq() {
    const txt = document.getElementById('txt-nuevo-req').value;
    if(!txt.trim()) return;
    const ids = document.getElementById('m-ids-badge').innerText; 
    // Extraer el ID correcto (JLB o Group)
    let idTrafo = ids.split('|')[0].replace('ID:', '').trim();
    if(idTrafo === 'undefined' || idTrafo === '') idTrafo = ids.split('|')[1].replace('GRUPO:', '').trim();

    const btn = document.querySelector('#view-req button'); btn.disabled = true;
    google.script.run.withSuccessHandler(lista => {
        document.getElementById('txt-nuevo-req').value = ''; renderListaReqs(lista); btn.disabled = false; showToast("Agregado");
    }).guardarRequerimiento({ idTrafo: idTrafo, texto: txt, autor: "OPERACIONES" });
}
function borrarReq(idReq) { 
    if(!confirm("¿Borrar?")) return;
    const ids = document.getElementById('m-ids-badge').innerText; 
    let idTrafo = ids.split('|')[0].replace('ID:', '').trim();
    if(idTrafo === 'undefined' || idTrafo === '') idTrafo = ids.split('|')[1].replace('GRUPO:', '').trim();
    google.script.run.withSuccessHandler(lista => renderListaReqs(lista)).borrarRequerimiento(idReq, idTrafo);
}

function guardarCambios(){ 
    const b = document.getElementById('btn-guardar-prog'); const txtOriginal = b.innerHTML; b.innerHTML = 'GUARDANDO...'; b.disabled = true; 
    const c = { f_oferta: document.getElementById('date-f-oferta').value, observacion: document.getElementById('input-obs-prog').value, remision: document.getElementById('input-remision-prog').value, entrega: document.getElementById('date-entrega').value, pruebas_ini: document.getElementById('date-pruebas_ini').value, desencube: document.getElementById('date-desencube').value, desensamble: document.getElementById('date-desensamble').value, bobinado: document.getElementById('date-bobinado').value, ensamble: document.getElementById('date-ensamble').value, horno: document.getElementById('date-horno').value, encube: document.getElementById('date-encube').value, pruebas_fin: document.getElementById('date-pruebas_fin').value, pintura: document.getElementById('date-pruebas_fin').value, listo: document.getElementById('date-listo').value, idGroup: document.getElementById('in-idgroup').value, serie: document.getElementById('in-serie').value, ods: document.getElementById('in-ods').value, desc: document.getElementById('in-desc').value, tipo: document.getElementById('in-tipo').value }; 
    google.script.run.withSuccessHandler(() => { b.innerHTML = txtOriginal; b.disabled = false; cerrarModal(); cargarProgramacion(); showToast("Cambios guardados"); }).withFailureHandler(e => { b.innerHTML = txtOriginal; b.disabled = false; showToast("Error: " + e, 'error'); }).guardarAvance({rowIndex: datosProg[indiceActual].rowIndex, cambios: c}); 
}

// --- MODULO ENTRADAS (ASINCRONO) ---
function enviarFormulario(){
    const b = document.getElementById('btn-crear'); const txtOriginal = b.innerHTML; b.innerHTML = 'PROCESANDO...'; b.disabled = true;
    const f = document.getElementById('form-entrada'); const d = new FormData(f);
    const dt = { empresa: d.get('empresa'), cliente: d.get('cliente'), cedula: d.get('cedula'), contacto: d.get('contacto'), telefono: d.get('telefono'), ciudad: d.get('ciudad'), descripcion: d.get('descripcion'), cantidad: d.get('cantidad'), observaciones: d.get('observaciones'), quienEntrega: d.get('quienEntrega'), quienRecibe: d.get('quienRecibe'), codigo: d.get('codigo'), firmaBase64: getFirmaBase64() };
    
    // 1. Guardado Rápido
    google.script.run.withSuccessHandler(r => {
        if(r.exito) {
            cerrarModalNueva(); b.innerHTML = txtOriginal; b.disabled = false;
            // UI Update Immediate
            renderCardEntrada({ id: r.id, fecha: r.fecha, cliente: dt.cliente, descripcion: dt.descripcion, codigo: r.datosCompletos.codigo, cantidad: dt.cantidad, pdf: null, rowIndex: r.rowIndex }, document.getElementById('grid-entradas'), true);
            showToast("Entrada guardada. Generando PDF...");
            if(!dbClientes.find(c => c.nombre === dt.cliente.toUpperCase())) { dbClientes.push({nombre: dt.cliente.toUpperCase(), nit: dt.cedula, telefono: dt.telefono, contacto: dt.contacto, ciudad: dt.ciudad}); actualizarDatalistClientes(); }
            
            // 2. Generación PDF (Fondo)
            const cardAct = document.getElementById(`act-${r.id}`);
            if(cardAct) { cardAct.innerHTML = '<div class="text-xs text-yellow-600 font-bold text-center animate-pulse">CREANDO PDF...</div>'; google.script.run.withSuccessHandler(x => { if(x.exito && cardAct) { cardAct.innerHTML = `<a href="${x.url}" target="_blank" class="w-full bg-red-50 text-red-600 py-2 rounded text-xs font-bold flex justify-center gap-2"><i data-lucide="file-text" class="w-4 h-4"></i> VER PDF</a>`; if(typeof lucide !== 'undefined') lucide.createIcons(); showToast("PDF Listo"); } }).generarPDFBackground(r.id, r.rowIndex, r.datosCompletos); }
        } else { alert("Error: " + r.error); b.innerHTML = txtOriginal; b.disabled = false; }
    }).withFailureHandler(e => { b.innerHTML = txtOriginal; b.disabled = false; showToast("Error: " + e, 'error'); }).registrarEntradaRapida(dt);
}

function cargarEntradas() { const g = document.getElementById('grid-entradas'); g.innerHTML='<p class="col-span-full text-center py-4">Cargando...</p>'; google.script.run.withSuccessHandler(d => { datosEntradas = d; g.innerHTML = ''; if(d.length === 0) g.innerHTML = '<p class="col-span-full text-center">Sin registros.</p>'; d.forEach(i => renderCardEntrada(i, g, false)); if(typeof lucide !== 'undefined') lucide.createIcons(); }).obtenerDatosEntradas(); }
function renderCardEntrada(i, c, p){ const cid = `card-${i.id}`; const pdf = (i.pdf && i.pdf.length > 5) ? `<a href="${i.pdf}" target="_blank" class="w-full bg-red-50 text-red-600 py-2 rounded text-xs font-bold flex justify-center gap-2"><i data-lucide="file-text" class="w-4 h-4"></i> VER PDF</a>` : `<button id="btn-gen-${i.id}" onclick="genPDF(${i.id},${i.rowIndex})" class="w-full bg-slate-800 text-white hover:bg-slate-900 py-2 rounded text-xs font-bold flex justify-center gap-2"><i data-lucide="file-plus" class="w-4 h-4"></i> GENERAR</button>`; const ziur = `${i.cantidad||1} / ${i.codigo||'S/C'} / ${i.descripcion}`; const h = `<div id="${cid}" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative"><button onclick="copiarTexto('${ziur}')" class="absolute top-4 right-4 text-slate-400 hover:text-blue-600"><i data-lucide="copy" class="w-5 h-5"></i></button><div><div class="flex justify-between mb-2"><span class="font-bold text-lg">#${i.id}</span><span class="text-xs bg-slate-100 px-2 py-1 rounded">${i.fecha}</span></div><div class="bg-blue-50 text-blue-800 text-xs font-mono px-2 py-1 rounded w-fit mb-2">🏷️ ${i.codigo||'---'}</div><h4 class="font-bold text-blue-600 mb-1">${i.cliente}</h4><p class="text-sm text-slate-500 line-clamp-2">${i.descripcion}</p></div><div class="pt-3 border-t mt-4" id="act-${i.id}">${pdf}</div></div>`; if(p) c.insertAdjacentHTML('afterbegin', h); else c.insertAdjacentHTML('beforeend', h); }
function genPDF(id, rix){ const b = document.getElementById(`btn-gen-${id}`); if(b) { const o = b.innerHTML; b.innerHTML = '...'; b.disabled = true; google.script.run.withSuccessHandler(r => { if(r.exito) { b.parentElement.innerHTML = `<a href="${r.url}" target="_blank" class="w-full bg-red-50 text-red-600 py-2 rounded text-xs font-bold flex justify-center gap-2"><i data-lucide="file-text" class="w-4 h-4"></i> VER PDF</a>`; if(typeof lucide !== 'undefined') lucide.createIcons(); } else { alert(r.error); b.innerHTML = o; b.disabled = false; } }).generarPDFBackground(id, rix, null); } }

// --- UTILS COMPARTIDOS ---
function showToast(msg, type = 'success') { const container = document.getElementById('toast-container'); const el = document.createElement('div'); el.className = `toast ${type}`; el.innerHTML = type === 'success' ? `<i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i><span class="font-bold text-sm text-slate-700">${msg}</span>` : `<i data-lucide="alert-circle" class="w-5 h-5 text-red-600"></i><span class="font-bold text-sm text-slate-700">${msg}</span>`; container.appendChild(el); if(typeof lucide !== 'undefined') lucide.createIcons(); setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000); }
function fechaParaInput(f){ if(!f) return ""; if(f.includes("-") && f.length===10) return f; if(f.includes("/")){ const p = f.split("/"); return `${p[2]}-${p[1]}-${p[0]}`; } return ""; }
function copiarTexto(t){ navigator.clipboard.writeText(t).then(()=>showToast("Copiado")); }
function switchTab(t){ document.querySelectorAll('.tab-content').forEach(e=>e.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(e=>e.classList.remove('active')); document.getElementById('view-'+t).classList.add('active'); document.getElementById('tab-btn-'+t).classList.add('active'); }
function cerrarModal() { document.getElementById('modal-detalle').classList.add('hidden'); }
function subLog(id) { document.querySelectorAll('.log-view').forEach(e=>e.classList.remove('active')); document.querySelectorAll('.log-btn').forEach(e=>e.classList.remove('active')); document.getElementById('view-'+id).classList.add('active'); document.getElementById('btn-log-'+id).classList.add('active'); if(id==='term') cargarTerminados(); if(id==='alq') cargarAlquiler(); if(id==='pat') cargarPatio(); }
function subNav(id) { document.querySelectorAll('.cp-view').forEach(e=>e.classList.remove('active')); document.querySelectorAll('.cp-btn').forEach(e=>e.classList.remove('active')); document.getElementById('view-'+id).classList.add('active'); document.getElementById('btn-cp-'+id).classList.add('active'); }

// --- FUNCIONES EXTRA ---
function cargarTerminados() { google.script.run.withSuccessHandler(d => { const c = document.getElementById('lista-terminados'); c.innerHTML = ''; if(d.length === 0) c.innerHTML = '<p class="text-center text-slate-400 py-4">Sin pendientes.</p>'; d.forEach(i => { const txt = `ENTRADA: ${i.id} | CLIENTE: ${i.cliente} | EQUIPO: ${i.desc} | ODS: ${i.ods}`; c.insertAdjacentHTML('beforeend', `<div class="bg-white border border-green-200 p-4 rounded-lg shadow-sm flex justify-between items-center"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600"><i data-lucide="check" class="w-6 h-6"></i></div><div><h4 class="font-bold text-slate-700">${i.cliente}</h4><p class="text-xs text-slate-500">${i.desc} (ID: ${i.id})</p></div></div><button onclick="copiarTexto('${txt}')" class="bg-slate-100 text-slate-600 p-2 rounded hover:bg-slate-200"><i data-lucide="copy" class="w-4 h-4"></i></button></div>`); }); if(typeof lucide !== 'undefined') lucide.createIcons(); }).obtenerLogistica('TERMINADOS'); }
function actualizarDatalistClientes(){ const dl = document.getElementById('lista-clientes'); dl.innerHTML = ''; dbClientes.forEach(c => { const opt = document.createElement('option'); opt.value = c.nombre; dl.appendChild(opt); }); }
function autocompletarCliente(input){ const val = input.value.toUpperCase(); const found = dbClientes.find(c => c.nombre === val); if(found){ document.getElementById('in-cedula-ent').value = found.nit; document.getElementById('in-telefono-ent').value = found.telefono; document.getElementById('in-contacto-ent').value = found.contacto; document.getElementById('in-ciudad-ent').value = found.ciudad; showToast("Cliente cargado"); } }
function abrirModalNuevaEntrada() { document.getElementById('modal-nueva-entrada').classList.remove('hidden'); setTimeout(initCanvas, 100); }
function cerrarModalNueva() { document.getElementById('modal-nueva-entrada').classList.add('hidden'); document.getElementById('form-entrada').reset(); limpiarFirma(); }
function filtrarProg() { const q = document.getElementById('searchProg').value.toLowerCase(); if(datosProg.length === 0) return; const f = datosProg.filter(r => ((r.idJLB || "") + " " + (r.idGroup || "") + " " + (r.cliente || "") + " " + (r.desc || "") + " " + (r.estado || "") + " " + (r.tipo || "") + " " + (r.serie || "")).toLowerCase().includes(q)); const tDesk = document.getElementById('tabla-prog-desktop'); const tMob = document.getElementById('lista-prog-mobile'); tDesk.innerHTML = ''; tMob.innerHTML = ''; f.forEach((r) => { const indexReal = datosProg.indexOf(r); let c = "row-default"; let badgeColor = "bg-slate-100 text-slate-600"; const s = (r.estado || "").toUpperCase(); if(s.includes("FINAL") || s.includes("ENTREGADO")) { c = "row-finalizado"; badgeColor = "bg-green-100 text-green-700"; } else if(s.includes("PROCESO") || s.includes("AUTO")) { c = "row-proceso"; badgeColor = "bg-blue-100 text-blue-700"; } else if(s.includes("PEND") || s.includes("SIN")) { c = "row-pendiente"; badgeColor = "bg-orange-100 text-orange-700"; } let b = `<span class="font-mono font-bold text-slate-700">${r.idJLB||'--'}</span>`; if(r.idGroup) b += `<br><span class="bg-orange-100 text-orange-800 px-1 rounded text-[10px] font-bold">G:${r.idGroup}</span>`; tDesk.insertAdjacentHTML('beforeend', `<tr class="border-b ${c} hover:bg-slate-50"><td class="px-6 py-4">${b}</td><td class="px-6 py-4 text-xs font-mono text-slate-600">${r.fecha||'S/F'}</td><td class="px-6 py-4 font-medium">${r.cliente}</td><td class="px-6 py-4"><span class="text-xs font-bold px-2 py-1 rounded ${badgeColor}">${r.estado}</span></td><td class="px-6 py-4 text-center"><button onclick="abrirModal(${indexReal})" class="text-blue-600 hover:bg-blue-100 p-2 rounded-full transition-colors"><i data-lucide="pencil" class="w-4 h-4"></i></button></td></tr>`); tMob.insertAdjacentHTML('beforeend', `<div class="mobile-card relative ${c} p-4" onclick="abrirModal(${indexReal})"><div class="flex justify-between items-start mb-2"><div><span class="font-black text-lg text-slate-800">#${r.idJLB || r.idGroup}</span><span class="text-xs text-slate-500 block">${r.fecha}</span></div><span class="text-[10px] font-bold px-2 py-1 rounded ${badgeColor} uppercase tracking-wide">${r.estado}</span></div><h4 class="font-bold text-blue-900 text-base mb-1">${r.cliente}</h4><p class="text-sm text-slate-600 truncate">${r.desc}</p><div class="mt-3 pt-2 border-t border-slate-200/50 flex justify-end"><button class="text-blue-600 text-xs font-bold flex items-center gap-1 bg-white px-3 py-1.5 rounded-full border border-blue-100 shadow-sm"><i data-lucide="pencil" class="w-3 h-3"></i> EDITAR / VER</button></div></div>`); }); if(typeof lucide !== 'undefined') lucide.createIcons(); }
function cargarActividades() { google.script.run.withSuccessHandler(list => { const s = document.getElementById('task-resp'); const sel = s.value; let html = list.map(n => `<option value="${n}">${n}</option>`).join(''); html += `<option value="CREAR_NUEVO" class="font-bold text-blue-600 bg-blue-50">[ + CREAR NUEVO ]</option>`; s.innerHTML = html; if(list.includes(sel)) s.value = sel; }).obtenerTrabajadores(); google.script.run.withSuccessHandler(d => { tareasCache = d; renderizarTareas(d); }).obtenerActividades(); }
function verificarNuevoResponsable(selectElement) { if (selectElement.value === 'CREAR_NUEVO') { const nuevoNombre = prompt("Ingrese el nombre del nuevo integrante:"); if (nuevoNombre && nuevoNombre.trim().length > 0) { const nombreFinal = nuevoNombre.trim().toUpperCase(); const opcionCarga = document.createElement("option"); opcionCarga.text = "Guardando..."; selectElement.add(opcionCarga, selectElement[0]); selectElement.selectedIndex = 0; selectElement.disabled = true; google.script.run.withSuccessHandler(nuevaLista => { let html = nuevaLista.map(n => `<option value="${n}">${n}</option>`).join(''); html += `<option value="CREAR_NUEVO" class="font-bold text-blue-600 bg-blue-50">[ + CREAR NUEVO ]</option>`; selectElement.innerHTML = html; selectElement.value = nombreFinal; if (selectElement.value !== nombreFinal) selectElement.selectedIndex = 0; selectElement.disabled = false; showToast("Trabajador creado"); }).crearTrabajador(nombreFinal); } else { selectElement.selectedIndex = 0; } } }
function abrirModalTarea(editar) { document.getElementById('modal-tarea').classList.remove('hidden'); const titulo = document.getElementById('title-modal-tarea'); if(editar) { titulo.innerText = "Editar Actividad"; } else { titulo.innerText = "Nueva Actividad"; document.getElementById('form-tarea').reset(); document.getElementById('task-rowIndex').value = ""; } }
function editarTarea(index) { const t = tareasCache[index]; if(!t) return; abrirModalTarea(true); document.getElementById('task-rowIndex').value = t.rowIndex; document.getElementById('task-desc').value = t.actividad; document.getElementById('task-resp').value = t.responsable; document.getElementById('task-trafo').value = t.idTrafo; document.getElementById('task-prio').value = t.prioridad; }
function borrarTarea(rowIndex) { if(confirm("¿Eliminar esta actividad?")) { google.script.run.withSuccessHandler((listaActualizada) => { tareasCache = listaActualizada; renderizarTareas(listaActualizada); showToast("Actividad eliminada"); }).borrarActividad(rowIndex); } }
function cerrarModalTarea() { document.getElementById('modal-tarea').classList.add('hidden'); document.getElementById('form-tarea').reset(); }
function guardarTarea() { const datos = { rowIndex: document.getElementById('task-rowIndex').value, actividad: document.getElementById('task-desc').value, responsable: document.getElementById('task-resp').value, idTrafo: document.getElementById('task-trafo').value, prioridad: document.getElementById('task-prio').value }; const btn = document.querySelector('#modal-tarea button:last-child'); const txtOriginal = btn.innerText; btn.innerText = "Guardando..."; btn.disabled = true; google.script.run.withSuccessHandler((listaActualizada) => { cerrarModalTarea(); tareasCache = listaActualizada; renderizarTareas(listaActualizada); showToast(datos.rowIndex ? "Tarea actualizada" : "Tarea creada"); btn.innerText = txtOriginal; btn.disabled = false; }).crearNuevaActividad(datos); }
function moverTarea(ix, est) { google.script.run.withSuccessHandler((listaActualizada) => { tareasCache = listaActualizada; renderizarTareas(listaActualizada); }).actualizarEstadoActividad(ix, est); }
function renderizarTareas(d) { ['pendiente', 'proceso', 'terminado'].forEach(k => document.getElementById('col-' + k).innerHTML = ''); d.forEach((t, index) => { const col = t.estado === 'PENDIENTE' ? 'pendiente' : (t.estado === 'EN PROCESO' ? 'proceso' : 'terminado'); let botonAvance = ''; if(t.estado === 'PENDIENTE') { botonAvance = `<button onclick="moverTarea(${t.rowIndex},'EN PROCESO')" class="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 p-1.5 rounded-full shadow-sm" title="Iniciar Tarea"><i data-lucide="play" class="w-3 h-3"></i></button>`; } else if (t.estado === 'EN PROCESO') { botonAvance = `<button onclick="moverTarea(${t.rowIndex},'TERMINADO')" class="bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 p-1.5 rounded-full shadow-sm" title="Finalizar Tarea"><i data-lucide="check" class="w-3 h-3"></i></button>`; } const html = `<div class="task-card relative group bg-white p-3 rounded shadow-sm border border-slate-200 hover:shadow-md transition-all"><div class="text-[10px] text-slate-400 mb-1 flex justify-between font-mono"><span>${t.fecha}</span><span class="font-bold text-slate-600 bg-slate-100 px-1 rounded">${t.idTrafo||'S/N'}</span></div><p class="font-bold text-slate-800 text-sm mb-2 leading-tight pr-6">${t.actividad}</p><div class="absolute top-2 right-2">${botonAvance}</div><div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100"><div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700 border border-blue-200">${t.responsable ? t.responsable.charAt(0) : '?'}</div><span class="text-xs text-slate-500 font-medium truncate max-w-[100px]">${t.responsable}</span><div class="ml-auto flex gap-1 items-center">${t.prioridad === 'Alta' ? '<span class="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">ALTA</span>' : ''}<button onclick="editarTarea(${index})" class="p-1 text-slate-400 hover:text-blue-600"><i data-lucide="pencil" class="w-3 h-3"></i></button><button onclick="borrarTarea(${t.rowIndex})" class="p-1 text-slate-400 hover:text-red-600"><i data-lucide="trash-2" class="w-3 h-3"></i></button></div></div></div>`; document.getElementById('col-' + col).insertAdjacentHTML('beforeend', html); }); if(typeof lucide !== 'undefined') lucide.createIcons(); }
function initCanvas() { canvas = document.getElementById('signature-pad'); ctx = canvas.getContext('2d'); const rect = canvas.parentElement.getBoundingClientRect(); canvas.width = rect.width; canvas.height = rect.height; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000'; canvas.addEventListener('mousedown', startDraw); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', endDraw); canvas.addEventListener('mouseout', endDraw); canvas.addEventListener('touchstart', (e)=>{e.preventDefault();startDraw(e.touches[0])}); canvas.addEventListener('touchmove', (e)=>{e.preventDefault();draw(e.touches[0])}); canvas.addEventListener('touchend', (e)=>{e.preventDefault();endDraw()}); }
function startDraw(e) { isDrawing = true; const r = canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo((e.clientX||e.pageX)-r.left, (e.clientY||e.pageY)-r.top); }
function draw(e) { if(!isDrawing)return; const r = canvas.getBoundingClientRect(); ctx.lineTo((e.clientX||e.pageX)-r.left, (e.clientY||e.pageY)-r.top); ctx.stroke(); }
function endDraw() { isDrawing = false; }
function limpiarFirma() { ctx.clearRect(0,0,canvas.width,canvas.height); }
function getFirmaBase64() { const b = document.createElement('canvas'); b.width = canvas.width; b.height = canvas.height; return canvas.toDataURL() === b.toDataURL() ? null : canvas.toDataURL('image/png'); }
function abrirModalHistorico() { document.getElementById('modal-historico').classList.remove('hidden'); }
function guardarHistorico() { const d = { idJLB: document.getElementById('hist-idjlb').value, idGroup: document.getElementById('hist-idgroup').value, fecha: document.getElementById('hist-fecha').value, cliente: document.getElementById('hist-cliente').value, desc: document.getElementById('hist-desc').value, serie: document.getElementById('hist-serie').value, estado: document.getElementById('hist-estado').value }; google.script.run.withSuccessHandler(() => { document.getElementById('modal-historico').classList.add('hidden'); cargarProgramacion(); showToast("Histórico cargado"); }).cargarHistoricoManual(d); }
function cargarAlquiler() { google.script.run.withSuccessHandler(d => { datosAlq = d; const t = document.getElementById('tabla-alq'); t.innerHTML = ''; d.forEach((r, i) => { const btnFoto = r.foto ? `<a href="${r.foto}" target="_blank" class="text-blue-600"><i data-lucide="image" class="w-4 h-4"></i></a>` : '-'; let badgeClass = 'bg-gray-100 text-slate-700'; if (r.estado.includes("DISPONIBLE")) badgeClass = 'bg-green-100 text-green-700'; else if (r.estado === "PRESTADO") badgeClass = 'bg-blue-100 text-blue-700'; else if (r.estado.includes("MANTENIMIENTO")) badgeClass = 'bg-orange-100 text-orange-700'; else if (r.estado.includes("REPARACION")) badgeClass = 'bg-red-100 text-red-700'; t.insertAdjacentHTML('beforeend', `<tr class="border-b hover:bg-slate-50"><td class="p-3 font-bold">${r.codigo}</td><td class="p-3 text-xs">${r.equipo}<br><span class="text-slate-400">${r.voltajes}</span></td><td class="p-3"><span class="text-[10px] px-2 py-1 rounded font-bold uppercase ${badgeClass}">${r.estado}</span></td><td class="p-3 text-xs">${r.cliente}</td><td class="p-3 text-xs">${r.fechas}</td><td class="p-3 text-center">${btnFoto}</td><td class="p-3 text-center"><button onclick="editarAlquiler(${i})" class="text-blue-600 hover:bg-blue-100 p-2 rounded-full"><i data-lucide="pencil" class="w-4 h-4"></i></button></td></tr>`); }); if(typeof lucide !== 'undefined') lucide.createIcons(); }).obtenerLogistica('ALQUILER'); }
function editarAlquiler(i) { const d = datosAlq[i]; abrirModalAlq(false); document.getElementById('title-modal-alq').innerText = "Editar Alquiler"; document.getElementById('alq-codigo').value = d.codigo; document.getElementById('alq-codigo').readOnly = true; document.getElementById('alq-kva').value = d.kva; document.getElementById('alq-marca').value = d.marca; document.getElementById('alq-volt').value = d.voltajes; document.getElementById('alq-cliente').value = d.cliente; document.getElementById('alq-salida').value = fechaParaInput(d.salida); document.getElementById('alq-regreso').value = fechaParaInput(d.regreso); const sel = document.getElementById('alq-estado-manual'); if(d.estado.includes("DISPONIBLE") || d.estado.includes("MANTENIMIENTO") || d.estado.includes("REPARACION")) { sel.value = d.estado; } else { sel.value = "TALLER / DISPONIBLE"; } if(d.foto) { document.getElementById('alq-preview').src = d.foto; document.getElementById('alq-preview').classList.remove('hidden'); } else { document.getElementById('alq-preview').classList.add('hidden'); } alqFotoBase64 = null; }
function abrirModalAlq(nuevo) { document.getElementById('modal-alq').classList.remove('hidden'); const btn = document.getElementById('btn-alq-save'); btn.innerText = "Guardar"; btn.disabled = false; if(nuevo) { document.getElementById('title-modal-alq').innerText = "Registrar Nuevo"; document.getElementById('form-alq').reset(); document.getElementById('alq-codigo').readOnly = false; document.getElementById('alq-preview').classList.add('hidden'); alqFotoBase64 = null; } }
function cerrarModalAlq() { document.getElementById('modal-alq').classList.add('hidden'); }
function guardarAlquiler() { const d = { codigo: document.getElementById('alq-codigo').value, kva: document.getElementById('alq-kva').value, marca: document.getElementById('alq-marca').value, voltajes: document.getElementById('alq-volt').value, cliente: document.getElementById('alq-cliente').value, salida: document.getElementById('alq-salida').value, regreso: document.getElementById('alq-regreso').value, estadoManual: document.getElementById('alq-estado-manual').value }; const btn = document.getElementById('btn-alq-save'); btn.innerText = "Guardando..."; btn.disabled = true; if(alqFotoBase64) { google.script.run.withSuccessHandler(url => { d.fotoUrl = url; enviarAlquiler(d); }).withFailureHandler(e => { btn.innerText = "Guardar"; btn.disabled = false; showToast("Error foto: " + e, 'error'); }).subirFotoAlquiler(alqFotoBase64, d.codigo); } else { enviarAlquiler(d); } }
function enviarAlquiler(d){ const btn = document.getElementById('btn-alq-save'); google.script.run.withSuccessHandler(() => { cerrarModalAlq(); cargarAlquiler(); alqFotoBase64=null; showToast("Alquiler guardado"); btn.innerText = "Guardar"; btn.disabled = false; }).withFailureHandler(e => { btn.innerText = "Guardar"; btn.disabled = false; showToast("Error guardar: " + e, 'error'); }).guardarAlquiler(d); }
function previewAlqFoto(input) { if (input.files && input.files[0]) { const reader = new FileReader(); reader.onload = function(e) { document.getElementById('alq-preview').src = e.target.result; document.getElementById('alq-preview').classList.remove('hidden'); alqFotoBase64 = e.target.result; }; reader.readAsDataURL(input.files[0]); } }
function cargarPatio() { google.script.run.withSuccessHandler(d => { const t = document.getElementById('tabla-pat'); t.innerHTML = ''; d.forEach(r => { t.insertAdjacentHTML('beforeend', `<tr class="border-b"><td class="p-3 font-mono text-blue-600">${r.id}</td><td class="p-3">${r.cliente}</td><td class="p-3 text-xs text-red-500">${r.motivo}</td></tr>`); }); }).obtenerLogistica('PATIO'); }
function procesarFotosInmediato(input) { const idTrafo = document.getElementById('foto-trafo').value; if(!idTrafo) { alert("¡Escribe primero el ID del Trafo!"); input.value = ""; return; } if (input.files && input.files.length > 0) { const statusDiv = document.getElementById('status-fotos'); const listaDiv = document.getElementById('lista-fotos'); const etapa = document.getElementById('foto-etapa').value; statusDiv.innerHTML = '<span class="text-blue-600 animate-pulse">Subiendo imagen...</span>'; Array.from(input.files).forEach(file => { const reader = new FileReader(); reader.onload = function(e) { const base64 = e.target.result; const divPreview = document.createElement('div'); divPreview.className = "bg-white p-2 rounded border flex justify-between items-center opacity-50"; divPreview.innerHTML = `<span class="text-xs truncate font-bold">${file.name}</span><span class="text-xs text-blue-500">Subiendo...</span>`; listaDiv.prepend(divPreview); google.script.run.withSuccessHandler(res => { if(res.exito){ divPreview.className = "bg-green-50 p-2 rounded border flex justify-between items-center border-green-200"; divPreview.innerHTML = `<span class="text-xs truncate font-bold text-green-800">${file.name}</span><a href="${res.url}" target="_blank" class="text-green-600"><i data-lucide="check" class="w-4 h-4"></i></a>`; statusDiv.innerHTML = ''; if(typeof lucide !== 'undefined') lucide.createIcons(); showToast("Foto guardada"); } else { divPreview.className = "bg-red-50 p-2 rounded border border-red-200"; divPreview.innerHTML = `<span class="text-xs text-red-600">Error: ${res.error}</span>`; } }).withFailureHandler(err => { divPreview.innerHTML = `<span class="text-xs text-red-600">Error Red: ${err}</span>`; }).subirFotoProceso(base64, idTrafo, etapa); }; reader.readAsDataURL(file); }); input.value = ""; } }
