# AIFlare 캡처 시스템 작동 흐름

AIFlare는 Claude Code의 **Hook**과 **Skill** 두 가지 메커니즘을 조합하여, AI 에이전트의 작업 컨텍스트를 자동으로 캡처한다.

> **Hook 시스템 — 외부 스크립트 호출 패턴**
>
> 5개 command hook(`UserPromptSubmit`, `Stop`, `PostToolUse(Bash, if "Bash(git commit:*)")`, `PostToolUse(AskUserQuestion)`, `SessionEnd`)은 `settings.local.json` 안에서 각자 별도 Node.js 스크립트(`.claude/hooks/{hook}.js`)를 호출한다. 공용 동작은 `_common.js` 모듈에 모여 있고, install.js 가 모든 OS(macOS / Linux / Windows)에서 동일한 `.js` 훅 한 세트를 설치한다. 이하 각 Phase 의 동작 흐름 설명은 외부 hook 스크립트 내부에서 실행되는 흐름이다.
>
> SessionEnd 는 cleanup 만 수행한다 (API 호출 없음).

---

## 전체 아키텍처

```
사용자 입력
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  Claude Code Session                                     │
│                                                          │
│  ① UserPromptSubmit Hook                                 │
│     → 사용자 프롬프트를 JSONL 형식으로 로컬 파일에 누적 저장     │
│                                                          │
│  ② Stop Hook (AI 응답 완료 시)                            │
│     → AI 응답(last_assistant_message)을 JSONL로 누적 저장    │
│                                                          │
│  ③ PostToolUse Hook (AskUserQuestion 직후)               │
│     → .pending-question-{SESSION_ID} 플래그 파일 생성       │
│     → 다음 커밋이 "AskUserQuestion → 답변 → 커밋" 연속인지    │
│       판정하는 신호로 쓰임 (그룹핑 continuation=true)         │
│                                                          │
│  ④ PostToolUse Hook (git commit 완료 후)                 │
│     → PUT /api/v1/work-sessions/prompt (전체 JSONL 전송)   │
│     → 줄 수(메시지 인덱스) 기반 delta 추출 → delta 파일 저장  │
│     → context-capture Skill 호출 강제 메시지 출력           │
│                                                          │
│  ⑤ context-capture Skill 실행                             │
│     → capture.js가 delta 파일 자동 읽기                    │
│     → .pending-question 플래그 확인하여 continuation 결정   │
│     → POST /api/v1/captures (캡처 + conversationSnippet   │
│                              + continuation)             │
│     → 서버가 group_root_id 판정 후 TimelineEntry 저장       │
│     → 엔트리 + 대화 조각이 함께 저장됨                       │
│                                                          │
│  ⑥ SessionEnd Hook                                       │
│     → 프롬프트/오프셋/delta/pending-question 파일 정리       │
│                                                          │
└──────────────────────────────────────────────────────────┘
        │             │              │
        ▼             ▼              ▼
┌─────────────────────────────────────────────┐
│  AIFlare 서버                                │
│                                             │
│  PUT  /api/v1/work-sessions/prompt (프롬프트) │
│  POST /api/v1/captures           (캡처)      │
│  POST /api/v1/captures/publish   (push 전환) │
│  GET  /api/v1/.../conversations  (대화 조회)  │
│                                             │
└─────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  git push 시점 (pre-push hook)                           │
│                                                          │
│  ⑦ .git/hooks/pre-push 실행                              │
│     → push되는 커밋 해시 목록 추출                          │
│     → POST /api/v1/captures/publish 호출                  │
│     → LOCAL 엔트리를 PUSHED로 전환                         │
│     → 실패해도 push 자체는 차단하지 않음                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Phase 1: 대화 캡처 (UserPromptSubmit + Stop Hook)

**트리거:** 
- UserPromptSubmit: 사용자가 Claude Code에 프롬프트를 입력할 때마다 실행
- Stop: Claude Code 에이전트가 응답을 완료할 때마다 실행

**설정 위치:** `.claude/settings.local.json` → `hooks.UserPromptSubmit`, `hooks.Stop`

### 동작 흐름

```
사용자가 프롬프트 입력
    │
    ▼
UserPromptSubmit Hook 실행
    │
    ├─ hook 입력 JSON에서 session_id, prompt 추출
    │
    ├─ .context-capture/ 디렉토리 생성 (mkdir -p)
    │
    └─ 사용자 프롬프트를 JSONL 형식으로 파일에 append
         .context-capture/.claude-prompts-{SESSION_ID}
         {"role":"user","content":"사용자 입력 텍스트"}
    │
    ▼
