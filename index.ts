#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { runAppleScript } from 'run-applescript';
import { run } from '@jxa/run';
import { sleep } from "bun";

// Define the ChatGPT tool
const CHATGPT_TOOL: Tool = {
  name: "chatgpt",
  description: "Interact with the ChatGPT desktop app on macOS",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform: 'ask' or 'get_conversations'",
        enum: ["ask", "get_conversations"]
      },
      prompt: {
        type: "string",
        description: "The prompt to send to ChatGPT (required for ask operation)"
      },
      conversation_id: {
        type: "string",
        description: "Optional conversation ID to continue a specific conversation"
      },
      delay_ms: {
        type: "number",
        description: "Optional delay in milliseconds before sending the request (defaults to 120000 - 2 minutes)"
      }
    },
    required: ["operation"]
  }
};

const server = new Server(
  {
    name: "ChatGPT MCP Tool",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Add rate limiting tracking
let lastRequestTime = 0;
const RATE_LIMIT_DELAY = 120000; // 120 seconds (2 minutes) in milliseconds

// Function to wait for the rate limit
async function waitForRateLimit(customDelay?: number): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  const delayToUse = customDelay || RATE_LIMIT_DELAY;
  
  if (timeSinceLastRequest < delayToUse) {
    const waitTime = delayToUse - timeSinceLastRequest;
    console.error(`Waiting ${Math.ceil(waitTime / 1000)} seconds before sending request to ChatGPT...`);
    await sleep(waitTime);
  }
}

// Check if ChatGPT app is installed and running
async function checkChatGPTAccess(): Promise<boolean> {
  try {
    const isRunning = await runAppleScript(`
      tell application "System Events"
        return application process "ChatGPT" exists
      end tell
    `);

    if (isRunning !== "true") {
      console.log("ChatGPT app is not running, attempting to launch...");
      try {
        await runAppleScript(`
          tell application "ChatGPT" to activate
          delay 2
        `);
      } catch (activateError) {
        console.error("Error activating ChatGPT app:", activateError);
        throw new Error("Could not activate ChatGPT app. Please start it manually.");
      }
    }
    
    return true;
  } catch (error) {
    console.error("ChatGPT access check failed:", error);
    throw new Error(
      `Cannot access ChatGPT app. Please make sure ChatGPT is installed and properly configured. Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Function to send a prompt to ChatGPT
async function askChatGPT(prompt: string, conversationId?: string, customDelay?: number): Promise<string> {
  await checkChatGPTAccess();
  
  // Wait for rate limit with optional custom delay
  await waitForRateLimit(customDelay);
  lastRequestTime = Date.now();
  
  try {
    // This is a simplistic approach - actual implementation may need to be more sophisticated
    const result = await runAppleScript(`
      tell application "ChatGPT"
        activate
        delay 1
        
        tell application "System Events"
          tell process "ChatGPT"
            ${conversationId ? `
            -- Try to find and click the specified conversation
            try
              click button "${conversationId}" of group 1 of group 1 of window 1
              delay 1
            end try
            ` : ''}
            
            -- Type in the prompt
            keystroke "${prompt.replace(/"/g, '\\"')}"
            delay 0.5
            keystroke return
            delay 5  -- Wait for response, adjust as needed
            
            -- Try to get the response (this is approximate and may need adjustments)
            set responseText to ""
            try
              set responseText to value of text area 2 of group 1 of group 1 of window 1
            on error
              set responseText to "Could not retrieve the response from ChatGPT."
            end try
            
            return responseText
          end tell
        end tell
      end tell
    `);
    
    return result;
  } catch (error) {
    console.error("Error interacting with ChatGPT:", error);
    throw new Error(`Failed to get response from ChatGPT: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to get available conversations
async function getConversations(): Promise<string[]> {
  await checkChatGPTAccess();
  
  try {
    const result = await runAppleScript(`
      tell application "ChatGPT"
        activate
        delay 1
        
        tell application "System Events"
          tell process "ChatGPT"
            -- Try to get conversation titles
            set conversationsList to {}
            
            try
              set chatButtons to buttons of group 1 of group 1 of window 1
              repeat with chatButton in chatButtons
                set buttonName to name of chatButton
                if buttonName is not "New chat" then
                  set end of conversationsList to buttonName
                end if
              end repeat
            on error
              set conversationsList to {"Unable to retrieve conversations"}
            end try
            
            return conversationsList
          end tell
        end tell
      end tell
    `);
    
    // Parse the AppleScript result into an array
    const conversations = result.split(", ");
    return conversations;
  } catch (error) {
    console.error("Error getting ChatGPT conversations:", error);
    return ["Error retrieving conversations"];
  }
}

function isChatGPTArgs(args: unknown): args is {
  operation: "ask" | "get_conversations";
  prompt?: string;
  conversation_id?: string;
  delay_ms?: number;
} {
  if (typeof args !== "object" || args === null) return false;
  
  const { operation, prompt, conversation_id, delay_ms } = args as any;
  
  if (!operation || !["ask", "get_conversations"].includes(operation)) {
    return false;
  }
  
  // Validate required fields based on operation
  if (operation === "ask" && !prompt) return false;
  
  // Validate field types if present
  if (prompt && typeof prompt !== "string") return false;
  if (conversation_id && typeof conversation_id !== "string") return false;
  if (delay_ms !== undefined && typeof delay_ms !== "number") return false;
  
  return true;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [CHATGPT_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    if (name === "chatgpt") {
      if (!isChatGPTArgs(args)) {
        throw new Error("Invalid arguments for ChatGPT tool");
      }

      switch (args.operation) {
        case "ask": {
          if (!args.prompt) {
            throw new Error("Prompt is required for ask operation");
          }
          
          const response = await askChatGPT(
            args.prompt, 
            args.conversation_id, 
            args.delay_ms
          );
          
          return {
            content: [{ 
              type: "text", 
              text: response || "No response received from ChatGPT."
            }],
            isError: false
          };
        }

        case "get_conversations": {
          const conversations = await getConversations();
          
          return {
            content: [{ 
              type: "text", 
              text: conversations.length > 0 ? 
                `Found ${conversations.length} conversation(s):\n\n${conversations.join("\n")}` :
                "No conversations found in ChatGPT."
            }],
            isError: false
          };
        }

        default:
          throw new Error(`Unknown operation: ${args.operation}`);
      }
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("ChatGPT MCP Server running on stdio");