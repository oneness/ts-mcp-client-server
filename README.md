## MCP client and server example
```
src
├── chat.ts   # command line chat interface to Claude completion
├── client.ts # MCP client that starts MCP server with stdio transport
├── index.ts  # Node run script to start MCP server or Chat CLI
├── llm.ts    # Uses Anthropic SDK to talk to Claude API
└── server.ts # MCP server that exposes tools and executes them
```

## Depends
```
NPM                  # install with your package manager of choice (Recommend nix)
                     # nix shell nixpkgs#nodejs
ANTHROPIC_API_KEY='' # Put your key here in .env.local file
```

## Build

```
npm run build
```

## Run MCP stdio client/server demo
```
npm run mcp
```

##  Run CLI chat with Anthropic using MCP
```
npm run chat
```

## TODO
- [x] [Blog about how MCP works as a standalone client/server and with
      LLM](https://www.birkey.co/2025-05-25-mcp-explained-with-code.html)

**NOTE:** Used Claude and Gemini web chat interface to generate some
boiler plate code.