Claude Code 에이전트가 작업 수행 + 응답 완료
    │
    ▼
Stop Hook 실행
    │
    ├─ stop_hook_active 확인 (true이면 무한루프 방지 위해 종료)
    │
    ├─ hook 입력 JSON에서 session_id, last_assistant_message 추출
    │
    └─ AI 응답을 JSONL 형식으로 같은 파일에 append
         .context-capture/.claude-prompts-{SESSION_ID}
         {"role":"assistant","content":"AI 응답 전체 텍스트"}
    │
    ▼
  완료 (PostToolUse Hook에서 이 파일을 참조)
```

### JSONL 저장 형식

프롬프트 파일(`.claude-prompts-{SESSION_ID}`)에는 사용자와 AI의 대화가 JSONL 형식으로 번갈아 저장된다:

```jsonl
{"role":"user","content":"설정 변경해줘"}
{"role":"assistant","content":"설정을 변경했습니다. config.yml의 timeout 값을..."}
{"role":"user","content":"테스트도 추가해"}
{"role":"assistant","content":"테스트를 추가했습니다. ConfigServiceTest에..."}
```

### 핵심 개념: 세션 ID

- `session_id`는 **Claude Code가 자동 부여하는 세션 식별자**이다 (hook 입력 JSON의 `.session_id` 필드)
- 하나의 세션 ID는 하나의 Claude Code 세션에 대응한다
- 사용자가 여러 프롬프트를 연속 입력하면 같은 세션 ID의 파일에 누적된다
- 세션이 새로 시작되면 새 세션 ID가 부여되어 자연스럽게 새 파일이 생성된다
- 이 세션 ID는 `claudeSessionId`로 WorkSession과 연결되어, 타임라인에서 "하나의 세션 → 여러 커밋"을 그룹핑한다

### 생성 파일

| 파일 | 용도 |
|------|------|
| `.context-capture/.claude-prompts-{SESSION_ID}` | 사용자+AI 대화 JSONL 누적 (한 줄에 하나의 JSON 객체) |

---

## Phase 2: AskUserQuestion 감지 (PostToolUse Hook, matcher="AskUserQuestion")

**트리거:** Claude Code가 `AskUserQuestion` built-in tool을 실행한 직후

**설정 위치:** `.claude/settings.local.json` → `hooks.PostToolUse` (두 번째 엔트리, `matcher: "AskUserQuestion"`)

### 목적

타임라인 엔트리 그룹핑 판정에 필요한 두 번째 신호(`continuation`)를 제공한다.

- Agent가 `AskUserQuestion`으로 사용자에게 질문 → 사용자 답변 → 후속 커밋 시나리오에서, 사용자 답변이 delta에 포함되어 "새 user 메시지가 있는" 것처럼 보인다.
- 이 경우에도 **같은 그룹**으로 묶어야 하므로, `AskUserQuestion` 직후에 플래그 파일을 남겨 "이 커밋은 질문의 연속"임을 표시한다.

### 동작 흐름

```
Agent가 AskUserQuestion 호출 완료
    │
    ▼
PostToolUse Hook(matcher="AskUserQuestion") 실행
    │
    ├─ hook 입력에서 session_id 추출
    ├─ .context-capture/ 디렉토리 생성
    └─ .pending-question-{SESSION_ID} 빈 파일 touch
```

플래그는 다음 커밋 시 `capture.js`가 읽어 payload의 `continuation: true`로 변환하고 파일을 삭제한다. 플래그 파일이 없으면 `continuation: false`.

### 생성 파일

| 파일 | 생성 시점 | 삭제 시점 | 용도 |
|------|-----------|-----------|------|
| `.context-capture/.pending-question-{SESSION_ID}` | AskUserQuestion 실행 직후 | capture.js 실행 시(또는 SessionEnd) | 그룹핑 continuation 신호 |

---

## Phase 3: 프롬프트 전송 + Delta 캡처 + Skill 호출 강제 (PostToolUse Hook)

**트리거:** Claude Code가 `Bash` 도구로 `git commit*` 패턴의 명령을 실행한 직후

**설정 위치:** `.claude/settings.local.json` → `hooks.PostToolUse` (첫 번째 엔트리, `matcher: "Bash"` + `if: "Bash(git commit:*)"`)

### 역할 (3가지)

1. **세션 대화 전송**: 누적된 전체 대화 JSONL을 `PUT /api/v1/work-sessions/prompt`로 전송
2. **Delta 추출**: 줄 수(메시지 인덱스) 파일을 이용해 이전 캡처 이후의 새 대화만 추출하여 delta 파일로 저장
3. **Skill 호출 강제**: context-capture Skill 발동을 보장하는 안전장치 메시지 출력

### 동작 흐름

```
Claude Code가 Bash("git commit ...") 실행 완료
    │
    ▼
