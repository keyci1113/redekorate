import { describe, expect, it } from "vitest";
import { TOKEN_PLACEHOLDER, guides, restBase } from "./connect";

const MCP = "https://research.example.com/mcp";
const OPENAPI = "https://research.example.com/api/v1/tools/openapi.json";
const by = (token: string | null) => Object.fromEntries(guides(MCP, OPENAPI, token).map((g) => [g.id, g]));

describe("connect guides", () => {
  it("the operations' base is where their OpenAPI document lives", () => {
    expect(restBase(OPENAPI)).toBe("https://research.example.com/api/v1/tools");
  });

  it("every guide has steps, and the commands carry this install's real addresses", () => {
    const g = by(null);
    for (const x of Object.values(g)) expect(x.steps.length).toBeGreaterThan(1);
    expect(g.claude.snippet?.text).toBe(MCP);
    expect(g.chatgpt.snippet?.text).toBe(MCP);
    expect(g.gpt.snippet?.text).toBe(OPENAPI);
    expect(g.claude_code.snippet?.text).toBe(`claude mcp add --transport http redekorate ${MCP} --header "Authorization: Bearer ${TOKEN_PLACEHOLDER}"`);
    expect(g.curl.snippet?.text).toContain("curl -X POST https://research.example.com/api/v1/tools/whoami");
  });

  it("a token just created is filled into every command that needs one, and the Cursor config stays valid JSON", () => {
    const g = by("rdk_pat_abc123");
    expect(g.claude_code.snippet?.text).toContain("Bearer rdk_pat_abc123");
    expect(g.curl.snippet?.text).toContain("Bearer rdk_pat_abc123");
    expect(JSON.parse(g.cursor.snippet!.text)).toEqual({ mcpServers: { redekorate: { url: MCP, headers: { Authorization: "Bearer rdk_pat_abc123" } } } });
    // Cursor: only the user-wide file, never a project file that may be committed
    expect(g.cursor.steps.join(" ")).not.toContain("en tu proyecto");
    // the OAuth guides never ask for a token
    for (const id of ["claude", "chatgpt"]) expect(g[id].snippet?.text).not.toContain("rdk_pat");
  });
});
