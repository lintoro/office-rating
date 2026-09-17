require('dotenv').config();
const { fetchSheetData, updateRowData, ensureHeader } = require('./sheets');
const { generateImage } = require('./kie');

async function processBatch() {
  const config = process.env;
  
  try {
    const { sheets, colIndex, pendingRows } = await fetchSheetData(config);
    config._colIndex = colIndex;

    if (pendingRows.length === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] 目前沒有待處理的提示詞 (TODO / QUEUED / RETRY)。`);
      return;
    }

    const batchLimit = parseInt(config.BATCH_LIMIT || '5', 10);
    const rowsToProcess = pendingRows.slice(0, batchLimit);

    console.log(`\n🚀 發現 ${pendingRows.length} 筆待處理項目，本次處理前 ${rowsToProcess.length} 筆...`);

    for (const item of rowsToProcess) {
      console.log(`\n[第 ${item.rowIndex} 列] 開始處理提示詞: "${item.prompt}"`);

      // Mark as PROCESSING
      await updateRowData(sheets, config, item.rowIndex, {
        status: 'PROCESSING',
        error: ''
      });

      try {
        // Generate image via Kie
        const { imageUrl, localPath } = await generateImage(item.prompt, config);

        // Update sheet on success
        await updateRowData(sheets, config, item.rowIndex, {
          status: 'DONE',
          image_url: imageUrl,
          image_path: localPath,
          model: config.KIE_MODEL || 'nano-banana-2-lite',
          generated_at: new Date().toISOString(),
          error: ''
        });

        console.log(`✅ [第 ${item.rowIndex} 列] 產圖成功！圖片已儲存至: ${localPath}`);
      } catch (err) {
        console.error(`❌ [第 ${item.rowIndex} 列] 失敗: ${err.message}`);

        // Update sheet on error
        await updateRowData(sheets, config, item.rowIndex, {
          status: 'ERROR',
          error: err.message
        });
      }
    }
  } catch (err) {
    console.error(`⚠️ 執行錯誤: ${err.message}`);
  }
}

async function main() {
  const isWatch = process.argv.includes('--watch');
  const pollInterval = parseInt(process.env.POLL_INTERVAL_SECONDS || '60', 10) * 1000;

  console.log('========================================');
  console.log(' Google Sheet 提示詞自動產圖系統 (Kie AI)');
  console.log('========================================');

  if (isWatch) {
    console.log(`👀 模式: 常駐監控 (每 ${pollInterval / 1000} 秒檢查一次)...`);
    await processBatch();
    setInterval(processBatch, pollInterval);
  } else {
    console.log('⚡ 模式: 單次執行 (--once)...');
    await processBatch();
    console.log('\n單次執行完成。');
  }
}

main().catch(console.error);