PostToolUse Hook 실행 (matcher: "Bash", if: "Bash(git commit:*)")
    │
    ├─ [0] 명령어 정규식 이중 검증 (hook 스크립트 내부)
    │   tool_input.command 를 /(?:^|[\s;&|])git\s+commit(?:\s|$|;|&|\|)/ 로 검사
    │   매칭되지 않으면 즉시 종료 (matcher 필터의 이중 안전장치)
    │
    ├─ aiflare.yml 존재 확인
    │
    ├─ [1] 전체 대화 JSONL 전송
    │   대화 파일(.claude-prompts-{SESSION_ID}) 전체를 읽어
    │   PUT /api/v1/work-sessions/prompt로 전송 (5초 timeout)
    │
    ├─ [2] Delta 추출 (줄 수 기반)
    │   ├─ 오프셋 파일(.claude-offset-{SESSION_ID}) 읽기
    │   │   (없으면 0부터 시작 — 줄 수 저장)
    │   ├─ 현재 파일 총 줄 수(TOTAL_LINES)와 오프셋 비교
    │   │   (newline 문자 카운트로 측정 — bash `wc -l` 과 동일)
    │   ├─ TOTAL_LINES > LAST_INDEX이면:
    │   │   LAST_INDEX 이후 줄만 잘라내어 delta 로 저장
    │   │   → .claude-conversation-delta-{SESSION_ID} 파일로 저장
    │   └─ 오프셋 파일을 현재 TOTAL_LINES로 업데이트
    │
    └─ [3] Skill 호출 강제
       .claude/skills/context-capture 디렉토리 존재 확인
       → hookSpecificOutput 메시지 출력
       → Claude Code 에이전트가 context-capture Skill 호출

```

### Delta 추출 예시

세션 중에 사용자가 프롬프트 3개를 입력하고(AI 응답 포함), 커밋을 2회 수행하는 경우:

```
대화 파일 (.claude-prompts-{SESSION_ID}):
┌─────────────────────────────────────────────────────────────┐
│ Line 1: {"role":"user","content":"프로젝트 설정 변경해줘"}      │
│ Line 2: {"role":"assistant","content":"설정을 변경했습니다..."} │
│ Line 3: {"role":"user","content":"테스트도 추가해줘"}          │
│ Line 4: {"role":"assistant","content":"테스트를 추가했습니다."}  │
│                                                             │
│    ── 여기서 첫 번째 커밋 발생 ──                               │
│                                                             │
│ Line 5: {"role":"user","content":"영어 번역도 넣어줘"}         │
│ Line 6: {"role":"assistant","content":"번역을 추가했습니다."}   │
│                                                             │
│    ── 여기서 두 번째 커밋 발생 ──                               │
└─────────────────────────────────────────────────────────────┘
```

**첫 번째 커밋 시:**

| 단계 | 값 | 설명 |
|------|-----|------|
| 오프셋 파일 읽기 | 파일 없음 → `LAST_INDEX = 0` | 첫 캡처이므로 인덱스 없음 |
| 총 줄 수 측정 | `TOTAL_LINES = 4` | 대화 4줄 (user 2 + assistant 2) |
| 비교 | `4 > 0` → delta 존재 | |
| delta 추출 | `tail -n +1` → 전체 4줄 | 사용자+AI 대화 전체 JSONL |
| delta 파일 저장 | `.claude-conversation-delta-{SESSION_ID}` | capture.js가 읽을 파일 |
| 인덱스 갱신 | `4` → 오프셋 파일에 기록 | 다음 캡처의 시작 줄 |

**두 번째 커밋 시:**

| 단계 | 값 | 설명 |
|------|-----|------|
| 오프셋 파일 읽기 | `LAST_INDEX = 4` | 첫 번째 캡처에서 기록된 값 |
| 총 줄 수 측정 | `TOTAL_LINES = 6` | 대화 2줄 추가됨 |
| 비교 | `6 > 4` → delta 존재 | |
| delta 추출 | `tail -n +5` → 4줄 이후만 | Line 5, 6의 JSONL |
| delta 파일 저장 | `.claude-conversation-delta-{SESSION_ID}` | 덮어쓰기 |
| 인덱스 갱신 | `6` → 오프셋 파일에 기록 | |

이렇게 각 커밋 시점에 **이전 캡처 이후에 새로 발생한 대화(사용자+AI)만** 정확히 추출되어, 해당 커밋의 `EntryConversation`으로 저장된다.

### 생성/관리 파일

| 파일 | 용도 |
|------|------|
| `.context-capture/.claude-offset-{SESSION_ID}` | 마지막 캡처 시점의 줄 수 (메시지 인덱스) |
| `.context-capture/.claude-conversation-delta-{SESSION_ID}` | 이전 캡처 이후의 새 대화 JSONL (delta) |

### 엣지 케이스

| 상황 | 영향 |
|------|------|
| capture.js 인자에 "git commit" 포함 (예: `--title "git commit fix"`) | hook 스크립트 내부 정규식이 따옴표 안의 토큰을 별도 명령으로 인식하지 않으므로(앞 문자가 `[\s;&\|]` 또는 시작이어야 매칭) 즉시 종료 — 재발동 없음 |
| 첫 커밋 (오프셋 파일 없음) | LAST_INDEX=0, 전체 대화 JSONL 이 delta 로 추출됨 |
| 프롬프트 파일 없음 | `updateDelta` / `uploadPromptFile` 모두 파일 존재 체크에서 조용히 종료 |
| aiflare.yml 없음 또는 api_key 누락 | 대화 전송·delta 추출 전부 스킵, Skill 호출 강제만 그대로 진행 |

---

## Phase 4: 컨텍스트 캡처 (context-capture Skill)

**트리거:** AI 에이전트가 `git commit`을 실행한 직후, Skill이 자동으로 활성화됨

**Skill 위치:** `.claude/skills/context-capture/SKILL.md`

**스크립트:** `.claude/skills/context-capture/scripts/capture.js`

### 실행 경로 분기

| 상황 | 처리 방법 |
|------|-----------|
| 메인 세션에서 직접 커밋 | SKILL.md 절차에 따라 에이전트가 직접 capture.js 실행 |
| 서브에이전트가 커밋 | 서브에이전트 프롬프트에 capture.js 실행 지시를 포함 |

### 메인 세션 캡처 흐름

```
git commit 완료
    │
    ▼
