#!/usr/bin/env python3
"""Small HTTP server that serves MazeMaster and calls its C++ pathfinder."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json, os, subprocess, time

ROOT = Path(__file__).resolve().parent.parent
BACKEND = Path(__file__).resolve().parent
BINARY = BACKEND / ("maze_solver.exe" if os.name == "nt" else "maze_solver")
SOURCE = BACKEND / "main.cpp"
ALGORITHMS = {"bfs", "dfs", "dijkstra", "astar"}


def compile_solver():
    result = subprocess.run(["g++", "-std=c++17", "-O2", str(SOURCE), "-o", str(BINARY)], capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "C++ compilation failed")


def run_solver(grid, start, end, algorithm):
    rows, cols = len(grid), len(grid[0])
    payload = f"{rows} {cols} {algorithm}\n" + "\n".join(" ".join(map(str, row)) for row in grid) + f"\n{start[0]} {start[1]} {end[0]} {end[1]}\n"
    started = time.perf_counter()
    result = subprocess.run([str(BINARY)], input=payload, capture_output=True, text=True, timeout=8, cwd=str(ROOT))
    elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
    if result.returncode:
        raise ValueError(result.stderr.strip() or "The C++ solver rejected the maze")
    events, frontier, visited = [], [], set()
    path, no_path = [], False
    for line in result.stdout.splitlines():
        bits = line.split()
        if not bits: continue
        kind = bits[0]
        if kind in ("ADD", "UPDATE", "VISIT") and len(bits) >= 3:
            cell = [int(bits[1]), int(bits[2])]
            key = tuple(cell)
            if kind == "VISIT":
                if key in frontier: frontier.remove(key)
                visited.add(key)
                events.append({"type":"visit", "cell":cell, "frontier":[list(p) for p in frontier], "message":"Exploring cell", "detail":f"C++ {algorithm.upper()} is checking cell ({cell[0]}, {cell[1]})."})
            else:
                if key not in frontier: frontier.append(key)
                events.append({"type":"add", "cell":cell, "frontier":[list(p) for p in frontier], "message":"Added to frontier" if kind=="ADD" else "Updated candidate", "detail":f"Cell ({cell[0]}, {cell[1]}) entered the {algorithm.upper()} frontier."})
        elif kind == "PATH":
            for token in bits[1:]:
                r,c=token.split(","); path.append([int(r),int(c)])
            events.append({"type":"path", "cell":end, "frontier":[list(p) for p in frontier], "message":"Shortest path found" if algorithm != "dfs" else "Path found", "detail":f"The C++ solver returned a path with {len(path)} cells.", "path":path})
        elif kind == "NO_PATH":
            no_path=True
            events.append({"type":"fail", "cell":None, "frontier":[list(p) for p in frontier], "message":"No route exists", "detail":"The C++ frontier became empty before reaching the destination."})
    return {"algorithm":algorithm, "events":events, "path":path, "found":bool(path), "visitedCount":len(visited), "pathLength":max(0,len(path)-1), "elapsedMs":elapsed_ms, "noPath":no_path}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): print("[MazeMaster] " + (fmt % args))
    def send_json(self, status, data):
        raw=json.dumps(data).encode()
        self.send_response(status); self.send_header("Content-Type","application/json; charset=utf-8"); self.send_header("Cache-Control","no-store"); self.send_header("Content-Length",str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_GET(self):
        if self.path == "/api/health": self.send_json(200,{"ok":True,"solver":"C++17","algorithms":sorted(ALGORITHMS)}); return
        path = self.path.split("?",1)[0]
        if path == "/": path="/index.html"
        target=(ROOT/path.lstrip("/")).resolve()
        if not str(target).startswith(str(ROOT.resolve())) or not target.is_file(): self.send_json(404,{"error":"Not found"}); return
        mime={".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".svg":"image/svg+xml", ".ico":"image/x-icon"}.get(target.suffix,"application/octet-stream")
        data=target.read_bytes(); self.send_response(200); self.send_header("Content-Type",mime); self.send_header("Content-Length",str(len(data))); self.send_header("Cache-Control","no-cache"); self.end_headers(); self.wfile.write(data)
    def do_POST(self):
        try:
            length=int(self.headers.get("Content-Length","0"))
            if length<1 or length>1_000_000: raise ValueError("Request body is empty or too large.")
            data=json.loads(self.rfile.read(length))
            grid=data.get("grid"); start=data.get("start"); end=data.get("end")
            algorithm=data.get("algorithm","bfs").lower()
            if algorithm not in ALGORITHMS: raise ValueError("Choose BFS, DFS, Dijkstra, or A*.")
            if not isinstance(grid,list) or not grid or not isinstance(grid[0],list): raise ValueError("Maze grid is required.")
            rows,cols=len(grid),len(grid[0])
            if not (3<=rows<=60 and 3<=cols<=60) or any(not isinstance(row,list) or len(row)!=cols for row in grid): raise ValueError("Maze must be rectangular and between 3×3 and 60×60.")
            if any(cell not in (0,1) for row in grid for cell in row): raise ValueError("Maze cells must be 0 (wall) or 1 (open).")
            for point,label in ((start,"Start"),(end,"End")):
                if not isinstance(point,list) or len(point)!=2 or any(not isinstance(v,int) for v in point): raise ValueError(f"{label} must be [row, column].")
                r,c=point
                if not (0<=r<rows and 0<=c<cols): raise ValueError(f"{label} is outside the maze.")
                if grid[r][c]!=1: raise ValueError(f"{label} must be on an open cell.")
            if self.path == "/api/compare":
                results=[]
                for name in ("bfs","dfs","dijkstra","astar"):
                    summary=run_solver(grid,start,end,name)
                    results.append({k:summary[k] for k in ("algorithm","found","visitedCount","pathLength","elapsedMs")})
                self.send_json(200,{"ok":True,"results":results}); return
            if self.path != "/api/solve": self.send_json(404,{"error":"Unknown endpoint"}); return
            result=run_solver(grid,start,end,algorithm); result["ok"]=True; result["solver"]="C++17"; self.send_json(200,result)
        except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc: self.send_json(400,{"ok":False,"error":str(exc)})
        except subprocess.TimeoutExpired: self.send_json(504,{"ok":False,"error":"Solver timed out. Try a smaller maze."})
        except Exception as exc: self.send_json(500,{"ok":False,"error":f"Server error: {exc}"})

if __name__ == "__main__":
    compile_solver()
    port=int(os.environ.get("PORT","8000"))
    server=ThreadingHTTPServer(("0.0.0.0",port),Handler)
    print(f"MazeMaster running on port {port}; C++ solver ready.", flush=True)
    server.serve_forever()
