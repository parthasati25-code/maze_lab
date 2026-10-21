#include <algorithm>
#include <cmath>
#include <iostream>
#include <limits>
#include <queue>
#include <string>
#include <utility>
#include <vector>
using namespace std;

struct Cell { int r, c; };
static const int DR[4] = {1, 0, -1, 0};
static const int DC[4] = {0, 1, 0, -1};

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int rows, cols;
    string algorithm;
    if (!(cin >> rows >> cols >> algorithm) || rows < 1 || cols < 1 || rows > 60 || cols > 60) {
        cerr << "Invalid maze dimensions."; return 2;
    }
    vector<vector<int>> grid(rows, vector<int>(cols));
    for (int r = 0; r < rows; ++r) for (int c = 0; c < cols; ++c) {
        if (!(cin >> grid[r][c]) || (grid[r][c] != 0 && grid[r][c] != 1)) {
            cerr << "Grid cells must be 0 (wall) or 1 (open)."; return 2;
        }
    }
    Cell start{}, finish{};
    if (!(cin >> start.r >> start.c >> finish.r >> finish.c)) { cerr << "Missing start/end."; return 2; }
    auto inside = [&](int r, int c) { return r >= 0 && r < rows && c >= 0 && c < cols; };
    if (!inside(start.r,start.c) || !inside(finish.r,finish.c) || !grid[start.r][start.c] || !grid[finish.r][finish.c]) {
        cerr << "Start and destination must be open cells inside the maze."; return 2;
    }
    if (algorithm != "bfs" && algorithm != "dfs" && algorithm != "dijkstra" && algorithm != "astar") {
        cerr << "Unknown algorithm."; return 2;
    }

    const int INF = numeric_limits<int>::max() / 4;
    vector<vector<int>> dist(rows, vector<int>(cols, INF));
    vector<vector<int>> parentR(rows, vector<int>(cols, -1)), parentC(rows, vector<int>(cols, -1));
    vector<vector<bool>> seen(rows, vector<bool>(cols, false)), closed(rows, vector<bool>(cols, false));
    auto parent = [&](Cell next, Cell from) { parentR[next.r][next.c] = from.r; parentC[next.r][next.c] = from.c; };
    auto emit = [](const string& kind, int r, int c) { cout << kind << ' ' << r << ' ' << c << '\n'; };
    auto heuristic = [&](int r, int c) { return abs(r - finish.r) + abs(c - finish.c); };
    bool found = false;

    if (algorithm == "bfs") {
        queue<Cell> frontier;
        frontier.push(start); seen[start.r][start.c] = true; emit("ADD", start.r, start.c);
        while (!frontier.empty()) {
            Cell cur = frontier.front(); frontier.pop(); emit("VISIT", cur.r, cur.c);
            if (cur.r == finish.r && cur.c == finish.c) { found = true; break; }
            for (int k=0;k<4;k++) {
                int nr=cur.r+DR[k], nc=cur.c+DC[k];
                if (inside(nr,nc) && grid[nr][nc] && !seen[nr][nc]) {
                    seen[nr][nc]=true; parent({nr,nc},cur); frontier.push({nr,nc}); emit("ADD",nr,nc);
                }
            }
        }
    } else if (algorithm == "dfs") {
        vector<Cell> frontier;
        frontier.push_back(start); seen[start.r][start.c]=true; emit("ADD",start.r,start.c);
        while (!frontier.empty()) {
            Cell cur=frontier.back(); frontier.pop_back(); emit("VISIT",cur.r,cur.c);
            if (cur.r==finish.r && cur.c==finish.c) { found=true; break; }
            // Reverse insertion order so DOWN is explored first by the LIFO stack.
            for (int k=3;k>=0;k--) {
                int nr=cur.r+DR[k], nc=cur.c+DC[k];
                if (inside(nr,nc) && grid[nr][nc] && !seen[nr][nc]) {
                    seen[nr][nc]=true; parent({nr,nc},cur); frontier.push_back({nr,nc}); emit("ADD",nr,nc);
                }
            }
        }
    } else {
        struct Node { int f, g, r, c; };
        struct Greater { bool operator()(const Node& a, const Node& b) const { if(a.f!=b.f)return a.f>b.f; return a.g>b.g; } };
        priority_queue<Node, vector<Node>, Greater> frontier;
        dist[start.r][start.c]=0; seen[start.r][start.c]=true;
        frontier.push({algorithm=="astar"?heuristic(start.r,start.c):0,0,start.r,start.c}); emit("ADD",start.r,start.c);
        while (!frontier.empty()) {
            Node node=frontier.top(); frontier.pop(); int r=node.r,c=node.c;
            if (closed[r][c] || node.g != dist[r][c]) continue;
            closed[r][c]=true; emit("VISIT",r,c);
            if(r==finish.r && c==finish.c){found=true;break;}
            for(int k=0;k<4;k++){
                int nr=r+DR[k],nc=c+DC[k];
                if(!inside(nr,nc)||!grid[nr][nc]||closed[nr][nc])continue;
                int nextG=dist[r][c]+1;
                if(nextG<dist[nr][nc]){
                    bool first=!seen[nr][nc]; seen[nr][nc]=true; dist[nr][nc]=nextG; parent({nr,nc},{r,c});
                    int h=algorithm=="astar"?heuristic(nr,nc):0;
                    frontier.push({nextG+h,nextG,nr,nc}); emit(first?"ADD":"UPDATE",nr,nc);
                }
            }
        }
    }

    if (!found) { cout << "NO_PATH\n"; return 0; }
    vector<Cell> path;
    Cell cur=finish;
    for (int guard=0; guard<=rows*cols; ++guard) {
        path.push_back(cur);
        if (cur.r==start.r && cur.c==start.c) break;
        int pr=parentR[cur.r][cur.c], pc=parentC[cur.r][cur.c];
        if (pr<0 || pc<0) { cout << "NO_PATH\n"; return 0; }
        cur={pr,pc};
    }
    reverse(path.begin(),path.end());
    cout << "PATH";
    for (const auto& p:path) cout << ' ' << p.r << ',' << p.c;
    cout << '\n';
    return 0;
}