context-capture Skill 활성화
    │
    ├─ 1. aiflare.yml 읽기
    │      → api_key, endpoint 추출
    │      → 없으면 캡처 건너뜀 (작업은 계속)
    │
    ├─ 2. 커밋 정보 추출
    │      $ git rev-parse HEAD           → commitHash
    │      $ git diff --name-only HEAD~1  → changedFiles
    │
    ├─ 3. 대화 컨텍스트에서 요약 데이터 생성
    │      에이전트가 자신의 컨텍스트를 분석하여:
    │      ┌──────────────────────────────────────────┐
    │      │ title:        작업 제목 (50자 이내)        │
    │      │ intent:       왜 이 변경이 필요했는가      │
    │      │ alternatives: 검토했지만 선택하지 않은 대안  │
    │      │ diffSummary:  핵심 변경 사항 요약          │
    │      │ tag:          FEATURE|BUGFIX|REFACTORING  │
    │      │               |TEST|DOCS                  │
    │      │ agentType:    CLAUDE_CODE                 │
    │      └──────────────────────────────────────────┘
    │
    ▼
    4. capture.js 실행
```

### capture.js 내부 흐름

```
capture.js 실행
    │
    ├─ 인자 파싱 (--title, --intent, --commit-hash,
    │             --conversation-snippet, ...)
    │
    ├─ aiflare.yml에서 api_key, endpoint 추출
    │
    ├─ claudeSessionId fallback
    │   --claude-session-id 생략 시:
    │   가장 최근 .claude-prompts-* 파일에서 세션 ID 추출
    │
    ├─ conversationSnippet fallback (Delta 파일 자동 읽기)
    │   --conversation-snippet 생략 시:
    │   .claude-conversation-delta-{SESSION_ID} 파일이 있으면
    │   내용을 읽어 conversationSnippet으로 사용 후 파일 삭제
    │
    ├─ continuation 플래그 계산
    │   .pending-question-{SESSION_ID} 파일이 있으면
    │   CONTINUATION=true 후 파일 삭제, 없으면 false
    │
    ├─ 필수 필드 검증
    │   (title, intent, commitHash, claudeSessionId,
    │    changedFiles, tag)
    │
    ├─ JSON 페이로드 생성 → /tmp/cb-capture-payload-{PID}.json
    │   continuation 필드 항상 포함
    │   conversationSnippet이 있으면 조건부로 JSON에 포함
    │
    ▼
