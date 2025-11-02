//--------------------------------------------------------------------
//Added feature of speech recognition and analyzer stuff

// Content script for injecting floating window into video conferencing pages
(function () {
  // Check if already initialized with a more reliable approach
  if (window.signbridgeInitialized) {
    console.log('SignBridge content script already initialized');
    return;
  }

  window.signbridgeInitialized = true;
  console.log('SignBridge content script initialized');

  let floatingWindow = null;
  let websocket = null;
  let roomCode = null;
  let isSigner = false;
  let videoStream = null;
  let transcript = "";
  let isDragging = false;
  let isResizing = false;
  let offsetX, offsetY;

  // Speech recognition variables
  let speechRecognition = null;
  let isListening = false;
  let speechTranscript = "";

  // Inject the CSS styles
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .signbridge-floating-window {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 350px;
        height: 350px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        resize: both;
        min-width: 300px;
        min-height: 300px;
      }
      
      .signbridge-draggable-handle {
        background: #3498db;
        color: white;
        padding: 8px 12px;
        cursor: move;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
      }
      
      .signbridge-controls {
        display: flex;
        gap: 5px;
      }
      
      .signbridge-control-btn {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 14px;
      }
      
      .signbridge-toolbar {
        display: flex;
        padding: 5px 10px;
        background: #f8f9fa;
        border-bottom: 1px solid #e9ecef;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      
      .signbridge-transcript-container {
        flex: 1;
        padding: 10px;
        overflow-y: auto;
        font-size: 14px;
        line-height: 1.4;
        white-space: pre-wrap;
        min-height: 100px;
      }
      
      .signbridge-footer {
        padding: 5px 10px;
        background: #f8f9fa;
        border-top: 1px solid #e9ecef;
        font-size: 11px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      #signbridge-camera-permission-dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10001;
        max-width: 300px;
        text-align: center;
      }
      
      .signbridge-speech-section {
        border-top: 1px solid #ddd;
        padding: 10px;
        background: #f5f5f5;
      }
      
      .signbridge-speech-text {
        height: 60px;
        overflow-y: auto;
        padding: 8px;
        border: 1px solid #ddd;
        background: white;
        font-size: 13px;
        border-radius: 4px;
        margin-top: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log('Received message in content script:', request.action);

    if (request.action === 'openFloatingWindow') {
      console.log('Opening floating window for room:', request.roomCode);

      // If we already have a floating window for a different room, remove it
      if (floatingWindow && roomCode !== request.roomCode) {
        floatingWindow.remove();
        floatingWindow = null;
      }

      roomCode = request.roomCode;
      isSigner = request.isSigner;

      // Send response back to popup
      sendResponse({ status: 'success' });

      openFloatingWindow();
      connectWebSocket();

      // If user is a signer, request camera permission
      if (isSigner) {
        showCameraPermissionRequest();
      }

      return true; // Keeps the message channel open for async response
    }

    if (request.action === 'getRoomCode') {
      sendResponse({ roomCode: roomCode });
      return true;
    }

    if (request.action === 'ping') {
      console.log('Ping received in content script');
      sendResponse({ status: 'pong' });
      return true;
    }

    if (request.action === 'closeFloatingWindow') {
      endMeeting(false); // Don't refresh the page
      sendResponse({ status: 'success' });
      return true;
    }
  });

  // Show camera permission request
  function showCameraPermissionRequest() {
    // Check if permission dialog already exists
    if (document.getElementById('signbridge-camera-permission-dialog')) {
      return;
    }

    const permissionDialog = document.createElement('div');
    permissionDialog.id = 'signbridge-camera-permission-dialog';

    permissionDialog.innerHTML = `
      <h3 style="margin-top: 0;">Camera Access Required</h3>
      <p>SignBridge needs camera access to recognize sign language gestures.</p>
      <button id="signbridge-grant-camera">Allow Camera</button>
      <button id="signbridge-skip-camera">Skip for Now</button>
    `;

    // Add styles to buttons
    const grantBtn = permissionDialog.querySelector('#signbridge-grant-camera');
    const skipBtn = permissionDialog.querySelector('#signbridge-skip-camera');

    grantBtn.style.cssText = `
      background: #3498db;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-right: 10px;
    `;

    skipBtn.style.cssText = `
      background: #95a5a6;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
    `;

    document.body.appendChild(permissionDialog);

    // Add event listeners
    grantBtn.addEventListener('click', function () {
      permissionDialog.remove();
      requestCameraPermission();
    });

    skipBtn.addEventListener('click', function () {
      permissionDialog.remove();
      // Show message that backend will handle processing
      updateTranscriptDisplay("Camera access skipped. Backend will process gestures when enabled.");
    });
  }

  // Request camera permission
  async function requestCameraPermission() {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
      console.log('Camera access granted');

      // Show success message
      updateTranscriptDisplay("Camera access granted. Backend will process gestures now.");

      // Start processing video frames
      startCameraProcessing();
    } catch (error) {
      console.error('Error accessing camera:', error);
      updateTranscriptDisplay("Camera access denied. Some features may not work properly.");
    }
  }

  // Add speech recognition section to floating window
  function addSpeechRecognitionSection() {
    const speechSection = document.createElement('div');
    speechSection.className = 'signbridge-speech-section';

    speechSection.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong>Speech-to-Text</strong>
        <button id="signbridge-speech-toggle" style="
          padding: 4px 8px; 
          font-size: 12px;
          background: #3498db;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">
          🎤 Start Listening
        </button>
      </div>
      <div id="signbridge-speech-text" class="signbridge-speech-text"></div>
    `;

    // Insert before footer
    const footer = floatingWindow.querySelector('.signbridge-footer');
    floatingWindow.insertBefore(speechSection, footer);

    // Add event listener for speech toggle
    const speechToggle = floatingWindow.querySelector('#signbridge-speech-toggle');
    speechToggle.addEventListener('click', toggleSpeechRecognition);
  }

  // Initialize speech recognition
  function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      speechRecognition = new SpeechRecognition();
      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;
      speechRecognition.lang = 'en-US';

      speechRecognition.onresult = function (event) {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        // Update speech text display
        const speechElement = floatingWindow.querySelector('#signbridge-speech-text');
        if (speechElement) {
          speechTranscript += finalTranscript;
          speechElement.textContent = speechTranscript + interimTranscript;
          speechElement.scrollTop = speechElement.scrollHeight;
        }

        // Send to WebSocket if we have final results
        if (finalTranscript && websocket && websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({
            type: 'speech_transcript',
            text: finalTranscript.trim()
          }));

          // Also add to main transcript
          updateTranscriptDisplay("[Speech] " + finalTranscript.trim());
        }
      };

      speechRecognition.onerror = function (event) {
        console.error('Speech recognition error:', event.error);
        updateSpeechStatus('Error: ' + event.error);
        stopSpeechRecognition();
      };

      speechRecognition.onend = function () {
        if (isListening) {
          // Automatically restart if it ended unexpectedly
          startSpeechRecognition();
        }
      };

      return true;
    } else {
      console.error('Speech recognition not supported');
      return false;
    }
  }

  // Toggle speech recognition
  function toggleSpeechRecognition() {
    if (isListening) {
      stopSpeechRecognition();
    } else {
      startSpeechRecognition();
    }
  }

  // Start speech recognition
  function startSpeechRecognition() {
    if (speechRecognition) {
      try {
        speechRecognition.start();
        isListening = true;
        updateSpeechStatus('🎤 Listening...');

        // Show status in transcript
        updateTranscriptDisplay("Speech recognition started. Speak now...");
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        updateSpeechStatus('🎤 Start Listening');
        updateTranscriptDisplay("Error starting speech recognition: " + error.message);
      }
    }
  }

  // Stop speech recognition
  function stopSpeechRecognition() {
    if (speechRecognition) {
      isListening = false;
      speechRecognition.stop();
      updateSpeechStatus('🎤 Start Listening');
      updateTranscriptDisplay("Speech recognition stopped.");
    }
  }

  // Update speech status
  function updateSpeechStatus(status) {
    const speechToggle = floatingWindow.querySelector('#signbridge-speech-toggle');
    if (speechToggle) {
      speechToggle.textContent = status;

      // Change button color based on state
      if (status === '🎤 Listening...') {
        speechToggle.style.backgroundColor = '#e74c3c'; // Red when listening
      } else {
        speechToggle.style.backgroundColor = '#3498db'; // Blue when not listening
      }
    }
  }

  // Save speech to database (now includes userId)
  function saveSpeechToDatabase() {
    if (speechTranscript.trim()) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const recordName = `speech-${timestamp}`;

      chrome.storage.local.get(['username'], ({ username }) => {
        const userId = username || 'unknown';
        fetch('http://localhost:8000/save-record', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: recordName,
            content: speechTranscript,
            roomCode: roomCode,
            type: 'speech',
            userId: userId
          })
        })
          .then(response => response.json())
          .then(data => {
            if (data.status === 'success') {
              console.log('Speech saved to database with ID:', data.record_id);
            } else {
              console.error('Failed to save speech to database:', data.message);
            }
          })
          .catch(error => {
            console.error('Error saving speech to database:', error);
          });
      });
    }
  }
  // Save transcript to MongoDB (includes userId). Keeps existing fallback to local storage.
  function saveTranscript() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const recordName = `meeting-${timestamp}`;

    chrome.storage.local.get(['username'], ({ username }) => {
      const userId = username || 'unknown';
      fetch('http://localhost:8000/save-record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: recordName,
          content: transcript,
          roomCode: roomCode,
          type: 'transcript',
          userId: userId
        })
      })
        .then(response => response.json())
        .then(data => {
          if (data.status === 'success') {
            console.log('Transcript saved to MongoDB with ID:', data.record_id);
          } else {
            console.error('Failed to save transcript to MongoDB:', data.message);
            // Fallback to local storage
            saveToLocalStorage(recordName);
          }
        })
        .catch(error => {
          console.error('Error saving transcript to MongoDB:', error);
          // Fallback to local storage
          saveToLocalStorage(recordName);
        });
    });
  }



  // Open floating window
  function openFloatingWindow() {
    console.log('Opening floating window function called');

    // Remove existing floating window if any
    if (floatingWindow) {
      floatingWindow.remove();
      floatingWindow = null;
    }

    // Inject CSS styles first
    injectStyles();

    // Create floating window element
    floatingWindow = document.createElement('div');
    floatingWindow.className = 'signbridge-floating-window';

    floatingWindow.innerHTML = `
      <div class="signbridge-draggable-handle">
        <div class="signbridge-window-title" style="font-weight: bold;">SignBridge - Transcript</div>
        <div class="signbridge-controls">
          <button id="signbridge-settings-btn" class="signbridge-control-btn" title="Settings">⚙️</button>
          <button id="signbridge-end-btn" class="signbridge-control-btn" title="End Meeting">⏹️</button>
        </div>
      </div>
      
      <div class="signbridge-toolbar" id="signbridge-toolbar">
        <select id="signbridge-font-select">
          <option value="Arial, sans-serif">Arial</option>
          <option value="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif">Segoe UI</option>
          <option value="'Courier New', Courier, monospace">Courier New</option>
          <option value="Georgia, serif">Georgia</option>
        </select>
        
        <select id="signbridge-font-size-select">
          <option value="12px">Small</option>
          <option value="14px" selected>Medium</option>
          <option value="16px">Large</option>
          <option value="18px">X-Large</option>
        </select>
        
        <select id="signbridge-color-select">
          <option value="#333" selected>Black</option>
          <option value="#fff">White</option>
          <option value="#f00">Red</option>
          <option value="#00f">Blue</option>
          <option value="#090">Green</option>
        </select>
        
        <select id="signbridge-bg-color-select">
          <option value="#fff" selected>White</option>
          <option value="#000">Black</option>
          <option value="#ffc">Yellow</option>
          <option value="#cff">Cyan</option>
          <option value="#fcf">Magenta</option>
        </select>
        
        <button id="signbridge-clear-btn">Clear</button>
      </div>
      
      <div id="signbridge-transcript-text" class="signbridge-transcript-container"></div>
      
      <div class="signbridge-footer">
        <div>
          <small>Room: <span id="signbridge-room-code">${roomCode}</span></small>
        </div>
        <div>
          <small>Status: <span id="signbridge-connection-status">Connected</span></small>
        </div>
      </div>
    `;

    // Add styles to elements
    const toolbar = floatingWindow.querySelector('.signbridge-toolbar');
    toolbar.querySelectorAll('select, button').forEach(el => {
      if (el.tagName === 'SELECT') {
        el.style.cssText = 'padding: 3px; font-size: 12px; margin: 2px;';
      } else if (el.id === 'signbridge-clear-btn') {
        el.style.cssText = 'padding: 3px 6px; font-size: 12px; margin: 2px;';
      }
    });

    // Make window draggable
    const handle = floatingWindow.querySelector('.signbridge-draggable-handle');
    handle.addEventListener('mousedown', function (e) {
      isDragging = true;
      offsetX = e.clientX - floatingWindow.getBoundingClientRect().left;
      offsetY = e.clientY - floatingWindow.getBoundingClientRect().top;
      floatingWindow.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function (e) {
      if (isDragging) {
        floatingWindow.style.left = (e.clientX - offsetX) + 'px';
        floatingWindow.style.top = (e.clientY - offsetY) + 'px';
      }
    });

    document.addEventListener('mouseup', function () {
      isDragging = false;
      floatingWindow.style.cursor = 'default';
    });

    // Add event listeners for buttons
    const endBtn = floatingWindow.querySelector('#signbridge-end-btn');
    const clearBtn = floatingWindow.querySelector('#signbridge-clear-btn');

    endBtn.addEventListener('click', function () {
      endMeeting(false); // Don't refresh the page, just close the window
    });

    clearBtn.addEventListener('click', function () {
      const transcriptElement = floatingWindow.querySelector('#signbridge-transcript-text');
      if (transcriptElement) {
        transcriptElement.textContent = '';
        transcript = '';
      }
    });

    // Add event listeners for settings
    const fontSelect = floatingWindow.querySelector('#signbridge-font-select');
    const fontSizeSelect = floatingWindow.querySelector('#signbridge-font-size-select');
    const colorSelect = floatingWindow.querySelector('#signbridge-color-select');
    const bgColorSelect = floatingWindow.querySelector('#signbridge-bg-color-select');

    fontSelect.addEventListener('change', updateTextStyle);
    fontSizeSelect.addEventListener('change', updateTextStyle);
    colorSelect.addEventListener('change', updateTextStyle);
    bgColorSelect.addEventListener('change', updateTextStyle);

    function updateTextStyle() {
      const transcriptElement = floatingWindow.querySelector('#signbridge-transcript-text');
      if (transcriptElement) {
        transcriptElement.style.fontFamily = fontSelect.value;
        transcriptElement.style.fontSize = fontSizeSelect.value;
        transcriptElement.style.color = colorSelect.value;
        transcriptElement.style.backgroundColor = bgColorSelect.value;
      }
    }

    // Add speech recognition section
    addSpeechRecognitionSection();

    document.body.appendChild(floatingWindow);
    console.log('Floating window appended to body');

    // Initialize speech recognition if supported
    const speechSupported = initSpeechRecognition();
    if (!speechSupported) {
      const speechSection = floatingWindow.querySelector('.signbridge-speech-section');
      speechSection.innerHTML = '<p style="color: #666; padding: 10px; text-align: center;">Speech recognition not supported in this browser</p>';
    }

    // Add some initial text
    updateTranscriptDisplay("Connected to room: " + roomCode);
    if (isSigner) {
      updateTranscriptDisplay("You are the signer for this room.");
    } else {
      updateTranscriptDisplay("You are a viewer in this room.");
    }
  }

  // Start camera processing for signer
  function startCameraProcessing() {
    // Create video element for capturing frames
    const video = document.createElement('video');
    video.srcObject = videoStream;
    video.play();

    // Capture frames and send for processing
    video.addEventListener('loadeddata', function () {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      function captureFrame() {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = canvas.toDataURL('image/jpeg');

          // Send frame to backend for processing
          if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({
              type: 'gesture_video',
              image: imageData
            }));
          }
        }

        setTimeout(captureFrame, 100); // Capture at ~10fps
      }

      captureFrame();
    });
  }

  // Connect to WebSocket
  function connectWebSocket() {
    const userType = isSigner ? 'signer' : 'user';
    websocket = new WebSocket(`ws://localhost:8000/ws/${roomCode}/${userType}`);

    websocket.onopen = function () {
      console.log('WebSocket connection established');
      updateConnectionStatus('Connected');
      updateTranscriptDisplay("WebSocket connection established.");
    };

    websocket.onmessage = function (event) {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'transcript_update') {
          transcript += data.text + '\n';
          updateTranscriptDisplay(data.text);
        } else if (data.type === 'processed_video' && isSigner) {
          // Display processed video if needed
        } else if (data.type === 'speech_transcript') {
          // Handle speech transcript from other users
          updateTranscriptDisplay("[Speech from others] " + data.text);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onclose = function () {
      console.log('WebSocket connection closed');
      updateConnectionStatus('Disconnected');
      // Only update transcript if window still exists
      if (floatingWindow) {
        updateTranscriptDisplay("WebSocket connection closed.");
      }
    };

    websocket.onerror = function (error) {
      console.error('WebSocket error:', error);
      updateConnectionStatus('Error');
      // Only update transcript if window still exists
      if (floatingWindow) {
        updateTranscriptDisplay("WebSocket connection error.");
      }
    };
  }

  // Update transcript display
  function updateTranscriptDisplay(text) {
    if (!floatingWindow) return;
    const transcriptElement = floatingWindow.querySelector('#signbridge-transcript-text');
    if (!transcriptElement) return;

    // Replace content instead of appending
    transcriptElement.textContent = text;
    transcriptElement.scrollTop = transcriptElement.scrollHeight;
  }



  // Update connection status
  function updateConnectionStatus(status) {
    if (!floatingWindow) return;

    const statusElement = floatingWindow.querySelector('#signbridge-connection-status');
    if (statusElement) {
      statusElement.textContent = status;

      // Change color based on status
      if (status === 'Connected') {
        statusElement.style.color = 'green';
      } else if (status === 'Disconnected') {
        statusElement.style.color = 'orange';
      } else if (status === 'Error') {
        statusElement.style.color = 'red';
      }
    }
  }

  // End meeting
  function endMeeting(refreshPage = false) {
    console.log('Ending meeting, refresh:', refreshPage);

    // Close WebSocket connection
    if (websocket) {
      websocket.close();
      websocket = null;
    }

    // Stop camera stream
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      videoStream = null;
    }

    // Stop speech recognition
    if (speechRecognition && isListening) {
      stopSpeechRecognition();
    }

    // Save transcripts to MongoDB
    if (transcript) {
      saveTranscript();
    }

    // Save speech transcript
    saveSpeechToDatabase();

    // Remove floating window
    if (floatingWindow) {
      floatingWindow.remove();
      floatingWindow = null;
    }

    // Clear local storage
    chrome.storage.local.remove(['currentRoom', 'isSigner'], function () {
      console.log('Local storage cleared');

      // Notify popup that window was closed
      chrome.runtime.sendMessage({
        action: 'floatingWindowClosed'
      });
    });

    // Refresh the page only if requested
    if (refreshPage) {
      window.location.reload();
    }
  }



  // Fallback to local storage
  function saveToLocalStorage(recordName) {
    chrome.storage.local.get(['meetingRecords'], function (result) {
      const records = result.meetingRecords || [];
      records.push({
        name: recordName,
        content: transcript,
        timestamp: new Date().toISOString(),
        roomCode: roomCode
      });

      chrome.storage.local.set({ meetingRecords: records });
      console.log('Transcript saved to local storage as fallback');
    });
  }

  // Send initialization message to background script
  chrome.runtime.sendMessage({
    action: 'contentScriptInitialized',
    url: window.location.href
  }).catch(error => {
    console.log('Could not send initialization message:', error);
  });

  console.log('SignBridge content script loaded successfully');
})();