/* Now Mode — app.js (Chart.js 2.x)
   Wires UI → localStorage, stacked bars, lines, undo, export
   --------------------------------------------------------- */

(function(){
  // ======= Storage keys (namespaced) =======
  var KEY_LOGS    = 'nowmode.logs';
  var KEY_METRICS = 'nowmode.metrics';

  // ======= State =======
  var logs = [];           // [{ts, date, type:'habit'|'vice', name, points, cash}]
  var metricsByDate = {};  // { 'YYYY-MM-DD': {sleep, mood, energy, focus} }
  var undoStack = [];      // stack of last actions for undo
  var chart;               // Chart.js instance

  // ======= Helpers =======
  function fmtDate(d){
    // return YYYY-MM-DD local
    var t = new Date(d);
    var y = t.getFullYear();
    var m = (t.getMonth()+1).toString().padStart(2,'0');
    var dd= t.getDate().toString().padStart(2,'0');
    return y+'-'+m+'-'+dd;
  }
  function today(){ return fmtDate(new Date()); }

  function loadState(){
    try {
      var rawLogs = localStorage.getItem(KEY_LOGS);
      var rawMet  = localStorage.getItem(KEY_METRICS);
      logs = rawLogs ? JSON.parse(rawLogs) : [];
      metricsByDate = rawMet ? JSON.parse(rawMet) : {};
      if (!Array.isArray(logs)) logs = [];
      if (typeof metricsByDate !== 'object' || !metricsByDate) metricsByDate = {};
    } catch(e){
      // if corrupted, start fresh but don't nuke other keys
      logs = [];
      metricsByDate = {};
    }
  }
  function saveLogs(){ localStorage.setItem(KEY_LOGS, JSON.stringify(logs)); }
  function saveMetrics(){ localStorage.setItem(KEY_METRICS, JSON.stringify(metricsByDate)); }

  // ======= UI refs =======
  var elTallyVal  = document.getElementById('tallyValue');
  var elTallyFill = document.getElementById('tallyFill');
  var btnUp       = document.getElementById('btnUp');
  var btnDown     = document.getElementById('btnDown');
  var btnUndo     = document.getElementById('btnUndo');
  var btnExport   = document.getElementById('btnExport');

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

  // current pending selection from bottom sheet (set by inline HTML script)
  // window.selectedChoice = {type,name,points,cash}

  // ======= Tally logic (for today) =======
  function netPointsFor(dateStr){
    var sum = 0;
    for (var i=0;i<logs.length;i++){
      var r = logs[i];
      if (r.date === dateStr){
        sum += Number(r.points || 0);
      }
    }
    return sum;
  }

  function updateTallyUI(){
    var d = today();
    var net = netPointsFor(d);
    // show number
    elTallyVal.textContent = net;

    // map net [-10..+10] → [0..100]%
    var pct;
    if (net <= -10) pct = 0;
    else if (net >= 10) pct = 100;
    else pct = Math.round((net + 10) * 5); // -10→0%, 0→50%, +10→100%

    elTallyFill.style.width = pct + '%';
  }

  // ======= Metrics (sliders) =======
  function loadSlidersFor(dateStr){
    var m = metricsByDate[dateStr] || {};
    // keep user’s defaults if undefined
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

  // ======= Logging actions (habits/vices) =======
  function addRecord(rec, pushUndo){
    // rec = {ts, date, type, name, points, cash}
    logs.push(rec);
    saveLogs();
    if (pushUndo !== false){
      undoStack.push({ op: 'add', record: rec });
    }
    updateTallyUI();
    rebuildChart();
  }

  function undo(){
    if (!undoStack.length) return;
    var step = undoStack.pop();
    if (step.op === 'add'){
      // remove the last matching record (by ts)
      var ts = step.record.ts;
      var idx = logs.findIndex(function(r){ return r.ts === ts; });
      if (idx !== -1){
        logs.splice(idx, 1);
        saveLogs();
      }
    }
    updateTallyUI();
    rebuildChart();
  }

  // ======= Export =======
  function exportData(){
    var allDates = Object.keys(metricsByDate);
    // ensure dates that only appear in logs are included
    logs.forEach(function(r){ if (allDates.indexOf(r.date) === -1) allDates.push(r.date); });
    allDates.sort();

    // CSV of actions
    var lines = ['timestamp,date,type,name,points,cash'];
    logs.forEach(function(r){
      lines.push([r.ts, r.date, r.type, csvEsc(r.name), r.points, r.cash].join(','));
    });
    var csvActions = lines.join('\n');

    // CSV of metrics (one row per date)
    var mLines = ['date,sleep,mood,energy,focus'];
    allDates.forEach(function(d){
      var m = metricsByDate[d] || {};
      mLines.push([d, safeNum(m.sleep), safeNum(m.mood), safeNum(m.energy), safeNum(m.focus)].join(','));
    });
    var csvMetrics = mLines.join('\n');

    // make two files in one blob (simple separator)
    var out = '--- ACTIONS ---\n' + csvActions + '\n\n--- METRICS ---\n' + csvMetrics + '\n';
    downloadBlob(out, 'nowmode_export.txt', 'text/plain;charset=utf-8');
  }
  function csvEsc(s){
    if (s == null) return '';
    s = String(s);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }
  function safeNum(v){ return (v==null || v==='') ? '' : v; }
  function downloadBlob(text, filename, type){
    var blob = new Blob([text], {type: type});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  // ======= Chart build (stacked bars + lines) =======
  function computeSeries(){
    // Collect labels (all dates present in either logs or metrics)
    var set = {};
    logs.forEach(function(r){ set[r.date] = 1; });
    Object.keys(metricsByDate).forEach(function(d){ set[d] = 1; });

    var labels = Object.keys(set).sort(); // chronological

    // Aggregate habits (>=0) and vices (<0)
    var habits = new Array(labels.length).fill(0);
    var vices  = new Array(labels.length).fill(0);

    logs.forEach(function(r){
      var idx = labels.indexOf(r.date);
      if (idx === -1) return;
      var p = Number(r.points||0);
      if (p >= 0) habits[idx] += p;
      else vices[idx] += p; // negative
    });

    // Lines from metrics
    var sleep = [], mood=[], energy=[], focus=[];
    labels.forEach(function(d){
      var m = metricsByDate[d];
      sleep.push(m && m.sleep  != null ? Number(m.sleep)  : null);
      mood.push( m && m.mood   != null ? Number(m.mood)   : null);
      energy.push(m && m.energy!= null ? Number(m.energy) : null);
      focus.push(m && m.focus  != null ? Number(m.focus)  : null);
    });

    return { labels: labels, habits: habits, vices: vices, sleep: sleep, mood: mood, energy: energy, focus: focus };
  }

  // Glow plugin (same as earlier response)
  if (Chart && Chart.plugins) {
    Chart.plugins.register({
      beforeDatasetsDraw: function(chart, easing) { chart.ctx.save(); },
      afterDatasetsDraw:  function(chart, easing) { chart.ctx.restore(); },
      afterDatasetDraw: function(chart, args){
        var ctx = chart.ctx;
        var cfg = args.meta.controller.getDataset();
        if (!cfg._glow) return;
        ctx.save();
        ctx.shadowColor = cfg._glow.color || 'rgba(0,255,150,0.8)';
        ctx.shadowBlur  = cfg._glow.blur  || 18;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        if (args.meta.type === 'line') {
          ctx.lineWidth = (cfg.borderWidth || 2);
          ctx.strokeStyle = cfg.borderColor;
          ctx.beginPath();
          args.meta.dataset.draw();
          ctx.stroke();
        } else if (args.meta.type === 'bar') {
          args.meta.data.forEach(function(bar){
            var vm = bar._model;
            ctx.fillStyle = vm.backgroundColor;
            ctx.beginPath();
            ctx.moveTo(vm.x - vm.width/2, vm.y);
            ctx.lineTo(vm.x + vm.width/2, vm.y);
            ctx.lineTo(vm.x + vm.width/2, vm.base);
            ctx.lineTo(vm.x - vm.width/2, vm.base);
            ctx.closePath();
            ctx.fill();
          });
        }
        ctx.restore();
      }
    });
  }

  function buildChart(){
    var ctx = document.getElementById('trendChart').getContext('2d');
    var s = computeSeries();

    if (chart) { chart.destroy(); }

    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: s.labels,
        datasets: [
          {
            type:'bar', label:'Habits', data:s.habits,
            backgroundColor:'rgba(0,255,100,0.92)',
            borderColor:'rgba(0,255,180,1)', borderWidth:2,
            barPercentage:0.9, categoryPercentage:0.9, maxBarThickness:44,
            borderSkipped:'bottom',
            _glow:{color:'rgba(0,255,140,0.9)', blur:26},
            yAxisID:'bars'
          },
          {
            type:'bar', label:'Vices', data:s.vices,
            backgroundColor:'rgba(255,60,60,0.92)',
            borderColor:'rgba(255,120,120,1)', borderWidth:2,
            barPercentage:0.9, categoryPercentage:0.9, maxBarThickness:44,
            borderSkipped:'top',
            _glow:{color:'rgba(255,70,70,0.9)', blur:26},
            yAxisID:'bars'
          },
          {
            type:'line', label:'Sleep (hrs)', data:s.sleep,
            borderColor:'rgba(58,163,255,1)', backgroundColor:'rgba(58,163,255,0.15)',
            borderWidth:2, pointRadius:0, lineTension:0.25, yAxisID:'lines',
            _glow:{color:'rgba(58,163,255,0.9)', blur:20}
          },
          {
            type:'line', label:'Mood', data:s.mood,
            borderColor:'rgba(255,212,77,1)', backgroundColor:'rgba(255,212,77,0.15)',
            borderWidth:2, pointRadius:0, lineTension:0.25, yAxisID:'lines',
            _glow:{color:'rgba(255,212,77,0.9)', blur:20}
          },
          {
            type:'line', label:'Energy', data:s.energy,
            borderColor:'rgba(255,160,77,1)', backgroundColor:'rgba(255,160,77,0.15)',
            borderWidth:2, pointRadius:0, lineTension:0.25, yAxisID:'lines',
            _glow:{color:'rgba(255,160,77,0.9)', blur:20}
          },
          {
            type:'line', label:'Focus', data:s.focus,
            borderColor:'rgba(255,255,255,1)', backgroundColor:'rgba(255,255,255,0.10)',
            borderWidth:2, pointRadius:0, lineTension:0.25, yAxisID:'lines',
            _glow:{color:'rgba(255,255,255,0.9)', blur:18}
          }
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
            { // Bars
              id:'bars', stacked:true, position:'left',
              gridLines:{ color:'rgba(255,255,255,0.06)' },
              ticks:{ fontColor:'#bbb', suggestedMin:-5, suggestedMax:5 }
            },
            { // Lines
              id:'lines', stacked:false, position:'right',
              gridLines:{ display:false },
              ticks:{ fontColor:'#888', suggestedMin:0, suggestedMax:10 }
            }
          ]
        },
        animation:{ duration:500 }
      }
    });
  }

  function rebuildChart(){ buildChart(); }

  // ======= Bottom sheet apply =======
  sheetApply.addEventListener('click', function(){
    var sel = window.selectedChoice;
    if (!sel) return; // nothing chosen
    var rec = {
      ts: Date.now(),
      date: today(),
      type: sel.type === 'vice' ? 'vice' : 'habit',
      name: sel.name || '',
      points: Number(sel.points||0),
      cash: Number(sel.cash||0)
    };
    addRecord(rec, true);
    // clear selected so next apply requires a click
    window.selectedChoice = null;
  });

  // ======= Button handlers =======
  btnUndo.addEventListener('click', undo);
  btnExport.addEventListener('click', exportData);

  // (Up/Down buttons open the sheet via inline HTML script — no extra here)

  // ======= Slider handlers (persist metrics) =======
  [sleepSlider, moodSlider, energySlider, focusSlider].forEach(function(el){
    if (!el) return;
    el.addEventListener('change', saveCurrentSliders);
    el.addEventListener('input', saveCurrentSliders);
  });

  // ======= Init =======
  loadState();
  loadSlidersFor(today());
  updateTallyUI();
  buildChart();

  // Optional: ensure today exists in labels by touching metrics (without overriding user values)
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