POST {endpoint}/api/v1/captures
    {
      "title": "회원가입 시 createdBy 문제 수정",
      "intent": "AuditorAware가 anonymousUser일 때...",
      "alternatives": "SecurityContext 수동 설정도 검토...",
      "diffSummary": "JpaAuditingConfig.kt 변경...",
      "commitHash": "ce30efd",
      "agentType": "CLAUDE_CODE",
      "claudeSessionId": "session-abc123",
      "changedFiles": ["JpaAuditingConfig.kt", "OrgService.kt"],
      "tag": "BUGFIX",
      "continuation": false,
      "conversationSnippet": "createdBy 버그 수정해줘\n테스트도 추가해"
    }
    Headers:
      Content-Type: application/json
      X-API-Key: {api_key}
    │
    ├─ 201 Created → 캡처 성공
    │   → 서버가 group_root_id 판정 (Phase 5 참조)
    │   → TimelineEntry 생성 (groupRoot 포함)
    │   → conversationSnippet이 있으면 EntryConversation도 함께 저장
    │
    ├─ 400 → 요청 데이터 오류
    ├─ 401 → API Key 무효
    ├─ 404 → 프로젝트 미연결
    ├─ 429 → 요청 한도 초과 (60회/분)
    └─ 기타 → 서버 오류
    │
    ▼
  임시 파일 삭제, 캡처 실패해도 작업은 계속 진행
```

---

## Phase 5: 서버 측 그룹 판정 (group_root_id Resolver)

**위치:** `CaptureService.resolveGroupRootId(...)` — `POST /api/v1/captures` 처리 내부

**목적:** 한 사용자 요청에서 파생된 연속 커밋들을 같은 그룹으로 묶어 타임라인에서 관계를 표현한다.

### 데이터 모델

`timeline_entries` 테이블에 nullable self-reference 컬럼이 있다:

```sql
group_root_id VARCHAR(36) NULL REFERENCES timeline_entries(id)
```

- `group_root_id = NULL`: 엔트리가 그룹 root이거나 단독
- `group_root_id = X`: id=X인 root에 소속된 멤버
- 자기 참조는 사용하지 않음 (root는 항상 NULL로 표현)

응답 DTO(`TimelineEntryResponse`)에 `groupRootId: String?` 필드로 노출된다. 프론트는 `COALESCE(groupRootId, id)`를 그룹 키로 사용한다.

### 판정 입력

- `workSessionId`: 현재 캡처가 속한 WorkSession
- `conversationSnippet`: capture.js가 전송한 delta JSONL
- `continuation`: `AskUserQuestion` 직후 커밋 여부

### 판정 규칙

같은 `workSessionId` 내 직전 `TimelineEntry`를 `created_at DESC`로 조회하여:

```
직전 entry 없음 → 이 엔트리가 root (group_root_id = NULL)

직전 entry 있음:
  deltaHasUserMessage == false → 같은 그룹 (agent 단독 연속 커밋)
  deltaHasUserMessage == true:
    continuation == true  → 같은 그룹 (AskUserQuestion 연속)
    continuation == false → 새 그룹 (사용자가 새 요청 시작)
```

같은 그룹일 때 `group_root_id = 직전.group_root_id ?: 직전.id`.

### deltaHasUserMessage 판정

`conversationSnippet`(JSONL)을 line 단위로 파싱하여 `role == "user"` 라인이 하나라도 있으면 true.

### 시나리오 예시

**(A) Agent 혼자 연속 커밋**
```
T0 User: "A, B, C 해줘"
T1 commit A → delta has user → root     (101, root=NULL)
T2 commit B → delta no user  → same     (102, root=101)
T3 commit C → delta no user  → same     (103, root=101)
```

**(B) AskUserQuestion 중간 개입**
```
T0 User: "리팩토링 해줘"
T1 commit part1 → root                   (201, root=NULL)
T2 Agent AskUserQuestion → .pending-question 생성
T3 User: "B로"
T4 commit part2 → delta has user
                  + continuation=true → same  (202, root=201)
```

**(C) 새 사용자 요청**
```
T0 User: "A 해줘" → commit                (301, root=NULL)
T1 User: "이제 B 해줘" (평문) → commit
   delta has user, continuation=false → 새 root  (302, root=NULL)
```

### 한계

- **평문 질문 미감지**: Agent가 `AskUserQuestion` tool 없이 평문으로 질문한 뒤 받은 답변은 `continuation` 신호가 없어 새 그룹으로 분리된다.
- **다른 agent**: Gemini CLI, Codex 등은 `AskUserQuestion`이 없어 `continuation`이 항상 false. 사용자 입력 = 새 그룹 기본 규칙만 적용된다.
- **WorkSession 없는 캡처**: `workSessionId`가 NULL이면 그룹핑을 스킵하고 root로 취급한다.

---

## 전체 타임라인 예시

사용자가 "Getting Started 가이드 페이지 만들어줘"라고 입력한 경우:

```
시간순 →

