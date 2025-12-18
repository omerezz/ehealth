let GAME = null;

// =========================
// State
// =========================
const state = {
  activeIndex: 0, // The furthest unlocked stage
  viewIndex: 0,   // The stage currently being displayed
  score: 0,
  hintsUsedTotal: 0,
  hintsUnlockedIds: [],
  perStep: [],
  timerId: null,
  timeLeft: 1800,
  timePaused: false,
  pendingAction: null,
  view: "question",
  globalUsedCall: false,
  globalUsed5050: false,
  stackIndexes: {} 
};

// =========================
// DOM Elements
// =========================
const $ = (id) => document.getElementById(id);
const el = {
  hudScore: () => $("hudScore"),
  hudTime: () => $("hudTime"),
  teamBanner: () => $("teamBanner"),
  questionView: () => $("questionView"),
  finalView: () => $("finalView"),
  
  stepTitle: () => $("stepTitle"),
  stepQuestion: () => $("stepQuestion"),
  optionsRow: () => $("optionsRow"),
  explainBar: () => $("explainBar"),
  
  ddWrap: () => $("ddWrap"),
  ddGrid: () => $("ddGrid"),
  ddLabels: () => $("ddLabels"),
  ddSubmit: () => $("ddSubmit"),

  lifeHint: () => $("lifeHint"),
  life5050: () => $("life5050"),
  lifeCall: () => $("lifeCall"),
  
  hintModal: () => $("hintModal"),
  callModal: () => $("callModal"),
  resultModal: () => $("resultModal"),
  
  successModal: () => $("successModal"),
  successTitle: () => $("successTitle"),
  successBody: () => $("successBody"),
  successNext: () => $("successNext"),
  
  btnNext: () => $("btnNext"),
  progressBar: () => $("progressBar"),
  
  finalScore: () => $("finalScore"),
  finalTime: () => $("finalTime"),
  btnCertificate: () => $("btnCertificate")
};

// =========================
// Helpers
// =========================
function getStep(i) { return GAME.steps[i]; }
function ensurePerStep(i) {
  if (!state.perStep[i]) {
    state.perStep[i] = {
      completed: false,
      success: false,
      attempts: 0,
      removedBy5050: [],
      ddAssign: {},
      pwdEntered: "",
      textValue: "",
      used5050: false,
      usedCall: false,
      hintsUnlocked: { "25": false, "50": false }
    };
  }
  return state.perStep[i];
}
function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function setScore(n) {
  state.score = n;
  el.hudScore().textContent = `SCORE: ${state.score}`;
}
function addScore(delta) { setScore(state.score + delta); }

function startTimer(seconds) {
  state.timeLeft = seconds;
  updateTimeUI();
  state.timerId = setInterval(() => {
    if (!state.timePaused) {
      state.timeLeft--;
      updateTimeUI();
      if (state.timeLeft <= 0) endGame();
    }
  }, 1000);
}
function updateTimeUI() {
  el.hudTime().textContent = `TIME: ${formatTime(state.timeLeft)}`;
  if (state.timeLeft < 180) el.hudTime().classList.add("time-danger");
}
function pauseTimer() { state.timePaused = true; }
function resumeTimer() { state.timePaused = false; }

function lifelinesAllowed(stepType) {
  if (stepType === 'mcq') return { hint: true, fifty: true, call: true };
  if (stepType === 'password') return { hint: true, fifty: false, call: true };
  if (stepType === 'dragdrop') return { hint: true, fifty: false, call: true };
  return { hint: false, fifty: false, call: false };
}

