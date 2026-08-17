(() => {
  'use strict';

  const COLORS=[
    '#e78498','#e8aa62','#d8c854',
    '#55b96a','#e06b62','#4f76df',
    '#b477c5','#9a7b60','#6871b8'
  ];

  const MODES={
    easy:{label:'Easy',reward:4,size:0,given:1},
    medium:{label:'Medium',reward:8,size:0,given:0},
    hard:{label:'Hard',reward:12,size:1,given:0},
    hell:{label:'Hell',reward:16,size:3,given:0}
  };

  const TIME_LIMITS={
    10:{easy:300,medium:270,hard:240,hell:210},
    20:{easy:330,medium:300,hard:270,hell:240},
    30:{easy:330,medium:300,hard:270,hell:240},
    40:{easy:360,medium:330,hard:300,hell:270},
    50:{easy:360,medium:330,hard:300,hell:270},
    60:{easy:390,medium:360,hard:315,hell:285}
  };

  const HELL_VARIANTS={
    2:666,3:162,4:20602,5:17064,6:5413,7:4995,8:211,9:8219,
    10:1107,11:5590,12:19360,13:5493,14:13248,15:2394,16:10926,17:8730,
    18:4041,19:2655,20:3711,21:19082,22:4573,23:759,24:1693,25:2439,
    26:2880,27:5670,28:5490,29:8118,30:1929,31:3051,32:7246,33:8003,
    34:2403,35:7965,36:684,37:352,38:9668,39:900,40:4104,41:10164,
    42:10422,43:1829,44:4934,45:4458,46:10953,47:4716,48:6921,49:4788,
    50:10802,51:15798,52:10098,53:3402,54:5148,55:14634,56:3882,57:981,
    58:1576,59:3133,60:1181
  };

  const HARD_VARIANTS={
    2:17,3:209,4:111,5:279,6:949,7:246,8:364,9:96,
    10:389,11:56,12:308,13:469,14:297,15:594,16:1541,17:402,
    18:81,19:470,20:836,21:830,22:154,23:333,24:244,25:18,
    26:423,27:38,28:82,29:864,30:1117,31:451,32:837,33:1252,
    34:119,35:193,36:659,37:1152,38:269,39:621,40:425,41:630,
    42:272,43:969,44:82,45:765,46:336,47:1098,48:198,49:738,
    50:513,51:522,52:40,53:252,54:189,55:661,56:2234,57:280,
    58:1595,59:577,60:684
  };

  const SAVE_KEY='meowdoku_progress_v1';

  const state={
    level:1,mode:'easy',activeLevel:null,modePickerExitToLevels:false,
    lives:3,marks:new Set(),found:new Set(),seconds:0,timeLimit:0,
    startedAt:0,hintsUsed:0,timer:null,
    wallet:0,pending:new Map(),levels:[],modeLevels:new Map(),save:loadSave(),
    progressReady:false,coachStep:-1,coachTarget:null,
    catActions:new Map(),catActionTimers:new Map()
  };

  const $=id=>document.getElementById(id);

  function loadSave(){
    try{
      return JSON.parse(localStorage.getItem(SAVE_KEY))||
        {unlocked:1,completed:{}}
    }catch{
      return{
        unlocked:1,completed:{}
      }
    }
  }

  function persist(){
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify(state.save)
    )
  }

  function normalizedSave(value){
    const source=value?.completed&&typeof value.completed==='object'?
      value.completed:{},
      completed={};

    Object.entries(source).forEach(([key,result])=>{
      completed[key.includes(':')?key:`${key}:easy`]=result
    });

    return{
      unlocked:Math.max(
        1,
        Math.min(60,Math.floor(Number(value?.unlocked)||1))
      ),
      completed
    }
  }

  function mergeProgress(remote){
    const cloud=normalizedSave({
      unlocked:remote?.unlocked_level,
      completed:remote?.completed_modes
    }),
      local=normalizedSave(state.save);

    state.save={
      unlocked:Math.max(cloud.unlocked,local.unlocked),
      completed:{...cloud.completed,...local.completed}
    };

    state.progressReady=true;
    persist();
    renderLevels()
  }

  function enableLocalProgress(){
    state.progressReady=true;
    renderLevels()
  }

  function modeKey(level,mode=state.mode){
    return`${level}:${mode}`
  }

  function currentLevel(){
    return state.activeLevel||
      state.levels[state.level-1]
  }

  function syncProgress(level){
    const result=state.save.completed[modeKey(level)],
      definition=currentLevel();

    if(!result||!definition)return;

    parent.postMessage({
      type:'MEOWDOKU_SAVE_PROGRESS',
      progress:{
        completed_level:level,
        mode:state.mode,
        score:definition.catCount*100,
        time_seconds:result.time,
        mistakes:Math.max(0,3-result.lives),
        hints_used:state.hintsUsed,
        lives_remaining:result.lives
      }
    },location.origin)
  }

  function rng(seed){
    return()=>{
      seed|=0;
      seed=seed+0x6D2B79F5|0;
      let t=Math.imul(seed^seed>>>15,1|seed);
      t=t+Math.imul(t^t>>>7,61|t)^t;
      return((t^t>>>14)>>>0)/4294967296
    }
  }

  function shuffled(values,seed){
    const out=values.slice(),
      random=rng(seed);

    for(let i=out.length-1;i>0;i--){
      const j=Math.floor(random()*(i+1));
      [out[i],out[j]]=[out[j],out[i]]
    }

    return out
  }

  function makeColorPalette(number,count,variant=0){
    return shuffled(
      [...Array(COLORS.length).keys()],
      number*104729+variant*8191+31337
    ).slice(0,count)
  }

  function makeSolution(n,seed){
    const random=rng(seed),
      cols=[...Array(n).keys()];

    for(let tries=0;tries<300;tries++){
      cols.sort(()=>random()-.5);
      const out=[];

      function go(r){
        if(r===n)return true;

        for(const c of cols.slice().sort(()=>random()-.5)){
          if(
            out.includes(c)||
            out.some((x,i)=>Math.abs(x-c)===r-i)
          )continue;

          out.push(c);
          if(go(r+1))return true;
          out.pop()
        }

        return false
      }

      if(go(0))return out
    }

    throw Error('Unable to create puzzle')
  }

  function makeStableSolution(n,seed){
    const random=rng(seed),
      shuffle=values=>{
        const out=values.slice();

        for(let i=out.length-1;i>0;i--){
          const j=Math.floor(random()*(i+1));
          [out[i],out[j]]=[out[j],out[i]]
        }

        return out
      };

    for(let tries=0;tries<300;tries++){
      const out=[];

      function go(r){
        if(r===n)return true;

        for(const c of shuffle([...Array(n).keys()])){
          if(
            out.includes(c)||
            out.some((x,i)=>Math.abs(x-c)===r-i)
          )continue;

          out.push(c);
          if(go(r+1))return true;
          out.pop()
        }

        return false
      }

      if(go(0))return out;
    }

    throw Error('Unable to create stable Hell puzzle');
  }

  function countSolutions(candidates,n,limit=2){
    let count=0;
    const used=[];

    function go(r){
      if(count>=limit)return;

      if(r===n){
        count++;
        return
      }

      for(const c of candidates[r]){
        if(
          used.includes(c)||
          used.some((x,i)=>Math.abs(x-c)===r-i)
        )continue;

        used.push(c);
        go(r+1);
        used.pop()
      }
    }

    go(0);
    return count
  }

  function attacks(a,r,c){
    return a.r===r||a.c===c||
      Math.max(
        Math.abs(a.r-r),
        Math.abs(a.c-c)
      )===1
  }

  function findSolutions(level,givenCount,limit=2){
    const given=level.cats.slice(0,givenCount),
      byColor=Array.from({length:level.catCount},()=>[]);

    for(let r=0;r<level.n;r++)
      for(let c=0;c<level.n;c++)
        byColor[level.colorGrid[r][c]].push({r,c});

    for(let color=0;color<givenCount;color++)
      byColor[color]=[given[color]];

    const order=[...Array(level.catCount).keys()].sort(
      (a,b)=>byColor[a].length-byColor[b].length
    ),
      placed=[],
      solutions=[];

    function search(index){
      if(solutions.length>=limit)return;

      if(index===order.length){
        solutions.push(placed.map(item=>({...item})));
        return
      }

      const color=order[index];

      for(const cell of byColor[color]){
        if(
          placed.some(cat=>attacks(cat,cell.r,cell.c))
        )continue;

        placed.push({...cell,color});
        search(index+1);
        placed.pop()
      }
    }

    search(0);
    return solutions
  }

  function hasSimpleDeductionChain(level,givenCount){
    const found=level.cats.slice(0,givenCount),
      solved=new Set(
        Array.from({length:givenCount},(_,i)=>i)
      );

    while(solved.size<level.catCount){
      let forced=null;

      for(let color=0;color<level.catCount;color++){
        if(solved.has(color))continue;
        const candidates=[];

        for(let r=0;r<level.n;r++)
          for(let c=0;c<level.n;c++){
            if(level.colorGrid[r][c]!==color)continue;
            if(found.some(cat=>attacks(cat,r,c)))continue;
            candidates.push({r,c})
          }

        if(candidates.length===0)return false;

        if(candidates.length===1){
          forced={color,...candidates[0]};
          break
        }
      }

      if(!forced)return false;
      const answer=level.cats[forced.color];
      if(answer.r!==forced.r||answer.c!==forced.c)return false;
      found.push(answer);
      solved.add(forced.color)
    }

    return true
  }

  function hasHellDeductionChain(level){
    const candidates=Array.from(
      {length:level.catCount},
      (_,color)=>{
        const cells=[];
        for(let r=0;r<level.n;r++)
          for(let c=0;c<level.n;c++)
            if(level.colorGrid[r][c]===color)
              cells.push({r,c});
        return cells;
      }
    );
    const solved=new Map(),
      advancedInfluenced=new Set();
    let advancedEliminations=0,
      advancedResolutions=0,
      advancedRounds=0;
    let changed=true,
      guard=0;
    while(
      changed&&solved.size<level.catCount&&
      guard++<level.n*level.n*4
    ){
      changed=false;
      let advancedChanged=false;

      // A confirmed cat removes every candidate in its row, column and 3x3
      // neighbourhood. It also removes the other cells of its own color.
      for(const [color,cat] of solved){
        for(let other=0;other<level.catCount;other++){
          if(other===color)continue;
          const next=candidates[other].filter(
            cell=>!attacks(cat,cell.r,cell.c)
          );
          if(next.length!==candidates[other].length){
            candidates[other]=next;
            changed=true
          }
        }
      }

      // If every remaining position of one color attacks a cell, that cell can
      // never contain another color's cat. This includes the advanced Hell
      // deductions where all candidates share a row/column or have a common
      // neighbouring intersection.
      for(let color=0;color<level.catCount;color++){
        if(solved.has(color)||candidates[color].length<2)continue;
        const source=candidates[color];
        for(let other=0;other<level.catCount;other++){
          if(other===color||solved.has(other))continue;
          const next=candidates[other].filter(
            cell=>!source.every(
              option=>attacks(option,cell.r,cell.c)
            )
          );
          if(next.length!==candidates[other].length){
            advancedEliminations+=candidates[other].length-next.length;
            advancedInfluenced.add(other);
            candidates[other]=next;
            changed=true;
            advancedChanged=true
          }
        }
      }
      if(advancedChanged)
        advancedRounds++;

      for(let color=0;color<level.catCount;color++){
        if(solved.has(color))continue;
        if(candidates[color].length===0)return false;
        if(candidates[color].length===1){
          const forced=candidates[color][0],
            answer=level.cats[color];
          if(forced.r!==answer.r||forced.c!==answer.c)return false;
          solved.set(color,forced);
          if(advancedInfluenced.has(color))
            advancedResolutions++;
          changed=true;
        }
      }
    }
    level.hellLogicStats={
      advancedEliminations,
      advancedResolutions,
      advancedRounds
    };
    return solved.size===level.catCount;
  }

  function isLogicallySolvable(level,givenCount){
    const solutions=findSolutions(level,givenCount,2);
    if(
      solutions.length!==1||
      !hasSimpleDeductionChain(level,givenCount)
    )return false;
    const solution=solutions[0];
    return level.cats.every(
      (cat,color)=>solution.some(
        item=>item.color===color&&item.r===cat.r&&item.c===cat.c
      )
    )
  }

  function isHellLogicallySolvable(level){
    const solutions=findSolutions(level,0,2);
    if(solutions.length!==1||!hasHellDeductionChain(level))return false;
    return level.cats.every(
      (cat,color)=>solutions[0].some(
        item=>item.color===color&&item.r===cat.r&&item.c===cat.c
      )
    );
  }

  function hellNeedsAdvancedOpening(level){
    const byColor=Array.from({length:level.catCount},()=>[]);
    for(let r=0;r<level.n;r++)
      for(let c=0;c<level.n;c++)
        byColor[level.colorGrid[r][c]].push({r,c});
    const starters=byColor
      .map((cells,color)=>({cells,color}))
      .filter(item=>item.cells.length===1);
    if(starters.length!==1)return false;
    const first=starters[0].cells[0];
    // After the obvious opening cat is used, Hell must not expose another
    // direct one-cell answer. The next progress must come from an aligned or
    // common-coverage candidate deduction.
    for(let color=0;color<level.catCount;color++){
      if(color===starters[0].color)continue;
      const remaining=byColor[color].filter(
        cell=>!attacks(first,cell.r,cell.c)
      );
      if(remaining.length<=1)return false;
    }
    return true;
  }

  function hasDeepHellReasoning(level){
    const stats=level.hellLogicStats||{};
    const requiredResolutions=Math.max(
      3,
      Math.ceil((level.catCount-1)*.55)
    );
    return Number(stats.advancedResolutions)>=requiredResolutions&&
      Number(stats.advancedRounds)>=2&&
      Number(stats.advancedEliminations)>=level.n;
  }

  function hasHardReasoning(level){
    const stats=level.hellLogicStats||{};
    const resolutions=Number(stats.advancedResolutions),
      rounds=Number(stats.advancedRounds),
      eliminations=Number(stats.advancedEliminations);
    const maximumResolutions=Math.max(
      2,
      Math.floor((level.catCount-1)*.45)
    );
    return resolutions>=2&&resolutions<=maximumResolutions&&
      rounds===1&&eliminations>=3&&eliminations<level.n;
  }
  
  function makeLevel(number,variant=0,mode='easy'){
    const config=MODES[mode]||MODES.easy;

    if(number===1&&mode==='easy')
      return{
        number,
        mode,
        n:5,
        catCount:3,
        cats:[
          {r:0,c:1},
          {r:3,c:0},
          {r:4,c:3}
        ],
        colorGrid:[
          [0,0,0,2,0],
          [1,1,0,0,0],
          [0,0,0,0,0],
          [1,0,2,2,0],
          [0,0,0,2,0]
        ],
        colorPalette:makeColorPalette(number,3,variant),
        reward:4,
        hintCost:5,
        difficulty:'Tutorial',
        givenCount:1,
        verified:true
      };

    const modeIndex=Object.keys(MODES).indexOf(mode),
      givenCount=config.given,
      baseN=number<=3?5:number<=10?6:number<=30?7:number<=50?8:9,
      maxN=mode==='hell'?9:mode==='hard'?8:9,
      n=Math.min(maxN,baseN+config.size),
      catCount=givenCount?Math.max(4,n-1):n,
      seed=number*7919+variant*65537+modeIndex*1000003+17,
      advancedMode=mode==='hard'||mode==='hell',
      fullSolution=advancedMode?makeStableSolution(n,seed):makeSolution(n,seed),
      rows=catCount<n?
        shuffled(
          [...Array(n).keys()],
          number*3571+variant*12289+modeIndex*91771+91
        ).slice(0,catCount).sort((a,b)=>a-b):
        [...Array(n).keys()],
      cats=rows.map(r=>({r,c:fullSolution[r]})),
      colorGrid=Array.from({length:n},()=>Array(n).fill(0));

    cats.forEach(
      (cat,color)=>colorGrid[cat.r][cat.c]=color
    );

    for(let r=0;r<n;r++)
      for(let c=0;c<n;c++){
        if(cats.some(cat=>cat.r===r&&cat.c===c))continue;
        let attacker=-1;
        for(let i=0;i<cats.length-1;i++)
          if(attacks(cats[i],r,c)){
            attacker=i;
            break
          }
        colorGrid[r][c]=attacker>=0?attacker+1:0
      }

    if(advancedMode){
      // Hell starts with one visually unambiguous color region. Its only cell
      // contains the first solution cat, but the cat itself is not pre-revealed.
      const first=cats[0];

      for(let r=0;r<n;r++)
        for(let c=0;c<n;c++){
          if(colorGrid[r][c]!==0||(r===first.r&&c===first.c))continue;
          const attacker=cats.findIndex(
            (cat,index)=>index>0&&attacks(cat,r,c)
          );
          // A row always has a solution cat. If only color zero attacks this cell,
          // color one is safe because the first forced cat eliminates it immediately.
          colorGrid[r][c]=attacker>0?attacker:1;
        }

      // Break the ordinary one-color-at-a-time chain. Extra cells are moved to
      // colors whose solution cats attack them. Before those cats are known,
      // these create aligned and overlapping candidate groups that require the
      // Hell-only shared-line/common-coverage deductions.
      const hellRandom=rng(seed^0x5f3759df);
      const hellMix=
        (mode==='hard'?.08:.12)+
        (variant%9)*(mode==='hard'?.04:.055);

      for(let r=0;r<n;r++)
        for(let c=0;c<n;c++){
          if(
            cats.some(cat=>cat.r===r&&cat.c===c)||
            hellRandom()>hellMix
          )continue;
          const attackers=[];
          for(let color=1;color<cats.length;color++)
            if(attacks(cats[color],r,c))
              attackers.push(color);
          if(attackers.length)
            colorGrid[r][c]=
              attackers[Math.floor(hellRandom()*attackers.length)];
        }
    }

    const level={
      number,
      mode,
      n,
      catCount,
      cats,
      colorGrid,
      colorPalette:makeColorPalette(
        number+modeIndex*67,
        catCount,
        variant
      ),
      reward:config.reward,
      hintCost:number<=10?5:number<=30?10:number<=50?15:20,
      difficulty:config.label,
      givenCount,
      verified:false
    };

    level.verified=
      mode==='hell'?
        isHellLogicallySolvable(level)&&
        !hasSimpleDeductionChain(level,0)&&
        hellNeedsAdvancedOpening(level)&&
        hasDeepHellReasoning(level):
      mode==='hard'?
        isHellLogicallySolvable(level)&&
        !hasSimpleDeductionChain(level,0)&&
        hasHardReasoning(level):
        isLogicallySolvable(level,givenCount);

    if(!level.verified)
      throw new Error(
        `Level ${number} ${mode} failed logical verification`
      );

    return level
  }

  function catLayoutKey(level){
    return`${level.n}|${level.cats.map(cat=>`${cat.r},${cat.c}`).sort().join('|')}`
  }

  function boardDesignKey(level){
    return`${catLayoutKey(level)}|${level.colorPalette.join(',')}|${level.colorGrid.map(row=>row.join(',')).join(';')}`
  }

  function makeDistinctLevels(total){
    const levels=[],
      catLayouts=new Set(),
      boardDesigns=new Set();

    for(let number=1;number<=total;number++){
      let accepted=null;

      for(let variant=0;variant<500&&!accepted;variant++){
        let candidate;

        try{
          candidate=makeLevel(number,variant,'easy')
        }catch{
          continue
        }

        const catKey=catLayoutKey(candidate),
          boardKey=boardDesignKey(candidate);

        if(catLayouts.has(catKey)||boardDesigns.has(boardKey))continue;
        catLayouts.add(catKey);
        boardDesigns.add(boardKey);
        accepted=candidate
      }

      if(!accepted)
        throw new Error(
          `Unable to create a distinct logical level ${number}`
        );

      levels.push(accepted)
    }

    return levels
  }

  function getModeLevel(number,mode){
    const key=modeKey(number,mode);

    if(state.modeLevels.has(key))
      return state.modeLevels.get(key);

    if(mode==='hell'||mode==='hard'){
      const variants=mode==='hell'?HELL_VARIANTS:HARD_VARIANTS,
        variant=variants[number];

      if(variant==null)
        throw new Error(
          `Missing verified ${mode} design for level ${number}`
        );

      const level=makeLevel(number,variant,mode);
      state.modeLevels.set(key,level);
      return level
    }

    for(let variant=0;variant<700;variant++){
      try{
        const level=makeLevel(number,variant,mode);
        state.modeLevels.set(key,level);
        return level
      }catch{}
    }

    throw new Error(
      `Unable to create level ${number} in ${mode} mode`
    )
  }

  state.levels=makeDistinctLevels(60);

  state.levels.forEach(level=>{
    const givenCount=level.givenCount||0;
    if(!isLogicallySolvable(level,givenCount))
      throw new Error(
        `Meowdoku rejected level ${level.number}: guessing would be required`
      );
    level.verified=true;
  });

  function buildRuleDemos(){
    const make=(id,cells)=>{
      const root=$(id);
      root.innerHTML='';
      cells.forEach(({text='',alt=false,cat=false})=>{
        const cell=document.createElement('i');
        cell.className=`demo-cell${alt?' alt':''}${cat?' cat':''}`;
        cell.textContent=text;
        root.appendChild(cell)
      })
    };

    make(
      'color-demo',
      Array.from(
        {length:9},
        (_,i)=>({
          alt:i===2||i===5,
          text:i===4?'🐱':i===2||i===5?'':'×',
          cat:i===4
        })
      )
    );

    make(
      'line-demo',
      Array.from(
        {length:9},
        (_,i)=>({
          text:i===4?'🐱':i===1||i===3||i===5||i===7?'×':'',
          cat:i===4
        })
      )
    );

    make(
      'touch-demo',
      Array.from(
        {length:9},
        (_,i)=>({text:i===4?'🐱':'×',cat:i===4})
      )
    )
  }

  function showScreen(name){
    $('level-screen').classList.toggle('active',name==='levels');
    $('game-screen').classList.toggle('active',name==='game')
  }

  function completedModeCount(level){
    return level===1?
      (state.save.completed[modeKey(1,'easy')]?1:0):
      Object.keys(MODES).filter(
        mode=>state.save.completed[modeKey(level,mode)]
      ).length
  }

  function renderLevels(){
    const grid=$('level-grid');
    grid.innerHTML='';

    state.levels.forEach(l=>{
      const total=l.number===1?1:4,
        completed=completedModeCount(l.number),
        done=completed===total,
        unlocked=l.number<=state.save.unlocked,
        playable=state.progressReady&&unlocked&&!done;

      const b=document.createElement('button');
      b.className=`level-btn ${done?'done':''} ${l.number===state.save.unlocked&&!done?'current':''} ${unlocked?'unlocked':'locked'}`;
      b.disabled=!playable;
      b.setAttribute(
        'aria-label',
        !state.progressReady?
          `Level ${l.number}, loading progress`:
          unlocked?
            l.number===1?
              `Tutorial level, ${done?'completed':'ready to play'}`:
              `Level ${l.number}, ${completed} of 4 modes completed`:
            `Level ${l.number}, locked`
      );
      b.innerHTML=`<strong>${l.number}</strong><small>${l.number===1?'Tutorial':`${completed} / 4 modes`}</small><i aria-hidden="true">${done?'COMPLETED':!state.progressReady?'SYNCING':unlocked?l.number===1?'PLAY TUTORIAL':'CHOOSE MODE':'LOCKED'}</i>`;
      if(playable)
        b.onclick=()=>l.number===1?
          startLevel(1,'easy'):
          openModePicker(l.number);
      grid.appendChild(b)
    });

    const more=document.createElement('div');
    more.className='level-more-card';
    more.innerHTML='<span aria-hidden="true">🐾</span><div><b>More levels are being designed</b><small>New cat puzzles are coming. Stay tuned!</small></div>';
    grid.appendChild(more);

    const modesDone=state.levels.reduce(
      (sum,l)=>sum+completedModeCount(l.number),0
    ),levelsDone=state.levels.filter(
      l=>completedModeCount(l.number)>0
    ).length;

    $('progress-label').textContent=state.progressReady?
      `${levelsDone} / 60 levels · ${modesDone} / 237 challenges`:
      'Syncing progress…'
  }

  function installModePicker(){
    const modal=document.createElement('div');
    modal.id='mode-modal';
    modal.className='modal mode-modal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML='<div class="modal-card mode-card"><button id="mode-close" class="mode-close" aria-label="Close">×</button><small>SELECT A CHALLENGE</small><h2 id="mode-title">Level</h2><p>Each mode has its own puzzle, completion record, and coin reward.</p><div id="mode-grid" class="mode-grid"></div></div>';
    document.body.appendChild(modal);
    $('mode-close').onclick=closeModePicker;
    modal.onclick=e=>{
      if(e.target===modal)closeModePicker()
    }
  }

  function openModePicker(number,exitToLevels=false){
    if(number===1){
      startLevel(1,'easy');
      return
    }

    state.modePickerExitToLevels=exitToLevels;
    $('mode-title').textContent=`Level ${number}`;
    const grid=$('mode-grid');
    grid.innerHTML='';

    Object.entries(MODES).forEach(([mode,config])=>{
      const done=Boolean(state.save.completed[modeKey(number,mode)]),
        button=document.createElement('button');
      button.className=`mode-option mode-${mode}${done?' completed':''}`;
      button.disabled=done;
      button.innerHTML=`<b>${config.label}</b><span>${done?'Completed':`+${config.reward} coins`}</span><small>${mode==='easy'?'One starting cat':mode==='medium'?'No starting cats':mode==='hard'?'Advanced logic · up to 8×8':'Deep logic · 8×8 to 9×9'}</small>`;
      if(!done)
        button.onclick=()=>{
          try{
            startLevel(number,mode);
            closeModePicker(false)
          }catch(error){
            console.error(`Unable to open level ${number} ${mode}:`,error);
            message(
              'This challenge could not be prepared. Please refresh and try again.',
              'error'
            )
          }
        };
      grid.appendChild(button)
    });

    $('mode-modal').classList.add('open');
    $('mode-modal').setAttribute('aria-hidden','false')
  }

  function closeModePicker(useExit=true){
    $('mode-modal')?.classList.remove('open');
    $('mode-modal')?.setAttribute('aria-hidden','true');
    const shouldExit=useExit&&state.modePickerExitToLevels;
    state.modePickerExitToLevels=false;
    if(shouldExit)goLevels()
  }

  function clearCatActions(){
    state.catActionTimers.forEach(clearTimeout);
    state.catActionTimers.clear();
    state.catActions.clear()
  }

  function setCatActionElement(key,action){
    const cat=document.querySelector(`[data-key="${key}"] .cat-sprite`);
    if(!cat)return;
    cat.classList.remove('waving');
    if(action){
      void cat.offsetWidth;
      cat.classList.add(action)
    }
    cat.setAttribute(
      'aria-label',
      action==='waving'?'Cat waving':'Cat'
    )
  }

  function scheduleCatAction(key){
    if(state.catActionTimers.has(key)||state.catActions.has(key))return;

    const delay=900+Math.random()*1400,
      level=state.level;

    const timer=setTimeout(()=>{
      state.catActionTimers.delete(key);

      if(state.level!==level||!state.found.has(key))return;

      const action='waving',
        duration=1500;

      state.catActions.set(key,action);
      setCatActionElement(key,action);

      const finish=setTimeout(()=>{
        state.catActionTimers.delete(key);
        state.catActions.delete(key);

        if(state.level===level&&state.found.has(key)){
          setCatActionElement(key,null);
          scheduleCatAction(key)
        }
      },duration);

      state.catActionTimers.set(key,finish)
    },delay);

    state.catActionTimers.set(key,timer)
  }

  function startLevel(number,mode=state.mode){
    if(!state.progressReady){
      message('Please wait while your progress syncs.');
      return
    }
    if(number===1)mode='easy';
    if(!MODES[mode])return;
    if(state.save.completed[modeKey(number,mode)]){
      message(
        number===1?
          'The tutorial is already completed.':
          `${MODES[mode].label} mode is already completed.`
      );
      number===1?goLevels():openModePicker(number);
      return
    }
    if(number>state.save.unlocked){
      message('Complete the previous level first.');
      renderLevels();
      showScreen('levels');
      return
    }

    clearInterval(state.timer);
    clearCatActions();
    closeCoach();
    const l=getModeLevel(number,mode);
    state.level=number;
    state.mode=mode;
    state.activeLevel=l;
    state.lives=3;
    state.marks=new Set();
    state.found=new Set();
    state.seconds=0;
    state.timeLimit=getTimeLimit(number,mode);
    state.startedAt=Date.now();
    state.hintsUsed=0;

    if(l.givenCount>0){
      const cat=l.cats[0],
        key=`${cat.r},${cat.c}`;
      state.found.add(key);
      scheduleCatAction(key)
    }

    $('level-title').textContent=number===1?
      '1 · Tutorial':
      `${number} · ${MODES[mode].label}`;
    $('hint-cost').textContent=String(l.hintCost);
    renderBoard();
    updateHud();
    showScreen('game');
    startTimer();
    if(number===1)setTimeout(startCoach,250)
  }

  function renderBoard(animateKey){
    const l=currentLevel(),
      board=$('board');
    board.style.setProperty('--size',l.n);
    board.innerHTML='';

    for(let r=0;r<l.n;r++)
      for(let c=0;c<l.n;c++){
        const key=`${r},${c}`,
          color=l.colorGrid[r][c],
          cell=document.createElement('button');
        cell.className='cell';
        cell.style.setProperty(
          '--tile-color',COLORS[l.colorPalette[color]]
        );
        cell.dataset.color=String(color);
        cell.dataset.key=key;
        cell.setAttribute('aria-label',`Row ${r+1}, column ${c+1}`);
        if(state.marks.has(key))cell.classList.add('marked');
        if(state.found.has(key)){
          const action=state.catActions.get(key),
            cat=document.createElement('span');
          cat.className=`cat-sprite${action?` ${action}`:''}`;
          cat.setAttribute('role','img');
          cat.setAttribute(
            'aria-label',
            action==='waving'?'Cat waving':'Cat'
          );
          cell.appendChild(cat);
          if(key===animateKey)cell.classList.add('just-found')
        }
        if(
          (state.coachStep===3||state.coachStep===4)&&
          state.coachTarget
        )
          cell.classList.add(
            key===state.coachTarget?'tutorial-focus':'tutorial-dim'
          );
        let tapTimer;
        cell.onclick=()=>{
          clearTimeout(tapTimer);
          tapTimer=setTimeout(()=>toggleMark(key),220)
        };
        cell.ondblclick=e=>{
          e.preventDefault();
          clearTimeout(tapTimer);
          confirmCat(key)
        };
        let lastTouch=0;
        cell.ontouchend=e=>{
          const now=Date.now();
          if(now-lastTouch<280){
            e.preventDefault();
            clearTimeout(tapTimer);
            confirmCat(key)
          }
          lastTouch=now
        };
        board.appendChild(cell)
      }
  }

  function toggleMark(key){
    if(state.found.has(key))return;

    if(state.coachStep===4){
      message('Double-tap the highlighted cell.');
      renderBoard();
      return
    }

    if(state.coachStep===3&&key!==state.coachTarget)
      return message('Tap the highlighted cell.');

    state.marks.has(key)?
      state.marks.delete(key):
      state.marks.add(key);

    renderBoard();

    if(state.coachStep===3&&key===state.coachTarget)
      setTimeout(coachPlaceCat,180)
  }

  function confirmCat(key){
    if(state.found.has(key))return;

    if(state.coachStep===4&&key!==state.coachTarget)
      return message('Double-tap the highlighted cell.');

    const l=currentLevel(),
      [r,c]=key.split(',').map(Number),
      cell=document.querySelector(`[data-key="${key}"]`),
      catIndex=l.cats.findIndex(cat=>cat.r===r&&cat.c===c),
      isCat=catIndex>=0;

    if(!isCat){
      state.lives--;
      state.marks.add(key);
      cell?.classList.add('wrong');
      message('No cat here. One life was lost.');
      setTimeout(()=>renderBoard(),380);
      if(state.lives<=0)return failLevel()
    }else{
      state.marks.delete(key);
      state.found.add(key);
      parent.postMessage({
        type:'MEOWDOKU_CAT_FOUND',
        level:state.level,
        cat_index:catIndex
      },location.origin);
      scheduleCatAction(key);
      message('Purr-fect deduction!');
      renderBoard(key);
      if(state.coachStep===4){
        closeCoach();
        message('Great! Tutorial complete.')
      }
      if(state.found.size===l.catCount)return completeLevel()
    }

    updateHud()
  }

  function updateHud(){
    const l=currentLevel(),
      lives=$('lives');

    lives.innerHTML=Array.from(
      {length:3},
      (_,i)=>`<span class="paw-life${i>=state.lives?' empty':''}" aria-hidden="true"></span>`
    ).join('');

    lives.setAttribute(
      'aria-label',
      `${state.lives} lives remaining`
    );

    $('found-count').textContent=
      `${state.found.size} / ${l.catCount}`;
    $('score').textContent=String(state.found.size*100);
    refreshTime()
  }

  function getTimeLimit(level,mode){
    return TIME_LIMITS[level]?.[mode]||0
  }

  function refreshTime(){
    if(state.startedAt)
      state.seconds=Math.max(
        0,
        Math.floor((Date.now()-state.startedAt)/1000)
      );

    const countdown=state.timeLimit>0,
      value=countdown?
        Math.max(0,state.timeLimit-state.seconds):
        state.seconds,
      pill=$('time-pill'),
      display=$('time-display');

    if(display)
      display.textContent=formatTime(value);

    if(pill){
      pill.classList.toggle('countdown',countdown);
      pill.setAttribute(
        'aria-label',
        countdown?
          `${formatTime(value)} remaining`:
          `${formatTime(value)} elapsed`
      )
    }

    return value
  }

  function startTimer(){
    clearInterval(state.timer);
    refreshTime();

    state.timer=setInterval(()=>{
      const remaining=refreshTime();

      if(state.timeLimit>0&&remaining<=0)
        failTimeLevel()
    },250)
  }

  function formatTime(s){
    return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
  }

  function message(text,type='info'){
    if(type==='info'&&text.startsWith('No cat'))type='error';
    if(type==='error')navigator.vibrate?.(90);

    const toast=$('message');
    toast.textContent=text;
    toast.className=`message show ${type}`;
    clearTimeout(message.t);
    message.t=setTimeout(()=>{
      toast.textContent='';
      toast.className='message'
    },2600)
  }

  function requestSpend(amount){
    return new Promise(resolve=>{
      const requestId=crypto.randomUUID?.()||
        `${Date.now()}-${Math.random()}`;

      state.pending.set(requestId,resolve);
      parent.postMessage({
        type:'MEOWDOKU_SPEND_COINS',
        amount,
        requestId
      },location.origin);

      setTimeout(()=>{
        if(state.pending.has(requestId)){
          state.pending.delete(requestId);
          resolve(false)
        }
      },4000)
    })
  }

  async function useHint(){
    const l=currentLevel();
    const isCat=key=>{
      const[r,c]=key.split(',').map(Number);
      return l.cats.some(cat=>cat.r===r&&cat.c===c);
    };
    const openCells=[];
    const crossedCats=[];

    for(let r=0;r<l.n;r++)
      for(let c=0;c<l.n;c++){
        const key=`${r},${c}`;
        if(state.found.has(key))continue;
        if(state.marks.has(key)){
          if(isCat(key))crossedCats.push(key);
          continue;
        }
        openCells.push(key);
      }

    const wrongOpenCell=openCells.find(key=>!isCat(key));
    const openCat=openCells.find(isCat);
    const key=crossedCats[0]||wrongOpenCell||openCat;
    if(!key)return message('No useful hint is available right now.');

    const ok=await requestSpend(l.hintCost);
    if(!ok)return message('Not enough coins for a hint.');

    state.hintsUsed++;
    state.wallet=Math.max(0,state.wallet-l.hintCost);

    if(crossedCats.includes(key)){
      state.marks.delete(key);
      renderBoard();
      message('Hint: this crossed-out cell may contain a cat.');
    }else if(!isCat(key)){
      state.marks.add(key);
      renderBoard();
      message('Hint: this cell cannot contain a cat.');
    }else{
      message('Hint: this remaining cell is important.');
    }

    setTimeout(
      ()=>document.querySelector(`[data-key="${key}"]`)?.classList.add('hint'),
      20
    );
    updateHud();
  }

  function completeLevel(){
    const remaining=refreshTime();

    if(state.timeLimit>0&&remaining<=0)
      return failTimeLevel();

    clearInterval(state.timer);
    state.timer=null;

    const l=currentLevel(),
      key=modeKey(state.level),
      first=!state.save.completed[key];

    if(first){
      state.save.completed[key]={time:state.seconds,lives:state.lives};
      state.save.unlocked=Math.max(
        state.save.unlocked,
        Math.min(60,state.level+1)
      );
      persist();
      syncProgress(state.level);
      parent.postMessage({
        type:'MEOWDOKU_REWARD',
        coins:l.reward,
        level:state.level,
        mode:state.mode
      },location.origin);
      state.wallet+=l.reward
    }

    const hasRemainingMode=state.level!==1&&
        completedModeCount(state.level)<4,
      primary=hasRemainingMode?
        'Choose another mode':
        state.level<60?'Choose next level':'Level map',
      onPrimary=hasRemainingMode?
        ()=>openModePicker(state.level,true):
        state.level<60?
          ()=>openModePicker(state.level+1,true):
          goLevels;

    openModal(
      '🎉',
      state.level===1?
        'Tutorial complete!':
        `${MODES[state.mode].label} complete!`,
      first?
        `You earned ${l.reward} coins.`:
        'You solved this challenge again.',
      `<span>⏱ ${formatTime(state.seconds)}</span><span>❤ ${state.lives}/3</span>`,
      primary,
      onPrimary,
      'Back to levels',
      goLevels
    )
  }

  function failLevel(){
    clearInterval(state.timer);
    openModal(
      '😿',
      'Out of lives',
      'Take another look at the colors and try again.',
      '',
      'Try again',
      ()=>startLevel(state.level,state.mode),
      'Back to levels',
      goLevels
    )
  }

  function failTimeLevel(){
    clearInterval(state.timer);
    state.timer=null;
    refreshTime();

    openModal(
      '⏰',
      'Time’s up',
      'The countdown reached zero. Try again and solve the puzzle a little faster.',
      '<span>⏱ 0:00</span>',
      'Try again',
      ()=>startLevel(state.level,state.mode),
      'Back to levels',
      goLevels
    )
  }

  function openModal(
    icon,title,copy,stats,primary,onPrimary,secondary,onSecondary
  ){
    $('modal-icon').textContent=icon;
    $('modal-title').textContent=title;
    $('modal-copy').textContent=copy;
    $('modal-stats').innerHTML=stats;
    $('modal-primary').textContent=primary;
    $('modal-primary').onclick=()=>{
      closeModal();
      onPrimary()
    };
    $('modal-secondary').textContent=secondary;
    $('modal-secondary').onclick=()=>{
      closeModal();
      onSecondary()
    };
    $('modal').classList.add('open');
    $('modal').setAttribute('aria-hidden','false')
  }

  function closeModal(){
    $('modal').classList.remove('open');
    $('modal').setAttribute('aria-hidden','true')
  }

  const tutorialSteps=[
    {
      icon:'🎨',
      title:'One cat in every color',
      copy:'Each color region contains exactly one cat. Once you find it, every other cell of that color can be ruled out.',
      demo:'<div class="tutorial-mini-board color-example"><i>×</i><i>×</i><i class="alt"></i><i>×</i><i class="cat">🐱</i><i class="alt"></i><i>×</i><i>×</i><i>×</i></div>'
    },
    {
      icon:'↔️',
      title:'Rows and columns',
      copy:'A row or column may have no cat, but it can never contain more than one.',
      demo:'<div class="tutorial-mini-board line-example"><i></i><i>×</i><i></i><i>×</i><i class="cat">🐱</i><i>×</i><i></i><i>×</i><i></i></div>'
    },
    {
      icon:'✨',
      title:'Cats cannot touch',
      copy:'The eight cells around a cat cannot contain another cat, including diagonal cells.',
      demo:'<div class="tutorial-mini-board touch-example"><i>×</i><i>×</i><i>×</i><i>×</i><i class="cat">🐱</i><i>×</i><i>×</i><i>×</i><i>×</i></div>'
    },
    {
      icon:'🐾',
      title:'How to play',
      copy:'Tap once to add or remove an X. Double-tap only when logic proves that a cat belongs there. A wrong cat costs one life.',
      demo:'<div class="tutorial-controls-demo"><span>Tap = ×</span><span>Double-tap = 🐱</span></div>'
    }
  ];

  function showTutorial(index=0){
    const step=tutorialSteps[index];
    $('tutorial-icon').textContent=step.icon;
    $('tutorial-step').textContent=`${index+1} / ${tutorialSteps.length}`;
    $('tutorial-title').textContent=step.title;
    $('tutorial-copy').textContent=step.copy;
    $('tutorial-demo').innerHTML=step.demo;
    $('tutorial-next').textContent=
      index===tutorialSteps.length-1?'Start playing':'Next';
    $('tutorial-next').onclick=()=>
      index===tutorialSteps.length-1?
        closeTutorial():showTutorial(index+1);
    $('tutorial-skip').onclick=closeTutorial;
    $('tutorial-modal').classList.add('open');
    $('tutorial-modal').setAttribute('aria-hidden','false')
  }

  function closeTutorial(){
    $('tutorial-modal').classList.remove('open');
    $('tutorial-modal').setAttribute('aria-hidden','true')
  }

  let checkInState=null;

  const CHECK_IN_DAYS=[
    'Mon','Tue','Wed','Thu','Fri','Sat','Sun'
  ];

  const CHECK_IN_REWARDS=[
    5,5,5,5,5,5,'5–100'
  ];

  function normalizeCheckIn(value){
    const item=Array.isArray(value)?value[0]:value||{},
      todayIndex=Math.max(
        0,Math.min(6,Number(item.today_index)||0)
      ),
      isSunday=todayIndex===6;

    return{
      today_index:todayIndex,
      is_sunday:isSunday,
      claimed_days:Array.isArray(item.claimed_days)?
        item.claimed_days.map(Number):[],
      claimed_today:Boolean(item.claimed_today),
      reward_today:Number(item.reward_today)||(isSunday?0:5),
      reward_min:5,
      reward_max:isSunday?100:5,
      coins:Number(item.coins)||state.wallet
    }
  }

  function renderCheckIn(){
    if(!checkInState)return;

    const week=$('checkin-week');
    week.innerHTML='';

    CHECK_IN_DAYS.forEach((day,index)=>{
      const claimed=checkInState.claimed_days.includes(index),
        today=index===checkInState.today_index,
        cell=document.createElement('div');
      cell.className=
        `checkin-day${claimed?' claimed':''}${today?' today':''}`;
      cell.innerHTML=
        `<small>${day}</small><span>${claimed?'✓':'🐾'}</span><b>${CHECK_IN_REWARDS[index]} coins</b>`;
      week.appendChild(cell)
    });

    const sunday=checkInState.is_sunday,
      wheel=$('sunday-wheel-wrap');
    wheel.hidden=!sunday;

    if(sunday&&!checkInState.claimed_today)
      $('sunday-wheel-result').textContent='5–100 coins';

    if(sunday&&checkInState.claimed_today)
      $('sunday-wheel-result').textContent=`+${checkInState.reward_today} coins`;

    $('checkin-claim').disabled=checkInState.claimed_today;
    $('checkin-claim').textContent=
      checkInState.claimed_today?
        'Checked in today':
        sunday?'Spin Sunday wheel':'Check in · +5 coins';
    $('checkin-message').textContent=
      checkInState.claimed_today?
        'Come back tomorrow for the next reward.':
        sunday?
          'Spin the wheel to reveal today’s reward.':
          'Tap the button to collect today’s 5 coins.';
    $('checkin-open-state').textContent=
      checkInState.claimed_today?
        'Collected today':
        sunday?'Sunday wheel · 5–100 coins':'+5 coins today'
  }

  function openCheckIn(){
    $('checkin-modal').classList.add('open');
    $('checkin-modal').setAttribute('aria-hidden','false');
    parent.postMessage({type:'MEOWDOKU_GET_CHECK_IN'},location.origin)
  }

  function closeCheckIn(){
    $('checkin-modal').classList.remove('open');
    $('checkin-modal').setAttribute('aria-hidden','true')
  }

  function claimCheckIn(){
    if(checkInState?.claimed_today)return;
    $('checkin-claim').disabled=true;
    $('checkin-claim').textContent=
      checkInState?.is_sunday?'Spinning…':'Checking in…';
    if(checkInState?.is_sunday){
      $('sunday-wheel').classList.remove('settled');
      $('sunday-wheel').classList.add('spinning');
      $('sunday-wheel-result').textContent='Spinning…'
    }
    parent.postMessage({type:'MEOWDOKU_CLAIM_CHECK_IN'},location.origin)
  }

  function finishCheckInClaim(value){
    checkInState=normalizeCheckIn(value);
    state.wallet=checkInState.coins;

    const reveal=()=>{
      if(checkInState.is_sunday){
        const wheel=$('sunday-wheel'),
          rewards=[5,10,15,20,30,50,75,100],
          slot=Math.max(
            0,rewards.indexOf(checkInState.reward_today)
          );
        wheel.classList.remove('spinning');
        wheel.style.setProperty(
          '--wheel-angle',`${2160-slot*45+22.5}deg`
        );
        wheel.classList.add('settled')
      }
      $('sunday-wheel-result').textContent=
        `+${checkInState.reward_today} coins`;
      renderCheckIn();
      $('checkin-week').children[checkInState.today_index]
        ?.classList.add('check-pop');
      message(
        `Daily check-in complete! +${checkInState.reward_today} coins`
      )
    };

    checkInState.is_sunday?setTimeout(reveal,1400):reveal()
  }

  function installCheckIn(){
    const button=document.createElement('button');
    button.id='checkin-open';
    button.className='checkin-open';
    button.setAttribute('aria-label','Open daily check-in');
    button.innerHTML='<span class="checkin-cat">🐾</span><b>Daily check-in</b><small id="checkin-open-state">Rewards await</small>';
    document.querySelector('#level-screen .hero')?.appendChild(button);

    const modal=document.createElement('div');
    modal.id='checkin-modal';
    modal.className='modal checkin-modal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML='<div class="modal-card checkin-card"><button id="checkin-close" class="checkin-close" aria-label="Close">×</button><div class="checkin-heading"><span>🐾</span><div><small>WEEKLY REWARDS</small><h2>Daily cat check-in</h2><p>Monday–Saturday: 5 coins. Sunday: spin for 5–100 coins.</p></div></div><div id="checkin-week" class="checkin-week"></div><div id="sunday-wheel-wrap" class="sunday-wheel-wrap" hidden><div class="sunday-wheel-pointer" aria-hidden="true"></div><div id="sunday-wheel" class="sunday-wheel" aria-label="Sunday reward wheel"><i>5</i><i>10</i><i>15</i><i>20</i><i>30</i><i>50</i><i>75</i><i>100</i></div><strong id="sunday-wheel-result">5–100 coins</strong></div><p id="checkin-message" class="checkin-message" role="status">Loading this week…</p><button id="checkin-claim" class="primary-btn checkin-claim" disabled>Check in today</button></div>';
    document.body.appendChild(modal);
    button.onclick=openCheckIn;
    $('checkin-close').onclick=closeCheckIn;
    $('checkin-claim').onclick=claimCheckIn;
    modal.onclick=e=>{
      if(e.target===modal)closeCheckIn()
    }
  }

  function installCheckInTimeNote(){
    const note=document.createElement('div');
    note.className='checkin-time-note';
    note.innerHTML='<b>Malaysia Time · UTC+8</b><span>Daily rewards follow Malaysia Time (UTC+8). A new check-in day begins at 12:00 AM.</span>';
    document.querySelector('.checkin-card')?.appendChild(note)
  }

  let achievementReport={
    unlocked_count:0,total_count:20,achievements:[]
  };
  const achievementQueue=[];

  function achievementIconStyle(index){
    const x=(Number(index)%5)*25,
      y=Math.floor(Number(index)/5)*(100/3);
    return`--achievement-x:${x}%;--achievement-y:${y}%`
  }

  function renderAchievements(){
    const grid=$('achievement-grid');
    if(!grid)return;
    const items=Array.isArray(achievementReport.achievements)?
      achievementReport.achievements:[];
    grid.innerHTML=items.map(
      item=>`<article class="achievement-card${item.unlocked?' unlocked':' locked'}"><div class="achievement-icon" style="${achievementIconStyle(item.icon_index)}" aria-hidden="true"></div><div class="achievement-card-copy"><small>${item.category}</small><strong>${item.title}</strong><p>${item.description}</p><div class="achievement-progress"><i style="width:${Math.min(100,Math.round((Number(item.progress)||0)/(Number(item.target)||1)*100))}%"></i></div><span>${item.unlocked?'Unlocked':`${item.progress} / ${item.target}`}</span></div></article>`
    ).join('');
    $('achievement-summary').textContent=
      `${achievementReport.unlocked_count||0} / ${achievementReport.total_count||20} unlocked`;
    const stateText=$('achievement-open-state');
    if(stateText)
      stateText.textContent=
        `${achievementReport.unlocked_count||0} / ${achievementReport.total_count||20}`
  }

  function openAchievements(){
    $('achievement-modal').classList.add('open');
    $('achievement-modal').setAttribute('aria-hidden','false');
    parent.postMessage(
      {type:'MEOWDOKU_GET_ACHIEVEMENTS'},location.origin
    )
  }

  function closeAchievements(){
    $('achievement-modal').classList.remove('open');
    $('achievement-modal').setAttribute('aria-hidden','true')
  }

  function showNextAchievement(){
    if(
      $('achievement-unlock').classList.contains('open')||
      !achievementQueue.length
    )return;
    const item=achievementQueue.shift();
    $('achievement-unlock-icon').setAttribute(
      'style',achievementIconStyle(item.icon_index)
    );
    $('achievement-unlock-title').textContent=item.title;
    $('achievement-unlock-copy').textContent=item.description;
    $('achievement-unlock').classList.add('open');
    $('achievement-unlock').setAttribute('aria-hidden','false')
  }

  function queueAchievements(items){
    if(!Array.isArray(items)||!items.length)return;
    achievementQueue.push(...items);
    showNextAchievement()
  }

  function closeAchievementUnlock(){
    $('achievement-unlock').classList.remove('open');
    $('achievement-unlock').setAttribute('aria-hidden','true');
    setTimeout(showNextAchievement,180)
  }

  function installAchievements(){
    const button=document.createElement('button');
    button.id='achievement-open';
    button.className='achievement-open';
    button.setAttribute('aria-label','Open achievements');
    button.innerHTML='<span class="achievement-open-icon">🏆</span><b>Achievements</b><small id="achievement-open-state">0 / 20</small>';
    document.querySelector('#level-screen .hero')?.appendChild(button);

    const gallery=document.createElement('div');
    gallery.id='achievement-modal';
    gallery.className='modal achievement-modal';
    gallery.setAttribute('aria-hidden','true');
    gallery.innerHTML='<div class="modal-card achievement-gallery"><button id="achievement-close" class="achievement-close" aria-label="Close achievements">×</button><header><div><small>CAT COLLECTION</small><h2>Achievements</h2><p>Every solved puzzle leaves a paw print.</p></div><strong id="achievement-summary">0 / 20 unlocked</strong></header><div id="achievement-grid" class="achievement-grid"></div></div>';
    document.body.appendChild(gallery);

    const unlock=document.createElement('div');
    unlock.id='achievement-unlock';
    unlock.className='modal achievement-unlock';
    unlock.setAttribute('aria-hidden','true');
    unlock.innerHTML='<div class="modal-card achievement-unlock-card"><button id="achievement-unlock-close" class="achievement-unlock-close" aria-label="Close achievement">×</button><small>ACHIEVEMENT UNLOCKED</small><div id="achievement-unlock-icon" class="achievement-icon achievement-unlock-art" aria-hidden="true"></div><h2 id="achievement-unlock-title"></h2><p id="achievement-unlock-copy"></p><span>Congratulations! A new badge has joined your collection.</span></div>';
    document.body.appendChild(unlock);
    button.onclick=openAchievements;
    $('achievement-close').onclick=closeAchievements;
    $('achievement-unlock-close').onclick=closeAchievementUnlock
  }

  function shade(on){
    let layer=document.querySelector('.tutorial-shade');
    if(on&&!layer){
      layer=document.createElement('div');
      layer.className='tutorial-shade';
      document.body.appendChild(layer)
    }
    if(!on)layer?.remove()
  }

  function clearCoachFocus(){
    document.querySelectorAll(
      '.tutorial-focus,.tutorial-dim'
    ).forEach(
      el=>el.classList.remove('tutorial-focus','tutorial-dim')
    );
    $('.rules-strip')?.classList.remove('tutorial-focus')
  }

  function setCoach(title,copy,button,action){
    $('coach-title').textContent=title;
    $('coach-copy').textContent=copy;
    $('coach-next').textContent=button;
    $('coach-next').onclick=action;
    $('coach').classList.add('show');
    document.body.classList.add('coaching');
    shade(true)
  }

  function focusKeys(keys){
    document.querySelectorAll('.cell').forEach(
      cell=>cell.classList.add(
        keys.includes(cell.dataset.key)?'tutorial-focus':'tutorial-dim'
      )
    )
  }

  function startCoach(){
    state.coachStep=0;
    const l=state.levels[0],cat=l.cats[0],
      color=l.colorGrid[cat.r][cat.c],keys=[];
    for(let r=0;r<l.n;r++)
      for(let c=0;c<l.n;c++)
        if(l.colorGrid[r][c]===color)keys.push(`${r},${c}`);
    focusKeys(keys);
    setCoach(
      'One cat in each color',
      'This highlighted color already has its cat, so every other cell of the same color can be crossed out.',
      'Show row and column',coachLine
    )
  }

  function coachLine(){
    state.coachStep=1;
    clearCoachFocus();
    const l=state.levels[0],cat=l.cats[0],keys=[];
    for(let i=0;i<l.n;i++){
      keys.push(`${cat.r},${i}`,`${i},${cat.c}`)
    }
    focusKeys(keys);
    setCoach(
      'At most one per row and column',
      'Because this row and column already contain a cat, no other cat can appear on either line.',
      'Show nearby cells',coachTouch
    )
  }

  function coachTouch(){
    state.coachStep=2;
    clearCoachFocus();
    const l=state.levels[0],cat=l.cats[0],keys=[];
    for(
      let r=Math.max(0,cat.r-1);
      r<=Math.min(l.n-1,cat.r+1);
      r++
    )
      for(
        let c=Math.max(0,cat.c-1);
        c<=Math.min(l.n-1,cat.c+1);
        c++
      )
        keys.push(`${r},${c}`);
    focusKeys(keys);
    setCoach(
      'Cats cannot touch',
      'These highlighted cells form the 3x3 area around the cat. None can contain another cat.',
      'Let me try',coachMark
    )
  }

  function coachMark(){
    state.coachStep=3;
    clearCoachFocus();
    const l=state.levels[0],cat=l.cats[0];
    state.coachTarget=[...document.querySelectorAll('.cell')]
      .map(el=>el.dataset.key)
      .find(key=>{
        const[r,c]=key.split(',').map(Number);
        return !state.found.has(key)&&(
          r===cat.r||c===cat.c||
          Math.max(Math.abs(r-cat.r),Math.abs(c-cat.c))===1
        )
      });
    focusKeys([state.coachTarget]);
    setCoach(
      'Your turn: mark an empty cell',
      'Tap the highlighted cell once to place an X.',
      'Waiting for your tap…',
      ()=>message('Tap the highlighted board cell.')
    )
  }

  function coachPlaceCat(){
    state.coachStep=4;
    clearCoachFocus();
    const l=state.levels[0],
      cat=l.cats.find(
        item=>!state.found.has(`${item.r},${item.c}`)
      );
    state.coachTarget=`${cat.r},${cat.c}`;
    focusKeys([state.coachTarget]);
    setCoach(
      'Now place a cat',
      'Double-tap the highlighted cell to confirm the cat.',
      'Waiting for double-tap…',
      ()=>message('Double-tap the highlighted board cell.')
    )
  }

  function closeCoach(){
    state.coachStep=-1;
    state.coachTarget=null;
    clearCoachFocus();
    $('coach')?.classList.remove('show');
    document.body.classList.remove('coaching');
    shade(false)
  }

  function goLevels(){
    clearInterval(state.timer);
    clearCatActions();
    renderLevels();
    showScreen('levels')
  }

  $('back-btn').onclick=goLevels;

  $('settings-btn').onclick=()=>
    state.level===1&&state.mode==='easy'?
      startCoach():showTutorial(0);

  $('restart-btn').onclick=()=>
    startLevel(state.level,state.mode);

  $('hint-btn').onclick=useHint;

  addEventListener('message',e=>{
    if(e.origin!==location.origin)return;

    if(e.data?.type==='MEOWDOKU_WALLET'){
      state.wallet=Math.max(0,Number(e.data.coins)||0);
      updateHud()
    }

    if(e.data?.type==='MEOWDOKU_PROGRESS')
      mergeProgress(e.data.progress);

    if(e.data?.type==='MEOWDOKU_PROGRESS_LOCAL_ONLY')
      enableLocalProgress();

    if(e.data?.type==='MEOWDOKU_CHECK_IN'){
      checkInState=normalizeCheckIn(e.data.checkIn);
      renderCheckIn()
    }

    if(e.data?.type==='MEOWDOKU_CHECK_IN_CLAIMED')
      finishCheckInClaim(e.data.checkIn);

    if(e.data?.type==='MEOWDOKU_CHECK_IN_ERROR'){
      if($('sunday-wheel'))
        $('sunday-wheel').classList.remove('spinning');
      if($('checkin-message'))
        $('checkin-message').textContent=
          e.data.message||'Check-in is temporarily unavailable.';
      if($('checkin-claim'))
        $('checkin-claim').disabled=false
    }

    if(e.data?.type==='MEOWDOKU_ACHIEVEMENTS'){
      achievementReport=e.data.achievements||achievementReport;
      renderAchievements()
    }

    if(e.data?.type==='MEOWDOKU_ACHIEVEMENTS_UNLOCKED')
      queueAchievements(e.data.achievements);

    if(e.data?.type==='MEOWDOKU_ACHIEVEMENTS_ERROR'){
      if($('achievement-summary'))
        $('achievement-summary').textContent='Achievements unavailable'
    }

    if(e.data?.type==='MEOWDOKU_SPEND_RESULT'){
      const done=state.pending.get(e.data.requestId);
      if(done){
        state.pending.delete(e.data.requestId);
        done(Boolean(e.data.ok))
      }
    }
  });

  const heroCat=document.querySelector('.logo-cat');

  if(heroCat)
    heroCat.innerHTML=
      '<img src="cat-149-token.png" alt="Meowdoku cat">';

  installCheckIn();
  installCheckInTimeNote();
  installAchievements();
  installModePicker();
  buildRuleDemos();
  renderLevels();

  parent.postMessage(
    {type:'MEOWDOKU_READY'},
    location.origin
  );
})();