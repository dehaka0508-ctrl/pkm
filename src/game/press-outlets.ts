import { REGIONS } from "../data/dex";
import { hashStr } from "./rng";

const LEGEND_DAILIES = ["히스이일보", "칼로스일보"];

const LOCAL_OUTLETS: Readonly<Record<string, readonly string[]>> = {
  kanto: ["보라타운 주간", "무지개시티 저널", "노랑시티 스포츠"],
  johto: ["금빛시티 주간", "인주시티 저널"],
  hoenn: ["보라시티 스포츠", "잿빛시티 데일리", "해안시티 주간"],
  sinnoh: ["신수마을 포켓몬신문", "축복시티 스포츠", "연고시티 주간"],
  unova: ["구름시티 데일리", "라이몬시티 스포츠", "모란만시티 주간"],
  kalos: ["미르시티 데일리", "백단시티 주간", "홀로캐스터 스포츠"],
  alola: ["하우올리 주간", "말리에 데일리", "알로라 스포츠"],
  galar: ["엔진시티 데일리", "너클시티 스포츠", "슛시티 주간"],
  paldea: ["테이블시티 주간", "누룩스시티 데일리", "팔데아 스포츠 월간"],
  legend: ["축복마을 주간", "미르시티 데일리", "은하단 기록보"],
};

export function pressOutlet(regionId: string, key: string, primary = false): string {
  const region = REGIONS.find(region => region.id === regionId);
  const daily = regionId === "legend"
    ? LEGEND_DAILIES[hashStr(key) % LEGEND_DAILIES.length]
    : `${region?.name ?? "전국"}일보`;
  const local = LOCAL_OUTLETS[regionId];
  if (primary || !local) return daily;
  return local[hashStr(key) % local.length];
}
