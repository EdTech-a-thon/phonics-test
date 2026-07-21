import "./style.css";

type Question = {
  id: number;
  prompt: string;
  choices: string[];
  correct: number;
  mediaType: "none" | "image" | "audio";
  mediaUrl: string;
  required: boolean;
};

const sampleQuestions: Question[] = [
  {
    id: 1,
    prompt: "Which word begins with the /sh/ sound?",
    choices: ["ship", "chip", "sip", "tip"],
    correct: 0,
    mediaType: "audio",
    mediaUrl: "https://drive.google.com/file/d/example-audio/view",
    required: true,
  },
  {
    id: 2,
    prompt: "Which picture shows a nocturnal animal?",
    choices: ["Owl", "Butterfly", "Squirrel", "Bee"],
    correct: 0,
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1579019163248-e7761241d85a?w=900",
    required: true,
  },
  {
    id: 3,
    prompt: "How many syllables are in 'elephant'?",
    choices: ["Two", "Three", "Four", "Five"],
    correct: 1,
    mediaType: "none",
    mediaUrl: "",
    required: true,
  },
];

let questions: Question[] = structuredClone(sampleQuestions);
let selectedId = 1;
let nextId = 4;

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#">Form<span>Flow</span><b>↗</b></a>
    <div class="top-actions">
      <span class="save-state"><i></i> Saved on this device</span>
      <button class="text-button" id="helpButton">How it works</button>
      <button class="google-button" id="connectButton"><span>G</span> Connect Google</button>
    </div>
  </header>
  <main>
    <section class="workspace">
      <aside class="question-list-panel">
        <div class="panel-heading">
          <div><span>YOUR QUESTIONS</span><small id="panelCount">3 total</small></div>
          <button class="icon-button" id="addQuestion" aria-label="Add question">+</button>
        </div>
        <div id="questionList" class="question-list"></div>
        <button class="paste-button" id="pasteButton"><span>⊕</span> Paste a question list</button>
      </aside>

      <section class="editor-panel">
        <div class="editor-topline">
          <span id="editorNumber">QUESTION 01</span>
          <div>
            <button class="mini-button" id="duplicateButton" title="Duplicate">□</button>
            <button class="mini-button danger" id="deleteButton" title="Delete">⌫</button>
          </div>
        </div>
        <label class="field-label" for="prompt">QUESTION</label>
        <textarea id="prompt" rows="2" placeholder="Type your question"></textarea>

        <div class="media-header">
          <label class="field-label">QUESTION CONTENT <span>OPTIONAL</span></label>
          <div class="segmented" id="mediaPicker">
            <button data-media="none">None</button>
            <button data-media="image">▧ Picture</button>
            <button data-media="audio">◖ Audio</button>
          </div>
        </div>
        <div id="mediaField"></div>

        <div class="answers-heading">
          <label class="field-label">ANSWER CHOICES</label>
          <span>Select the correct answer</span>
        </div>
        <div id="choices" class="choices"></div>
        <button id="addChoice" class="add-choice">+ Add another choice</button>

        <div class="editor-footer">
          <label class="toggle-row"><input type="checkbox" id="required" /><span class="toggle"></span> Required question</label>
          <div class="nav-buttons"><button id="previousButton">← Previous</button><button id="nextButton">Next →</button></div>
        </div>
      </section>

      <aside class="preview-panel">
        <div class="preview-heading"><span>LIVE PREVIEW</span><b>STUDENT VIEW</b></div>
        <div class="form-preview">
          <div class="preview-accent"></div>
          <div class="preview-body">
            <p id="previewQuestion"></p>
            <div id="previewMedia"></div>
            <div id="previewChoices"></div>
          </div>
        </div>
        <p class="preview-note">This is how the selected question will look. Audio opens from a Drive link because Google Forms cannot embed an audio player.</p>
      </aside>
    </section>

    <section class="finish-bar">
      <div><span id="readyDot"></span><strong id="readyText">All 3 questions are ready</strong><small>Images are embedded; audio is included as a clickable link.</small></div>
      <button class="secondary" id="copyButton">Copy for manual entry</button>
      <button class="primary" id="createButton">Create Google Form <span>↗</span></button>
    </section>
  </main>

  <dialog id="pasteDialog">
    <form method="dialog" class="dialog-card">
      <button class="dialog-close" value="cancel" aria-label="Close">×</button>
      <p class="eyebrow">QUICK IMPORT</p>
      <h2>Paste the mess. We'll sort it.</h2>
      <p>Put each question in a block. Start choices with A), B), C), or D), and add an asterisk to the correct one.</p>
      <textarea id="bulkText" rows="12">Which animal sleeps during the day?\nA) Robin\n*B) Owl\nC) Butterfly\nD) Squirrel\n\nWhat sound does “ship” begin with?\n*A) sh\nB) ch\nC) s\nD) t</textarea>
      <div class="dialog-actions"><button value="cancel">Cancel</button><button value="default" id="importButton">Import questions</button></div>
    </form>
  </dialog>

  <dialog id="connectDialog">
    <div class="dialog-card connect-card">
      <button class="dialog-close" id="closeConnect" aria-label="Close">×</button>
      <p class="eyebrow">ONE-TIME CONNECTION</p>
      <h2>Connect to Google Forms</h2>
      <p>This prototype uses a small Google Apps Script that runs inside your own Google account. Your questions never need to be stored on our server.</p>
      <ol><li>Open Apps Script and create a new project.</li><li>Paste in the helper code below, then deploy it as a web app.</li><li>Paste the web app address here.</li></ol>
      <div class="connect-actions"><a href="https://script.google.com/home/start" target="_blank">Open Apps Script ↗</a><button id="copyScript">Copy helper code</button></div>
      <label class="field-label" for="endpoint">YOUR WEB APP ADDRESS</label>
      <input id="endpoint" type="url" placeholder="https://script.google.com/macros/s/.../exec" />
      <p class="audio-callout"><b>About audio:</b> Google Forms currently supports pictures and YouTube videos, but not embedded audio. This tool places your shared audio link in the question so students can open it.</p>
      <div class="dialog-actions"><button id="cancelConnect">Cancel</button><button id="saveConnect">Save connection</button></div>
    </div>
  </dialog>

  <div id="toast" role="status"></div>
