import { useMemo, useState } from "preact/hooks";
import { dex, koSpecies } from "../../data/dex";
import type { GameState } from "../../game/state";
import { SHOP_CATS, SHOP_TYPE_ORDER, buy, catalog, compareTmMoves, itemDesc, itemImage, itemName, sell, tmCompatible, tmPrice, type ShopCat } from "../../game/shop";
import { update } from "../store";
import { ItemIcon, TypeBadge, TypeFilter, MonIcon, Money, Win, useToast } from "../components";

export function ShopTab({ g }: { g: GameState }) {
  const [cat, setCat] = useState<ShopCat | "bag">("held");
  const [q, setQ] = useState("");
  const [tmType, setTmType] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const bag = g.player.bag || {};
  const prices = useMemo(() => Object.fromEntries(catalog().map(i => [i.key, i.price])), []);
  const priceOf = (key: string) => (key.startsWith("tm:") ? tmPrice(key.slice(3)) : prices[key] ?? 0);
  const doBuy = (key: string) =>
    update(st => {
      const err = buy(st, key, priceOf(key));
      showToast(err ?? `${itemName(key)} 구입`);
    });
  const doSell = (key: string) =>
    update(st => {
      const err = sell(st, key, priceOf(key));
      showToast(err ?? `${itemName(key)} 판매 (₽${Math.floor(priceOf(key) / 2).toLocaleString()})`);
    });

  // TMs: everything a squad member can learn by TM / tutor
  const tmList = useMemo(() => {
    if (cat !== "tm") return [];
    const who = new Map<string, string[]>();
    for (const m of g.player.squad) for (const id of tmCompatible(m.species)) {
      const mv = dex.moves.get(id);
      if (!mv.exists || mv.isZ || mv.isMax || mv.isNonstandard === "CAP" || mv.isNonstandard === "LGPE") continue;
      if (!who.has(id)) who.set(id, []);
      if (!who.get(id)!.includes(m.species)) who.get(id)!.push(m.species);
    }
    return [...who.entries()].sort((a, b) => compareTmMoves(a[0], b[0]));
  }, [cat, g.player.squad.length, g.player.squad.map(m => m.species).join()]);
  const tmTypes = SHOP_TYPE_ORDER.filter(type => tmList.some(([id]) => dex.moves.get(id).type === type));
  const activeType = tmType && tmTypes.includes(tmType) ? tmType : null;

  const match = (key: string) => !q || itemName(key).includes(q) || key.toLowerCase().includes(q.toLowerCase());
  const rows =
    cat === "bag"
      ? Object.keys(bag).filter(k => bag[k] > 0 && match(k))
      : cat === "tm"
        ? tmList.filter(([id]) => !activeType || dex.moves.get(id).type === activeType).map(([id]) => `tm:${id}`).filter(match)
        : catalog()
            .filter(i => i.cat === cat && match(i.key))
            .map(i => i.key);

  return (
    <>
      <Win title="상점" right={<Money v={g.player.money} />}>
        <div class="row" style={{ gap: 4 }}>
          {SHOP_CATS.map(([id, label]) => (
            <button key={id} class={`btn small ${cat === id ? "sel" : ""}`} onClick={() => setCat(id)}>
              {label}
            </button>
          ))}
          <button class={`btn small ${cat === "bag" ? "sel" : ""}`} onClick={() => setCat("bag")}>
            가방 ({Object.values(bag).reduce((a, b) => a + b, 0)})
          </button>
          <input type="text" placeholder="검색" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} style={{ marginLeft: "auto", width: 140 }} />
        </div>
        {cat === "tm" && <TypeFilter types={tmTypes} value={activeType} onChange={setTmType} />}
        <div class="tiny muted" style={{ marginTop: 6 }}>
          {cat === "tm"
            ? "스쿼드 포켓몬이 배울 수 있는 기술머신만 보여 줍니다. 한 번 사면 계속 쓸 수 있습니다 (스쿼드 → 기술 편집)."
            : cat === "bag"
              ? "되팔면 산 값의 절반을 돌려받습니다. 지닌 도구는 스쿼드에서 빼면 가방으로 돌아옵니다."
              : "산 물건은 가방에 들어가고, 스쿼드의 포켓몬 정보에서 지니게 하거나 사용합니다."}
        </div>
      </Win>
      <Win>
        {rows.length === 0 && <div class="muted small">{cat === "bag" ? "가방이 비어 있습니다." : "물건이 없습니다."}</div>}
        <div class="col scroll-y" style={{ gap: 3, maxHeight: 620 }}>
          {rows.map(key => {
            const isTm = key.startsWith("tm:");
            const mv = isTm ? dex.moves.get(key.slice(3)) : null;
            const learners = isTm ? tmList.find(x => x[0] === key.slice(3))?.[1] || [] : [];
            const price = priceOf(key);
            return (
              <div key={key} class="card row" style={{ cursor: "default", padding: "4px 8px", gap: 8, flexWrap: "nowrap" }}>
                <ItemIcon frame={itemImage(key)} />
                <div class="grow">
                  <b class="small">{itemName(key)}</b>
                  {mv && (
                    <span class="tiny muted">
                      {" "}
                      <TypeBadge type={mv.type} /> {mv.category === "Status" ? "변화" : mv.category === "Physical" ? "물리" : "특수"} · 위력 {mv.basePower || "-"}
                    </span>
                  )}
                  <div class="tiny muted">{itemDesc(key)}</div>
                  {learners.length > 0 && (
                    <div class="row" style={{ gap: 0 }}>
                      {learners.map(sp => (
                        <MonIcon key={sp} species={sp} scale={0.8} title={koSpecies(sp)} />
                      ))}
                    </div>
                  )}
                </div>
                <span class="tiny">보유 {bag[key] || 0}</span>
                {price > 0 && cat !== "bag" && (
                  <button class="btn small primary" disabled={g.player.money < price || (isTm && (bag[key] || 0) > 0)} onClick={() => doBuy(key)}>
                    ₽{price.toLocaleString()}
                  </button>
                )}
                {cat === "bag" && price > 0 && (
                  <button class="btn small" onClick={() => doSell(key)}>
                    팔기 ₽{Math.floor(price / 2).toLocaleString()}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Win>
      {toast}
    </>
  );
}