function updateLifelineButtons() {
  const i = state.viewIndex; // Only allow lifelines for current view if active?
  // Ideally only allow usage if viewing the active frontier.
  const isFrontier = (state.viewIndex === state.activeIndex);
  
  const step = getStep(i);
  const ps = ensurePerStep(i);
  const allow = lifelinesAllowed(step.type);
  const hintsLeft = GAME.game.max_hints_total - state.hintsUsedTotal;

  el.lifeHint().classList.toggle("hidden", !allow.hint);
  el.life5050().classList.toggle("hidden", !allow.fifty);
  el.lifeCall().classList.toggle("hidden", !allow.call);

  // Disable lifelines if browsing history
  if (!isFrontier || ps.completed) {
      el.lifeHint().disabled = true;
      el.life5050().disabled = true;
      el.lifeCall().disabled = true;
      return;
  }

  const hintsEmpty = hintsLeft <= 0;
  el.lifeHint().disabled = hintsEmpty;
  el.lifeHint().classList.toggle("used-up", hintsEmpty);

  const fiftyUsed = ps.used5050 || state.globalUsed5050;
  el.life5050().disabled = fiftyUsed;
  el.life5050().classList.toggle("used-up", fiftyUsed);

  const callUsed = ps.usedCall || state.globalUsedCall;
  el.lifeCall().disabled = callUsed;
  el.lifeCall().classList.toggle("used-up", callUsed);
}

function renderCurrent() {
  const i = state.viewIndex;
  const step = getStep(i);
  const ps = ensurePerStep(i);
  const locked = (state.viewIndex < state.activeIndex) || ps.completed;

  // Update Progress Bar (Based on activeIndex to show real progress, or viewIndex?)
  // Let's show progress based on Active Index (real progress)
  const pct = ((state.activeIndex) / GAME.steps.length) * 100;
  if(el.progressBar()) el.progressBar().style.width = `${pct}%`;

  el.optionsRow().className = "options-row"; 
  el.stepTitle().textContent = step.title;
  el.stepQuestion().textContent = step.question;
  
  $("questionView").classList.remove("hidden");
  $("finalView").classList.add("hidden");
  updateLifelineButtons();
  clearInputs();

  if (step.type === 'mcq') renderMCQ(step, ps, locked);
  else if (step.type === 'password') renderPassword(step, ps, locked);
  else if (step.type === 'dragdrop') renderDragDrop(step, ps, locked);
  else if (step.type === 'textbox') renderTextbox(step, ps, locked);
  else if (step.type === 'info') renderInfo(step, ps);

  // === NAVIGATION LOGIC (THE FIX) ===
  
  // 1. Back Button: Always allowed unless at start
  $("btnBack").disabled = (state.viewIndex === 0);
  $("btnBack").onclick = () => {
      state.viewIndex = Math.max(0, state.viewIndex - 1);
      renderCurrent();
  };
  
  // 2. Next Button Logic
  const btn = el.btnNext();
  
  // Scenario A: We are browsing history (viewIndex < activeIndex)
  if (state.viewIndex < state.activeIndex) {
      btn.classList.remove("hidden");
      btn.textContent = "NEXT";
      // Remove pulse animation for simple nav
      btn.style.animation = "none"; 
      btn.onclick = () => {
          state.viewIndex = Math.min(state.activeIndex, state.viewIndex + 1);
          renderCurrent();
      };
  }
  // Scenario B: We are at the frontier (viewIndex == activeIndex)
  else {
      // Only show if completed
      if (ps.completed) {
          btn.classList.remove("hidden");
          btn.textContent = "NEXT STAGE";
          btn.style.animation = ""; // Restore CSS pulse
          btn.onclick = advanceLevel;
      } else {
          btn.classList.add("hidden");
          btn.onclick = null;
      }
  }
}

function clearInputs() {
  el.optionsRow().innerHTML = "";
  el.ddWrap().classList.add("hidden");
  el.explainBar().classList.add("hidden");
}

// --- RENDERERS ---


