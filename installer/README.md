# installer/

Vercel(`aiflare.dev`)에서 서빙되는 AIFlare 부트스트래퍼와 자산 번들을 빌드한다. **GitHub 의존성을 완전히 제거**한 새 설치 흐름의 격리 작업 디렉토리다.

기존 `context-capture/`, `install-script/` 등 다른 디렉토리는 건드리지 않고, `context-capture/` 를 read-only 입력 소스로 사용해서 산출물 2개를 만든다.

## 산출물

`npm run build` 실행 시 `dist/` 에 다음이 생성된다:

| 파일 | 배포 후 노출될 URL | 설명 |
| --- | --- | --- |
| `dist/install.js` | `https://aiflare.dev/install.js` | cross-platform Node.js 부트스트래퍼 (macOS / Linux / Windows) |
| `dist/aiflare.zip` | `https://aiflare.dev/aiflare.zip` | 자산 번들 (skills, mcp-server, hooks, scripts/githooks/pre-push, settings 템플릿) |

ZIP 내부 구조는 `../context-capture/` 와 1:1 미러. 부트스트래퍼는 ZIP 을 받아 임시 디렉토리에 풀고 그 경로를 카논 소스처럼 참조한다.

ZIP 추출은 외부 npm 패키지 없이 OS native 도구를 셸아웃 호출:

| 플랫폼 | 추출 명령 |
| --- | --- |
| macOS / Linux | `unzip -q "$zip" -d "$dest"` |
| Windows | `tar -xf "$zip" -C "$dest"` (Win10 1803+ 의 bsdtar). 실패 시 PowerShell `Expand-Archive` fallback |

## 빌드

```bash
cd installer
npm install        # archiver 설치
npm run build      # dist/install.js, dist/aiflare.zip 생성
```

빌드 산출물은 `dist/` 에 있고 `.gitignore` 처리되어 있다.

## 사용자 노출 명령 (배포 후 목표 상태)

다운로드 시 로컬 파일명은 `install.cjs` 로 저장한다. 사용자 프로젝트의 `package.json` 에 `"type": "module"` 이 있더라도 `.cjs` 확장자가 강제로 CommonJS 로 해석시키기 때문이다 (install.js 본문은 `require()` 기반).

```bash
# macOS / Linux
curl -fsSL https://aiflare.dev/install.js -o install.cjs && node install.cjs && rm install.cjs

# Windows (PowerShell + curl.exe, Win10 build 1803+)
curl.exe -fsSL https://aiflare.dev/install.js -o install.cjs; node install.cjs; del install.cjs

# Windows (PowerShell + Invoke-WebRequest, PowerShell 3.0+)
iwr -useb https://aiflare.dev/install.js -OutFile install.cjs; node install.cjs; del install.cjs
```

## 로컬 E2E 테스트 (macOS / Linux)

`AIFLARE_ZIP_URL` 환경변수로 부트스트래퍼가 페치할 ZIP URL 을 override 할 수 있다. 임시 정적 서버를 띄우고 로컬 dist/aiflare.zip 을 받게 한다.

```bash
# 1) 별도 터미널에서 정적 서버 띄우기
cd installer/dist
python3 -m http.server 8123

# 2) 다른 디렉토리에서 임시 git repo + 더미 aiflare.yml 생성
mkdir -p /tmp/aiflare-test && cd /tmp/aiflare-test
git init -q
printf 'api_key: test\nendpoint: https://api.aiflare.dev\n' > aiflare.yml

# 3) 부트스트래퍼를 .cjs 로 복사한 뒤 실행 (ZIP URL override)
cp /Users/binchoi/agentharness/installer/dist/install.js ./install.cjs
AIFLARE_ZIP_URL=http://localhost:8123/aiflare.zip node ./install.cjs
```

설치 후 다음을 확인:

- `.claude/skills/` 에 7 개 skill 디렉토리 (각 `SKILL.md` 존재)
- `.claude/hooks/` 에 node 변형 (.js) 6 개 + `_common.js`
- `.claude/mcp-server/dist/index.js` 존재 + `node --check` 통과
- `.git/hooks/pre-push` 존재 + 실행 권한
- `CLAUDE.md` 에 `After git commit, you must always run the context-capture skill.` 포함
- `.gitignore` 에 `aiflare.yml`, `.context-capture/`, `.claude/settings.local.json` 포함
- `.claude/settings.local.json` 에 hook 항목들
- `.mcp.json` 에 `aiflare` MCP 서버 항목

## Idempotency 테스트

같은 디렉토리에서 install.js 를 다시 실행하면:

- `.claude/settings.local.json.bak` / `.mcp.json.bak` 백업이 생성된다
- 기존 비-AIFlare hook/MCP 항목은 보존되고 AIFlare 항목만 머지된다

## GitHub 의존성 제거 검증

```bash
grep -rn "github.com\|githubusercontent" install.js build.mjs
# 결과 없어야 함
```

## 환경변수

| 이름 | 기본값 | 용도 |
| --- | --- | --- |
| `AIFLARE_ZIP_URL` | `https://aiflare.dev/aiflare.zip` | 부트스트래퍼가 페치할 자산 번들 URL. 로컬/프리뷰 검증용 override. |

## 후속 단계 (본 디렉토리 범위 밖)

이 격리 작업이 검증되면 다음 PR 들에서 통합한다.

### 1. Vercel 통합 — 산출물을 `frontend/public/` 로 복사

**Option A (권장)**: `frontend/package.json` 의 `prebuild` 스크립트에서 installer 빌드를 호출하고 산출물 2개를 `public/` 으로 복사.

```jsonc
// frontend/package.json
{
  "scripts": {
    "prebuild": "cd ../installer && npm install && npm run build && cp dist/install.js dist/aiflare.zip ../frontend/public/"
  }
}
```

`frontend/.gitignore` 에 추가:

```
public/install.js
public/aiflare.zip
```

Vercel 빌드 환경에서 자동 실행되므로 별도 인프라 변경 불필요.

**Option B**: `dist/` 자체를 별도 Vercel 프로젝트로 배포해 `cdn.aiflare.dev` 등 별도 도메인에 마운트. 메인 도메인 빌드와 분리된다는 장점, 도메인 분리라는 단점.

### 2. 사용자 노출 명령 갱신

`install-script/README.md` 와 `frontend/src/app/[locale]/docs/getting-started/page.tsx` 의 install 명령에서 GitHub URL 을 `https://aiflare.dev/install.js` 로 교체. 다국어 dictionary (`frontend/src/i18n/dictionaries/{ko,en,zh}.json`) 도 함께 점검.

### 3. 기존 디렉토리 폐기 (선택)

본 작업이 안정화되면 `install-script/` 는 `context-capture/` 와 중복이므로 통째로 삭제 가능. `context-capture/install.{sh,ps1,js}` 도 새 부트스트래퍼로 대체되었으므로 폐기.
