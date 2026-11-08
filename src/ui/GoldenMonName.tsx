import type { ComponentChildren } from "preact";
import { GOLDEN_MASTER_BALL, goldenMasterBallCount } from "../game/golden-master-ball";
import type { GameState } from "../game/state";

export function GoldenMasterBallStar({ count }: { count: number }) {
  if (!count) return null;
  const label = `${GOLDEN_MASTER_BALL} ${count}회 수상`;
  return <span class="gold golden-master-ball-star" role="img" aria-label={label} title={label}>★</span>;
}

export function GoldenMonName({ g, owner, uid, species, children }: {
  g: GameState | null | undefined;
  owner: string;
  uid: string;
  species?: string;
  children: ComponentChildren;
}) {
  const count = goldenMasterBallCount(g, owner, uid, species);
  return <>{children}{count > 0 && <> <GoldenMasterBallStar count={count} /></>}</>;
}
