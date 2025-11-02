document.addEventListener('DOMContentLoaded', function() {
  const saveBtn = document.getElementById('save-btn');
  const resetBtn = document.getElementById('reset-btn');
  const statusMessage = document.getElementById('status-message');
  
  // Load saved settings
  chrome.storage.sync.get({
    defaultFont: 'Arial, sans-serif',
    defaultFontSize: '14px',
    autoSave: true,
    showNotifications: true,
    backendUrl: 'http://localhost:8000'
  }, function(settings) {
    document.getElementById('default-font').value = settings.defaultFont;
    document.getElementById('default-font-size').value = settings.defaultFontSize;
    document.getElementById('auto-save').checked = settings.autoSave;
    document.getElementById('show-notifications').checked = settings.showNotifications;
    document.getElementById('backend-url').value = settings.backendUrl;
  });
  
  // Save settings
  saveBtn.addEventListener('click', function() {
    const settings = {
      defaultFont: document.getElementById('default-font').value,
      defaultFontSize: document.getElementById('default-font-size').value,
      autoSave: document.getElementById('auto-save').checked,
      showNotifications: document.getElementById('show-notifications').checked,
      backendUrl: document.getElementById('backend-url').value
    };
    
    chrome.storage.sync.set(settings, function() {
      showStatus('Settings saved successfully!', 'success');
    });
  });
  
  // Reset settings
  resetBtn.addEventListener('click', function() {
    chrome.storage.sync.set({
      defaultFont: 'Arial, sans-serif',
      defaultFontSize: '14px',
      autoSave: true,
      showNotifications: true,
      backendUrl: 'http://localhost:8000'
    }, function() {
      // Update UI to reflect reset values
      document.getElementById('default-font').value = 'Arial, sans-serif';
      document.getElementById('default-font-size').value = '14px';
      document.getElementById('auto-save').checked = true;
      document.getElementById('show-notifications').checked = true;
      document.getElementById('backend-url').value = 'http://localhost:8000';
      
      showStatus('Settings reset to defaults!', 'success');
    });
  });
  
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
    
    setTimeout(function() {
      statusMessage.classList.add('hidden');
    }, 3000);
  }
});