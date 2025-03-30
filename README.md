# Claude ChatGPT MCP Tool

A powerful Model Context Protocol (MCP) tool that enables Claude to interact with the ChatGPT desktop app on macOS, perfect for generating creative assets, ads, and visual concepts at scale.

## Features

- **AI Collaboration Pipeline**: Leverage Claude's strengths in creative thinking and ChatGPT's abilities in a single workflow
- **Scale Content Creation**: Generate ads, marketing copy, visual concepts, and creative assets efficiently
- **Smart Response Handling**: Automatically detects when ChatGPT has finished generating content
- **Reliable Input Management**: Uses clipboard-based pasting to handle complex prompts reliably
- **Configurable Rate Limiting**: Customizable delays between requests to prevent throttling
- **Conversation Management**: Continue existing ChatGPT conversations or start new ones

## Use Cases for Creative Production

### Advertising & Marketing
- Generate ad copy variations at scale
- Create marketing concepts across platforms
- Develop taglines and campaign themes
- Craft social media content calendars

### Design Concepts
- Describe visual layouts for designers
- Generate UI/UX patterns and interaction flows
- Create content briefs for graphic designers
- Develop brand voice guidelines

### Content Strategy
- Plan content hierarchies for websites
- Build editorial calendars
- Create SEO-optimized content frameworks
- Develop topic clusters for content marketing

## Installation

### Prerequisites

- macOS with M1/M2/M3 chip
- [ChatGPT desktop app](https://chatgpt.com/download) installed
- [Bun](https://bun.sh/) installed
- [Claude desktop app](https://claude.ai/desktop) installed

### Installation Steps

1. Clone this repository:

```bash
git clone https://github.com/gbrando93/claude-chatgpt-mcp.git
cd claude-chatgpt-mcp
```

2. Install dependencies:

```bash
bun install
```

3. Make sure the script is executable:

```bash
chmod +x index.ts
```

4. Update your Claude Desktop configuration:

Edit your `claude_desktop_config.json` file (located at `~/Library/Application Support/Claude/claude_desktop_config.json`) to include this tool:

```json
"chatgpt-mcp": {
  "command": "/Users/YOURUSERNAME/.bun/bin/bun",
  "args": ["run", "/path/to/claude-chatgpt-mcp/index.ts"]
}
```

Make sure to replace `YOURUSERNAME` with your actual macOS username and adjust the path to where you cloned this repository.

5. Restart Claude Desktop app

6. Grant permissions:
   - Go to System Preferences > Privacy & Security > Privacy
   - Give Terminal (or iTerm) access to Accessibility features
   - You may see permission prompts when the tool is first used

## Usage

### Basic Commands

Once installed, you can use the ChatGPT tool directly from Claude with prompts like:

- "Ask ChatGPT to create five ad concepts for our new product launch"
- "Get ChatGPT to generate social media copy variations for our holiday campaign"
- "Have ChatGPT develop a visual mood board description for our brand refresh"

### Creating at Scale

To generate creative assets at scale, use structured prompts:

```
Ask ChatGPT the following:

Please create 10 different Facebook ad headlines for a fitness app targeting working professionals, each focusing on different benefits:
1. Time efficiency
2. Stress reduction
3. Energy levels
4. Work-life balance
5. Mental clarity
6. Productivity improvement
7. Sleep quality
8. Confidence building
9. Career performance
10. Networking opportunities

Format each headline with the benefit as a subheading and provide 3 variations for each.
```

### Technical Features

#### Response Stability Detection

The tool intelligently detects when ChatGPT has finished generating content by monitoring response length stability, ensuring you always get complete responses without arbitrary timeouts.

#### Clipboard-Based Input

For reliable handling of complex prompts, the tool uses clipboard-based pasting instead of keystroke simulation, preventing truncation and ensuring accurate prompt delivery.

#### Rate Limiting

To prevent running into ChatGPT's rate limits, this tool enforces a default 2-minute (120 seconds) delay between requests. You can customize this delay when making requests:

```
// Example of using a custom delay (90 seconds)
{
  "operation": "ask",
  "prompt": "What is the meaning of life?",
  "delay_ms": 90000
}
```

The available parameters for ChatGPT requests are:

| Parameter | Type | Description |
|-----------|------|-------------|
| operation | string | Required. Either "ask" or "get_conversations" |
| prompt | string | Required for "ask" operation. The prompt to send to ChatGPT |
| conversation_id | string | Optional. ID of a specific conversation to continue |
| delay_ms | number | Optional. Custom delay in milliseconds before sending request (defaults to 120000) |

## Troubleshooting

If the tool isn't working properly:

1. Make sure ChatGPT app is installed and you're logged in
2. Verify the path to bun in your claude_desktop_config.json is correct
3. Check that you've granted all necessary permissions
4. Try restarting both Claude and ChatGPT apps

## License

MIT