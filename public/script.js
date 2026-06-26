// ===== DOM ELEMENTS =====
var chat = document.getElementById("chat");
var msgInput = document.getElementById("msg");
var sendBtn = document.getElementById("send-btn");
var clearBtn = document.getElementById("clear-btn");
var typingIndicator = document.getElementById("typing");
var welcomeScreen = document.getElementById("welcome");

// ===== SESSION ID FOR MEMORY =====
var sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);

// ===== CLEANING INSTRUCTIONS (persists per session) =====
var cleaningInstructions = "";

// ===== SIMPLE MARKDOWN PARSER =====
function parseMarkdown(text) {
    var escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/__(.*?)__/g, "<strong>$1</strong>");
    escaped = escaped.replace(/\*(.*?)\*/g, "<em>$1</em>");
    escaped = escaped.replace(/_(.*?)_/g, "<em>$1</em>");
    escaped = escaped.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    escaped = escaped.replace(/\n/g, "<br>");
    escaped = escaped.replace(/(^|<br>)\s*[-*]\s+(.*?)(?=<br>|$)/g, "$1<div class='bullet'>• $2</div>");

    return escaped;
}

// ===== AUTO-RESIZE TEXTAREA =====
msgInput.addEventListener("input", function() {
    msgInput.style.height = "auto";
    msgInput.style.height = Math.min(msgInput.scrollHeight, 200) + "px";
});

// ===== SEND ON ENTER (Shift+Enter for new line) =====
msgInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// ===== SEND BUTTON CLICK =====
sendBtn.addEventListener("click", sendMessage);

// ===== CLEAR CHAT =====
clearBtn.addEventListener("click", function() {
    chat.innerHTML = "";
    if (welcomeScreen) {
        chat.appendChild(welcomeScreen);
        welcomeScreen.style.display = "flex";
    }
    sessionId = "session_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    cleaningInstructions = "";
});

// ===== DETECT MODE FROM TEXT =====
function detectMode(text) {
    var lower = text.toLowerCase().trim();

    // Slash commands
    if (lower.startsWith("/clean")) return "clean";
    if (lower.startsWith("/analyze")) return "analyze";
    if (lower.startsWith("/instructions")) return "instructions";
    if (lower.startsWith("/help")) return "help";

    // Natural language detection
    var cleanKeywords = ["clean this", "clean data", "clean my data", "fix this data", "convert to csv", "make csv", "data clean", "clean the data", "clean it"];
    var analyzeKeywords = ["analyze this", "analyze data", "data quality", "check this data", "what's wrong with this data", "inspect data"];

    for (var i = 0; i < cleanKeywords.length; i++) {
        if (lower.includes(cleanKeywords[i])) return "clean";
    }
    for (var i = 0; i < analyzeKeywords.length; i++) {
        if (lower.includes(analyzeKeywords[i])) return "analyze";
    }

    return "chat";
}

// ===== STRIP COMMAND PREFIX =====
function stripCommand(text) {
    if (text.startsWith("/clean ")) return text.substring(7);
    if (text.startsWith("/analyze ")) return text.substring(9);
    if (text.startsWith("/instructions ")) return text.substring(14);
    // For natural language, try to strip the trigger phrase
    var triggers = ["clean this data:", "clean this:", "clean data:", "analyze this data:", "analyze this:", "convert to csv:"];
    var lower = text.toLowerCase();
    for (var i = 0; i < triggers.length; i++) {
        var idx = lower.indexOf(triggers[i]);
        if (idx !== -1) {
            return text.substring(idx + triggers[i].length).trim();
        }
    }
    return text;
}

