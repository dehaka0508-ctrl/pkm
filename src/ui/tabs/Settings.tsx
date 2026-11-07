import { dateOf } from "../../game/calendar";
import { Dex } from "@pkmn/sim";
import type { GameState } from "../../game/state";
import { deleteSave, saveText as saveJson } from "../../game/state";
import { IS_APP } from "../../platform";
import { ApkLink, AppUpdatePanel, activeSlotLabel, exportFile, exportSave, pickSave, shareSave } from "../AppPanels";
import { genTables } from "../../data/dex";
import { writeXlsx, readXlsx } from "../../data/xlsx.js";
import { buildNameTables, trainersToRows, rowsToTrainers, HELP_ROWS } from "../../data/lineup-sheet.js";
import { baseTrainerData, hasLineupOverride, setLineupOverride, trainerData } from "../../game/lineups";
import { go, setGame, update } from "../store";
import { ConfirmButton, Modal, Win, useToast } from "../components";
import { useState } from "preact/hooks";

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
  const [saveText, setSaveText] = useState<string | null>(null);
  const exportLineups = () => {
    const sheets = [
      { name: "라인업", rows: trainersToRows(trainerData(), T()), widths: [8, 8, 14, 18, 16, 36, 5, 18, 5, 16, 14, 8, 14, 14, 14, 14, 9], freeze: true },
      { name: "도움말", rows: HELP_ROWS, header: false, widths: [110] },
    ];
    exportFile("트레이너_라인업.xlsx", writeXlsx(sheets), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .then(showToast)
      .catch((e: any) => showToast(`파일을 만들지 못했습니다: ${e?.message || e}`));
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
          진행 상황은 {activeSlotLabel()}에 자동 저장됩니다. {IS_APP ? "웹 버전이나 다른 기기로 옮기려면 파일로 저장하거나 공유한 뒤, 그쪽에서 [저장 파일 불러오기]를 누르세요." : "앱이나 다른 기기로 옮기려면 파일로 내보낸 뒤(파일 저장이 막힌 환경에서는 [저장 데이터 복사] 후 .json 파일로 저장) 그쪽에서 불러오세요."}
        </div>
        <div class="row">
          <button class="btn" onClick={() => exportSave(g).then(showToast).catch((e: any) => showToast(`저장 파일을 만들지 못했습니다: ${e?.message || e}`))}>
            {IS_APP ? "파일로 저장" : "저장 파일 내보내기"}
          </button>
          {IS_APP && (
            <button class="btn" onClick={() => shareSave(g).catch((e: any) => showToast(`공유하지 못했습니다: ${e?.message || e}`))}>
              공유
            </button>
          )}
          <button class="btn" onClick={() => setSaveText(saveJson(g))}>
            저장 데이터 복사
          </button>
          <ConfirmButton
            class="btn"
            label="저장 파일 불러오기"
            confirmLabel="지금 게임을 덮어씁니다 — 한 번 더 누르기"
            onConfirm={async () => {
              const r = await pickSave();
              if (!r) return;
              if (!r.game) return showToast("포켓 리그 저장 파일이 아닙니다.");
              setGame(r.game);
              showToast("불러왔습니다.");
            }}
          />
          <ConfirmButton
            class="btn danger"
            label="게임 삭제"
            confirmLabel="한 번 더 누르면 삭제"
            onConfirm={() => {
              deleteSave();
              setGame(null);
              go({ name: "title" });
            }}
          />
        </div>
        {IS_APP && (
          <div class="row" style={{ marginTop: 6 }}>
            <button class="btn small" onClick={() => go({ name: "title" })}>
              타이틀 화면으로 (다른 슬롯)
            </button>
          </div>
        )}
      </Win>
      {IS_APP ? (
        <Win title="앱 업데이트">
          <AppUpdatePanel />
        </Win>
      ) : (
        <Win title="안드로이드 앱">
          <div class="small muted" style={{ marginBottom: 6 }}>
            휴대폰에 설치해서 할 수 있는 앱입니다. 저장 칸 3개를 쓸 수 있고, 앱 안의 [업데이트 확인]으로 최신 버전을 받습니다. 이 브라우저의 진행 상황은 [저장 파일 내보내기]로 옮기면 됩니다.
          </div>
          <ApkLink />
        </Win>
      )}
      <Win title="정보">
        <div class="small muted">
          비공식 팬게임입니다. Pokémon 및 관련 명칭은 각 권리자의 상표입니다.
          <br />
          그래픽·기술 애니메이션: PokéRogue (AGPL-3.0) · 배틀 엔진: Pokémon Showdown / @pkmn/sim (MIT) · 글꼴: Galmuri (SIL OFL)
          <br />이 게임의 소스 코드는 AGPL-3.0으로 공개됩니다.
        </div>
      </Win>
      {saveText && (
        <Modal onClose={() => setSaveText(null)}>
          <Win title="저장 데이터" right={<button class="btn small" onClick={() => setSaveText(null)}>닫기</button>}>
            <div class="small muted">아래 텍스트를 메모장에 붙여넣고 .json 파일로 저장하면 [저장 파일 불러오기]로 이어할 수 있습니다.</div>
            <textarea id="save-text" readOnly value={saveText} style={{ width: "100%", height: 160, background: "var(--win2)", color: "var(--text)", border: "2px solid var(--line)", fontSize: 11 }} onFocus={e => (e.target as HTMLTextAreaElement).select()} />
            <button
              class="btn primary"
              onClick={() =>
                navigator.clipboard
                  .writeText(saveText)
                  .then(() => showToast("복사했습니다."))
                  .catch(() => {
                    (document.getElementById("save-text") as HTMLTextAreaElement)?.select();
                    showToast("자동 복사가 막혀 있어 텍스트를 선택해 두었습니다. Ctrl+C로 복사하세요.");
                  })
              }
            >
              복사
            </button>
          </Win>
        </Modal>
      )}
      {toast}
    </>
  );
}
