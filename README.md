# 위키 라이브

Wikimedia EventStreams의 위키백과 편집을 Vite, React, TypeScript로 보여주는 대시보드입니다.

- 실시간 편집 말풍선과 최근 1분, 10분, 1시간의 편집 수 및 최다 편집 문서
- 전체, 한국어, 영어, 일본어 필터
- 편집 요약, 문서 크기 변화, 문서 링크와 편집 전후 비교 또는 판본·이력 링크
- 최근 24개 시간대의 인기 문서 제목을 IndexedDB에 보관
- 데모 모드. 예시 데이터는 실제 편집 기록에 저장되지 않습니다.

## 로컬 실행

Node.js 22.12 이상인 22 버전 또는 Node.js 24 버전을 사용합니다.

```bash
npm ci
npm run dev
```

빌드 결과를 확인하려면 `npm run build` 후 `npm run preview`를 실행하세요.

## Vercel 배포

1. 기존 GitHub 저장소를 사용한다면 ZIP 안의 프로젝트 **내용물**을 저장소 최상위에 복사합니다. 기존 `.git` 폴더는 그대로 사용하세요.
2. `package.json`, `index.html`, `src/`가 같은 저장소 최상위에 있는지 확인하고 변경 파일을 커밋해 푸시합니다.
3. Vercel에서 **Add New → Project**를 선택하고 해당 GitHub 저장소를 Import합니다. 기존 Vercel 프로젝트가 있다면 그 프로젝트에 연결된 저장소로 푸시합니다.
4. Framework Preset을 **Vite**, Build Command를 `npm run build`, Output Directory를 `dist`로 설정합니다. 새 프로젝트라면 **Deploy**를 선택합니다.

브라우저에서 Wikimedia EventStreams를 직접 구독하므로 배포에 필요한 서버 파일이나 API 키는 없습니다. 시간대별 기록은 페이지를 열어 둔 동안 받은 편집을 저장하며 브라우저와 사이트 주소별로 분리됩니다. 기존 사이트와 같은 주소에서 업데이트하면 같은 IndexedDB 기록을 읽습니다.
