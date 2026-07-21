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

type Project = {
  id: string;
  name: string;
  questions: Question[];
};

const sampleQuestions: Question[] = [
  {
    id: 1,
    prompt: "",
    choices: ["ship", "chip", "sip", "tip"],
    correct: 0,
    mediaType: "audio",
    mediaUrl: "",
    required: true,
  },
  {
    id: 2,
    prompt: "",
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

const demoProject: Project = { id: "demo", name: "Demo project", questions: structuredClone(sampleQuestions) };
let projects: Project[] = [demoProject];
let activeProjectId = "demo";
let questions: Question[] = projects[0].questions;
let selectedId = 1;
let nextId = 4;
const audioRecordings = new Map<number, Blob>();
const audioObjectUrls = new Map<number, string>();
const imageFiles = new Map<number, Blob>();
const imageObjectUrls = new Map<number, string>();
let mediaRecorder: MediaRecorder | null = null;

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#">Form<span>Flow</span><b>↗</b></a>
    <div class="project-controls">
      <select id="projectSelect" aria-label="Current project"></select>
      <button id="newProject">+ New project</button>
      <button id="renameProject">Rename</button>
      <button id="deleteProject">Delete</button>
    </div>
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
      </aside>

      <section class="editor-panel">
        <div class="editor-topline">
          <span id="editorNumber">QUESTION 01</span>
          <div>
            <button class="mini-button" id="duplicateButton" title="Duplicate">□</button>
            <button class="mini-button danger" id="deleteButton" title="Delete">⌫</button>
          </div>
        </div>
        <div class="question-title-box">
          <div class="media-header">
            <label class="field-label">QUESTION TITLE</label>
            <div class="segmented" id="mediaPicker">
              <button data-media="none">Text</button>
              <button data-media="image">▧ Picture</button>
              <button data-media="audio">◖ Audio</button>
            </div>
          </div>
          <div id="titleField"></div>
        </div>

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

  <dialog id="imageDialog">
    <div class="dialog-card image-dialog-card">
      <button class="dialog-close" id="closeImageDialog" aria-label="Close">×</button>
      <p class="eyebrow">QUESTION IMAGE</p>
      <h2>Choose an image</h2>
      <label class="image-drop" id="imageDrop">
        <input id="imageInput" type="file" accept="image/*" />
        <strong>Drop an image here</strong>
        <span>or click to choose a file</span>
      </label>
    </div>
  </dialog>

  <div id="toast" role="status"></div>
`;

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

function selectedQuestion() {
  return questions.find((question) => question.id === selectedId) ?? questions[0];
}

function save() {
  const project = projects.find((item) => item.id === activeProjectId)!;
  project.questions = questions;
  localStorage.setItem("formflow-projects", JSON.stringify(projects));
  localStorage.setItem("formflow-active-project", activeProjectId);
}

function openRecordingStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("formflow", 1);
    request.addEventListener("upgradeneeded", () => request.result.createObjectStore("recordings"));
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function assetKey(type: "audio" | "image", questionId: number, projectId = activeProjectId) {
  return `${projectId}:${type}:${questionId}`;
}

async function storeAsset(type: "audio" | "image", id: number, blob: Blob | null) {
  const database = await openRecordingStore();
  const transaction = database.transaction("recordings", "readwrite");
  const store = transaction.objectStore("recordings");
  if (blob) store.put(blob, assetKey(type, id));
  else store.delete(assetKey(type, id));
}

async function loadAssets() {
  audioObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  imageObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  audioRecordings.clear();
  audioObjectUrls.clear();
  imageFiles.clear();
  imageObjectUrls.clear();
  const database = await openRecordingStore();
  const transaction = database.transaction("recordings", "readonly");
  const store = transaction.objectStore("recordings");
  await Promise.all(questions.flatMap((question) => (["audio", "image"] as const).map((type) => new Promise<void>((resolve) => {
      const request = store.get(assetKey(type, question.id));
      request.addEventListener("success", () => {
        if (request.result instanceof Blob) {
          const blobs = type === "audio" ? audioRecordings : imageFiles;
          const urls = type === "audio" ? audioObjectUrls : imageObjectUrls;
          blobs.set(question.id, request.result);
          urls.set(question.id, URL.createObjectURL(request.result));
        }
        resolve();
      });
      request.addEventListener("error", () => resolve());
    }))));
}

function load() {
  const saved = localStorage.getItem("formflow-projects");
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved) as Project[];
    if (parsed.length) {
      projects = parsed;
      activeProjectId = localStorage.getItem("formflow-active-project") ?? parsed[0].id;
      const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
      activeProjectId = activeProject.id;
      questions = activeProject.questions;
      selectedId = questions[0].id;
      nextId = Math.max(...questions.map((question) => question.id)) + 1;
    }
  } catch {
    localStorage.removeItem("formflow-projects");
  }
}

function render() {
  if (!questions.length) addQuestion();
  const question = selectedQuestion();
  const index = questions.indexOf(question);
  $("#projectSelect").innerHTML = projects.map((project) => `<option value="${escapeAttribute(project.id)}" ${project.id === activeProjectId ? "selected" : ""}>${escapeHtml(project.name)}</option>`).join("");
  $("#panelCount").textContent = `${questions.length} total`;
  $("#readyText").textContent = `All ${questions.length} questions are ready`;
  $("#editorNumber").textContent = `QUESTION ${String(index + 1).padStart(2, "0")}`;

  $("#questionList").innerHTML = questions.map((item, itemIndex) => `
    <button class="question-row ${item.id === selectedId ? "selected" : ""}" data-id="${item.id}">
      <span>${String(itemIndex + 1).padStart(2, "0")}</span>
      <div><strong>${escapeHtml(item.prompt || `${item.mediaType === "none" ? "Untitled" : item.mediaType} question`)}</strong><small>${item.choices.length} choices ${item.mediaType !== "none" ? `· ${item.mediaType}` : ""}</small></div>
      <i>›</i>
    </button>`).join("");

  $<HTMLInputElement>("#required").checked = question.required;
  document.querySelectorAll<HTMLButtonElement>("#mediaPicker button").forEach((button) => button.classList.toggle("active", button.dataset.media === question.mediaType));
  renderTitleField(question);
  renderChoices(question);
  renderPreview(question);
  save();
}

function renderTitleField(question: Question) {
  const field = $("#titleField");
  if (question.mediaType === "none") {
    field.innerHTML = `<textarea id="prompt" rows="3" placeholder="Type your question"></textarea>`;
    $<HTMLTextAreaElement>("#prompt").value = question.prompt;
    $("#prompt").addEventListener("input", updatePrompt);
    return;
  }
  if (question.mediaType === "audio") {
    const recordingUrl = audioObjectUrls.get(question.id);
    field.innerHTML = `
      <div class="audio-recorder">
        <button id="recordButton" class="record-button"><i></i><span>${recordingUrl ? "Record again" : "Start recording"}</span></button>
        <div class="recording-status"><strong>${recordingUrl ? "Recording ready" : "Use your microphone"}</strong><small>${recordingUrl ? "It will be embedded in the downloaded test." : "You can listen before downloading."}</small></div>
        ${recordingUrl ? `<audio controls src="${escapeAttribute(recordingUrl)}"></audio>` : ""}
      </div>`;
    $("#recordButton").addEventListener("click", () => toggleRecording(question));
  } else {
    const imageUrl = imageObjectUrls.get(question.id) || question.mediaUrl;
    field.innerHTML = `<button class="image-title-button" id="chooseImage">${imageUrl ? `<img src="${escapeAttribute(imageUrl)}" alt="Selected question image"><span>Change image</span>` : `<strong>Choose or drop an image</strong><span>The image will be the question title</span>`}</button>`;
    $("#chooseImage").addEventListener("click", () => imageDialog.showModal());
  }
}

function updatePrompt(event: Event) {
  selectedQuestion().prompt = (event.target as HTMLTextAreaElement).value;
  renderPreview(selectedQuestion());
  const selectedTitle = document.querySelector<HTMLElement>(".question-row.selected strong");
  if (selectedTitle) selectedTitle.textContent = selectedQuestion().prompt || "Text question";
  save();
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
      void storeAsset("audio", question.id, blob);
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
  $("#previewQuestion").textContent = question.prompt;
  $("#previewQuestion").hidden = !question.prompt || question.mediaType !== "none";
  const media = $("#previewMedia");
  const imageUrl = imageObjectUrls.get(question.id) || question.mediaUrl;
  if (question.mediaType === "image" && imageUrl) {
    media.innerHTML = `<img src="${escapeAttribute(imageUrl)}" alt="Question illustration" />`;
  } else if (question.mediaType === "audio" && audioObjectUrls.get(question.id)) {
    media.innerHTML = `<div class="embedded-audio"><span>Listen to the question</span><audio controls src="${escapeAttribute(audioObjectUrls.get(question.id)!)}"></audio></div>`;
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
    imageUrl: question.mediaType === "image" && imageFiles.has(question.id)
      ? await blobToDataUrl(imageFiles.get(question.id)!)
      : question.mediaType === "image" ? question.mediaUrl : "",
    audioUrl: question.mediaType === "audio" && audioRecordings.has(question.id)
      ? await blobToDataUrl(audioRecordings.get(question.id)!)
      : "",
  })));
  const projectName = projects.find((project) => project.id === activeProjectId)?.name ?? "Test";
  const safeData = JSON.stringify({ title: projectName, questions: testQuestions }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(projectName)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f3ee;color:#25302c;font:16px Arial,sans-serif}.wrap{max-width:720px;margin:34px auto;padding:0 16px 50px}header,.card,.results{background:#fff;border-radius:8px;padding:26px;margin-bottom:16px;box-shadow:0 5px 20px #0000000d}header{border-top:8px solid #176b52}h1{margin:0 0 8px}h3{margin-top:0}p{color:#66706b}.card.missed{border-left:5px solid #b74c3e}.card.correct{border-left:5px solid #25805e}img{display:block;max-width:100%;max-height:360px;border-radius:5px;margin:15px 0}audio{width:100%;margin:12px 0}.choice{display:block;padding:12px;border:1px solid #d9dcd8;border-radius:5px;margin:8px 0;cursor:pointer}.choice:has(input:checked){border-color:#176b52;background:#edf6f1}button{background:#176b52;color:#fff;border:0;border-radius:5px;padding:13px 24px;font-weight:bold;cursor:pointer}.results{display:none;text-align:center}.score{color:#176b52;font-size:54px;font-weight:bold;margin:8px}.review{font-size:14px;text-align:left}.answer{font-weight:bold}.wrong{color:#a43f33}.right{color:#176b52}@media(max-width:600px){.wrap{margin:12px auto}header,.card,.results{padding:20px}}
</style></head><body><main class="wrap"><header><h1 id="title"></h1><p>Choose the best answer for each question, then submit to see your score.</p></header><form id="quiz"></form><section class="results" id="results"><p>YOUR SCORE</p><div class="score" id="score"></div><div class="review" id="review"></div><button id="retry" type="button">Try again</button></section></main>
<script>const data=${safeData};const quiz=document.getElementById('quiz');document.getElementById('title').textContent=data.title;data.questions.forEach((q,i)=>{const card=document.createElement('section');card.className='card';card.id='question-'+i;if(q.prompt){const heading=document.createElement('h3');heading.textContent=(i+1)+'. '+q.prompt;card.append(heading)}if(q.imageUrl){const image=document.createElement('img');image.src=q.imageUrl;image.alt='Question '+(i+1);card.append(image)}if(q.audioUrl){const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=q.audioUrl;audio.setAttribute('aria-label','Question '+(i+1));card.append(audio)}q.choices.forEach((choice,j)=>{const label=document.createElement('label');label.className='choice';const input=document.createElement('input');input.type='radio';input.name='q'+i;input.value=String(j);input.required=q.required;label.append(input,document.createTextNode(' '+choice));card.append(label)});quiz.append(card)});const submit=document.createElement('button');submit.type='submit';submit.textContent='Grade my test';quiz.append(submit);quiz.addEventListener('submit',event=>{event.preventDefault();let correct=0;const review=document.getElementById('review');review.innerHTML='';data.questions.forEach((q,i)=>{const picked=document.querySelector('input[name=q'+i+']:checked');const answer=picked?Number(picked.value):-1;const isCorrect=answer===q.correct;if(isCorrect)correct++;const card=document.getElementById('question-'+i);card.classList.add(isCorrect?'correct':'missed');const line=document.createElement('p');line.innerHTML='<strong>Question '+(i+1)+'</strong><br><span class="'+(isCorrect?'right':'wrong')+'">'+(isCorrect?'Correct':'Your answer: '+(answer>=0?q.choices[answer]:'No answer'))+'</span>'+(isCorrect?'':'<br><span class="answer">Correct answer: '+q.choices[q.correct]+'</span>');review.append(line)});document.getElementById('score').textContent=correct+' / '+data.questions.length;quiz.style.display='none';document.getElementById('results').style.display='block';window.scrollTo({top:0,behavior:'smooth'})});document.getElementById('retry').addEventListener('click',()=>{quiz.reset();document.querySelectorAll('.card').forEach(card=>card.classList.remove('correct','missed'));quiz.style.display='block';document.getElementById('results').style.display='none';window.scrollTo({top:0,behavior:'smooth'})});</script></body></html>`;
}

$("#questionList").addEventListener("click", (event) => {
  const row = (event.target as HTMLElement).closest<HTMLButtonElement>(".question-row");
  if (!row) return;
  selectedId = Number(row.dataset.id);
  render();
});

$("#mediaPicker").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-media]");
  if (!button) return;
  const question = selectedQuestion();
  question.mediaType = button.dataset.media as Question["mediaType"];
  if (question.mediaType !== "none") question.prompt = "";
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
  imageFiles.delete(selectedId);
  void storeAsset("audio", selectedId, null);
  void storeAsset("image", selectedId, null);
  const audioUrl = audioObjectUrls.get(selectedId);
  const imageUrl = imageObjectUrls.get(selectedId);
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  audioObjectUrls.delete(selectedId);
  imageObjectUrls.delete(selectedId);
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

