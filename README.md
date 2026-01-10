# Obsidian MCP 서버 (한국어)

AI 어시스턴트(Claude, GPT 등)가 Obsidian vault와 상호작용할 수 있게 해주는 MCP(Model Context Protocol) 서버입니다.

## 기능

- **노트 생성/읽기/편집/삭제**: Obsidian 노트를 AI로 관리
- **검색**: vault 내 노트 검색 (파일명, 내용, 태그)
- **태그 관리**: 태그 추가, 삭제, 이름 변경
- **폴더 관리**: 디렉토리 생성, 노트 이동
- **멀티 vault 지원**: 여러 vault 동시 연결 (최대 10개)

## 설치

### 필수 요구사항
- Node.js 16 이상
- Bun (빌드용)
- Obsidian에서 한 번 이상 열어본 vault


### 소스에서 빌드

```bash
git clone https://github.com/jkf87/obsidian-mcp-kr.git
cd obsidian-mcp-kr
npm install
npm run build
```

## 사용법

### Claude Desktop 설정
.mcp.json
```
{
  "mcpServers": {
    "obsidian-mcp-kr": {
      "command": "node",
      "args": [
        "/Users/conanssam-m4/obsi-mcp-test/obsidian-mcp-kr/build/main.js", #mcp 서버 위치
        "/Users/conanssam-m4/Library/Mobile Documents/iCloud~md~obsidian/Documents" #옵시디언 볼트 위치
      ]
    }
  }
}

```


## 제공 도구 (Tools)

| 도구명 | 설명 |
|--------|------|
| `list-available-vaults` | 연결된 vault 목록 조회 |
| `create-note` | 새 노트 생성 |
| `read-note` | 노트 내용 읽기 |
| `edit-note` | 노트 내용 편집 (append, prepend, replace) |
| `delete-note` | 노트 삭제 |
| `search-vault` | vault 내 검색 |
| `move-note` | 노트 이동/이름 변경 |
| `create-directory` | 폴더 생성 |
| `add-tags` | 태그 추가 |
| `remove-tags` | 태그 삭제 |
| `rename-tag` | 태그 이름 변경 |

## 사용 예시

### AI에게 요청하는 방법

```
"내 옵시디언 vault에 어떤 노트가 있는지 보여줘"
"2.연구 폴더에서 'RDF' 관련 노트를 검색해줘"
"새 노트를 만들어줘: 제목은 '오늘 할 일', 내용은 체크리스트로"
"이 노트에 #todo 태그를 추가해줘"
```

## 라이브러리로 사용

다른 프로젝트에서 import하여 사용할 수 있습니다:

```typescript
import {
  ObsidianServer,
  createCreateNoteTool,
  createSearchVaultTool
} from "obsidian-mcp-kr";

// 서버 인스턴스 생성
const server = new ObsidianServer([
  { name: "my-vault", path: "/path/to/vault" }
]);

// 개별 도구 사용
const vaults = new Map([["my-vault", "/path/to/vault"]]);
const createNote = createCreateNoteTool(vaults);
const searchVault = createSearchVaultTool(vaults);
```

### Export 구조

- `obsidian-mcp-kr` - 모든 모듈 (서버, 도구, 유틸리티)
- `obsidian-mcp-kr/server` - ObsidianServer 클래스만
- `obsidian-mcp-kr/types` - 타입 정의
- `obsidian-mcp-kr/tools/*` - 개별 도구
- `obsidian-mcp-kr/utils/*` - 유틸리티 함수

## 보안 사항

- 로컬 파일시스템만 지원 (네트워크 드라이브 불가)
- 시스템 디렉토리 접근 차단
- 숨김 폴더 접근 제한 (.obsidian 제외)
- Rate limiting 적용

## 라이선스

MIT License

## 기여

이슈나 PR은 언제든 환영합니다!

---

원본 프로젝트: [StevenStavrakis/obsidian-mcp](https://github.com/StevenStavrakis/obsidian-mcp)