// ===== SEND MESSAGE FUNCTION =====
function sendMessage() {
    var text = msgInput.value.trim();
    if (!text) return;

    if (welcomeScreen) {
        welcomeScreen.style.display = "none";
    }

    var mode = detectMode(text);

    // Handle /help locally
    if (mode === "help" || text.toLowerCase() === "/help") {
        appendMessage(text, "user", false);
        msgInput.value = "";
        msgInput.style.height = "auto";
        var helpText = "**Available Commands:**\n\n";
        helpText += "- **/clean** [paste data] — Cleans messy data and outputs perfect CSV\n";
        helpText += "- **/analyze** [paste data] — Analyzes data quality, finds issues, rates it\n";
        helpText += "- **/instructions** [text] — Set custom cleaning rules (e.g. 'remove rows without email')\n";
        helpText += "- **/help** — Shows this menu\n\n";
        helpText += "**You can also just type naturally:**\n";
        helpText += "- \"Clean this data: [paste]\" — triggers cleaning\n";
        helpText += "- \"Analyze this: [paste]\" — triggers analysis\n";
        helpText += "- Or just chat normally!\n\n";
        helpText += "**Tips:**\n";
        helpText += "- Set instructions FIRST, then clean — instructions persist until you clear chat\n";
        helpText += "- Use Shift+Enter to paste multi-line data\n";
        helpText += "- Copy or Download buttons appear on cleaned output";
        appendMessage(helpText, "bot", true);
        return;
    }

    // Handle /instructions locally
    if (text.toLowerCase().startsWith("/instructions")) {
        appendMessage(text, "user", false);
        msgInput.value = "";
        msgInput.style.height = "auto";
        var instr = text.substring(14).trim();
        if (instr) {
            cleaningInstructions = instr;
            appendMessage("**Instructions saved!** ✅\n\nI'll apply these rules to all future cleaning in this session:\n\n_\"" + instr + "\"_\n\nNow paste your data with **/clean** or just say \"clean this:\"", "bot", true);
        } else {
            if (cleaningInstructions) {
                appendMessage("**Current instructions:**\n\n_\"" + cleaningInstructions + "\"_\n\nTo change, type: /instructions [new rules]\nTo clear, type: /instructions clear", "bot", true);
            } else {
                appendMessage("**No instructions set.**\n\nUsage: /instructions [your rules]\n\nExample:\n/instructions Remove rows without email, standardize country to ISO 3166 codes, keep only name email and phone columns", "bot", true);
            }
        }
        if (instr === "clear" || instr === "reset") {
            cleaningInstructions = "";
            appendMessage("**Instructions cleared.** ✅", "bot", true);
        }
        return;
    }

    appendMessage(text, "user", false);

    msgInput.value = "";
    msgInput.style.height = "auto";

    showTyping();
    sendBtn.disabled = true;

    // Get actual data (strip command prefix)
    var dataToSend = (mode === "clean" || mode === "analyze") ? stripCommand(text) : text;

    fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message: dataToSend,
            sessionId: sessionId,
            mode: mode,
            instructions: cleaningInstructions
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        hideTyping();
        if (data.reply) {
            if (data.mode === "clean" || mode === "clean") {
                appendCleanedData(data.reply);
            } else {
                appendMessage(data.reply, "bot", true);
            }
        } else {
            appendMessage("Error: " + (data.error || "No response from AI"), "bot", false);
        }
    })
    .catch(function(err) {
        hideTyping();
        appendMessage("Network error. Please try again.", "bot", false);
    })
    .finally(function() {
        sendBtn.disabled = false;
    });
}

// ===== APPEND CLEANED DATA WITH COPY/DOWNLOAD/STATS =====
function appendCleanedData(csvText) {
    var cleaned = csvText
        .replace(/^```csv\n?/i, "")
        .replace(/^```\n?/i, "")
        .replace(/\n?```$/i, "")
        .replace(/^Here is.*?:\n/i, "")
        .replace(/^The cleaned.*?:\n/i, "")
        .trim();

    // Count rows and columns
    var lines = cleaned.split("\n").filter(function(l) { return l.trim().length > 0; });
    var rowCount = lines.length - 1; // minus header
    var colCount = 0;
    if (lines.length > 0) {
        colCount = lines[0].split(",").length;
    }

    var messageDiv = document.createElement("div");
    messageDiv.className = "message bot";

    var avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "AI";

    var content = document.createElement("div");
    content.className = "message-content csv-output";

    // Header with stats and buttons
    var header = document.createElement("div");
    header.className = "csv-header";
    header.innerHTML = '<div class="csv-stats"><span class="csv-title">Cleaned CSV</span><span class="csv-badge">' + rowCount + ' rows</span><span class="csv-badge">' + colCount + ' cols</span></div><div class="csv-actions"><button class="csv-btn copy-csv-btn">Copy</button><button class="csv-btn download-csv-btn">Download .csv</button></div>';

    // CSV content
    var pre = document.createElement("pre");
    pre.className = "csv-content";
    pre.textContent = cleaned;

    content.appendChild(header);
    content.appendChild(pre);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chat.appendChild(messageDiv);

    // Copy button
    var copyBtnEl = content.querySelector(".copy-csv-btn");
    copyBtnEl.addEventListener("click", function() {
        navigator.clipboard.writeText(cleaned).then(function() {
            copyBtnEl.textContent = "Copied!";
            setTimeout(function() { copyBtnEl.textContent = "Copy"; }, 2000);
        });
    });

    // Download button
    var dlBtnEl = content.querySelector(".download-csv-btn");
    dlBtnEl.addEventListener("click", function() {
        var blob = new Blob([cleaned], { type: "text/csv" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "cleaned_data.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    chat.scrollTop = chat.scrollHeight;
}

// ===== APPEND MESSAGE TO CHAT =====
function appendMessage(text, sender, useMarkdown) {
    var messageDiv = document.createElement("div");
    messageDiv.className = "message " + sender;

    var avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = sender === "user" ? "U" : "AI";

    var content = document.createElement("div");
    content.className = "message-content";

    if (useMarkdown) {
        content.innerHTML = parseMarkdown(text);
    } else {
        content.textContent = text;
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chat.appendChild(messageDiv);

    chat.scrollTop = chat.scrollHeight;
}

// ===== TYPING INDICATOR =====
function showTyping() {
    typingIndicator.style.display = "flex";
}

function hideTyping() {
    typingIndicator.style.display = "none";
}

// ===== FOCUS INPUT ON LOAD (desktop only) =====
if (window.innerWidth > 768) {
    msgInput.focus();
}