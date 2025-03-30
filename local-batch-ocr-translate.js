// 로컬 이미지 일괄 OCR, 인페인팅, 번역 스크립트
// 필요한 패키지:
// npm install dotenv axios fs-extra path canvas sharp replicate glob

require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const sharp = require('sharp');
const Replicate = require('replicate');
const glob = require('glob');
const FormData = require('form-data');

// API 키 설정
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;

// 경로 설정
const INPUT_FOLDER = process.env.INPUT_FOLDER || './images/input';
const OUTPUT_FOLDER = process.env.OUTPUT_FOLDER || './images/output';
const TEMP_FOLDER = process.env.TEMP_FOLDER || './images/temp';

// 설정 옵션
const TARGET_LANGUAGE = process.env.TARGET_LANGUAGE || 'ko';
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '5');
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];

// Replicate 클라이언트 초기화
const replicate = new Replicate({
  auth: REPLICATE_API_KEY,
});

// 필요한 폴더 생성
fs.ensureDirSync(INPUT_FOLDER);
fs.ensureDirSync(OUTPUT_FOLDER);
fs.ensureDirSync(TEMP_FOLDER);

/**
 * Google Vision API를 사용한 OCR
 */
async function recognizeTextWithGoogleVision(imagePath) {
  console.log(`Google Vision API로 텍스트 인식 중: ${imagePath}`);
  
  try {
    // 이미지를 base64로 인코딩
    const imageBuffer = await fs.readFile(imagePath);
    const imageBase64 = imageBuffer.toString('base64');
    
    // API 요청 준비
    const requestBody = {
      requests: [
        {
          image: {
            content: imageBase64
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 100
            }
          ]
        }
      ]
    };
    
    // API 호출
    const response = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      requestBody
    );
    
    // 결과 파싱
    const textAnnotations = response.data.responses[0].textAnnotations || [];
    
    if (textAnnotations.length === 0) {
      return [];
    }

    // 첫 번째 항목은 전체 텍스트이므로 건너뜀
    const words = textAnnotations.slice(1).map((annotation, index) => {
      const vertices = annotation.boundingPoly.vertices;
      
      // 바운딩 박스 계산
      const x0 = Math.min(...vertices.map(v => v.x || 0));
      const y0 = Math.min(...vertices.map(v => v.y || 0));
      const x1 = Math.max(...vertices.map(v => v.x || 0));
      const y1 = Math.max(...vertices.map(v => v.y || 0));
      
      // 기본 스타일 설정
      const styles = {
        fontFamily: 'Arial, sans-serif',
        fontSize: Math.max(16, Math.min(32, Math.floor((y1 - y0) * 0.7))),
        fontWeight: 'normal',
        fontStyle: 'normal',
        textColor: '#000000',
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        padding: 5,
        borderRadius: 0
      };
      
      return {
        id: `text_${index}`,
        text: annotation.description,
        confidence: 0.9, // Google Vision은 신뢰도를 별도로 제공하지 않음
        bbox: { x0, y0, x1, y1 },
        width: x1 - x0,
        height: y1 - y0,
        styles
      };
    });
    
    return words;
  } catch (error) {
    console.error('Google Vision API 오류:', error.message);
    throw new Error(`Google Vision OCR 실패: ${error.message}`);
  }
}

/**
 * DeepL API를 사용한 번역
 */