function renderMCQ(step, ps, locked) {
  el.stepQuestion().textContent = step.question;

  // --- MEDIA DISPLAY LOGIC ---

  // 1. Handle GIFs (Single or Multiple)
  if (step.media_type === 'gif') {
      const container = document.createElement("div");
      container.className = "gif-row"; 
      
      // Determine if we have a list of GIFs or just one (support 'gif' array or 'image' string)
      let files = [];
      if (Array.isArray(step.gif)) files = step.gif;
      else if (typeof step.gif === 'string') files = [step.gif];
      else if (step.image) files = [step.image];

      files.forEach(filename => {
          const img = document.createElement("img");
          img.src = `/static/images/${filename}`;
          img.className = "step-gif";
          img.onerror = function() { this.style.display='none'; };
          container.appendChild(img);
      });
      el.stepQuestion().appendChild(document.createElement("br"));
      el.stepQuestion().appendChild(container);
  }

  // 2. Handle Image Stacks (Legacy)
  else if (step.media_type === 'image_stacks' && step.stack_data) {
      renderImageStacks(step.stack_data);
  }

  // 3. Handle Standard Static Image (THE FIX for Stage 10)
  else if (step.image) {
      const img = document.createElement("img");
      img.src = `/static/images/${step.image}`;
      img.className = "step-image";
      // Styling to ensure it looks good
      img.style.display = "block";
      img.style.margin = "20px auto";
      img.style.maxWidth = "100%";
      img.onerror = function() { this.style.display='none'; };
      el.stepQuestion().appendChild(img);
  }

  // --- RENDER OPTIONS ---
  step.options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.textContent = opt;
    if (ps.removedBy5050.includes(opt)) {
      btn.classList.add("option-blur");
      btn.disabled = true;
    }
    if (locked) {
      btn.disabled = true;
      if (opt === step.answer) btn.classList.add("correct");
      else if (opt === ps.selectedAnswer) btn.classList.add("wrong");
    } else {
      btn.onclick = (e) => handleMCQSubmit(step, opt, e.target);
    }
    el.optionsRow().appendChild(btn);
  });
}

function renderImageStacks(stacks) {
    const container = document.createElement('div');
    container.className = "image-stacks-container";
    const stackIdBase = `s_${state.activeIndex}_`;
    stacks.forEach((stackFiles, stackIdx) => {
        const uId = stackIdBase + stackIdx;
        state.stackIndexes[uId] = state.stackIndexes[uId] || 0;
        const col = document.createElement('div');
        col.className = "stack-col";
        const titles = ["T2 Weighted", "DWI", "ADC Map"];
        col.innerHTML = `<div class="stack-header">${titles[stackIdx] || "Series " + (stackIdx+1)}</div>`;
        const viewer = document.createElement('div');
        viewer.className = "stack-viewer";
        const img = document.createElement('img');
        img.src = `/static/images/${stackFiles[state.stackIndexes[uId]]}`;
        img.draggable = false;
        const overlay = document.createElement('div');
        overlay.className = "stack-overlay";
        overlay.textContent = `IMG ${state.stackIndexes[uId] + 1} / ${stackFiles.length}`;
        const scrollTrack = document.createElement('div');
        scrollTrack.className = "stack-scrollbar";
        const scrollThumb = document.createElement('div');
        scrollThumb.className = "stack-thumb";
        const thumbH = Math.max(10, 100 / stackFiles.length); 
        scrollThumb.style.height = `${thumbH}%`;
        const updateThumb = () => {
             const pct = (state.stackIndexes[uId] / (stackFiles.length - 1)) * (100 - thumbH);
             scrollThumb.style.top = `${pct}%`;
        };
        updateThumb();
        scrollTrack.appendChild(scrollThumb);

        const updateImage = (newIdx) => {
            if (newIdx < 0) newIdx = 0;
            if (newIdx >= stackFiles.length) newIdx = stackFiles.length - 1;
            state.stackIndexes[uId] = newIdx;
            img.src = `/static/images/${stackFiles[newIdx]}`;
            overlay.textContent = `IMG ${newIdx + 1} / ${stackFiles.length}`;
            updateThumb();
        };
        viewer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const dir = e.deltaY > 0 ? 1 : -1;
            updateImage(state.stackIndexes[uId] + dir);
        });
        let isDragging = false;
        let startY = 0;
        let startIndex = 0;
        viewer.addEventListener('mousedown', (e) => {
            isDragging = true;
            startY = e.clientY;
            startIndex = state.stackIndexes[uId];
            viewer.style.cursor = 'grabbing';
        });
        window.addEventListener('mouseup', () => { isDragging = false; viewer.style.cursor = 'ns-resize'; });
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const deltaY = e.clientY - startY;
            const steps = Math.floor(deltaY / 10);
            updateImage(startIndex + steps);
        });
        viewer.appendChild(img);
        viewer.appendChild(overlay);
        viewer.appendChild(scrollTrack);
        col.appendChild(viewer);
        container.appendChild(col);
    });
    el.stepQuestion().insertAdjacentElement('afterbegin', container);
}

