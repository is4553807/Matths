#!/usr/bin/env python3
"""Generate Korean narration clips, a timed storyboard, and an SRT file."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent
GENERATED = ROOT / "generated"
VOICE = "Yuna"
RATE = "205"


SCENES = [
    {
        "id": "hook",
        "step": 0,
        "title": "배치고사에서 Main Ranking까지",
        "eyebrow": "MATTHS RANKING RULES",
        "kind": "hook",
        "cues": [
            "매쓰의 랭킹은 단순한 점수표가 아닙니다. 한 결제 주기 안에서 실력, 도전, 그리고 환급 결과가 연결됩니다.",
            "랭킹을 바꾸는 세 축은 공식 모의고사, 랭크 테이크오버, 그리고 환급 조건입니다.",
        ],
    },
    {
        "id": "placement",
        "step": 1,
        "title": "배치고사 · 공개 랭킹의 시작",
        "eyebrow": "STEP 1  PLACEMENT",
        "kind": "placement",
        "cues": [
            "신규 유저의 내부 엠엠알은 천오백 점에서 시작합니다.",
            "처음 다섯 번의 공식 모의고사가 배치고사입니다. 시험마다 내부 엠엠알은 변하지만, 다섯 회를 끝내기 전에는 공개 순위를 표시하지 않습니다.",
            "배치가 끝나면 현재 엠엠알과 티어를 유지한 채, 자신이 속한 랭킹 풀 안에서 첫 공개 순위가 정해집니다.",
        ],
    },
    {
        "id": "leagues",
        "step": 2,
        "title": "Sub와 Main은 완전히 분리된다",
        "eyebrow": "STEP 2  TWO LEAGUES",
        "kind": "leagues",
        "cues": [
            "서브 랭킹은 아직 환급에 도전 중인 유저의 리그입니다. 랭크 테이크오버에는 환급 도전 가능 일수를 사용합니다.",
            "메인 랭킹은 이번 결제 주기의 환급이 실제로 완료된 유저만 들어갈 수 있습니다. 여기서는 보너스 학습 일수를 사용합니다.",
            "두 리그는 공개 순위도, 매칭도 따로 계산합니다. 한 사람의 이름은 언제나 둘 중 한 랭킹에만 존재합니다.",
        ],
    },
    {
        "id": "official",
        "step": 3,
        "title": "공식 모의고사로 MMR을 갱신한다",
        "eyebrow": "STEP 3  OFFICIAL MOCK",
        "kind": "official",
        "cues": [
            "매주 일요일에는 오후 세 시, 여섯 시, 아홉 시의 동등한 시험 슬롯이 열립니다. 그중 한 번만 공식 기록이고, 나머지는 연습입니다.",
            "순위는 보정 점수로 정합니다. 동점이면 고난도 문항 성적, 정답 문항의 활성 풀이 시간을 차례로 비교하고, 완전히 같으면 공동 순위입니다.",
            "실제 순위 성과 에스에서 예상 성과 이를 뺀 값에 케이를 곱해 엠엠알 변화를 계산합니다.",
            "케이는 배치 중 사십팔, 일반 구간 이십사, 정산 전 엠엠알 이천 이상은 십육입니다. 갱신된 엠엠알은 월요일 자정, 서브와 메인에서 각각 순위를 다시 만듭니다.",
        ],
    },
    {
        "id": "takeover",
        "step": 4,
        "title": "Rank Takeover · 순위에 직접 도전한다",
        "eyebrow": "STEP 4  RANK TAKEOVER",
        "kind": "takeover",
        "cues": [
            "랭크 테이크오버는 같은 랭킹 풀 안에서 진행하는 비동기 일대일 대결입니다.",
            "한 칸 위는 이틀, 두세 칸 위는 사흘, 네 칸 이상 최대 일곱 칸 위는 엿새를 잠급니다. 서버는 조건에 맞는 상대를 무작위로 정합니다.",
            "매칭된 두 사람은 스물네 시간 안에 시험을 시작해야 합니다. 한 사람은 동시에 한 경기만 진행할 수 있습니다.",
            "도전자가 이기면 두 사람의 공개 위치가 바뀌고, 잠근 일수는 소모됩니다. 방어자가 이기면 위치는 유지되고, 잠근 일수는 방어자에게 이전됩니다.",
            "완전 동점은 방어자가 이깁니다. 서버 오류로 정상 진행이 불가능했다면 경기와 잠금 일수를 원상 복구합니다.",
        ],
    },
    {
        "id": "refund",
        "step": 5,
        "title": "환급 성공이 Main Ranking의 유일한 입장권",
        "eyebrow": "STEP 5  REFUND & MAIN",
        "kind": "refund",
        "cues": [
            "한 결제 주기는 유료 학습 이십구 일, 환급 도전 가능 일수 이십구 일, 연속 학습 영 일에서 시작합니다.",
            "같은 결제 주기 안에서 유효 학습을 삼십 일 연속 달성하고, 환급 도전 가능 일수도 삼십 일 이상이면 결제액을 한 번 환급받습니다.",
            "환급이 완료되면 남은 일수가 보너스 학습 일수로 전환되고, 엠엠알과 티어를 유지한 채 메인 랭킹으로 이동합니다.",
            "조건을 못 채운 뒤 자동 결제되면 새 주기가 시작됩니다. 유료 학습 이십구 일, 도전 가능 이십구 일, 연속 학습 영 일로 전부 리셋됩니다. 이십구 더하기 이십구를 오십팔로 합산하지 않습니다.",
            "메인에서는 보너스 일수로 테이크오버, 보호막, 복습권과 분석권을 사용합니다. 보너스나 잠금 일수가 남았거나 경기가 진행 중이면 새 패키지를 살 수 없습니다.",
            "모든 잔여 일수와 경기를 정리한 뒤 새 패키지를 사면 다시 서브 랭킹에서 시작하고, 메인에 오르려면 새 주기에서 환급 조건을 다시 달성해야 합니다.",
        ],
    },
    {
        "id": "outro",
        "step": 0,
        "title": "실력 · 도전 · 환급",
        "eyebrow": "THE COMPLETE LOOP",
        "kind": "outro",
        "cues": [
            "공식 모의고사는 엠엠알을, 랭크 테이크오버는 공개 위치를, 환급 성공은 소속 리그를 바꿉니다.",
            "이상 징후는 즉시 확정하지 않고 보류와 소명 절차로 검토합니다. 매쓰 랭킹은 이 세 가지 변화가 한 주기 안에서 연결되는 구조입니다.",
        ],
    },
]


def media_duration(path: Path) -> float:
    result = subprocess.run(
        ["/usr/bin/afinfo", str(path)],
        check=True,
        text=True,
        capture_output=True,
    )
    match = re.search(r"estimated duration:\s*([0-9.]+)\s*sec", result.stdout)
    if not match:
        raise RuntimeError(f"Could not read duration for {path}")
    return float(match.group(1))


def srt_timestamp(seconds: float) -> str:
    total_ms = round(seconds * 1000)
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def main() -> None:
    GENERATED.mkdir(parents=True, exist_ok=True)
    timeline = {"width": 720, "height": 1280, "fps": 30, "scenes": [], "cues": []}
    srt_entries: list[str] = []
    current = 0.0
    cue_index = 1

    for scene_index, scene in enumerate(SCENES):
        scene_start = current
        current += 0.65
        scene_cues = []

        for cue_text in scene["cues"]:
            audio_path = GENERATED / f"narration_{cue_index:02d}.aiff"
            subprocess.run(
                [
                    "/usr/bin/say",
                    "-v",
                    VOICE,
                    "-r",
                    RATE,
                    "-o",
                    str(audio_path),
                    cue_text,
                ],
                check=True,
            )
            duration = media_duration(audio_path)
            cue_start = current
            cue_end = cue_start + duration
            cue_record = {
                "index": cue_index,
                "scene": scene["id"],
                "text": cue_text,
                "start": round(cue_start, 3),
                "end": round(cue_end, 3),
                "audio": str(audio_path),
            }
            timeline["cues"].append(cue_record)
            scene_cues.append(cue_record)
            srt_entries.append(
                f"{cue_index}\n{srt_timestamp(cue_start)} --> {srt_timestamp(cue_end)}\n{cue_text}\n"
            )
            cue_index += 1
            current = cue_end + 0.24

        current += 0.55
        timeline["scenes"].append(
            {
                "index": scene_index,
                "id": scene["id"],
                "step": scene["step"],
                "title": scene["title"],
                "eyebrow": scene["eyebrow"],
                "kind": scene["kind"],
                "start": round(scene_start, 3),
                "end": round(current, 3),
                "cues": scene_cues,
            }
        )

    timeline["duration"] = round(current + 0.25, 3)
    (GENERATED / "timeline.json").write_text(
        json.dumps(timeline, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (ROOT / "Matths_랭킹_룰_자막_v1.0.srt").write_text(
        "\n".join(srt_entries),
        encoding="utf-8",
    )

    script_lines = ["# Matths 랭킹 룰 모션그래픽 내레이션", ""]
    for scene in timeline["scenes"]:
        script_lines.extend([f"## {scene['eyebrow']} — {scene['title']}", ""])
        for cue in scene["cues"]:
            script_lines.append(f"- {cue['text']}")
        script_lines.append("")
    (ROOT / "Matths_랭킹_룰_내레이션_v1.0.md").write_text(
        "\n".join(script_lines),
        encoding="utf-8",
    )
    print(f"Generated {len(timeline['cues'])} narration clips")
    print(f"Duration: {timeline['duration']:.3f} seconds")


if __name__ == "__main__":
    main()
