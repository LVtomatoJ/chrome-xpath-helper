// Background service worker

// 监听扩展安装或更新事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('XPath Helper 已安装');
  
  // 设置侧边栏行为：点击工具栏图标时自动切换侧边栏开关
  // openPanelOnActionClick: true 会让Chrome自动处理切换逻辑
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .then(() => {
      console.log('侧边栏切换行为已启用');
    })
    .catch((error) => {
      console.error('设置侧边栏行为失败:', error);
    });
});

