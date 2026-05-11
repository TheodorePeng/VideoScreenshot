// 测试时间戳文件名格式
function testTimestampFilename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  // 格式：screenshot_YYYY-MM-DD_HH-MM-SS
  const fileName = `screenshot_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.png`;
  console.log('测试生成的文件名:', fileName);
  
  return fileName;
}

// 执行测试
testTimestampFilename(); 