const fs = require('fs');
const path = require('path');

/**
 * Call Kie AI to generate an image from prompt
 * @param {string} prompt 
 * @param {object} config 
 * @returns {Promise<{ imageUrl: string, localPath: string }>}
 */
async function generateImage(prompt, config) {
  const apiKey = config.KIE_API_KEY;
  const baseUrl = (config.KIE_BASE_URL || 'https://api.kie.ai').replace(/\/+$/, '');
  const model = config.KIE_MODEL || 'nano-banana-2-lite';
  const aspectRatio = config.IMAGE_ASPECT_RATIO || '1:1';
  const outputDir = config.OUTPUT_DIR || './output';

  if (!apiKey || apiKey === 'your_kie_api_key_here') {
    throw new Error('KIE_API_KEY 未設定或未填寫正確');
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Step 1: Create Task
  const createRes = await fetch(`${baseUrl}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      input: {
        prompt: prompt,
        aspect_ratio: aspectRatio
      }
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Kie AI 建立任務失敗 (${createRes.status}): ${errText}`);
  }

  const createData = await createRes.json();
  if (createData.code !== 200 || !createData.data || !createData.data.taskId) {
    throw new Error(`Kie AI 建立任務回應異常: ${createData.msg || JSON.stringify(createData)}`);
  }

  const taskId = createData.data.taskId;
  console.log(`  [Kie AI] 任務已建立 (TaskId: ${taskId})，輪詢完成狀態中...`);

  // Step 2: Poll status
  const pollInterval = parseInt(config.KIE_POLL_INTERVAL_SECONDS || '5', 10) * 1000;
  const maxWaitMs = parseInt(config.KIE_TIMEOUT_SECONDS || '900', 10) * 1000;
  const startTime = Date.now();
  let imageUrl = null;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollInterval));

    const pollRes = await fetch(`${baseUrl}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!pollRes.ok) {
      continue;
    }

    const pollData = await pollRes.json();
    const taskInfo = pollData.data || {};
    const state = (taskInfo.state || '').toLowerCase();

    if (state === 'success' || taskInfo.successFlag === 1) {
      // Extract result URL
      if (taskInfo.response && Array.isArray(taskInfo.response.resultUrls) && taskInfo.response.resultUrls.length > 0) {
        imageUrl = taskInfo.response.resultUrls[0];
      } else if (taskInfo.resultJson) {
        try {
          const parsed = JSON.parse(taskInfo.resultJson);
          imageUrl = parsed.resultUrls?.[0] || parsed.imageUrl || parsed.url;
        } catch (e) {
          imageUrl = taskInfo.resultJson;
        }
      } else if (taskInfo.resultUrl) {
        imageUrl = taskInfo.resultUrl;
      }
      break;
    } else if (state === 'fail' || state === 'failed' || state === 'error') {
      throw new Error(`Kie AI 任務失敗: ${taskInfo.failMsg || '未知錯誤'}`);
    }
  }

  if (!imageUrl) {
    throw new Error(`Kie AI 產圖逾時 (${maxWaitMs / 1000}秒) 或未回傳有效圖片網址`);
  }

  console.log(`  [Kie AI] 產圖成功！下載圖片中: ${imageUrl}`);

  // Step 3: Download image to local output directory
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`下載圖片失敗 HTTP ${imgRes.status}`);
  }

  const arrayBuffer = await imgRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFilename = `img_${timestamp}_${Math.floor(Math.random() * 1000)}.jpg`;
  const localPath = path.join(outputDir, safeFilename);

  fs.writeFileSync(localPath, buffer);

  return {
    imageUrl,
    localPath
  };
}

module.exports = { generateImage };
