/* Now Mode — app.js (Chart.js 2.x)
   LocalStorage: logs, metrics, catalog; CRUD; stacked bars; lines; undo; export
--------------------------------------------------------------------------------*/

(function(){
  // ======= Storage keys (namespaced) =======
  var KEY_LOGS     = 'nowmode.logs';
  var KEY_METRICS  = 'nowmode.metrics';
  var KEY_CATALOG  = 'nowmode.catalog';

  // ======= State =======
  var logs = [];           // [{ts, date, type:'habit'|'vice', name, points, cash}]
  var metricsByDate = {};  // { 'YYYY-MM-DD': {sleep, mood, energy, focus} }
  var catalog = null;      // { habits: [...], vices: [...] }
  var undoStack = [];
  var chart;

  // ======= Helpers =======
  function fmtDate(d){
    var t = new Date(d);
    var y = t.getFullYear();
    var m = (t.getMonth()+1).toString().padStart(2,'0');
    var dd= t.getDate().toString().padStart(2,'0');
    return y+'-'+m+'-'+dd;
  }
  function today(){ return fmtDate(new Date()); }
  function uid(){ return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  // ======= Load/Save =======
  function loadState(){
    try {
      logs = JSON.parse(localStorage.getItem(KEY_LOGS) || '[]');
      metricsByDate = JSON.parse(localStorage.getItem(KEY_METRICS) || '{}');
      if (!Array.isArray(logs)) logs = [];
      if (typeof metricsByDate !== 'object' || !metricsByDate) metricsByDate = {};
    } catch(e){
      logs = []; metricsByDate = {};
    }
  }
  function saveLogs(){ localStorage.setItem(KEY_LOGS, JSON.stringify(logs)); }
  function saveMetrics(){ localStorage.setItem(KEY_METRICS, JSON.stringify(metricsByDate)); }

  function loadCatalog(){
    try { catalog = JSON.parse(localStorage.getItem(KEY_CATALOG) || 'null'); } catch(e){ catalog = null; }
    if (!catalog){
      catalog = {
        habits: [
          {id: uid(), name:'Meditation', points:1, cash:1},
          {id: uid(), name:'Learning',   points:1, cash:1},
          {id: uid(), name:'Journal',    points:1, cash:1},
          {id: uid(), name:'Fitness',    points:2, cash:2},
          {id: uid(), name:'Music',      points:1, cash:1},
          {id: uid(), name:'Cooking',    points:1, cash:1},
          {id: uid(), name:'Sleep ≥ 8h', points:2, cash:2},
        ],
        vices: [
          {id: uid(), name:'Weed',          points:-1, cash:-1},
          {id: uid(), name:'Alcohol',       points:-2, cash:-2},
          {id: uid(), name:'Nicotine',      points:-2, cash:-2},
          {id: uid(), name:'Doomscrolling', points:-1, cash:-1},
          {id: uid(), name:'Wank',          points:-1, cash:-1},
          {id: uid(), name:'Sleep < 6h',    points:-2, cash:-2},
        ]
      };
      saveCatalog();
    }
  }
  function saveCatalog(){ localStorage.setItem(KEY_CATALOG, JSON.stringify(catalog)); }

  // ======= UI refs =======
  var elTallyVal  = document.getElementById('tallyValue');
  var elTallyFill = document.getElementById('tallyFill');
  var btnUp       = document.getElementById('btnUp');
  var btnDown     = document.getElementById('btnDown');
  var btnUndo     = document.getElementById('btnUndo');
  var btnExport   = document.getElementById('btnExport');
  var btnManage   = document.getElementById('btnManage');

  var sleepSlider = document.getElementById('sleepSlider');
  var moodSlider  = document.getElementById('moodSlider');
  var energySlider= document.getElementById('energySlider');
  var focusSlider = document.getElementById('focusSlider');

  var sheet       = document.getElementById('selectorSheet');
  var tabHabits   = document.getElementById('tabHabits');
  var tabVices    = document.getElementById('tabVices');
  var listHabits  = document.getElementById('listHabits');
  var listVices   = document.getElementById('listVices');
  var sheetApply  = document.getElementById('sheetApply');

  // Manage sheet refs
  var manageSheet   = document.getElementById('manageSheet');
  var btnCloseManage= document.getElementById('btnCloseManage');
  var itemForm      = document.getElementById('itemForm');
  var itemName      = document.getElementById('itemName');
  var itemType      = document.getElementById('itemType');
  var itemPoints    = document.getElementById('itemPoints');
  var itemCash      = document.getElementById('itemCash');
  var btnNewItem    = document.getElementById('btnNewItem');
  var catalogList   = document.getElementById('catalogList');
  var editingId     = null;

  // ======= Tally logic =======
  function netPointsFor(dateStr){
    var sum = 0;
    for (var i=0;i<logs.length;i++){
      var r = logs[i];
      if (r.date === dateStr){ sum += Number(r.points || 0); }
    }
    return sum;
  }
  function updateTallyUI(){
    var d = today();
    var net = netPointsFor(d);
    elTallyVal.textContent = net;
    var pct = net <= -10 ? 0 : net >= 10 ? 100 : Math.round((net + 10) * 5);
    elTallyFill.style.width = pct + '%';
  }

  // ======= Metrics =======
  function loadSlidersFor(dateStr){
    var m = metricsByDate[dateStr] || {};
    if (sleepSlider)  sleepSlider.value  = m.sleep  != null ? m.sleep  : sleepSlider.value;
    if (moodSlider)   moodSlider.value   = m.mood   != null ? m.mood   : moodSlider.value;
    if (energySlider) energySlider.value = m.energy != null ? m.energy : energySlider.value;
    if (focusSlider)  focusSlider.value  = m.focus  != null ? m.focus  : focusSlider.value;
  }
  function saveCurrentSliders(){
    var d = today();
    metricsByDate[d] = metricsByDate[d] || {};
    metricsByDate[d].sleep  = Number(sleepSlider.value);
    metricsByDate[d].mood   = Number(moodSlider.value);
    metricsByDate[d].energy = Number(energySlider.value);
    metricsByDate[d].focus  = Number(focusSlider.value);
    saveMetrics();
    rebuildChart();
  }

  // ======= Catalog render =======
  function renderSelectorFromCatalog(){
    listHabits.innerHTML = '';
    listVices.innerHTML  = '';
    catalog.habits.forEach(function(it){
      var div = document.createElement('div');
      div.className = 'item habit';
      div.dataset.type = 'habit';
      div.dataset.name = it.name;
      div.dataset.points = it.points;
      div.dataset.cash = it.cash;
      div.innerHTML = '<span class="name">'+escapeHtml(it.name)+'</span><span class="meta">+'+it.points+' pt • +$'+it.cash+'</span>';
      listHabits.appendChild(div);
    });
    catalog.vices.forEach(function(it){
      var div = document.createElement('div');
      div.className = 'item vice';
      div.dataset.type = 'vice';
      div.dataset.name = it.name;
      div.dataset.points = it.points;
      div.dataset.cash = it.cash;
      div.innerHTML = '<span class="name">'+escapeHtml(it.name)+'</span><span class="meta">'+it.points+' pt • $'+it.cash+'</span>';
      listVices.appendChild(div);
    });
  }

  // ======= Logging actions =======
  function addRecord(rec, pushUndo){
    logs.push(rec);
    saveLogs();
    if (pushUndo !== false){ undoStack.push({ op: 'add', record: rec }); }
    updateTallyUI();
    rebuildChart();
  }
  function undo(){
    if (!undoStack.length) return;
    var step = undoStack.pop();
    if (step.op === 'add'){
      var ts = step.record.ts;
      var idx = logs.findIndex(function(r){ return r.ts === ts; });
      if (idx !== -1){ logs.splice(idx,1); saveLogs(); }
    }
    updateTallyUI();
    rebuildChart();
  }

  // ======= Export =======
  function exportData(){
    var allDates = Object.keys(metricsByDate);
    logs.forEach(function(r){ if (allDates.indexOf(r.date) === -1) allDates.push(r.date); });
    allDates.sort();
    var lines = ['timestamp,date,type,name,points,cash'];
    logs.forEach(function(r){ lines.push([r.ts, r.date, r.type, csvEsc(r.name), r.points, r.cash].join(',')); });
    var csvActions = lines.join('\\n');
    var mLines = ['date,sleep,mood,energy,focus'];
    allDates.forEach(function(d){
      var m = metricsByDate[d] || {};
      mLines.push([d, safeNum(m.sleep), safeNum(m.mood), safeNum(m.energy), safeNum(m.focus)].join(','));
    });
    var csvMetrics = mLines.join('\\n');
    var out = '--- ACTIONS ---\\n' + csvActions + '\\n\\n--- METRICS ---\\n' + csvMetrics + '\\n';
    downloadBlob(out, 'nowmode_export.txt', 'text/plain;charset=utf-8');
  }
  function csvEsc(s){ if (s==null) return ''; s=String(s); return (/[",\\n]/.test(s)) ? ('"'+s.replace(/"/g,'""')+'"') : s; }
  function safeNum(v){ return (v==null || v==='') ? '' : v; }
  function downloadBlob(text, filename, type){
    var blob = new Blob([text], {type:type});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  // ======= Chart =======
  function computeSeries(){
    var set = {};
    logs.forEach(function(r){ set[r.date] = 1; });
    Object.keys(metricsByDate).forEach(function(d){ set[d] = 1; });
    var labels = Object.keys(set).sort();
    var habits = new Array(labels.length).fill(0);
    var vices  = new Array(labels.length).fill(0);
    logs.forEach(function(r){
      var idx = labels.indexOf(r.date);
      if (idx === -1) return;
      var p = Number(r.points||0);
      if (p >= 0) habits[idx] += p; else vices[idx] += p;
    });
    var sleep=[], mood=[], energy=[], focus=[];
    labels.forEach(function(d){
      var m = metricsByDate[d];
      sleep.push(m && m.sleep  != null ? Number(m.sleep)  : null);
      mood.push( m && m.mood   != null ? Number(m.mood)   : null);
      energy.push(m && m.energy!= null ? Number(m.energy) : null);
      focus.push(m && m.focus  != null ? Number(m.focus)  : null);
    });
    return { labels, habits, vices, sleep, mood, energy, focus };
  }

  function buildChart(){
    var ctx = document.getElementById('trendChart').getContext('2d');
    var s = computeSeries();
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: s.labels,
        datasets: [
          { type:'bar', label:'Habits', data:s.habits,
            backgroundColor:'rgba(0,200,100,0.92)',
            borderColor:'rgba(0,255,180,1)', borderWidth:1.5,
            barPercentage:0.9, categoryPercentage:0.9, maxBarThickness:44,
            borderSkipped:'bottom', yAxisID:'bars' },
          { type:'bar', label:'Vices', data:s.vices,
            backgroundColor:'rgba(255,80,80,0.92)',
            borderColor:'rgba(255,140,140,1)', borderWidth:1.5,
            barPercentage:0.9, categoryPercentage:0.9, maxBarThickness:44,
            borderSkipped:'top', yAxisID:'bars' },
          { type:'line', label:'Sleep (hrs)', data:s.sleep,
            borderColor:'rgba(58,163,255,1)', backgroundColor:'rgba(58,163,255,0.15)',
            borderWidth:2, pointRadius:0, lineTension:0.25, yAxisID:'lines' },
          { type:'line', label:'Mood', data:s.mood,
            borderColor:'rgba(255,212,77,1)', backgroundColor:'rgba(255,212,77,0.15)',
            borderWidth:2, pointRadius:0, lineTension:0.25, yAxisID:'lines' },
          { type:'line', label:'Energy', data:s.energy,
            borderColor:'rgba(255,160,77,1)', backgroundColor:'rgba(255,160,77,0.15)',
            borderWidth:2, pointRadius:0, lineTension:0.25, yAxisID:'lines' },
          { type:'line', label:'Focus', data:s.focus,
            borderColor:'rgba(255,255,255,1)', backgroundColor:'rgba(255,255,255,0.10)',
            borderWidth:2, pointRadius:0, lineTension:0.25, yAxisID:'lines' }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        legend:{ labels:{ fontColor:'#fff' } },
        tooltips:{
          mode:'index', intersect:false,
          backgroundColor:'rgba(0,0,0,0.8)', titleFontColor:'#fff', bodyFontColor:'#fff',
          borderColor:'#333', borderWidth:1
        },
        scales:{
          xAxes:[{
            stacked:true,
            gridLines:{ color:'rgba(255,255,255,0.06)' },
            ticks:{ fontColor:'#bbb', maxRotation:0, autoSkip:true }
          }],
          yAxes:[
            { id:'bars', stacked:true, position:'left',
              gridLines:{ color:'rgba(255,255,255,0.06)' },
              ticks:{ fontColor:'#bbb', suggestedMin:-5, suggestedMax:5 } },
            { id:'lines', stacked:false, position:'right',
              gridLines:{ display:false },
              ticks:{ fontColor:'#888', suggestedMin:0, suggestedMax:10 } }
          ]
        },
        animation:{ duration:500 }
      }
    });
  }
  function rebuildChart(){ buildChart(); }

  // ======= Manage (CRUD) =======
  function openManage(){ manageSheet.classList.add('open'); manageSheet.setAttribute('aria-hidden','false'); refreshCatalogList(); }
  function closeManage(){ manageSheet.classList.remove('open'); manageSheet.setAttribute('aria-hidden','true'); clearForm(); }
  function clearForm(){ editingId = null; itemForm.reset(); itemType.value='habit'; itemPoints.value=1; itemCash.value=1; }
  function refreshCatalogList(){
    catalogList.innerHTML = '';
    function row(it, type){
      var div = document.createElement('div');
      div.className = 'item ' + (type==='habit' ? 'habit' : 'vice');
      div.innerHTML = '<span class=\"name\">'+escapeHtml(it.name)+'</span>' +
                      '<span class=\"meta\">'+(it.points>0?'+':'')+it.points+' pt • '+(it.cash>0?'+':'')+'$'+it.cash+'</span>' +
                      '<span style=\"display:flex;gap:8px\">' +
                        '<button class=\"btn\" data-act=\"edit\" data-type=\"'+type+'\" data-id=\"'+it.id+'\">Edit</button>' +
                        '<button class=\"btn danger\" data-act=\"del\" data-type=\"'+type+'\" data-id=\"'+it.id+'\">Delete</button>' +
                      '</span>';
      return div;
    }
    catalog.habits.forEach(function(it){ catalogList.appendChild(row(it,'habit')); });
    catalog.vices.forEach(function(it){ catalogList.appendChild(row(it,'vice')); });
  }

  catalogList.addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    var act = b.dataset.act, type = b.dataset.type, id = b.dataset.id;
    if (act === 'del') {
      var arr = (type==='habit') ? catalog.habits : catalog.vices;
      var idx = arr.findIndex(function(x){ return x.id === id; });
      if (idx !== -1) { arr.splice(idx,1); saveCatalog(); renderSelectorFromCatalog(); refreshCatalogList(); }
    } else if (act === 'edit') {
      var arr = (type==='habit') ? catalog.habits : catalog.vices;
      var it = arr.find(function(x){ return x.id === id; });
      if (it){ editingId = id; itemName.value=it.name; itemType.value=type; itemPoints.value=it.points; itemCash.value=it.cash; }
    }
  });

  itemForm.addEventListener('submit', function(e){
    e.preventDefault();
    var rec = { id: editingId || uid(), name: itemName.value.trim(), points: Number(itemPoints.value), cash: Number(itemCash.value) };
    var type = itemType.value === 'vice' ? 'vice' : 'habit';
    if (!rec.name) return;
    // remove from both to avoid duplicates on type change
    catalog.habits = catalog.habits.filter(x=>x.id!==rec.id);
    catalog.vices  = catalog.vices.filter(x=>x.id!==rec.id);
    if (type==='habit') catalog.habits.push(rec); else catalog.vices.push(rec);
    saveCatalog();
    renderSelectorFromCatalog();
    refreshCatalogList();
    clearForm();
  });

  // Buttons
  document.getElementById('btnNewItem').addEventListener('click', clearForm);
  btnManage.addEventListener('click', openManage);
  document.getElementById('btnCloseManage').addEventListener('click', closeManage);

  // ======= Selector Apply =======
  sheetApply.addEventListener('click', function(){
    var sel = window.selectedChoice;
    if (!sel) return;
    var rec = {
      ts: Date.now(),
      date: today(),
      type: sel.type === 'vice' ? 'vice' : 'habit',
      name: sel.name || '',
      points: Number(sel.points||0),
      cash: Number(sel.cash||0)
    };
    addRecord(rec, true);
    window.selectedChoice = null;
  });

  // ======= Undo & Export =======
  btnUndo.addEventListener('click', undo);
  btnExport.addEventListener('click', exportData);

  // ======= Slider persistence =======
  [sleepSlider, moodSlider, energySlider, focusSlider].forEach(function(el){
    if (!el) return;
    el.addEventListener('change', saveCurrentSliders);
    el.addEventListener('input', saveCurrentSliders);
  });

  // ======= Init =======
  loadState();
  loadCatalog();
  renderSelectorFromCatalog();
  loadSlidersFor(today());
  updateTallyUI();
  buildChart();
  if (!metricsByDate[today()]){
    metricsByDate[today()] = {
      sleep: Number(sleepSlider.value),
      mood: Number(moodSlider.value),
      energy: Number(energySlider.value),
      focus: Number(focusSlider.value)
    };
    saveMetrics();
  }
})();