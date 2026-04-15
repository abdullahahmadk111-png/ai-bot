export default async function handler(req, res) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        const { message } = req.body || {};

        if (!message) {
            return res.status(400).json({ error: "No message provided" });
        }

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": "Don't Try To See API My Lil Hacker!   ",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai/gpt-3.5-turbo",
                messages: [{ role: "user", content: message }]
            })
        });

        const data = await response.json();

        // 🔥 Extract reply safely
        const reply =
            data?.choices?.[0]?.message?.content ||
            data?.choices?.[0]?.text ||
            null;

        // 🔴 If no reply → send full error
        if (!reply) {
            return res.status(200).json({
                error: data.error || data
            });
        }

        return res.status(200).json({ reply });

    } catch (err) {
        console.error("SERVER ERROR:", err);
        return res.status(500).json({
            error: err.message || "Internal Server Error"
        });
    }
}