function renderPassword(step, ps, locked) {
  let htmlContent = `<div>${step.question}</div>`;
  if (step.pdf_link) htmlContent += `<a href="${step.pdf_link}" target="_blank" class="pdf-link-btn">📄 OPEN PATIENT FILE (PDF)</a>`;
  if (step.image) htmlContent += `<div class="step-image-container"><img src="/static/images/${step.image}" class="step-image" alt="Clue" onerror="this.style.display='none'"></div>`;
  el.stepQuestion().innerHTML = htmlContent;

  const container = document.createElement("div");
  container.className = "pwd-container";
  const input = document.createElement("input");
  input.className = "pwd-inline-input";
  input.placeholder = "Enter Magic Word...";
  input.value = ps.pwdEntered || "";
  input.disabled = locked;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !locked) handlePasswordSubmit(step, input.value);
  });
  const btn = document.createElement("button");
  btn.className = "btn-pill btn-primary";
  btn.textContent = locked ? "LOCKED" : "UNLOCK";
  btn.disabled = locked;
  btn.onclick = () => handlePasswordSubmit(step, input.value);
  container.appendChild(input);
  container.appendChild(btn);
  el.optionsRow().appendChild(container);
  if (!locked) input.focus();
}

function renderDragDrop(step, ps, locked) {
  el.stepQuestion().textContent = step.question;
  el.ddWrap().classList.remove("hidden");
  el.ddGrid().innerHTML = "";
  el.ddLabels().innerHTML = "";
  
  step.images.forEach(imgFileName => {
    const slot = document.createElement("div");
    slot.className = "dd-slot";
    const currentLabel = ps.ddAssign[imgFileName] || null;
    slot.innerHTML = `
      <img src="/static/images/${imgFileName}" class="dd-slot-img" alt="Anatomy" onerror="this.src='https://placehold.co/200x220?text=No+Image'">
      <div class="dd-slot-label-area">${currentLabel || "Drag Label Here"}</div>
    `;
    if (!locked) {
      slot.ondragover = e => e.preventDefault();
      slot.ondrop = e => {
        e.preventDefault();
        const lbl = e.dataTransfer.getData("text");
        ps.ddAssign[imgFileName] = lbl;
        renderCurrent();
      };
    }
    el.ddGrid().appendChild(slot);
  });

  step.labels.forEach(lbl => {
    const div = document.createElement("div");
    div.className = "dd-label";
    div.textContent = lbl;
    div.draggable = !locked;
    if (Object.values(ps.ddAssign).includes(lbl)) div.classList.add("used");
    div.ondragstart = e => e.dataTransfer.setData("text", lbl);
    el.ddLabels().appendChild(div);
  });
  
  if (!locked) {
      el.ddSubmit().classList.remove("hidden");
      el.ddSubmit().onclick = () => handleDragSubmit(step, ps);
  } else {
      el.ddSubmit().classList.add("hidden");
  }
}

function renderTextbox(step, ps, locked) {
  el.stepQuestion().textContent = step.question;
  el.optionsRow().className = "options-row single-col";
  const area = document.createElement("textarea");
  area.className = "opinion-textarea";
  area.placeholder = step.placeholder || "Write your clinical opinion here...";
  area.value = ps.textValue || "";
  area.disabled = locked;
  area.oninput = (e) => ps.textValue = e.target.value;
  const btn = document.createElement("button");
  btn.className = "btn-pill btn-primary";
  btn.style.minWidth = "200px";
  btn.textContent = "SUBMIT OPINION";
  btn.disabled = locked;
  
  btn.onclick = () => {
    const txt = ps.textValue.trim();
    if(!txt) return alert("Please write something.");
    
    btn.disabled = true;
    btn.textContent = "SAVING...";
    const team = localStorage.getItem("team_name") || "Unknown";
    
    fetch('/submit_opinion', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ team: team, text: txt })
    })
    .then(r => r.json())
    .then(data => {
        ps.completed = true;
        launchFireworks();
        showSuccessModal("OPINION SAVED", "Thank you for participating.");
    })
    .catch(err => {
        alert("Error saving. Try again.");
        btn.disabled = false;
        btn.textContent = "SUBMIT OPINION";
    });
  };
  
  el.optionsRow().appendChild(area);
  if (!locked) el.optionsRow().appendChild(btn);
}

