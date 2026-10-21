(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const canvas = $('#mazeCanvas');
  const ctx = canvas.getContext('2d');
  const state = { size: 21, grid: [], start: [1, 1], end: [19, 19], tool: 'wall', algorithm: 'astar', events: [], index: -1, timer: null, playing: false, solving: false, visited: new Set(), path: new Set(), current: null, frontier: [], runStarted: 0, solveMs: null, lastResult: null, pointerDown: false, lastEdited: '', bestPath: null };
  const algorithmInfo = {
    bfs: 'Explores outward level by level with a queue. Guarantees a shortest path when every move has equal cost.',
    dfs: 'Follows one branch deeply before backtracking. Uses a stack and may find a longer path.',
    dijkstra: 'Expands the lowest-cost route first using a priority queue. Finds a shortest path for non-negative costs.',
    astar: 'Combines the cost so far with Manhattan distance to guide search toward the goal while finding a shortest path.'
  };
  const algorithmNames = { bfs: 'Breadth-first search', dfs: 'Depth-first search', dijkstra: 'Dijkstra’s algorithm', astar: 'A* search' };
  const directions = [[2,0],[0,2],[-2,0],[0,-2]];
  const key = (p) => `${p[0]},${p[1]}`;
  const same = (a,b) => a && b && a[0] === b[0] && a[1] === b[1];

  function generateMaze(size, difficulty) {
    const grid = Array.from({ length: size }, () => Array(size).fill(0));
    const start = [1, 1], end = [size - 2, size - 2];
    const stack = [start]; grid[1][1] = 1;
    while (stack.length) {
      const [r,c] = stack[stack.length - 1];
      const choices = directions.map(([dr,dc]) => [r+dr,c+dc,dr,dc]).filter(([nr,nc]) => nr > 0 && nc > 0 && nr < size-1 && nc < size-1 && grid[nr][nc] === 0);
      if (!choices.length) { stack.pop(); continue; }
      const [nr,nc,dr,dc] = choices[Math.floor(Math.random()*choices.length)];
      grid[r+dr/2][c+dc/2] = 1; grid[nr][nc] = 1; stack.push([nr,nc]);
    }
    grid[start[0]][start[1]] = 1; grid[end[0]][end[1]] = 1;
    const wallOpenRate = difficulty === 'easy' ? .24 : difficulty === 'hard' ? .035 : .11;
    for (let r=1;r<size-1;r++) for(let c=1;c<size-1;c++) if(grid[r][c]===0 && Math.random()<wallOpenRate) grid[r][c]=1;
    return { grid, start, end };
  }
  function setMessage(text, kind='') { const el=$('#runMessage'); el.className=`run-message ${kind}`; el.innerHTML=`<span class="message-icon">${kind==='error'?'!':kind==='success'?'✓':'i'}</span><span>${escapeHtml(text)}</span>`; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function resetTrace() {
    pauseTimer(); state.events=[]; state.index=-1; state.visited.clear(); state.path.clear(); state.current=null; state.frontier=[]; state.solveMs=null; state.lastResult=null; state.solving=false; state.playing=false;
    $('#visitedStat').textContent='—'; $('#pathStat').textContent='—'; $('#timeStat').textContent='—'; $('#frontierStat').textContent='0'; $('#stepCounter').textContent='0 / 0 steps'; $('#progressBar').style.width='0%'; $('#currentEventTitle').textContent='Waiting to start'; $('#currentEventDetail').textContent='The live algorithm trace will appear here.'; $('#solveBtn').innerHTML='<span class="play-icon">▶</span> Start solving';
  }
  function newMaze(size=state.size, difficulty=$('#difficulty').value) {
    pauseTimer(); state.size=size; const generated=generateMaze(size,difficulty); state.grid=generated.grid; state.start=generated.start; state.end=generated.end;
    $('#mazeSize').value=String(size); $('#mazeDimension').textContent=`${size} × ${size} GRID`; resetTrace(); drawMaze(); setMessage('Fresh maze generated. Choose an algorithm and start the search.');
  }
  function drawMaze() {
    const n=state.size, gap=n>25?2:3, cell=(canvas.width-gap*(n+1))/n, frontierSet=new Set(state.frontier.map(key));
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#0a111d'; ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let r=0;r<n;r++) for(let c=0;c<n;c++) {
      const k=`${r},${c}`, x=gap+c*(cell+gap), y=gap+r*(cell+gap);
      let fill=state.grid[r][c]===0?'#34445b':'#172538';
      if(state.visited.has(k)) fill='#24647b';
      if(state.path.has(k)) fill='#d7f3a1';
      if(same([r,c],state.start)) fill='#58d8e6';
      if(same([r,c],state.end)) fill='#a293ff';
      if(same([r,c],state.current) && !same([r,c],state.start) && !same([r,c],state.end)) fill='#ffb76b';
      ctx.fillStyle=fill; roundRect(ctx,x,y,cell,cell,Math.min(3,cell*.16)); ctx.fill();
      if(frontierSet.has(k) && state.grid[r][c]===1 && !state.path.has(k) && !same([r,c],state.start) && !same([r,c],state.end)) { ctx.strokeStyle='rgba(88,216,230,.65)'; ctx.lineWidth=1.3; roundRect(ctx,x+1,y+1,cell-2,cell-2,Math.min(3,cell*.16)); ctx.stroke(); }
      if(same([r,c],state.current)){ctx.strokeStyle='#ffffff';ctx.lineWidth=2;roundRect(ctx,x+1.5,y+1.5,cell-3,cell-3,Math.min(3,cell*.16));ctx.stroke();}
    }
  }
  function roundRect(context,x,y,w,h,r){context.beginPath();context.roundRect(x,y,w,h,r);}
  function canvasCell(event) {
    const rect=canvas.getBoundingClientRect(); const scaleX=canvas.width/rect.width, scaleY=canvas.height/rect.height;
    const x=(event.clientX-rect.left)*scaleX,y=(event.clientY-rect.top)*scaleY,n=state.size,gap=n>25?2:3,cell=(canvas.width-gap*(n+1))/n;
    const c=Math.floor((x-gap)/(cell+gap)),r=Math.floor((y-gap)/(cell+gap));
    return r>=0&&c>=0&&r<n&&c<n?[r,c]:null;
  }
  function editAt(event) {
    const p=canvasCell(event); if(!p) return; const k=key(p); if(k===state.lastEdited) return; state.lastEdited=k;
    if(state.tool==='start'||state.tool==='end') { if(state.grid[p[0]][p[1]]===0) state.grid[p[0]][p[1]]=1; if(state.tool==='start')state.start=p;else state.end=p; }
    else { if(same(p,state.start)||same(p,state.end))return; state.grid[p[0]][p[1]]=state.grid[p[0]][p[1]]?0:1; }
    resetTrace(); drawMaze(); setMessage('Maze edited. Run the solver again to update the results.');
  }
  function pauseTimer() { if(state.timer){clearInterval(state.timer);state.timer=null;} state.playing=false; }
  function setButtonState(label) { $('#solveBtn').innerHTML=label; }
  function updateEvent(index) {
    if(!state.events.length) return; state.index=Math.max(0,Math.min(index,state.events.length-1)); const e=state.events[state.index];
    if(e.type==='visit'){state.visited.add(key(e.cell));state.current=e.cell;}
    else if(e.type==='add'){state.current=e.cell;}
    else if(e.type==='path'){state.current=e.cell;state.path=new Set((e.path||[]).map(key));state.bestPath=e.path||[];}
    else if(e.type==='fail'){state.current=null;}
    state.frontier=e.frontier||[];
    $('#visitedStat').textContent=String(state.visited.size); $('#frontierStat').textContent=String(state.frontier.length);
    $('#stepCounter').textContent=`${state.index+1} / ${state.events.length} steps`; $('#progressBar').style.width=`${((state.index+1)/state.events.length)*100}%`;
    $('#currentEventTitle').textContent=e.message||'Algorithm step'; $('#currentEventDetail').textContent=e.detail||'';
    if(e.type==='path') { $('#pathStat').textContent=String(Math.max(0,(e.path||[]).length-1)); $('#timeStat').textContent=`${state.solveMs??0} ms`; setMessage(`${algorithmNames[state.algorithm]} found a path with ${(e.path||[]).length-1} moves after exploring ${state.visited.size} cells.`, 'success'); }
    else if(e.type==='fail') { $('#pathStat').textContent='—'; $('#timeStat').textContent=`${state.solveMs??0} ms`; setMessage('No solution exists for this maze. Move or remove walls and try again.', 'error'); }
    else setMessage(`${algorithmNames[state.algorithm]} is exploring the maze…`);
    drawMaze();
  }
  function intervalMs(){return Math.max(18,560-Number($('#speed').value)*52);}
  function play() {
    if(!state.events.length)return;
    if(state.index>=state.events.length-1){pauseTimer();setButtonState('<span class="play-icon">↻</span> Run again');return;}
    pauseTimer(); state.playing=true; setButtonState('<span class="play-icon">Ⅱ</span> Pause');
    state.timer=setInterval(()=>{if(state.index>=state.events.length-1){pauseTimer();setButtonState('<span class="play-icon">↻</span> Run again');return;}updateEvent(state.index+1);},intervalMs());
  }
  async function fetchSolve() {
    if(state.solving)return false; state.solving=true; pauseTimer(); $('#solveBtn').disabled=true; $('#stepBtn').disabled=true; $('#compareBtn').disabled=true; setButtonState('<span class="spinner small-spinner"></span> Solving…'); setMessage('Sending the current maze to the C++17 solver…');
    try {
      const response=await fetch('/api/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grid:state.grid,start:state.start,end:state.end,algorithm:state.algorithm})});
      const data=await response.json(); if(!response.ok||!data.ok)throw new Error(data.error||`Solver request failed (${response.status})`);
      state.events=data.events||[];state.index=-1;state.solveMs=data.elapsedMs;state.lastResult=data;state.visited.clear();state.path.clear();state.current=null;state.frontier=[];state.solving=false;
      if(!state.events.length)throw new Error('The C++ solver returned no animation events.');
      $('#timeStat').textContent=`${data.elapsedMs} ms`; updateEvent(0); return true;
    } catch(err){state.solving=false;setMessage(err.message||'Could not reach the C++ backend. Try again after checking the server.', 'error');$('#currentEventTitle').textContent='Solver unavailable';$('#currentEventDetail').textContent='The maze has not been solved in JavaScript; this page requires the C++ backend.';return false;}
    finally{$('#solveBtn').disabled=false;$('#stepBtn').disabled=false;$('#compareBtn').disabled=false;if(!state.events.length)setButtonState('<span class="play-icon">▶</span> Start solving');}
  }
  async function startOrPause() {
    if(state.solving)return;
    if(state.playing){pauseTimer();setButtonState('<span class="play-icon">▶</span> Resume');return;}
    if(state.events.length && state.index < state.events.length-1){play();return;}
    resetTrace();state.algorithm=$('#algorithmSelect').value;
    const ok=await fetchSolve();if(ok)play();
  }
  async function stepOnce() {
    if(state.solving)return; if(state.playing)pauseTimer();
    if(!state.events.length){resetTrace();state.algorithm=$('#algorithmSelect').value;const ok=await fetchSolve();if(!ok)return;updateEvent(0);setButtonState('<span class="play-icon">▶</span> Resume');return;}
    if(state.index<state.events.length-1)updateEvent(state.index+1);
    setButtonState(state.index>=state.events.length-1?'<span class="play-icon">↻</span> Run again':'<span class="play-icon">▶</span> Resume');
  }
  async function compareAll() {
    pauseTimer(); $('#compareBtn').disabled=true; $('#compareBtn').textContent='Comparing…'; setMessage('Running all four algorithms on the current maze…');
    try {
      const response=await fetch('/api/compare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grid:state.grid,start:state.start,end:state.end})});
      const data=await response.json(); if(!response.ok||!data.ok)throw new Error(data.error||'Comparison failed.');
      renderComparison(data.results||[]);setMessage('Comparison complete. All measurements came from the C++17 backend.', 'success');
    } catch(err){setMessage(err.message||'Could not compare algorithms. Check the C++ backend.', 'error');}
    finally{$('#compareBtn').disabled=false;$('#compareBtn').innerHTML='Compare all four <span>↗</span>';}
  }
  function renderComparison(results) {
    const host=$('#compareResults'); if(!results.length){host.innerHTML='<article class="compare-card compare-placeholder"><h3>No comparison results</h3><p>Try another maze.</p></article>';return;}
    const shortest=Math.min(...results.filter(x=>x.found).map(x=>x.pathLength));
    const fastest=Math.min(...results.map(x=>x.elapsedMs));
    const maxVisited=Math.max(1,...results.map(x=>x.visitedCount));
    host.innerHTML=results.map(r=>`<article class="compare-card ${r.found&&r.pathLength===shortest?'best':''}"><div class="compare-top"><h3>${escapeHtml(algorithmNames[r.algorithm]||r.algorithm)}</h3>${r.found&&r.pathLength===shortest?'<span class="compare-chip">SHORTEST</span>':''}</div><p class="compare-desc">${r.found?'Reached the destination.':'No route found in this maze.'}</p><div class="compare-metrics"><div><span>Path moves</span><strong>${r.found?r.pathLength:'—'}</strong></div><div><span>Visited</span><strong>${r.visitedCount}</strong></div><div><span>Time</span><strong>${r.elapsedMs}<small> ms</small></strong></div><div><span>Relative speed</span><strong>${r.elapsedMs===fastest?'Fastest':'—'}</strong></div></div><div class="compare-bar"><span style="width:${Math.max(4,(r.visitedCount/maxVisited)*100)}%;background:${r.algorithm==='bfs'?'var(--cyan)':r.algorithm==='dfs'?'var(--violet)':r.algorithm==='dijkstra'?'var(--orange)':'var(--green)'}"></span></div></article>`).join('');
  }
  function drawHeroMaze(){const el=$('#heroMaze');if(!el)return;const n=13;el.innerHTML='';for(let r=0;r<n;r++)for(let c=0;c<n;c++){const i=document.createElement('i');const wall=(r===2&&c>1&&c<10)||(c===4&&r>2&&r<11)||(r===9&&c>3&&c<12)||(c===9&&r>1&&r<9)||(r===5&&c>6&&c<12);if(wall)i.classList.add('w');if((r===0&&c===0)||(r===12&&c===12))i.classList.add(r===0?'s':'e');if((r===0&&c<4)||(c===3&&r<8)||(r===7&&c>3&&c<10)||(c===9&&r>6)||(r===12&&c>8))i.classList.add('p');el.appendChild(i);}}
  function setTool(tool){state.tool=tool;document.querySelectorAll('.tool-tab').forEach(b=>{const active=b.dataset.tool===tool;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});canvas.style.cursor=tool==='wall'?'crosshair':'cell';}
  $('#solveBtn').addEventListener('click',startOrPause); $('#stepBtn').addEventListener('click',stepOnce);
  $('#resetBtn').addEventListener('click',()=>{resetTrace();drawMaze();setMessage('Visualization reset. Your maze edits are preserved.');});
  $('#newMazeBtn').addEventListener('click',()=>newMaze(state.size,$('#difficulty').value));
  $('#clearMazeBtn').addEventListener('click',()=>{pauseTimer();state.grid=Array.from({length:state.size},()=>Array(state.size).fill(1));state.grid[state.start[0]][state.start[1]]=state.grid[state.end[0]][state.end[1]]=1;resetTrace();drawMaze();setMessage('All walls cleared. Click cells with Draw walls to build your own maze.');});
  $('#mazeSize').addEventListener('change',e=>newMaze(Number(e.target.value),$('#difficulty').value));
  $('#difficulty').addEventListener('change',()=>newMaze(state.size,$('#difficulty').value));
  $('#algorithmSelect').addEventListener('change',e=>{state.algorithm=e.target.value;$('#algorithmNote').textContent=algorithmInfo[state.algorithm];if(state.events.length){resetTrace();drawMaze();} });
  $('#speed').addEventListener('input',e=>{$('#speedLabel').textContent=`${e.target.value}×`;if(state.playing)play();});
  $('#compareBtn').addEventListener('click',compareAll);
  document.querySelectorAll('.tool-tab').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  canvas.addEventListener('pointerdown',e=>{state.pointerDown=true;state.lastEdited='';canvas.setPointerCapture(e.pointerId);editAt(e);});
  canvas.addEventListener('pointermove',e=>{if(state.pointerDown&&state.tool==='wall')editAt(e);});
  canvas.addEventListener('pointerup',()=>{state.pointerDown=false;state.lastEdited='';});
  canvas.addEventListener('pointercancel',()=>{state.pointerDown=false;state.lastEdited='';});
  $('#themeToggle').addEventListener('click',()=>{document.documentElement.classList.toggle('light-theme');$('#themeToggle').textContent=document.documentElement.classList.contains('light-theme')?'☾':'☼';});
  fetch('/api/health').then(r=>{if(!r.ok)throw new Error('not ready');return r.json();}).then(data=>{const pill=$('#backendStatus');pill.classList.add('ok');pill.innerHTML=`<i></i><span>${escapeHtml(data.solver||'C++ engine')} online</span>`;}).catch(()=>{const pill=$('#backendStatus');pill.classList.add('bad');pill.innerHTML='<i></i><span>C++ engine offline</span>';setMessage('The C++ backend is not available. Start the application server to enable solving.', 'error');});
  drawHeroMaze(); $('#algorithmNote').textContent=algorithmInfo[state.algorithm];newMaze(21,'medium');
})();
