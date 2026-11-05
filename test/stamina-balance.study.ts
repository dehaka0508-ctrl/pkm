// Reproducible balance study, run separately from the ordinary test suite:
// npx vitest run --config vitest.stamina-study.config.ts
import { it, vi } from "vitest";
import fs from "node:fs";
import { simulateMatch } from "../src/battle/engine";
import { createGame, makeLeagues, teamOf } from "../src/game/state";
import { Rng } from "../src/game/rng";
import { allTrainers, roleSkill } from "../src/game/lineups";
import { spendStamina, staminaMultiplier, staminaOf, canField } from "../src/game/stamina";
import { foodCost } from "../src/game/finance";

it("paired seeded leagues and controlled recovery budgets",async()=> {
  const runs:any[]=[];
  const trainers=allTrainers();
  for(const seed of [101,202,303]) {
    const setupRng=new Rng(seed);
    const random=vi.spyOn(Math,"random").mockImplementation(()=>setupRng.next());
    const st=createGame({mode:"trainer",slotId:trainers.find(t=>t.region==="kanto" && t.role==="관장")!.id,name:"연구"});
    random.mockRestore();
    st.seed=seed; st.leagues=makeLeagues(1,seed);
    const ids=["kanto","sinnoh","paldea"].flatMap(r=>st.leagues[r].teams);
    const originalTeams=Object.fromEntries(ids.map(id=>[id,structuredClone(teamOf(st,id))]));
    for(const enabled of [false,true]) {
      const teams=Object.fromEntries(ids.map(id=>[id,structuredClone(originalTeams[id]).map(m=>({...m,stamina:100}))]));
      const metrics=Object.fromEntries(ids.map(id=>[id,{id,role:trainers.find(t=>t.id===id)!.role,pts:0,appearances:0,cost:0,preStamina:0,penaltyAppearances:0,forfeits:0,used:new Set<string>(),usage:{} as Record<string,number>,trios:{} as Record<string,number>,meanFood:teams[id].reduce((n,m)=>n+foodCost(m),0)/6}]));
      for(let round=0;round<38;round++) {
        // Keep the Vitest worker RPC responsive during this intentionally long CPU study.
        await new Promise<void>(resolve=>setImmediate(resolve));
        for(const region of ["kanto","sinnoh","paldea"]) for(const fixture of st.leagues[region].rounds[round]) {
          const a=teams[fixture.home],b=teams[fixture.away];
          const conf=(id:string,team:any[])=>({name:id,team,gimmick:trainers.find(t=>t.id===id)!.gimmick,skill:roleSkill(trainers.find(t=>t.id===id)!.role)});
          const battleSeed=`${seed}:${round}:${fixture.home}:${fixture.away}`;
          // The control keeps every member at 100 all season; only the treatment spends stamina.
          const r=simulateMatch(conf(fixture.home,a),conf(fixture.away,b),battleSeed);
          for(const [side,id,team] of [[0,fixture.home,a],[1,fixture.away,b]] as const) {
            const m=metrics[id]; m.pts+=r.winner===-1?1:r.winner===side?3:0;
            const trio=r.picks[side].map(i=>team[i].uid).sort().join("/");
            if(trio)m.trios[trio]=(m.trios[trio]??0)+1;
            if(enabled && team.filter(canField).length<3) m.forfeits++;
            for(const uid of r.appeared?.[side] ?? []) {
              const mon=team.find(p=>p.uid===uid)!; const before=staminaOf(mon);
              m.appearances++; m.preStamina+=before; m.used.add(uid);
              m.usage[uid]=(m.usage[uid]??0)+1;
              if(staminaMultiplier(mon)<1) m.penaltyAppearances++;
              const condition=r.after?.[side]?.[uid];
              if(condition) {
                if(enabled) {spendStamina(mon,round*7,condition);m.cost+=before-staminaOf(mon);}
                else m.cost+=condition.hp<=0?15:Math.max(1,Math.floor((1-condition.hp)*10+1e-8));
              }
            }
          }
        }
        if(enabled) for(const team of Object.values(teams)) for(const mon of team) mon.stamina=Math.min(100,staminaOf(mon)+(mon.lastPlayedDay===round*7?6:7));
      }
      runs.push({seed,enabled,clubs:Object.values(metrics).map(m=>({...m,used:m.used.size,top3AppearanceShare:Object.values(m.usage).sort((a,b)=>b-a).slice(0,3).reduce((n,c)=>n+c,0)/m.appearances,mostCommonTrioShare:Math.max(0,...Object.values(m.trios))/38,finalMean:Object.values(teams[m.id]).reduce((n,p)=>n+staminaOf(p),0)/6}))});
    }
  }

  const budgets:any[]=[];
  for(const size of [3,4,6,8]) for(const frequency of [1,2]) for(const cost of [1,4,9,15]) {
    const mons=Array.from({length:size},()=>({stamina:100,played:-1,games:0}));
    let forfeits=0,penalized=0,appearances=0,firstPenaltyWeek:number|null=null;
    for(let day=0;day<38*7;day++) {
      if(day%7===0 || frequency===2 && day%7===3) {
        const eligible=mons.filter(canField).sort((a,b)=>b.stamina-a.stamina||a.games-b.games);
        if(eligible.length<3) forfeits++;
        else for(const m of eligible.slice(0,3)) {
          appearances++; if(staminaMultiplier(m)<1){penalized++;firstPenaltyWeek??=Math.floor(day/7)+1;}
          m.stamina=Math.max(0,m.stamina-cost);m.played=day;m.games++;
        }
      }
      for(const m of mons) if(m.played!==day)m.stamina=Math.min(100,m.stamina+1);
    }
    budgets.push({size,frequency,cost,forfeits,penalized,appearances,firstPenaltyWeek,finalMean:mons.reduce((s,m)=>s+m.stamina,0)/size});
  }
  fs.writeFileSync(process.env.STAMINA_STUDY_OUTPUT ?? "stamina-study.json",JSON.stringify({scope:"3 seeds × 3 regions × 38 rounds × paired baseline/draft; fixed original six; no economy, training, cups or continental matches",matches:6840,runs,budgets},null,2));
  console.log("Completed 6840 paired league battles and 32 controlled recovery budgets");
});
