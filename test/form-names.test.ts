import { describe, it, expect } from "vitest";
import { formParts, monName } from "../src/data/dex";

describe("form names", () => {
  it("regional forms show the species name and the form on its own", () => {
    expect(formParts("Tauros-Paldea-Blaze")).toEqual({ name: "켄타로스", form: "팔데아의 모습/블레이즈종" });
    expect(formParts("Ninetales-Alola")).toEqual({ name: "나인테일", form: "알로라의 모습" });
    expect(formParts("Decidueye-Hisui").name).toBe("모크나이퍼");
    expect(formParts("Zigzagoon-Galar").form).toBe("가라르의 모습");
  });
  it("every other form also shows the species name, with the form on its own", () => {
    expect(formParts("Genesect-Douse")).toEqual({ name: "게노세크트", form: "아쿠아폼" });
    expect(formParts("Arceus-Fire")).toEqual({ name: "아르세우스", form: "불꽃 타입" });
    expect(formParts("Rotom-Heat")).toEqual({ name: "로토무", form: "히트로토무" });
    expect(formParts("Kyurem-Black")).toEqual({ name: "큐레무", form: "블랙큐레무" });
    expect(formParts("Alcremie-Caramel-Swirl")).toEqual({ name: "마휘핑", form: "캐러멜믹스" });
    expect(formParts("Pikachu-Alola")).toEqual({ name: "피카츄", form: "알로라캡" });
    expect(formParts("Garchomp")).toEqual({ name: "한카리아스", form: "" });
    expect(formParts("Rotom")).toEqual({ name: "로토무", form: "" });
  });
  it("PokeRogue's own-species forms", () => {
    expect(formParts("Floette-Eternal")).toEqual({ name: "플라엣테", form: "영원의 꽃" });
    expect(formParts("Ursaluna-Bloodmoon")).toEqual({ name: "다투곰", form: "붉은 달" });
  });
  it("nicknames win", () => {
    expect(monName({ nickname: "켄타", species: "Tauros-Paldea-Aqua" })).toBe("켄타");
    expect(monName({ species: "Tauros-Paldea-Aqua" })).toBe("켄타로스");
  });
});