function renderInfo(step, ps) {
  el.stepQuestion().innerHTML = ""; 
  el.optionsRow().className = "options-row single-col"; 
  
  const textContainer = document.createElement("div");
  textContainer.className = "info-card-wrap";
  
  // 1. Render Image if it exists (THE FIX)
  if (step.image) {
      const img = document.createElement("img");
      img.src = `/static/images/${step.image}`;
      img.className = "step-image";
      // Add a little bottom margin to separate it from the text
      img.style.marginBottom = "20px";
      img.onerror = function() { this.style.display='none'; };
      textContainer.appendChild(img);
  }

  // 2. Render Text
  let content = step.text;
  if (content.includes("Diagnosis Confirmed")) {
      content = content.replace("Diagnosis Confirmed", "<strong style='font-size:24px; color:#2b6cff; display:block; margin-bottom:10px;'>DIAGNOSIS CONFIRMED</strong>");
  }
  
  // Append text to the container
  const textDiv = document.createElement("div");
  textDiv.innerHTML = content.replace(/\n/g, "<br>");
  textContainer.appendChild(textDiv);

  el.stepQuestion().appendChild(textContainer);

  const btn = document.createElement("button");
  btn.className = "btn-pill btn-primary";
  btn.style.minWidth = "200px";
  btn.textContent = "CONTINUE";
  btn.onclick = () => { ps.completed = true; advanceLevel(); };
  el.optionsRow().appendChild(btn);
}

// --- HANDLERS ---

function handlePasswordSubmit(step, valRaw) {
  const val = (valRaw || "").trim();
  if (!val) return;
  const i = state.activeIndex;
  const ps = ensurePerStep(i);
  pauseTimer();

  if (val.toLowerCase() === step.password.toLowerCase()) {
    ps.completed = true;
    ps.success = true;
    ps.pwdEntered = val;
    launchFireworks();
    showSuccessModal("CORRECT!", "That is the right password.");
  } else {
    ps.attempts++;
    if (ps.attempts <= 2) addScore(-15);
    if (ps.attempts >= 2) {
      showResultModal("LOCKED OUT", `The correct password was:\n${step.password}\n\n-15 Points.`, true);
    } else {
      showResultModal("ACCESS DENIED", `Incorrect Password.\n-15 Points.\n${2 - ps.attempts} attempt(s) remaining.`, false);
    }
  }
}

function handleMCQSubmit(step, opt, btnElement) {
  const i = state.activeIndex;
  const ps = ensurePerStep(i);
  pauseTimer();
  
  if (opt === step.answer) {
    btnElement.classList.add("correct");
    ps.completed = true;
    ps.success = true;
    ps.selectedAnswer = opt;
    launchFireworks();
    showSuccessModal("CORRECT!", "Well done.");
  } else {
    btnElement.classList.add("wrong");
    ps.attempts++;
    addScore(-10);
    if (ps.attempts >= 2) {
      ps.completed = true;
      ps.success = false;
      ps.selectedAnswer = opt;
      showResultModal("WRONG TWICE", `The correct answer was:\n${step.answer}\n\n-10 Points. Press CONTINUE to proceed.`, true);
    } else {
      showResultModal("WRONG", "Incorrect answer.\n-10 Points.\nTry again.", false);
    }
  }
}