`;

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function selectedQuestion() {
  return questions.find((question) => question.id === selectedId) ?? questions[0];
}

function save() {
  localStorage.setItem("formflow-questions", JSON.stringify(questions));
}

function load() {
  const saved = localStorage.getItem("formflow-questions");
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved) as Question[];
    if (parsed.length) {
      questions = parsed;
      selectedId = questions[0].id;
      nextId = Math.max(...questions.map((question) => question.id)) + 1;
    }
  } catch {
    localStorage.removeItem("formflow-questions");
  }
}

function render() {
  if (!questions.length) addQuestion();
  const question = selectedQuestion();
  const index = questions.indexOf(question);
  $("#panelCount").textContent = `${questions.length} total`;
  $("#readyText").textContent = `All ${questions.length} questions are ready`;
  $("#editorNumber").textContent = `QUESTION ${String(index + 1).padStart(2, "0")}`;

  $("#questionList").innerHTML = questions.map((item, itemIndex) => `
    <button class="question-row ${item.id === selectedId ? "selected" : ""}" data-id="${item.id}">
      <span>${String(itemIndex + 1).padStart(2, "0")}</span>
      <div><strong>${escapeHtml(item.prompt || "Untitled question")}</strong><small>${item.choices.length} choices ${item.mediaType !== "none" ? `· ${item.mediaType}` : ""}</small></div>
      <i>›</i>
    </button>`).join("");

  $<HTMLTextAreaElement>("#prompt").value = question.prompt;
  $<HTMLInputElement>("#required").checked = question.required;
  document.querySelectorAll<HTMLButtonElement>("#mediaPicker button").forEach((button) => button.classList.toggle("active", button.dataset.media === question.mediaType));
  renderMediaField(question);
  renderChoices(question);
  renderPreview(question);
  save();
}

function renderMediaField(question: Question) {
  const field = $("#mediaField");
  if (question.mediaType === "none") {
    field.innerHTML = `<div class="empty-media">No media attached. Choose Picture or Audio above.</div>`;
    return;
  }
  const label = question.mediaType === "image" ? "Public image address" : "Shared Google Drive audio address";
  field.innerHTML = `<div class="media-input"><span>${question.mediaType === "image" ? "▧" : "◖"}</span><div><small>${label}</small><input id="mediaUrl" value="${escapeAttribute(question.mediaUrl)}" placeholder="Paste a link here" /></div><b>${question.mediaUrl ? "✓" : "+"}</b></div>`;
  $("#mediaUrl").addEventListener("input", (event) => {
    question.mediaUrl = (event.target as HTMLInputElement).value;
    renderPreview(question);
    save();
  });
}

function renderChoices(question: Question) {
  $("#choices").innerHTML = question.choices.map((choice, index) => `
    <div class="choice-row ${question.correct === index ? "correct" : ""}">
      <button class="radio" data-correct="${index}" aria-label="Mark as correct">${question.correct === index ? "✓" : ""}</button>
      <input data-choice="${index}" value="${escapeAttribute(choice)}" aria-label="Choice ${index + 1}" />
      <button class="remove-choice" data-remove="${index}" aria-label="Remove choice">×</button>
    </div>`).join("");
}

function renderPreview(question: Question) {
  $("#previewQuestion").textContent = question.prompt || "Your question will appear here";
  const media = $("#previewMedia");
  if (question.mediaType === "image" && question.mediaUrl) {
    media.innerHTML = `<img src="${escapeAttribute(question.mediaUrl)}" alt="Question illustration" />`;
  } else if (question.mediaType === "audio" && question.mediaUrl) {
    media.innerHTML = `<a class="audio-preview" href="${escapeAttribute(question.mediaUrl)}" target="_blank"><span>▶</span><div><strong>Listen to audio</strong><small>Opens in Google Drive</small></div></a>`;
  } else {
    media.innerHTML = "";
  }
  $("#previewChoices").innerHTML = question.choices.map((choice) => `<label class="preview-choice"><i></i>${escapeHtml(choice || "Empty choice")}</label>`).join("");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}

function addQuestion() {
  const question: Question = { id: nextId++, prompt: "", choices: ["", "", "", ""], correct: 0, mediaType: "none", mediaUrl: "", required: true };
  questions.push(question);
  selectedId = question.id;
  render();
}

function showToast(message: string) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function parseQuestions(text: string): Question[] {
  return text.trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const prompt = lines.shift()?.replace(/^\d+[.)]\s*/, "") ?? "Untitled question";
    let correct = 0;
    const choices = lines.map((line, index) => {
      if (line.startsWith("*")) correct = index;
      return line.replace(/^\*?\s*[A-Z][.)]\s*/i, "");
    });
    return { id: nextId++, prompt, choices: choices.length ? choices : ["Option 1", "Option 2"], correct, mediaType: "none", mediaUrl: "", required: true };
  });
}

function questionPayload() {
  return questions.map((question) => ({
    title: question.prompt,
    choices: question.choices,
    correct: question.choices[question.correct],
    required: question.required,
    imageUrl: question.mediaType === "image" ? question.mediaUrl : "",
    audioUrl: question.mediaType === "audio" ? question.mediaUrl : "",
  }));
}

const helperScript = `function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var form = FormApp.create(data.title || 'New quiz');
  form.setIsQuiz(true);

  data.questions.forEach(function(q) {
    if (q.imageUrl) {
      var image = UrlFetchApp.fetch(q.imageUrl).getBlob();
      form.addImageItem().setImage(image).setTitle('Question image');
    }
    var item = form.addMultipleChoiceItem();
    var title = q.title;
    if (q.audioUrl) title += '\\nListen: ' + q.audioUrl;
    item.setTitle(title).setRequired(q.required);
    item.setChoices(q.choices.map(function(choice) {
      return item.createChoice(choice, choice === q.correct);
    }));
    item.setPoints(1);
  });

  return ContentService.createTextOutput(JSON.stringify({
    editUrl: form.getEditUrl(), publishedUrl: form.getPublishedUrl()
  })).setMimeType(ContentService.MimeType.JSON);
}`;

$("#questionList").addEventListener("click", (event) => {
  const row = (event.target as HTMLElement).closest<HTMLButtonElement>(".question-row");
  if (!row) return;
  selectedId = Number(row.dataset.id);
  render();
});

$("#prompt").addEventListener("input", (event) => {
  selectedQuestion().prompt = (event.target as HTMLTextAreaElement).value;
  renderPreview(selectedQuestion());
  const selectedTitle = document.querySelector<HTMLElement>(".question-row.selected strong");
  if (selectedTitle) selectedTitle.textContent = selectedQuestion().prompt || "Untitled question";
  save();
});

$("#mediaPicker").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-media]");
  if (!button) return;
  selectedQuestion().mediaType = button.dataset.media as Question["mediaType"];
  render();
});

$("#choices").addEventListener("input", (event) => {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>("input[data-choice]");
  if (!input) return;
  selectedQuestion().choices[Number(input.dataset.choice)] = input.value;
  renderPreview(selectedQuestion());
  save();
});

$("#choices").addEventListener("click", (event) => {
  const correct = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-correct]");
  const remove = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-remove]");
  if (correct) selectedQuestion().correct = Number(correct.dataset.correct);
  if (remove && selectedQuestion().choices.length > 2) {
    const index = Number(remove.dataset.remove);
    selectedQuestion().choices.splice(index, 1);
    if (selectedQuestion().correct >= selectedQuestion().choices.length) selectedQuestion().correct = 0;
  }
  render();
});

$("#required").addEventListener("change", (event) => {
  selectedQuestion().required = (event.target as HTMLInputElement).checked;
  save();
});

$("#addChoice").addEventListener("click", () => { selectedQuestion().choices.push(""); render(); });
$("#addQuestion").addEventListener("click", addQuestion);
$("#duplicateButton").addEventListener("click", () => {
  const copy = structuredClone(selectedQuestion());
  copy.id = nextId++;
  copy.prompt += " (copy)";
  questions.splice(questions.indexOf(selectedQuestion()) + 1, 0, copy);
  selectedId = copy.id;
  render();
});
$("#deleteButton").addEventListener("click", () => {
  if (questions.length === 1) return showToast("Keep at least one question");
  const index = questions.indexOf(selectedQuestion());
  questions.splice(index, 1);
  selectedId = questions[Math.min(index, questions.length - 1)].id;
  render();
});
$("#previousButton").addEventListener("click", () => {
  const index = questions.indexOf(selectedQuestion());
  selectedId = questions[Math.max(0, index - 1)].id;
  render();
});
$("#nextButton").addEventListener("click", () => {
  const index = questions.indexOf(selectedQuestion());
  selectedId = questions[Math.min(questions.length - 1, index + 1)].id;
  render();
});

const pasteDialog = $("#pasteDialog") as HTMLDialogElement;
const connectDialog = $("#connectDialog") as HTMLDialogElement;
$("#pasteButton").addEventListener("click", () => pasteDialog.showModal());
$("#importButton").addEventListener("click", () => {
  const imported = parseQuestions($<HTMLTextAreaElement>("#bulkText").value);
  questions = imported;
  selectedId = questions[0].id;
  render();
  showToast(`${imported.length} questions imported`);
});
$("#connectButton").addEventListener("click", () => connectDialog.showModal());
$("#helpButton").addEventListener("click", () => pasteDialog.showModal());
$("#closeConnect").addEventListener("click", () => connectDialog.close());
$("#cancelConnect").addEventListener("click", () => connectDialog.close());
$("#copyScript").addEventListener("click", async () => { await navigator.clipboard.writeText(helperScript); showToast("Helper code copied"); });
$("#saveConnect").addEventListener("click", () => {
  const endpoint = $<HTMLInputElement>("#endpoint").value.trim();
  if (!endpoint.startsWith("https://script.google.com/")) return showToast("Please use an Apps Script web app address");
  localStorage.setItem("formflow-endpoint", endpoint);
  connectDialog.close();
  showToast("Google connection saved");
});

$("#copyButton").addEventListener("click", async () => {
  const text = questions.map((question, index) => `${index + 1}. ${question.prompt}\n${question.mediaUrl ? `${question.mediaType.toUpperCase()}: ${question.mediaUrl}\n` : ""}${question.choices.map((choice, choiceIndex) => `${question.correct === choiceIndex ? "*" : ""}${String.fromCharCode(65 + choiceIndex)}) ${choice}`).join("\n")}`).join("\n\n");
  await navigator.clipboard.writeText(text);
  showToast("Questions copied and ready to paste");
});

$("#createButton").addEventListener("click", async () => {
  const endpoint = localStorage.getItem("formflow-endpoint");
  if (!endpoint) return connectDialog.showModal();
  showToast("Creating your Google Form...");
  try {
    const response = await fetch(endpoint, { method: "POST", body: JSON.stringify({ title: "FormFlow quiz", questions: questionPayload() }) });
    const result = await response.json() as { editUrl?: string };
    if (!result.editUrl) throw new Error("No form address returned");
    window.open(result.editUrl, "_blank", "noopener,noreferrer");
    showToast("Your Google Form is ready");
  } catch {
    showToast("Google blocked the request. Check the web app deployment settings.");
  }
});

load();
$<HTMLInputElement>("#endpoint").value = localStorage.getItem("formflow-endpoint") ?? "";
render();
