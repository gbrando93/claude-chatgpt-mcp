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
    // This is a more sophisticated approach with polling for response completion
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
            
            -- Use clipboard to paste the prompt (more reliable than keystroke)
            set thePrompt to "${prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
            
            -- Save original clipboard content
            set originalClipboard to the clipboard
            
            -- Set the clipboard to our prompt
            set the clipboard to thePrompt
            
            -- Make sure we're focused on the input field
            -- First click in the chat input area to ensure focus
            click text field 1 of group 1 of group 1 of window 1
            delay 0.5
            
            -- Paste the prompt
            keystroke "v" using command down
            
            -- Calculate appropriate delay based on prompt length (min 1 second)
            set promptLength to length of thePrompt
            set pasteDelay to promptLength / 1000 + 1
            delay pasteDelay
            
            -- Send the message
            keystroke return
            
            -- Restore original clipboard content
            set the clipboard to originalClipboard
            
            -- Poll until response is complete (maximum 2 minutes)
            set maxWaitTime to 120 -- Maximum wait time in seconds
            set pollInterval to 3 -- Check every 3 seconds
            set waitTime to 0
            set previousResponseLength to 0
            set stableResponseCount to 0
            set responseText to ""
            
            -- Wait a moment before starting to check for responses
            delay 2
            
            repeat until waitTime > maxWaitTime
              -- Get current response text
              try
                set currentResponseText to value of text area 2 of group 1 of group 1 of window 1
              on error
                set currentResponseText to ""
              end try
              
              -- Calculate current length
              set currentLength to length of currentResponseText
              
              -- Log for debugging
              log "Previous length: " & previousResponseLength & ", Current length: " & currentLength
              
              -- Check if the response has stabilized (not growing anymore)
              if currentLength > 0 and currentLength = previousResponseLength then
                -- Response length hasn't changed
                set stableResponseCount to stableResponseCount + 1
                
                -- If stable for 3 consecutive checks (9 seconds), consider it complete
                if stableResponseCount >= 3 then
                  set responseText to currentResponseText
                  exit repeat
                end if
              else
                -- Reset stability counter if length changed
                set stableResponseCount to 0
              end if
              
              -- Update previous length for next comparison
              set previousResponseLength to currentLength
              
              -- Wait for next check
              delay pollInterval
              set waitTime to waitTime + pollInterval
            end repeat
            
            -- If we timed out but have some response, use what we have
            if waitTime > maxWaitTime and previousResponseLength > 0 then
              try
                set responseText to value of text area 2 of group 1 of group 1 of window 1
              on error
                set responseText to "Could not retrieve the complete response from ChatGPT (timed out)."
              end try
            else if waitTime > maxWaitTime then
              set responseText to "ChatGPT took too long to respond. Please try again with a simpler question."
            end if
            
            -- Return the final response
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