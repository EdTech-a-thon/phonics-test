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
    mediaUrl: "",
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
const audioRecordings = new Map<number, Blob>();
const audioObjectUrls = new Map<number, string>();
let mediaRecorder: MediaRecorder | null = null;

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#">Form<span>Flow</span><b>↗</b></a>
    <div class="top-actions">
      <span class="save-state"><i></i> Saved on this device</span>
      <button class="text-button" id="helpButton">How it works</button>
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
        <p class="preview-note">This is how the selected question will look in your custom student form.</p>
      </aside>
    </section>

    <section class="finish-bar">
      <div><span id="readyDot"></span><strong id="readyText">All 3 questions are ready</strong><small>Everything is packaged into one test file.</small></div>
      <button class="secondary" id="copyButton">Copy question list</button>
      <button class="primary" id="createButton">Download test HTML <span>↓</span></button>
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

  <div id="toast" role="status"></div>
`;

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function selectedQuestion() {
  return questions.find((question) => question.id === selectedId) ?? questions[0];
}

function save() {
  localStorage.setItem("formflow-questions", JSON.stringify(questions));
}

function openRecordingStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("formflow", 1);
    request.addEventListener("upgradeneeded", () => request.result.createObjectStore("recordings"));
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function storeRecording(id: number, blob: Blob | null) {
  const database = await openRecordingStore();
  const transaction = database.transaction("recordings", "readwrite");
  const store = transaction.objectStore("recordings");
  if (blob) store.put(blob, id);
  else store.delete(id);
}

async function loadRecordings() {
  const database = await openRecordingStore();
  const transaction = database.transaction("recordings", "readonly");
  const store = transaction.objectStore("recordings");
  await Promise.all(questions.map((question) => new Promise<void>((resolve) => {
    const request = store.get(question.id);
    request.addEventListener("success", () => {
      if (request.result instanceof Blob) {
        audioRecordings.set(question.id, request.result);
        audioObjectUrls.set(question.id, URL.createObjectURL(request.result));
      }
      resolve();
    });
    request.addEventListener("error", () => resolve());
  })));
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
  if (question.mediaType === "audio") {
    const recordingUrl = audioObjectUrls.get(question.id) || question.mediaUrl;
    field.innerHTML = `
      <div class="audio-recorder">
        <button id="recordButton" class="record-button"><i></i><span>${recordingUrl ? "Record again" : "Start recording"}</span></button>
        <div class="recording-status"><strong>${recordingUrl ? "Recording ready" : "Use your microphone"}</strong><small>${recordingUrl ? "It will be embedded in the downloaded test." : "You can listen before downloading."}</small></div>
        ${recordingUrl ? `<audio controls src="${escapeAttribute(recordingUrl)}"></audio>` : ""}
      </div>
      <div class="or-divider"><span>or use an existing shared audio link</span></div>
      <div class="media-input"><span>◖</span><div><small>Shared audio address</small><input id="mediaUrl" value="${escapeAttribute(question.mediaUrl)}" placeholder="Paste a link here" /></div><b>${question.mediaUrl ? "✓" : "+"}</b></div>`;
    $("#recordButton").addEventListener("click", () => toggleRecording(question));
  } else {
    field.innerHTML = `<div class="media-input"><span>▧</span><div><small>Public image address</small><input id="mediaUrl" value="${escapeAttribute(question.mediaUrl)}" placeholder="Paste a link here" /></div><b>${question.mediaUrl ? "✓" : "+"}</b></div>`;
  }
  $("#mediaUrl").addEventListener("input", (event) => {
    question.mediaUrl = (event.target as HTMLInputElement).value;
    renderPreview(question);
    save();
  });
}

async function toggleRecording(question: Question) {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Audio recording is not supported in this browser");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
    mediaRecorder.addEventListener("stop", () => {
      const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || "audio/webm" });
      const oldUrl = audioObjectUrls.get(question.id);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      audioRecordings.set(question.id, blob);
      audioObjectUrls.set(question.id, URL.createObjectURL(blob));
      void storeRecording(question.id, blob);
      stream.getTracks().forEach((track) => track.stop());
      mediaRecorder = null;
      render();
      showToast("Recording saved in this draft");
    });
    mediaRecorder.start();
    const button = $<HTMLButtonElement>("#recordButton");
    button.classList.add("recording");
    button.querySelector("span")!.textContent = "Stop recording";
    const status = document.querySelector<HTMLElement>(".recording-status strong");
    if (status) status.textContent = "Recording now...";
  } catch {
    showToast("Please allow microphone access to record audio");
  }
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
  } else if (question.mediaType === "audio" && (audioObjectUrls.get(question.id) || question.mediaUrl)) {
    media.innerHTML = `<div class="embedded-audio"><span>Listen to the question</span><audio controls src="${escapeAttribute(audioObjectUrls.get(question.id) || question.mediaUrl)}"></audio></div>`;
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

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

async function createTestHtml() {
  const testQuestions = await Promise.all(questions.map(async (question) => ({
    prompt: question.prompt,
    choices: question.choices,
    correct: question.correct,
    required: question.required,
    imageUrl: question.mediaType === "image" ? question.mediaUrl : "",
    audioUrl: question.mediaType === "audio" && audioRecordings.has(question.id)
      ? await blobToDataUrl(audioRecordings.get(question.id)!)
      : question.mediaType === "audio" ? question.mediaUrl : "",
  })));
  const safeData = JSON.stringify({ title: "Audio Quiz", questions: testQuestions }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Audio Quiz</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f3ee;color:#25302c;font:16px Arial,sans-serif}.wrap{max-width:720px;margin:34px auto;padding:0 16px 50px}header,.card,.results{background:#fff;border-radius:8px;padding:26px;margin-bottom:16px;box-shadow:0 5px 20px #0000000d}header{border-top:8px solid #176b52}h1{margin:0 0 8px}h3{margin-top:0}p{color:#66706b}.card.missed{border-left:5px solid #b74c3e}.card.correct{border-left:5px solid #25805e}img{display:block;max-width:100%;max-height:360px;border-radius:5px;margin:15px 0}audio{width:100%;margin:12px 0}.choice{display:block;padding:12px;border:1px solid #d9dcd8;border-radius:5px;margin:8px 0;cursor:pointer}.choice:has(input:checked){border-color:#176b52;background:#edf6f1}button{background:#176b52;color:#fff;border:0;border-radius:5px;padding:13px 24px;font-weight:bold;cursor:pointer}.results{display:none;text-align:center}.score{color:#176b52;font-size:54px;font-weight:bold;margin:8px}.review{font-size:14px;text-align:left}.answer{font-weight:bold}.wrong{color:#a43f33}.right{color:#176b52}@media(max-width:600px){.wrap{margin:12px auto}header,.card,.results{padding:20px}}
</style></head><body><main class="wrap"><header><h1 id="title"></h1><p>Choose the best answer for each question, then submit to see your score.</p></header><form id="quiz"></form><section class="results" id="results"><p>YOUR SCORE</p><div class="score" id="score"></div><h2 id="message"></h2><div class="review" id="review"></div><button id="retry" type="button">Try again</button></section></main>
<script>const data=${safeData};const quiz=document.getElementById('quiz');document.getElementById('title').textContent=data.title;data.questions.forEach((q,i)=>{const card=document.createElement('section');card.className='card';card.id='question-'+i;const heading=document.createElement('h3');heading.textContent=(i+1)+'. '+q.prompt;card.append(heading);if(q.imageUrl){const image=document.createElement('img');image.src=q.imageUrl;image.alt='Question image';card.append(image)}if(q.audioUrl){const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=q.audioUrl;card.append(audio)}q.choices.forEach((choice,j)=>{const label=document.createElement('label');label.className='choice';const input=document.createElement('input');input.type='radio';input.name='q'+i;input.value=String(j);input.required=q.required;label.append(input,document.createTextNode(' '+choice));card.append(label)});quiz.append(card)});const submit=document.createElement('button');submit.type='submit';submit.textContent='Grade my test';quiz.append(submit);quiz.addEventListener('submit',event=>{event.preventDefault();let correct=0;const review=document.getElementById('review');review.innerHTML='';data.questions.forEach((q,i)=>{const picked=document.querySelector('input[name=q'+i+']:checked');const answer=picked?Number(picked.value):-1;const isCorrect=answer===q.correct;if(isCorrect)correct++;const card=document.getElementById('question-'+i);card.classList.add(isCorrect?'correct':'missed');const line=document.createElement('p');line.innerHTML='<strong>'+(i+1)+'. '+q.prompt+'</strong><br><span class="'+(isCorrect?'right':'wrong')+'">'+(isCorrect?'Correct':'Your answer: '+(answer>=0?q.choices[answer]:'No answer'))+'</span>'+(isCorrect?'':'<br><span class="answer">Correct answer: '+q.choices[q.correct]+'</span>');review.append(line)});const percent=Math.round(correct/data.questions.length*100);document.getElementById('score').textContent=correct+' / '+data.questions.length;document.getElementById('message').textContent=percent>=80?'Excellent work!':percent>=60?'Good effort!':'Keep practicing!';quiz.style.display='none';document.getElementById('results').style.display='block';window.scrollTo({top:0,behavior:'smooth'})});document.getElementById('retry').addEventListener('click',()=>{quiz.reset();document.querySelectorAll('.card').forEach(card=>card.classList.remove('correct','missed'));quiz.style.display='block';document.getElementById('results').style.display='none';window.scrollTo({top:0,behavior:'smooth'})});</script></body></html>`;
}

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
  audioRecordings.delete(selectedId);
  void storeRecording(selectedId, null);
  const audioUrl = audioObjectUrls.get(selectedId);
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioObjectUrls.delete(selectedId);
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
$("#pasteButton").addEventListener("click", () => pasteDialog.showModal());
$("#importButton").addEventListener("click", () => {
  const imported = parseQuestions($<HTMLTextAreaElement>("#bulkText").value);
  questions = imported;
  selectedId = questions[0].id;
  render();
  showToast(`${imported.length} questions imported`);
});
$("#helpButton").addEventListener("click", () => pasteDialog.showModal());

$("#copyButton").addEventListener("click", async () => {
  const text = questions.map((question, index) => `${index + 1}. ${question.prompt}\n${question.mediaUrl ? `${question.mediaType.toUpperCase()}: ${question.mediaUrl}\n` : ""}${question.choices.map((choice, choiceIndex) => `${question.correct === choiceIndex ? "*" : ""}${String.fromCharCode(65 + choiceIndex)}) ${choice}`).join("\n")}`).join("\n\n");
  await navigator.clipboard.writeText(text);
  showToast("Questions copied and ready to paste");
});

$("#createButton").addEventListener("click", async () => {
  showToast("Packaging your test...");
  try {
    const html = await createTestHtml();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "audio-quiz.html";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Test downloaded and ready to share");
  } catch {
    showToast("The test could not be created. Please try again.");
  }
});

load();
loadRecordings().finally(render);
