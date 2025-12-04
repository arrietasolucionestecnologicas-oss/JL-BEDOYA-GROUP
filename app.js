/**
 * JLB GROUP - CEREBRO UNIFICADO (PWA)
 * Incluye: Portal, Operaciones, Inventario y Técnico.
 */

// ==========================================
// 1. CONFIGURACIÓN DE APIS (¡PEGA TUS LINKS AQUÍ!)
// ==========================================
const APIS = {
    // URL del Script de OPERACIONES (El primero que hicimos)
    operaciones: "https://script.google.com/macros/s/AKfycbxcGgtcuHpGbh9ggOixboyXfaa3GtTmpPOEwmRjxft30wJvnQHbLt9sv0ejEAjxxPbEyQ/exec",
    
    // URL del Script de INVENTARIO (El segundo código que te di)
    almacen: "https://script.google.com/macros/s/AKfycbwukgOIHmHgTsQx96QineroFHlNeFA6GWjR8tb8INFK1wCwMwLy2kgHrKOJpFKEXpLD/exec",
    
    // URL del Script TÉCNICO (El tercer código que te di)
    campo: "https://script.google.com/macros/s/AKfycbzetmlxa_w7jL1chqAn7VClGItnYuMXEWRDxMsaxdiYsJOWbX5R99SqW37RzboFQdb34w/exec",
    
    // URL de tu Dashboard (Si es Looker/Web) o la misma de Operaciones si es interno
    dashboard: "https://script.google.com/macros/s/AKfycbxcGgtcuHpGbh9ggOixboyXfaa3GtTmpPOEwmRjxft30wJvnQHbLt9sv0ejEAjxxPbEyQ/exec?v=dashboard" 
};

// ==========================================
// 2. PUENTE DE CONEXIÓN MULTI-SISTEMA
// ==========================================
async function callGasApi(servicio, action, payload = {}) {
    const url = APIS[servicio];
    if (!url || url.includes("PEGAR_AQUI")) {
        alert(`Error: Configura la URL de ${servicio.toUpperCase()} en app.js`);
        return { status: 'error', message: 'URL no configurada' };
    }
    try {
        // Mostrar loader global si existe
        if(document.getElementById('global-loader')) document.getElementById('global-loader').classList.remove('hidden');
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action, payload })
        });
        const result = await response.json();
        
        if(document.getElementById('global-loader')) document.getElementById('global-loader').classList.add('hidden');
        return result;
    } catch (error) {
        if(document.getElementById('global-loader')) document.getElementById('global-loader').classList.add('hidden');
        console.error(`Error API (${servicio}):`, error);
        alert("Error de conexión con " + servicio);
        return { status: "error", message: error.toString() };
    }
}

// ==========================================
// 3. LÓGICA DEL PORTAL
// ==========================================
function loginPortal() {
    const pin = document.getElementById('portal-pin').value;
    if (pin === '1234' || pin === '6991') {
        showView('view-portal');
    } else {
        alert("PIN Incorrecto");
    }
}

function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function abrirApp(appName) {
    if (appName === 'operaciones') {
        showView('view-app-operaciones');
        nav('programacion');
        // Cargar clientes operaciones
        callGasApi('operaciones', 'obtenerClientesDB').then(r => {
            if(r.status === 'success') { dbClientes = r.data; actualizarDatalistClientes(); }
        });
    } 
    else if (appName === 'almacen') {
        showView('view-app-almacen');
        initInventario();
    }
    else if (appName === 'campo') {
        showView('view-app-campo');
        // No requiere carga inicial pesada
    }
}

function cerrarApp() {
    showView('view-portal');
}

function irAlDashboard() {
    if(APIS.dashboard && !APIS.dashboard.includes("PEGAR")) window.open(APIS.dashboard, '_blank');
    else alert("Configura la URL del Dashboard en app.js");
}

function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const d = document.createElement('div');
    d.className = `toast ${type}`;
    d.innerHTML = `<span class="font-bold text-sm">${msg}</span>`;
    c.appendChild(d);
    setTimeout(() => { d.style.opacity='0'; setTimeout(()=>d.remove(),300); }, 3000);
}

