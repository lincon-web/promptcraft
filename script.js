const promptInput = document.getElementById('prompt-input');
const modelSelect = document.getElementById('model-select');
const providerSelect = document.getElementById('provider-select');
const apiKeyInput = document.getElementById('api-key');
const toggleApiKeyBtn = document.getElementById('toggle-api-key');
const testConnectionBtn = document.getElementById('test-connection-btn');
const connectionStatus = document.getElementById('connection-status');
const optimizeBtn = document.getElementById('optimize-btn');
const clearBtn = document.getElementById('clear-btn');
const copyAllBtn = document.getElementById('copy-all');
const results = document.getElementById('results');
const originalTokens = document.getElementById('original-tokens');
const themeToggle = document.getElementById('theme-toggle');
const historyToggle = document.getElementById('history-toggle');
const historyPanel = document.getElementById('history');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history');

const API_BASE = window.location.hostname === '127.0.0.1' ||
                 window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:8000'
    : 'https://promptcraft-api-m34o.onrender.com';
    
function getAIConfig() {
  return {
    provider: providerSelect.value,
    api_key: apiKeyInput.value.trim(),
    model: modelSelect.value.trim()
  };
}

function validateAIConfig() {
  const config = getAIConfig();

  if (!config.api_key) {
    alert('Please enter your API key.');
    apiKeyInput.focus();
    return false;
  }

  if (!config.model) {
    alert('Please enter your model ID.');
    modelSelect.focus();
    return false;
  }

  return true;
}

async function parseResponse(res) {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.detail || 'The request failed. Please try again.');
  }

  return data;
}

toggleApiKeyBtn.addEventListener('click', () => {
  const isHidden = apiKeyInput.type === 'password';

  apiKeyInput.type = isHidden ? 'text' : 'password';
  toggleApiKeyBtn.textContent = isHidden ? '🙈' : '👁️';
});