async function translateWithDeepL(text, sourceLang = 'auto', targetLang = TARGET_LANGUAGE) {
  console.log(`DeepL로 번역 중: "${text}" (${sourceLang} -> ${targetLang})`);
  
  try {
    // DeepL API 언어 코드 변환 (한국어는 'ko'가 아닌 'KO'로 사용)
    const deeplTargetLang = targetLang.toUpperCase();
    
    // API 요청 준비
    const formData = new FormData();
    formData.append('text', text);
    formData.append('target_lang', deeplTargetLang);
    
    // 소스 언어가 'auto'가 아닌 경우에만 소스 언어 파라미터 추가
    if (sourceLang !== 'auto') {
      formData.append('source_lang', sourceLang.toUpperCase());
    }
    
    // API 호출
    const response = await axios.post(
      'https://api-free.deepl.com/v2/translate',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`
        }
      }
    );
    
    return response.data.translations[0].text;
  } catch (error) {
    console.error('DeepL API 오류:', error.message);
    // 오류 발생 시 Google 번역으로 폴백
    return await translateWithGoogle(text, sourceLang, targetLang);
  }
}

/**
 * Google Translate API를 사용한 번역 (백업)
 */
async function translateWithGoogle(text, sourceLang = 'auto', targetLang = TARGET_LANGUAGE) {
  console.log(`Google Translate로 번역 중: "${text}" (${sourceLang} -> ${targetLang})`);
  
  try {
    // API 요청 준비
    const response = await axios.post(
      `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_VISION_API_KEY}`,
      {
        q: text,
        source: sourceLang === 'auto' ? undefined : sourceLang,
        target: targetLang,
        format: 'text'
      }
    );
    
    return response.data.data.translations[0].translatedText;
  } catch (error) {
    console.error('Google Translate API 오류:', error.message);
    // 에러 발생 시 원본 텍스트 반환
    return `[번역실패: ${text}]`;
  }
}

/**
 * 텍스트 영역에 대한 마스크 생성
 */
async function createMaskForTextRegions(imagePath, recognizedWords, padding = 5) {
  try {
    const image = await loadImage(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // 배경을 검은색으로 초기화
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 텍스트 영역을 흰색으로 표시 (패딩 적용)
    ctx.fillStyle = 'white';
    for (const word of recognizedWords) {
      const { bbox } = word;
      const { x0, y0, x1, y1 } = bbox;
      
      // 패딩 적용
      ctx.fillRect(
        Math.max(0, x0 - padding),
        Math.max(0, y0 - padding),
        Math.min(canvas.width, x1 - x0 + padding * 2),
        Math.min(canvas.height, y1 - y0 + padding * 2)
      );
    }
    
    // 마스크 이미지 저장
    const maskBuffer = canvas.toBuffer('image/png');
    const maskPath = path.join(
      TEMP_FOLDER,
      `mask_${path.basename(imagePath)}`
    );
    
    await fs.writeFile(maskPath, maskBuffer);
    return maskPath;
  } catch (error) {
    console.error('마스크 생성 오류:', error.message);
    throw new Error(`마스크 생성 실패: ${error.message}`);
  }
}

/**
 * Replicate API를 사용하여 텍스트 영역 인페인팅
 */
async function inpaintTextRegions(imagePath, maskPath) {
  console.log('텍스트 영역 인페인팅 중...');
  
  try {
    // 이미지와 마스크를 base64로 인코딩
    const imageBuffer = await fs.readFile(imagePath);
    const maskBuffer = await fs.readFile(maskPath);
    
    // 임시 파일 생성
    const inpaintedPath = path.join(
      TEMP_FOLDER,
      `inpainted_${path.basename(imagePath)}`
    );
    
    // Replicate API 호출
    const output = await replicate.run(
      "stability-ai/sdxl-inpainting:c8afe2ef4bb5b92cd89e807c3388cab423f9282b5802630eb1aa02b1d78e8b3a",
      {
        input: {
          image: imageBuffer.toString('base64'),
          mask: maskBuffer.toString('base64'),
          prompt: "Restore this image naturally without any text",
          negative_prompt: "text, letters, watermarks, low quality, blurry",
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 25
        }
      }
    );
    
    // 결과 이미지 다운로드 및 저장
    const response = await axios.get(output[0], { responseType: 'arraybuffer' });
    await fs.writeFile(inpaintedPath, response.data);
    
    return inpaintedPath;
  } catch (error) {
    console.error('인페인팅 오류:', error);
    throw new Error(`인페인팅 실패: ${error.message}`);
  }
}

/**
 * 텍스트 오버레이
 */
async function overlayText(imagePath, textItems, outputPath) {
  try {
    console.log('텍스트 오버레이 중...');
    
    const image = await loadImage(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // 배경 이미지 그리기
    ctx.drawImage(image, 0, 0);
    
    // 각 텍스트 아이템 그리기
    for (const item of textItems) {
      const { bbox, text, translatedText, styles } = item;
      const displayText = translatedText || text;
      
      if (!displayText || displayText.trim() === '') continue;
      
      const { x0, y0, x1, y1 } = bbox;
      const width = x1 - x0;
      const height = y1 - y0;
      
      // 텍스트 배경 그리기
      if (styles.backgroundColor) {
        ctx.fillStyle = styles.backgroundColor;
        
        if (styles.borderRadius > 0) {
          // 둥근 모서리 배경
          const radius = Math.min(styles.borderRadius, width / 2, height / 2);
          ctx.beginPath();
          ctx.moveTo(x0 + radius, y0);
          ctx.arcTo(x1, y0, x1, y1, radius);
          ctx.arcTo(x1, y1, x0, y1, radius);
          ctx.arcTo(x0, y1, x0, y0, radius);
          ctx.arcTo(x0, y0, x1, y0, radius);
          ctx.closePath();
          ctx.fill();
        } else {
          // 일반 사각형 배경
          ctx.fillRect(x0, y0, width, height);
        }
      }
      
      // 텍스트 스타일 설정
      ctx.fillStyle = styles.textColor || '#000000';
      ctx.textBaseline = 'middle';
      ctx.textAlign = styles.textAlign || 'center';
      
      // 폰트 설정
      const fontStyle = styles.fontStyle || 'normal';
      const fontWeight = styles.fontWeight || 'normal';
      const fontSize = styles.fontSize || 24;
      const fontFamily = styles.fontFamily || 'Arial, sans-serif';
      ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
      
      // 텍스트 위치 계산
      const textX = styles.textAlign === 'left' ? x0 + (styles.padding || 5) : 
                    styles.textAlign === 'right' ? x1 - (styles.padding || 5) : 
                    (x0 + x1) / 2;
      const textY = (y0 + y1) / 2;
      
      // 텍스트가 너무 길면 자동 줄바꿈
      wrapText(ctx, displayText, textX, textY, width - ((styles.padding || 5) * 2), fontSize * 1.2);
    }
    
    // 결과 이미지 저장
    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(outputPath, buffer);
    
    return outputPath;
  } catch (error) {
    console.error('텍스트 오버레이 오류:', error.message);
    throw new Error(`텍스트 오버레이 실패: ${error.message}`);
  }
}

/**
 * 텍스트 자동 줄바꿈 헬퍼 함수
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  // 줄바꿈 지원
  const lines = text.split('\n');
  const allLines = [];
  
  // 각 줄에 대해 추가 줄바꿈 처리
  for (const line of lines) {
    const words = line.split(' ');
    
    if (words.length === 0) {
      allLines.push('');
      continue;
    }
    
    let currentLine = words[0];
    
    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth) {
        allLines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    
    allLines.push(currentLine);
  }
  
  // 중앙에 텍스트 정렬
  const totalHeight = allLines.length * lineHeight;
  const startY = y - (totalHeight / 2) + (lineHeight / 2);
  
  // 모든 줄 그리기
  for (let i = 0; i < allLines.length; i++) {
    ctx.fillText(allLines[i], x, startY + i * lineHeight);
  }
}

/**
 * 이미지 처리 파이프라인
 */
async function processImage(imagePath) {
  try {
    const fileName = path.basename(imagePath);
    const outputPath = path.join(OUTPUT_FOLDER, fileName);
    
    console.log(`이미지 처리 시작: ${imagePath}`);
    
    // 1. OCR로 텍스트 인식
    const recognizedWords = await recognizeTextWithGoogleVision(imagePath);
    console.log(`인식된 텍스트 수: ${recognizedWords.length}`);
    
    if (recognizedWords.length === 0) {
      console.log(`텍스트가 발견되지 않았습니다. 원본 이미지 복사: ${imagePath}`);
      await fs.copy(imagePath, outputPath);
      return {
        success: true,
        resultPath: outputPath,
        imageUrl: fileName,
        message: "텍스트가 발견되지 않았습니다."
      };
    }
    
    // 2. 인식된 텍스트 번역
    for (const word of recognizedWords) {
      word.translatedText = await translateWithDeepL(word.text);
      console.log(`"${word.text}" -> "${word.translatedText}"`);
    }
    
    // 3. 텍스트 영역 마스크 생성
    const maskPath = await createMaskForTextRegions(imagePath, recognizedWords);
    console.log(`마스크 생성 완료: ${maskPath}`);
    
    // 4. 텍스트 영역 인페인팅
    const inpaintedImagePath = await inpaintTextRegions(imagePath, maskPath);
    console.log(`인페인팅 완료: ${inpaintedImagePath}`);
    
    // 5. 번역된 텍스트 오버레이
    await overlayText(inpaintedImagePath, recognizedWords, outputPath);
    console.log(`텍스트 오버레이 완료: ${outputPath}`);
    
    // 6. 임시 파일 정리
    await cleanupTempFiles([maskPath, inpaintedImagePath]);
    
    return {
      success: true,
      resultPath: outputPath,
      imageUrl: fileName,
      words: recognizedWords
    };
  } catch (error) {
    console.error(`이미지 처리 오류 (${imagePath}):`, error);
    return {
      success: false,
      imagePath,
      error: error.message
    };
  }
}

/**
 * 임시 파일 정리
 */
async function cleanupTempFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        console.log(`임시 파일 삭제: ${filePath}`);
      }
    } catch (error) {
      console.warn(`임시 파일 삭제 실패: ${filePath}`, error.message);
    }
  }
}

/**
 * 배치 처리를 위한 이미지 목록 가져오기
 */
function getImageFiles() {
  const imageFiles = [];
  
  SUPPORTED_FORMATS.forEach(format => {
    const files = glob.sync(path.join(INPUT_FOLDER, `*${format}`));
    imageFiles.push(...files);
  });
  
  return imageFiles;
}

/**
 * 이미지 배치 처리
 */
async function processBatch() {
  // 이미지 목록 가져오기
  const imageFiles = getImageFiles();
  console.log(`처리할 이미지 수: ${imageFiles.length}`);
  
  if (imageFiles.length === 0) {
    console.log(`입력 폴더에 이미지가 없습니다: ${INPUT_FOLDER}`);
    return;
  }
  
  // 결과 저장용 배열
  const results = {
    total: imageFiles.length,
    successful: 0,
    failed: 0,
    details: []
  };
  
  // 동시 실행 제한을 적용한 처리
  const chunks = [];
  for (let i = 0; i < imageFiles.length; i += MAX_CONCURRENT) {
    chunks.push(imageFiles.slice(i, i + MAX_CONCURRENT));
  }
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`처리 중인 배치: ${i + 1}/${chunks.length} (${chunk.length}개 이미지)`);
    
    // 현재 배치의 이미지를 병렬 처리
    const promises = chunk.map(imagePath => processImage(imagePath));
    const chunkResults = await Promise.all(promises);
    
    // 결과 집계
    chunkResults.forEach(result => {
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
      }
      results.details.push(result);
    });
  }
  
  // 최종 결과 출력
  console.log('\n===== 처리 결과 =====');
  console.log(`총 이미지: ${results.total}`);
  console.log(`성공: ${results.successful}`);
  console.log(`실패: ${results.failed}`);
  console.log(`처리된 이미지 위치: ${OUTPUT_FOLDER}`);
  
  // 실패한 이미지 목록
  if (results.failed > 0) {
    console.log('\n실패한 이미지:');
    results.details
      .filter(r => !r.success)
      .forEach(r => console.log(`- ${path.basename(r.imagePath)}: ${r.error}`));
  }
  
  // 결과 JSON 파일로 저장
  const resultFile = path.join(OUTPUT_FOLDER, 'processing_results.json');
  await fs.writeJson(resultFile, results, { spaces: 2 });
  console.log(`상세 결과가 저장되었습니다: ${resultFile}`);
}

// 배치 처리 실행
if (require.main === module) {
  console.log('이미지 일괄 OCR, 인페인팅, 번역 처리 시작...');
  console.log(`입력 폴더: ${INPUT_FOLDER}`);
  console.log(`출력 폴더: ${OUTPUT_FOLDER}`);
  console.log(`대상 언어: ${TARGET_LANGUAGE}`);
  console.log(`최대 동시 처리: ${MAX_CONCURRENT}개 이미지`);
  
  processBatch()
    .then(() => console.log('처리 완료!'))
    .catch(err => console.error('오류 발생:', err));
}

module.exports = {
  recognizeTextWithGoogleVision,
  translateWithDeepL,
  createMaskForTextRegions,
  inpaintTextRegions,
  overlayText,
  processImage,
  processBatch
};