[1] UserPromptSubmit Hook
    → .context-capture/.claude-prompts-sess-abc 생성
    → {"role":"user","content":"Getting Started 가이드 페이지 만들어줘"}

[1.5] Stop Hook (AI 응답 완료)
    → {"role":"assistant","content":"Getting Started 페이지를 만들겠습니다..."}

[2] git commit 완료 → PostToolUse Hook
    → PUT /work-sessions/prompt (전체 대화 JSONL 전송)
    → Delta 추출 (줄 수 기반): 이전 캡처 이후의 대화 JSONL
    → .claude-conversation-delta-sess-abc 파일 저장

[3] context-capture Skill (commit: e395786)
    → capture.js가 delta 파일 자동 읽기
    → POST /captures {
         title: "Getting Started 가이드 한국어 번역 키 추가",
         claudeSessionId: "sess-abc",
         commitHash: "e395786", tag: "FEATURE",
         conversationSnippet: "{\"role\":\"user\",...}\n{\"role\":\"assistant\",...}"
       }
    → 201 Created (TimelineEntry + EntryConversation 저장)

[4] 사용자가 추가 프롬프트 입력: "영어/중국어도 추가해"
    → UserPromptSubmit Hook → {"role":"user","content":"영어/중국어도 추가해"}

[4.5] Stop Hook (AI 응답 완료)
    → {"role":"assistant","content":"영어/중국어 번역을 추가했습니다."}

[5] git commit 완료 → PostToolUse Hook
    → Delta 추출 (줄 수 기반): 이전 인덱스 이후의 대화 JSONL만

[6] context-capture Skill (commit: 782facb)
    → POST /captures {
         conversationSnippet: "{\"role\":\"user\",...}\n{\"role\":\"assistant\",...}", ...
       }

[7] 세션 종료 → SessionEnd Hook
    → .context-capture/{prompts, offset, delta, pending-question}-sess-abc 정리
```

### AIFlare 대시보드에서의 표시

```
┌─ 세션: sess-abc ─────────────────────────────────────┐
│                                                        │
│  📝 e395786 - Getting Started 가이드 한국어 번역 키 추가   │
│     Intent: ko.json에 docs.gettingStarted 키 추가...    │
│     💬 사용자: "Getting Started 가이드 페이지 만들어줘"    │
│     💬 AI: "Getting Started 페이지를 만들겠습니다..."     │
│                                                        │
│  📝 782facb - Getting Started 가이드 영어/중국어 번역 추가  │
│     Intent: en.json, zh.json에 동일 구조 번역 추가...     │
│     💬 사용자: "영어/중국어도 추가해"                      │
│     💬 AI: "영어/중국어 번역을 추가했습니다."               │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## 설정 파일 요약

### aiflare.yml (프로젝트 루트, gitignore 대상)

```yaml
api_key: "cb_live_a7f2k9x3mP8qR1vN5tY0wB4j"
endpoint: "localhost:8080"
```

### .claude/settings.local.json (Hook 설정)

각 command hook 의 `command` 필드는 외부 Node.js 스크립트(`.claude/hooks/{이름}.js`) 한 줄 호출로 단순화되어 있다. 동작 로직은 모두 외부 스크립트가 책임진다.

install.js 가 머지하는 hook 은 아래 5 개다.

| Hook | 이벤트 | 외부 스크립트 | 역할 |
|------|--------|---------------|------|
| `UserPromptSubmit` | 프롬프트 입력 시 | `user-prompt-submit.js` | 사용자 입력을 JSONL 로 로컬 파일에 누적 저장 |
| `Stop` | AI 응답 완료 시 | `stop.js` | AI 응답(`last_assistant_message`)을 JSONL 로 같은 파일에 누적 저장 |
| `PostToolUse` | `Bash` matcher + `if: "Bash(git commit:*)"` | `post-tool-use-bash-git-commit.js` | 대화 JSONL 전송 + 줄 수 기반 delta 추출 + Skill 호출 강제 (hook 내부 정규식 이중 검증 포함) |
| `PostToolUse` | `AskUserQuestion` 실행 직후 | `post-tool-use-ask-user-question.js` | `.pending-question-{SESSION_ID}` 플래그 파일 생성 (그룹핑 `continuation` 신호) |
| `SessionEnd` | 세션 종료 시 | `session-end.js` | 대화/오프셋/delta/pending-question 파일 정리 (API 호출 없음) |

### .claude/hooks/ (Hook 외부 스크립트)

