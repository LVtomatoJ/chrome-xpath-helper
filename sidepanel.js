// 获取DOM元素
const xpathInput = document.getElementById('xpath-input');
const searchBtn = document.getElementById('search-btn');
const resultsContainer = document.getElementById('results-container');
const resultCount = document.getElementById('result-count');
const copyAllBtn = document.getElementById('copy-all-btn');
const clearBtn = document.getElementById('clear-btn');
const exampleBtns = document.querySelectorAll('.example-btn');
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

let currentResults = [];
let currentXPath = '';

// 搜索按钮点击事件
searchBtn.addEventListener('click', executeXPath);

// 回车键触发搜索 (Ctrl/Cmd + Enter)
xpathInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    executeXPath();
  }
});

// 复制全部按钮点击事件
copyAllBtn.addEventListener('click', copyAllResults);

// 清除按钮点击事件
clearBtn.addEventListener('click', clearResults);

// 快速示例按钮点击事件
exampleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const xpath = btn.dataset.xpath;
    xpathInput.value = xpath;
    executeXPath();
  });
});

// 清空历史记录按钮
clearHistoryBtn.addEventListener('click', () => {
  if (confirm('确定要清空所有历史记录吗？')) {
    localStorage.removeItem('xpathHistory');
    loadHistory();
    showToast('🗑️ 历史记录已清空');
  }
});

// 执行XPath查询
async function executeXPath() {
  const xpath = xpathInput.value.trim();
  
  if (!xpath) {
    showError('请输入XPath表达式');
    return;
  }

  currentXPath = xpath;
  showLoading();
  
  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showError('无法获取当前标签页，请确保有打开的网页');
      return;
    }

    // 在当前页面执行XPath查询
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: evaluateXPath,
      args: [xpath]
    });

    const xpathResults = results[0].result;
    
    if (xpathResults.error) {
      showError(xpathResults.error);
      return;
    }

    currentResults = xpathResults.results;
    displayResults(currentResults);
    
    // 保存查询历史到localStorage
    saveToHistory(xpath);
    
  } catch (error) {
    showError('执行出错: ' + error.message);
    console.error(error);
  }
}

// 在页面中执行XPath查询的函数
function evaluateXPath(xpath) {
  try {
    const results = [];
    const xpathResult = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < xpathResult.snapshotLength; i++) {
      const node = xpathResult.snapshotItem(i);
      let content = '';
      let tagName = '';
      let nodeTypeName = '';
      
      if (node.nodeType === Node.ELEMENT_NODE) {
        tagName = node.tagName.toLowerCase();
        nodeTypeName = 'Element';
        // 优先显示文本内容，如果没有则显示outerHTML
        const textContent = node.textContent.trim();
        if (textContent && textContent.length < 500) {
          content = textContent;
        } else {
          content = node.outerHTML;
        }
        if (content.length > 1000) {
          content = content.substring(0, 1000) + '...';
        }
      } else if (node.nodeType === Node.TEXT_NODE) {
        tagName = 'text()';
        nodeTypeName = 'Text';
        content = node.textContent.trim();
      } else if (node.nodeType === Node.ATTRIBUTE_NODE) {
        tagName = '@' + node.name;
        nodeTypeName = 'Attribute';
        content = node.value;
      } else {
        tagName = node.nodeName;
        nodeTypeName = 'Node';
        content = node.textContent || node.nodeValue || '';
      }

      results.push({
        index: i,
        tagName: tagName,
        content: content,
        nodeType: node.nodeType,
        nodeTypeName: nodeTypeName
      });
    }

    return { results, error: null };
  } catch (error) {
    return { results: [], error: error.message };
  }
}

