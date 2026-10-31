import { Dex } from "@pkmn/sim";
import type { GameState } from "../../game/state";
import { deleteSave } from "../../game/state";
import { genTables } from "../../data/dex";
import { writeXlsx, readXlsx } from "../../data/xlsx.js";
import { buildNameTables, trainersToRows, rowsToTrainers, HELP_ROWS } from "../../data/lineup-sheet.js";
import { baseTrainerData, hasLineupOverride, setLineupOverride, trainerData } from "../../game/lineups";
import { go, setGame, update } from "../store";
import { Win, useToast } from "../components";

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise(res => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = accept;
    inp.onchange = () => res(inp.files?.[0] ?? null);
    inp.click();
  });
}

let tables: ReturnType<typeof buildNameTables> | null = null;
const T = () => (tables ||= buildNameTables(Dex, genTables));

export function SettingsTab({ g }: { g: GameState }) {
  const [toast, showToast] = useToast();
  const exportLineups = () => {
    const sheets = [
      { name: "라인업", rows: trainersToRows(trainerData(), T()), widths: [8, 8, 14, 18, 16, 36, 5, 18, 16, 14, 8, 14, 14, 14, 14, 9], freeze: true },
      { name: "도움말", rows: HELP_ROWS, header: false, widths: [110] },
    ];
    download("트레이너_라인업.xlsx", writeXlsx(sheets), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  };
  const importLineups = async () => {
    const f = await pickFile(".xlsx");
    if (!f) return;
    try {
      const book = readXlsx(new Uint8Array(await f.arrayBuffer()));
      const sheet = book.find((s: any) => s.name === "라인업") || book[0];
      const { data, warnings, count } = rowsToTrainers(sheet.rows, T(), baseTrainerData());
      setLineupOverride(data);
      update(() => {});
      showToast(`트레이너 ${count}명 적용${warnings.length ? ` · 경고 ${warnings.length}건 (콘솔 참고)` : ""}`);
      if (warnings.length) console.warn(warnings.join("\n"));
    } catch (e: any) {
      showToast("엑셀을 읽지 못했습니다: " + (e?.message || e));
    }
  };
  return (
    <>
      <Win title="배틀">
        <div class="col small">
          <label class="row">
            기본 배틀 속도
            <select value={g.settings.battleSpeed} onChange={e => update(st => (st.settings.battleSpeed = Number((e.target as HTMLSelectElement).value)))}>
              <option value={1}>×1</option>
              <option value={2}>×2</option>
              <option value={4}>×4</option>
            </select>
          </label>
          <label class="row">
            <input type="checkbox" checked={g.settings.moveAnims} onChange={e => update(st => (st.settings.moveAnims = (e.target as HTMLInputElement).checked))} /> 기술 애니메이션 보기
          </label>
        </div>
      </Win>
      <Win title="트레이너 라인업 데이터">
        <div class="small muted" style={{ marginBottom: 6 }}>
          엑셀로 내보내 빈 칸(임시 포켓몬·자동 기술)을 채운 뒤 다시 불러오면 모든 NPC 트레이너에게 바로 적용됩니다. 한글 이름으로 적으면 됩니다.
        </div>
        <div class="row">
          <button class="btn" onClick={exportLineups}>
            라인업 엑셀 내보내기
          </button>
          <button class="btn primary" onClick={importLineups}>
            라인업 엑셀 불러오기
          </button>
          {hasLineupOverride() && (
            <button
              class="btn danger"
              onClick={() => {
                setLineupOverride(null);
                update(() => {});
                showToast("기본 라인업으로 되돌렸습니다.");
              }}
            >
              기본값으로
            </button>
          )}
        </div>
        {hasLineupOverride() && <div class="tiny gold" style={{ marginTop: 4 }}>불러온 라인업을 사용 중입니다.</div>}
      </Win>
      <Win title="저장">
        <div class="small muted" style={{ marginBottom: 6 }}>
          진행 상황은 이 브라우저에 자동 저장됩니다. 다른 기기로 옮기려면 파일로 내보내세요.
        </div>
        <div class="row">
          <button class="btn" onClick={() => download(`포켓리그_시즌${g.season}_${g.week}주.json`, JSON.stringify(g), "application/json")}>
            저장 파일 내보내기
          </button>
          <button
            class="btn"
            onClick={async () => {
              const f = await pickFile(".json");
              if (!f) return;
              try {
                const s = JSON.parse(await f.text());
                if (s.version !== 1) throw new Error();
                setGame(s);
                showToast("불러왔습니다.");
              } catch {
                showToast("저장 파일을 읽지 못했습니다.");
              }
            }}
          >
            저장 파일 불러오기
          </button>
          <button
            class="btn danger"
            onClick={() => {
              if (!confirm("저장된 게임을 지우고 타이틀로 돌아갈까요?")) return;
              deleteSave();
              setGame(null);
              go({ name: "title" });
            }}
          >
            게임 삭제
          </button>
        </div>
      </Win>
      <Win title="정보">
        <div class="small muted">
          비공식 팬게임입니다. Pokémon 및 관련 명칭은 각 권리자의 상표입니다.
          <br />
          그래픽·기술 애니메이션: PokéRogue (AGPL-3.0) · 배틀 엔진: Pokémon Showdown / @pkmn/sim (MIT) · 글꼴: Galmuri (SIL OFL)
          <br />이 게임의 소스 코드는 AGPL-3.0으로 공개됩니다.
        </div>
      </Win>
      {toast}
    </>
  );
}