Node.js 단일 구현. install 시 `.claude/hooks/` 로 복사된다. `_common.js` 는 require 전용이라 실행권한이 별도로 필요 없으며, 머신의 OS(macOS / Linux / Windows)와 무관하게 동일한 한 세트만 설치된다.

| 파일 | 역할 |
|------|------|
| `_common.js` | 공용 라이브러리 (camelCase). `readInput`, `getGitRoot`, `ensureContextDir`, `promptFilePath`, `offsetFilePath`, `deltaFilePath`, `pendingQuestionPath`, `hasAiflareConfig`, `readAiflareConfig`, `hasContextCaptureSkill`, `makeLogger` (info/warn/error emit 팩토리) — 총 11개 |
| `user-prompt-submit.js` | 사용자 prompt → JSONL 한 줄 append |
| `stop.js` | `last_assistant_message` → JSONL 한 줄 append (`stop_hook_active=true` 면 skip) |
| `post-tool-use-bash-git-commit.js` | git commit 직후. defense-in-depth 정규식 검증 → `uploadPromptFile` → `updateDelta` → Skill 호출 강제 메시지 출력 |
| `post-tool-use-ask-user-question.js` | AskUserQuestion 직후 `.pending-question` 마커 touch |
| `session-end.js` | 세션 종료 시 `.context-capture/` 의 4 종 파일 cleanup |

install.js 는 settings.local.json 의 hook 항목을 코드로 직접 생성해 사용자의 기존 설정과 머지한다. 별도의 OS-specific 템플릿 파일은 사용하지 않는다.

### .claude/skills/context-capture/ (Skill 디렉토리)

| 파일 | 역할 |
|------|------|
| `SKILL.md` | Skill 정의, 실행 절차, 서브에이전트 처리 가이드 |
| `scripts/capture.js` | API 호출 독립 스크립트 (delta 파일 자동 읽기 지원) |
| `scripts/pre-push` | pre-push hook 스크립트 (install.js 가 `.git/hooks/pre-push` 로 복사) |
| `references/capture-api.md` | Capture API 스펙 참조 문서 |

### .context-capture/ 디렉토리 (런타임 파일, gitignore 대상)

| 파일 패턴 | 생성 시점 | 삭제 시점 | 용도 |
|-----------|-----------|-----------|------|
| `.claude-prompts-{SESSION_ID}` | UserPromptSubmit + Stop | SessionEnd | 사용자+AI 대화 JSONL 누적 |
| `.claude-offset-{SESSION_ID}` | PostToolUse (첫 커밋) | SessionEnd | 마지막 캡처 시점 줄 수 (메시지 인덱스) |
| `.claude-conversation-delta-{SESSION_ID}` | PostToolUse (커밋 시) | capture.js (읽은 후) | 이전 캡처 이후 새 대화 JSONL |
| `.pending-question-{SESSION_ID}` | PostToolUse (AskUserQuestion 직후) | capture.js (읽은 후) 또는 SessionEnd | 그룹핑 continuation 신호 |

### .githooks/ (Git Hook 디렉토리)

| 파일 | 역할 |
|------|------|
| `pre-push` | git push 시 LOCAL 엔트리를 PUSHED로 전환하는 hook |

---

## Phase 6: Push 상태 전환 (pre-push hook)

**트리거:** `git push` 실행 시 Git 이 `.git/hooks/pre-push` 스크립트를 자동 실행함

**설치:** install.js 가 번들의 `scripts/githooks/pre-push` 를 `.git/hooks/pre-push` 로 복사하고 실행권한을 부여한다. 기존 hook 이 있으면 덮어쓰지 않고 수동 머지 안내를 출력한다.

### 동작 흐름

```
git push 실행
    │
    ▼
pre-push hook 발동
    │
    ├─ aiflare.yml 존재 확인
    │   (없으면 조용히 종료, push는 정상 진행)
    │
    ├─ API Key, Endpoint 추출
    │
    ├─ stdin에서 push 정보 파싱
    │   (local_ref, local_sha, remote_ref, remote_sha)
    │
    ├─ push되는 커밋 해시 목록 추출
    │   $ git log remote_sha..local_sha --format="%H"
    │
    ├─ 브랜치명 추출
    │   refs/heads/feature/auth → feature/auth
    │
    ▼
POST {endpoint}/api/v1/captures/publish
    {
      "commitHashes": ["abc123", "def456", "ghi789"],
      "branch": "feature/auth"
    }
    Headers:
      Content-Type: application/json
      X-API-Key: {api_key}
    │
    ├─ 서버 처리:
    │   1차: commitHash 매칭 → LOCAL 엔트리를 PUSHED로 전환
    │   2차: 같은 (projectId, branch)의 남은 LOCAL 엔트리 → PUSHED로 일괄 전환
    │
    └─ 실패해도 push는 정상 진행 (|| true)
```

