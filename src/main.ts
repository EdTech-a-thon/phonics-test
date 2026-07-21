import "./style.css";

type Question = {
  id: number;
  prompt: string;
  choices: string[];
  correct: number;
  responseType: "choice" | "multiple" | "text";
  correctChoices: number[];
  textAnswer: string;
  gradingMode: "exact" | "lenient";
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
    prompt: "Which word begins with the /sh/ sound?",
    choices: ["ship", "chip", "sip", "tip"],
    correct: 0,
    responseType: "choice",
    correctChoices: [0],
    textAnswer: "",
    gradingMode: "lenient",
    mediaType: "audio",
    mediaUrl: "",
    required: true,
  },
  {
    id: 2,
    prompt: "Which picture shows a nocturnal animal?",
    choices: ["Owl", "Butterfly", "Squirrel", "Bee"],
    correct: 0,
    responseType: "choice",
    correctChoices: [0],
    textAnswer: "",
    gradingMode: "lenient",
    mediaType: "image",
    mediaUrl: "https://images.unsplash.com/photo-1579019163248-e7761241d85a?w=900",
    required: true,
  },
  {
    id: 3,
    prompt: "How many syllables are in 'elephant'?",
    choices: ["Two", "Three", "Four", "Five"],
    correct: 1,
    responseType: "choice",
    correctChoices: [1],
    textAnswer: "",
    gradingMode: "lenient",
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
    <a class="brand" href="#">Test Builder</a>
    <div class="project-controls">
      <select id="projectSelect" aria-label="Current project"></select>
      <button id="newProject">+ New project</button>
      <button id="renameProject">Rename</button>
      <button id="deleteProject">Delete</button>
    </div>
    <div class="top-actions">
      <span class="save-state">Saved locally</span>
      <button id="importTest">Import test</button>
    </div>
  </header>
  <main>
    <input id="imageInput" class="visually-hidden" type="file" accept="image/*" />
    <section class="workspace">
      <aside class="question-list-panel">
        <div class="panel-heading">
          <div><span>Questions</span><small id="panelCount">3 total</small></div>
          <button class="icon-button" id="addQuestion" aria-label="Add question">+</button>
        </div>
        <div id="questionList" class="question-list"></div>
      </aside>

      <section class="editor-panel">
        <div class="editor-topline">
          <span id="editorNumber">QUESTION 01</span>
          <div>
            <button class="mini-button" id="duplicateButton">Duplicate</button>
            <button class="mini-button danger" id="deleteButton">Delete</button>
          </div>
        </div>
        <div class="question-title-box">
          <label class="field-label" for="prompt">Question text <span>Optional</span></label>
          <textarea id="prompt" rows="3" placeholder="Add instructions or a question"></textarea>
          <div class="media-header">
            <label class="field-label">Media <span>Optional</span></label>
            <div class="segmented" id="mediaPicker">
              <button data-media="none">None</button>
              <button data-media="image">Picture</button>
              <button data-media="audio">Audio</button>
            </div>
          </div>
          <div id="mediaField"></div>
        </div>

        <div class="answers-heading">
          <label class="field-label">Response</label>
          <div class="segmented" id="responsePicker">
            <button data-response="choice">Multiple choice</button>
            <button data-response="multiple">Select all</button>
            <button data-response="text">Text answer</button>
          </div>
        </div>
        <div id="answerEditor"></div>

        <div class="editor-footer">
          <label class="toggle-row"><input type="checkbox" id="required" /><span class="toggle"></span> Required question</label>
          <div class="nav-buttons"><button id="previousButton">← Previous</button><button id="nextButton">Next →</button></div>
        </div>
      </section>

      <aside class="preview-panel">
        <div class="preview-heading"><span>Preview</span></div>
        <div class="form-preview">
          <div class="preview-accent"></div>
          <div class="preview-body">
            <p id="previewQuestion"></p>
            <div id="previewMedia"></div>
            <div id="previewAnswer"></div>
          </div>
        </div>
      </aside>
    </section>

    <section class="finish-bar">
      <div><strong id="readyText">3 questions</strong><small>The downloaded HTML file contains the complete test.</small></div>
      <button class="primary" id="createButton">Download test</button>
    </section>
  </main>

  <input id="importInput" class="visually-hidden" type="file" accept=".html,text/html" />

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
      parsed.forEach((project) => project.questions.forEach((question) => {
        question.responseType ??= "choice";
        question.correctChoices ??= [question.correct];
        question.textAnswer ??= "";
        question.gradingMode ??= "lenient";
        if (project.id === "demo" && question.id === 1 && !question.prompt) question.prompt = "Which word begins with the /sh/ sound?";
        if (project.id === "demo" && question.id === 2 && !question.prompt) question.prompt = "Which picture shows a nocturnal animal?";
      }));
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
  $("#readyText").textContent = `${questions.length} question${questions.length === 1 ? "" : "s"}`;
  $("#editorNumber").textContent = `Question ${index + 1}`;

  $("#questionList").innerHTML = questions.map((item, itemIndex) => `
    <button class="question-row ${item.id === selectedId ? "selected" : ""}" data-id="${item.id}">
      <span>${String(itemIndex + 1).padStart(2, "0")}</span>
      <div><strong>${escapeHtml(item.prompt || `${item.mediaType === "none" ? "Untitled" : item.mediaType} question`)}</strong><small>${item.responseType === "text" ? "text answer" : item.responseType === "multiple" ? "select all" : `${item.choices.length} choices`} ${item.mediaType !== "none" ? `· ${item.mediaType}` : ""}</small></div>
      <i>›</i>
    </button>`).join("");

  $<HTMLInputElement>("#required").checked = question.required;
  $<HTMLTextAreaElement>("#prompt").value = question.prompt;
  document.querySelectorAll<HTMLButtonElement>("#mediaPicker button").forEach((button) => button.classList.toggle("active", button.dataset.media === question.mediaType));
  document.querySelectorAll<HTMLButtonElement>("#responsePicker button").forEach((button) => button.classList.toggle("active", button.dataset.response === question.responseType));
  renderMediaField(question);
  renderAnswerEditor(question);
  renderPreview(question);
  save();
}