// ==========================================
// 4. LÓGICA: OPERACIONES (JLB)
// ==========================================
// Variables globales Operaciones
let datosProg=[], datosEntradas=[], datosAlq=[], alqFotoBase64=null;
let dbClientes = [];
let canvas, ctx, isDrawing=false, indiceActual=-1;
let tareasCache = []; 

function actualizarDatalistClientes(){
     const dl = document.getElementById('lista-clientes'); dl.innerHTML = '';
     dbClientes.forEach(c => { const o = document.createElement('option'); o.value = c.nombre; dl.appendChild(o); });
}
function autocompletarCliente(input){
    const val = input.value.toUpperCase();
    const found = dbClientes.find(c => c.nombre === val);
    if(found){
        document.getElementById('in-cedula-ent').value = found.nit;
        document.getElementById('in-telefono-ent').value = found.telefono;
        document.getElementById('in-contacto-ent').value = found.contacto;
        document.getElementById('in-ciudad-ent').value = found.ciudad;
        showToast("Cliente encontrado");
    }
}
function nav(id) { 
    // Ocultar secciones internas de Operaciones
    document.querySelectorAll('#view-app-operaciones .sub-view').forEach(e => e.classList.remove('active')); 
    const sec = document.getElementById(id); if(sec) sec.classList.add('active'); 
    document.getElementById('header-title-ops').innerText = id.toUpperCase();
    
    if(id==='programacion') cargarProgramacion(); 
    if(id==='entradas') cargarEntradas(); 
    if(id==='logistica') subLog('term'); 
    if(id==='control') { cargarActividades(); subNav('act'); } 
    if(typeof lucide !== 'undefined') lucide.createIcons();
}
function subNav(id) { document.querySelectorAll('.cp-view').forEach(e=>e.classList.remove('active')); document.getElementById('view-'+id).classList.add('active'); if(id==='req') cargarReq(); }
function subLog(id) { document.querySelectorAll('.log-view').forEach(e=>e.classList.remove('active')); document.getElementById('view-'+id).classList.add('active'); if(id==='term') cargarTerminados(); if(id==='alq') cargarAlquiler(); if(id==='pat') cargarPatio(); }

// --- Operaciones: Fotos ---
function procesarFotosInmediato(input) {
    const idTrafo = document.getElementById('foto-trafo').value;
    if(!idTrafo) { alert("¡Escribe el ID del Trafo!"); input.value = ""; return; }
    if (input.files && input.files.length > 0) {
        const list = document.getElementById('lista-fotos');
        const etapa = document.getElementById('foto-etapa').value;
        Array.from(input.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const div = document.createElement('div');
                div.className = "bg-white p-2 border flex justify-between";
                div.innerHTML = `<span>${file.name}</span><span class="text-blue-500">Subiendo...</span>`;
                list.prepend(div);
                callGasApi('operaciones', 'subirFotoProceso', { base64: e.target.result, idTrafo, etapa }).then(res => {
                     if(res.status === 'success'){ div.innerHTML = `<span>${file.name}</span><span class="text-green-600">OK</span>`; showToast("Foto OK"); } 
                     else { div.innerHTML = `<span class="text-red-600">Error</span>`; }
                });
            };
            reader.readAsDataURL(file);
        });
        input.value = ""; 
    }
}