### Push 상태 매칭 전략

| 매칭 방식 | 설명 | 대상 |
|-----------|------|------|
| commitHash 매칭 | push된 해시와 정확히 일치하는 엔트리 | 일반 commit → push 흐름 |
| 브랜치 기반 fallback | 같은 프로젝트·브랜치의 남은 LOCAL 엔트리 일괄 전환 | rebase/amend로 해시가 변경된 경우 |
| 수동 변경 | 작성자가 대시보드에서 직접 PUSHED로 변경 | hook 미설치 환경 |

### 설치 파일

| 파일 | 역할 |
|------|------|
| `.git/hooks/pre-push` | install.js 가 머신마다 설치하는 실제 실행 위치 (untracked, 사용자 머신 별 설치 필요) |
| `scripts/githooks/pre-push` | 번들에 포함된 원본 (install.js 의 복사 소스) |

---

## Phase 7: 대화 조각 조회 (Entry Conversations API)

**트리거:** 프론트엔드에서 엔트리 상세 조회 시 "관련 대화" 섹션 렌더링

**엔드포인트:** `GET /api/v1/projects/{projectId}/entries/{entryId}/conversations`

### 데이터 모델

```
TimelineEntry (1) ←──── (N) EntryConversation
                              │
                              ├─ id (UUID)
                              ├─ entry_id (FK)
                              ├─ content (TEXT, JSONL 형식)
                              ├─ created_at
                              └─ ... (BaseEntity 필드)
```

content 필드에는 JSONL 문자열이 저장된다:
```jsonl
{"role":"user","content":"���정 변���해줘"}
{"role":"assistant","content":"설정을 변경했습니다..."}
```

### 동작 흐름

```
프론트엔드에서 엔트리 상세 열기
    │
    ▼
GET /api/v1/projects/{projectId}/entries/{entryId}/conversations
    │
    ├─ 인증: JWT Bearer 토큰
    ├─ 권한: PROJECT_READ (PROJECT_OWNER, PROJECT_ADMIN, MEMBER)
    │
    ├─ 엔트리가 해당 프로젝트에 속하는지 검증
    │
    ▼
응답:
    {
      "success": true,
      "response": {
        "conversations": [
          {
            "id": "conv-uuid",
            "content": "프로젝트 설정 변경해줘\n테스트도 추가해줘",
            "createdAt": "2026-04-05T10:00:00Z"
          }
        ]
      }
    }
```

### 저장 흐름 요약

```
UserPromptSubmit → 사용자 입력 JSONL 누적
    ↓
Stop → AI 응답 JSONL 누적 (같은 파일)
    ↓
git commit → PostToolUse Hook
    ↓
Delta 추출 (줄 수 기반, 이전 인덱스 이후 JSONL) → delta 파일 저장
    ↓
capture.js → delta 파일 자동 읽기
    ↓
POST /captures { conversationSnippet: "delta JSONL" }
    ↓
CaptureService → TimelineEntry 저장 + EntryConversation 저장
    ↓
GET .../conversations → 프론트엔드에서 JSONL 파싱 후 role별 구분 표시
```

---

## 실패 안전성

모든 캡처 동작은 **실패해도 현재 작업을 중단하지 않는다:**

- `aiflare.yml`이 없으면 → 조용히 건너뜀
- API 호출 실패 → 경고 메시지 출력 후 계속 진행
- Hook에서 오류 발생 → `exit 0`으로 Claude Code 세션에 영향 없음
- 서브에이전트 캡처 누락 → 컨트롤러가 fallback으로 직접 캡처 시도
- pre-push hook 미설치 → 엔트리가 `LOCAL` 상태로 남지만, 수동으로 `PUSHED`로 변경 가능
- pre-push hook API 호출 실패 → push 자체는 정상 진행, `LOCAL` 배지가 유지될 뿐
- delta 파일 없음 → `conversationSnippet` 없이 캡처됨 (엔트리는 정상 생성, 대화 조각만 누락)
- 오프셋 파일 손상/삭제 → 다음 캡처에서 전체 대화가 delta로 추출됨 (데이터 손실 없음)
- `.pending-question` 플래그 누락 → `continuation=false`로 캡처되어 AskUserQuestion 연속 커밋이 새 그룹으로 분리될 수 있음 (엔트리 자체는 정상 생성)
- Stop 훅에서 stop_hook_active=true → 무한 루프 방지를 위해 즉시 종료 (정상 동작)
