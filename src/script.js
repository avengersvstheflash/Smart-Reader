document.addEventListener('DOMContentLoaded', () => {
  const greet = document.getElementById('greet');
  greet.textContent += ' Let’s read something awesome today!';
});

function startReading() {
  document.getElementById('reader-controls').style.display = 'flex';
}


function showAbout() {
  alert("Smart Reader helps you read smarter with AI~ 💡");
}

function openSettings() {
  alert("Settings coming soon~ ⚙️");
}

function generateSummary() {
  const inputText = document.getElementById('input-text').value.trim();
  const loadingMsg = document.getElementById('loading-message');
  const summaryOutput = document.getElementById('summary-output');

  if (!inputText) {
    alert("Please paste some text to summarize!");
    return;
  }

  loadingMsg.style.display = 'block';
  summaryOutput.innerHTML = '';

  setTimeout(() => {
    loadingMsg.style.display = 'none';
    summaryOutput.innerHTML = `
      <strong>Summary:</strong><br>
      In this thrilling chapter, the protagonist faces new challenges while uncovering secrets that could change everything. With unexpected twists and emotional moments, the story builds suspense and sets the stage for an epic continuation.
    `;
  }, 2000); // Fake 2-second delay
}

function showAbout() {
  document.getElementById("aboutModal").classList.remove("hidden");
}

function closeAbout() {
  document.getElementById("aboutModal").classList.add("hidden");
}

function openSettings() {
  document.getElementById("settingsModal").classList.remove("hidden");
}

function closeSettings() {
  document.getElementById("settingsModal").classList.add("hidden");
}