function handleDragSubmit(step, ps) {
  if (Object.keys(ps.ddAssign).length < step.images.length) {
    alert("Please label all images.");
    return;
  }
  pauseTimer();
  let allCorrect = true;
  for (const [img, correctLabel] of Object.entries(step.answer)) {
    if (ps.ddAssign[img] !== correctLabel) allCorrect = false;
  }
  if (allCorrect) {
    ps.completed = true;
    ps.success = true;
    launchFireworks();
    showSuccessModal("CORRECT!", "Anatomy identified.");
  } else {
    ps.attempts++;
    addScore(-15);
    if (ps.attempts >= 2) {
      ps.completed = true;
      ps.ddAssign = step.answer; // Auto Solve
      showResultModal("FAILED", "Incorrect placement.\n-15 Points.\nLabels corrected automatically.", true);
    } else {
      ps.ddAssign = {}; 
      showResultModal("WRONG", "Incorrect placement.\n-15 Points.\nLabels reset. Try again.", false);
    }
  }
}

function showResultModal(title, body, revealAndEnableNext) {
  $("resultTitle").textContent = title;
  $("resultBody").innerText = body;
  $("resultModal").classList.remove("hidden");
  $("resultContinue").onclick = () => {
    $("resultModal").classList.add("hidden");
    resumeTimer();
    if (revealAndEnableNext) {
      const step = getStep(state.activeIndex);
      if (step.type === 'mcq') {
         const allBtns = el.optionsRow().querySelectorAll('.option-btn');
         allBtns.forEach(b => {
             if (b.textContent === step.answer) b.classList.add("correct");
         });
      }
      renderCurrent(); 
    } else {
      renderCurrent();
    }
  };
}

function showSuccessModal(title="CORRECT!", body="Well done.") {
  el.successTitle().textContent = title;
  el.successBody().textContent = body;
  $("successModal").classList.remove("hidden");
  el.successNext().onclick = () => {
    $("successModal").classList.add("hidden");
    resumeTimer();
    
    // Auto-advance is called here only if the modal "CONTINUE" is clicked.
    // BUT our requirement is manual pacing. 
    // In "showResultModal", we just close and let user click Main Next.
    // In "showSuccessModal", we currently advanceLevel(). 
    // If you want STRICT manual pacing even after success, change advanceLevel() to renderCurrent().
    // However, the "Success" modal usually implies "Moving on".
    // I will leave advanceLevel() here as it feels more natural for a "Success" popup button.
    advanceLevel();
  };
}

function advanceLevel() {
  const nextIdx = state.activeIndex + 1;
  if (nextIdx >= GAME.steps.length) {
    endGame();
    return;
  }
  const overlay = $("loadingOverlay");
  overlay.classList.remove("hidden");
  setTimeout(() => {
    overlay.classList.add("hidden");
    state.activeIndex = nextIdx;
    state.viewIndex = nextIdx;
    renderCurrent();
  }, 2500);
}

function endGame() {
  if (state.timerId) clearInterval(state.timerId);
  $("questionView").classList.add("hidden");
  $("finalView").classList.remove("hidden");
  const finalTimeSpent = GAME.game.timer_seconds - state.timeLeft;
  el.finalScore().textContent = state.score;
  el.finalTime().textContent = formatTime(finalTimeSpent);

  const team = localStorage.getItem("team_name") || "Unknown";
  if($("finalTeamName")) $("finalTeamName").textContent = team;
  const members = JSON.parse(localStorage.getItem("team_members") || "[]");
  if($("finalMembers")) $("finalMembers").textContent = members.join(", "); 

  if (el.btnCertificate()) el.btnCertificate().onclick = () => window.print();

  fetch('/submit_score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team: team, score: state.score, time_spent: finalTimeSpent })
  })
  .then(r => r.json())
  .then(data => {
      renderLeaderboard(data.leaderboard);
      setInterval(() => {
          fetch('/leaderboard').then(r=>r.json()).then(renderLeaderboard);
      }, 3000);
  });
}