// 显示结果
function displayResults(results) {
  resultCount.textContent = `匹配结果：${results.length}`;
  
  if (results.length === 0) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">😕</div>
        <p>未找到匹配的元素</p>
        <p class="empty-hint">请检查XPath表达式是否正确</p>
      </div>
    `;
    copyAllBtn.disabled = true;
    return;
  }

  copyAllBtn.disabled = false;
  
  resultsContainer.innerHTML = results.map((result, index) => `
    <div class="result-item" data-index="${index}">
      <div class="result-item-header">
        <span class="result-index">
          <span style="opacity: 0.7">#${index + 1}</span>
        </span>
        <div class="result-actions">
          <button class="btn-copy" data-index="${index}" title="复制此结果">📋 复制</button>
          <button class="btn-highlight" data-index="${index}" title="在页面中高亮">🎯 高亮</button>
        </div>
      </div>
      <div class="result-content">${escapeHtml(result.content)}</div>
      <div class="result-meta">
        <span class="result-tag">&lt;${result.tagName}&gt;</span>
        <span class="result-tag type">${result.nodeTypeName}</span>
      </div>
    </div>
  `).join('');

  // 为每个复制按钮添加事件监听
  resultsContainer.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('.btn-copy').dataset.index);
      copyToClipboard(results[index].content);
      showToast('✓ 已复制到剪贴板');
    });
  });

  // 为每个高亮按钮添加事件监听
  resultsContainer.querySelectorAll('.btn-highlight').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.closest('.btn-highlight').dataset.index);
      await highlightElement(index);
    });
  });
}

// 高亮页面中的元素
async function highlightElement(index) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const xpath = currentXPath;
    
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: highlightElementOnPage,
      args: [xpath, index]
    });
    
    showToast('🎯 元素已高亮显示');
  } catch (error) {
    showError('高亮元素失败: ' + error.message);
    console.error('高亮元素失败:', error);
  }
}

// 在页面上高亮元素
function highlightElementOnPage(xpath, index) {
  // 移除之前的高亮
  document.querySelectorAll('.xpath-helper-highlight').forEach(el => {
    el.classList.remove('xpath-helper-highlight');
  });

  // 添加样式（如果不存在）
  if (!document.getElementById('xpath-helper-style')) {
    const style = document.createElement('style');
    style.id = 'xpath-helper-style';
    style.textContent = `
      .xpath-helper-highlight {
        outline: 4px solid #ff6b6b !important;
        outline-offset: 2px !important;
        background-color: rgba(255, 107, 107, 0.15) !important;
        animation: xpath-pulse 1s ease-in-out 3;
        position: relative !important;
        z-index: 999999 !important;
      }
      @keyframes xpath-pulse {
        0%, 100% { 
          outline-color: #ff6b6b;
          background-color: rgba(255, 107, 107, 0.15);
        }
        50% { 
          outline-color: #ffd93d;
          background-color: rgba(255, 217, 61, 0.25);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // 获取并高亮指定元素
  try {
    const xpathResult = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    const node = xpathResult.snapshotItem(index);
    if (node) {
      let elementToHighlight = node;
      
      // 如果是文本节点或属性节点，高亮其父元素
      if (node.nodeType === Node.TEXT_NODE) {
        elementToHighlight = node.parentElement;
      } else if (node.nodeType === Node.ATTRIBUTE_NODE) {
        elementToHighlight = node.ownerElement;
      }
      
      if (elementToHighlight && elementToHighlight.classList) {
        elementToHighlight.classList.add('xpath-helper-highlight');
        elementToHighlight.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'center'
        });
        
        // 5秒后移除高亮
        setTimeout(() => {
          elementToHighlight.classList.remove('xpath-helper-highlight');
        }, 5000);
      }
    }
  } catch (error) {
    console.error('高亮失败:', error);
  }
}

// 复制到剪贴板
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    console.log('复制成功');
  }).catch(err => {
    console.error('复制失败:', err);
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  });
}

// 复制全部结果
function copyAllResults() {
  if (currentResults.length === 0) return;
  
  const allText = currentResults
    .map((result, index) => `[${index + 1}] <${result.tagName}>\n${result.content}`)
    .join('\n\n' + '='.repeat(50) + '\n\n');
  
  copyToClipboard(allText);
  showToast('✓ 已复制全部结果 (' + currentResults.length + ' 项)');
}

// 清除结果
function clearResults() {
  currentResults = [];
  currentXPath = '';
  xpathInput.value = '';
  resultsContainer.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📝</div>
      <p>输入XPath表达式开始查询</p>
      <p class="empty-hint">或点击上方的快速示例</p>
    </div>
  `;
  resultCount.textContent = '匹配结果：0';
  copyAllBtn.disabled = true;
}

// 显示Toast提示
function showToast(message) {
  // 移除已存在的toast
  const existingToast = document.querySelector('.success-toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = 'success-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// 显示加载状态
function showLoading() {
  resultsContainer.innerHTML = `
    <div class="loading">
      <div class="loading-spinner"></div>
      <div class="loading-text">正在查询...</div>
    </div>
  `;
  copyAllBtn.disabled = true;
}

// 显示错误信息
function showError(message) {
  resultsContainer.innerHTML = `
    <div class="error-message">
      ⚠️ <strong>错误：</strong><br>${escapeHtml(message)}
    </div>
    <div class="empty-state">
      <div class="empty-icon">💡</div>
      <p>XPath语法提示：</p>
      <p class="empty-hint">
        // = 选择所有后代<br>
        / = 选择直接子元素<br>
        @ = 选择属性<br>
        [] = 条件过滤
      </p>
    </div>
  `;
  resultCount.textContent = '匹配结果：0';
  copyAllBtn.disabled = true;
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 保存查询历史
function saveToHistory(xpath) {
  try {
    let history = JSON.parse(localStorage.getItem('xpathHistory') || '[]');
    // 避免重复
    history = history.filter(item => item !== xpath);
    history.unshift(xpath);
    // 只保留最近20条
    history = history.slice(0, 20);
    localStorage.setItem('xpathHistory', JSON.stringify(history));
    // 更新历史记录显示
    loadHistory();
  } catch (error) {
    console.error('保存历史记录失败:', error);
  }
}

// 加载历史记录
function loadHistory() {
  try {
    const history = JSON.parse(localStorage.getItem('xpathHistory') || '[]');
    
    if (history.length === 0) {
      historySection.style.display = 'none';
      return;
    }
    
    historySection.style.display = 'block';
    historyList.innerHTML = history.map((xpath, index) => {
      const shortXpath = xpath.length > 60 ? xpath.substring(0, 60) + '...' : xpath;
      return `<div class="history-item" data-xpath="${escapeHtml(xpath)}" title="${escapeHtml(xpath)}">${escapeHtml(shortXpath)}</div>`;
    }).join('');
    
    // 为历史记录项添加点击事件
    historyList.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const xpath = item.dataset.xpath;
        xpathInput.value = xpath;
        executeXPath();
      });
    });
  } catch (error) {
    console.error('加载历史记录失败:', error);
    historySection.style.display = 'none';
  }
}

// 页面加载时的初始化
document.addEventListener('DOMContentLoaded', () => {
  // 聚焦输入框
  xpathInput.focus();
  
  // 加载历史记录
  loadHistory();
  
  console.log('XPath Helper 侧边栏已就绪');
});

