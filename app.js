/* Cash Habit — app.js (Chart.js 2.x) */
(function(){
  var KEY_LOGS='cashhabit.logs', KEY_CATALOG='cashhabit.catalog', KEY_SETTINGS='cashhabit.settings';
  var logs=[], catalog=null, settings={currency:'$', startingBalance:0}, undoStack=[], chart;

  function fmtDate(d){var t=new Date(d);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');}
  function today(){return fmtDate(new Date());}
  function uid(){return Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4);}
  function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  function money(v){var sign=v<0?'-':'';var n=Math.abs(v);return sign+settings.currency+(Math.round(n*100)/100);}

  function loadAll(){
    try{var nmLogs=JSON.parse(localStorage.getItem('nowmode.logs')||'null');var nmCatalog=JSON.parse(localStorage.getItem('nowmode.catalog')||'null');
      if(nmLogs && !localStorage.getItem(KEY_LOGS)) localStorage.setItem(KEY_LOGS, JSON.stringify(nmLogs));
      if(nmCatalog && !localStorage.getItem(KEY_CATALOG)) localStorage.setItem(KEY_CATALOG, JSON.stringify(nmCatalog));
    }catch(e){}
    try{logs=JSON.parse(localStorage.getItem(KEY_LOGS)||'[]');}catch(e){logs=[];}
    try{catalog=JSON.parse(localStorage.getItem(KEY_CATALOG)||'null');}catch(e){catalog=null;}
    try{settings=JSON.parse(localStorage.getItem(KEY_SETTINGS)||'null')||settings;}catch(e){}
    if(!catalog){
      catalog={habits:[
        {id:uid(),name:'Meditation',cash:1,points:1},
        {id:uid(),name:'Learning',cash:1,points:1},
        {id:uid(),name:'Fitness',cash:2,points:2},
        {id:uid(),name:'Cooking',cash:1,points:1},
        {id:uid(),name:'Sleep ≥ 8h',cash:2,points:2}
      ],vices:[
        {id:uid(),name:'Alcohol',cash:-2,points:-2},
        {id:uid(),name:'Nicotine',cash:-2,points:-2},
        {id:uid(),name:'Weed',cash:-1,points:-1},
        {id:uid(),name:'Doomscrolling',cash:-1,points:-1},
        {id:uid(),name:'Sleep < 6h',cash:-2,points:-2}
      ]}; saveCatalog();
    }
  }
  function saveLogs(){localStorage.setItem(KEY_LOGS, JSON.stringify(logs));}
  function saveCatalog(){localStorage.setItem(KEY_CATALOG, JSON.stringify(catalog));}
  function saveSettings(){localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));}

  var elBalance=document.getElementById('cashBalance'), elTodayDelta=document.getElementById('todayDelta'), elPtsToday=document.getElementById('pointsToday');
  var listHabits=document.getElementById('listHabits'), listVices=document.getElementById('listVices');
  var sheetApply=document.getElementById('sheetApply');

  var itemForm=document.getElementById('itemForm'), catalogList=document.getElementById('catalogList'), editingId=null;

  function renderSelector(){
    listHabits.innerHTML=''; listVices.innerHTML='';
    catalog.habits.forEach(function(it){
      var d=document.createElement('div'); d.className='item habit';
      d.dataset.type='habit'; d.dataset.name=it.name; d.dataset.cash=it.cash; d.dataset.points=it.points;
      d.innerHTML='<span class="name">'+esc(it.name)+'</span><span class="meta">+'+money(it.cash).replace(settings.currency,'')+' • +'+it.points+'pt</span>';
      listHabits.appendChild(d);
    });
    catalog.vices.forEach(function(it){
      var d=document.createElement('div'); d.className='item vice';
      d.dataset.type='vice'; d.dataset.name=it.name; d.dataset.cash=it.cash; d.dataset.points=it.points;
      var cashTxt=(it.cash>0?'+':'')+money(it.cash).replace(settings.currency,'');
      var ptTxt=(it.points>0?'+':'')+it.points+'pt';
      d.innerHTML='<span class="name">'+esc(it.name)+'</span><span class="meta">'+cashTxt+' • '+ptTxt+'</span>';
      listVices.appendChild(d);
    });
  }

  function computeBalanceUpTo(dateInclusive){
    var sum=Number(settings.startingBalance||0);
    logs.forEach(function(r){ if(!dateInclusive || r.date<=dateInclusive) sum+=Number(r.cash||0); });
    return sum;
  }
  function todayTotals(){
    var d=today(), cash=0, pts=0; logs.forEach(function(r){ if(r.date===d){ cash+=Number(r.cash||0); pts+=Number(r.points||0);} });
    return {cash:cash, points:pts};
  }
  function updateHeader(){
    var bal=computeBalanceUpTo(); elBalance.textContent=settings.currency+(Math.round(bal*100)/100);
    var t=todayTotals();
    elTodayDelta.textContent='Today: '+(t.cash>=0?'+':'')+settings.currency+(Math.round(Math.abs(t.cash)*100)/100);
    elPtsToday.textContent='Points today: '+t.points;
  }

  function computeSeries(){
    var set={}; logs.forEach(function(r){ set[r.date]=1; });
    var labels=Object.keys(set); if(labels.indexOf(today())===-1) labels.push(today()); labels.sort();
    var daily=labels.map(function(d){ var s=0; logs.forEach(function(r){ if(r.date===d) s+=Number(r.cash||0); }); return s; });
    var cumulative=labels.map(function(d){ return computeBalanceUpTo(d); });
    return {labels:labels, daily:daily, cumulative:cumulative};
  }
  function buildChart(){
    var ctx=document.getElementById('trendChart').getContext('2d'); var s=computeSeries(); if(window.cashChart) cashChart.destroy();
    window.cashChart=new Chart(ctx,{type:'bar',data:{labels:s.labels,datasets:[
      {type:'bar',label:'Daily Net Cash',data:s.daily,backgroundColor:s.daily.map(v=>v>=0?'rgba(0,200,100,0.92)':'rgba(255,80,80,0.92)'),borderColor:s.daily.map(v=>v>=0?'rgba(0,255,180,1)':'rgba(255,140,140,1)'),borderWidth:1.5,barPercentage:0.9,categoryPercentage:0.9,maxBarThickness:44,yAxisID:'cash'},
      {type:'line',label:'Cumulative Balance',data:s.cumulative,borderColor:'rgba(140,200,255,1)',backgroundColor:'rgba(140,200,255,0.15)',borderWidth:2,pointRadius:0,lineTension:0.25,yAxisID:'cash'}
    ]},options:{responsive:true,maintainAspectRatio:false,legend:{labels:{fontColor:'#fff'}},tooltips:{mode:'index',intersect:false,backgroundColor:'rgba(0,0,0,0.8)',titleFontColor:'#fff',bodyFontColor:'#fff',borderColor:'#333',borderWidth:1,callbacks:{label:function(i,d){var ds=d.datasets[i.datasetIndex],v=i.yLabel; if(ds.label.indexOf('Cash')>-1||ds.label.indexOf('Balance')>-1){var sign=v<0?'-':''; var n=Math.abs(v); return ds.label+': '+sign+settings.currency+(Math.round(n*100)/100);} return ds.label+': '+v;}}},scales:{xAxes:[{stacked:false,gridLines:{color:'rgba(255,255,255,0.06)'},ticks:{fontColor:'#bbb',maxRotation:0,autoSkip:true}}],yAxes:[{id:'cash',position:'left',gridLines:{color:'rgba(255,255,255,0.06)'},ticks:{fontColor:'#bbb'}}]},animation:{duration:500}}});
  }
  function rebuildChart(){buildChart();}

  function addRecord(rec,pushUndo){ logs.push(rec); saveLogs(); if(pushUndo!==false) undoStack.push({op:'add',record:rec}); updateHeader(); rebuildChart(); }
  function undo(){ if(!undoStack.length) return; var step=undoStack.pop(); if(step.op==='add'){ var ts=step.record.ts; var idx=logs.findIndex(r=>r.ts===ts); if(idx!==-1){ logs.splice(idx,1); saveLogs(); } } updateHeader(); rebuildChart(); }
  function exportData(){ var lines=['timestamp,date,type,name,cash,points']; logs.forEach(function(r){ lines.push([r.ts,r.date,r.type,csvEsc(r.name),r.cash,r.points].join(',')); }); downloadBlob(lines.join('\n'),'cashhabit_export.csv','text/csv;charset=utf-8'); }
  function csvEsc(s){ if(s==null) return ''; s=String(s); return (/[",\n]/.test(s))?('"'+s.replace(/"/g,'""')+'"'):s; }
  function downloadBlob(text,filename,type){ var blob=new Blob([text],{type:type}); var url=URL.createObjectURL(blob); var a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); setTimeout(function(){URL.revokeObjectURL(url); a.remove();},0); }

  function refreshCatalogList(){
    var list=document.getElementById('catalogList'); list.innerHTML='';
    function row(it,type){
      var d=document.createElement('div'); d.className='item '+(type==='habit'?'habit':'vice');
      var cashTxt=(it.cash>0?'+':'')+money(it.cash); var ptTxt=(it.points>0?'+':'')+it.points+'pt';
      d.innerHTML='<span class="name">'+esc(it.name)+'</span><span class="meta">'+cashTxt+' • '+ptTxt+'</span><span style="display:flex;gap:8px"><button class="btn" data-act="edit" data-type="'+type+'" data-id="'+it.id+'">Edit</button><button class="btn danger" data-act="del" data-type="'+type+'" data-id="'+it.id+'">Delete</button></span>';
      return d;
    }
    catalog.habits.forEach(it=>list.appendChild(row(it,'habit')));
    catalog.vices.forEach(it=>list.appendChild(row(it,'vice')));
  }
  document.getElementById('catalogList').addEventListener('click',function(e){
    var b=e.target.closest('button'); if(!b) return;
    var act=b.dataset.act, type=b.dataset.type, id=b.dataset.id;
    var arr=(type==='habit')?catalog.habits:catalog.vices;
    if(act==='del'){ var idx=arr.findIndex(x=>x.id===id); if(idx>-1){ arr.splice(idx,1); saveCatalog(); renderSelector(); refreshCatalogList(); } }
    else if(act==='edit'){ var it=arr.find(x=>x.id===id); if(!it) return; editingId=id; document.getElementById('itemName').value=it.name; document.getElementById('itemType').value=type; document.getElementById('itemCash').value=it.cash; document.getElementById('itemPoints').value=it.points; }
  });
  document.getElementById('itemForm').addEventListener('submit',function(e){
    e.preventDefault();
    var rec={ id:editingId||uid(), name:document.getElementById('itemName').value.trim(), cash:Number(document.getElementById('itemCash').value), points:Number(document.getElementById('itemPoints').value) };
    var type=document.getElementById('itemType').value==='vice'?'vice':'habit'; if(!rec.name) return;
    catalog.habits=catalog.habits.filter(x=>x.id!==rec.id); catalog.vices=catalog.vices.filter(x=>x.id!==rec.id);
    if(type==='habit') catalog.habits.push(rec); else catalog.vices.push(rec);
    saveCatalog(); renderSelector(); refreshCatalogList(); editingId=null; e.target.reset();
  });
  document.getElementById('btnNewItem').addEventListener('click',function(){ editingId=null; document.getElementById('itemForm').reset(); });
  document.getElementById('btnCloseManage').addEventListener('click',function(){ document.getElementById('manageSheet').classList.remove('open'); document.getElementById('manageSheet').setAttribute('aria-hidden','true'); });

  function loadSettingsIntoUI(){ document.getElementById('currencySymbol').value=settings.currency||'$'; document.getElementById('startingBalance').value=settings.startingBalance||0; }
  document.getElementById('btnSaveSettings').addEventListener('click',function(){ settings.currency=document.getElementById('currencySymbol').value||'$'; settings.startingBalance=Number(document.getElementById('startingBalance').value||0); saveSettings(); renderSelector(); updateHeader(); rebuildChart(); });
  document.getElementById('btnCloseSettings').addEventListener('click',function(){ document.getElementById('settingsSheet').classList.remove('open'); document.getElementById('settingsSheet').setAttribute('aria-hidden','true'); });

  document.getElementById('sheetApply').addEventListener('click',function(){
    var sel=window.selectedChoice; if(!sel) return;
    var rec={ ts:Date.now(), date:today(), type:sel.type==='vice'?'vice':'habit', name:sel.name||'', cash:Number(sel.cash||0), points:Number(sel.points||0) };
    addRecord(rec,true); window.selectedChoice=null;
  });

  document.getElementById('btnUndo').addEventListener('click',undo);
  document.getElementById('btnExport').addEventListener('click',exportData);

  loadAll(); renderSelector(); refreshCatalogList(); loadSettingsIntoUI(); updateHeader(); buildChart();
})();