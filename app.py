import json
import os
import time
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Files for data persistence
SCORES_FILE = os.path.join(app.root_path, "scores.json")
OPINIONS_FILE = os.path.join(app.root_path, "opinions.json")

def load_questions_raw():
    json_path = os.path.join(app.root_path, "questions.json")
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_scores():
    if not os.path.exists(SCORES_FILE):
        return []
    try:
        with open(SCORES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return []

def load_opinions():
    if not os.path.exists(OPINIONS_FILE):
        return []
    try:
        with open(OPINIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return []

def save_score_entry(entry):
    scores = load_scores()
    # Remove previous score for this team to avoid duplicates
    scores = [s for s in scores if s['team'] != entry['team']]
    scores.append(entry)
    
    # Sort: High Score first, then Low Time (spent)
    scores.sort(key=lambda x: (-x['score'], x['time_spent']))
    
    with open(SCORES_FILE, "w", encoding="utf-8") as f:
        json.dump(scores, f)
    return scores

def save_opinion_entry(entry):
    opinions = load_opinions()
    # Add new opinion
    opinions.append(entry)
    with open(OPINIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(opinions, f, indent=2)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/team")
def team():
    return render_template("team.html")

@app.route("/rules")
def rules():
    return render_template("rules.html")

@app.route("/game")
def game():
    return render_template("game.html")

@app.route("/data")
def data():
    raw = load_questions_raw()
    return jsonify(raw)

@app.route("/submit_score", methods=["POST"])
def submit_score():
    data = request.json
    team = data.get("team")
    score = data.get("score")
    time_spent = data.get("time_spent")
    
    if team and score is not None:
        entry = {
            "team": team, 
            "score": int(score), 
            "time_spent": int(time_spent),
            "timestamp": time.time()
        }
        new_leaderboard = save_score_entry(entry)
        return jsonify({"status": "ok", "leaderboard": new_leaderboard})
    
    return jsonify({"error": "Invalid data"}), 400

@app.route("/leaderboard")
def get_leaderboard():
    return jsonify(load_scores())

# --- NEW OPINION ROUTES ---

@app.route("/submit_opinion", methods=["POST"])
def submit_opinion():
    data = request.json
    team = data.get("team")
    text = data.get("text")
    
    if team and text:
        entry = {
            "team": team,
            "text": text,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        save_opinion_entry(entry)
        return jsonify({"status": "saved"})
    
    return jsonify({"error": "Missing text"}), 400

@app.route("/admin/opinions")
def view_opinions():
    """Simple page for the teacher to read opinions."""
    opinions = load_opinions()
    # Basic HTML styling directly here for simplicity
    html = """
    <html>
    <head>
        <title>Student Opinions</title>
        <style>
            body { font-family: sans-serif; padding: 40px; background: #f4f4f9; }
            h1 { color: #333; border-bottom: 2px solid #00bfe6; padding-bottom: 10px; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            .meta { color: #666; font-size: 0.9em; margin-bottom: 10px; font-weight: bold; }
            .text { font-size: 1.1em; line-height: 1.5; color: #111; white-space: pre-wrap; }
            .team { color: #2b6cff; }
        </style>
    </head>
    <body>
        <h1>Student Clinical Reflections</h1>
    """
    
    if not opinions:
        html += "<p>No opinions submitted yet.</p>"
    
    # Show newest first
    for op in reversed(opinions):
        html += f"""
        <div class="card">
            <div class="meta"><span class="team">{op['team']}</span> • {op['timestamp']}</div>
            <div class="text">{op['text']}</div>
        </div>
        """
    
    html += "</body></html>"
    return html

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)