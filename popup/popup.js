//------------------------------for ai analyzer update in new project chatgpt

document.addEventListener('DOMContentLoaded', function () {
  const homeView = document.getElementById('home-view');
  const helpView = document.getElementById('help-view');
  const recordsView = document.getElementById('records-view');
  const analyzerView = document.getElementById('analyzer-view');
  const roomCodeSection = document.getElementById('room-code-section');
  const joinRoomSection = document.getElementById('join-room-section');
  const unsupportedPageMsg = document.getElementById('unsupported-page-msg');
  const supportedPageMsg = document.getElementById('supported-page-msg');

  const createRoomBtn = document.getElementById('create-room-btn');
  const joinRoomBtn = document.getElementById('join-room-btn');
  const helpLink = document.getElementById('help-link');
  const recordsLink = document.getElementById('records-link');
  const analyzerLink = document.getElementById('analyzer-link');
  const backFromHelp = document.getElementById('back-from-help');
  const backFromRecords = document.getElementById('back-from-records');
  const backFromAnalyzer = document.getElementById('back-from-analyzer');
  const copyRoomCodeBtn = document.getElementById('copy-room-code');
  const submitJoinRoomBtn = document.getElementById('submit-join-room');
  const debugConnectionBtn = document.getElementById('debug-connection-btn');
  const connectionStatus = document.getElementById('connection-status');

  const roomCodeDisplay = document.getElementById('room-code-display');
  const roomCodeInput = document.getElementById('room-code-input');

  // Analyzer elements
  const analyzerRecordSelect = document.getElementById('analyzer-record-select');
  const analyzerRecordDetails = document.getElementById('analyzer-record-details');
  const analyzerRecordContent = document.getElementById('analyzer-record-content');
  const analyzerType = document.getElementById('analyzer-type');
  const customPromptContainer = document.getElementById('custom-prompt-container');
  const customPrompt = document.getElementById('custom-prompt');
  const analyzeBtn = document.getElementById('analyze-btn');
  const analyzerResults = document.getElementById('analyzer-results');
  const analyzerOutput = document.getElementById('analyzer-output');
  const newAnalysisBtn = document.getElementById('new-analysis-btn');
  const analyzerError = document.getElementById('analyzer-error');

  let currentTab = null;
  let isSupportedPage = false;

  // Initialize the popup
  initializePopup();

  // Switch views
  function showView(view) {
    homeView.classList.add('hidden');
    helpView.classList.add('hidden');
    recordsView.classList.add('hidden');
    analyzerView.classList.add('hidden');
    view.classList.remove('hidden');
  }

  // Initialize the popup
  async function initializePopup() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTab = tab;

      // Check if current page is supported
      isSupportedPage = checkPageSupport(tab.url);

      if (isSupportedPage) {
        supportedPageMsg.classList.remove('hidden');
        unsupportedPageMsg.classList.add('hidden');
        createRoomBtn.disabled = false;
        joinRoomBtn.disabled = false;
      } else {
        supportedPageMsg.classList.add('hidden');
        unsupportedPageMsg.classList.remove('hidden');
        createRoomBtn.disabled = true;
        joinRoomBtn.disabled = true;
      }

      // --- USERNAME handling: check local storage and prompt if missing ---
      chrome.storage.local.get(['username'], async (result) => {
        if (result && result.username) {
          console.log('Welcome back:', result.username);
        } else {
          // Prompt user for a username (simple flow). You can replace with a nicer UI later.
          let uname = '';
          while (!uname) {
            uname = prompt('Enter a username for this device (used to separate your records):');
            if (uname === null) {
              // user cancelled - stop initialization (disable buttons)
              createRoomBtn.disabled = true;
              joinRoomBtn.disabled = true;
              return;
            }
            uname = uname.trim();
          }
          await chrome.storage.local.set({ username: uname });
          console.log('Username set to:', uname);
        }
      });

      // Check if we already have a room code in storage
      const storage = await chrome.storage.local.get(['currentRoom', 'isSigner']);
      if (storage.currentRoom) {
        roomCodeDisplay.textContent = storage.currentRoom;
        roomCodeSection.classList.remove('hidden');

        if (storage.isSigner) {
          document.querySelector('.window-title').textContent = 'Signer - Room: ' + storage.currentRoom;
        }
      }
    } catch (error) {
      console.error('Error initializing popup:', error);
    }
  }

  // Check if URL is supported
  function checkPageSupport(url) {
    const supportedPatterns = [
      /^https:\/\/meet\.google\.com\/.+/,
      /^https:\/\/zoom\.us\/.+/,
      /^https:\/\/teams\.microsoft\.com\/.+/
    ];

    return supportedPatterns.some(pattern => pattern.test(url));
  }

  // Send message to content script with better retry logic
  // Send message to content script with better retry logic
  async function sendMessageToContentScript(message, maxRetries = 5) {
    try {
      console.log(`Attempting to send message: ${message.action}`);

      // First, ensure content script is injected
      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          files: ['content/content.js']
        });
        console.log('Content script injected successfully');
      } catch (injectError) {
        console.log('Content script injection failed:', injectError);
        throw new Error('Could not inject content script');
      }

      // Wait for content script to initialize
      await new Promise(resolve => setTimeout(resolve, 800));

      // Try sending the message with retries
      for (let i = 0; i < maxRetries; i++) {
        try {
          const response = await chrome.tabs.sendMessage(currentTab.id, message);
          console.log(`Message succeeded on attempt ${i + 1}:`, response);
          return response;
        } catch (retryError) {
          console.log(`Attempt ${i + 1} failed:`, retryError);
          if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          } else {
            throw retryError;
          }
        }
      }
    } catch (error) {
      console.error('All message attempts failed:', error);
      throw error;
    }
  }