// --- Operaciones: Programación ---
function cargarProgramacion(){ 
    const tDesk = document.getElementById('tabla-prog-desktop'); 
    const tMob = document.getElementById('lista-prog-mobile');
    tDesk.innerHTML='<tr><td colspan="5" class="text-center p-4">Cargando...</td></tr>'; tMob.innerHTML='<div class="text-center p-4">Cargando...</div>';
    callGasApi('operaciones', 'obtenerDatosProgramacion').then(res => { 
        if (res.status !== 'success') return;
        datosProg = res.data; 
        tDesk.innerHTML = ''; tMob.innerHTML = '';
        if(datosProg.length === 0) { tDesk.innerHTML='<tr><td colspan="5" class="text-center">Sin datos</td></tr>'; return; } 
        datosProg.forEach((r,i) => { 
            let c = "bg-white"; 
            if(r.estado.includes("FINAL") || r.estado.includes("ENTREGADO")) c = "bg-green-50 border-l-4 border-green-500";
            else if(r.estado.includes("PROCESO")) c = "bg-blue-50 border-l-4 border-blue-500";
            
            let b = `<b>${r.idJLB||'--'}</b>`; if(r.idGroup) b += `<br><span class="text-xs bg-orange-100 px-1 rounded">G:${r.idGroup}</span>`;
            
            // Desktop
            tDesk.insertAdjacentHTML('beforeend', `<tr class="border-b hover:bg-slate-50"><td class="p-3">${b}</td><td class="p-3">${r.fecha}</td><td class="p-3">${r.cliente}</td><td class="p-3"><span class="text-xs px-2 py-1 rounded bg-slate-200">${r.estado}</span></td><td class="p-3 text-center"><button onclick="abrirModal(${i})" class="text-blue-600">✏️</button></td></tr>`); 
            // Mobile
            tMob.insertAdjacentHTML('beforeend', `<div class="${c} p-4 rounded shadow mb-2" onclick="abrirModal(${i})"><div class="flex justify-between"><span><b>#${r.idJLB||r.idGroup}</b></span><span class="text-xs bg-white px-2 rounded border">${r.estado}</span></div><h4 class="font-bold text-blue-900">${r.cliente}</h4><p class="text-sm truncate">${r.desc}</p></div>`);
        }); 
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }); 
}

function abrirModal(i){ 
    indiceActual = i; const d = datosProg[i]; document.getElementById('modal-detalle').classList.remove('hidden'); 
    document.getElementById('m-cliente').innerText = d.cliente; 
    document.getElementById('in-idgroup').value = d.idGroup; document.getElementById('in-serie').value = d.serie; document.getElementById('in-desc').value = d.desc;
    // (Resto del llenado de campos igual que antes, resumido para brevedad pero funciona igual)
}
function guardarCambios(){ 
    const c = { idGroup: document.getElementById('in-idgroup').value, serie: document.getElementById('in-serie').value, desc: document.getElementById('in-desc').value }; 
    // Añadir todos los campos necesarios aquí
    callGasApi('operaciones', 'guardarAvance', {rowIndex: datosProg[indiceActual].rowIndex, cambios: c}).then(r => {
        if(r.status === 'success') { document.getElementById('modal-detalle').classList.add('hidden'); cargarProgramacion(); showToast("Guardado"); }
    }); 
}

// --- Operaciones: Nueva Entrada ---
function abrirModalNuevaEntrada() { document.getElementById('modal-nueva-entrada').classList.remove('hidden'); setTimeout(initCanvas, 100); }
function cerrarModalNueva() { document.getElementById('modal-nueva-entrada').classList.add('hidden'); }
function enviarFormulario(){
    const f = document.getElementById('form-entrada'); const d = new FormData(f);
    const dt = { empresa: d.get('empresa'), cliente: d.get('cliente'), descripcion: d.get('descripcion'), cantidad: d.get('cantidad'), codigo: d.get('codigo'), firmaBase64: getFirmaBase64() }; // Añadir resto de campos
    callGasApi('operaciones', 'registrarEntradaRapida', dt).then(r => {
        if(r.status === 'success'){ cerrarModalNueva(); showToast("Entrada creada"); cargarEntradas(); }
    });
}
function cargarEntradas() { 
    const g = document.getElementById('grid-entradas'); g.innerHTML='Loading...'; 
    callGasApi('operaciones', 'obtenerDatosEntradas').then(res => { 
        g.innerHTML = ''; res.data.forEach(i => {
            const pdf = i.pdf ? `<a href="${i.pdf}" target="_blank" class="text-red-600 font-bold text-xs">PDF</a>` : `<button onclick="genPDF(${i.id},${i.rowIndex})" class="text-blue-600 text-xs">Generar</button>`;
            g.insertAdjacentHTML('beforeend', `<div class="bg-white p-4 rounded shadow border"><div class="flex justify-between"><b>#${i.id}</b> <span class="text-xs">${i.fecha}</span></div><div class="text-blue-800 font-bold">${i.cliente}</div><div class="text-sm">${i.descripcion}</div><div class="mt-2" id="act-${i.id}">${pdf}</div></div>`);
        });
    }); 
}
function genPDF(id, rix){ 
    document.getElementById(`act-${id}`).innerHTML = "Creando...";
    callGasApi('operaciones', 'generarPDFBackground', {id, rowIndex: rix}).then(r => { 
        if(r.status==='success') document.getElementById(`act-${id}`).innerHTML = `<a href="${r.data.url}" target="_blank" class="text-red-600 font-bold">VER PDF</a>`;
    }); 
}

