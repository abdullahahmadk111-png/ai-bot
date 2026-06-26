var fetch = require("node-fetch");

// ===== MEMORY STORE =====
var conversations = {};

module.exports = async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    var body = req.body || {};
    var message = body.message;
    var sessionId = body.sessionId || "default";
    var mode = body.mode || "chat";
    var instructions = body.instructions || "";

    if (!message) {
        return res.status(400).json({ error: "No message provided" });
    }

    var apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        console.error("OPENROUTER_API_KEY is not set");
        return res.status(500).json({ error: "Server misconfigured" });
    }

    // ===== MEMORY: Get or create conversation history =====
    if (!conversations[sessionId]) {
        conversations[sessionId] = [];
    }

    var history = conversations[sessionId];

    // ===== BUILD SYSTEM PROMPT BASED ON MODE =====
    var systemPrompt = "";

    if (mode === "clean") {
        systemPrompt = "You are an expert AI Data Cleaner — the most thorough and precise data cleaning system ever built.\n\n";
        systemPrompt += "YOUR CAPABILITIES:\n";
        systemPrompt += "- Detect and merge duplicate entries (even with different formatting/spelling)\n";
        systemPrompt += "- Standardize phone numbers to international format (+XX XXX XXX XXXX)\n";
        systemPrompt += "- Fix and validate email addresses (flag invalid ones with [INVALID] prefix)\n";
        systemPrompt += "- Standardize country names (use full official names: United States, United Arab Emirates, etc.)\n";
        systemPrompt += "- Standardize city names (NYC → New York, LA → Los Angeles, etc.)\n";
        systemPrompt += "- Fix name casing to Title Case\n";
        systemPrompt += "- Standardize job titles to their full professional form\n";
        systemPrompt += "- Detect and handle multiple delimiters (tabs, pipes, semicolons, commas, spaces)\n";
        systemPrompt += "- Remove completely empty or garbage rows\n";
        systemPrompt += "- Infer column headers if not provided\n";
        systemPrompt += "- Fill in obviously missing data from duplicate entries\n";
        systemPrompt += "- Remove extra whitespace and special characters\n";
        systemPrompt += "- Sort output alphabetically by first meaningful column\n\n";
        systemPrompt += "OUTPUT RULES:\n";
        systemPrompt += "1. Output ONLY the cleaned CSV. No explanations, no markdown, no code blocks, no backticks, no commentary.\n";
        systemPrompt += "2. First line = column headers (infer if not obvious).\n";
        systemPrompt += "3. Use commas as delimiters.\n";
        systemPrompt += "4. Wrap fields containing commas in double quotes.\n";
        systemPrompt += "5. Escape internal double quotes with double-double quotes.\n";
        systemPrompt += "6. One record per line — merge duplicates into the most complete single entry.\n";
        systemPrompt += "7. If two duplicate entries have different data in a field, keep the more complete/correct one.\n";
        systemPrompt += "8. Output NOTHING except the CSV. No 'Here is...' or 'The cleaned data...' — just raw CSV lines.\n";

        if (instructions) {
            systemPrompt += "\nCUSTOM INSTRUCTIONS FROM USER (follow these as priority):\n" + instructions + "\n";
        }
    } else if (mode === "analyze") {
        systemPrompt = "You are a data analysis expert. The user will give you raw/messy data. Your job is to:\n\n";
        systemPrompt += "1. Identify how many total entries there are\n";
        systemPrompt += "2. Identify how many duplicates exist\n";
        systemPrompt += "3. List all detected columns/fields\n";
        systemPrompt += "4. Show what delimiter(s) are being used\n";
        systemPrompt += "5. Flag data quality issues (invalid emails, inconsistent formats, missing fields)\n";
        systemPrompt += "6. Suggest cleaning actions\n";
        systemPrompt += "7. Rate overall data quality from 1-10\n\n";
        systemPrompt += "Be concise, use bullet points and bold text. Format nicely with markdown.\n";
    } else {
        systemPrompt = "You are a helpful, friendly AI assistant. You can also clean messy data and analyze data quality. Be concise, clear, and conversational. Format your responses nicely using markdown when appropriate (bold, bullet points, etc). Never dump raw data or JSON to the user.\n\n";
        systemPrompt += "SPECIAL COMMANDS THE USER CAN USE:\n";
        systemPrompt += "- /clean [data] — Cleans and outputs CSV\n";
        systemPrompt += "- /analyze [data] — Analyzes data quality without cleaning\n";
        systemPrompt += "- /help — Shows available commands\n";
        systemPrompt += "If user asks about data cleaning, mention these commands.\n";
    }

    // Build messages array
    var messages = [
        { role: "system", content: systemPrompt }
    ];

    // Add conversation history (last 10 messages)
    var recentHistory = history.slice(-10);
    for (var i = 0; i < recentHistory.length; i++) {
        messages.push(recentHistory[i]);
    }

    // Add current user message
    if (mode === "clean") {
        messages.push({ role: "user", content: "Clean this data. Output ONLY CSV, nothing else:\n\n" + message });
    } else if (mode === "analyze") {
        messages.push({ role: "user", content: "Analyze this data:\n\n" + message });
    } else {
        messages.push({ role: "user", content: message });
    }

    try {
        var response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + apiKey,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://your-app.vercel.app",
                "X-Title": "AI Data Cleaner"
            },
            body: JSON.stringify({
                model: "openai/gpt-3.5-turbo",
                messages: messages,
                temperature: mode === "clean" ? 0.05 : 0.7
            })
        });

        var data = await response.json();

        if (!response.ok) {
            console.error("OpenRouter Error:", JSON.stringify(data));
            return res.status(502).json({ error: "AI service error" });
        }

        var reply = null;
        if (data && data.choices && data.choices[0] && data.choices[0].message) {
            reply = data.choices[0].message.content;
        }

        if (!reply) {
            console.error("No reply:", JSON.stringify(data));
            return res.status(502).json({ error: "No reply from AI" });
        }

        // ===== MEMORY: Save this exchange =====
        history.push({ role: "user", content: message.substring(0, 500) });
        history.push({ role: "assistant", content: reply.substring(0, 500) });

        if (history.length > 20) {
            conversations[sessionId] = history.slice(-20);
        }

        return res.status(200).json({ reply: reply, mode: mode });
    } catch (err) {
        console.error("SERVER ERROR:", err.message);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
