const promptInput = document.getElementById('prompt-input');
const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model-select');
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

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Persistence
apiKeyInput.value = localStorage.getItem('groq_key') || '';
modelSelect.value = localStorage.getItem('groq_model') || 'openai/gpt-oss-20b';
const theme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', theme);
themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';

apiKeyInput.addEventListener('input', () => localStorage.setItem('groq_key', apiKeyInput.value.trim()));
modelSelect.addEventListener('change', () => localStorage.setItem('groq_model', modelSelect.value));

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
});

function estimateTokens(text) {
  if (!text?.trim()) return 0;
  return Math.ceil(text.length / 4);
}

function updateOriginalTokens() {
  originalTokens.textContent = `~${estimateTokens(promptInput.value)} tokens`;
}
promptInput.addEventListener('input', updateOriginalTokens);

async function callGroq(system, user) {
  const key = apiKeyInput.value.trim();
  if (!key) throw new Error('Please enter your Groq API key');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: modelSelect.value,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.4,
      max_tokens: 1024
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err.slice(0, 180)}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

const SYSTEM_ZERO = `You are an expert prompt engineer. Rewrite the user's weak prompt into a strong zero-shot prompt.
Make it clear, specific, and well-structured. Add role, constraints, and output format guidance.
Return ONLY the improved prompt — no explanations, no markdown fences.`;

const SYSTEM_FEW = `You are an expert prompt engineer. Rewrite the user's weak prompt into a strong few-shot prompt.
Include 1–2 short, relevant examples that demonstrate the desired style and format, then the actual task.
Return ONLY the improved prompt — no explanations, no markdown fences.`;

const SYSTEM_COT = `You are an expert prompt engineer. Rewrite the user's weak prompt into a strong chain-of-thought prompt.
Instruct the model to reason step-by-step before giving the final answer.
Return ONLY the improved prompt — no explanations, no markdown fences.`;

function saveToHistory(original, zero, few, cot) {
  const history = JSON.parse(localStorage.getItem('prompt_history') || '[]');
  history.unshift({
    id: Date.now(),
    original: original.slice(0, 120),
    full: { original, zero, few, cot },
    model: modelSelect.value,
    date: new Date().toLocaleString()
  });
  localStorage.setItem('prompt_history', JSON.stringify(history.slice(0, 20)));
  renderHistory();
}

function renderHistory() {
  const history = JSON.parse(localStorage.getItem('prompt_history') || '[]');
  historyList.innerHTML = history.length
    ? history.map(item => `
        <div class="history-item" data-id="${item.id}">
          <div>${item.original}${item.original.length >= 120 ? '…' : ''}</div>
          <div class="meta">${item.model} · ${item.date}</div>
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

function loadResult({ original, zero, few, cot }) {
  promptInput.value = original;
  updateOriginalTokens();
  document.getElementById('zero-output').textContent = zero;
  document.getElementById('few-output').textContent = few;
  document.getElementById('cot-output').textContent = cot;
  document.getElementById('zero-tokens').textContent = `~${estimateTokens(zero)} tokens`;
  document.getElementById('few-tokens').textContent = `~${estimateTokens(few)} tokens`;
  document.getElementById('cot-tokens').textContent = `~${estimateTokens(cot)} tokens`;
  results.hidden = false;
  results.scrollIntoView({ behavior: 'smooth' });
}

async function optimize() {
  const original = promptInput.value.trim();
  if (!original) {
    promptInput.focus();
    return;
  }

  optimizeBtn.disabled = true;
  optimizeBtn.textContent = 'Optimizing…';
  results.hidden = true;

  try {
    const [zero, few, cot] = await Promise.all([
      callGroq(SYSTEM_ZERO, original),
      callGroq(SYSTEM_FEW, original),
      callGroq(SYSTEM_COT, original)
    ]);

    document.getElementById('zero-output').textContent = zero;
    document.getElementById('few-output').textContent = few;
    document.getElementById('cot-output').textContent = cot;

    document.getElementById('zero-tokens').textContent = `~${estimateTokens(zero)} tokens`;
    document.getElementById('few-tokens').textContent = `~${estimateTokens(few)} tokens`;
    document.getElementById('cot-tokens').textContent = `~${estimateTokens(cot)} tokens`;

    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    saveToHistory(original, zero, few, cot);
  } catch (err) {
    alert(err.message || 'Something went wrong. Check your API key and try again.');
  } finally {
    optimizeBtn.disabled = false;
    optimizeBtn.textContent = 'Optimize Prompt';
  }
}

optimizeBtn.addEventListener('click', optimize);
clearBtn.addEventListener('click', () => {
  promptInput.value = '';
  results.hidden = true;
  updateOriginalTokens();
  promptInput.focus();
});

copyAllBtn.addEventListener('click', async () => {
  const text = `ZERO-SHOT\n${document.getElementById('zero-output').textContent}\n\nFEW-SHOT\n${document.getElementById('few-output').textContent}\n\nCHAIN-OF-THOUGHT\n${document.getElementById('cot-output').textContent}`;
  await navigator.clipboard.writeText(text);
  copyAllBtn.textContent = 'Copied!';
  setTimeout(() => copyAllBtn.textContent = 'Copy All', 1500);
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