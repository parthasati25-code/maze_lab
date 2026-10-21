# MazeLab — C++ Maze Solver

A responsive interactive maze lab powered by a real C++17 backend. It supports maze generation, manual editing, animated solving, and algorithm comparisons.

## Features
- Random perfect-maze generation with easy, medium, and hard openness settings.
- Editable walls, movable start and end points, clear walls, reset, and new maze controls.
- Real C++ implementations of BFS, DFS, Dijkstra, and A*.
- Step-by-step event playback with pause/resume and adjustable speed.
- Visited cells, frontier, final path, path length, visited count, elapsed time, and no-path feedback.
- Run all four algorithms on the current maze and compare their results.
- Responsive dark/light theme and keyboard/screen-reader-friendly controls.

## Run locally
Requirements: Python 3.10+ and `g++` with C++17 support.

```bash
python backend/server.py
```

Open `http://localhost:8000`. The server compiles `backend/main.cpp` on startup and serves the frontend and API from the same origin.

## Docker / deployment
This repository includes a Dockerfile that installs `g++`, compiles the C++ solver at startup, and binds to the host-provided `PORT` (default 8000). It is suitable for a Docker web service on a host such as Render or Railway.

API endpoints:
- `GET /api/health`
- `POST /api/solve` — `{ "grid": [[0,1,...]], "start": [1,1], "end": [9,9], "algorithm": "astar" }`
- `POST /api/compare` — same grid/start/end, runs BFS, DFS, Dijkstra, and A*.

Grid values: `0` = wall, `1` = open cell. Rows and columns must be 3–60 cells.
