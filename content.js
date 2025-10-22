// Content script - 在页面中运行的脚本
// 这个脚本可以用来与页面进行交互

// 监听来自侧边栏的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageInfo') {
    // 可以在这里添加获取页面信息的逻辑
    sendResponse({
      url: window.location.href,
      title: document.title
    });
  }
  return true;
});

// 当页面加载完成时，清理之前的高亮
window.addEventListener('load', () => {
  document.querySelectorAll('.xpath-helper-highlight').forEach(el => {
    el.classList.remove('xpath-helper-highlight');
  });
});