const imageDialog = $("#imageDialog") as HTMLDialogElement;
$("#closeImageDialog").addEventListener("click", () => imageDialog.close());
$("#imageInput").addEventListener("change", (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void setQuestionImage(file);
});
$("#imageDrop").addEventListener("dragover", (event) => { event.preventDefault(); $("#imageDrop").classList.add("dragging"); });
$("#imageDrop").addEventListener("dragleave", () => $("#imageDrop").classList.remove("dragging"));
$("#imageDrop").addEventListener("drop", (event) => {
  event.preventDefault();
  $("#imageDrop").classList.remove("dragging");
  const file = event.dataTransfer?.files[0];
  if (file?.type.startsWith("image/")) void setQuestionImage(file);
});
$("#helpButton").addEventListener("click", () => showToast("Create a project, choose each question title type, then download the test."));

async function setQuestionImage(file: File) {
  const question = selectedQuestion();
  const oldUrl = imageObjectUrls.get(question.id);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  imageFiles.set(question.id, file);
  imageObjectUrls.set(question.id, URL.createObjectURL(file));
  question.mediaUrl = "";
  await storeAsset("image", question.id, file);
  imageDialog.close();
  render();
}

$("#projectSelect").addEventListener("change", async (event) => {
  activeProjectId = (event.target as HTMLSelectElement).value;
  questions = projects.find((project) => project.id === activeProjectId)!.questions;
  selectedId = questions[0].id;
  nextId = Math.max(...questions.map((question) => question.id)) + 1;
  save();
  await loadAssets();
  render();
});
$("#newProject").addEventListener("click", async () => {
  const name = window.prompt("Project name", "Untitled test")?.trim();
  if (!name) return;
  const id = crypto.randomUUID();
  const question: Question = { id: 1, prompt: "", choices: ["", "", "", ""], correct: 0, mediaType: "none", mediaUrl: "", required: true };
  projects.push({ id, name, questions: [question] });
  activeProjectId = id;
  questions = [question];
  selectedId = 1;
  nextId = 2;
  save();
  await loadAssets();
  render();
});
$("#renameProject").addEventListener("click", () => {
  const project = projects.find((item) => item.id === activeProjectId)!;
  const name = window.prompt("Project name", project.name)?.trim();
  if (!name) return;
  project.name = name;
  save();
  render();
});
$("#deleteProject").addEventListener("click", async () => {
  if (projects.length === 1) return showToast("Keep at least one project");
  const project = projects.find((item) => item.id === activeProjectId)!;
  if (!window.confirm(`Delete “${project.name}”?`)) return;
  projects = projects.filter((item) => item.id !== activeProjectId);
  activeProjectId = projects[0].id;
  questions = projects[0].questions;
  selectedId = questions[0].id;
  save();
  await loadAssets();
  render();
});

$("#copyButton").addEventListener("click", async () => {
  const text = questions.map((question, index) => `${index + 1}. ${question.prompt}\n${question.mediaUrl ? `${question.mediaType.toUpperCase()}: ${question.mediaUrl}\n` : ""}${question.choices.map((choice, choiceIndex) => `${question.correct === choiceIndex ? "*" : ""}${String.fromCharCode(65 + choiceIndex)}) ${choice}`).join("\n")}`).join("\n\n");
  await navigator.clipboard.writeText(text);
  showToast("Question list copied");
});

$("#createButton").addEventListener("click", async () => {
  showToast("Packaging your test...");
  try {
    const html = await createTestHtml();
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url;
    const name = projects.find((project) => project.id === activeProjectId)?.name ?? "test";
    link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "test"}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Test downloaded and ready to share");
  } catch {
    showToast("The test could not be created. Please try again.");
  }
});

load();
loadAssets().finally(render);