// Create room function with automatic floating window
  createRoomBtn.addEventListener('click', async function () {
    try {
      // Ask purpose first
      const purpose = prompt("Enter meeting purpose:");
      if (!purpose) {
        alert("Meeting purpose is required!");
        return;
      }

      const response = await fetch('http://localhost:8000/create-room/signer', {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        const roomCode = data.room_code;

        // Store room code locally
        await chrome.storage.local.set({
          currentRoom: roomCode,
          isSigner: true,
          purpose: purpose
        });

        // Show room code
        roomCodeDisplay.textContent = roomCode;
        roomCodeSection.classList.remove('hidden');
        document.querySelector('.window-title').textContent = 'Signer - Room: ' + roomCode;

        // Try to send message to content script to open floating window automatically
        try {
          const response = await sendMessageToContentScript({
            action: 'openFloatingWindow',
            roomCode: roomCode,
            isSigner: true
          });
          console.log('Floating window opened successfully:', response);
          // Save initial room info to backend
          await fetch('http://localhost:8000/save-room-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomCode, purpose })
          });
        } catch (error) {
          console.error('Could not communicate with content script:', error);
          // Show user-friendly error instead of asking to refresh
          alert('Floating window could not be opened. Please ensure you are on a supported video platform (Google Meet, Zoom, or Microsoft Teams).');
        }
      }
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Error creating room. Please make sure the backend server is running on http://localhost:8000');
    }
  });
  // Join room function with automatic floating window - FIXED
  joinRoomBtn.addEventListener('click', function () {
    joinRoomSection.classList.remove('hidden');
  });

  // Join room function with automatic floating window
  // Join room function with automatic floating window
  submitJoinRoomBtn.addEventListener('click', async function () {
    const roomCode = roomCodeInput.value.trim();
    const purpose = prompt("Enter purpose for this meeting (optional):") || "general";
    const stored = await chrome.storage.local.get(['username']);
    const username = stored.username || 'unknown';

    if (roomCode) {
      try {
        const response = await fetch(`http://localhost:8000/join-room/${roomCode}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ user_id: username })
        });


        if (response.ok) {
          const data = await response.json();

          if (data.message && data.message.includes('joined room')) {
            // Save room details
            await chrome.storage.local.set({
              currentRoom: roomCode,
              isSigner: false
            });

            // ✅ Ensure content script is injected before sending message
            chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
              const tabId = tabs[0].id;
              try {
                // Try injecting content script dynamically
                await chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  files: ['content/content.js']
                });
                console.log('✅ Content script injected');

                // Now send the message to open the floating window
                await chrome.tabs.sendMessage(tabId, {
                  action: 'openFloatingWindow',
                  roomCode: roomCode,
                  isSigner: false
                });
                await fetch('http://localhost:8000/save-room-info', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ roomCode, purpose })
                });


                console.log('✅ Floating window opened automatically');
                joinRoomSection.classList.add('hidden');
              } catch (err) {
                console.error('❌ Failed to inject or open floating window:', err);
                alert('Room joined successfully, but could not open window. Please reload the tab.');
              }
            });
          } else {
            alert('Error joining room: ' + (data.message || 'Unknown error'));
          }
        }

      } catch (error) {
        console.error('Error joining room:', error);
        alert('Error joining room. Please check if the room code is correct and the backend server is running.');
      }
    }
  });


  // Copy room code
  copyRoomCodeBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(roomCodeDisplay.textContent)
      .then(() => {
        alert('Room code copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy room code:', err);
      });
  });

  // Navigation
  helpLink.addEventListener('click', function (e) {
    e.preventDefault();
    showView(helpView);
  });

  recordsLink.addEventListener('click', function (e) {
    e.preventDefault();
    showView(recordsView);
    loadRecords();
  });

  analyzerLink.addEventListener('click', function (e) {
    e.preventDefault();
    showView(analyzerView);
    loadRecordsForAnalyzer();
  });

  backFromHelp.addEventListener('click', function () {
    showView(homeView);
  });

  backFromRecords.addEventListener('click', function () {
    showView(homeView);
  });

  backFromAnalyzer.addEventListener('click', function () {
    showView(homeView);
  });

  async function loadRecords() {
    const recordsList = document.getElementById('records-list');

    try {
      // Fetch records from backend
      const { username } = await chrome.storage.local.get(['username']);
      const userId = username || 'unknown';
      const response = await fetch(`http://localhost:8000/records/user/${encodeURIComponent(userId)}?limit=100`);

      if (!response.ok) throw new Error(`Server returned ${response.status}`);

      const data = await response.json();
      const records = data.records || [];

      if (records.length === 0) {
        recordsList.innerHTML = '<p class="no-records">No records found.</p>';
        return;
      }

      recordsList.innerHTML = '';
      records.forEach((record, index) => {
        const recordItem = document.createElement('div');
        recordItem.className = 'record-item';

        recordItem.innerHTML = `
        <span class="record-name">${record.name}</span>
        <div class="record-actions">
          <button class="download-record btn small" data-index="${index}">Download</button>
         
        </div>
      `;

        recordsList.appendChild(recordItem);
      });

      // Download
      document.querySelectorAll('.download-record').forEach(button => {
        button.addEventListener('click', () => {
          const index = parseInt(button.dataset.index);
          downloadRecord(records[index]);
        });
      });

      // // Rename
      // document.querySelectorAll('.rename-record').forEach(button => {
      //   button.addEventListener('click', () => {
      //     const index = parseInt(button.dataset.index);
      //     renameRecord(records[index]);
      //   });
      // });

    } catch (error) {
      console.error('Failed to load records:', error);
      recordsList.innerHTML = '<p class="no-records">Failed to load records.</p>';
    }
  }

  // function renameRecord(record) {
  //   const newName = prompt("Enter new name for record:", record.name);
  //   if (newName && newName.trim() !== "") {
  //     // Optionally, update on backend
  //     fetch(`http://localhost:8000/record/${record._id}`, {
  //       method: 'PATCH',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ name: newName })
  //     })
  //       .then(res => res.json())
  //       .then(data => {
  //         if (data.status === 'success') {
  //           loadRecords(); // Refresh the list
  //         } else {
  //           alert('Failed to rename record');
  //         }
  //       })
  //       .catch(err => {
  //         console.error('Error renaming record:', err);
  //       });
  //   }
  // }


  function downloadRecord(record) {
    const blob = new Blob([record.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${record.name}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // function deleteRecord(index) {
  //   chrome.storage.local.get(['meetingRecords'], function (result) {
  //     const records = result.meetingRecords || [];
  //     records.splice(index, 1);

  //     chrome.storage.local.set({ meetingRecords: records }, function () {
  //       loadRecords();
  //     });
  //   });
  // }

  // Analyzer functions
  async function loadRecordsForAnalyzer() {
    try {
      const stored = await chrome.storage.local.get(['username']);
      const userId = stored.username || 'unknown';
      const response = await fetch(`http://localhost:8000/records/user/${encodeURIComponent(userId)}?limit=200`);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Check if data.records exists and is an array
      if (!data.records || !Array.isArray(data.records)) {
        throw new Error('Invalid response format from server');
      }

      analyzerRecordSelect.innerHTML = '<option value="">-- Select a record --</option>';
      data.records.forEach(record => {
        const option = document.createElement('option');
        option.value = record._id;
        option.textContent = `${record.name} (${new Date(record.timestamp).toLocaleString()})`;
        analyzerRecordSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Failed to load records:', error);
      showAnalyzerError('Failed to load records: ' + error.message);
    }
  }

  async function loadRecordForAnalyzer(recordId) {
    try {
      const response = await fetch(`http://localhost:8000/record/${recordId}`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.record) {
        const record = data.record;
        const preview = record.content.length > 200
          ? record.content.substring(0, 200) + '...'
          : record.content;

        analyzerRecordContent.textContent = preview;
        analyzerRecordDetails.classList.remove('hidden');
      } else {
        showAnalyzerError('Record not found');
      }
    } catch (error) {
      console.error('Failed to load record:', error);
      showAnalyzerError('Failed to load record: ' + error.message);
    }
  }

  async function analyzeRecord(recordId, analysisType, customPrompt = '') {
    try {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = 'Analyzing...';

      let url = `http://localhost:8000/analyze-record/${recordId}?analysis_type=${analysisType}`;
      if (analysisType === 'custom' && customPrompt) {
        url += `&custom_prompt=${encodeURIComponent(customPrompt)}`;
      }

      const response = await fetch(url, { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status === 'success') {
        analyzerOutput.textContent = data.analysis;
        analyzerResults.classList.remove('hidden');
        analyzerRecordDetails.classList.add('hidden');
      } else {
        showAnalyzerError('Analysis failed: ' + (data.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Analysis error:', error);
      showAnalyzerError('Analysis error: ' + error.message);
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = 'Analyze';
    }
  }

  function showAnalyzerError(message) {
    analyzerError.textContent = message;
    analyzerError.classList.remove('hidden');

    setTimeout(() => {
      analyzerError.classList.add('hidden');
    }, 5000);
  }

  // Analyzer event listeners
  analyzerRecordSelect.addEventListener('change', function () {
    const recordId = this.value;
    if (recordId) {
      loadRecordForAnalyzer(recordId);
    } else {
      analyzerRecordDetails.classList.add('hidden');
    }
  });

  analyzerType.addEventListener('change', function () {
    if (this.value === 'custom') {
      customPromptContainer.classList.remove('hidden');
    } else {
      customPromptContainer.classList.add('hidden');
    }
  });

  analyzeBtn.addEventListener('click', function () {
    const recordId = analyzerRecordSelect.value;
    const analysisType = analyzerType.value;
    const customPromptText = customPrompt.value;

    analyzeRecord(recordId, analysisType, customPromptText);
  });

  newAnalysisBtn.addEventListener('click', function () {
    analyzerResults.classList.add('hidden');
    analyzerRecordDetails.classList.remove('hidden');
  });


  // Handle floating window close event
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.action === 'floatingWindowClosed') {
      console.log('Floating window was closed, resetting UI');
      // Reset the UI to show the create/join buttons
      document.getElementById('room-code-section').classList.add('hidden');
      document.getElementById('join-room-section').classList.add('hidden');
      document.querySelector('.window-title').textContent = 'SignBridge';

      sendResponse({ status: 'success' });
      return true;
    }
  });
});