testConnectionBtn.addEventListener('click', async () => {
  if (!validateAIConfig()) return;

  testConnectionBtn.disabled = true;
  testConnectionBtn.textContent = 'Testing...';
  connectionStatus.textContent = 'Connecting...';

  try {
    const res = await fetch(`${API_BASE}/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getAIConfig())
    });

    const data = await parseResponse(res);

    connectionStatus.textContent = data.message;
    connectionStatus.style.color = '#22c55e';

  } catch (err) {
    connectionStatus.textContent = err.message;
    connectionStatus.style.color = '#ef4444';

  } finally {
    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = 'Test Connection';
  }
});


// =========================================
// THEME MANAGEMENT — ALL PAGES
// =========================================

(() => {
    const themeToggle = document.getElementById('theme-toggle');

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';

    document.documentElement.setAttribute('data-theme', savedTheme);

    // Update button icon
    function updateThemeIcon(theme) {
        if (!themeToggle) return;

        const icon = themeToggle.querySelector('span:first-child');

        if (icon) {
            icon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    }

    updateThemeIcon(savedTheme);

    // Toggle theme
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme =
                document.documentElement.getAttribute('data-theme');

            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';

            document.documentElement.setAttribute('data-theme', nextTheme);

            localStorage.setItem('theme', nextTheme);

            updateThemeIcon(nextTheme);
        });
    }
})();


function estimateTokens(text) {
  if (!text?.trim()) return 0;
  return Math.ceil(text.length / 4);
}

function updateOriginalTokens() {
  originalTokens.textContent = `~${estimateTokens(promptInput.value)} tokens`;
}
promptInput.addEventListener('input', updateOriginalTokens);


function saveToHistory(
  original,
  zero,
  few,
  reasoning,
  best,
  zeroImprovements,
  fewImprovements,
  reasoningImprovements
) {
  const history = JSON.parse(
    localStorage.getItem('prompt_history') || '[]'
  );

  history.unshift({
    id: Date.now(),
    original: original.slice(0, 120),

    full: {
      original,
      zero,
      few,
      reasoning,
      best,
      zeroImprovements,
      fewImprovements,
      reasoningImprovements
    },

    provider: providerSelect.value,
    model: modelSelect.value,
    date: new Date().toLocaleString()
  });

  localStorage.setItem(
    'prompt_history',
    JSON.stringify(history.slice(0, 20))
  );

  renderHistory();
}




function renderHistory() {
  const history = JSON.parse(localStorage.getItem('prompt_history') || '[]');
  historyList.innerHTML = history.length
    ? history.map(item => `
        <div class="history-item" data-id="${item.id}">
          <div>${item.original}${item.original.length >= 120 ? '…' : ''}</div>
          <div class="meta">${item.provider || 'AI'} · ${item.model} · ${item.date}</div>
        </div>
      `).join('')
    : '<p style="color:var(--text-muted);font-size:0.9rem">No history yet</p>';

  document.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', () => {
      const item = history.find(h => h.id == el.dataset.id);
      if (item) loadResult(item.full);
    });
  });
}


function loadResult({
  original,
  zero,
  few,
  reasoning,
  best = '',
  zeroImprovements = [],
  fewImprovements = [],
  reasoningImprovements = []
}) {
  promptInput.value = original;
  updateOriginalTokens();

  document.getElementById('original-output').textContent = original;
  document.getElementById('zero-output').textContent = zero;
  document.getElementById('few-output').textContent = few;
  document.getElementById('cot-output').textContent = reasoning;
  document.getElementById('best-output').textContent = best;

  // Restore AI-generated improvement explanations
  renderImprovements('zero-improvements', zeroImprovements);
  renderImprovements('few-improvements', fewImprovements);
  renderImprovements('cot-improvements', reasoningImprovements);

  document.getElementById('zero-tokens').textContent =
    `~${estimateTokens(zero)} tokens`;

  document.getElementById('few-tokens').textContent =
    `~${estimateTokens(few)} tokens`;

  document.getElementById('cot-tokens').textContent =
    `~${estimateTokens(reasoning)} tokens`;

  document.getElementById('best-tokens').textContent =
    best ? `~${estimateTokens(best)} tokens` : '';

  results.hidden = false;
  results.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}


async function callBackend(strategy, prompt) {
  const res = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...getAIConfig(),
      prompt,
      strategy
    })
  });

  const data = await parseResponse(res);

  return {
    prompt: data.improved_prompt,
    improvements: data.improvements || []
  };
}

function renderImprovements(containerId, improvements = []) {
  const container = document.getElementById(containerId);

  container.innerHTML = '';

  improvements.forEach((description, index) => {
    const item = document.createElement('div');
    item.className = 'improvement-item';

    const number = document.createElement('span');
    number.className = 'improvement-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const text = document.createElement('p');
    text.className = 'improvement-description';
    text.textContent = description;

    item.appendChild(number);
    item.appendChild(text);

    container.appendChild(item);
  });
}


function renderImprovements(containerId, improvements = []) {
  const container = document.getElementById(containerId);

  if (!container) return;

  container.replaceChildren();

  if (!improvements.length) {
    container.textContent = 'No improvement details available.';
    return;
  }

  improvements.forEach((item, index) => {
    const entry = document.createElement('div');
    entry.className = 'improvement-item';

    const number = document.createElement('span');
    number.className = 'improvement-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const description = document.createElement('p');
    description.className = 'improvement-description';
    description.textContent = item;

    entry.append(number, description);
    container.appendChild(entry);
  });
}


async function generateAnswer(improvedPrompt) {
  const res = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...getAIConfig(),
      improved_prompt: improvedPrompt
    })
  });

  const data = await parseResponse(res);
  return data.answer;
}


async function optimize() {
  const original = promptInput.value.trim();

  if (!original) {
    promptInput.focus();
    return;
  }

  if (!validateAIConfig()) return;

  optimizeBtn.disabled = true;
  optimizeBtn.textContent = 'Optimizing...';

  results.hidden = true;

  // Clear previous results
  document.getElementById('original-output').textContent = '';
  document.getElementById('zero-output').textContent = '';
  document.getElementById('few-output').textContent = '';
  document.getElementById('cot-output').textContent = '';
  document.getElementById('best-output').textContent = '';

  try {
    // STEP 1: Optimize the original prompt using three strategies

   const [zeroResult, fewResult, reasoningResult] = await Promise.all([
  callBackend('zero-shot', original),
  callBackend('few-shot', original),
  callBackend('reasoning-guided', original)
]);

const zero = zeroResult.prompt;
const few = fewResult.prompt;
const reasoning = reasoningResult.prompt; 

// Display AI-generated improvement explanations

renderImprovements('zero-improvements', zeroResult.improvements);
renderImprovements('few-improvements', fewResult.improvements);
renderImprovements('cot-improvements', reasoningResult.improvements);

    // STEP 2: Display original and optimized prompts

    document.getElementById('original-output').textContent = original;

    document.getElementById('zero-output').textContent = zero;
    document.getElementById('few-output').textContent = few;
    document.getElementById('cot-output').textContent = reasoning;

    // STEP 3: Calculate approximate token counts

    document.getElementById('zero-tokens').textContent =
      `~${estimateTokens(zero)} tokens`;

    document.getElementById('few-tokens').textContent =
      `~${estimateTokens(few)} tokens`;

    document.getElementById('cot-tokens').textContent =
      `~${estimateTokens(reasoning)} tokens`;

    // STEP 4: Generate the final best prompt

    optimizeBtn.textContent = 'Evaluating best prompt...';

    const bestRes = await fetch(`${API_BASE}/best`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({
        ...getAIConfig(),
        original,
        zero,
        few,
        reasoning
      })
    });

    const bestData = await parseResponse(bestRes);
    const best = bestData.best_prompt;

    document.getElementById('best-output').textContent = best;

    document.getElementById('best-tokens').textContent =
      `~${estimateTokens(best)} tokens`;

    // STEP 5: Show results and save history

    results.hidden = false;

    results.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });

    saveToHistory(
  original,
  zero,
  few,
  reasoning,
  best,
  zeroResult.improvements,
  fewResult.improvements,
  reasoningResult.improvements
);

  } catch (err) {
    alert(err.message || 'Something went wrong. Is the backend running?');

  } finally {
    optimizeBtn.disabled = false;
    optimizeBtn.textContent = 'Optimize Prompt';
  }
}



optimizeBtn.addEventListener('click', optimize);
clearBtn.addEventListener('click', () => {
  promptInput.value = '';

  results.hidden = true;

  document.getElementById('original-output').textContent = '';
  document.getElementById('zero-output').textContent = '';
  document.getElementById('few-output').textContent = '';
  document.getElementById('cot-output').textContent = '';
  document.getElementById('best-output').textContent = '';

  
renderImprovements('zero-improvements', []);
renderImprovements('few-improvements', []);
renderImprovements('cot-improvements', []);

  updateOriginalTokens();
  promptInput.focus();
});


copyAllBtn.addEventListener('click', async () => {
  const text = `
ORIGINAL PROMPT
${document.getElementById('original-output').textContent}

ZERO-SHOT
${document.getElementById('zero-output').textContent}

FEW-SHOT
${document.getElementById('few-output').textContent}

REASONING-GUIDED
${document.getElementById('cot-output').textContent}

FINAL BEST PROMPT
${document.getElementById('best-output').textContent}
  `.trim();

  await navigator.clipboard.writeText(text);

  copyAllBtn.textContent = 'Copied!';

  setTimeout(() => {
    copyAllBtn.textContent = 'Copy All Prompts';
  }, 1500);
});

historyToggle.addEventListener('click', () => {
  historyPanel.hidden = !historyPanel.hidden;
  if (!historyPanel.hidden) renderHistory();
});

clearHistoryBtn.addEventListener('click', () => {
  if (confirm('Clear all history?')) {
    localStorage.removeItem('prompt_history');
    renderHistory();
  }
});

document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const text = document.getElementById(btn.dataset.target).textContent;
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  });
});

updateOriginalTokens();
renderHistory();

/* =====================================
   PROMPTCRAFT — MODE SWITCHING
   WITH BROWSER HISTORY SUPPORT
===================================== */

(() => {

    const quickModeBtn = document.getElementById("quick-mode-btn");
    const advancedModeBtn = document.getElementById("advanced-mode-btn");

    const quickWorkspace = document.getElementById("quick-workspace");
    const advancedWorkspace = document.getElementById("advanced-workspace");

    if (
        !quickModeBtn ||
        !advancedModeBtn ||
        !quickWorkspace ||
        !advancedWorkspace
    ) return;

    // Ensure Quick Optimize is the initial browser state
    if (!history.state || !history.state.promptCraftMode) {
        history.replaceState(
            { promptCraftMode: "quick" },
            "",
            location.pathname + location.search
        );
    }

    function switchMode(mode) {

        const isQuick = mode === "quick";

        quickWorkspace.hidden = !isQuick;
        advancedWorkspace.hidden = isQuick;

        quickModeBtn.classList.toggle("active", isQuick);
        advancedModeBtn.classList.toggle("active", !isQuick);
    }

    // Open Advanced Optimizer as a browser history entry
    advancedModeBtn.addEventListener("click", () => {

        if (history.state?.promptCraftMode === "advanced") return;

        history.pushState(
            { promptCraftMode: "advanced" },
            "",
            "#advanced"
        );

        switchMode("advanced");
    });

    // Clicking Quick Optimize returns to the previous mode entry
    quickModeBtn.addEventListener("click", () => {

        if (history.state?.promptCraftMode === "advanced") {
            history.back();
        } else {
            switchMode("quick");
        }
    });

    // Handle browser Back and Forward buttons
    window.addEventListener("popstate", (event) => {

        const mode = event.state?.promptCraftMode || "quick";

        switchMode(mode);
    });

    // Start in Quick Optimize
    switchMode(history.state.promptCraftMode || "quick");

})();

/* =====================================
   PROMPTCRAFT — QUICK OPTIMIZE
   FRONTEND API INTEGRATION
===================================== */

(() => {

    const quickInput = document.getElementById("quick-prompt-input");
    const quickButton = document.getElementById("quick-optimize-btn");
    const quickOutput = document.getElementById("quick-output");
    const quickResult = document.getElementById("quick-result");
    const quickCopyButton = document.getElementById("quick-copy-btn");

    const quickTokenCount = document.getElementById("quick-token-count");
    const quickResultTokens = document.getElementById("quick-result-tokens");

    if (
        !quickInput ||
        !quickButton ||
        !quickOutput ||
        !quickResult ||
        !quickCopyButton
    ) return;

    // Update input token estimate.
    quickInput.addEventListener("input", () => {

        const tokens = estimateTokens(quickInput.value);

        quickTokenCount.textContent = `~${tokens} tokens`;

    });

    // Optimize prompt.
    quickButton.addEventListener("click", async () => {

        const prompt = quickInput.value.trim();

        if (!prompt) {
            alert("Please enter a prompt to optimize.");
            quickInput.focus();
            return;
        }

        if (prompt.length > 5000) {
            alert("Your prompt is too long. Maximum length is 5,000 characters.");
            return;
        }

        // Loading state.
        quickButton.disabled = true;
        quickButton.textContent = "Optimizing...";
        quickResult.hidden = true;

        try {

            const response = await fetch(`${API_BASE}/quick-optimize`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    prompt: prompt
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail || "Quick Optimize failed. Please try again."
                );
            }

            if (!data.optimized_prompt) {
                throw new Error("The AI returned an empty optimized prompt.");
            }

            // Display optimized prompt.
            quickOutput.textContent = data.optimized_prompt;

            // Update token estimate.
            const resultTokens = estimateTokens(data.optimized_prompt);

            quickResultTokens.textContent = `~${resultTokens} tokens`;

            // Reveal result.
            quickResult.hidden = false;

            // Bring result into view.
            quickResult.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

        } catch (error) {

            console.error("Quick Optimize Error:", error);

            alert(error.message || "Something went wrong. Please try again.");

        } finally {

            quickButton.disabled = false;

            quickButton.innerHTML = `
                <span>⚡</span>
                Optimize Prompt
            `;

        }

    });

    // Copy optimized prompt.
    quickCopyButton.addEventListener("click", async () => {

        const optimizedPrompt = quickOutput.textContent.trim();

        if (!optimizedPrompt) return;

        try {

            await navigator.clipboard.writeText(optimizedPrompt);

            quickCopyButton.textContent = "Copied!";

            setTimeout(() => {
                quickCopyButton.textContent = "Copy Prompt";
            }, 1800);

        } catch (error) {

            console.error("Copy Error:", error);
            alert("Unable to copy the prompt. Please copy it manually.");

        }

    });

})();

/* =====================================
   PROMPTCRAFT — SIDEBAR TOGGLE
===================================== */

(() => {
    const toggleButton = document.getElementById("sidebar-toggle");
    const appShell = document.querySelector(".app-shell");

    if (!toggleButton || !appShell) return;

    toggleButton.addEventListener("click", () => {

        const isHidden = appShell.classList.toggle("sidebar-hidden");

        toggleButton.setAttribute(
            "aria-expanded",
            String(!isHidden)
        );

        toggleButton.title = isHidden
            ? "Show Sidebar"
            : "Hide Sidebar";

        toggleButton.setAttribute(
            "aria-label",
            toggleButton.title
        );
    });

})();