function renderMediaField(question: Question) {
  const field = $("#mediaField");
  if (question.mediaType === "none") {
    field.innerHTML = "";
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
    const imageButton = $("#chooseImage");
    imageButton.addEventListener("click", () => $<HTMLInputElement>("#imageInput").click());
    imageButton.addEventListener("dragover", (event) => { event.preventDefault(); imageButton.classList.add("dragging"); });
    imageButton.addEventListener("dragleave", () => imageButton.classList.remove("dragging"));
    imageButton.addEventListener("drop", (event) => {
      event.preventDefault();
      imageButton.classList.remove("dragging");
      const file = event.dataTransfer?.files[0];
      if (file?.type.startsWith("image/")) void setQuestionImage(file);
    });
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

function renderAnswerEditor(question: Question) {
  const editor = $("#answerEditor");
  if (question.responseType === "text") {
    editor.innerHTML = `
      <label class="text-answer-field">
        <span>Correct answer</span>
        <input id="textAnswer" value="${escapeAttribute(question.textAnswer)}" placeholder="Enter the answer students should give" />
      </label>
      <fieldset class="grading-options">
        <legend>Grading</legend>
        <label><input type="radio" name="gradingMode" value="lenient" ${question.gradingMode === "lenient" ? "checked" : ""}> Lenient <small>Ignore capital letters and extra spaces</small></label>
        <label><input type="radio" name="gradingMode" value="exact" ${question.gradingMode === "exact" ? "checked" : ""}> Exact match <small>Answer must match exactly</small></label>
      </fieldset>`;
    return;
  }
  editor.innerHTML = `<div class="choices">${question.choices.map((choice, index) => `
      <div class="choice-row ${question.responseType === "multiple" ? question.correctChoices.includes(index) ? "correct" : "" : question.correct === index ? "correct" : ""}">
        <button class="radio ${question.responseType === "multiple" ? "checkbox-key" : ""}" data-correct="${index}" aria-label="Mark choice ${index + 1} as correct">${question.responseType === "multiple" ? question.correctChoices.includes(index) ? "✓" : "" : question.correct === index ? "✓" : ""}</button>
        <input data-choice="${index}" value="${escapeAttribute(choice)}" aria-label="Choice ${index + 1}" />
        <button class="remove-choice" data-remove="${index}" aria-label="Remove choice">×</button>
      </div>`).join("")}</div><button id="addChoice" class="add-choice">+ Add another choice</button>`;
}

function renderPreview(question: Question) {
  $("#previewQuestion").textContent = question.prompt;
  $("#previewQuestion").hidden = !question.prompt;
  const media = $("#previewMedia");
  const imageUrl = imageObjectUrls.get(question.id) || question.mediaUrl;
  if (question.mediaType === "image" && imageUrl) {
    media.innerHTML = `<img src="${escapeAttribute(imageUrl)}" alt="Question illustration" />`;
  } else if (question.mediaType === "audio" && audioObjectUrls.get(question.id)) {
    media.innerHTML = `<div class="embedded-audio"><span>Listen to the question</span><audio controls src="${escapeAttribute(audioObjectUrls.get(question.id)!)}"></audio></div>`;
  } else {
    media.innerHTML = "";
  }
  $("#previewAnswer").innerHTML = question.responseType === "text"
    ? `<input class="preview-text-answer" placeholder="Type your answer" disabled />`
    : question.choices.map((choice) => `<label class="preview-choice ${question.responseType === "multiple" ? "multiple" : ""}"><i></i>${escapeHtml(choice || "Empty choice")}</label>`).join("");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}

function addQuestion() {
  const question: Question = { id: nextId++, prompt: "", choices: ["", "", "", ""], correct: 0, correctChoices: [0], responseType: "choice", textAnswer: "", gradingMode: "lenient", mediaType: "none", mediaUrl: "", required: true };
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

function findIncompleteQuestion() {
  return questions.findIndex((question) => {
    const hasMedia = question.mediaType === "image"
      ? imageFiles.has(question.id) || Boolean(question.mediaUrl)
      : question.mediaType === "audio" && audioRecordings.has(question.id);
    if (!question.prompt.trim() && !hasMedia) return true;
    if (question.responseType === "text") return !question.textAnswer.trim();
    if (question.choices.length < 2 || question.choices.some((choice) => !choice.trim())) return true;
    return question.responseType === "multiple"
      ? question.correctChoices.length === 0
      : !question.choices[question.correct]?.trim();
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
    correctChoices: question.correctChoices,
    responseType: question.responseType,
    textAnswer: question.textAnswer,
    gradingMode: question.gradingMode,
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
  const projectData = JSON.stringify({ version: 1, name: projectName, questions: testQuestions }).replace(/-->/g, "--\\u003e");

  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(projectName)}</title><!--TEST_BUILDER_DATA:${projectData}--><style>
*{box-sizing:border-box}body{margin:0;background:#f2f1ee;color:#292c2f;font:16px Arial,sans-serif}.wrap{max-width:720px;margin:28px auto;padding:0 16px 50px}header,.card,.results{background:#fff;border:1px solid #d4d2cc;border-radius:8px;padding:24px;margin-bottom:14px}header{border-top:5px solid #536b78}h1{margin:0 0 8px}h3{margin:0 0 16px}p{color:#60656a}.question-number{margin:0 0 7px;font-size:12px;font-weight:bold;color:#6b7073}.card.missed{border-left:5px solid #9a514d}.card.correct{border-left:5px solid #567260}img{display:block;max-width:100%;max-height:360px;margin:15px 0;border-radius:4px}audio{width:100%;margin:12px 0}.choice{display:block;padding:12px;border:1px solid #d4d2cc;border-radius:5px;margin:8px 0;cursor:pointer}.choice:has(input:checked){border-color:#536b78;background:#edf1f3}.written-row{display:flex;gap:8px}.written{min-width:0;flex:1;padding:12px;border:1px solid #bcbab4;border-radius:5px;font:inherit}.dictate{white-space:nowrap;background:#fff;color:#455b66}button{background:#536b78;color:#fff;border:1px solid #455b66;border-radius:5px;padding:12px 22px;font-weight:bold;cursor:pointer}.results{display:none;text-align:center}.score{font-size:48px;font-weight:bold;margin:8px}.review{font-size:14px;text-align:left}.answer{font-weight:bold}.wrong{color:#9a514d}.right{color:#567260}@media(max-width:600px){.wrap{margin:12px auto}header,.card,.results{padding:18px}.written-row{display:grid}}@media(prefers-color-scheme:dark){body{color-scheme:dark;background:#1d2022;color:#e4e5e3}header,.card,.results{border-color:#484c4e;background:#292c2e}header{border-top-color:#91aab4}p,.question-number{color:#aeb2b3}.choice{border-color:#505557;background:#25282a}.choice:has(input:checked){border-color:#91aab4;background:#303b40}.written{border-color:#555a5c;background:#222527;color:#e6e7e5}.dictate{border-color:#68777d;background:#292c2e;color:#c4d3d8}button{border-color:#71868e;background:#607c88}.card.missed{border-left-color:#cf8983}.card.correct{border-left-color:#82a08b}.wrong{color:#e19a94}.right{color:#9ac2a6}}
</style></head><body><main class="wrap"><header><h1 id="title"></h1><p>Answer each question, then submit to see your score.</p></header><form id="quiz"></form><section class="results" id="results"><p>Score</p><div class="score" id="score"></div><div class="review" id="review"></div><button id="retry" type="button">Try again</button></section></main>
<script>const data=${safeData};const quiz=document.getElementById('quiz');const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;const normalize=value=>value.trim().replace(/\\s+/g,' ').toLocaleLowerCase();document.getElementById('title').textContent=data.title;data.questions.forEach((q,i)=>{const card=document.createElement('section');card.className='card';card.id='question-'+i;const number=document.createElement('p');number.className='question-number';number.textContent='Question '+(i+1);card.append(number);if(q.prompt){const heading=document.createElement('h3');heading.textContent=q.prompt;card.append(heading)}if(q.imageUrl){const image=document.createElement('img');image.src=q.imageUrl;image.alt='Question '+(i+1);card.append(image)}if(q.audioUrl){const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=q.audioUrl;audio.setAttribute('aria-label','Question '+(i+1));card.append(audio)}if(q.responseType==='text'){const row=document.createElement('div');row.className='written-row';const input=document.createElement('input');input.type='text';input.name='q'+i;input.className='written';input.placeholder='Type your answer';input.required=q.required;row.append(input);if(SpeechRecognition){const dictate=document.createElement('button');dictate.type='button';dictate.className='dictate';dictate.textContent='Use voice';dictate.title='Speak an answer instead of typing';dictate.addEventListener('click',()=>{const recognition=new SpeechRecognition();recognition.lang=document.documentElement.lang||'en';recognition.interimResults=false;dictate.disabled=true;dictate.textContent='Listening…';recognition.addEventListener('result',event=>{input.value=event.results[0][0].transcript;input.focus()});recognition.addEventListener('end',()=>{dictate.disabled=false;dictate.textContent='Use voice'});recognition.addEventListener('error',()=>{dictate.disabled=false;dictate.textContent='Use voice'});recognition.start()});row.append(dictate)}card.append(row)}else{if(q.responseType==='multiple'){const note=document.createElement('p');note.className='select-note';note.textContent='Select all that apply.';card.append(note)}q.choices.forEach((choice,j)=>{const label=document.createElement('label');label.className='choice';const input=document.createElement('input');input.type=q.responseType==='multiple'?'checkbox':'radio';input.name='q'+i;input.value=String(j);input.required=q.required&&q.responseType!=='multiple';label.append(input,document.createTextNode(' '+choice));card.append(label)})}quiz.append(card)});const submit=document.createElement('button');submit.type='submit';submit.textContent='Grade my test';quiz.append(submit);quiz.addEventListener('submit',event=>{event.preventDefault();let correct=0;const review=document.getElementById('review');review.innerHTML='';data.questions.forEach((q,i)=>{let answer;let answerLabel;let expected;if(q.responseType==='text'){const input=document.querySelector('input[name=q'+i+']');answer=input.value;answerLabel=answer||'No answer';expected=q.textAnswer;var isCorrect=q.gradingMode==='exact'?answer===expected:normalize(answer)===normalize(expected)}else if(q.responseType==='multiple'){answer=[...document.querySelectorAll('input[name=q'+i+']:checked')].map(input=>Number(input.value)).sort((a,b)=>a-b);answerLabel=answer.length?answer.map(index=>q.choices[index]).join(', '):'No answer';const correctAnswers=(q.correctChoices||[]).slice().sort((a,b)=>a-b);expected=correctAnswers.map(index=>q.choices[index]).join(', ');var isCorrect=answer.length===correctAnswers.length&&answer.every((value,index)=>value===correctAnswers[index])}else{const picked=document.querySelector('input[name=q'+i+']:checked');answer=picked?Number(picked.value):-1;answerLabel=answer>=0?q.choices[answer]:'No answer';expected=q.choices[q.correct];var isCorrect=answer===q.correct}if(isCorrect)correct++;const card=document.getElementById('question-'+i);card.classList.add(isCorrect?'correct':'missed');const line=document.createElement('p');const label=document.createElement('strong');label.textContent='Question '+(i+1);const result=document.createElement('span');result.className=isCorrect?'right':'wrong';result.textContent=isCorrect?'Correct':'Your answer: '+answerLabel;line.append(label,document.createElement('br'),result);if(!isCorrect){const answerLine=document.createElement('span');answerLine.className='answer';answerLine.textContent='Correct answer: '+expected;line.append(document.createElement('br'),answerLine)}review.append(line)});document.getElementById('score').textContent=correct+' / '+data.questions.length;quiz.style.display='none';document.getElementById('results').style.display='block';window.scrollTo({top:0,behavior:'smooth'})});document.getElementById('retry').addEventListener('click',()=>{quiz.reset();document.querySelectorAll('.card').forEach(card=>card.classList.remove('correct','missed'));quiz.style.display='block';document.getElementById('results').style.display='none';window.scrollTo({top:0,behavior:'smooth'})});</script></body></html>`;
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
  render();
});

$("#prompt").addEventListener("input", updatePrompt);

$("#responsePicker").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-response]");
  if (!button) return;
  selectedQuestion().responseType = button.dataset.response as Question["responseType"];
  render();
});

$("#answerEditor").addEventListener("input", (event) => {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>("input[data-choice]");
  if (input) selectedQuestion().choices[Number(input.dataset.choice)] = input.value;
  const textAnswer = (event.target as HTMLElement).closest<HTMLInputElement>("#textAnswer");
  if (textAnswer) selectedQuestion().textAnswer = textAnswer.value;
  renderPreview(selectedQuestion());
  save();
});

$("#answerEditor").addEventListener("change", (event) => {
  const gradingMode = (event.target as HTMLElement).closest<HTMLInputElement>('input[name="gradingMode"]');
  if (!gradingMode) return;
  selectedQuestion().gradingMode = gradingMode.value as Question["gradingMode"];
  save();
});

$("#answerEditor").addEventListener("click", (event) => {
  const correct = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-correct]");
  const remove = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-remove]");
  const addChoiceButton = (event.target as HTMLElement).closest<HTMLButtonElement>("#addChoice");
  if (correct) {
    const question = selectedQuestion();
    const correctIndex = Number(correct.dataset.correct);
    if (question.responseType === "multiple") {
      question.correctChoices = question.correctChoices.includes(correctIndex)
        ? question.correctChoices.filter((index) => index !== correctIndex)
        : [...question.correctChoices, correctIndex].sort((a, b) => a - b);
    } else {
      question.correct = correctIndex;
      question.correctChoices = [correctIndex];
    }
    document.querySelectorAll(".choice-row").forEach((row, index) => {
      const isCorrect = question.responseType === "multiple" ? question.correctChoices.includes(index) : index === question.correct;
      row.classList.toggle("correct", isCorrect);
      const button = row.querySelector<HTMLButtonElement>(".radio")!;
      button.textContent = isCorrect ? "✓" : "";
    });
    save();
  }
  if (remove && selectedQuestion().choices.length > 2) {
    const index = Number(remove.dataset.remove);
    selectedQuestion().choices.splice(index, 1);
    if (selectedQuestion().correct >= selectedQuestion().choices.length) selectedQuestion().correct = 0;
    selectedQuestion().correctChoices = selectedQuestion().correctChoices
      .filter((correctIndex) => correctIndex !== index)
      .map((correctIndex) => correctIndex > index ? correctIndex - 1 : correctIndex);
    render();
  }
  if (addChoiceButton) {
    selectedQuestion().choices.push("");
    render();
  }
});

$("#required").addEventListener("change", (event) => {
  selectedQuestion().required = (event.target as HTMLInputElement).checked;
  save();
});

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

$("#imageInput").addEventListener("change", (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void setQuestionImage(file);
});

async function setQuestionImage(file: File) {
  const question = selectedQuestion();
  const oldUrl = imageObjectUrls.get(question.id);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  imageFiles.set(question.id, file);
  imageObjectUrls.set(question.id, URL.createObjectURL(file));
  question.mediaUrl = "";
  await storeAsset("image", question.id, file);
  $<HTMLInputElement>("#imageInput").value = "";
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
  const question: Question = { id: 1, prompt: "", choices: ["", "", "", ""], correct: 0, correctChoices: [0], responseType: "choice", textAnswer: "", gradingMode: "lenient", mediaType: "none", mediaUrl: "", required: true };
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

$("#importTest").addEventListener("click", () => $<HTMLInputElement>("#importInput").click());
$("#importInput").addEventListener("change", async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const html = await file.text();
    const match = html.match(/<!--TEST_BUILDER_DATA:(.*?)-->/s);
    if (!match) throw new Error("Missing project data");
    const imported = JSON.parse(match[1]) as {
      name?: string;
      questions?: Array<{
        prompt: string;
        choices: string[];
        correct: number;
        correctChoices?: number[];
        responseType: Question["responseType"];
        textAnswer: string;
        gradingMode: Question["gradingMode"];
        required: boolean;
        imageUrl: string;
        audioUrl: string;
      }>;
    };
    if (!imported.questions?.length) throw new Error("No questions");
    const id = crypto.randomUUID();
    const importedQuestions = imported.questions.map((question, index): Question => ({
      id: index + 1,
      prompt: question.prompt ?? "",
      choices: question.choices ?? ["", ""],
      correct: question.correct ?? 0,
      correctChoices: question.correctChoices ?? [question.correct ?? 0],
      responseType: question.responseType ?? "choice",
      textAnswer: question.textAnswer ?? "",
      gradingMode: question.gradingMode ?? "lenient",
      mediaType: question.imageUrl ? "image" : question.audioUrl ? "audio" : "none",
      mediaUrl: question.imageUrl?.startsWith("data:") ? "" : question.imageUrl ?? "",
      required: question.required ?? true,
    }));
    projects.push({ id, name: `${imported.name || file.name.replace(/\.html?$/i, "")} (imported)`, questions: importedQuestions });
    activeProjectId = id;
    questions = importedQuestions;
    selectedId = questions[0].id;
    nextId = questions.length + 1;
    save();
    for (let index = 0; index < imported.questions.length; index++) {
      const source = imported.questions[index];
      if (source.audioUrl?.startsWith("data:")) await storeAsset("audio", index + 1, dataUrlToBlob(source.audioUrl));
      if (source.imageUrl?.startsWith("data:")) await storeAsset("image", index + 1, dataUrlToBlob(source.imageUrl));
    }
    await loadAssets();
    render();
    showToast("Test imported as a new project");
  } catch {
    showToast("This file was not created by Test Builder or is damaged");
  } finally {
    input.value = "";
  }
});

function dataUrlToBlob(dataUrl: string) {
  const [metadata, data] = dataUrl.split(",");
  const mimeType = metadata.match(/^data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const bytes = atob(data);
  const output = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index++) output[index] = bytes.charCodeAt(index);
  return new Blob([output], { type: mimeType });
}

$("#createButton").addEventListener("click", async () => {
  const incompleteIndex = findIncompleteQuestion();
  if (incompleteIndex >= 0) {
    selectedId = questions[incompleteIndex].id;
    render();
    showToast(`Complete the question and answer key for question ${incompleteIndex + 1}`);
    return;
  }
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