function renderLeaderboard(list) {
  const box = document.getElementById("podiumBox");
  if (!box) return;
  box.innerHTML = "";
  
  list.sort((a,b) => b.score - a.score || a.time_spent - b.time_spent);
  const top3 = list.slice(0,3);
  
  if (top3.length === 0) {
      box.innerHTML = "<div style='text-align:center;width:100%'>No scores yet.</div>";
      return;
  }

  const order = [1, 0, 2];
  order.forEach(i => {
      if (!top3[i]) return;
      const entry = top3[i];
      const rank = i + 1;
      const min = Math.floor(entry.time_spent / 60);
      const sec = entry.time_spent % 60;
      const timeStr = `${min}:${String(sec).padStart(2,'0')}`;

      const div = document.createElement("div");
      div.className = `podium-step podium-${rank}`;
      div.innerHTML = `
        <div class="podium-rank">${rank}</div>
        <div class="podium-team">${entry.team}</div>
        <div class="podium-score">${entry.score} pts<br><small>${timeStr}</small></div>
      `;
      box.appendChild(div);
  });
}

function launchFireworks() {
  const canvas = document.getElementById("fireworksCanvas");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = [];
  function createParticle(x, y) {
    const count = 30;
    for(let i=0; i<count; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        alpha: 1,
        color: `hsl(${Math.random()*360}, 100%, 50%)`
      });
    }
  }
  createParticle(window.innerWidth/2, window.innerHeight/2);
  function update() {
    ctx.clearRect(0,0, canvas.width, canvas.height);
    for(let i=0; i<particles.length; i++) {
      let p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.02;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 4, 4);
      if(p.alpha <= 0) particles.splice(i, 1);
    }
    if(particles.length > 0) requestAnimationFrame(update);
  }
  update();
}

async function init() {
  const team = localStorage.getItem("team_name");
  if (!team) { window.location.href = "/team"; return; }
  const r = await fetch("/data");
  GAME = await r.json();
  state.score = GAME.game.initial_score || 100;
  setScore(state.score);
  $("teamBanner").textContent = `TEAM: ${team}`;
  
  $("btnBack").onclick = () => { state.viewIndex = Math.max(0, state.viewIndex - 1); renderCurrent(); };
  
  el.lifeHint().onclick = openHint;
  el.lifeCall().onclick = openCall;
  el.life5050().onclick = use5050;
  $("hintClose").onclick = () => { $("hintModal").classList.add("hidden"); resumeTimer(); };
  $("callClose").onclick = () => { $("callModal").classList.add("hidden"); state.globalUsedCall = true; resumeTimer(); };
  startTimer(GAME.game.timer_seconds || 1800);
  renderCurrent();
}

function openHint() {
  pauseTimer();
  const hintsLeft = GAME.game.max_hints_total - state.hintsUsedTotal;
  $("hintRemaining").textContent = hintsLeft;
  $("hintModal").classList.remove("hidden");
  const step = getStep(state.activeIndex);
  const ps = ensurePerStep(state.activeIndex);
  ["25", "50"].forEach(cost => {
    const btn = $(`hint${cost}`);
    const isUnlocked = ps.hintsUnlocked[cost];
    btn.onclick = null;
    btn.disabled = false;
    btn.querySelector(".hint-tile-bottom").textContent = isUnlocked ? "VIEW AGAIN" : `${cost} POINTS`;
    btn.onclick = () => {
      if (!isUnlocked) {
        if (hintsLeft <= 0) return;
        state.hintsUsedTotal++;
        state.score -= parseInt(cost);
        setScore(state.score);
        ps.hintsUnlocked[cost] = true;
      }
      $("hintUnlockView").classList.add("hidden");
      $("hintTextView").classList.remove("hidden");
      $("hintPresentedText").textContent = step.hints[cost];
    };
  });
  $("hintUnlockView").classList.remove("hidden");
  $("hintTextView").classList.add("hidden");
}

function use5050() {
  if (state.globalUsed5050) return;
  state.globalUsed5050 = true;
  const i = state.activeIndex;
  const step = getStep(i);
  const ps = ensurePerStep(i);
  const wrongOpts = step.options.filter(o => o !== step.answer);
  ps.removedBy5050 = wrongOpts.slice(0, 2);
  ps.used5050 = true;
  renderCurrent();
}

function openCall() {
  if (state.globalUsedCall) return;
  pauseTimer();
  $("callModal").classList.remove("hidden");
}

init();