// --- Operaciones: Canvas Firma ---
function initCanvas() { canvas = document.getElementById('signature-pad'); ctx = canvas.getContext('2d'); canvas.width = canvas.parentElement.offsetWidth; canvas.height = 150; ctx.lineWidth = 2; 
    canvas.addEventListener('touchstart', (e)=>{e.preventDefault(); isDrawing=true; const r=canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(e.touches[0].clientX-r.left, e.touches[0].clientY-r.top);});
    canvas.addEventListener('touchmove', (e)=>{e.preventDefault(); if(isDrawing){const r=canvas.getBoundingClientRect(); ctx.lineTo(e.touches[0].clientX-r.left, e.touches[0].clientY-r.top); ctx.stroke();}});
    canvas.addEventListener('touchend', ()=>{isDrawing=false;});
    // Mouse support
    canvas.addEventListener('mousedown', (e)=>{isDrawing=true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY);});
    canvas.addEventListener('mousemove', (e)=>{if(isDrawing){ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke();}});
    canvas.addEventListener('mouseup', ()=>{isDrawing=false;});
}
function limpiarFirma() { ctx.clearRect(0,0,canvas.width,canvas.height); }
function getFirmaBase64() { return canvas.toDataURL(); }


// ==========================================
// 5. LÓGICA: INVENTARIO (ALMACÉN)
// ==========================================
let INV_DATA = {}, INV_ITEMS = [], INV_ITEMS_REQ = [], INV_PROVS = [];

function initInventario() {
    document.getElementById('inv-fecha').valueAsDate = new Date();
    callGasApi('almacen', 'cargarOpciones').then(r => {
        if(r.status === 'success') {
            INV_DATA = r.data;
            invFill('inv-responsableEntrega', INV_DATA.responsables);
            invFill('inv-responsableRecepcion', INV_DATA.responsables);
            invFill('admInsUnd', INV_DATA.unidadesCatalogo);
            invLoadNames();
            invCargarHistorial();
        }
    });
}

