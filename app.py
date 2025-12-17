import json
import os
import time
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

SCORES_FILE = os.path.join(app.root_path, "scores.json")

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

def save_score_entry(entry):
    scores = load_scores()
    # Remove previous score for this team if exists (keep latest/best)
    scores = [s for s in scores if s['team'] != entry['team']]
    scores.append(entry)
    
    # Sort: High Score first, then Low Time (spent)
    # entry['time_spent'] should be seconds
    scores.sort(key=lambda x: (-x['score'], x['time_spent']))
    
    with open(SCORES_FILE, "w", encoding="utf-8") as f:
        json.dump(scores, f)
    return scores

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
    """Serves the game configuration and steps."""
    raw = load_questions_raw()
    return jsonify(raw)

@app.route("/submit_score", methods=["POST"])
def submit_score():
    """Receives final score from client."""
    data = request.json
    team = data.get("team")
    score = data.get("score")
    time_spent = data.get("time_spent") # in seconds
    
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

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)