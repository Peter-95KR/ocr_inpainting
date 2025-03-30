# Image OCR & Translation Project

## 프로젝트 개요 (Project Overview)
이 프로젝트는 이미지에서 텍스트를 추출하고 번역한 후, 원본 이미지를 인페인팅(inpainting)하여 텍스트를 지우고 번역된 텍스트를 다시 오버레이하는 자동화 도구입니다. Google Vision API, DeepL API, 및 Replicate API를 활용하여 전체 변환 과정을 자동화합니다.

## 주요 기능 (Main Features)
- 이미지에서 텍스트 추출 (OCR with Google Vision API)
- 추출된 텍스트 번역 (Translation with DeepL API)
- 원본 텍스트 영역 제거 (Inpainting with Replicate API)
- 번역된 텍스트 오버레이 (Text overlay with Canvas)
- 배치 처리 지원 (Batch processing)

## 폴더 구조 (Directory Structure)
```
projectimageocr/
├── .env                       # 환경 변수 및 API 키 설정
├── batch-script.sh            # 배치 처리 실행 쉘 스크립트
├── local-batch-ocr-translate.js  # 메인 처리 스크립트
├── package.json               # 프로젝트 의존성
├── package-lock.json          # 의존성 버전 관리
├── images/                    # 이미지 폴더
│   ├── input/                 # 입력 이미지
│   ├── output/                # 처리된 결과 이미지
│   └── temp/                  # 처리 중 임시 파일
└── node_modules/              # 설치된 Node.js 패키지
```

## 설치 방법 (Installation)
1. 필요한 패키지 설치:
```bash
npm install
```

2. `.env` 파일 설정:
```
GOOGLE_VISION_API_KEY=your_google_vision_api_key_here
DEEPL_API_KEY=your_deepl_api_key_here
REPLICATE_API_KEY=your_replicate_api_key_here
```

3. 입력 이미지 배치:
- `images/input` 폴더에 처리할 이미지 파일을 복사합니다.

## 실행 방법 (Usage)
1. 쉘 스크립트로 실행:
```bash
./batch-script.sh
```

2. Node.js로 직접 실행:
```bash
node local-batch-ocr-translate.js
```

## 사용된 API (APIs Used)
- **Google Vision API**: OCR을 통한 이미지 텍스트 추출
- **DeepL API**: 텍스트 번역 (기본 번역 서비스)
- **Google Translate API**: 백업 번역 서비스
- **Replicate API**: AI 인페인팅으로 텍스트 영역 제거

## 환경 설정 (Configuration)
`.env` 파일에서 다음 설정을 변경할 수 있습니다:

| 설정 | 설명 | 기본값 |
|------|------|--------|
| GOOGLE_VISION_API_KEY | Google Vision API 키 | - |
| DEEPL_API_KEY | DeepL API 키 | - |
| REPLICATE_API_KEY | Replicate API 키 | - |
| INPUT_FOLDER | 입력 이미지 폴더 | ./images/input |
| OUTPUT_FOLDER | 출력 이미지 폴더 | ./images/output |
| TEMP_FOLDER | 임시 파일 폴더 | ./images/temp |
| TARGET_LANGUAGE | 번역 대상 언어 | ko |
| MAX_CONCURRENT | 최대 동시 처리 이미지 수 | 5 |

## 의존성 패키지 (Dependencies)
- axios: API 호출
- canvas: 이미지 조작 및 텍스트 오버레이
- dotenv: 환경 변수 관리
- form-data: 멀티파트 폼 데이터 구성
- fs-extra: 확장된 파일 시스템 기능
- glob: 파일 패턴 매칭
- path: 파일 경로 관리
- replicate: Replicate AI API 클라이언트
- sharp: 이미지 처리 및 변환

## 처리 과정 (Process Flow)
1. 이미지에서 OCR을 통해 텍스트 추출 (Google Vision API)
2. 추출된 각 텍스트 항목 번역 (DeepL API)
3. 텍스트 영역에 대한 마스크 이미지 생성
4. 마스크를 사용하여 원본 텍스트 인페인팅 (Replicate API)
5. 인페인팅된 이미지에 번역된 텍스트 오버레이
6. 결과 이미지 저장 및 임시 파일 정리

## 제한사항 (Limitations)
- 이미지에 복잡한 배경이 있는 경우 인페인팅 품질이 저하될 수 있습니다.
- Google Vision API는 일부 특수 글꼴 또는 스타일 텍스트를 정확히 인식하지 못할 수 있습니다.
- 높은 해상도 이미지는 처리 시간이 길어질 수 있습니다.

## 라이센스 (License)
MIT License
