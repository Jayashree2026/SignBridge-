document.addEventListener('DOMContentLoaded', function() {
  const recordSelect = document.getElementById('record-select');
  const recordDetails = document.getElementById('record-details');
  const recordContent = document.getElementById('record-content');
  const analysisType = document.getElementById('analysis-type');
  const customPromptContainer = document.getElementById('custom-prompt-container');
  const analyzeBtn = document.getElementById('analyze-btn');
  const analysisResults = document.getElementById('analysis-results');
  const analysisOutput = document.getElementById('analysis-output');
  const newAnalysisBtn = document.getElementById('new-analysis-btn');
  const errorMessage = document.getElementById('error-message');

  // Load records from backend
  loadRecords();

  // Event listeners
  recordSelect.addEventListener('change', function() {
    const recordId = this.value;
    if (recordId) {
      loadRecordDetails(recordId);
    } else {
      recordDetails.classList.add('hidden');
    }
  });

  analysisType.addEventListener('change', function() {
    if (this.value === 'custom') {
      customPromptContainer.classList.remove('hidden');
    } else {
      customPromptContainer.classList.add('hidden');
    }
  });

  analyzeBtn.addEventListener('click', function() {
    const recordId = recordSelect.value;
    const analysisTypeValue = analysisType.value;
    const customPrompt = document.getElementById('custom-prompt').value;
    
    analyzeRecord(recordId, analysisTypeValue, customPrompt);
  });

  newAnalysisBtn.addEventListener('click', function() {
    analysisResults.classList.add('hidden');
    recordDetails.classList.remove('hidden');
  });

  // Functions
  async function loadRecords() {
    try {
      const response = await fetch('http://localhost:8000/records');
      const data = await response.json();
      
      recordSelect.innerHTML = '<option value="">-- Select a record --</option>';
      data.records.forEach(record => {
        const option = document.createElement('option');
        option.value = record._id;
        option.textContent = `${record.name} (${new Date(record.timestamp).toLocaleString()})`;
        recordSelect.appendChild(option);
      });
    } catch (error) {
      showError('Failed to load records: ' + error.message);
    }
  }

  async function loadRecordDetails(recordId) {
    try {
      const response = await fetch(`http://localhost:8000/records`);
      const data = await response.json();
      
      const record = data.records.find(r => r._id === recordId);
      if (record) {
        recordContent.textContent = record.content;
        recordDetails.classList.remove('hidden');
      }
    } catch (error) {
      showError('Failed to load record details: ' + error.message);
    }
  }

  async function analyzeRecord(recordId, analysisType, customPrompt = '') {
    try {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = 'Analyzing...';
      
      let url = `http://localhost:8000/analyze-record/${recordId}?analysis_type=${analysisType}`;
      if (analysisType === 'custom' && customPrompt) {
        // For custom analysis, we'd need to modify the backend to accept custom prompts
        // This is a simplified version
        url += `&custom_prompt=${encodeURIComponent(customPrompt)}`;
      }
      
      const response = await fetch(url, { method: 'POST' });
      const data = await response.json();
      
      if (data.status === 'success') {
        analysisOutput.textContent = data.analysis;
        analysisResults.classList.remove('hidden');
        recordDetails.classList.add('hidden');
      } else {
        showError('Analysis failed: ' + data.message);
      }
    } catch (error) {
      showError('Analysis error: ' + error.message);
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = 'Analyze';
    }
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    
    setTimeout(() => {
      errorMessage.classList.add('hidden');
    }, 5000);
  }
});