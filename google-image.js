const fs = require('fs');
const path = require('path');

/**
 * 透過 Google 官方 Gemini 圖像模型生成圖片
 * @param {string} prompt 
 * @param {object} config 
 * @returns {Promise<{ imageUrl: string, localPath: string }>}
 */
async function generateImageWithGoogle(prompt, config) {
  const apiKey = config.GEMINI_API_KEY;
  const model = config.GOOGLE_IMAGE_MODEL || 'gemini-3.1-flash-lite-image';
  const outputDir = config.OUTPUT_DIR || './output';

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 未在 .env 中設定');
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseModalities: ['IMAGE']
      }
    })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.error?.message || (await res.text().catch(() => ''));
    if (res.status === 429 && errMsg.includes('limit: 0')) {
      throw new Error(`Google 官方產圖限制: 官方規定圖像生成模型在 Free Tier 的配額為 0，需在 Google AI Studio 綁定 Billing (Pay-as-you-go) 才能呼叫。`);
    }
    throw new Error(`Google API 產圖失敗 (${res.status}): ${errMsg}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  let base64Image = null;
  let mimeType = 'image/jpeg';

  for (const p of parts) {
    if (p.inlineData && p.inlineData.data) {
      base64Image = p.inlineData.data;
      mimeType = p.inlineData.mimeType || 'image/jpeg';
      break;
    }
  }

  if (!base64Image) {
    throw new Error('Google API 未回傳圖片資料 (可能被安全機制過濾)');
  }

  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFilename = `google_img_${timestamp}_${Math.floor(Math.random() * 1000)}.${ext}`;
  const localPath = path.join(outputDir, safeFilename);

  fs.writeFileSync(localPath, Buffer.from(base64Image, 'base64'));

  return {
    imageUrl: `google-api://${model}`,
    localPath
  };
}

module.exports = { generateImageWithGoogle };
