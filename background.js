// Background script for handling extension events

// Listen for installation
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    // Open options page on first install
    chrome.runtime.openOptionsPage();
    
    // Initialize storage with default values
    chrome.storage.sync.set({
      defaultFont: 'Arial, sans-serif',
      defaultFontSize: '14px',
      autoSave: true,
      showNotifications: true,
      backendUrl: 'http://localhost:8000'
    });
    
    chrome.storage.local.set({
      meetingRecords: []
    });
  }
});

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'showNotification') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'SignBridge',
      message: request.message,
      priority: 1
    });
  }
  
  // Handle content script initialization
  if (request.action === 'contentScriptInitialized') {
    console.log('Content script initialized in tab:', sender.tab.id, 'URL:', request.url);
    sendResponse({status: 'acknowledged'});
    return true;
  }
  
  // Handle requests to inject content script
  if (request.action === 'injectContentScript') {
    chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      files: ['content/content.js']
    }).then(() => {
      console.log('Content script injected into tab:', request.tabId);
      sendResponse({status: 'success'});
    }).catch(error => {
      console.error('Failed to inject content script:', error);
      sendResponse({status: 'error', message: error.message});
    });
    return true; // Keep message channel open for async response
  }
  
  return true;
});

// Listen for tab updates to potentially inject content script
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  // Check if this is a supported video platform
  const supportedPatterns = [
    /^https:\/\/meet\.google\.com\/.+/,
    /^https:\/\/zoom\.us\/.+/,
    /^https:\/\/teams\.microsoft\.com\/.+/
  ];
  
  const isSupported = supportedPatterns.some(pattern => pattern.test(tab.url));
  
  if (isSupported && changeInfo.status === 'complete') {
    // Inject content script when a supported page loads
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content/content.js']
    }).then(() => {
      console.log('Auto-injected content script into supported page:', tab.url);
    }).catch(error => {
      console.log('Could not auto-inject content script:', error);
    });
  }
});