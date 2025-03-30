#!/bin/bash
# 이미지 일괄 OCR, 인페인팅, 번역 처리 실행 스크립트

# 필요한 폴더 생성
mkdir -p ./images/input
mkdir -p ./images/output
mkdir -p ./images/temp

# 스크립트 실행
echo "이미지 처리 시작..."
node local-batch-ocr-translate.js

# 처리 완료 후 임시 파일 정리
echo "임시 파일 정리 중..."
rm -rf ./images/temp/*

echo "처리가 완료되었습니다. 결과는 ./images/output 폴더에 있습니다."
