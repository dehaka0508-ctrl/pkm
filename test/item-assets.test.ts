import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { catalog, itemImage } from "../src/game/shop";
import atlas from "../public/assets/ui/items.json";
import sources from "../assets-custom/item-sources.json";
import { SHOP_TYPE_ORDER } from "../src/game/shop";
import { assetUrl } from "../src/render/assets";

it("has a real, in-bounds icon for every sold item, TM type and trophy cap", () => {
  const png = readFileSync("public/assets/ui/items.png");
  expect(png.readUInt32BE(16)).toBe(atlas.w);
  expect(png.readUInt32BE(20)).toBe(atlas.h);
  const keys = [...catalog().map(i => i.key), "cap:silver", "cap:gold"];
  const frames: Record<string, number[]> = atlas.f;
  for (const key of keys) {
    const frame = itemImage(key);
    expect(frame, key).not.toBe("unknown");
    expect(frames[frame], key).toBeDefined();
    const [x, y, w, h] = frames[frame];
    expect(x + w, key).toBeLessThanOrEqual(atlas.w);
    expect(y + h, key).toBeLessThanOrEqual(atlas.h);
  }
  for (const type of SHOP_TYPE_ORDER) expect(frames["tm_" + type.toLowerCase()]).toBeDefined();
  expect(Object.keys(sources)).toHaveLength(88);
  expect(assetUrl("ui/items.png")).toContain("items.png?v=");
});