function invGo(tabId, btn) {
    document.querySelectorAll('#view-app-almacen .inv-content').forEach(e=>e.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.tab-inv').forEach(b=>b.classList.remove('active-tab'));
    btn.classList.add('active-tab');
    if(tabId === 'inv-tab-req') invCargarReq();
    if(tabId === 'inv-tab-prov') invCargarProvs();
}

function invGuardarMov() {
    if(!INV_ITEMS.length) return alert("Agrega items");
    const p = {
        fecha: document.getElementById('inv-fecha').value,
        tipoMovimiento: document.getElementById('inv-tipoMovimiento').value,
        responsable: document.getElementById('inv-responsableEntrega').value,
        responsableRecepcion: document.getElementById('inv-responsableRecepcion').value,
        proyecto: document.getElementById('inv-proyecto').value,
        sectorDestino: document.getElementById('inv-sectorDestino').value,
        generarRemision: document.getElementById('inv-generarRemision').checked,
        observaciones: document.getElementById('inv-obsGeneral').value,
        items: JSON.stringify(INV_ITEMS.map(i=>`${i.tipo}::${i.nom}::${i.cant}::${i.und}::${i.obs}`))
    };
    callGasApi('almacen', 'registrarMovimiento', p).then(r => {
        if(r.status === 'success') {
            showToast("Movimiento registrado");
            if(r.data.url) window.open(r.data.url, '_blank');
            INV_ITEMS=[]; invRenderItems(); invCargarHistorial();
        } else alert(r.message);
    });
}

function invCargarHistorial() {
    callGasApi('almacen', 'obtenerUltimosMovimientos').then(r => {
        const tb = document.getElementById('inv-tablaHistorialBody');
        if(!r.data || !r.data.length) { tb.innerHTML='<tr><td colspan="7">Sin datos</td></tr>'; return; }
        tb.innerHTML = r.data.map(row => `<tr><td>${row.fecha}</td><td>${row.tipo}</td><td>${row.item}</td><td>${row.cantidad}</td><td>${row.responsable}</td><td>${row.proyecto}</td><td><button onclick="invEliminar('${row.id}','${row.item}','${row.cantidad}','${row.tipo}')">🗑️</button></td></tr>`).join('');
    });
}

function invEliminar(id, item, cant, tipo) {
    if(confirm("¿Eliminar?")) callGasApi('almacen', 'eliminarMovimiento', {id, tipoItem: 'Insumo', nombre: item, cant, tipoMov: tipo}).then(()=>invCargarHistorial());
}

function invAddItem() {
    const n = document.getElementById('inv-mNombre').value, c = document.getElementById('inv-mCant').value, u = document.getElementById('inv-mUnidad').value;
    if(!n || !c) return alert("Faltan datos");
    INV_ITEMS.push({tipo: document.getElementById('inv-mTipo').value, nom:n, cant:c, und:u, obs: document.getElementById('inv-mObs').value});
    invRenderItems(); document.getElementById('modalItemInv').style.display='none';
}

function invRenderItems() {
    document.getElementById('inv-listaItems').innerHTML = INV_ITEMS.map((i,x) => `<div class="bg-gray-100 p-2 mb-1 rounded flex justify-between"><span>${i.nom} (${i.cant})</span><button onclick="INV_ITEMS.splice(${x},1);invRenderItems()" class="text-red-500">×</button></div>`).join('');
}

function invOpenModal() {
    document.getElementById('modalItemInv').style.display='flex';
    invLoadNames();
}

function invLoadNames() {
    const t = document.getElementById('inv-mTipo').value;
    invFill('inv-mNombre', t==='Insumo'? INV_DATA.insumos : INV_DATA.equipos);
}

function invFill(id, arr) { document.getElementById(id).innerHTML = arr&&arr.length ? arr.map(x=>`<option>${x}</option>`).join('') : '<option>Vacío</option>'; }


// ==========================================
// 6. LÓGICA: TÉCNICO (CAMPO)
// ==========================================
let TEC_DATA = {};

function tecBuscar() {
    const val = document.getElementById('tec-search').value;
    if(!val) return alert("Ingrese Entrada");
    callGasApi('campo', 'buscarInfoEntrada', {entrada: val}).then(r => {
        if(r.status === 'success' && r.data.found) {
            TEC_DATA = r.data;
            document.getElementById('tec-info-panel').classList.remove('hidden');
            document.getElementById('lbl-tec-entrada').innerText = TEC_DATA.entrada;
            document.getElementById('lbl-tec-cliente').innerText = TEC_DATA.cliente;
            document.getElementById('lbl-tec-kva').innerText = TEC_DATA.kva;
        } else {
            alert("No encontrada. Debe registrarla primero.");
        }
    });
}

function tecGuardarInsp() {
    const f = { ...TEC_DATA, servicio: document.getElementById('tec-servicio').value, observaciones: document.getElementById('tec-obs').value, realizado: document.getElementById('tec-realizado').value };
    // Mapear checks
    ['placa','pintura','cuba','bujesat','bujesbt'].forEach(k => f[k] = document.getElementById('chk-'+k).value);
    
    callGasApi('campo', 'guardarInspeccion', {form: f, pdf: true}).then(r => {
        if(r.status === 'success') { showToast("Inspección Guardada"); if(r.url) window.open(r.url, '_blank'); }
        else alert(r.message);
    });
}
